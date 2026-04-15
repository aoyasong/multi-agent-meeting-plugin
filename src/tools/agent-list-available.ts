/**
 * 可用Agent列表查询工具
 *
 * @module tools/agent-list-available
 */

import { Type } from '@sinclair/typebox';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { jsonResult } from '../utils/json-result.js';
import { listMeetings, loadMeeting } from '../modules/meeting/storage.js';

interface AgentSnapshot {
  agent_id: string;
  name: string;
  capabilities: string[];
  status: 'online' | 'offline' | 'busy' | 'unknown';
  source: 'config' | 'history';
}

/**
 * 可用Agent查询参数Schema
 */
export const AgentListAvailableToolSchema = Type.Object({
  include_history: Type.Optional(Type.Boolean({
    description: '是否包含历史会议中出现过的Agent，默认 true',
  })),
  limit: Type.Optional(Type.Number({
    description: '历史会议扫描上限，默认 50',
    minimum: 1,
    maximum: 200,
  })),
}, {
  additionalProperties: false,
});

/**
 * 创建可用Agent列表查询工具
 */
export function createAgentListAvailableTool(api: OpenClawPluginApi) {
  return {
    name: 'agent_list_available',
    label: 'Agent List Available',
    description: '查询当前可用Agent候选（配置+历史会议）',
    parameters: AgentListAvailableToolSchema,
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      try {
        const includeHistory = rawParams.include_history !== false;
        const limit = (rawParams.limit as number) ?? 50;
        const dedup = new Map<string, AgentSnapshot>();

        const configAgents = (((api.config as Record<string, unknown>)?.agents as Record<string, unknown>)?.list ?? []) as unknown[];
        for (const item of configAgents) {
          const raw = item as Record<string, unknown>;
          const identity = (raw.identity as Record<string, unknown> | undefined) ?? {};
          const agentId = String(raw.id ?? raw.agent_id ?? identity.name ?? '').trim();
          if (!agentId) {
            continue;
          }
          const capabilities = Array.isArray(raw.capabilities)
            ? raw.capabilities.map(value => String(value))
            : [];
          dedup.set(agentId, {
            agent_id: agentId,
            name: String(identity.name ?? agentId),
            capabilities,
            status: 'unknown',
            source: 'config',
          });
        }

        if (includeHistory) {
          const { meetings } = await listMeetings({ limit, offset: 0 });
          for (const meetingIndexItem of meetings) {
            try {
              const meeting = await loadMeeting(meetingIndexItem.id);
              for (const participant of meeting.participants) {
                if (!dedup.has(participant.agent_id)) {
                  dedup.set(participant.agent_id, {
                    agent_id: participant.agent_id,
                    name: participant.agent_id,
                    capabilities: [],
                    status: 'unknown',
                    source: 'history',
                  });
                }
              }
            } catch {
              // 单个会议读取失败不影响整体可用列表
            }
          }
        }

        const agents = Array.from(dedup.values()).sort((a, b) => a.agent_id.localeCompare(b.agent_id));
        return jsonResult({
          agents,
          total: agents.length,
          source_summary: {
            config_count: agents.filter(item => item.source === 'config').length,
            history_count: agents.filter(item => item.source === 'history').length,
          },
          usage_hint: '会前请先让用户从 agents 中选择至少 2 个参与者',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return jsonResult({
          error: true,
          error_code: 'AGENT_LIST_QUERY_FAILED',
          required_action: '检查插件运行配置后重试',
          hint: '若无法自动发现Agent，请回退为让用户手动提供参会Agent列表',
          message: `Failed to list available agents: ${message}`,
        });
      }
    },
  };
}

