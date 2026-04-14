/**
 * 议程管理工具
 * 
 * @module tools/agenda-tools
 */

import { Type } from '@sinclair/typebox';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { jsonResult } from '../utils/json-result.js';
import { generateAgendaId } from '../utils/id-generator.js';
import { loadMeeting, saveMeeting } from '../modules/meeting/storage.js';
import type { AgendaItem, AgendaItemStatus } from '../types/index.js';

// ==================== agenda_add_item ====================

export const AgendaAddItemToolSchema = Type.Object({
  meeting_id: Type.String({ description: '会议ID' }),
  title: Type.String({ description: '议题标题' }),
  description: Type.Optional(Type.String({ description: '议题描述' })),
  expected_duration: Type.Number({ description: '预计时长（分钟）', minimum: 1 }),
  time_limit: Type.Optional(Type.Number({ description: '时间限制（分钟）' })),
  materials: Type.Optional(Type.Array(Type.String(), { description: '关联材料' })),
  owner: Type.Optional(Type.String({ description: '负责人Agent ID' })),
}, { additionalProperties: false });

export function createAgendaAddItemTool(_api: OpenClawPluginApi) {
  return {
    name: 'agenda_add_item',
    label: 'Agenda Add Item',
    description: '添加议程项到会议',
    parameters: AgendaAddItemToolSchema,
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      try {
        const meetingId = rawParams.meeting_id as string;
        const meeting = await loadMeeting(meetingId);
        
        const newItem: AgendaItem = {
          id: generateAgendaId(),
          title: rawParams.title as string,
          expected_duration: rawParams.expected_duration as number,
          status: 'pending' as AgendaItemStatus,
          timing: {},
        };
        
        if (rawParams.description) newItem.description = rawParams.description as string;
        if (rawParams.time_limit) newItem.time_limit = rawParams.time_limit as number;
        if (rawParams.materials) newItem.materials = rawParams.materials as string[];
        if (rawParams.owner) newItem.owner = rawParams.owner as string;
        
        meeting.agenda.push(newItem);
        await saveMeeting(meeting);
        
        return jsonResult({
          agenda_item_id: newItem.id,
          index: meeting.agenda.length - 1,
          title: newItem.title,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return jsonResult({ error: true, message: `Failed to add agenda item: ${message}` });
      }
    },
  };
}

// ==================== agenda_list_items ====================

export const AgendaListItemsToolSchema = Type.Object({
  meeting_id: Type.String({ description: '会议ID' }),
}, { additionalProperties: false });

export function createAgendaListItemsTool(_api: OpenClawPluginApi) {
  return {
    name: 'agenda_list_items',
    label: 'Agenda List Items',
    description: '列出会议的所有议程项',
    parameters: AgendaListItemsToolSchema,
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      try {
        const meeting = await loadMeeting(rawParams.meeting_id as string);
        
        return jsonResult({
          agenda_items: meeting.agenda.map(item => ({
            id: item.id,
            title: item.title,
            description: item.description,
            expected_duration: item.expected_duration,
            status: item.status,
            owner: item.owner,
            started_at: item.timing.started_at,
            ended_at: item.timing.ended_at,
          })),
          current_index: meeting.current_agenda_index,
        });
        
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return jsonResult({ error: true, message: `Failed to list agenda: ${message}` });
      }
    },
  };
}

// ==================== agenda_next_item ====================

export const AgendaNextItemToolSchema = Type.Object({
  meeting_id: Type.String({ description: '会议ID' }),
}, { additionalProperties: false });

export function createAgendaNextItemTool(_api: OpenClawPluginApi) {
  return {
    name: 'agenda_next_item',
    label: 'Agenda Next Item',
    description: '切换到下一议程项并自动完成当前议程',
    parameters: AgendaNextItemToolSchema,
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      try {
        const meetingId = rawParams.meeting_id as string;
        const meeting = await loadMeeting(meetingId);
        
        const currentIndex = meeting.current_agenda_index;
        const currentItem = meeting.agenda[currentIndex];
        const nextIndex = currentIndex + 1;
        const nextItem = meeting.agenda[nextIndex];
        
        if (!nextItem) {
          return jsonResult({
            error: true,
            message: '已经是最后一个议程项',
            current_index: currentIndex,
            is_last: true,
          });
        }
        
        // 完成当前议程
        if (currentItem) {
          currentItem.status = 'completed';
          currentItem.timing.ended_at = new Date().toISOString();
        }
        
        // 激活下一议程
        nextItem.status = 'in_progress';
        nextItem.timing.started_at = new Date().toISOString();
        meeting.current_agenda_index = nextIndex;
        
        await saveMeeting(meeting);
        
        return jsonResult({
          previous_item: currentItem ? {
            id: currentItem.id,
            title: currentItem.title,
            status: 'completed',
          } : null,
          current_item: {
            id: nextItem.id,
            title: nextItem.title,
            status: 'in_progress',
          },
          is_last: nextIndex === meeting.agenda.length - 1,
          progress: `${nextIndex + 1}/${meeting.agenda.length}`,
        });
        
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return jsonResult({ error: true, message: `Failed to switch agenda: ${message}` });
      }
    },
  };
}
