/**
 * Regression tests for issue #2532: centralized OMAC_STATE_DIR state-root resolution.
 *
 * Verifies that:
 *   1. Default behavior (no OMAC_STATE_DIR) is unchanged — state lives in {dir}/.omac/
 *   2. session-start.mjs reads session state from the custom OMAC_STATE_DIR location
 *   3. persistent-mode.cjs (stop hook) reads mode state from the custom OMAC_STATE_DIR
 *      location and correctly blocks the stop when an active mode is present there
 *   4. pre-tool-enforcer.mjs (PreToolUse hook) reads team-state and writes
 *      skill-active-state through the centralized OMAC_STATE_DIR location
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { getOmacRoot, clearWorktreeCache } from '../lib/worktree-paths.js';

const NODE = process.execPath;
const REPO_ROOT = resolve(join(__dirname, '..', '..'));
const SESSION_START = join(REPO_ROOT, 'scripts', 'session-start.mjs');
const HOOK_RUNNER = join(REPO_ROOT, 'scripts', 'run.cjs');
const STOP_HOOK = join(REPO_ROOT, 'scripts', 'persistent-mode.cjs');
const PRE_TOOL_ENFORCER = join(REPO_ROOT, 'scripts', 'pre-tool-enforcer.mjs');

function buildHookEnv(extraEnv: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) env[k] = v;
  }
  // Remove OMAC_STATE_DIR from parent env so only extraEnv controls it.
  delete env.OMAC_STATE_DIR;
  return { ...env, CLAUDE_PLUGIN_ROOT: REPO_ROOT, ...extraEnv };
}

/** Run a hook script synchronously and return the parsed JSON output. */
function runHook(
  scriptPath: string,
  input: Record<string, unknown>,
  extraEnv: Record<string, string> = {},
): Record<string, unknown> {
  const raw = execFileSync(NODE, [scriptPath], {
    input: JSON.stringify(input),
    encoding: 'utf-8',
    env: buildHookEnv(extraEnv),
    timeout: 15000,
  }).trim();
  return JSON.parse(raw) as Record<string, unknown>;
}

/** Run a hook script through the installed hook runner path and return parsed JSON output. */
function runHookViaRunner(
  scriptPath: string,
  input: Record<string, unknown>,
  extraEnv: Record<string, string> = {},
): Record<string, unknown> {
  const raw = execFileSync(NODE, [HOOK_RUNNER, scriptPath], {
    input: JSON.stringify(input),
    encoding: 'utf-8',
    env: buildHookEnv(extraEnv),
    timeout: 15000,
  }).trim();
  return JSON.parse(raw) as Record<string, unknown>;
}

/**
 * Compute the centralized .omac root path for a given project dir and state dir.
 * Temporarily sets OMAC_STATE_DIR so getOmacRoot() returns the centralized path.
 */
function getCentralizedOmacRoot(projectDir: string, stateDir: string): string {
  const prev = process.env.OMAC_STATE_DIR;
  try {
    process.env.OMAC_STATE_DIR = stateDir;
    clearWorktreeCache();
    return getOmacRoot(projectDir);
  } finally {
    if (prev === undefined) {
      delete process.env.OMAC_STATE_DIR;
    } else {
      process.env.OMAC_STATE_DIR = prev;
    }
    clearWorktreeCache();
  }
}

function writeWorkflowTombstone(
  omacRoot: string,
  sessionId: string,
  mode: 'ralph' | 'ultrawork',
): void {
  const sessionDir = join(omacRoot, 'state', 'sessions', sessionId);
  mkdirSync(sessionDir, { recursive: true });
  writeFileSync(
    join(sessionDir, 'skill-active-state.json'),
    JSON.stringify({
      version: 2,
      active_skills: {
        [mode]: {
          skill_name: mode,
          started_at: '2026-04-26T00:00:00.000Z',
          completed_at: new Date().toISOString(),
          session_id: sessionId,
          mode_state_path: `${mode}-state.json`,
          initialized_mode: mode,
          initialized_state_path: join(omacRoot, 'state', `${mode}-state.json`),
          initialized_session_state_path: join(sessionDir, `${mode}-state.json`),
        },
      },
    }, null, 2),
  );
}

