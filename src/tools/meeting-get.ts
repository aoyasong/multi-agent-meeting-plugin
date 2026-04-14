/**
 * 会议详情查询工具
 * 
 * @module tools/meeting-get
 */

import { Type } from '@sinclair/typebox';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { jsonResult } from '../utils/json-result.js';
import { loadMeeting } from '../modules/meeting/storage.js';

/**
 * 会议详情查询工具参数Schema
 */
export const MeetingGetToolSchema = Type.Object({
  meeting_id: Type.String({ 
    description: '会议ID' 
  }),
}, { 
  additionalProperties: false 
});

/**
 * 创建会议详情查询工具
 */
export function createMeetingGetTool(_api: OpenClawPluginApi) {
  return {
    name: 'meeting_get',
    label: 'Meeting Get',
    description: '获取会议详情，包含状态、议程和参与者信息',
    parameters: MeetingGetToolSchema,
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      try {
        const meetingId = rawParams.meeting_id as string;
        
        // 加载会议
        const meeting = await loadMeeting(meetingId);
        
        // 返回完整会议信息（简化版）
        return jsonResult({
          id: meeting.id,
          theme: meeting.theme,
          purpose: meeting.purpose,
          type: meeting.type,
          status: meeting.status,
          host_agent: meeting.host_agent,
          current_agenda_index: meeting.current_agenda_index,
          timing: meeting.timing,
          participants: meeting.participants.map(p => ({
            agent_id: p.agent_id,
            role: p.role,
            status: p.status,
            speaking_count: p.speaking_count,
          })),
          agenda: meeting.agenda.map(a => ({
            id: a.id,
            title: a.title,
            status: a.status,
            expected_duration: a.expected_duration,
          })),
          config: {
            poll_interval_ms: meeting.config.poll_interval_ms,
            agent_timeout_ms: meeting.config.agent_timeout_ms,
          },
          statistics: {
            notes_count: meeting.notes.length,
            voting_count: meeting.voting_history.length,
            agenda_completed: meeting.agenda.filter(a => a.status === 'completed').length,
            agenda_total: meeting.agenda.length,
          },
        });
        
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return jsonResult({
          error: true,
          message: `Failed to get meeting: ${message}`,
        });
      }
    },
  };
}
