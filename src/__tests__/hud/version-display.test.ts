import { describe, it, expect, vi } from 'vitest';
import { render } from '../../hud/render.js';
import { DEFAULT_HUD_CONFIG } from '../../hud/types.js';
import type { HudRenderContext, HudConfig } from '../../hud/types.js';

// The HUD banner appends an "L" suffix when running from a local/dev checkout
// (isRuntimePackageLocal). Under test the package root has src/ and .git, so it
// would always report local. Force false for deterministic banner assertions.
vi.mock('../../lib/version.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/version.js')>()),
  isRuntimePackageLocal: () => false,
}));

function createMinimalContext(overrides: Partial<HudRenderContext> = {}): HudRenderContext {
  return {
    contextPercent: 30,
    modelName: 'claude-sonnet-4.6',
    ralph: null,
    ultrawork: null,
    prd: null,
    autopilot: null,
    activeAgents: [],
    todos: [],
    backgroundTasks: [],
    cwd: '/tmp/test',
    lastSkill: null,
    rateLimitsResult: null,
    customBuckets: null,
    pendingPermission: null,
    thinkingState: null,
    sessionHealth: null,
    omacVersion: null,
    updateAvailable: null,
    toolCallCount: 0,
    agentCallCount: 0,
    skillCallCount: 0,
    promptTime: null,
    apiKeySource: null,
    profileName: null,
    sessionSummary: null,
    ...overrides,
  };
}

function createMinimalConfig(overrides: Partial<HudConfig['elements']> = {}): HudConfig {
  return {
    ...DEFAULT_HUD_CONFIG,
    elements: {
      ...DEFAULT_HUD_CONFIG.elements,
      omacLabel: true,
      rateLimits: false,
      ralph: false,
      autopilot: false,
      prdStory: false,
      activeSkills: false,
      lastSkill: false,
      contextBar: false,
      agents: false,
      backgroundTasks: false,
      todos: false,
      permissionStatus: false,
      thinking: false,
      sessionHealth: false,
      ...overrides,
    },
  };
}

describe('HUD version display and update notification', () => {
  describe('OMAC label without version', () => {
    it('renders [OMAC] when omacVersion is null', async () => {
      const ctx = createMinimalContext({ omacVersion: null });
      const config = createMinimalConfig();
      const output = await render(ctx, config);
      expect(output).toContain('[OMAC]');
      expect(output).not.toContain('#');
    });
  });

  describe('OMAC label with version', () => {
    it('renders [OMAC#X.Y.Z] when omacVersion is set', async () => {
      const ctx = createMinimalContext({ omacVersion: '4.1.10' });
      const config = createMinimalConfig();
      const output = await render(ctx, config);
      expect(output).toContain('[OMAC#4.1.10]');
    });

    it('renders version without update notice when updateAvailable is null', async () => {
      const ctx = createMinimalContext({ omacVersion: '4.1.10', updateAvailable: null });
      const config = createMinimalConfig();
      const output = await render(ctx, config);
      expect(output).toContain('[OMAC#4.1.10]');
      expect(output).not.toContain('->');
      expect(output).not.toContain('omac update');
    });
  });

  describe('update notification', () => {
    it('renders update notification by default when updateAvailable is set', async () => {
      const ctx = createMinimalContext({ omacVersion: '4.1.10', updateAvailable: '4.2.0' });
      const config = createMinimalConfig();
      const output = await render(ctx, config);
      expect(output).toContain('[OMAC#4.1.10]');
      expect(output).toContain('-> 4.2.0');
      expect(output).toContain('omac update');
    });

    it('keeps OMAC version label but hides update notification when updateNotification is false', async () => {
      const ctx = createMinimalContext({ omacVersion: '4.1.10', updateAvailable: '4.2.0' });
      const config = createMinimalConfig({ updateNotification: false });
      const output = await render(ctx, config);
      expect(output).toContain('[OMAC#4.1.10]');
      expect(output).not.toContain('-> 4.2.0');
      expect(output).not.toContain('omac update');
    });

    it('renders update notification without version when omacVersion is null', async () => {
      const ctx = createMinimalContext({ omacVersion: null, updateAvailable: '4.2.0' });
      const config = createMinimalConfig();
      const output = await render(ctx, config);
      expect(output).toContain('[OMAC]');
      expect(output).toContain('-> 4.2.0');
    });
  });

  describe('omacLabel disabled', () => {
    it('does not render OMAC label when omacLabel is false', async () => {
      const ctx = createMinimalContext({ omacVersion: '4.1.10', updateAvailable: '4.2.0' });
      const config = createMinimalConfig({ omacLabel: false });
      const output = await render(ctx, config);
      expect(output).not.toContain('[OMAC');
      expect(output).not.toContain('omac update');
    });
  });
});
