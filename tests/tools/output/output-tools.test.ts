import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';

import { getMeetingDir, saveMeeting } from '../../../src/modules/meeting/storage.js';
import {
  createOutputExportTool,
  createOutputGenerateActionItemsTool,
  createOutputGenerateSummaryTool,
} from '../../../src/tools/output-tools.js';
import { createMeetingFixture, createMockApi, createTestStorageDir, parseToolResult } from '../../helpers/test-helpers.js';

describe('Output tools', () => {
  let storageDir: string;
  let meetingId: string;

  beforeEach(async () => {
    storageDir = createTestStorageDir('meeting-output-test');
    process.env.MEETING_STORAGE_DIR = storageDir;
    meetingId = 'meeting_output_001';

    await saveMeeting(createMeetingFixture({
      id: meetingId,
      agenda: [
        {
          id: 'agenda_1',
          title: '架构评审',
          expected_duration: 20,
          status: 'completed',
          timing: {
            started_at: '2026-04-10T09:00:00.000Z',
            ended_at: '2026-04-10T09:20:00.000Z',
          },
        },
      ],
      notes: [
        {
          id: 'note_1',
          agenda_item_id: 'agenda_1',
          agent_id: 'host-agent',
          raw_content: '系统架构整体可行，这是一个重要结论。',
          message_type: 'statement',
          timestamp: '2026-04-10T09:05:00.000Z',
          confidence: 0.9,
        },
        {
          id: 'note_2',
          agenda_item_id: 'agenda_1',
          agent_id: 'participant-agent',
          raw_content: '后续需要补充压测方案',
          message_type: 'action',
          timestamp: '2026-04-10T09:10:00.000Z',
          confidence: 0.95,
          insight_tags: ['action'],
        },
      ],
      voting_history: [
        {
          id: 'voting_1',
          agenda_item_id: 'agenda_1',
          topic: '是否通过架构方案',
          options: [
            { id: 'opt_1', text: '通过' },
            { id: 'opt_2', text: '不通过' },
          ],
          type: 'simple',
          status: 'closed',
          window_seconds: 180,
          timing: {
            started_at: '2026-04-10T09:12:00.000Z',
            closed_at: '2026-04-10T09:15:00.000Z',
          },
          result: {
            winner_id: 'opt_1',
            tallies: [
              { option_id: 'opt_1', count: 2, percentage: 100 },
              { option_id: 'opt_2', count: 0, percentage: 0 },
            ],
            is_tie: false,
            no_consensus: false,
            user_overridden: false,
          },
        },
      ],
    }));
  });

  afterEach(async () => {
    delete process.env.MEETING_STORAGE_DIR;
    await fs.rm(storageDir, { recursive: true, force: true });
  });

  it('should generate summary file and extract decisions plus action items', async () => {
    const summaryTool = createOutputGenerateSummaryTool(createMockApi());

    const result = parseToolResult<{
      success?: boolean;
      summary: { decisions_count: number; action_items_count: number; agenda_count: number };
      saved_to: string;
    }>(await summaryTool.execute('test', { meeting_id: meetingId }));

    expect(result.success).toBe(true);
    expect(result.summary.decisions_count).toBe(1);
    expect(result.summary.action_items_count).toBe(1);
    expect(result.summary.agenda_count).toBe(1);

    const fileContent = await fs.readFile(result.saved_to, 'utf-8');
    const parsed = JSON.parse(fileContent) as {
      key_decisions: Array<{ content: string }>;
      action_items: Array<{ content: string; source_agent: string }>;
    };

    expect(parsed.key_decisions).toHaveLength(1);
    expect(parsed.key_decisions[0]?.content).toContain('是否通过架构方案: 通过');
    expect(parsed.action_items).toHaveLength(1);
    expect(parsed.action_items[0]?.content).toContain('后续需要补充压测方案');
  });

  it('should generate action items from action notes', async () => {
    const actionTool = createOutputGenerateActionItemsTool(createMockApi());

    const result = parseToolResult<{
      meeting_id: string;
      action_items: Array<{ content: string; source_agent: string }>;
      total: number;
    }>(await actionTool.execute('test', { meeting_id: meetingId }));

    expect(result.meeting_id).toBe(meetingId);
    expect(result.total).toBe(1);
    expect(result.action_items[0]?.content).toBe('后续需要补充压测方案');
    expect(result.action_items[0]?.source_agent).toBe('participant-agent');
  });

  it('should export json and markdown content to a custom target path', async () => {
    const exportTool = createOutputExportTool(createMockApi());
    const targetPath = path.join(storageDir, 'exports');

    const jsonResult = parseToolResult<{
      success?: boolean;
      format: string;
      files: Array<{ type: string; path: string }>;
    }>(
      await exportTool.execute('test', {
        meeting_id: meetingId,
        format: 'json',
        content: ['summary', 'actions'],
        target_path: targetPath,
      })
    );
    const markdownResult = parseToolResult<{
      success?: boolean;
      format: string;
      files: Array<{ type: string; path: string }>;
    }>(
      await exportTool.execute('test', {
        meeting_id: meetingId,
        format: 'markdown',
        content: ['transcript'],
        target_path: targetPath,
      })
    );

    expect(jsonResult.success).toBe(true);
    expect(jsonResult.format).toBe('json');
    expect(jsonResult.files).toHaveLength(2);
    expect(markdownResult.success).toBe(true);
    expect(markdownResult.files).toHaveLength(1);

    const summaryJsonPath = jsonResult.files.find(item => item.type === 'summary')?.path ?? '';
    const actionsJsonPath = jsonResult.files.find(item => item.type === 'actions')?.path ?? '';
    const transcriptMdPath = markdownResult.files[0]?.path ?? '';

    const summaryJson = JSON.parse(await fs.readFile(summaryJsonPath, 'utf-8')) as { theme: string; status: string };
    const actionsJson = JSON.parse(await fs.readFile(actionsJsonPath, 'utf-8')) as Array<{ raw_content: string }>;
    const transcriptMd = await fs.readFile(transcriptMdPath, 'utf-8');

    expect(summaryJson.theme).toBe('测试会议');
    expect(summaryJson.status).toBe('created');
    expect(actionsJson).toHaveLength(1);
    expect(actionsJson[0]?.raw_content).toContain('后续需要补充压测方案');
    expect(transcriptMd).toContain('# 会议记录 - 测试会议');
    expect(transcriptMd).toContain('系统架构整体可行');
    expect(transcriptMdPath.startsWith(targetPath)).toBe(true);
    expect(summaryJsonPath.startsWith(targetPath)).toBe(true);
  });

  it('should save summary under the meeting directory by default', async () => {
    const summaryTool = createOutputGenerateSummaryTool(createMockApi());
    const result = parseToolResult<{ saved_to: string }>(
      await summaryTool.execute('test', { meeting_id: meetingId })
    );

    expect(result.saved_to).toBe(path.join(getMeetingDir(meetingId), 'summary.json'));
  });
});
