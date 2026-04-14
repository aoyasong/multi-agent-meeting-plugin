/**
 * 会议记录与产出类型定义
 * 
 * @module types/recording
 */

import type { MessageType } from './speaking.js';
import type { VotingResult } from './voting.js';

/**
 * 洞察标签
 */
export type InsightTag = 
  | 'risk'        // 风险
  | 'opportunity' // 机会
  | 'decision'    // 关键决策
  | 'action';     // 待办事项

/**
 * 会议笔记
 */
export interface MeetingNote {
  /** 笔记ID */
  id: string;
  /** 关联议程ID */
  agenda_item_id: string;
  /** 发言者Agent ID */
  agent_id: string;
  /** 原始内容 */
  raw_content: string;
  /** 结构化类型 */
  message_type: MessageType;
  /** 时间戳 */
  timestamp: string;
  /** 洞察标签 */
  insight_tags?: InsightTag[];
  /** 置信度 */
  confidence: number;
}

/**
 * 观点
 */
export interface Perspective {
  /** Agent ID */
  agent_id: string;
  /** 观点摘要 */
  summary: string;
  /** 立场（支持/反对/中立） */
  stance?: 'support' | 'oppose' | 'neutral';
}

/**
 * 议程摘要
 */
export interface AgendaSummary {
  /** 议程ID */
  agenda_id: string;
  /** 议题标题 */
  title: string;
  /** 讨论要点 */
  key_points: string[];
  /** 各方观点 */
  perspectives: Perspective[];
  /** 投票结果 */
  voting_result?: VotingResult;
}

/**
 * 决策
 */
export interface Decision {
  /** 决策ID */
  id: string;
  /** 决策内容 */
  content: string;
  /** 决策依据 */
  rationale: string;
  /** 投票结果 */
  voting_result?: VotingResult;
}

/**
 * 待办事项
 */
export interface ActionItem {
  /** 待办ID */
  id: string;
  /** 事项内容 */
  content: string;
  /** 负责人 */
  owner?: string;
  /** 截止时间 */
  due_date?: string;
  /** 来源Agent */
  source_agent: string;
  /** 来源发言ID */
  source_speaking_id: string;
}

/**
 * 会议纪要
 */
export interface MeetingSummary {
  /** 会议ID */
  meeting_id: string;
  /** 参会人列表 */
  participants: string[];
  /** 议程摘要列表 */
  agenda_summaries: AgendaSummary[];
  /** 关键决策 */
  key_decisions: Decision[];
  /** 待办事项 */
  action_items: ActionItem[];
  /** 生成时间 */
  generated_at: string;
}
