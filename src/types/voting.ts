/**
 * 投票类型定义
 * 
 * @module types/voting
 */

/**
 * 投票类型
 */
export type VotingType = 
  | 'simple'          // 简单多数
  | 'ranked'          // 排序投票
  | 'yes_no_abstain'; // 赞成/反对/弃权

/**
 * 投票状态
 */
export type VotingStatus = 
  | 'created'   // 已创建
  | 'open'      // 进行中
  | 'closed';   // 已关闭

/**
 * 投票选项
 */
export interface VotingOption {
  /** 选项ID */
  id: string;
  /** 选项文本 */
  text: string;
  /** 选项描述 */
  description?: string;
}

/**
 * 投票时间信息
 */
export interface VotingTiming {
  /** 开始时间 */
  started_at?: string;
  /** 结束时间 */
  ends_at?: string;  // 计划结束时间
  /** 实际结束时间 */
  closed_at?: string;
}

/**
 * 投票统计
 */
export interface VoteTally {
  /** 选项ID */
  option_id: string;
  /** 得票数 */
  count: number;
  /** 百分比 */
  percentage: number;
}

/**
 * 投票结果
 */
export interface VotingResult {
  /** 获胜选项ID */
  winner_id?: string;
  /** 各选项得票情况 */
  tallies: VoteTally[];
  /** 是否平局 */
  is_tie: boolean;
  /** 是否无共识（最高票<50%） */
  no_consensus: boolean;
  /** 用户是否override */
  user_overridden: boolean;
  /** 用户最终决策 */
  user_decision?: string;
}

/**
 * 单次投票记录
 */
export interface Vote {
  /** 投票者Agent ID */
  agent_id: string;
  /** 投票的选项ID */
  option_id: string;
  /** 投票时间 */
  timestamp: string;
  /** 投票理由 */
  reason?: string;
}

/**
 * 投票实例
 */
export interface Voting {
  /** 投票ID */
  id: string;
  /** 关联议程ID */
  agenda_item_id?: string;
  /** 投票主题 */
  topic: string;
  /** 投票描述 */
  description?: string;
  /** 投票选项 */
  options: VotingOption[];
  /** 投票类型 */
  type: VotingType;
  /** 投票状态 */
  status: VotingStatus;
  /** 时间窗口（秒） */
  window_seconds: number;
  /** 时间信息 */
  timing: VotingTiming;
  /** 投票结果 */
  result?: VotingResult;
  /** 投票记录（持久化） */
  votes?: Vote[];
}
