import { describe, expect, it, vi } from 'vitest';

import pluginEntry from '../../src/index.js';
import manifest from '../../openclaw.plugin.json';
import { createMockApi } from '../helpers/test-helpers.js';

describe('Tool manifest contract', () => {
  it('should register exactly the tools declared in openclaw.plugin.json', () => {
    const registerTool = vi.fn();
    const api = createMockApi({ registerTool });

    pluginEntry.register(api);

    const registeredToolNames = registerTool.mock.calls
      .map(call => call[0]?.name as string)
      .filter(Boolean)
      .sort();

    const declaredToolNames = [...(manifest.contracts?.tools ?? [])].sort();

    expect(registeredToolNames).toEqual(declaredToolNames);
  });
});
