import { describe, expect, it } from 'vitest';

import { errorResult, jsonResult, successResult, textResult } from '../../src/utils/json-result.js';

describe('json-result utils', () => {
  it('jsonResult should wrap data into a single text content item', () => {
    const result = jsonResult({ ok: true, n: 1 });

    expect(result.content).toHaveLength(1);
    expect(result.content[0]?.type).toBe('text');

    const parsed = JSON.parse(result.content[0]?.text ?? '{}');
    expect(parsed.ok).toBe(true);
    expect(parsed.n).toBe(1);
  });

  it('textResult should wrap raw text', () => {
    const result = textResult('hello');

    expect(result.content).toHaveLength(1);
    expect(result.content[0]?.type).toBe('text');
    expect(result.content[0]?.text).toBe('hello');
  });

  it('errorResult should include error flag and message', () => {
    const result = errorResult('boom', { reason: 'test' });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');

    expect(parsed.error).toBe(true);
    expect(parsed.message).toBe('boom');
    expect(parsed.details).toEqual({ reason: 'test' });
  });

  it('successResult should include message and merge extra data', () => {
    const result = successResult('ok', { a: 1 });
    const parsed = JSON.parse(result.content[0]?.text ?? '{}');

    expect(parsed.success).toBe(true);
    expect(parsed.message).toBe('ok');
    expect(parsed.a).toBe(1);
  });
});
