import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs/promises';

import { loadMeeting, saveMeeting } from '../../../src/modules/meeting/storage.js';
import {
  createRecordingGetTranscriptTool,
  createRecordingTagInsightTool,
  createRecordingTakeNoteTool,
} from '../../../src/tools/recording-tools.js';
import { createMeetingFixture, createMockApi, createTestStorageDir, parseToolResult } from '../../helpers/test-helpers.js';

describe('Recording tools', () => {
  let storageDir: string;
  let meetingId: string;

  beforeEach(async () => {
    storageDir = createTestStorageDir('meeting-recording-test');
    process.env.MEETING_STORAGE_DIR = storageDir;
    meetingId = 'meeting_recording_001';

    await saveMeeting(createMeetingFixture({
      id: meetingId,
      agenda: [
        {
          id: 'agenda_1',
          title: '议程一',
          expected_duration: 10,
          status: 'in_progress',
          timing: {},
        },
        {
          id: 'agenda_2',
          title: '议程二',
          expected_duration: 10,
          status: 'pending',
          timing: {},
        },
      ],
    }));
  });

  afterEach(async () => {
    delete process.env.MEETING_STORAGE_DIR;
    await fs.rm(storageDir, { recursive: true, force: true });
  });

  it('should take a note and persist it into meeting notes', async () => {
    const takeNoteTool = createRecordingTakeNoteTool(createMockApi());

    const result = parseToolResult<{ note_id: string; message_type: string; total_notes: number }>(
      await takeNoteTool.execute('test', {
        meeting_id: meetingId,
        record: {
          agent_id: 'host-agent',
          agenda_item_id: 'agenda_1',
          raw_content: '记录一条讨论内容',
          timestamp: '2026-04-10T09:30:00.000Z',
        },
      })
    );

    expect(result.note_id).toMatch(/^note_/);
    expect(result.message_type).toBe('statement');
    expect(result.total_notes).toBe(1);

    const meeting = await loadMeeting(meetingId);
    expect(meeting.notes).toHaveLength(1);
    expect(meeting.notes[0]?.raw_content).toBe('记录一条讨论内容');
  });

  it('should reject tagging a note that does not exist', async () => {
    const tagTool = createRecordingTagInsightTool(createMockApi());

    const result = parseToolResult<{ error?: boolean; message?: string }>(
      await tagTool.execute('test', {
        meeting_id: meetingId,
        note_id: 'note_missing',
        tags: ['risk'],
      })
    );

    expect(result.error).toBe(true);
    expect(result.message).toBe('Note not found');
  });

  it('should tag note insights and filter transcript by agenda item', async () => {
    const api = createMockApi();
    const takeNoteTool = createRecordingTakeNoteTool(api);
    const tagTool = createRecordingTagInsightTool(api);
    const transcriptTool = createRecordingGetTranscriptTool(api);

    const note1 = parseToolResult<{ note_id: string }>(
      await takeNoteTool.execute('test', {
        meeting_id: meetingId,
        record: {
          agent_id: 'host-agent',
          agenda_item_id: 'agenda_1',
          raw_content: '这是议程一记录',
          timestamp: '2026-04-10T09:31:00.000Z',
        },
      })
    );
    await takeNoteTool.execute('test', {
      meeting_id: meetingId,
      record: {
        agent_id: 'participant-agent',
        agenda_item_id: 'agenda_2',
        raw_content: '这是议程二记录',
        timestamp: '2026-04-10T09:32:00.000Z',
      },
    });

    const tagged = parseToolResult<{ success?: boolean; tags?: string[] }>(
      await tagTool.execute('test', {
        meeting_id: meetingId,
        note_id: note1.note_id,
        tags: ['risk', 'action'],
      })
    );
    const transcript = parseToolResult<{
      total_notes: number;
      notes: Array<{ id: string; agenda_item_id: string; insight_tags?: string[]; raw_content: string }>;
    }>(
      await transcriptTool.execute('test', {
        meeting_id: meetingId,
        agenda_item_id: 'agenda_1',
      })
    );

    expect(tagged.success).toBe(true);
    expect(tagged.tags).toEqual(['risk', 'action']);
    expect(transcript.total_notes).toBe(1);
    expect(transcript.notes[0]?.id).toBe(note1.note_id);
    expect(transcript.notes[0]?.agenda_item_id).toBe('agenda_1');
    expect(transcript.notes[0]?.insight_tags).toEqual(['risk', 'action']);
    expect(transcript.notes[0]?.raw_content).toBe('这是议程一记录');
  });
});
