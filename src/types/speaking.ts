/**
 * 发言类型定义
 * 
 * @module types/speaking
 */

/**
 * 消息类型
 */
export type MessageType = 
  | 'statement'  // 陈述观点/事实/分析
  | 'question'   // 提出问题/质疑
  | 'vote'       // 明确投票表达
  | 'insight'    // 重要洞察/风险/机会
  | 'action';    // 待办事项/行动建议

/**
 * 发言记录
 */
export interface SpeakingRecord {
  /** 发言ID */
  id: string;
  /** 发言者Agent ID */
  agent_id: string;
  /** 关联议程ID */
  agenda_item_id: string;
  /** 发言内容 */
  content: string;
  /** 时间戳 */
  timestamp: string;
  /** 发言类型（结构化后） */
  type: MessageType;
  /** 置信度 */
  confidence?: number;
  /** 是否被标记为待确认 */
  pending_confirmation: boolean;
}

/**
 * 发言队列项
 */
export interface SpeakingQueueItem {
  /** Agent ID */
  agent_id: string;
  /** 请求时间 */
  requested_at: string;
  /** 优先级（数值越大优先级越高） */
  priority: number;
  /** 发言主题 */
  topic?: string;
}
