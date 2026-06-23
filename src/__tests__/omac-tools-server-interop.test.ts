import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const savedInteropFlag = process.env.OMAC_INTEROP_TOOLS_ENABLED;

async function importFresh() {
  vi.resetModules();
  return import('../mcp/omac-tools-server.js');
}

describe('omac-tools-server interop gating', () => {
  beforeEach(() => {
    delete process.env.OMAC_INTEROP_TOOLS_ENABLED;
  });

  afterEach(() => {
    if (savedInteropFlag === undefined) {
      delete process.env.OMAC_INTEROP_TOOLS_ENABLED;
    } else {
      process.env.OMAC_INTEROP_TOOLS_ENABLED = savedInteropFlag;
    }
    vi.resetModules();
  });

  it('does not register interop tools by default', async () => {
    const mod = await importFresh();
    expect(mod.omacToolNames.some((name) => name.includes('interop_'))).toBe(false);
  }, 15000);

  it('registers interop tools when OMAC_INTEROP_TOOLS_ENABLED=1', async () => {
    process.env.OMAC_INTEROP_TOOLS_ENABLED = '1';
    const mod = await importFresh();

    expect(mod.omacToolNames).toContain('mcp__t__interop_send_task');
    expect(mod.omacToolNames).toContain('mcp__t__interop_send_omx_message');
  });

  it('filters interop tools when includeInterop=false', async () => {
    process.env.OMAC_INTEROP_TOOLS_ENABLED = '1';
    const mod = await importFresh();

    const withInterop = mod.getOmacToolNames({ includeInterop: true });
    const withoutInterop = mod.getOmacToolNames({ includeInterop: false });

    expect(withInterop.some((name) => name.includes('interop_'))).toBe(true);
    expect(withoutInterop.some((name) => name.includes('interop_'))).toBe(false);
  });
});
