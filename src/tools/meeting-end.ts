/**
 * 会议结束工具
 * 
 * @module tools/meeting-end
 */

import { Type } from '@sinclair/typebox';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { jsonResult } from '../utils/json-result.js';
import { loadMeeting, saveMeeting, updateMeetingIndex } from '../modules/meeting/storage.js';
import type { MeetingStatus } from '../types/index.js';

/**
 * 会议结束工具参数Schema
 */
export const MeetingEndToolSchema = Type.Object({
  meeting_id: Type.String({ 
    description: '会议ID' 
  }),
  generate_summary: Type.Optional(Type.Boolean({ 
    description: '是否生成纪要，默认true' 
  })),
}, { 
  additionalProperties: false 
});

/**
 * 可结束的状态列表
 */
const ENDABLE_STATUSES: MeetingStatus[] = ['started', 'in_progress', 'paused'];

/**
 * 创建会议结束工具
 */
export function createMeetingEndTool(_api: OpenClawPluginApi) {
  return {
    name: 'meeting_end',
    label: 'Meeting End',
    description: '结束会议并计算实际时长，可选是否触发纪要提示',
    parameters: MeetingEndToolSchema,
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      try {
        const meetingId = rawParams.meeting_id as string;
        const generateSummary = rawParams.generate_summary !== false; // 默认true
        
        // 加载会议
        const meeting = await loadMeeting(meetingId);
        
        // 状态校验
        if (!ENDABLE_STATUSES.includes(meeting.status)) {
          return jsonResult({
            error: true,
            message: `Cannot end meeting with status: ${meeting.status}`,
            meeting_id: meetingId,
            current_status: meeting.status,
          });
        }
        
        // 计算实际时长
        const now = new Date();
        const startTime = meeting.timing.started_at ? new Date(meeting.timing.started_at) : now;
        const actualDuration = Math.round((now.getTime() - startTime.getTime()) / 60000);
        
        // 结束所有未完成的议程
        for (const item of meeting.agenda) {
          if (item.status === 'in_progress' || item.status === 'voting') {
            item.status = 'completed';
            item.timing.ended_at = now.toISOString();
            if (!item.timing.started_at) {
              item.timing.started_at = now.toISOString();
            }
          }
        }
        
        // 更新会议状态
        meeting.status = 'ended';
        meeting.timing.ended_at = now.toISOString();
        meeting.timing.actual_duration = actualDuration;
        
        // 持久化
        await saveMeeting(meeting);
        await updateMeetingIndex(meetingId, meeting);
        
        // 构建返回结果
        const result: Record<string, unknown> = {
          meeting_id: meeting.id,
          status: 'ended',
          ended_at: meeting.timing.ended_at,
          actual_duration: actualDuration,
          expected_duration: meeting.timing.expected_duration,
          agenda_completed: meeting.agenda.filter(a => a.status === 'completed').length,
          agenda_total: meeting.agenda.length,
          notes_count: meeting.notes.length,
          voting_count: meeting.voting_history.length,
        };
        
        // 如果需要生成纪要（当前仅返回提示）
        if (generateSummary) {
          result.summary = {
            message: '纪要请通过 output_generate_summary 工具生成',
            available: false,
          };
        }
        
        return jsonResult(result);
        
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return jsonResult({
          error: true,
          message: `Failed to end meeting: ${message}`,
        });
      }
    },
  };
}
