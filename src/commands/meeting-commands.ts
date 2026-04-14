/**
 * 自定义命令定义
 *
 * @module commands/meeting-commands
 */

import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { loadMeeting, listMeetings } from '../modules/meeting/storage.js';

/**
 * 自定义命令定义（简化版，不依赖 SDK 内部类型）
 */
interface MeetingCommand {
  name: string;
  description: string;
  acceptsArgs?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (ctx: any) => Promise<{ text: string }>;
}

/**
 * 创建会议相关自定义命令
 */
export function createMeetingCommands(_api: OpenClawPluginApi): MeetingCommand[] {
  return [
    // ==================== /meeting-status ====================
    {
      name: 'meeting-status',
      description: '查询会议状态，可指定会议ID',
      acceptsArgs: true,
      handler: async (ctx) => {
        try {
          // 解析参数
          let meetingId: string | undefined;
          if (ctx.args) {
            const args = ctx.args.trim().split(/\s+/);
            for (const arg of args) {
              if (arg.startsWith('meeting_')) {
                meetingId = arg;
                break;
              }
              // 支持直接传ID
              if (arg.length > 5) {
                meetingId = arg;
                break;
              }
            }
          }

          if (!meetingId) {
            // 没有提供会议ID，尝试获取当前活跃会议（取最近一个）
            const { meetings } = await listMeetings({ status: 'in_progress', limit: 1 });
            if (meetings.length > 0) {
              meetingId = meetings[0].id;
            } else {
              // 返回最近一个会议
              const { meetings: allMeetings } = await listMeetings({ limit: 1 });
              if (allMeetings.length > 0) {
                meetingId = allMeetings[0].id;
              }
            }
          }

          if (!meetingId) {
            return {
              text: '没有找到任何会议',
            };
          }

          const meeting = await loadMeeting(meetingId);

          // 构建状态信息
          const statusLines = [
            `📋 **会议状态**`,
            ``,
            `主题: ${meeting.theme}`,
            `目的: ${meeting.purpose}`,
            `类型: ${meeting.type}`,
            `状态: ${meeting.status}`,
            ``,
            `**议程进度**: ${meeting.current_agenda_index + 1}/${meeting.agenda.length}`,
            `**参与者**: ${meeting.participants.length}人`,
            `**投票次数**: ${meeting.voting_history.length}`,
            `**任务数**: ${meeting.tasks?.length || 0}`,
          ];

          // 如果有正在进行的投票
          const activeVoting = meeting.voting_history.find(v => v.status === 'open');
          if (activeVoting) {
            statusLines.push('');
            statusLines.push(`⚠️ **进行中的投票**: ${activeVoting.topic}`);
            statusLines.push(`   结束时间: ${activeVoting.timing.ends_at}`);
          }

          return {
            text: statusLines.join('\n'),
          };

        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          return {
            text: `❌ 查询失败: ${message}`,
          };
        }
      },
    },

    // ==================== /meeting-list ====================
    {
      name: 'meeting-list',
      description: '列出所有会议',
      acceptsArgs: true,
      handler: async (ctx) => {
        try {
          let status: string | undefined;
          let limit = 10;

          // 解析参数
          if (ctx.args) {
            const args = ctx.args.trim().toLowerCase();
            if (args.includes('active') || args.includes('进行中')) {
              status = 'in_progress';
            } else if (args.includes('ended') || args.includes('已结束')) {
              status = 'ended';
            }

            // 提取数字
            const numMatch = args.match(/(\d+)/);
            if (numMatch) {
              limit = Math.min(Math.max(parseInt(numMatch[1]), 1), 50);
            }
          }

          const result = await listMeetings({ status, limit });

          if (result.meetings.length === 0) {
            return {
              text: status ? `没有找到${status}的会议` : '没有找到任何会议',
            };
          }

          const lines = [
            `📋 **会议列表** (${result.total}个)`,
            '',
          ];

          for (const m of result.meetings) {
            const statusEmoji = m.status === 'in_progress' ? '🟢' :
                               m.status === 'ended' ? '🔴' : '🟡';
            lines.push(`${statusEmoji} \`${m.id}\``);
            lines.push(`   主题: ${m.theme}`);
            lines.push(`   类型: ${m.type}`);
            if (m.started_at) {
              lines.push(`   开始: ${new Date(m.started_at).toLocaleString()}`);
            }
            lines.push('');
          }

          return {
            text: lines.join('\n'),
          };

        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          return {
            text: `❌ 查询失败: ${message}`,
          };
        }
      },
    },

    // ==================== /meeting-active ====================
    {
      name: 'meeting-active',
      description: '列出正在进行中的会议',
      acceptsArgs: false,
      handler: async () => {
        try {
          const result = await listMeetings({ status: 'in_progress', limit: 10 });

          if (result.meetings.length === 0) {
            return {
              text: '🟢 没有正在进行的会议',
            };
          }

          const lines = [
            `🟢 **进行中的会议** (${result.meetings.length}个)`,
            '',
          ];

          for (const m of result.meetings) {
            lines.push(`📋 \`${m.id}\``);
            lines.push(`   主题: ${m.theme}`);
            lines.push(`   类型: ${m.type}`);
            if (m.started_at) {
              const startTime = new Date(m.started_at);
              const duration = Math.round((Date.now() - startTime.getTime()) / 60000);
              lines.push(`   进行: ${duration}分钟`);
            }
            lines.push('');
          }

          return {
            text: lines.join('\n'),
          };

        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          return {
            text: `❌ 查询失败: ${message}`,
          };
        }
      },
    },

    // ==================== /meeting-tasks ====================
    {
      name: 'meeting-tasks',
      description: '查看会议任务进度',
      acceptsArgs: true,
      handler: async (ctx) => {
        try {
          let meetingId: string | undefined;

          // 提取会议ID
          if (ctx.args) {
            const args = ctx.args.trim().split(/\s+/);
            for (const arg of args) {
              if (arg.startsWith('meeting_') || (arg.length > 5 && !isNaN(parseInt(arg)))) {
                meetingId = arg;
                break;
              }
            }
          }

          if (!meetingId) {
            // 尝试获取当前活跃会议
            const { meetings } = await listMeetings({ status: 'in_progress', limit: 1 });
            if (meetings.length > 0) {
              meetingId = meetings[0].id;
            }
          }

          if (!meetingId) {
            return {
              text: '请指定会议ID，例如: /meeting-tasks meeting_xxx',
            };
          }

          const meeting = await loadMeeting(meetingId);
          const tasks = meeting.tasks || [];

          if (tasks.length === 0) {
            return {
              text: `📋 会议 \`${meetingId}\` 暂无任务\n\n主题: ${meeting.theme}`,
            };
          }

          // 统计
          const stats = {
            total: tasks.length,
            pending: tasks.filter(t => t.status === 'pending').length,
            assigned: tasks.filter(t => t.status === 'assigned').length,
            in_progress: tasks.filter(t => t.status === 'in_progress').length,
            completed: tasks.filter(t => t.status === 'completed').length,
            failed: tasks.filter(t => t.status === 'failed').length,
          };

          const lines = [
            `📋 **会议任务** - ${meeting.theme}`,
            ``,
            `进度: ✅${stats.completed} 🔄${stats.in_progress} ⏳${stats.assigned} ❌${stats.failed} / ${stats.total}`,
            ``,
          ];

          // 按状态分组显示
          const statusOrder: Array<{ status: string; label: string; emoji: string }> = [
            { status: 'in_progress', label: '进行中', emoji: '🔄' },
            { status: 'assigned', label: '待执行', emoji: '⏳' },
            { status: 'pending', label: '等待中', emoji: '📝' },
            { status: 'completed', label: '已完成', emoji: '✅' },
            { status: 'failed', label: '失败', emoji: '❌' },
          ];

          for (const group of statusOrder) {
            const groupTasks = tasks.filter(t => t.status === group.status);
            if (groupTasks.length > 0) {
              lines.push(`**${group.emoji} ${group.label}** (${groupTasks.length})`);
              for (const task of groupTasks) {
                lines.push(`  • ${task.title}`);
                lines.push(`    分配给: ${task.assignee_agent_id}`);
              }
              lines.push('');
            }
          }

          return {
            text: lines.join('\n'),
          };

        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          return {
            text: `❌ 查询失败: ${message}`,
          };
        }
      },
    },

    // ==================== /meeting-voting ====================
    {
      name: 'meeting-voting',
      description: '查看当前投票状态',
      acceptsArgs: true,
      handler: async (ctx) => {
        try {
          let meetingId: string | undefined;

          if (ctx.args) {
            const args = ctx.args.trim().split(/\s+/);
            for (const arg of args) {
              if (arg.startsWith('meeting_') || (arg.length > 5 && !isNaN(parseInt(arg)))) {
                meetingId = arg;
                break;
              }
            }
          }

          if (!meetingId) {
            const { meetings } = await listMeetings({ status: 'in_progress', limit: 1 });
            if (meetings.length > 0) {
              meetingId = meetings[0].id;
            }
          }

          if (!meetingId) {
            return {
              text: '请指定会议ID',
            };
          }

          const meeting = await loadMeeting(meetingId);
          const activeVotings = meeting.voting_history.filter(v => v.status === 'open');

          if (activeVotings.length === 0) {
            return {
              text: `📋 会议 \`${meetingId}\` 没有进行中的投票\n\n历史投票: ${meeting.voting_history.length}次`,
            };
          }

          const lines = [
            `⚠️ **进行中的投票** (${activeVotings.length})`,
            '',
          ];

          for (const voting of activeVotings) {
            const endTime = voting.timing.ends_at ? new Date(voting.timing.ends_at) : new Date();
            const remaining = Math.max(0, Math.round((endTime.getTime() - Date.now()) / 1000));
            const minutes = Math.floor(remaining / 60);
            const seconds = remaining % 60;

            lines.push(`📌 **${voting.topic}**`);
            lines.push(`   类型: ${voting.type}`);
            lines.push(`   选项: ${voting.options.map(o => o.text).join(', ')}`);
            lines.push(`   剩余: ${minutes}分${seconds}秒`);
            lines.push(`   结束: ${endTime.toLocaleTimeString()}`);
            lines.push('');
          }

          return {
            text: lines.join('\n'),
          };

        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          return {
            text: `❌ 查询失败: ${message}`,
          };
        }
      },
    },
  ];
}