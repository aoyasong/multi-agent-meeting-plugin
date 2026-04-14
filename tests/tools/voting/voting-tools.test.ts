import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs/promises';

import { loadMeeting, saveMeeting } from '../../../src/modules/meeting/storage.js';
import { createMeetingFixture, createMockApi, createTestStorageDir, parseToolResult } from '../../helpers/test-helpers.js';

describe('Voting tools', () => {
  let storageDir: string;
  let meetingId: string;
  let createVotingCreateTool: typeof import('../../../src/tools/voting-tools.js').createVotingCreateTool;
  let createVotingCastTool: typeof import('../../../src/tools/voting-tools.js').createVotingCastTool;
  let createVotingGetResultTool: typeof import('../../../src/tools/voting-tools.js').createVotingGetResultTool;
  let createVotingEndTool: typeof import('../../../src/tools/voting-tools.js').createVotingEndTool;
  let createVotingOverrideTool: typeof import('../../../src/tools/voting-tools.js').createVotingOverrideTool;

  beforeEach(async () => {
    vi.resetModules();

    storageDir = createTestStorageDir('meeting-voting-test');
    process.env.MEETING_STORAGE_DIR = storageDir;
    meetingId = 'meeting_voting_001';

    ({
      createVotingCreateTool,
      createVotingCastTool,
      createVotingGetResultTool,
      createVotingEndTool,
      createVotingOverrideTool,
    } = await import('../../../src/tools/voting-tools.js'));

    await saveMeeting(createMeetingFixture({
      id: meetingId,
      participants: [
        { agent_id: 'agent-a', role: 'host', status: 'joined', speaking_count: 0 },
        { agent_id: 'agent-b', role: 'participant', status: 'joined', speaking_count: 0 },
        { agent_id: 'agent-c', role: 'participant', status: 'joined', speaking_count: 0 },
      ],
    }));
  });

  afterEach(async () => {
    delete process.env.MEETING_STORAGE_DIR;
    await fs.rm(storageDir, { recursive: true, force: true });
  });

  /**
   * 创建一个测试投票，并返回投票 ID。
   */
  async function createVoting(options?: string[]): Promise<string> {
    const createTool = createVotingCreateTool(createMockApi());
    const result = parseToolResult<{
      voting_id: string;
      options: Array<{ id: string; text: string }>;
      window_seconds: number;
    }>(
      await createTool.execute('test', {
        meeting_id: meetingId,
        topic: '是否通过方案',
        options: options ?? ['通过', '不通过', '延期'],
        type: 'simple',
        window_type: 'simple',
      })
    );

    return result.voting_id;
  }

  it('should create voting with generated option ids and configured window', async () => {
    const createTool = createVotingCreateTool(createMockApi());

    const result = parseToolResult<{
      voting_id: string;
      options: Array<{ id: string; text: string }>;
      window_seconds: number;
    }>(
      await createTool.execute('test', {
        meeting_id: meetingId,
        topic: '是否通过方案',
        options: ['通过', '不通过'],
        type: 'simple',
        window_type: 'simple',
      })
    );

    expect(result.voting_id).toMatch(/^voting_/);
    expect(result.options.map(item => item.id)).toEqual(['opt_1', 'opt_2']);
    expect(result.window_seconds).toBe(180);
  });

  it('should reject invalid options when casting a vote', async () => {
    const votingId = await createVoting();
    const castTool = createVotingCastTool(createMockApi());

    const result = parseToolResult<{ error?: boolean; message?: string }>(
      await castTool.execute('test', {
        meeting_id: meetingId,
        voting_id: votingId,
        agent_id: 'agent-a',
        option_id: 'opt_999',
      })
    );

    expect(result.error).toBe(true);
    expect(result.message).toBe('Invalid option');
  });

  it('should overwrite duplicate votes from the same agent', async () => {
    const votingId = await createVoting();
    const api = createMockApi();
    const castTool = createVotingCastTool(api);
    const resultTool = createVotingGetResultTool(api);

    await castTool.execute('test', {
      meeting_id: meetingId,
      voting_id: votingId,
      agent_id: 'agent-a',
      option_id: 'opt_1',
    });
    await castTool.execute('test', {
      meeting_id: meetingId,
      voting_id: votingId,
      agent_id: 'agent-a',
      option_id: 'opt_2',
    });

    const result = parseToolResult<{
      votes_cast: number;
      current_tallies: Array<{ option_id: string; count: number }>;
    }>(await resultTool.execute('test', { meeting_id: meetingId, voting_id: votingId }));

    expect(result.votes_cast).toBe(1);
    expect(result.current_tallies.find(item => item.option_id === 'opt_1')?.count).toBe(0);
    expect(result.current_tallies.find(item => item.option_id === 'opt_2')?.count).toBe(1);
  });

  it('should reject votes after the voting has been closed', async () => {
    const votingId = await createVoting(['通过', '不通过']);
    const api = createMockApi();
    const castTool = createVotingCastTool(api);
    const endTool = createVotingEndTool(api);

    await castTool.execute('test', {
      meeting_id: meetingId,
      voting_id: votingId,
      agent_id: 'agent-a',
      option_id: 'opt_1',
    });
    await endTool.execute('test', {
      meeting_id: meetingId,
      voting_id: votingId,
    });

    const result = parseToolResult<{ error?: boolean; message?: string }>(
      await castTool.execute('test', {
        meeting_id: meetingId,
        voting_id: votingId,
        agent_id: 'agent-b',
        option_id: 'opt_2',
      })
    );

    expect(result.error).toBe(true);
    expect(result.message).toBe('Voting is closed');
  });

  it('should mark tie and no consensus when votes are evenly split', async () => {
    const votingId = await createVoting(['方案A', '方案B', '方案C']);
    const api = createMockApi();
    const castTool = createVotingCastTool(api);
    const endTool = createVotingEndTool(api);

    await castTool.execute('test', { meeting_id: meetingId, voting_id: votingId, agent_id: 'agent-a', option_id: 'opt_1' });
    await castTool.execute('test', { meeting_id: meetingId, voting_id: votingId, agent_id: 'agent-b', option_id: 'opt_2' });
    await castTool.execute('test', { meeting_id: meetingId, voting_id: votingId, agent_id: 'agent-c', option_id: 'opt_3' });

    const result = parseToolResult<{
      result: { is_tie: boolean; no_consensus: boolean; winner_id: string | null; votes_cast: number };
    }>(
      await endTool.execute('test', {
        meeting_id: meetingId,
        voting_id: votingId,
      })
    );

    expect(result.result.is_tie).toBe(true);
    expect(result.result.no_consensus).toBe(true);
    expect(result.result.winner_id).toBeUndefined();
    expect(result.result.votes_cast).toBe(3);
  });

  it('should allow user override with a concrete option id after voting ends', async () => {
    const votingId = await createVoting(['通过', '不通过']);
    const api = createMockApi();
    const castTool = createVotingCastTool(api);
    const endTool = createVotingEndTool(api);
    const overrideTool = createVotingOverrideTool(api);

    await castTool.execute('test', { meeting_id: meetingId, voting_id: votingId, agent_id: 'agent-a', option_id: 'opt_1' });
    await castTool.execute('test', { meeting_id: meetingId, voting_id: votingId, agent_id: 'agent-b', option_id: 'opt_1' });
    await endTool.execute('test', { meeting_id: meetingId, voting_id: votingId });

    const result = parseToolResult<{ success?: boolean; final_decision?: string }>(
      await overrideTool.execute('test', {
        meeting_id: meetingId,
        voting_id: votingId,
        decision: 'opt_2',
      })
    );
    const meeting = await loadMeeting(meetingId);
    const voting = meeting.voting_history.find(item => item.id === votingId);

    expect(result.success).toBe(true);
    expect(result.final_decision).toBe('不通过');
    expect(voting?.result?.user_overridden).toBe(true);
    expect(voting?.result?.user_decision).toBe('opt_2');
    expect(voting?.result?.winner_id).toBe('opt_2');
  });
});
