import { spawnSync } from 'child_process';

const OMAC_CLI_BINARY = 'omac';
const OMAC_PLUGIN_BRIDGE_PREFIX = 'node "$CLAUDE_PLUGIN_ROOT"/bridge/cli.cjs';

export interface OmacCliRenderOptions {
  env?: NodeJS.ProcessEnv;
  omacAvailable?: boolean;
}

function commandExists(command: string, env: NodeJS.ProcessEnv): boolean {
  const lookupCommand = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(lookupCommand, [command], {
    stdio: 'ignore',
    env,
  });
  return result.status === 0;
}

export function resolveOmacCliPrefix(options: OmacCliRenderOptions = {}): string {
  const env = options.env ?? process.env;
  const omacAvailable = options.omacAvailable ?? commandExists(OMAC_CLI_BINARY, env);
  if (omacAvailable) {
    return OMAC_CLI_BINARY;
  }

  const pluginRoot = typeof env.CLAUDE_PLUGIN_ROOT === 'string' ? env.CLAUDE_PLUGIN_ROOT.trim() : '';
  if (pluginRoot) {
    return OMAC_PLUGIN_BRIDGE_PREFIX;
  }

  return OMAC_CLI_BINARY;
}

function resolveInvocationPrefix(
  commandSuffix: string,
  options: OmacCliRenderOptions = {},
): string {
  void commandSuffix;
  return resolveOmacCliPrefix(options);
}

export function formatOmacCliInvocation(
  commandSuffix: string,
  options: OmacCliRenderOptions = {},
): string {
  const suffix = commandSuffix.trim().replace(/^omac\s+/, '');
  return `${resolveInvocationPrefix(suffix, options)} ${suffix}`.trim();
}

export function rewriteOmacCliInvocations(
  text: string,
  options: OmacCliRenderOptions = {},
): string {
  if (!text.includes('omac ')) {
    return text;
  }

  return text
    .replace(/`omac ([^`\r\n]+)`/g, (_match, suffix: string) => {
      const prefix = resolveInvocationPrefix(suffix, options);
      return `\`${prefix} ${suffix}\``;
    })
    .replace(/(^|\n)([ \t>*-]*)omac ([^\n]+)/g, (_match, lineStart: string, leader: string, suffix: string) => {
      const prefix = resolveInvocationPrefix(suffix, options);
      return `${lineStart}${leader}${prefix} ${suffix}`;
    });
}
