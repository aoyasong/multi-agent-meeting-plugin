/**
 * 会议启动前校验工具
 *
 * @module tools/meeting-start-readiness
 */

import { Type } from '@sinclair/typebox';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { jsonResult } from '../utils/json-result.js';
import { loadMeeting } from '../modules/meeting/storage.js';

/**
 * 启动前校验工具参数Schema
 */
export const MeetingStartReadinessToolSchema = Type.Object({
  meeting_id: Type.String({
    description: '会议ID',
  }),
}, {
  additionalProperties: false,
});

/**
 * 创建会议启动前校验工具
 */
export function createMeetingStartReadinessTool(_api: OpenClawPluginApi) {
  return {
    name: 'meeting_start_readiness',
    label: 'Meeting Start Readiness',
    description: '检查会议是否满足启动条件（议程、确认状态、参与者等）',
    parameters: MeetingStartReadinessToolSchema,
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      try {
        const meetingId = rawParams.meeting_id as string;
        const meeting = await loadMeeting(meetingId);

        const checks = [
          {
            check: 'meeting_status_created',
            passed: meeting.status === 'created',
            expected: 'created',
            actual: meeting.status,
            required_action: '将会议恢复到 created 状态，或重新创建会议',
          },
          {
            check: 'participants_count_min_2',
            passed: meeting.participants.length >= 2,
            expected: '>=2',
            actual: String(meeting.participants.length),
            required_action: '补充参会 Agent 至至少 2 个',
          },
          {
            check: 'agenda_not_empty',
            passed: meeting.agenda.length > 0,
            expected: '>0',
            actual: String(meeting.agenda.length),
            required_action: '先调用 agenda_add_item 添加议程',
          },
          {
            check: 'agenda_confirmed',
            passed: Boolean(meeting.metadata.agenda_confirmed),
            expected: 'true',
            actual: String(Boolean(meeting.metadata.agenda_confirmed)),
            required_action: '调用 agenda_confirm 并确认返回 agenda_confirmed=true',
          },
        ];

        const blockers = checks
          .filter(item => !item.passed)
          .map(item => ({
            check: item.check,
            expected: item.expected,
            actual: item.actual,
            required_action: item.required_action,
          }));

        return jsonResult({
          meeting_id: meetingId,
          can_start: blockers.length === 0,
          checks,
          blockers,
          agenda_confirmed_at: meeting.metadata.agenda_confirmed_at ?? null,
          next_step: blockers.length === 0 ? 'meeting_start' : 'resolve_blockers',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return jsonResult({
          error: true,
          error_code: 'READINESS_CHECK_FAILED',
          required_action: '检查 meeting_id 是否正确后重试',
          hint: '可先通过 meeting_list 查询有效会议ID',
          message: `Failed to check meeting readiness: ${message}`,
        });
      }
    },
  };
}

