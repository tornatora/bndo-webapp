#!/usr/bin/env node
import path from 'path';
import {
  defaultStateDir,
  getArg,
  getRepoRoot,
  parseArgs,
  parsePossiblyNoisyJson,
  runCommand
} from './shared.mjs';

async function runNodeScript(scriptPath, flags, cwd) {
  const args = [scriptPath, ...flags];
  const output = await runCommand(process.execPath, args, { cwd });
  return parsePossiblyNoisyJson(output);
}

function pushFlag(flags, key, value) {
  if (value === undefined || value === null || value === '') return;
  flags.push(`--${key}`, String(value));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = await getRepoRoot(process.cwd());
  const stateDir = path.resolve(getArg(args, 'state-dir', defaultStateDir(repoRoot)));
  const expectedRoot = getArg(args, 'expected-root', repoRoot);
  const siteId = getArg(args, 'site-id');
  const alias = getArg(args, 'alias', 'live-current-preview');
  const timeoutMs = getArg(args, 'timeout-ms');

  const commonFlags = [];
  pushFlag(commonFlags, 'state-dir', stateDir);
  pushFlag(commonFlags, 'expected-root', expectedRoot);
  pushFlag(commonFlags, 'site-id', siteId);
  pushFlag(commonFlags, 'timeout-ms', timeoutMs);

  const syncResult = await runNodeScript(
    path.join(repoRoot, 'scripts/live-alignment/sync-baseline.mjs'),
    commonFlags,
    repoRoot
  );

  const cloneFlags = [...commonFlags];
  pushFlag(cloneFlags, 'alias', alias);
  if (args['allow-function-fallback'] !== undefined) {
    pushFlag(cloneFlags, 'allow-function-fallback', args['allow-function-fallback']);
  }
  const cloneResult = await runNodeScript(
    path.join(repoRoot, 'scripts/live-alignment/clone-preview.mjs'),
    cloneFlags,
    repoRoot
  );

  const verifyResult = await runNodeScript(
    path.join(repoRoot, 'scripts/live-alignment/verify-parity.mjs'),
    commonFlags,
    repoRoot
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: Boolean(syncResult?.ok && cloneResult?.ok && verifyResult?.ok),
        sync: syncResult,
        clone: cloneResult,
        verify: verifyResult
      },
      null,
      2
    )}\n`
  );
}

main().catch((error) => {
  process.stderr.write(`${error?.stack || error?.message || String(error)}\n`);
  process.exit(1);
});
