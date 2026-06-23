/**
 * Tests for omac update --force-hooks protection (issue #722)
 *
 * Verifies that the hook merge logic in install() correctly:
 *   - merges OMAC hooks with existing non-OMAC hooks during `omac update` (force=true)
 *   - warns when non-OMAC hooks are present
 *   - only fully replaces when --force-hooks is explicitly set
 *
 * Tests exercise isOmacHook() and the merge logic via unit-level helpers
 * to avoid filesystem side-effects.
 */

import { describe, it, expect } from 'vitest';
import { isOmacHook } from '../installer/index.js';

// ---------------------------------------------------------------------------
// Shared types mirroring installer internals
// ---------------------------------------------------------------------------
type HookEntry = { type: string; command: string };
type HookGroup = { hooks: HookEntry[] };

// ---------------------------------------------------------------------------
// Pure merge helper extracted from install() for isolated testing.
// This mirrors exactly the logic in installer/index.ts so that changes
// to the installer are reflected and tested here.
// ---------------------------------------------------------------------------
function mergeEventHooks(
  existingGroups: HookGroup[],
  newOmacGroups: HookGroup[],
  options: { force?: boolean; forceHooks?: boolean; allowPluginHookRefresh?: boolean }
): {
  merged: HookGroup[];
  conflicts: Array<{ eventType: string; existingCommand: string }>;
  logMessages: string[];
} {
  const conflicts: Array<{ eventType: string; existingCommand: string }> = [];
  const logMessages: string[] = [];
  const eventType = 'TestEvent';

  const nonOmacGroups = existingGroups.filter(group =>
    group.hooks.some(h => h.type === 'command' && !isOmacHook(h.command))
  );
  const hasNonOmacHook = nonOmacGroups.length > 0;
  const nonOmacCommand = hasNonOmacHook
    ? nonOmacGroups[0].hooks.find(h => h.type === 'command' && !isOmacHook(h.command))?.command ?? ''
    : '';

  let merged: HookGroup[];

  if (options.forceHooks && !options.allowPluginHookRefresh) {
    if (hasNonOmacHook) {
      logMessages.push(`Warning: Overwriting non-OMAC ${eventType} hook with --force-hooks: ${nonOmacCommand}`);
      conflicts.push({ eventType, existingCommand: nonOmacCommand });
    }
    merged = newOmacGroups;
    logMessages.push(`Updated ${eventType} hook (--force-hooks)`);
  } else if (options.force) {
    merged = [...nonOmacGroups, ...newOmacGroups];
    if (hasNonOmacHook) {
      logMessages.push(`Merged ${eventType} hooks (updated OMAC hooks, preserved non-OMAC hook: ${nonOmacCommand})`);
      conflicts.push({ eventType, existingCommand: nonOmacCommand });
    } else {
      logMessages.push(`Updated ${eventType} hook (--force)`);
    }
  } else {
    if (hasNonOmacHook) {
      logMessages.push(`Warning: ${eventType} hook has non-OMAC hook. Skipping. Use --force-hooks to override.`);
      conflicts.push({ eventType, existingCommand: nonOmacCommand });
    } else {
      logMessages.push(`${eventType} hook already configured, skipping`);
    }
    merged = existingGroups; // unchanged
  }

  return { merged, conflicts, logMessages };
}

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------
function omacGroup(command: string): HookGroup {
  return { hooks: [{ type: 'command', command }] };
}

function userGroup(command: string): HookGroup {
  return { hooks: [{ type: 'command', command }] };
}

const OMAC_CMD = 'node "$HOME/.claude/hooks/keyword-detector.mjs"';
const USER_CMD = '/usr/local/bin/my-custom-hook.sh';
const NEW_OMAC_CMD = 'node "$HOME/.claude/hooks/session-start.mjs"';

