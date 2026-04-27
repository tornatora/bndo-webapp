#!/usr/bin/env node
import path from 'path';
import {
  assertExpectedRoot,
  assertRepoFingerprint,
  assertWorkspaceClean,
  defaultStateDir,
  getArg,
  getIntArg,
  getRepoRoot,
  netlifyApi,
  parseArgs,
  pickPreviewUrlFromDeploy,
  readJson,
  resolveSiteId,
  sanitizeAlias,
  toIsoUtc,
  todayStamp,
  waitForDeployReady,
  writeJson,
  writeText
} from './shared.mjs';

function parseBoolArg(value, fallback) {
  if (value === undefined) return fallback;
  if (value === true) return true;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no') return false;
  return fallback;
}

async function loadManifest(stateDir, explicitManifestPath) {
  if (explicitManifestPath) {
    const manifestPath = path.resolve(explicitManifestPath);
    return { manifest: await readJson(manifestPath), manifestPath };
  }
  const pointerPath = path.join(stateDir, 'baseline-current.json');
  const pointer = await readJson(pointerPath);
  if (!pointer?.manifest_path) {
    throw new Error(`manifest_path mancante in ${pointerPath}`);
  }
  const manifestPath = String(pointer.manifest_path);
  return { manifest: await readJson(manifestPath), manifestPath };
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const repoRoot = await getRepoRoot(cwd);

  const expectedRoot = getArg(args, 'expected-root');
  if (expectedRoot) {
    await assertExpectedRoot(repoRoot, expectedRoot);
  }

  await assertRepoFingerprint(repoRoot);
  const allowDirty = parseBoolArg(args['allow-dirty'], false);
  if (!allowDirty) {
    await assertWorkspaceClean(repoRoot);
  }

  const stateDir = path.resolve(getArg(args, 'state-dir', defaultStateDir(repoRoot)));
  const { manifest, manifestPath } = await loadManifest(stateDir, getArg(args, 'manifest'));
  const siteId = await resolveSiteId(repoRoot, getArg(args, 'site-id') || manifest?.site?.site_id);
  const baselineDeployId = String(manifest?.live?.deploy_id || '');
  if (!baselineDeployId) {
    throw new Error('baseline deploy id mancante nel manifest');
  }

  const currentSite = await netlifyApi('getSite', { site_id: siteId }, repoRoot);
  const currentLiveDeployId = String(currentSite?.published_deploy?.id || '');
  if (!currentLiveDeployId) {
    throw new Error(`Impossibile leggere il deploy live corrente per site_id=${siteId}`);
  }
  if (currentLiveDeployId !== baselineDeployId) {
    throw new Error(
      [
        'Blocco baseline mismatch attivo.',
        `Baseline manifest deploy: ${baselineDeployId}`,
        `Live corrente deploy:    ${currentLiveDeployId}`,
        'Riesegui prima sync-baseline.'
      ].join('\n')
    );
  }

  const alias = sanitizeAlias(getArg(args, 'alias', 'live-current-preview'));
  const timeoutMs = getIntArg(args, 'timeout-ms', 240_000);
  const allowFunctionFallback = parseBoolArg(args['allow-function-fallback'], true);
  const title = getArg(args, 'title', `clone-live-${baselineDeployId.slice(0, 8)}`);
  const historyDir = path.join(stateDir, 'preview-history');
  const previewPointerPath = path.join(stateDir, 'preview-current.json');
  const currentPreviewUrlPath = path.join(stateDir, 'current-preview-url.txt');

  const files = await readJson(String(manifest?.file_map?.path));
  const functionDigests = await readJson(String(manifest?.function_map?.digest_path));

  const createResponse = await netlifyApi(
    'createSiteDeploy',
    {
      site_id: siteId,
      title,
      body: {
        draft: true,
        branch: alias
      }
    },
    repoRoot
  );

  let deployId = String(createResponse?.id || '');
  let discardedDeployId = '';
  if (!deployId) {
    throw new Error('createSiteDeploy non ha restituito deploy id');
  }

  let cloneMode = 'files_and_functions';
  let functionFallbackUsed = false;
  let updateResponse = await netlifyApi(
    'updateSiteDeploy',
    {
      site_id: siteId,
      deploy_id: deployId,
      body: {
        files,
        functions: functionDigests,
        draft: true,
        branch: alias
      }
    },
    repoRoot
  );

  const requiredFiles = ensureArray(updateResponse?.required);
  if (requiredFiles.length > 0) {
    throw new Error(
      `Clone bloccato: deploy ${deployId} richiede upload di ${requiredFiles.length} file`
    );
  }

  const requiredFunctions = ensureArray(updateResponse?.required_functions);
  if (requiredFunctions.length > 0) {
    if (!allowFunctionFallback) {
      throw new Error(
        [
          'Clone bloccato: Netlify richiede upload funzioni e fallback disattivato.',
          `required_functions: ${requiredFunctions.join(', ')}`
        ].join('\n')
      );
    }
    functionFallbackUsed = true;
    cloneMode = 'files_only_fallback';
    discardedDeployId = deployId;

    const fallbackCreateResponse = await netlifyApi(
      'createSiteDeploy',
      {
        site_id: siteId,
        title: `${title}-files-only`,
        body: {
          draft: true,
          branch: alias
        }
      },
      repoRoot
    );
    deployId = String(fallbackCreateResponse?.id || '');
    if (!deployId) {
      throw new Error('createSiteDeploy fallback non ha restituito deploy id');
    }

    updateResponse = await netlifyApi(
      'updateSiteDeploy',
      {
        site_id: siteId,
        deploy_id: deployId,
        body: {
          files,
          draft: true,
          branch: alias
        }
      },
      repoRoot
    );

    const fallbackRequiredFiles = ensureArray(updateResponse?.required);
    const fallbackRequiredFunctions = ensureArray(updateResponse?.required_functions);
    if (fallbackRequiredFiles.length > 0 || fallbackRequiredFunctions.length > 0) {
      throw new Error(
        [
          'Clone fallback bloccato: deploy richiede ancora upload manuale.',
          `required files: ${fallbackRequiredFiles.length}`,
          `required functions: ${fallbackRequiredFunctions.length}`
        ].join('\n')
      );
    }
  }

  const readyDeploy = await waitForDeployReady({
    deployId,
    cwd: repoRoot,
    timeoutMs
  });

  const previewUrl = pickPreviewUrlFromDeploy(readyDeploy);
  const permalink = String(readyDeploy?.links?.permalink || readyDeploy?.deploy_ssl_url || '');
  const aliasLooksStable = Boolean(previewUrl && previewUrl.includes(`${alias}--`));
  const urlPolicy = aliasLooksStable ? 'stable_alias' : 'unique_permalink_fallback';

  const previewRecord = {
    schema_version: 1,
    created_at: toIsoUtc(),
    state_dir: stateDir,
    manifest_deploy_id: baselineDeployId,
    live_checked_deploy_id: currentLiveDeployId,
    site_id: siteId,
    deploy_id: deployId,
    discarded_deploy_id: discardedDeployId || undefined,
    deploy_state: String(readyDeploy?.state || ''),
    clone_mode: cloneMode,
    function_fallback_used: functionFallbackUsed,
    requested_function_count: Object.keys(functionDigests).length,
    deployed_function_count: ensureArray(readyDeploy?.available_functions).length,
    requested_file_count: Object.keys(files).length,
    alias_requested: alias,
    url_policy: urlPolicy,
    preview_url: previewUrl,
    permalink_url: permalink,
    manifest_path: manifestPath,
    source_manifest: manifest
  };

  const historyPath = path.join(stateDir, 'preview-history', `${todayStamp()}.json`);
  await writeJson(historyPath, previewRecord);
  await writeJson(previewPointerPath, previewRecord);
  await writeText(currentPreviewUrlPath, `${previewUrl || permalink}\n`);

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        deploy_id: deployId,
        preview_url: previewUrl || permalink,
        clone_mode: cloneMode,
        function_fallback_used: functionFallbackUsed,
        url_policy: urlPolicy,
        history_path: historyPath,
        pointer_path: previewPointerPath
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
