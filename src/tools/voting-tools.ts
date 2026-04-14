/**
 * 投票工具
 * 
 * @module tools/voting-tools
 */

import { Type } from '@sinclair/typebox';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { jsonResult } from '../utils/json-result.js';
import { generateVotingId } from '../utils/id-generator.js';
import { loadMeeting, saveMeeting } from '../modules/meeting/storage.js';
import { DEFAULT_VOTING_WINDOWS } from '../types/common.js';
import type { Voting, VotingOption, VotingType, VotingStatus, Vote, VoteTally, VotingResult } from '../types/index.js';

// ==================== voting_create ====================

export const VotingCreateToolSchema = Type.Object({
  meeting_id: Type.String({ description: '会议ID' }),
  agenda_item_id: Type.Optional(Type.String({ description: '关联议程ID' })),
  topic: Type.String({ description: '投票主题' }),
  description: Type.Optional(Type.String({ description: '投票描述' })),
  options: Type.Array(Type.String({ description: ' voting选项文本' }), { minItems: 2 }),
  type: Type.Union([
    Type.Literal('simple'),
    Type.Literal('ranked'),
    Type.Literal('yes_no_abstain'),
  ], { description: '投票类型' }),
  window_type: Type.Union([
    Type.Literal('simple'),
    Type.Literal('moderate'),
    Type.Literal('complex'),
  ], { description: '窗口类型：simple(3分钟), moderate(5分钟), complex(10分钟)' }),
}, { additionalProperties: false });

