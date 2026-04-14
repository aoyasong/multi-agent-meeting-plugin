/**
 * 消息结构化处理器
 * 
 * 负责将Agent原始发言转换为结构化格式
 * 支持：关键词捷径 + LLM分类
 * 
 * @module modules/communication/message-structurer
 */

import type { MessageType } from '../../types/index.js';

/**
 * 原始消息
 */
export interface RawMessage {
  agent_id: string;
  content: string;
  timestamp: string;
}

/**
 * 结构化消息
 */
export interface StructuredMessage extends RawMessage {
  message_type: MessageType;
  confidence: number;
  topic?: string;
  pending_confirmation: boolean;
}

/**
 * 结构化结果
 */
export interface StructureResult {
  messages: StructuredMessage[];
  batch_processed: boolean;
  llm_calls: number;
}

/**
 * 关键词规则
 */
interface KeywordRule {
  type: MessageType;
  keywords: string[];
  confidence: number;
}

/**
 * 关键词规则配置
 */
const KEYWORD_RULES: KeywordRule[] = [
  // 投票关键词
  {
    type: 'vote',
    keywords: ['我赞成', '我同意', '我支持', '我反对', '我弃权', '投票给', '选方案', '投'],
    confidence: 0.95,
  },
  // 问题关键词
  {
    type: 'question',
    keywords: ['？', '吗？', '呢？', '是什么', '为什么', '怎么', '如何', '是否', '能否', '可否', '请问'],
    confidence: 0.8,
  },
  // 待办关键词
  {
    type: 'action',
    keywords: ['待办', '需要', '应该', '建议', '后续', '跟进', '安排', '分配', '任务'],
    confidence: 0.75,
  },
  // 风险关键词（洞察）
  {
    type: 'insight',
    keywords: ['风险', '隐患', '问题', '注意', '风险点', '潜在问题', '可能问题'],
    confidence: 0.85,
  },
  // 机会关键词（洞察）
  {
    type: 'insight',
    keywords: ['机会', '优势', '亮点', '创新', '突破', '关键发现', '重要洞察'],
    confidence: 0.85,
  },
];

/**
 * 关键词捷径处理
 * 快速匹配明显类型，跳过LLM调用
 */
export function matchKeywords(content: string): { type: MessageType; confidence: number } | null {
  for (const rule of KEYWORD_RULES) {
    for (const keyword of rule.keywords) {
      if (content.includes(keyword)) {
        return { type: rule.type, confidence: rule.confidence };
      }
    }
  }
  return null;
}

/**
 * 批量结构化消息
 * 优先使用关键词捷径，否则调用LLM
 */
export async function structureMessages(
  messages: RawMessage[],
  currentTopic?: string,
  llmClassifier?: (messages: RawMessage[], topic?: string) => Promise<Array<{ type: MessageType; confidence: number }>>
): Promise<StructureResult> {
  const results: StructuredMessage[] = [];
  const needLLM: { index: number; message: RawMessage }[] = [];
  let llmCalls = 0;

  // 第一轮：关键词匹配
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const keywordMatch = matchKeywords(msg.content);

    if (keywordMatch) {
      // 关键词匹配成功
      results[i] = {
        ...msg,
        message_type: keywordMatch.type,
        confidence: keywordMatch.confidence,
        pending_confirmation: false,
      };
    } else {
      // 需要LLM处理
      needLLM.push({ index: i, message: msg });
    }
  }

  // 第二轮：LLM批量处理
  if (needLLM.length > 0 && llmClassifier) {
    llmCalls = 1; // 批量处理只算一次调用
    const llmResults = await llmClassifier(
      needLLM.map(n => n.message),
      currentTopic
    );

    for (let i = 0; i < needLLM.length; i++) {
      const { index, message } = needLLM[i];
      const llmResult = llmResults[i];

      if (llmResult) {
        results[index] = {
          ...message,
          message_type: llmResult.type,
          confidence: llmResult.confidence,
          pending_confirmation: llmResult.confidence < 0.7,
        };
      } else {
        // LLM未能分类，默认为陈述
        results[index] = {
          ...message,
          message_type: 'statement',
          confidence: 0.5,
          pending_confirmation: true,
        };
      }
    }
  } else if (needLLM.length > 0) {
    // 没有LLM分类器，全部默认为陈述
    for (const { index, message } of needLLM) {
      results[index] = {
        ...message,
        message_type: 'statement',
        confidence: 0.6,
        pending_confirmation: true,
      };
    }
  }

  return {
    messages: results,
    batch_processed: true,
    llm_calls: llmCalls,
  };
}

/**
 * 构建LLM分类Prompt
 */
export function buildClassificationPrompt(messages: RawMessage[], currentTopic?: string): string {
  return `分析以下Agent发言，判断每条消息的类型。

当前议题: ${currentTopic || '未知'}

消息类型定义:
- statement: 陈述观点、事实、分析
- question: 提出问题、质疑、澄清
- vote: 明确投票表达
- insight: 重要洞察、风险、机会识别
- action: 待办事项、行动建议

发言列表:
${messages.map((m, i) => `[${i + 1}] ${m.agent_id}: ${m.content}`).join('\n')}

请返回JSON数组格式，每个元素包含:
{
  "index": 消息序号(从1开始),
  "type": "message_type",
  "confidence": 0.0-1.0的置信度
}

只返回JSON数组，不要其他内容。`;
}

/**
 * 解析LLM分类结果
 */
export function parseClassificationResult(response: string): Array<{ type: MessageType; confidence: number }> {
  try {
    const parsed = JSON.parse(response);
    if (Array.isArray(parsed)) {
      return parsed.map(item => ({
        type: (item.type as MessageType) || 'statement',
        confidence: typeof item.confidence === 'number' ? item.confidence : 0.5,
      }));
    }
  } catch {
    // 解析失败
  }
  
  // 返回默认值
  return Array(1).fill({ type: 'statement' as MessageType, confidence: 0.5 });
}
