/**
 * 任务管理工具
 *
 * @module tools/task-tools
 */

import { Type } from '@sinclair/typebox';
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { jsonResult } from '../utils/json-result.js';
import { generateId } from '../utils/id-generator.js';
import { loadMeeting, saveMeeting } from '../modules/meeting/storage.js';
import type { MeetingTask, TaskStatus, OutputFormat, TaskStatistics } from '../types/index.js';

// ==================== meeting_assign_task ====================

/**
 * 任务分配工具参数Schema
 */
export const MeetingAssignTaskToolSchema = Type.Object({
  meeting_id: Type.String({ description: '会议ID' }),
  agenda_item_id: Type.Optional(Type.String({ description: '议程项ID（可选）' })),
  assignee_agent_id: Type.String({ description: '分配给哪个Agent的ID' }),
  title: Type.String({ description: '任务标题' }),
  description: Type.String({ description: '任务描述（markdown格式）' }),
  output_format: Type.Optional(Type.Union([
    Type.Literal('markdown'),
    Type.Literal('json'),
    Type.Literal('text'),
    Type.Literal('structured'),
  ], { description: '期望输出格式' })),
  priority: Type.Optional(Type.Number({ description: '优先级（1-10，数值越大优先级越高）', minimum: 1, maximum: 10 })),
  timeout_seconds: Type.Optional(Type.Number({ description: '超时时间（秒）', minimum: 30, maximum: 3600 })),
}, { additionalProperties: false });

/**
 * 创建任务分配工具
 */
export function createMeetingAssignTaskTool(_api: OpenClawPluginApi) {
  return {
    name: 'meeting_assign_task',
    label: 'Meeting Assign Task',
    description: '主Agent分配任务给其他Agent执行',
    parameters: MeetingAssignTaskToolSchema,
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      try {
        const meetingId = rawParams.meeting_id as string;
        const meeting = await loadMeeting(meetingId);

        // 验证会议状态
        if (meeting.status !== 'in_progress' && meeting.status !== 'started') {
          return jsonResult({
            error: true,
            message: `Cannot assign task to meeting with status: ${meeting.status}`,
            meeting_id: meetingId,
          });
        }

        // 验证被分配的Agent是否在会议中
        const assigneeAgentId = rawParams.assignee_agent_id as string;
        const participant = meeting.participants.find(p => p.agent_id === assigneeAgentId);
        if (!participant) {
          return jsonResult({
            error: true,
            message: `Agent ${assigneeAgentId} is not a participant in this meeting`,
            meeting_id: meetingId,
          });
        }

        // 验证不是主Agent自己
        if (assigneeAgentId === meeting.host_agent) {
          return jsonResult({
            error: true,
            message: 'Cannot assign task to the host agent',
          });
        }

        const now = new Date().toISOString();
        const taskId = generateId('task');

        // 创建任务
        const task: MeetingTask = {
          id: taskId,
          meeting_id: meetingId,
          agenda_item_id: rawParams.agenda_item_id as string | undefined,
          assignee_agent_id: assigneeAgentId,
          title: rawParams.title as string,
          description: rawParams.description as string,
          output_format: rawParams.output_format as OutputFormat || 'markdown',
          status: 'assigned' as TaskStatus,
          priority: (rawParams.priority as number) || 5,
          timeout_seconds: rawParams.timeout_seconds as number | undefined,
          created_at: now,
          updated_at: now,
        };

        // 初始化 tasks 数组（如果不存在）
        if (!meeting.tasks) {
          meeting.tasks = [];
        }

        meeting.tasks.push(task);
        await saveMeeting(meeting);

        return jsonResult({
          task_id: taskId,
          meeting_id: meetingId,
          agenda_item_id: task.agenda_item_id,
          assignee_agent_id: task.assignee_agent_id,
          title: task.title,
          status: task.status,
          priority: task.priority,
          timeout_seconds: task.timeout_seconds,
          created_at: task.created_at,
        });

      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return jsonResult({ error: true, message: `Failed to assign task: ${message}` });
      }
    },
  };
}

// ==================== meeting_record_task_result ====================

/**
 * 任务结果记录工具参数Schema
 */
export const MeetingRecordTaskResultToolSchema = Type.Object({
  meeting_id: Type.String({ description: '会议ID' }),
  task_id: Type.String({ description: '任务ID' }),
  agent_id: Type.String({ description: '执行任务的Agent ID' }),
  session_key: Type.String({ description: 'Agent的session key' }),
  content: Type.String({ description: '任务执行结果内容' }),
  raw_response: Type.Optional(Type.String({ description: '原始回复内容（可选）' })),
  success: Type.Optional(Type.Boolean({ description: '是否成功', default: true })),
  error: Type.Optional(Type.String({ description: '错误信息（如果失败）' })),
}, { additionalProperties: false });

