/**
 * 任务类型定义
 *
 * @module types/task
 */

/**
 * 任务状态
 */
export type TaskStatus =
  | 'pending'      // 等待分配
  | 'assigned'     // 已分配，待执行
  | 'in_progress'  // 执行中
  | 'completed'    // 已完成
  | 'failed';      // 执行失败

/**
 * 输出格式
 */
export type OutputFormat = 'markdown' | 'json' | 'text' | 'structured';

/**
 * 任务结果
 */
export interface TaskResult {
  /** 执行该任务的Agent ID */
  agent_id: string;
  /** 执行结果的Agent session key */
  session_key: string;
  /** Agent返回的内容 */
  content: string;
  /** 原始回复（包含完整对话） */
  raw_response?: string;
  /** 结果时间戳 */
  timestamp: string;
  /** 执行是否成功 */
  success: boolean;
  /** 错误信息（如有） */
  error?: string;
}

/**
 * 会议任务
 */
export interface MeetingTask {
  /** 任务唯一标识 */
  id: string;
  /** 关联的会议ID */
  meeting_id: string;
  /** 关联的议程项ID（可选） */
  agenda_item_id?: string;
  /** 分配给哪个Agent */
  assignee_agent_id: string;
  /** 任务标题 */
  title: string;
  /** 任务描述（markdown格式） */
  description: string;
  /** 期望输出格式 */
  output_format?: OutputFormat;
  /** 任务状态 */
  status: TaskStatus;
  /** 任务结果 */
  result?: TaskResult;
  /** 创建时间 */
  created_at: string;
  /** 最后更新时间 */
  updated_at: string;
  /** 完成时间 */
  completed_at?: string;
  /** 优先级（数值越大优先级越高） */
  priority: number;
  /** 超时时间（秒） */
  timeout_seconds?: number;
  /**
   * @deprecated 使用 result 替代
   */
  completed_content?: string;
}

/**
 * 任务统计
 */
export interface TaskStatistics {
  total: number;
  pending: number;
  assigned: number;
  in_progress: number;
  completed: number;
  failed: number;
}