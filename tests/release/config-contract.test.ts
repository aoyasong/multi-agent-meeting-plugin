import { describe, expect, it } from 'vitest';

import manifest from '../../openclaw.plugin.json';

interface RuntimeConfig {
  storageDir?: string;
  pollIntervalMs?: number;
  agentTimeoutMs?: number;
  votingWindows?: {
    simple?: number;
    moderate?: number;
    complex?: number;
  };
}

/**
 * 根据插件 manifest 的关键约束做最小运行时配置校验。
 */
function validateRuntimeConfig(config: RuntimeConfig): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (typeof config.storageDir !== 'undefined' && typeof config.storageDir !== 'string') {
    reasons.push('storageDir must be a string');
  }

  if (typeof config.pollIntervalMs !== 'undefined') {
    if (typeof config.pollIntervalMs !== 'number') {
      reasons.push('pollIntervalMs must be a number');
    } else if (config.pollIntervalMs < 1000 || config.pollIntervalMs > 30000) {
      reasons.push('pollIntervalMs out of range [1000, 30000]');
    }
  }

  if (typeof config.agentTimeoutMs !== 'undefined') {
    if (typeof config.agentTimeoutMs !== 'number') {
      reasons.push('agentTimeoutMs must be a number');
    } else if (config.agentTimeoutMs < 5000 || config.agentTimeoutMs > 120000) {
      reasons.push('agentTimeoutMs out of range [5000, 120000]');
    }
  }

  if (typeof config.votingWindows !== 'undefined') {
    const vw = config.votingWindows;
    const keys: Array<keyof NonNullable<RuntimeConfig['votingWindows']>> = ['simple', 'moderate', 'complex'];
    for (const key of keys) {
      const val = vw?.[key];
      if (typeof val !== 'undefined' && typeof val !== 'number') {
        reasons.push(`votingWindows.${key} must be a number`);
      }
    }
  }

  return { valid: reasons.length === 0, reasons };
}

describe('Config contract', () => {
  it('should keep manifest config schema bounds intact', () => {
    const props = manifest.configSchema?.properties as Record<string, any>;

    expect(props.pollIntervalMs.minimum).toBe(1000);
    expect(props.pollIntervalMs.maximum).toBe(30000);
    expect(props.agentTimeoutMs.minimum).toBe(5000);
    expect(props.agentTimeoutMs.maximum).toBe(120000);
    expect(props.votingWindows.properties.simple.default).toBe(180);
    expect(props.votingWindows.properties.moderate.default).toBe(300);
    expect(props.votingWindows.properties.complex.default).toBe(600);
  });

  it('should accept a valid runtime config sample', () => {
    const result = validateRuntimeConfig({
      storageDir: 'D:/tmp/meeting',
      pollIntervalMs: 5000,
      agentTimeoutMs: 30000,
      votingWindows: {
        simple: 180,
        moderate: 300,
        complex: 600,
      },
    });

    expect(result.valid).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it('should reject out-of-range or invalid config values', () => {
    const result = validateRuntimeConfig({
      storageDir: undefined,
      pollIntervalMs: 500,
      agentTimeoutMs: 200000,
      votingWindows: {
        simple: 180,
        moderate: Number.NaN,
        complex: 600,
      },
    });

    expect(result.valid).toBe(false);
    expect(result.reasons).toContain('pollIntervalMs out of range [1000, 30000]');
    expect(result.reasons).toContain('agentTimeoutMs out of range [5000, 120000]');
  });
});
