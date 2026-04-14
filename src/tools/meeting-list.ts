/**
 * 会议列表查询工具
 * 
 * @module tools/meeting-list
 */

import { Type } from '@sinclair/typebox';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { jsonResult } from '../utils/json-result.js';
import { listMeetings } from '../modules/meeting/storage.js';
import type { MeetingStatus } from '../types/index.js';

/**
 * 会议列表查询工具参数Schema
 */
export const MeetingListToolSchema = Type.Object({
  status: Type.Optional(Type.Union([
    Type.Literal('created'),
    Type.Literal('started'),
    Type.Literal('in_progress'),
    Type.Literal('paused'),
    Type.Literal('takeover'),
    Type.Literal('ended'),
  ], {
    description: '按状态过滤'
  })),
  offset: Type.Optional(Type.Number({ 
    description: '分页偏移，默认0',
    minimum: 0,
  })),
  limit: Type.Optional(Type.Number({ 
    description: '分页大小，默认20',
    minimum: 1,
    maximum: 100,
  })),
}, { 
  additionalProperties: false 
});

/**
 * 创建会议列表查询工具
 */
export function createMeetingListTool(_api: OpenClawPluginApi) {
  return {
    name: 'meeting_list',
    label: 'Meeting List',
    description: '列出会议，支持按状态过滤和分页',
    parameters: MeetingListToolSchema,
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      try {
        const status = rawParams.status as MeetingStatus | undefined;
        const offset = (rawParams.offset as number) ?? 0;
        const limit = (rawParams.limit as number) ?? 20;
        
        // 查询会议列表
        const { meetings, total } = await listMeetings({
          status,
          offset,
          limit,
        });
        
        return jsonResult({
          meetings: meetings.map(m => ({
            id: m.id,
            theme: m.theme,
            type: m.type,
            status: m.status,
            created_at: m.created_at,
            started_at: m.started_at,
            ended_at: m.ended_at,
          })),
          pagination: {
            offset,
            limit,
            total,
            has_more: offset + limit < total,
          },
        });
        
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return jsonResult({
          error: true,
          message: `Failed to list meetings: ${message}`,
        });
      }
    },
  };
}