export function createVotingCreateTool(_api: OpenClawPluginApi) {
  return {
    name: 'voting_create',
    label: 'Voting Create',
    description: '创建投票实例并设置选项与时间窗口',
    parameters: VotingCreateToolSchema,
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      try {
        const meetingId = rawParams.meeting_id as string;
        const meeting = await loadMeeting(meetingId);

        // 获取窗口时长
        const windowType = rawParams.window_type as 'simple' | 'moderate' | 'complex';
        const windowSeconds = DEFAULT_VOTING_WINDOWS[windowType];

        // 构建选项
        const optionTexts = rawParams.options as string[];
        const options: VotingOption[] = optionTexts.map((text, index) => ({
          id: `opt_${index + 1}`,
          text,
        }));

        // 计算结束时间
        const now = new Date();
        const endsAt = new Date(now.getTime() + windowSeconds * 1000);

        const voting: Voting = {
          id: generateVotingId(),
          agenda_item_id: rawParams.agenda_item_id as string | undefined,
          topic: rawParams.topic as string,
          description: rawParams.description as string | undefined,
          options,
          type: rawParams.type as VotingType,
          status: 'open' as VotingStatus,
          window_seconds: windowSeconds,
          timing: {
            started_at: now.toISOString(),
            ends_at: endsAt.toISOString(),
          },
        };

        meeting.voting_history.push(voting);
        await saveMeeting(meeting);

        return jsonResult({
          voting_id: voting.id,
          topic: voting.topic,
          options: voting.options,
          type: voting.type,
          window_seconds: windowSeconds,
          ends_at: voting.timing.ends_at,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return jsonResult({ error: true, message: `Failed to create voting: ${message}` });
      }
    },
  };
}

// ==================== voting_cast ====================

export const VotingCastToolSchema = Type.Object({
  meeting_id: Type.String({ description: '会议ID' }),
  voting_id: Type.String({ description: '投票ID' }),
  agent_id: Type.String({ description: '投票者Agent ID' }),
  option_id: Type.String({ description: '选择的选项ID' }),
  reason: Type.Optional(Type.String({ description: '投票理由' })),
}, { additionalProperties: false });

// 运行时投票存储
const votesStore = new Map<string, Vote[]>();

export function createVotingCastTool(_api: OpenClawPluginApi) {
  return {
    name: 'voting_cast',
    label: 'Voting Cast',
    description: 'Agent提交投票',
    parameters: VotingCastToolSchema,
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      try {
        const votingId = rawParams.voting_id as string;
        const agentId = rawParams.agent_id as string;
        const optionId = rawParams.option_id as string;
        const reason = rawParams.reason as string | undefined;

        const meeting = await loadMeeting(rawParams.meeting_id as string);
        const voting = meeting.voting_history.find(v => v.id === votingId);

        if (!voting) {
          return jsonResult({ error: true, message: 'Voting not found' });
        }

        if (voting.status !== 'open') {
          return jsonResult({ error: true, message: `Voting is ${voting.status}` });
        }

        // 检查是否已过期
        if (voting.timing.ends_at && new Date() > new Date(voting.timing.ends_at)) {
          return jsonResult({ error: true, message: 'Voting window has closed' });
        }

        // 验证选项
        const option = voting.options.find(o => o.id === optionId);
        if (!option) {
          return jsonResult({ error: true, message: 'Invalid option' });
        }

        // 存储投票
        if (!votesStore.has(votingId)) {
          votesStore.set(votingId, []);
        }
        const votes = votesStore.get(votingId);

        // 检查是否已投票（替换）
        const existingIndex = votes!.findIndex(v => v.agent_id === agentId);
        const vote: Vote = {
          agent_id: agentId,
          option_id: optionId,
          timestamp: new Date().toISOString(),
          reason,
        };

        if (existingIndex >= 0) {
          votes![existingIndex] = vote;
        } else {
          votes!.push(vote);
        }

        return jsonResult({
          success: true,
          voting_id: votingId,
          agent_id: agentId,
          option: option.text,
          votes_cast: votes!.length,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return jsonResult({ error: true, message: `Failed to cast vote: ${message}` });
      }
    },
  };
}

// ==================== voting_get_result ====================

export const VotingGetResultToolSchema = Type.Object({
  meeting_id: Type.String({ description: '会议ID' }),
  voting_id: Type.String({ description: '投票ID' }),
}, { additionalProperties: false });

export function createVotingGetResultTool(_api: OpenClawPluginApi) {
  return {
    name: 'voting_get_result',
    label: 'Voting Get Result',
    description: '获取投票当前结果',
    parameters: VotingGetResultToolSchema,
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      try {
        const votingId = rawParams.voting_id as string;
        const meeting = await loadMeeting(rawParams.meeting_id as string);
        const voting = meeting.voting_history.find(v => v.id === votingId);

        if (!voting) {
          return jsonResult({ error: true, message: 'Voting not found' });
        }

        const votes = votesStore.get(votingId) ?? [];
        
        // 计算统计
        const tallies: VoteTally[] = voting.options.map(opt => {
          const count = votes.filter(v => v.option_id === opt.id).length;
          return {
            option_id: opt.id,
            count,
            percentage: votes.length > 0 ? Math.round((count / votes.length) * 100) : 0,
          };
        });

        // 排序
        tallies.sort((a, b) => b.count - a.count);

        return jsonResult({
          voting: {
            id: voting.id,
            topic: voting.topic,
            type: voting.type,
            status: voting.status,
            ends_at: voting.timing.ends_at,
          },
          current_tallies: tallies,
          votes_cast: votes.length,
          total_participants: meeting.participants.length,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return jsonResult({ error: true, message: `Failed to get result: ${message}` });
      }
    },
  };
}

// ==================== voting_end ====================

export const VotingEndToolSchema = Type.Object({
  meeting_id: Type.String({ description: '会议ID' }),
  voting_id: Type.String({ description: '投票ID' }),
  force: Type.Optional(Type.Boolean({ description: '是否强制结束' })),
}, { additionalProperties: false });

export function createVotingEndTool(_api: OpenClawPluginApi) {
  return {
    name: 'voting_end',
    label: 'Voting End',
    description: '结束投票并计算结果',
    parameters: VotingEndToolSchema,
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      try {
        const votingId = rawParams.voting_id as string;
        
        const meeting = await loadMeeting(rawParams.meeting_id as string);
        const votingIndex = meeting.voting_history.findIndex(v => v.id === votingId);
        const voting = meeting.voting_history[votingIndex];

        if (!voting) {
          return jsonResult({ error: true, message: 'Voting not found' });
        }

        if (voting.status !== 'open') {
          return jsonResult({ error: true, message: `Voting already ${voting.status}` });
        }

        const votes = votesStore.get(votingId) ?? [];

        // 计算最终结果
        const tallies: VoteTally[] = voting.options.map(opt => {
          const count = votes.filter(v => v.option_id === opt.id).length;
          return {
            option_id: opt.id,
            count,
            percentage: votes.length > 0 ? Math.round((count / votes.length) * 100) : 0,
          };
        });

        tallies.sort((a, b) => b.count - a.count);

        // 判断结果
        const maxVotes = tallies[0]?.count ?? 0;
        const winners = tallies.filter(t => t.count === maxVotes);
        const isTie = winners.length > 1;
        const noConsensus = maxVotes > 0 && votes.length > 0 && maxVotes / votes.length < 0.5;

        const result: VotingResult = {
          winner_id: isTie ? undefined : tallies[0]?.option_id,
          tallies,
          is_tie: isTie,
          no_consensus: noConsensus,
          user_overridden: false,
        };

        // 更新投票状�?
        voting.status = 'closed';
        voting.timing.closed_at = new Date().toISOString();
        voting.result = result;

        meeting.voting_history[votingIndex] = voting;
        await saveMeeting(meeting);

        return jsonResult({
          voting_id: votingId,
          result: {
            winner_id: result.winner_id,
            winner_text: result.winner_id ? voting.options.find(o => o.id === result.winner_id)?.text : null,
            tallies: result.tallies.map(t => ({
              ...t,
              text: voting.options.find(o => o.id === t.option_id)?.text,
            })),
            is_tie: result.is_tie,
            no_consensus: result.no_consensus,
            votes_cast: votes.length,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return jsonResult({ error: true, message: `Failed to end voting: ${message}` });
      }
    },
  };
}

// ==================== voting_override ====================

export const VotingOverrideToolSchema = Type.Object({
  meeting_id: Type.String({ description: '会议ID' }),
  voting_id: Type.String({ description: '投票ID' }),
  decision: Type.String({ description: '用户决策（选项ID或自定义文本）' }),
}, { additionalProperties: false });

export function createVotingOverrideTool(_api: OpenClawPluginApi) {
  return {
    name: 'voting_override',
    label: 'Voting Override',
    description: '用户覆盖投票结果',
    parameters: VotingOverrideToolSchema,
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      try {
        const votingId = rawParams.voting_id as string;
        const decision = rawParams.decision as string;
        
        const meeting = await loadMeeting(rawParams.meeting_id as string);
        const voting = meeting.voting_history.find(v => v.id === votingId);

        if (!voting || !voting.result) {
          return jsonResult({ error: true, message: 'Voting not found or not ended' });
        }

        // 更新结果
        voting.result.user_overridden = true;
        voting.result.user_decision = decision;

        // 检查decision是否为选项ID
        const option = voting.options.find(o => o.id === decision);
        if (option) {
          voting.result.winner_id = decision;
        }

        await saveMeeting(meeting);

        return jsonResult({
          success: true,
          voting_id: votingId,
          user_decision: decision,
          final_decision: option?.text ?? decision,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return jsonResult({ error: true, message: `Failed to override: ${message}` });
      }
    },
  };
}