/**
 * 创建任务结果记录工具
 */
export function createMeetingRecordTaskResultTool(_api: OpenClawPluginApi) {
  return {
    name: 'meeting_record_task_result',
    label: 'Meeting Record Task Result',
    description: '主Agent记录其他Agent的任务执行结果',
    parameters: MeetingRecordTaskResultToolSchema,
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      try {
        const meetingId = rawParams.meeting_id as string;
        const meeting = await loadMeeting(meetingId);

        const taskId = rawParams.task_id as string;
        const task = meeting.tasks?.find(t => t.id === taskId);

        if (!task) {
          return jsonResult({
            error: true,
            message: `Task not found: ${taskId}`,
            meeting_id: meetingId,
          });
        }

        const success = rawParams.success !== false;

        // 更新任务状态和结果
        task.status = success ? 'completed' : 'failed';
        task.result = {
          agent_id: rawParams.agent_id as string,
          session_key: rawParams.session_key as string,
          content: rawParams.content as string,
          raw_response: rawParams.raw_response as string | undefined,
          timestamp: new Date().toISOString(),
          success,
          error: rawParams.error as string | undefined,
        };
        task.updated_at = new Date().toISOString();

        if (success) {
          task.completed_at = task.result.timestamp;
        }

        await saveMeeting(meeting);

        return jsonResult({
          task_id: taskId,
          status: task.status,
          success: task.result.success,
          completed_at: task.completed_at,
          content_length: task.result.content.length,
        });

      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return jsonResult({ error: true, message: `Failed to record task result: ${message}` });
      }
    },
  };
}

// ==================== meeting_get_task ====================

/**
 * 获取任务详情工具参数Schema
 */
export const MeetingGetTaskToolSchema = Type.Object({
  meeting_id: Type.String({ description: '会议ID' }),
  task_id: Type.String({ description: '任务ID' }),
  include_result: Type.Optional(Type.Boolean({ description: '是否包含任务结果', default: true })),
}, { additionalProperties: false });

/**
 * 创建获取任务详情工具
 */
export function createMeetingGetTaskTool(_api: OpenClawPluginApi) {
  return {
    name: 'meeting_get_task',
    label: 'Meeting Get Task',
    description: '获取指定任务的详情和状态',
    parameters: MeetingGetTaskToolSchema,
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      try {
        const meetingId = rawParams.meeting_id as string;
        const meeting = await loadMeeting(meetingId);

        if (!meeting.tasks || meeting.tasks.length === 0) {
          return jsonResult({
            error: true,
            message: 'No tasks found in this meeting',
            meeting_id: meetingId,
          });
        }

        const taskId = rawParams.task_id as string;
        const task = meeting.tasks.find(t => t.id === taskId);

        if (!task) {
          return jsonResult({
            error: true,
            message: `Task not found: ${taskId}`,
            meeting_id: meetingId,
          });
        }

        const includeResult = rawParams.include_result !== false;

        // 构建返回数据
        const result: Record<string, unknown> = {
          id: task.id,
          meeting_id: task.meeting_id,
          agenda_item_id: task.agenda_item_id,
          assignee_agent_id: task.assignee_agent_id,
          title: task.title,
          description: task.description,
          output_format: task.output_format,
          status: task.status,
          priority: task.priority,
          timeout_seconds: task.timeout_seconds,
          created_at: task.created_at,
          updated_at: task.updated_at,
          completed_at: task.completed_at,
        };

        if (includeResult && task.result) {
          result.result = {
            agent_id: task.result.agent_id,
            content: task.result.content,
            timestamp: task.result.timestamp,
            success: task.result.success,
            error: task.result.error,
          };
        }

        return jsonResult(result);

      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return jsonResult({ error: true, message: `Failed to get task: ${message}` });
      }
    },
  };
}

// ==================== meeting_list_tasks ====================

/**
 * 列出任务工具参数Schema
 */
export const MeetingListTasksToolSchema = Type.Object({
  meeting_id: Type.String({ description: '会议ID' }),
  agenda_item_id: Type.Optional(Type.String({ description: '议程项ID过滤（可选）' })),
  assignee_agent_id: Type.Optional(Type.String({ description: 'Agent ID过滤（可选）' })),
  status: Type.Optional(Type.Union([
    Type.Literal('pending'),
    Type.Literal('assigned'),
    Type.Literal('in_progress'),
    Type.Literal('completed'),
    Type.Literal('failed'),
  ], { description: '状态过滤' })),
  include_results: Type.Optional(Type.Boolean({ description: '是否包含任务结果', default: false })),
}, { additionalProperties: false });

