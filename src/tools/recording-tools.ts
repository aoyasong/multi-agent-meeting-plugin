/**
 * 会议记录工具
 * 
 * @module tools/recording-tools
 */

import { Type } from '@sinclair/typebox';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { jsonResult } from '../utils/json-result.js';
import { generateNoteId } from '../utils/id-generator.js';
import { loadMeeting, saveMeeting } from '../modules/meeting/storage.js';
import type { MeetingNote, InsightTag, MessageType } from '../types/index.js';

// ==================== recording_take_note ====================

export const RecordingTakeNoteToolSchema = Type.Object({
  meeting_id: Type.String({ description: '会议ID' }),
  record: Type.Object({
    agent_id: Type.String({ description: '发言Agent ID' }),
    agenda_item_id: Type.String({ description: '关联议程ID' }),
    raw_content: Type.String({ description: '原始发言内容' }),
    timestamp: Type.String({ description: '时间戳' }),
  }),
}, { additionalProperties: false });

export function createRecordingTakeNoteTool(_api: OpenClawPluginApi) {
  return {
    name: 'recording_take_note',
    label: 'Recording Take Note',
    description: '记录会议发言笔记',
    parameters: RecordingTakeNoteToolSchema,
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      try {
        const meetingId = rawParams.meeting_id as string;
        const record = rawParams.record as {
          agent_id: string;
          agenda_item_id: string;
          raw_content: string;
          timestamp: string;
        };

        const meeting = await loadMeeting(meetingId);

        // 创建笔记（消息类型默认为statement，后续可通过结构化处理更新）
        const note: MeetingNote = {
          id: generateNoteId(),
          agenda_item_id: record.agenda_item_id,
          agent_id: record.agent_id,
          raw_content: record.raw_content,
          message_type: 'statement' as MessageType,
          timestamp: record.timestamp,
          confidence: 0.5,
        };

        meeting.notes.push(note);
        await saveMeeting(meeting);

        return jsonResult({
          note_id: note.id,
          message_type: note.message_type,
          confidence: note.confidence,
          total_notes: meeting.notes.length,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return jsonResult({ error: true, message: `Failed to take note: ${message}` });
      }
    },
  };
}

// ==================== recording_tag_insight ====================

export const RecordingTagInsightToolSchema = Type.Object({
  meeting_id: Type.String({ description: '会议ID' }),
  note_id: Type.String({ description: '笔记ID' }),
  tags: Type.Array(Type.Union([
    Type.Literal('risk'),
    Type.Literal('opportunity'),
    Type.Literal('decision'),
    Type.Literal('action'),
  ]), { description: '洞察标签' }),
}, { additionalProperties: false });

export function createRecordingTagInsightTool(_api: OpenClawPluginApi) {
  return {
    name: 'recording_tag_insight',
    label: 'Recording Tag Insight',
    description: '为笔记标记洞察标签（风险/机会/决策/行动）',
    parameters: RecordingTagInsightToolSchema,
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      try {
        const meetingId = rawParams.meeting_id as string;
        const noteId = rawParams.note_id as string;
        const tags = rawParams.tags as InsightTag[];

        const meeting = await loadMeeting(meetingId);
        const note = meeting.notes.find(n => n.id === noteId);

        if (!note) {
          return jsonResult({ error: true, message: 'Note not found' });
        }

        note.insight_tags = tags;
        await saveMeeting(meeting);

        return jsonResult({
          success: true,
          note_id: noteId,
          tags: note.insight_tags,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return jsonResult({ error: true, message: `Failed to tag insight: ${message}` });
      }
    },
  };
}

// ==================== recording_get_transcript ====================

export const RecordingGetTranscriptToolSchema = Type.Object({
  meeting_id: Type.String({ description: '会议ID' }),
  agenda_item_id: Type.Optional(Type.String({ description: '议程ID过滤' })),
}, { additionalProperties: false });

export function createRecordingGetTranscriptTool(_api: OpenClawPluginApi) {
  return {
    name: 'recording_get_transcript',
    label: 'Recording Get Transcript',
    description: '获取会议完整记录或指定议程记录',
    parameters: RecordingGetTranscriptToolSchema,
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      try {
        const meetingId = rawParams.meeting_id as string;
        const agendaItemId = rawParams.agenda_item_id as string | undefined;

        const meeting = await loadMeeting(meetingId);

        let notes = meeting.notes;
        if (agendaItemId) {
          notes = notes.filter(n => n.agenda_item_id === agendaItemId);
        }

        return jsonResult({
          meeting_id: meetingId,
          total_notes: notes.length,
          notes: notes.map(n => ({
            id: n.id,
            agent_id: n.agent_id,
            agenda_item_id: n.agenda_item_id,
            message_type: n.message_type,
            raw_content: n.raw_content,
            timestamp: n.timestamp,
            insight_tags: n.insight_tags,
          })),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return jsonResult({ error: true, message: `Failed to get transcript: ${message}` });
      }
    },
  };
}
