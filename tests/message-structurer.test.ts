import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  structureMessages, 
  matchKeywords,
  buildClassificationPrompt,
  parseClassificationResult,
} from '../src/modules/communication/message-structurer.js';
import type { MessageType } from '../src/types/index.js';

describe('Message Structurer', () => {
  describe('matchKeywords', () => {
    it('should match vote keywords', () => {
      expect(matchKeywords('我赞成这个方案')).toEqual({ type: 'vote', confidence: 0.95 });
      expect(matchKeywords('我同意你的观点')).toEqual({ type: 'vote', confidence: 0.95 });
      expect(matchKeywords('我反对这个提议')).toEqual({ type: 'vote', confidence: 0.95 });
      expect(matchKeywords('我弃权')).toEqual({ type: 'vote', confidence: 0.95 });
    });

    it('should match question keywords', () => {
      expect(matchKeywords('这个方案怎么样')).toEqual({ type: 'question', confidence: 0.8 });
      expect(matchKeywords('为什么这样做？')).toEqual({ type: 'question', confidence: 0.8 });
      expect(matchKeywords('如何解决这个问题？')).toEqual({ type: 'question', confidence: 0.8 });
    });

    it('should match action keywords', () => {
      expect(matchKeywords('这个任务待办')).toEqual({ type: 'action', confidence: 0.75 });
      expect(matchKeywords('我建议后续跟进')).toEqual({ type: 'action', confidence: 0.75 });
    });

    it('should match insight keywords for risk', () => {
      expect(matchKeywords('这里有个风险')).toEqual({ type: 'insight', confidence: 0.85 });
      expect(matchKeywords('存在隐患')).toEqual({ type: 'insight', confidence: 0.85 });
    });

    it('should match insight keywords for opportunity', () => {
      expect(matchKeywords('这是一个机会')).toEqual({ type: 'insight', confidence: 0.85 });
      expect(matchKeywords('我发现了一个创新点')).toEqual({ type: 'insight', confidence: 0.85 });
    });

    it('should return null for no match', () => {
      expect(matchKeywords('这是一个普通的陈述')).toBeNull();
      expect(matchKeywords('今天天气很好')).toBeNull();
    });

    it('should prioritize first match', () => {
      const result = matchKeywords('我赞成，但我有个问题');
      expect(result?.type).toBe('vote');
    });
  });

  describe('structureMessages', () => {
    it('should structure messages with keyword matching', async () => {
      const messages = [
        { agent_id: 'agent-1', content: '我赞成方案A', timestamp: '2026-04-08T10:00:00Z' },
        { agent_id: 'agent-2', content: '这个方案怎么实现？', timestamp: '2026-04-08T10:01:00Z' },
        { agent_id: 'agent-3', content: '这是一个普通的陈述', timestamp: '2026-04-08T10:02:00Z' },
      ];

      const result = await structureMessages(messages, '技术方案');

      expect(result.messages).toHaveLength(3);
      expect(result.messages[0]?.message_type).toBe('vote');
      expect(result.messages[0]?.confidence).toBe(0.95);
      expect(result.messages[1]?.message_type).toBe('question');
      expect(result.messages[2]?.message_type).toBe('statement');
      expect(result.llm_calls).toBe(0);
    });

    it('should use LLM classifier when provided', async () => {
      const messages = [
        { agent_id: 'agent-1', content: '普通发言内容', timestamp: '2026-04-08T10:00:00Z' },
      ];

      const mockClassifier = async () => [
        { type: 'statement' as MessageType, confidence: 0.9 },
      ];

      const result = await structureMessages(messages, '测试议题', mockClassifier);

      expect(result.messages[0]?.message_type).toBe('statement');
      expect(result.messages[0]?.confidence).toBe(0.9);
      expect(result.llm_calls).toBe(1);
    });

    it('should mark low confidence as pending confirmation', async () => {
      const messages = [
        { agent_id: 'agent-1', content: '模糊内容', timestamp: '2026-04-08T10:00:00Z' },
      ];

      const mockClassifier = async () => [
        { type: 'statement' as MessageType, confidence: 0.5 },
      ];

      const result = await structureMessages(messages, '测试议题', mockClassifier);

      expect(result.messages[0]?.pending_confirmation).toBe(true);
    });
  });

  describe('buildClassificationPrompt', () => {
    it('should build correct prompt', () => {
      const messages = [
        { agent_id: 'agent-1', content: '发言1', timestamp: 't1' },
        { agent_id: 'agent-2', content: '发言2', timestamp: 't2' },
      ];

      const prompt = buildClassificationPrompt(messages, '测试议题');

      expect(prompt).toContain('当前议题: 测试议题');
      expect(prompt).toContain('[1] agent-1: 发言1');
      expect(prompt).toContain('[2] agent-2: 发言2');
      expect(prompt).toContain('statement');
      expect(prompt).toContain('question');
      expect(prompt).toContain('vote');
    });
  });

  describe('parseClassificationResult', () => {
    it('should parse valid JSON array', () => {
      const response = '[{"index":1,"type":"statement","confidence":0.9}]';
      const result = parseClassificationResult(response);

      expect(result).toHaveLength(1);
      expect(result[0]?.type).toBe('statement');
      expect(result[0]?.confidence).toBe(0.9);
    });

    it('should handle invalid JSON', () => {
      const result = parseClassificationResult('invalid json');
      expect(result).toHaveLength(1);
      expect(result[0]?.type).toBe('statement');
      expect(result[0]?.confidence).toBe(0.5);
    });

    it('should provide defaults for missing fields', () => {
      const response = '[{"index":1}]';
      const result = parseClassificationResult(response);

      expect(result[0]?.type).toBe('statement');
      expect(result[0]?.confidence).toBe(0.5);
    });
  });
});
