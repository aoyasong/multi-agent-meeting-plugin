/**
 * OpenClaw工具结果格式化工具
 * 
 * @module utils/json-result
 */

/**
 * 工具返回内容项
 */
export interface ToolContentItem {
  type: 'text';
  text: string;
}

/**
 * 工具返回结果
 */
export interface ToolResult {
  content: ToolContentItem[];
}

/**
 * 将结果包装为OpenClaw工具返回格式
 * 
 * @param data - 要返回的数据
 * @returns OpenClaw工具结果格式
 * 
 * @example
 * ```ts
 * return jsonResult({ meeting_id: 'meeting_123', status: 'created' });
 * // 返回: { content: [{ type: 'text', text: '{"meeting_id":"meeting_123","status":"created"}' }] }
 * ```
 */
export function jsonResult(data: unknown): ToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

/**
 * 将字符串结果包装为OpenClaw工具返回格式
 * 
 * @param text - 要返回的文本
 * @returns OpenClaw工具结果格式
 */
export function textResult(text: string): ToolResult {
  return {
    content: [
      {
        type: 'text',
        text,
      },
    ],
  };
}

/**
 * 错误结果
 * 
 * @param message - 错误消息
 * @param details - 错误详情（可选）
 * @returns OpenClaw工具结果格式（包含错误信息）
 */
export function errorResult(message: string, details?: unknown): ToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            error: true,
            message,
            details,
          },
          null,
          2
        ),
      },
    ],
  };
}

/**
 * 成功结果（带消息）
 * 
 * @param message - 成功消息
 * @param data - 附加数据（可选）
 * @returns OpenClaw工具结果格式
 */
export function successResult(message: string, data?: Record<string, unknown>): ToolResult {
  const result: Record<string, unknown> = {
    success: true,
    message,
  };
  if (data) {
    Object.assign(result, data);
  }
  return jsonResult(result);
}
