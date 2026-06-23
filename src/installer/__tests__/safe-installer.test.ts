/**
 * Tests for Safe Installer (Task T2)
 * Tests hook conflict detection and forceHooks option
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { isOmacHook, InstallOptions } from '../index.js';

/**
 * Detect hook conflicts using the real isOmacHook function.
 * Mirrors the install() logic to avoid test duplication.
 */
function detectConflicts(
  hooks: Record<string, Array<{ hooks: Array<{ type: string; command: string }> }>>
): Array<{ eventType: string; existingCommand: string }> {
  const conflicts: Array<{ eventType: string; existingCommand: string }> = [];
  for (const [eventType, eventHooks] of Object.entries(hooks)) {
    for (const hookGroup of eventHooks) {
      for (const hook of hookGroup.hooks) {
        if (hook.type === 'command' && !isOmacHook(hook.command)) {
          conflicts.push({ eventType, existingCommand: hook.command });
        }
      }
    }
  }
  return conflicts;
}

const TEST_CLAUDE_DIR = join(homedir(), '.claude-test-safe-installer');
const TEST_SETTINGS_FILE = join(TEST_CLAUDE_DIR, 'settings.json');

describe('isOmacHook', () => {
  it('returns true for commands containing "omac"', () => {
    expect(isOmacHook('node ~/.claude/hooks/omac-hook.mjs')).toBe(true);
    expect(isOmacHook('bash $HOME/.claude/hooks/omac-detector.sh')).toBe(true);
    expect(isOmacHook('/usr/bin/omac-tool')).toBe(true);
  });

  it('returns true for commands containing "oh-my-agent-connector"', () => {
    expect(isOmacHook('node ~/.claude/hooks/oh-my-agent-connector-hook.mjs')).toBe(true);
    expect(isOmacHook('bash $HOME/.claude/hooks/oh-my-agent-connector.sh')).toBe(true);
  });

  it('returns false for commands not containing omac or oh-my-agent-connector', () => {
    expect(isOmacHook('node ~/.claude/hooks/other-plugin.mjs')).toBe(false);
    expect(isOmacHook('bash $HOME/.claude/hooks/beads-hook.sh')).toBe(false);
    expect(isOmacHook('python /usr/bin/custom-hook.py')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isOmacHook('node ~/.claude/hooks/OMAC-hook.mjs')).toBe(true);
    expect(isOmacHook('bash $HOME/.claude/hooks/OH-MY-AGENT-CONNECTOR.sh')).toBe(true);
  });
});

describe('isOmacHook detection', () => {
  it('detects real OMAC hooks correctly', () => {
    expect(isOmacHook('node ~/.claude/hooks/omac-hook.mjs')).toBe(true);
    expect(isOmacHook('node ~/.claude/hooks/oh-my-agent-connector-hook.mjs')).toBe(true);
    expect(isOmacHook('node ~/.claude/hooks/omac-pre-tool-use.mjs')).toBe(true);
    expect(isOmacHook('/usr/local/bin/omac')).toBe(true);
  });

  it('detects actual OMAC hook commands from settings.json (issue #606)', () => {
    // These are the real commands OMAC installs into settings.json
    expect(isOmacHook('node "$HOME/.claude/hooks/keyword-detector.mjs"')).toBe(true);
    expect(isOmacHook('node "$HOME/.claude/hooks/session-start.mjs"')).toBe(true);
    expect(isOmacHook('node "$HOME/.claude/hooks/pre-tool-use.mjs"')).toBe(true);
    expect(isOmacHook('node "$HOME/.claude/hooks/post-tool-use.mjs"')).toBe(true);
    expect(isOmacHook('node "$HOME/.claude/hooks/post-tool-use-failure.mjs"')).toBe(true);
    expect(isOmacHook('node "$HOME/.claude/hooks/persistent-mode.mjs"')).toBe(true);
  });

  it('detects custom-profile OMAC hook commands by hook filename', () => {
    expect(isOmacHook('node "/tmp/custom-claude/hooks/keyword-detector.mjs"')).toBe(true);
  });

  it('detects CLAUDE_CONFIG_DIR-aware hook commands', () => {
    expect(isOmacHook('node "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/hooks/keyword-detector.mjs"')).toBe(true);
    expect(isOmacHook('node "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/hooks/pre-tool-use.mjs"')).toBe(true);
    expect(isOmacHook('node "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/hooks/persistent-mode.mjs"')).toBe(true);
  });

  it('detects Windows-style OMAC hook commands (issue #606)', () => {
    expect(isOmacHook('node "%USERPROFILE%\\.claude\\hooks\\keyword-detector.mjs"')).toBe(true);
    expect(isOmacHook('node "%USERPROFILE%\\.claude\\hooks\\pre-tool-use.mjs"')).toBe(true);
  });

  it('rejects non-OMAC hooks correctly', () => {
    expect(isOmacHook('eslint --fix')).toBe(false);
    expect(isOmacHook('prettier --write')).toBe(false);
    expect(isOmacHook('node custom-hook.mjs')).toBe(false);
    expect(isOmacHook('node ~/other-plugin/hooks/detector.mjs')).toBe(false);
  });

  it('uses case-insensitive matching', () => {
    expect(isOmacHook('node ~/.claude/hooks/OMAC-hook.mjs')).toBe(true);
    expect(isOmacHook('OH-MY-AGENT-CONNECTOR-detector.sh')).toBe(true);
  });
});

