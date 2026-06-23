import { describe, expect, it } from 'vitest';
import {
  formatOmacCliInvocation,
  resolveOmacCliPrefix,
  rewriteOmacCliInvocations,
} from '../utils/omac-cli-rendering.js';

describe('omac CLI rendering', () => {
  it('uses omac when the binary is available', () => {
    expect(resolveOmacCliPrefix({ omacAvailable: true, env: {} as NodeJS.ProcessEnv })).toBe('omac');
    expect(formatOmacCliInvocation('team api claim-task', { omacAvailable: true, env: {} as NodeJS.ProcessEnv }))
      .toBe('omac team api claim-task');
  });

  it('falls back to the plugin bridge when omac is unavailable but CLAUDE_PLUGIN_ROOT is set', () => {
    const env = { CLAUDE_PLUGIN_ROOT: '/tmp/plugin-root' } as NodeJS.ProcessEnv;
    expect(resolveOmacCliPrefix({ omacAvailable: false, env }))
      .toBe('node "$CLAUDE_PLUGIN_ROOT"/bridge/cli.cjs');
    expect(formatOmacCliInvocation('autoresearch --mission "m"', { omacAvailable: false, env }))
      .toBe('node "$CLAUDE_PLUGIN_ROOT"/bridge/cli.cjs autoresearch --mission "m"');
  });

  it('rewrites inline and list-form omac commands for plugin installs', () => {
    const env = { CLAUDE_PLUGIN_ROOT: '/tmp/plugin-root' } as NodeJS.ProcessEnv;
    const input = [
      'Run `omac autoresearch --mission "m" --eval "e"`.',
      '- omac team api claim-task --input \'{}\' --json',
      '> omac ask codex --agent-prompt critic "check"',
    ].join('\n');

    const output = rewriteOmacCliInvocations(input, { omacAvailable: false, env });

    expect(output).toContain('`node "$CLAUDE_PLUGIN_ROOT"/bridge/cli.cjs autoresearch --mission "m" --eval "e"`');
    expect(output).toContain('- node "$CLAUDE_PLUGIN_ROOT"/bridge/cli.cjs team api claim-task --input \'{}\' --json');
    expect(output).toContain('> node "$CLAUDE_PLUGIN_ROOT"/bridge/cli.cjs ask codex --agent-prompt critic "check"');
  });

  it('routes ask invocations through the plugin bridge inside an active Claude session when CLAUDE_PLUGIN_ROOT is set', () => {
    const env = {
      CLAUDE_PLUGIN_ROOT: '/tmp/plugin-root',
      CLAUDECODE: '1',
      CLAUDE_SESSION_ID: 'session-123',
    } as NodeJS.ProcessEnv;

    expect(resolveOmacCliPrefix({ omacAvailable: false, env })).toBe('node "$CLAUDE_PLUGIN_ROOT"/bridge/cli.cjs');
    expect(formatOmacCliInvocation('ask codex --prompt "check"', { omacAvailable: false, env }))
      .toBe('node "$CLAUDE_PLUGIN_ROOT"/bridge/cli.cjs ask codex --prompt "check"');

    const input = [
      'Run `omac ask codex "review"`.',
      '> omac ask gemini --prompt "improve docs"',
    ].join('\n');

    const output = rewriteOmacCliInvocations(input, { omacAvailable: false, env });
    expect(output).toContain('`node "$CLAUDE_PLUGIN_ROOT"/bridge/cli.cjs ask codex "review"`');
    expect(output).toContain('> node "$CLAUDE_PLUGIN_ROOT"/bridge/cli.cjs ask gemini --prompt "improve docs"');
  });

  it('leaves text unchanged when omac remains the selected prefix', () => {
    const input = 'Use `omac team status demo` and\nomac team wait demo';
    expect(rewriteOmacCliInvocations(input, { omacAvailable: true, env: {} as NodeJS.ProcessEnv })).toBe(input);
  });
});
