#!/usr/bin/env node
import path from 'path';
import {
  DEFAULT_LIVE_URL,
  assertExpectedRoot,
  assertRepoFingerprint,
  assertWorkspaceClean,
  buildFileMap,
  buildFunctionMaps,
  defaultStateDir,
  getArg,
  getGitBranch,
  getGitHead,
  getRepoRoot,
  hashJson,
  netlifyApi,
  normalizeBaseUrl,
  parseArgs,
  resolveSiteId,
  toIsoUtc,
  writeJson
} from './shared.mjs';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const repoRoot = await getRepoRoot(cwd);
  const expectedRoot = getArg(args, 'expected-root');
  if (expectedRoot) {
    await assertExpectedRoot(repoRoot, expectedRoot);
  }

  await assertRepoFingerprint(repoRoot);
  const allowDirty = args['allow-dirty'] === true;
  if (!allowDirty) {
    await assertWorkspaceClean(repoRoot);
  }

  const siteId = await resolveSiteId(repoRoot, getArg(args, 'site-id'));
  const stateDir = path.resolve(getArg(args, 'state-dir', defaultStateDir(repoRoot)));
  const liveUrl = normalizeBaseUrl(getArg(args, 'live-url', DEFAULT_LIVE_URL));

  const site = await netlifyApi('getSite', { site_id: siteId }, repoRoot);
  const published = site?.published_deploy;
  if (!published?.id) {
    throw new Error(`Deploy live non trovato per site_id=${siteId}`);
  }

  const baselineDeployId = String(published.id);
  const [liveDeploy, siteFiles, gitHead, gitBranch] = await Promise.all([
    netlifyApi('getDeploy', { deploy_id: baselineDeployId }, repoRoot),
    netlifyApi('listSiteFiles', { site_id: siteId }, repoRoot),
    getGitHead(repoRoot),
    getGitBranch(repoRoot)
  ]);

  const files = buildFileMap(siteFiles);
  const functionMaps = buildFunctionMaps(liveDeploy?.available_functions);
  const fileDeployIds = Array.from(
    new Set(siteFiles.map((entry) => String(entry.deploy_id || '')).filter(Boolean))
  ).sort();

  const filesPath = path.join(stateDir, 'baseline-files-map.json');
  const functionsDigestPath = path.join(stateDir, 'baseline-functions-digest-map.json');
  const functionsIdPath = path.join(stateDir, 'baseline-functions-id-map.json');
  const functionsOidPath = path.join(stateDir, 'baseline-functions-oid-map.json');
  const functionsRuntimePath = path.join(stateDir, 'baseline-functions-runtime-map.json');
  const functionsSizePath = path.join(stateDir, 'baseline-functions-size-map.json');
  const manifestPath = path.join(stateDir, 'baseline-manifest.json');
  const pointerPath = path.join(stateDir, 'baseline-current.json');

  const manifest = {
    schema_version: 1,
    source: 'live_published_deploy',
    captured_at: toIsoUtc(),
    repository: {
      root: repoRoot,
      branch: gitBranch,
      head: gitHead
    },
    site: {
      site_id: String(site.id || siteId),
      name: String(site.name || ''),
      custom_domain: String(site.custom_domain || ''),
      url: String(site.ssl_url || site.url || '')
    },
    live: {
      baseline_url: liveUrl,
      deploy_id: baselineDeployId,
      deploy_title: String(published.title || liveDeploy?.title || ''),
      deploy_source: String(liveDeploy?.deploy_source || published.deploy_source || ''),
      context: String(liveDeploy?.context || published.context || ''),
      published_at: String(published.published_at || liveDeploy?.published_at || ''),
      created_at: String(liveDeploy?.created_at || '')
    },
    file_map: {
      file_count: Object.keys(files).length,
      deploy_ids_seen: fileDeployIds,
      hash_sha256: hashJson(files),
      path: filesPath
    },
    function_map: {
      function_count: Object.keys(functionMaps.digestByName).length,
      digest_hash_sha256: hashJson(functionMaps.digestByName),
      id_hash_sha256: hashJson(functionMaps.idByName),
      oid_hash_sha256: hashJson(functionMaps.oidByName),
      digest_path: functionsDigestPath,
      id_path: functionsIdPath,
      oid_path: functionsOidPath,
      runtime_path: functionsRuntimePath,
      size_path: functionsSizePath
    }
  };

  await writeJson(filesPath, files);
  await writeJson(functionsDigestPath, functionMaps.digestByName);
  await writeJson(functionsIdPath, functionMaps.idByName);
  await writeJson(functionsOidPath, functionMaps.oidByName);
  await writeJson(functionsRuntimePath, functionMaps.runtimeByName);
  await writeJson(functionsSizePath, functionMaps.sizeByName);
  await writeJson(manifestPath, manifest);
  await writeJson(pointerPath, {
    updated_at: toIsoUtc(),
    manifest_path: manifestPath,
    baseline_deploy_id: baselineDeployId
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        manifest_path: manifestPath,
        baseline_deploy_id: baselineDeployId,
        file_count: manifest.file_map.file_count,
        function_count: manifest.function_map.function_count,
        file_hash: manifest.file_map.hash_sha256,
        function_digest_hash: manifest.function_map.digest_hash_sha256
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
