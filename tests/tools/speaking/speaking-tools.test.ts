import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs/promises';

import { saveMeeting, loadMeeting } from '../../../src/modules/meeting/storage.js';
import { createMeetingFixture, createMockApi, createTestStorageDir, parseToolResult } from '../../helpers/test-helpers.js';

describe('Speaking tools', () => {
  let storageDir: string;
  let meetingId: string;
  let createSpeakingRequestTool: typeof import('../../../src/tools/speaking-tools.js').createSpeakingRequestTool;
  let createSpeakingGrantTool: typeof import('../../../src/tools/speaking-tools.js').createSpeakingGrantTool;
  let createSpeakingReleaseTool: typeof import('../../../src/tools/speaking-tools.js').createSpeakingReleaseTool;
  let createSpeakingStatusTool: typeof import('../../../src/tools/speaking-tools.js').createSpeakingStatusTool;

  beforeEach(async () => {
    vi.resetModules();

    storageDir = createTestStorageDir('meeting-speaking-test');
    process.env.MEETING_STORAGE_DIR = storageDir;
    meetingId = 'meeting_speaking_001';

    ({
      createSpeakingRequestTool,
      createSpeakingGrantTool,
      createSpeakingReleaseTool,
      createSpeakingStatusTool,
    } = await import('../../../src/tools/speaking-tools.js'));

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

  it('should sort queue by priority and expose the queue in status', async () => {
    const api = createMockApi();
    const requestTool = createSpeakingRequestTool(api);
    const statusTool = createSpeakingStatusTool(api);

    await requestTool.execute('test', { meeting_id: meetingId, agent_id: 'agent-b', priority: 1 });
    await requestTool.execute('test', { meeting_id: meetingId, agent_id: 'agent-c', priority: 9, topic: '高优先级议题' });

    const status = parseToolResult<{
      queue: Array<{ agent_id: string; priority: number; topic?: string }>;
      current_speaker: string | null;
    }>(await statusTool.execute('test', { meeting_id: meetingId }));

    expect(status.current_speaker).toBeNull();
    expect(status.queue).toHaveLength(2);
    expect(status.queue[0]?.agent_id).toBe('agent-c');
    expect(status.queue[0]?.priority).toBe(9);
    expect(status.queue[0]?.topic).toBe('高优先级议题');
  });

  it('should reject duplicate speaking requests from the same agent', async () => {
    const requestTool = createSpeakingRequestTool(createMockApi());

    await requestTool.execute('test', { meeting_id: meetingId, agent_id: 'agent-b', priority: 5 });
    const secondRequest = parseToolResult<{ error?: boolean; queue_position?: number }>(
      await requestTool.execute('test', { meeting_id: meetingId, agent_id: 'agent-b', priority: 6 })
    );

    expect(secondRequest.error).toBe(true);
    expect(secondRequest.queue_position).toBe(1);
  });

  it('should fail to grant when nobody is in the queue', async () => {
    const grantTool = createSpeakingGrantTool(createMockApi());

    const result = parseToolResult<{ error?: boolean; message?: string }>(
      await grantTool.execute('test', { meeting_id: meetingId })
    );

    expect(result.error).toBe(true);
    expect(result.message).toBe('No agent to grant speaking to');
  });

  it('should grant a specified agent and remove it from the queue', async () => {
    const api = createMockApi();
    const requestTool = createSpeakingRequestTool(api);
    const grantTool = createSpeakingGrantTool(api);
    const statusTool = createSpeakingStatusTool(api);

    await requestTool.execute('test', { meeting_id: meetingId, agent_id: 'agent-b', priority: 3 });
    await requestTool.execute('test', { meeting_id: meetingId, agent_id: 'agent-c', priority: 4 });

    const granted = parseToolResult<{ agent_id: string; queue_remaining: number }>(
      await grantTool.execute('test', { meeting_id: meetingId, agent_id: 'agent-b' })
    );
    const status = parseToolResult<{ current_speaker: string | null; queue: Array<{ agent_id: string }> }>(
      await statusTool.execute('test', { meeting_id: meetingId })
    );

    expect(granted.agent_id).toBe('agent-b');
    expect(granted.queue_remaining).toBe(1);
    expect(status.current_speaker).toBe('agent-b');
    expect(status.queue.map(item => item.agent_id)).toEqual(['agent-c']);
  });

  it('should reject release for a non-current speaker', async () => {
    const releaseTool = createSpeakingReleaseTool(createMockApi());

    const result = parseToolResult<{ error?: boolean; message?: string }>(
      await releaseTool.execute('test', { meeting_id: meetingId, agent_id: 'agent-b' })
    );

    expect(result.error).toBe(true);
    expect(result.message).toBe('Agent does not have speaking rights');
  });

  it('should increment speaking count after releasing speaking rights', async () => {
    const api = createMockApi();
    const requestTool = createSpeakingRequestTool(api);
    const grantTool = createSpeakingGrantTool(api);
    const releaseTool = createSpeakingReleaseTool(api);

    await requestTool.execute('test', { meeting_id: meetingId, agent_id: 'agent-b', priority: 5 });
    await grantTool.execute('test', { meeting_id: meetingId });

    const result = parseToolResult<{ released?: boolean; next_speaker?: string | null }>(
      await releaseTool.execute('test', { meeting_id: meetingId, agent_id: 'agent-b' })
    );
    const meeting = await loadMeeting(meetingId);
    const participant = meeting.participants.find(item => item.agent_id === 'agent-b');

    expect(result.released).toBe(true);
    expect(result.next_speaker).toBeNull();
    expect(participant?.speaking_count).toBe(1);
    expect(participant?.last_active_at).toBeDefined();
  });
});