/**
 * 创建列出任务工具
 */
export function createMeetingListTasksTool(_api: OpenClawPluginApi) {
  return {
    name: 'meeting_list_tasks',
    label: 'Meeting List Tasks',
    description: '列出会议中的任务，可按议程、Agent或状态过滤',
    parameters: MeetingListTasksToolSchema,
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      try {
        const meetingId = rawParams.meeting_id as string;
        const meeting = await loadMeeting(meetingId);

        if (!meeting.tasks || meeting.tasks.length === 0) {
          return jsonResult({
            meeting_id: meetingId,
            tasks: [],
            statistics: {
              total: 0,
              pending: 0,
              assigned: 0,
              in_progress: 0,
              completed: 0,
              failed: 0,
            },
          });
        }

        // 应用过滤
        let tasks = [...meeting.tasks];

        if (rawParams.agenda_item_id) {
          tasks = tasks.filter(t => t.agenda_item_id === rawParams.agenda_item_id);
        }

        if (rawParams.assignee_agent_id) {
          tasks = tasks.filter(t => t.assignee_agent_id === rawParams.assignee_agent_id);
        }

        if (rawParams.status) {
          tasks = tasks.filter(t => t.status === rawParams.status);
        }

        // 计算统计
        const statistics: TaskStatistics = {
          total: meeting.tasks.length,
          pending: meeting.tasks.filter(t => t.status === 'pending').length,
          assigned: meeting.tasks.filter(t => t.status === 'assigned').length,
          in_progress: meeting.tasks.filter(t => t.status === 'in_progress').length,
          completed: meeting.tasks.filter(t => t.status === 'completed').length,
          failed: meeting.tasks.filter(t => t.status === 'failed').length,
        };

        // 是否包含结果
        const includeResults = rawParams.include_results === true;

        // 映射任务数据
        const tasksData = tasks.map(t => {
          const item: Record<string, unknown> = {
            id: t.id,
            agenda_item_id: t.agenda_item_id,
            assignee_agent_id: t.assignee_agent_id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            created_at: t.created_at,
            updated_at: t.updated_at,
            completed_at: t.completed_at,
          };

          if (includeResults && t.result) {
            (item as Record<string, unknown>).result = {
              content: t.result.content.substring(0, 500), // 限制长度
              success: t.result.success,
              timestamp: t.result.timestamp,
            };
          }

          return item;
        });

        return jsonResult({
          meeting_id: meetingId,
          tasks: tasksData,
          total: tasks.length,
          statistics,
        });

      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return jsonResult({ error: true, message: `Failed to list tasks: ${message}` });
      }
    },
  };
}

// ==================== meeting_update_task_status ====================

/**
 * 更新任务状态工具参数Schema
 */
export const MeetingUpdateTaskStatusToolSchema = Type.Object({
  meeting_id: Type.String({ description: '会议ID' }),
  task_id: Type.String({ description: '任务ID' }),
  status: Type.Union([
    Type.Literal('pending'),
    Type.Literal('assigned'),
    Type.Literal('in_progress'),
    Type.Literal('completed'),
    Type.Literal('failed'),
  ], { description: '新状态' }),
}, { additionalProperties: false });

/**
 * 创建更新任务状态工具
 * 用于主Agent手动更新任务状态（如标记为进行中）
 */
export function createMeetingUpdateTaskStatusTool(_api: OpenClawPluginApi) {
  return {
    name: 'meeting_update_task_status',
    label: 'Meeting Update Task Status',
    description: '更新任务状态（主Agent手动操作）',
    parameters: MeetingUpdateTaskStatusToolSchema,
    execute: async (_toolCallId: string, rawParams: Record<string, unknown>) => {
      try {
        const meetingId = rawParams.meeting_id as string;
        const meeting = await loadMeeting(meetingId);

        const taskId = rawParams.task_id as string;
        const newStatus = rawParams.status as TaskStatus;
        const task = meeting.tasks?.find(t => t.id === taskId);

        if (!task) {
          return jsonResult({
            error: true,
            message: `Task not found: ${taskId}`,
            meeting_id: meetingId,
          });
        }

        const oldStatus = task.status;
        task.status = newStatus;
        task.updated_at = new Date().toISOString();

        if (newStatus === 'completed' || newStatus === 'failed') {
          task.completed_at = task.updated_at;
        }

        await saveMeeting(meeting);

        return jsonResult({
          task_id: taskId,
          old_status: oldStatus,
          new_status: newStatus,
          updated_at: task.updated_at,
        });

      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return jsonResult({ error: true, message: `Failed to update task status: ${message}` });
      }
    },
  };
}