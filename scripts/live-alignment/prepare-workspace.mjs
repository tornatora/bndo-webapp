#!/usr/bin/env node
import path from 'path';
import {
  assertExpectedRoot,
  assertRepoFingerprint,
  assertWorkspaceClean,
  defaultStateDir,
  fileExists,
  getArg,
  getGitBranch,
  getGitHead,
  getGitRemoteOriginUrl,
  getRepoRoot,
  parseArgs,
  runCommand,
  toIsoUtc,
  todayStamp,
  writeJson
} from './shared.mjs';

async function ensureGitRepo(targetPath) {
  const gitDir = path.join(targetPath, '.git');
  if (!(await fileExists(gitDir))) {
    throw new Error(`${targetPath} esiste ma non è una repo git valida`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const sourceRoot = await getRepoRoot(cwd);
  const expectedRoot = getArg(args, 'expected-root');
  if (expectedRoot) {
    await assertExpectedRoot(sourceRoot, expectedRoot);
  }

  await assertRepoFingerprint(sourceRoot);
  const sourceOrigin = await getGitRemoteOriginUrl(sourceRoot);
  if (!sourceOrigin) {
    throw new Error('remote.origin.url mancante nella repo sorgente');
  }

  const branch = getArg(args, 'branch', 'main');
  const defaultTarget = path.join(path.dirname(sourceRoot), `${path.basename(sourceRoot)}-live`);
  const targetPath = path.resolve(getArg(args, 'target', defaultTarget));
  const targetExists = await fileExists(targetPath);

  if (!targetExists) {
    await runCommand('git', ['clone', sourceOrigin, targetPath], { cwd: sourceRoot });
  } else {
    await ensureGitRepo(targetPath);
  }

  await assertWorkspaceClean(targetPath);
  const targetOrigin = await getGitRemoteOriginUrl(targetPath);
  if (!targetOrigin || !targetOrigin.includes('tornatora/bndo-webapp')) {
    throw new Error(
      [
        'Workspace target non allineato al repository previsto.',
        `target origin: ${targetOrigin || '(vuoto)'}`,
        'atteso: contiene tornatora/bndo-webapp'
      ].join('\n')
    );
  }

  await runCommand('git', ['fetch', 'origin', '--prune'], { cwd: targetPath });
  await runCommand('git', ['checkout', branch], { cwd: targetPath });
  await runCommand('git', ['pull', '--ff-only', 'origin', branch], { cwd: targetPath });
  await assertWorkspaceClean(targetPath);

  const [sourceHead, sourceBranch, targetHead, targetBranch] = await Promise.all([
    getGitHead(sourceRoot),
    getGitBranch(sourceRoot),
    getGitHead(targetPath),
    getGitBranch(targetPath)
  ]);

  const stateDir = defaultStateDir(targetPath);
  const snapshot = {
    schema_version: 1,
    generated_at: toIsoUtc(),
    source: {
      root: sourceRoot,
      branch: sourceBranch,
      head: sourceHead,
      origin: sourceOrigin
    },
    target: {
      root: targetPath,
      branch: targetBranch,
      head: targetHead,
      origin: targetOrigin
    }
  };

  const snapshotPath = path.join(stateDir, 'workspace-snapshots', `${todayStamp()}.json`);
  const pointerPath = path.join(stateDir, 'workspace-current.json');
  await writeJson(snapshotPath, snapshot);
  await writeJson(pointerPath, snapshot);

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        target_root: targetPath,
        target_branch: targetBranch,
        target_head: targetHead,
        snapshot_path: snapshotPath,
        pointer_path: pointerPath
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
