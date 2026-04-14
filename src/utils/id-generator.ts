/**
 * ID生成器
 * 
 * @module utils/id-generator
 */

let counter = 0;

/**
 * 生成唯一ID
 * 
 * @param prefix - ID前缀
 * @returns 唯一ID字符串
 * 
 * @example
 * ```ts
 * generateId('meeting') // 'meeting_abc123'
 * generateId('agenda')  // 'agenda_def456'
 * ```
 */
export function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  const seq = (counter++).toString(36).padStart(4, '0');
  return `${prefix}_${timestamp}${random}${seq}`;
}

/**
 * 生成会议ID
 */
export function generateMeetingId(): string {
  return generateId('meeting');
}

/**
 * 生成议程ID
 */
export function generateAgendaId(): string {
  return generateId('agenda');
}

/**
 * 生成投票ID
 */
export function generateVotingId(): string {
  return generateId('voting');
}

/**
 * 生成笔记ID
 */
export function generateNoteId(): string {
  return generateId('note');
}

/**
 * 生成发言ID
 */
export function generateSpeakingId(): string {
  return generateId('speak');
}
