/**
 * Regression tests for `hasEnabledOmacPlugin()` settings format detection.
 *
 * Background: prior to this fix, the function read `settings.plugins`, but
 * Claude Code 1.x writes the canonical field as `settings.enabledPlugins`.
 * As a result, `omac update`/`omac setup` invoked from a regular shell (where
 * `CLAUDE_PLUGIN_ROOT` is unset) saw "no plugin enabled" and bypassed the
 * `prunePluginDuplicateSkills` branch entirely, leaving every user with a
 * Claude Code 1.x settings.json permanently stuck in the duplicate-skill
 * state from #2252.
 *
 * These tests pin both the modern (`enabledPlugins`) and the legacy
 * (`plugins`) detection paths so a future patch cannot regress either
 * surface.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const ORIG_ENV = { ...process.env };
let testDir: string;

async function freshInstaller() {
  vi.resetModules();
  return await import('../index.js');
}

function writeSettings(content: object): void {
  mkdirSync(testDir, { recursive: true });
  writeFileSync(join(testDir, 'settings.json'), JSON.stringify(content, null, 2));
}

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'omac-has-enabled-'));
  process.env.CLAUDE_CONFIG_DIR = testDir;
  delete process.env.CLAUDE_PLUGIN_ROOT;
  delete process.env.OMAC_PLUGIN_ROOT;
});

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIG_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIG_ENV);
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch { /* ignore */ }
});

describe('hasEnabledOmacPlugin', () => {
  describe('CLAUDE_PLUGIN_ROOT short-circuit (highest priority)', () => {
    it('returns true when CLAUDE_PLUGIN_ROOT is set, even with no settings.json', async () => {
      process.env.CLAUDE_PLUGIN_ROOT = '/some/plugin/root';
      const { hasEnabledOmacPlugin } = await freshInstaller();
      expect(hasEnabledOmacPlugin()).toBe(true);
    });
  });

  describe('Modern Claude Code 1.x format (`enabledPlugins`)', () => {
    it('returns true when enabledPlugins.oh-my-agent-connector@omac is true', async () => {
      writeSettings({
        enabledPlugins: {
          'oh-my-agent-connector@omac': true,
          'unrelated-plugin@foo': true,
        },
      });
      const { hasEnabledOmacPlugin } = await freshInstaller();
      expect(hasEnabledOmacPlugin()).toBe(true);
    });

    it('returns true for any pluginId substring matching oh-my-agent-connector', async () => {
      writeSettings({
        enabledPlugins: {
          'oh-my-agent-connector-fork@somerepo': true,
        },
      });
      const { hasEnabledOmacPlugin } = await freshInstaller();
      expect(hasEnabledOmacPlugin()).toBe(true);
    });

    it('returns false when enabledPlugins.oh-my-agent-connector@omac is explicitly false', async () => {
      writeSettings({
        enabledPlugins: {
          'oh-my-agent-connector@omac': false,
        },
      });
      const { hasEnabledOmacPlugin } = await freshInstaller();
      expect(hasEnabledOmacPlugin()).toBe(false);
    });

    it('returns false when enabledPlugins has no oh-my-agent-connector entry', async () => {
      writeSettings({
        enabledPlugins: {
          'unrelated-plugin@foo': true,
        },
      });
      const { hasEnabledOmacPlugin } = await freshInstaller();
      expect(hasEnabledOmacPlugin()).toBe(false);
    });

    it('handles enabledPlugins as an array of plugin id strings', async () => {
      writeSettings({
        enabledPlugins: ['oh-my-agent-connector@omac', 'other'],
      });
      const { hasEnabledOmacPlugin } = await freshInstaller();
      expect(hasEnabledOmacPlugin()).toBe(true);
    });
  });

  describe('Legacy `plugins` field (backward compatibility)', () => {
    it('returns true when plugins.oh-my-agent-connector@omac is true', async () => {
      writeSettings({
        plugins: {
          'oh-my-agent-connector@omac': true,
        },
      });
      const { hasEnabledOmacPlugin } = await freshInstaller();
      expect(hasEnabledOmacPlugin()).toBe(true);
    });

    it('returns true when plugins is an array with oh-my-agent-connector entry', async () => {
      writeSettings({
        plugins: ['oh-my-agent-connector'],
      });
      const { hasEnabledOmacPlugin } = await freshInstaller();
      expect(hasEnabledOmacPlugin()).toBe(true);
    });

    it('returns false when legacy plugins entry is explicitly false', async () => {
      writeSettings({
        plugins: {
          'oh-my-agent-connector@omac': false,
        },
      });
      const { hasEnabledOmacPlugin } = await freshInstaller();
      expect(hasEnabledOmacPlugin()).toBe(false);
    });
  });

  describe('Mixed format support', () => {
    it('matches oh-my-agent-connector in EITHER enabledPlugins or plugins', async () => {
      // settings has both fields; enabledPlugins is empty, plugins has the entry
      writeSettings({
        enabledPlugins: { 'unrelated@foo': true },
        plugins: { 'oh-my-agent-connector@omac': true },
      });
      const { hasEnabledOmacPlugin } = await freshInstaller();
      expect(hasEnabledOmacPlugin()).toBe(true);
    });

    it('returns true when modern enabledPlugins has the entry but legacy plugins does not', async () => {
      writeSettings({
        enabledPlugins: { 'oh-my-agent-connector@omac': true },
        plugins: { 'unrelated@foo': true },
      });
      const { hasEnabledOmacPlugin } = await freshInstaller();
      expect(hasEnabledOmacPlugin()).toBe(true);
    });

    it('returns false when neither field has an enabled OMAC entry', async () => {
      writeSettings({
        enabledPlugins: { 'unrelated@foo': true },
        plugins: { 'another@bar': true },
      });
      const { hasEnabledOmacPlugin } = await freshInstaller();
      expect(hasEnabledOmacPlugin()).toBe(false);
    });
  });

  describe('Defensive paths', () => {
    it('returns false when settings.json does not exist', async () => {
      // testDir was created by mkdtempSync but no settings.json was written
      const { hasEnabledOmacPlugin } = await freshInstaller();
      expect(hasEnabledOmacPlugin()).toBe(false);
    });

    it('returns false when settings.json is malformed JSON', async () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(join(testDir, 'settings.json'), '{ this is not valid json');
      const { hasEnabledOmacPlugin } = await freshInstaller();
      expect(hasEnabledOmacPlugin()).toBe(false);
    });

    it('returns false when settings.json has neither field', async () => {
      writeSettings({ env: {}, model: 'opus' });
      const { hasEnabledOmacPlugin } = await freshInstaller();
      expect(hasEnabledOmacPlugin()).toBe(false);
    });
  });
});