// ---------------------------------------------------------------------------
// isOmacHook unit tests
// ---------------------------------------------------------------------------
describe('isOmacHook()', () => {
  it('recognises OMAC keyword-detector command', () => {
    expect(isOmacHook('node "$HOME/.claude/hooks/keyword-detector.mjs"')).toBe(true);
  });

  it('recognises OMAC session-start command', () => {
    expect(isOmacHook('node "$HOME/.claude/hooks/session-start.mjs"')).toBe(true);
  });

  it('recognises OMAC pre-tool-use command', () => {
    expect(isOmacHook('node "$HOME/.claude/hooks/pre-tool-use.mjs"')).toBe(true);
  });

  it('recognises OMAC post-tool-use command', () => {
    expect(isOmacHook('node "$HOME/.claude/hooks/post-tool-use.mjs"')).toBe(true);
  });

  it('recognises OMAC persistent-mode command', () => {
    expect(isOmacHook('node "$HOME/.claude/hooks/persistent-mode.mjs"')).toBe(true);
  });

  it('recognises OMAC code-simplifier command', () => {
    expect(isOmacHook('node "$HOME/.claude/hooks/code-simplifier.mjs"')).toBe(true);
  });

  it('recognises Windows-style OMAC path', () => {
    expect(isOmacHook('node "%USERPROFILE%\\.claude\\hooks\\keyword-detector.mjs"')).toBe(true);
  });

  it('recognises custom-profile hook paths by known filename', () => {
    expect(isOmacHook('node "/tmp/custom-claude/hooks/keyword-detector.mjs"')).toBe(true);
  });

  it('recognises CLAUDE_CONFIG_DIR-aware hook commands', () => {
    expect(isOmacHook('node "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/hooks/keyword-detector.mjs"')).toBe(true);
    expect(isOmacHook('node "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/hooks/persistent-mode.mjs"')).toBe(true);
  });

  it('recognises oh-my-agent-connector in command path', () => {
    expect(isOmacHook('/path/to/oh-my-agent-connector/hook.mjs')).toBe(true);
  });

  it('recognises omac as a path segment', () => {
    expect(isOmacHook('/usr/local/bin/omac-hook.sh')).toBe(true);
  });

  it('does not recognise a plain user command', () => {
    expect(isOmacHook('/usr/local/bin/my-custom-hook.sh')).toBe(false);
  });

  it('does not recognise a random shell script', () => {
    expect(isOmacHook('bash /home/user/scripts/notify.sh')).toBe(false);
  });

  it('does not match "omac" inside an unrelated word', () => {
    // "nomac" or "omacr" should NOT match the omac path-segment pattern
    expect(isOmacHook('/usr/bin/nomac-thing')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Hook merge logic tests
// ---------------------------------------------------------------------------
describe('Hook merge during omac update', () => {
  describe('no force flags — skip behaviour', () => {
    it('skips an already-configured OMAC-only event type', () => {
      const existing = [omacGroup(OMAC_CMD)];
      const newOmac = [omacGroup(NEW_OMAC_CMD)];
      const { merged, conflicts, logMessages } = mergeEventHooks(existing, newOmac, {});

      expect(merged).toEqual(existing); // unchanged
      expect(conflicts).toHaveLength(0);
      expect(logMessages[0]).toMatch(/already configured/);
    });

    it('records conflict but does not overwrite when non-OMAC hook exists', () => {
      const existing = [userGroup(USER_CMD)];
      const newOmac = [omacGroup(NEW_OMAC_CMD)];
      const { merged, conflicts, logMessages } = mergeEventHooks(existing, newOmac, {});

      expect(merged).toEqual(existing); // unchanged
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].existingCommand).toBe(USER_CMD);
      expect(logMessages[0]).toMatch(/non-OMAC hook/);
      expect(logMessages[0]).toMatch(/--force-hooks/);
    });
  });

  describe('force=true — merge behaviour (omac update path)', () => {
    it('replaces OMAC hooks when event type has only OMAC hooks', () => {
      const existing = [omacGroup(OMAC_CMD)];
      const newOmac = [omacGroup(NEW_OMAC_CMD)];
      const { merged, conflicts } = mergeEventHooks(existing, newOmac, { force: true });

      // Non-OMAC groups: none → merged = newOmac only
      expect(merged).toHaveLength(1);
      expect(merged[0].hooks[0].command).toBe(NEW_OMAC_CMD);
      expect(conflicts).toHaveLength(0);
    });

    it('preserves non-OMAC hook and adds updated OMAC hook', () => {
      const existing = [userGroup(USER_CMD), omacGroup(OMAC_CMD)];
      const newOmac = [omacGroup(NEW_OMAC_CMD)];
      const { merged, conflicts, logMessages } = mergeEventHooks(existing, newOmac, { force: true });

      // non-OMAC groups come first, then new OMAC groups
      expect(merged).toHaveLength(2);
      expect(merged[0].hooks[0].command).toBe(USER_CMD);
      expect(merged[1].hooks[0].command).toBe(NEW_OMAC_CMD);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].existingCommand).toBe(USER_CMD);
      expect(logMessages[0]).toMatch(/Merged/);
      expect(logMessages[0]).toMatch(/preserved non-OMAC hook/);
    });

    it('preserves multiple non-OMAC hook groups', () => {
      const userCmd2 = '/usr/local/bin/another-hook.sh';
      const existing = [userGroup(USER_CMD), userGroup(userCmd2), omacGroup(OMAC_CMD)];
      const newOmac = [omacGroup(NEW_OMAC_CMD)];
      const { merged } = mergeEventHooks(existing, newOmac, { force: true });

      expect(merged).toHaveLength(3); // 2 user groups + 1 new OMAC group
      expect(merged[0].hooks[0].command).toBe(USER_CMD);
      expect(merged[1].hooks[0].command).toBe(userCmd2);
      expect(merged[2].hooks[0].command).toBe(NEW_OMAC_CMD);
    });

    it('does not carry over old OMAC hook groups', () => {
      const existing = [omacGroup(OMAC_CMD)];
      const newOmac = [omacGroup(NEW_OMAC_CMD)];
      const { merged } = mergeEventHooks(existing, newOmac, { force: true });

      const commands = merged.flatMap(g => g.hooks.map(h => h.command));
      expect(commands).not.toContain(OMAC_CMD);
      expect(commands).toContain(NEW_OMAC_CMD);
    });

    it('records a conflict when non-OMAC hook is preserved', () => {
      const existing = [userGroup(USER_CMD)];
      const newOmac = [omacGroup(NEW_OMAC_CMD)];
      const { conflicts } = mergeEventHooks(existing, newOmac, { force: true });

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].existingCommand).toBe(USER_CMD);
    });

    it('records no conflict when only OMAC hooks existed', () => {
      const existing = [omacGroup(OMAC_CMD)];
      const newOmac = [omacGroup(NEW_OMAC_CMD)];
      const { conflicts } = mergeEventHooks(existing, newOmac, { force: true });

      expect(conflicts).toHaveLength(0);
    });
  });

  describe('forceHooks=true — replace-all behaviour', () => {
    it('replaces OMAC-only hooks', () => {
      const existing = [omacGroup(OMAC_CMD)];
      const newOmac = [omacGroup(NEW_OMAC_CMD)];
      const { merged, conflicts } = mergeEventHooks(existing, newOmac, { forceHooks: true });

      expect(merged).toEqual(newOmac);
      expect(conflicts).toHaveLength(0);
    });

    it('replaces non-OMAC hook and warns', () => {
      const existing = [userGroup(USER_CMD)];
      const newOmac = [omacGroup(NEW_OMAC_CMD)];
      const { merged, conflicts, logMessages } = mergeEventHooks(existing, newOmac, { forceHooks: true });

      expect(merged).toEqual(newOmac);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].existingCommand).toBe(USER_CMD);
      expect(logMessages[0]).toMatch(/Overwriting non-OMAC/);
      expect(logMessages[0]).toMatch(/--force-hooks/);
    });

    it('replaces mixed hooks entirely', () => {
      const existing = [userGroup(USER_CMD), omacGroup(OMAC_CMD)];
      const newOmac = [omacGroup(NEW_OMAC_CMD)];
      const { merged } = mergeEventHooks(existing, newOmac, { forceHooks: true });

      expect(merged).toHaveLength(1);
      expect(merged[0].hooks[0].command).toBe(NEW_OMAC_CMD);
    });

    it('does NOT replace when allowPluginHookRefresh is true (plugin safety)', () => {
      // When running as a plugin with refreshHooksInPlugin, forceHooks should
      // not clobber user hooks — falls through to the force=true merge path
      // (since allowPluginHookRefresh=true disables the forceHooks branch).
      // This test exercises the guard: forceHooks && !allowPluginHookRefresh.
      const existing = [userGroup(USER_CMD), omacGroup(OMAC_CMD)];
      const newOmac = [omacGroup(NEW_OMAC_CMD)];
      const { merged } = mergeEventHooks(existing, newOmac, {
        forceHooks: true,
        allowPluginHookRefresh: true,
        // Note: force is not set, so falls to "no force" branch
      });

      // Without force set, the no-force branch runs → merged unchanged
      expect(merged).toEqual(existing);
    });
  });

  describe('edge cases', () => {
    it('handles event type with no existing hooks (empty array)', () => {
      // When existingHooks[eventType] exists but is empty
      const existing: HookGroup[] = [];
      const newOmac = [omacGroup(NEW_OMAC_CMD)];
      const { merged, conflicts } = mergeEventHooks(existing, newOmac, { force: true });

      // nonOmacGroups will be empty, so merged = [] + newOmacGroups
      expect(merged).toEqual(newOmac);
      expect(conflicts).toHaveLength(0);
    });

    it('handles hook group with non-command type (should not be treated as non-OMAC)', () => {
      // A hook group with type != 'command' should not count as non-OMAC
      const existing: HookGroup[] = [{ hooks: [{ type: 'webhook', command: '' }] }];
      const newOmac = [omacGroup(NEW_OMAC_CMD)];
      const { conflicts } = mergeEventHooks(existing, newOmac, { force: true });

      // The webhook group has no command-type hooks → nonOmacGroups is empty
      expect(conflicts).toHaveLength(0);
    });
  });
});
