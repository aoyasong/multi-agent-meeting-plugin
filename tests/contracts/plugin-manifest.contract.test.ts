import { describe, expect, it } from 'vitest';

import pluginEntry from '../../src/index.js';
import manifest from '../../openclaw.plugin.json';

describe('Plugin manifest contract', () => {
  it('should keep manifest id/name aligned with plugin entry', () => {
    expect(manifest.id).toBe(pluginEntry.id);
    expect(manifest.name).toBe(pluginEntry.name);
    expect(typeof manifest.version).toBe('string');
    expect(manifest.version.length).toBeGreaterThan(0);
  });

  it('should include required contracts/tools and config schema shape', () => {
    expect(Array.isArray(manifest.contracts?.tools)).toBe(true);
    expect((manifest.contracts?.tools ?? []).length).toBeGreaterThan(0);

    // configSchema minimal shape checks (avoid over-specifying)
    expect(manifest.configSchema?.type).toBe('object');
    expect(manifest.configSchema?.additionalProperties).toBe(false);
    expect(typeof manifest.configSchema?.properties).toBe('object');

    const props = manifest.configSchema?.properties as Record<string, any>;
    expect(props.storageDir?.type).toBe('string');
    expect(props.pollIntervalMs?.type).toBe('number');
    expect(props.agentTimeoutMs?.type).toBe('number');
    expect(props.votingWindows?.type).toBe('object');

    // uiHints minimal checks
    expect(typeof manifest.uiHints).toBe('object');
    expect(typeof (manifest.uiHints as any).storageDir).toBe('object');
    expect(typeof (manifest.uiHints as any).pollIntervalMs).toBe('object');
    expect(typeof (manifest.uiHints as any).agentTimeoutMs).toBe('object');
  });
});
