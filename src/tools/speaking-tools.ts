/**
 * 发言协调工具
 * 
 * @module tools/speaking-tools
 */

import { Type } from '@sinclair/typebox';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { jsonResult } from '../utils/json-result.js';
import { loadMeeting, saveMeeting } from '../modules/meeting/storage.js';
import type { SpeakingQueueItem } from '../types/index.js';

// 会议发言状态（运行时）
const speakingState = new Map<string, {
  currentSpeaker?: string;
  queue: SpeakingQueueItem[];
  grantedAt?: string;
}>();

// ==================== speaking_request ====================

export const SpeakingRequestToolSchema = Type.Object({
  meeting_id: Type.String({ description: '会议ID' }),
  agent_id: Type.String({ description: '请求发言的Agent ID' }),
  topic: Type.Optional(Type.String({ description: '发言主题' })),
  priority: Type.Optional(Type.Number({ description: '优先级', minimum: 0, maximum: 10 })),
}, { additionalProperties: false });

export function createSpeakingRequestTool(_api: OpenClawPluginApi) {
  return {
    name: 'speaking_request',
    label: 'Speaking Request',
    description: 'Agent请求发言权并加入发言队列',
    parameters: SpeakingRequestToolSchema,
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      try {
        const meetingId = rawParams.meeting_id as string;
        const agentId = rawParams.agent_id as string;
        const topic = rawParams.topic as string | undefined;
        const priority = (rawParams.priority as number) ?? 5;

        // 获取或创建发言状态
        let state = speakingState.get(meetingId);
        if (!state) {
          state = { queue: [] };
          speakingState.set(meetingId, state);
        }

        // 检查是否已在队列中
        const existingIndex = state.queue.findIndex(q => q.agent_id === agentId);
        if (existingIndex >= 0) {
          return jsonResult({
            error: true,
            message: 'Agent already in queue',
            queue_position: existingIndex + 1,
          });
        }

        // 添加到队列
        const queueItem: SpeakingQueueItem = {
          agent_id: agentId,
          requested_at: new Date().toISOString(),
          priority,
          topic,
        };
        state.queue.push(queueItem);

        // 按优先级排序
        state.queue.sort((a, b) => b.priority - a.priority);

        const position = state.queue.findIndex(q => q.agent_id === agentId) + 1;
        const estimatedWait = position * 30; // 预估每条发言30秒

        return jsonResult({
          queue_position: position,
          estimated_wait_seconds: estimatedWait,
          current_speaker: state.currentSpeaker ?? null,
          queue_length: state.queue.length,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return jsonResult({ error: true, message: `Failed to request speaking: ${message}` });
      }
    },
  };
}

// ==================== speaking_grant ====================

export const SpeakingGrantToolSchema = Type.Object({
  meeting_id: Type.String({ description: '会议ID' }),
  agent_id: Type.Optional(Type.String({ description: '指定授予的Agent ID，不指定则按队列顺序' })),
}, { additionalProperties: false });

export function createSpeakingGrantTool(_api: OpenClawPluginApi) {
  return {
    name: 'speaking_grant',
    label: 'Speaking Grant',
    description: '授予发言权给下一个Agent或指定Agent',
    parameters: SpeakingGrantToolSchema,
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      try {
        const meetingId = rawParams.meeting_id as string;
        const specifiedAgentId = rawParams.agent_id as string | undefined;

        let state = speakingState.get(meetingId);
        if (!state) {
          state = { queue: [] };
          speakingState.set(meetingId, state);
        }

        // 确定授予对象
        let targetAgentId: string | undefined;
        if (specifiedAgentId) {
          targetAgentId = specifiedAgentId;
          // 从队列中移除
          state.queue = state.queue.filter(q => q.agent_id !== specifiedAgentId);
        } else if (state.queue.length > 0) {
          const nextItem = state.queue.shift();
          targetAgentId = nextItem?.agent_id;
        }

        if (!targetAgentId) {
          return jsonResult({
            error: true,
            message: 'No agent to grant speaking to',
          });
        }

        // 授予发言
        state.currentSpeaker = targetAgentId;
        state.grantedAt = new Date().toISOString();

        return jsonResult({
          agent_id: targetAgentId,
          granted_at: state.grantedAt,
          queue_remaining: state.queue.length,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return jsonResult({ error: true, message: `Failed to grant speaking: ${message}` });
      }
    },
  };
}

// ==================== speaking_release ====================

export const SpeakingReleaseToolSchema = Type.Object({
  meeting_id: Type.String({ description: '会议ID' }),
  agent_id: Type.String({ description: '释放发言权的Agent ID' }),
}, { additionalProperties: false });

export function createSpeakingReleaseTool(_api: OpenClawPluginApi) {
  return {
    name: 'speaking_release',
    label: 'Speaking Release',
    description: 'Agent释放发言权并返回队列状态',
    parameters: SpeakingReleaseToolSchema,
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      try {
        const meetingId = rawParams.meeting_id as string;
        const agentId = rawParams.agent_id as string;

        const state = speakingState.get(meetingId);
        if (!state || state.currentSpeaker !== agentId) {
          return jsonResult({
            error: true,
            message: 'Agent does not have speaking rights',
          });
        }

        // 释放发言权
        state.currentSpeaker = undefined;
        state.grantedAt = undefined;

        // 更新会议参与者发言计数
        const meeting = await loadMeeting(meetingId);
        const participant = meeting.participants.find(p => p.agent_id === agentId);
        if (participant) {
          participant.speaking_count++;
          participant.last_active_at = new Date().toISOString();
          await saveMeeting(meeting);
        }

        return jsonResult({
          released: true,
          agent_id: agentId,
          next_speaker: state.queue[0]?.agent_id ?? null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return jsonResult({ error: true, message: `Failed to release speaking: ${message}` });
      }
    },
  };
}

// ==================== speaking_status ====================

export const SpeakingStatusToolSchema = Type.Object({
  meeting_id: Type.String({ description: '会议ID' }),
}, { additionalProperties: false });

export function createSpeakingStatusTool(_api: OpenClawPluginApi) {
  return {
    name: 'speaking_status',
    label: 'Speaking Status',
    description: '查看当前发言状态和队列',
    parameters: SpeakingStatusToolSchema,
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      try {
        const meetingId = rawParams.meeting_id as string;
        const state = speakingState.get(meetingId);

        if (!state) {
          return jsonResult({
            current_speaker: null,
            queue: [],
            granted_at: null,
          });
        }

        return jsonResult({
          current_speaker: state.currentSpeaker ?? null,
          queue: state.queue.map(q => ({
            agent_id: q.agent_id,
            priority: q.priority,
            topic: q.topic,
            requested_at: q.requested_at,
          })),
          granted_at: state.grantedAt ?? null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return jsonResult({ error: true, message: `Failed to get status: ${message}` });
      }
    },
  };
}
