import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

const PACKAGE_ROOT = process.cwd();
const PACKAGE_JSON_PATH = join(PACKAGE_ROOT, 'package.json');

type PackageJson = {
  bin?: Record<string, string>;
  version?: string;
};

type NpmPackEntry = {
  path: string;
};

type NpmPackResult = {
  filename?: string;
  files?: NpmPackEntry[];
};

type PackedPackage = {
  files: Set<string>;
  packageJson: PackageJson;
};

const CONNECTOR_BIN_TARGET = './bin.mjs';
const RUNTIME_BIN_TARGET = 'bin/oh-my-agent-connector-runtime.js';
const BRIDGE_BIN_TARGET = 'bridge/cli.cjs';
const CONNECTOR_CLI_ALIASES = ['oh-my-agent-connector'] as const;
const RUNTIME_CLI_ALIASES = ['oh-my-agent-connector-runtime', 'omac'] as const;
const BRIDGE_CLI_ALIASES = ['omac-cli'] as const;

let packedPackageCache: PackedPackage | null = null;
let packDirCache: string | null = null;

function readPackageJson(): PackageJson {
  return JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf-8')) as PackageJson;
}

function getPackedPackage(): PackedPackage {
  if (packedPackageCache) {
    return packedPackageCache;
  }

  packDirCache = mkdtempSync(join(tmpdir(), 'omac-pack-metadata-'));
  const stdout = execFileSync(
    'npm',
    ['pack', '--pack-destination', packDirCache, '--json'],
    {
      cwd: PACKAGE_ROOT,
      encoding: 'utf-8',
    },
  );
  const results = JSON.parse(stdout) as NpmPackResult[];
  const tarballName = results[0]?.filename;

  if (!tarballName) {
    throw new Error('npm pack did not report a tarball filename');
  }

  execFileSync('tar', [
    '-xzf',
    join(packDirCache, basename(tarballName)),
    '-C',
    packDirCache,
    'package/package.json',
  ]);

  packedPackageCache = {
    files: new Set((results[0]?.files ?? []).map((file) => file.path)),
    packageJson: JSON.parse(
      readFileSync(join(packDirCache, 'package', 'package.json'), 'utf-8'),
    ) as PackageJson,
  };
  return packedPackageCache;
}

afterAll(() => {
  if (packDirCache) {
    rmSync(packDirCache, { recursive: true, force: true });
  }
});

function expectedNpmShimNames(binName: string): string[] {
  return [binName, `${binName}.cmd`, `${binName}.ps1`];
}

describe('npm package bin surface regression', () => {
  it('publishes the connector CLI and OMAC runtime CLI as separate new-brand entrypoints', () => {
    const packageJson = readPackageJson();

    for (const alias of CONNECTOR_CLI_ALIASES) {
      expect(packageJson.bin?.[alias]).toBe(CONNECTOR_BIN_TARGET);
    }
    for (const alias of RUNTIME_CLI_ALIASES) {
      expect(packageJson.bin?.[alias]).toBe(RUNTIME_BIN_TARGET);
    }
    for (const alias of BRIDGE_CLI_ALIASES) {
      expect(packageJson.bin?.[alias]).toBe(BRIDGE_BIN_TARGET);
    }
  });

  it('packs the connector CLI, runtime wrapper, and bundled bridge implementation', () => {
    const packedFiles = getPackedPackage().files;

    expect(packedFiles.has('bin.mjs')).toBe(true);
    expect(packedFiles.has(RUNTIME_BIN_TARGET)).toBe(true);
    expect(packedFiles.has(BRIDGE_BIN_TARGET)).toBe(true);
  });

  it('executes the OMAC runtime bin wrapper', () => {
    const stdout = execFileSync(
      process.execPath,
      [RUNTIME_BIN_TARGET, '--version'],
      {
        cwd: PACKAGE_ROOT,
        encoding: 'utf-8',
      },
    ).trim();

    expect(stdout).toBe(readPackageJson().version);
  });

  it('executes the agent-connector deployment CLI wrapper', () => {
    const stdout = execFileSync(
      process.execPath,
      [CONNECTOR_BIN_TARGET, '--version'],
      {
        cwd: PACKAGE_ROOT,
        encoding: 'utf-8',
      },
    ).trim();

    expect(stdout).toBe(`oh-my-agent-connector ${readPackageJson().version}`);
  });

  it('models npm shim generation for POSIX and Windows command names without installing globally', () => {
    const packageJson = readPackageJson();
    const runtimeBinNames = Object.entries(packageJson.bin ?? {})
      .filter(([, target]) => target === RUNTIME_BIN_TARGET)
      .map(([name]) => name)
      .sort();
    const connectorBinNames = Object.entries(packageJson.bin ?? {})
      .filter(([, target]) => target === CONNECTOR_BIN_TARGET)
      .map(([name]) => name)
      .sort();

    expect(connectorBinNames).toEqual([...CONNECTOR_CLI_ALIASES]);
    expect(runtimeBinNames).toEqual([...RUNTIME_CLI_ALIASES].sort());
    expect(
      Object.fromEntries(
        [...connectorBinNames, ...runtimeBinNames].map((name) => [
          name,
          expectedNpmShimNames(name),
        ]),
      ),
    ).toEqual({
      'oh-my-agent-connector': [
        'oh-my-agent-connector',
        'oh-my-agent-connector.cmd',
        'oh-my-agent-connector.ps1',
      ],
      'oh-my-agent-connector-runtime': [
        'oh-my-agent-connector-runtime',
        'oh-my-agent-connector-runtime.cmd',
        'oh-my-agent-connector-runtime.ps1',
      ],
      omac: ['omac', 'omac.cmd', 'omac.ps1'],
    });
  });

  it('keeps the packed package metadata aligned with the source bin aliases and installed npm shims', () => {
    const { packageJson: packedPackageJson } = getPackedPackage();

    for (const alias of CONNECTOR_CLI_ALIASES) {
      expect(packedPackageJson.bin?.[alias]).toBe(CONNECTOR_BIN_TARGET);
    }
    for (const alias of RUNTIME_CLI_ALIASES) {
      expect(packedPackageJson.bin?.[alias]).toBe(RUNTIME_BIN_TARGET);
    }

    const packedRuntimeBinNames = Object.entries(packedPackageJson.bin ?? {})
      .filter(([, target]) => target === RUNTIME_BIN_TARGET)
      .map(([name]) => name)
      .sort();
    const packedConnectorBinNames = Object.entries(packedPackageJson.bin ?? {})
      .filter(([, target]) => target === CONNECTOR_BIN_TARGET)
      .map(([name]) => name)
      .sort();

    expect(packedConnectorBinNames).toEqual([...CONNECTOR_CLI_ALIASES]);
    expect(packedRuntimeBinNames).toEqual([...RUNTIME_CLI_ALIASES].sort());
    expect(
      Object.fromEntries(
        [...packedConnectorBinNames, ...packedRuntimeBinNames].map((name) => [
          name,
          expectedNpmShimNames(name),
        ]),
      ),
    ).toEqual({
      'oh-my-agent-connector': [
        'oh-my-agent-connector',
        'oh-my-agent-connector.cmd',
        'oh-my-agent-connector.ps1',
      ],
      'oh-my-agent-connector-runtime': [
        'oh-my-agent-connector-runtime',
        'oh-my-agent-connector-runtime.cmd',
        'oh-my-agent-connector-runtime.ps1',
      ],
      omac: ['omac', 'omac.cmd', 'omac.ps1'],
    });
  });
});