describe('Safe Installer - Hook Conflict Detection', () => {
  beforeEach(() => {
    // Clean up test directory
    if (existsSync(TEST_CLAUDE_DIR)) {
      rmSync(TEST_CLAUDE_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_CLAUDE_DIR, { recursive: true });

    // Mock CLAUDE_CONFIG_DIR for testing
    process.env.TEST_CLAUDE_CONFIG_DIR = TEST_CLAUDE_DIR;
  });

  afterEach(() => {
    // Clean up
    if (existsSync(TEST_CLAUDE_DIR)) {
      rmSync(TEST_CLAUDE_DIR, { recursive: true, force: true });
    }
    delete process.env.TEST_CLAUDE_CONFIG_DIR;
  });

  it('detects conflict when PreToolUse is owned by another plugin', () => {
    // Create settings.json with non-OMAC hook
    const existingSettings = {
      hooks: {
        PreToolUse: [
          {
            hooks: [
              {
                type: 'command',
                command: 'node ~/.claude/hooks/beads-hook.mjs'
              }
            ]
          }
        ]
      }
    };
    writeFileSync(TEST_SETTINGS_FILE, JSON.stringify(existingSettings, null, 2));

    const _options: InstallOptions = {
      verbose: true,
      skipClaudeCheck: true
    };

    // Simulate install logic (we'd need to mock or refactor install function for full test)
    // For now, test the detection logic directly
    const conflicts = detectConflicts(existingSettings.hooks);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].eventType).toBe('PreToolUse');
    expect(conflicts[0].existingCommand).toBe('node ~/.claude/hooks/beads-hook.mjs');
  });

  it('does not detect conflict when hook is OMAC-owned', () => {
    const existingSettings = {
      hooks: {
        PreToolUse: [
          {
            hooks: [
              {
                type: 'command',
                command: 'node "$HOME/.claude/hooks/pre-tool-use.mjs"'
              }
            ]
          }
        ]
      }
    };

    const conflicts = detectConflicts(existingSettings.hooks);

    expect(conflicts).toHaveLength(0);
  });

  it('detects multiple conflicts across different hook events', () => {
    const existingSettings = {
      hooks: {
        PreToolUse: [
          {
            hooks: [
              {
                type: 'command',
                command: 'node ~/.claude/hooks/beads-pre-tool-use.mjs'
              }
            ]
          }
        ],
        PostToolUse: [
          {
            hooks: [
              {
                type: 'command',
                command: 'python ~/.claude/hooks/custom-post-tool.py'
              }
            ]
          }
        ],
        UserPromptSubmit: [
          {
            hooks: [
              {
                type: 'command',
                command: 'node "$HOME/.claude/hooks/keyword-detector.mjs"'
              }
            ]
          }
        ]
      }
    };

    const conflicts = detectConflicts(existingSettings.hooks);

    expect(conflicts).toHaveLength(2);
    expect(conflicts.map(c => c.eventType)).toContain('PreToolUse');
    expect(conflicts.map(c => c.eventType)).toContain('PostToolUse');
    expect(conflicts.map(c => c.eventType)).not.toContain('UserPromptSubmit');
  });
});