describe('OMAC_STATE_DIR state-root resolution (issue #2532)', () => {
  let tempDir: string;
  let fakeProject: string;
  let fakeStateDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'omac-state-root-'));
    fakeProject = join(tempDir, 'project');
    fakeStateDir = join(tempDir, 'centralized-state');
    mkdirSync(fakeProject, { recursive: true });
    // session-start validateCwd requires a real workspace anchor (.git / .omac-workspace)
    mkdirSync(join(fakeProject, '.git'), { recursive: true });
    mkdirSync(fakeStateDir, { recursive: true });
    delete process.env.OMAC_STATE_DIR;
    clearWorktreeCache();
  });

  afterEach(() => {
    delete process.env.OMAC_STATE_DIR;
    clearWorktreeCache();
    rmSync(tempDir, { recursive: true, force: true });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 1. Default state dir (no OMAC_STATE_DIR)
  // ────────────────────────────────────────────────────────────────────────────

  it('session-start reads ralph state from default .omac path when OMAC_STATE_DIR is not set', () => {
    const sessionId = 'test-session-default';
    const stateDir = join(fakeProject, '.omac', 'state', 'sessions', sessionId);
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(
      join(stateDir, 'ralph-state.json'),
      JSON.stringify({
        active: true,
        session_id: sessionId,
        prompt: 'Default-path task',
        iteration: 1,
        max_iterations: 5,
      }),
    );

    const output = runHook(SESSION_START, {
      hook_event_name: 'SessionStart',
      session_id: sessionId,
      cwd: fakeProject,
    });

    const context = (output as { hookSpecificOutput?: { additionalContext?: string } })
      .hookSpecificOutput?.additionalContext ?? '';
    expect(context).toContain('[RALPH LOOP RESTORED]');
  });

  it('session-start ignores tombstoned stale ralph restore state after cancel', () => {
    const sessionId = 'test-session-tombstoned-ralph';
    const omacRoot = join(fakeProject, '.omac');
    const stateDir = join(omacRoot, 'state', 'sessions', sessionId);
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(
      join(stateDir, 'ralph-state.json'),
      JSON.stringify({
        active: true,
        session_id: sessionId,
        prompt: 'Tombstoned task must not restore',
        iteration: 12,
        max_iterations: 100,
      }),
    );
    writeWorkflowTombstone(omacRoot, sessionId, 'ralph');

    const output = runHook(SESSION_START, {
      hook_event_name: 'SessionStart',
      session_id: sessionId,
      cwd: fakeProject,
    });

    const context = (output as { hookSpecificOutput?: { additionalContext?: string } })
      .hookSpecificOutput?.additionalContext ?? '';
    expect(context).not.toContain('[RALPH LOOP RESTORED]');
    expect(context).not.toContain('Tombstoned task must not restore');
  });

  it('session-start ignores tombstoned stale ultrawork restore state after cancel', () => {
    const sessionId = 'test-session-tombstoned-ultrawork';
    const omacRoot = join(fakeProject, '.omac');
    const stateDir = join(omacRoot, 'state', 'sessions', sessionId);
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(
      join(stateDir, 'ultrawork-state.json'),
      JSON.stringify({
        active: true,
        session_id: sessionId,
        started_at: '2026-04-26T00:00:00.000Z',
        original_prompt: 'Tombstoned ultrawork must not restore',
      }),
    );
    writeWorkflowTombstone(omacRoot, sessionId, 'ultrawork');

    const output = runHook(SESSION_START, {
      hook_event_name: 'SessionStart',
      session_id: sessionId,
      cwd: fakeProject,
    });

    const context = (output as { hookSpecificOutput?: { additionalContext?: string } })
      .hookSpecificOutput?.additionalContext ?? '';
    expect(context).not.toContain('[ULTRAWORK MODE RESTORED]');
    expect(context).not.toContain('Tombstoned ultrawork must not restore');
  });

  it('session-start through run.cjs does not clean prior active state without durable abandonment evidence', () => {
    const priorSessionId = 'prior-runner-session';
    const currentSessionId = 'current-runner-session';

    const priorStateDir = join(fakeProject, '.omac', 'state', 'sessions', priorSessionId);
    mkdirSync(priorStateDir, { recursive: true });
    writeFileSync(
      join(priorStateDir, 'ralph-state.json'),
      JSON.stringify({
        active: true,
        session_id: priorSessionId,
        prompt: 'Runner-created prior session state must survive',
        iteration: 1,
        max_iterations: 5,
      }),
    );

    runHookViaRunner(SESSION_START, {
      hook_event_name: 'SessionStart',
      session_id: priorSessionId,
      transcript_path: join(fakeProject, '.claude', 'projects', 'prior.jsonl'),
      source: 'startup',
      model: 'claude-sonnet-4-6',
      cwd: fakeProject,
    });

    const markerPath = join(priorStateDir, 'session-started.json');
    expect(existsSync(markerPath)).toBe(true);
    const marker = JSON.parse(readFileSync(markerPath, 'utf-8')) as Record<string, unknown>;
    expect(marker.session_id).toBe(priorSessionId);
    expect(marker.ppid).toBeUndefined();

    runHookViaRunner(SESSION_START, {
      hook_event_name: 'SessionStart',
      session_id: currentSessionId,
      transcript_path: join(fakeProject, '.claude', 'projects', 'current.jsonl'),
      source: 'startup',
      model: 'claude-sonnet-4-6',
      cwd: fakeProject,
    });

    expect(existsSync(join(priorStateDir, 'ralph-state.json'))).toBe(true);
    expect(existsSync(markerPath)).toBe(true);
    expect(existsSync(join(fakeProject, '.omac', 'state', 'sessions', currentSessionId, 'session-started.json'))).toBe(true);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 2. Custom OMAC_STATE_DIR — session-start
  // ────────────────────────────────────────────────────────────────────────────

  it('session-start reads ralph state from centralized path when OMAC_STATE_DIR is set', () => {
    const sessionId = 'test-session-centralized';
    const centralizedOmacRoot = getCentralizedOmacRoot(fakeProject, fakeStateDir);
    const stateDir = join(centralizedOmacRoot, 'state', 'sessions', sessionId);
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(
      join(stateDir, 'ralph-state.json'),
      JSON.stringify({
        active: true,
        session_id: sessionId,
        prompt: 'Centralized-state task',
        iteration: 2,
        max_iterations: 10,
      }),
    );

    const output = runHook(
      SESSION_START,
      { hook_event_name: 'SessionStart', session_id: sessionId, cwd: fakeProject },
      { OMAC_STATE_DIR: fakeStateDir },
    );

    const context = (output as { hookSpecificOutput?: { additionalContext?: string } })
      .hookSpecificOutput?.additionalContext ?? '';
    expect(context).toContain('[RALPH LOOP RESTORED]');
    expect(context).toContain('Centralized-state task');
  });

  it('session-start reads ultrawork state from centralized path when OMAC_STATE_DIR is set', () => {
    const sessionId = 'test-session-uw-central';
    const centralizedOmacRoot = getCentralizedOmacRoot(fakeProject, fakeStateDir);
    const stateDir = join(centralizedOmacRoot, 'state', 'sessions', sessionId);
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(
      join(stateDir, 'ultrawork-state.json'),
      JSON.stringify({
        active: true,
        session_id: sessionId,
        started_at: '2026-01-01T00:00:00.000Z',
        original_prompt: 'Centralized ultrawork task',
      }),
    );

    const output = runHook(
      SESSION_START,
      { hook_event_name: 'SessionStart', session_id: sessionId, cwd: fakeProject },
      { OMAC_STATE_DIR: fakeStateDir },
    );

    const context = (output as { hookSpecificOutput?: { additionalContext?: string } })
      .hookSpecificOutput?.additionalContext ?? '';
    expect(context).toContain('[ULTRAWORK MODE RESTORED]');
    expect(context).toContain('Centralized ultrawork task');
  });

  it('session-start does NOT restore state when OMAC_STATE_DIR is set but state is only in default .omac', () => {
    const sessionId = 'test-session-only-default';
    // Place state ONLY in the default .omac location
    const defaultStateDir = join(fakeProject, '.omac', 'state', 'sessions', sessionId);
    mkdirSync(defaultStateDir, { recursive: true });
    writeFileSync(
      join(defaultStateDir, 'ralph-state.json'),
      JSON.stringify({
        active: true,
        session_id: sessionId,
        prompt: 'Should not restore from default when OMAC_STATE_DIR is set',
        iteration: 1,
        max_iterations: 5,
      }),
    );

    // Run with OMAC_STATE_DIR pointing elsewhere — centralized location is empty
    const output = runHook(
      SESSION_START,
      { hook_event_name: 'SessionStart', session_id: sessionId, cwd: fakeProject },
      { OMAC_STATE_DIR: fakeStateDir },
    );

    const context = (output as { hookSpecificOutput?: { additionalContext?: string } })
      .hookSpecificOutput?.additionalContext ?? '';
    expect(context).not.toContain('[RALPH LOOP RESTORED]');
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 3. Custom OMAC_STATE_DIR — stop hook (persistent-mode.cjs)
  // ────────────────────────────────────────────────────────────────────────────

  it('stop hook blocks when active ralph state is in default .omac path (baseline)', () => {
    const sessionId = 'test-stop-default';
    const stateDir = join(fakeProject, '.omac', 'state', 'sessions', sessionId);
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(
      join(stateDir, 'ralph-state.json'),
      JSON.stringify({
        active: true,
        session_id: sessionId,
        prompt: 'Stop hook baseline task',
        iteration: 1,
        max_iterations: 5,
        started_at: new Date().toISOString(),
        last_checked_at: new Date().toISOString(),
      }),
    );

    const output = runHook(STOP_HOOK, {
      hook_event_name: 'Stop',
      session_id: sessionId,
      cwd: fakeProject,
    });

    expect(output.decision).toBe('block');
    expect(String(output.reason)).toContain('[RALPH LOOP');
  });

  it('stop hook blocks when active ralph state is in centralized OMAC_STATE_DIR path', () => {
    const sessionId = 'test-stop-centralized';
    const centralizedOmacRoot = getCentralizedOmacRoot(fakeProject, fakeStateDir);
    const stateDir = join(centralizedOmacRoot, 'state', 'sessions', sessionId);
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(
      join(stateDir, 'ralph-state.json'),
      JSON.stringify({
        active: true,
        session_id: sessionId,
        prompt: 'Stop hook centralized task',
        iteration: 1,
        max_iterations: 5,
        started_at: new Date().toISOString(),
        last_checked_at: new Date().toISOString(),
      }),
    );

    // No .omac in fakeProject — active state ONLY in centralized dir
    const output = runHook(
      STOP_HOOK,
      { hook_event_name: 'Stop', session_id: sessionId, cwd: fakeProject },
      { OMAC_STATE_DIR: fakeStateDir },
    );

    expect(output.decision).toBe('block');
    expect(String(output.reason)).toContain('[RALPH LOOP');
  });

  it('stop hook does NOT block when OMAC_STATE_DIR is set but state is only in default .omac', () => {
    const sessionId = 'test-stop-mismatch';
    // Place active state in default location only
    const defaultStateDir = join(fakeProject, '.omac', 'state', 'sessions', sessionId);
    mkdirSync(defaultStateDir, { recursive: true });
    writeFileSync(
      join(defaultStateDir, 'ralph-state.json'),
      JSON.stringify({
        active: true,
        session_id: sessionId,
        prompt: 'Should be invisible to centralized hook',
        iteration: 1,
        max_iterations: 5,
      }),
    );

    // Run stop hook with OMAC_STATE_DIR — centralized path is empty → no block
    const output = runHook(
      STOP_HOOK,
      { hook_event_name: 'Stop', session_id: sessionId, cwd: fakeProject },
      { OMAC_STATE_DIR: fakeStateDir },
    );

    expect(output.decision).not.toBe('block');
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 4. pre-tool-enforcer.mjs (PreToolUse hook) — follow-up to #2532
  //    Scenario: enforcer must read team-state and write skill-active-state
  //    from the same centralized OMAC_STATE_DIR location as sibling hooks.
  // ────────────────────────────────────────────────────────────────────────────

  it('pre-tool-enforcer injects [TEAM ROUTING REQUIRED] when team-state lives in default .omac (baseline)', () => {
    const sessionId = 'test-pte-team-default';
    const stateDir = join(fakeProject, '.omac', 'state', 'sessions', sessionId);
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(
      join(stateDir, 'team-state.json'),
      JSON.stringify({
        active: true,
        session_id: sessionId,
        team_name: 'alpha',
        current_phase: 'team-exec',
      }),
    );

    const output = runHook(PRE_TOOL_ENFORCER, {
      hook_event_name: 'PreToolUse',
      tool_name: 'Task',
      tool_input: { subagent_type: 'executor', description: 'sample task' },
      session_id: sessionId,
      cwd: fakeProject,
    });

    const context = (output as { hookSpecificOutput?: { additionalContext?: string } })
      .hookSpecificOutput?.additionalContext ?? '';
    expect(context).toContain('[TEAM ROUTING REQUIRED]');
    expect(context).toContain('alpha');
  });

  it('pre-tool-enforcer injects [TEAM ROUTING REQUIRED] when team-state lives in centralized OMAC_STATE_DIR', () => {
    const sessionId = 'test-pte-team-central';
    const centralizedOmacRoot = getCentralizedOmacRoot(fakeProject, fakeStateDir);
    const stateDir = join(centralizedOmacRoot, 'state', 'sessions', sessionId);
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(
      join(stateDir, 'team-state.json'),
      JSON.stringify({
        active: true,
        session_id: sessionId,
        team_name: 'beta',
        current_phase: 'team-exec',
      }),
    );

    // No .omac in fakeProject — active team-state ONLY in centralized dir
    const output = runHook(
      PRE_TOOL_ENFORCER,
      {
        hook_event_name: 'PreToolUse',
        tool_name: 'Task',
        tool_input: { subagent_type: 'executor', description: 'sample task' },
        session_id: sessionId,
        cwd: fakeProject,
      },
      { OMAC_STATE_DIR: fakeStateDir },
    );

    const context = (output as { hookSpecificOutput?: { additionalContext?: string } })
      .hookSpecificOutput?.additionalContext ?? '';
    expect(context).toContain('[TEAM ROUTING REQUIRED]');
    expect(context).toContain('beta');
  });

  it('pre-tool-enforcer ignores stale team-state in default .omac when OMAC_STATE_DIR is set', () => {
    const sessionId = 'test-pte-team-mismatch';
    // Place active team-state in default location only
    const stateDir = join(fakeProject, '.omac', 'state', 'sessions', sessionId);
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(
      join(stateDir, 'team-state.json'),
      JSON.stringify({
        active: true,
        session_id: sessionId,
        team_name: 'gamma',
        current_phase: 'team-exec',
      }),
    );

    // Run with OMAC_STATE_DIR pointing elsewhere — centralized path is empty → no redirect
    const output = runHook(
      PRE_TOOL_ENFORCER,
      {
        hook_event_name: 'PreToolUse',
        tool_name: 'Task',
        tool_input: { subagent_type: 'executor', description: 'sample task' },
        session_id: sessionId,
        cwd: fakeProject,
      },
      { OMAC_STATE_DIR: fakeStateDir },
    );

    const context = (output as { hookSpecificOutput?: { additionalContext?: string } })
      .hookSpecificOutput?.additionalContext ?? '';
    expect(context).not.toContain('[TEAM ROUTING REQUIRED]');
  });

  it('pre-tool-enforcer writes skill-active-state into the centralized OMAC_STATE_DIR path', () => {
    const sessionId = 'test-pte-skill-central';
    const centralizedOmacRoot = getCentralizedOmacRoot(fakeProject, fakeStateDir);

    runHook(
      PRE_TOOL_ENFORCER,
      {
        hook_event_name: 'PreToolUse',
        tool_name: 'Skill',
        // `skill` needs a non-'none' protection level. The OMAC-prefixed `skill`
        // slash-command maps to 'light' protection, which triggers the write.
        tool_input: { skill: 'oh-my-agent-connector:skill' },
        session_id: sessionId,
        cwd: fakeProject,
      },
      { OMAC_STATE_DIR: fakeStateDir },
    );

    const centralizedPath = join(
      centralizedOmacRoot,
      'state',
      'sessions',
      sessionId,
      'skill-active-state.json',
    );
    const defaultPath = join(
      fakeProject,
      '.omac',
      'state',
      'sessions',
      sessionId,
      'skill-active-state.json',
    );
    expect(existsSync(centralizedPath)).toBe(true);
    expect(existsSync(defaultPath)).toBe(false);
  });
});
