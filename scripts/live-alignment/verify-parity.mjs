#!/usr/bin/env node
import path from 'path';
import {
  DEFAULT_LIVE_URL,
  assertExpectedRoot,
  assertRepoFingerprint,
  defaultStateDir,
  firstMatch,
  getArg,
  getIntArg,
  getRepoRoot,
  hashBytes,
  netlifyApi,
  normalizeBaseUrl,
  parseArgs,
  readJson,
  toIsoUtc,
  writeJson
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
    return readJson(path.resolve(explicitManifestPath));
  }
  const pointerPath = path.join(stateDir, 'baseline-current.json');
  const pointer = await readJson(pointerPath);
  if (!pointer?.manifest_path) {
    throw new Error(`manifest_path mancante in ${pointerPath}`);
  }
  return readJson(String(pointer.manifest_path));
}

async function resolvePreviewUrl(stateDir, explicitPreviewUrl) {
  if (explicitPreviewUrl) {
    return normalizeBaseUrl(explicitPreviewUrl);
  }
  const previewPointer = await readJson(path.join(stateDir, 'preview-current.json'));
  const candidate = previewPointer?.preview_url || previewPointer?.permalink_url;
  if (!candidate) {
    throw new Error('preview url non trovata. Passa --preview-url oppure esegui clone-preview.');
  }
  return normalizeBaseUrl(String(candidate));
}

async function fetchSnapshot(baseUrl, routePath, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const url = `${baseUrl}${routePath}`;
  try {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'user-agent': 'bndo-live-alignment/1.0'
      }
    });
    const contentType = String(response.headers.get('content-type') || '');
    const body = await response.text();
    return {
      url,
      status: response.status,
      location: response.headers.get('location'),
      content_type: contentType,
      cache_control: response.headers.get('cache-control'),
      x_powered_by: response.headers.get('x-powered-by'),
      body
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchAssetSnapshot(baseUrl, assetPath, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const url = `${baseUrl}${assetPath}`;
  try {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'user-agent': 'bndo-live-alignment/1.0'
      }
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    return {
      url,
      status: response.status,
      location: response.headers.get('location'),
      content_type: response.headers.get('content-type'),
      hash_sha256: hashBytes(Buffer.from(bytes)),
      size: bytes.length
    };
  } finally {
    clearTimeout(timeout);
  }
}

function endpointParityReport(routePath, liveSnapshot, previewSnapshot) {
  const report = {
    route: routePath,
    live_status: liveSnapshot.status,
    preview_status: previewSnapshot.status,
    live_location: liveSnapshot.location,
    preview_location: previewSnapshot.location,
    status_match: liveSnapshot.status === previewSnapshot.status,
    location_match: (liveSnapshot.location || '') === (previewSnapshot.location || '')
  };

  if (routePath === '/login') {
    report.live_login_chunk = firstMatch(
      liveSnapshot.body,
      /\/_next\/static\/chunks\/app\/login\/page-[a-f0-9]+\.js/
    );
    report.preview_login_chunk = firstMatch(
      previewSnapshot.body,
      /\/_next\/static\/chunks\/app\/login\/page-[a-f0-9]+\.js/
    );
    report.live_layout_chunk = firstMatch(
      liveSnapshot.body,
      /\/_next\/static\/chunks\/app\/layout-[a-f0-9]+\.js/
    );
    report.preview_layout_chunk = firstMatch(
      previewSnapshot.body,
      /\/_next\/static\/chunks\/app\/layout-[a-f0-9]+\.js/
    );
    report.login_chunk_match = report.live_login_chunk === report.preview_login_chunk;
    report.layout_chunk_match = report.live_layout_chunk === report.preview_layout_chunk;
  }

  if (routePath === '/dashboard/pratiche') {
    report.live_next_redirect = liveSnapshot.body.includes('NEXT_REDIRECT');
    report.preview_next_redirect = previewSnapshot.body.includes('NEXT_REDIRECT');
    report.live_pratiche_chunk = firstMatch(
      liveSnapshot.body,
      /\/_next\/static\/chunks\/app\/dashboard\/pratiche\/page-[a-f0-9]+\.js/
    );
    report.preview_pratiche_chunk = firstMatch(
      previewSnapshot.body,
      /\/_next\/static\/chunks\/app\/dashboard\/pratiche\/page-[a-f0-9]+\.js/
    );
    report.pratiche_chunk_match = report.live_pratiche_chunk === report.preview_pratiche_chunk;
    report.next_redirect_match = report.live_next_redirect === report.preview_next_redirect;
  }

  report.ok = Object.entries(report)
    .filter(([key]) => key.endsWith('_match') || key === 'status_match' || key === 'location_match')
    .every(([, value]) => Boolean(value));

  return report;
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

  const stateDir = path.resolve(getArg(args, 'state-dir', defaultStateDir(repoRoot)));
  const timeoutMs = getIntArg(args, 'timeout-ms', 30_000);
  const strictLiveLock = parseBoolArg(args['strict-live-lock'], true);
  const liveUrl = normalizeBaseUrl(getArg(args, 'live-url', DEFAULT_LIVE_URL));
  const previewUrl = await resolvePreviewUrl(stateDir, getArg(args, 'preview-url'));
  const manifest = await loadManifest(stateDir, getArg(args, 'manifest'));
  const siteId = String(getArg(args, 'site-id', manifest?.site?.site_id || ''));
  if (!siteId) {
    throw new Error('site_id mancante: passa --site-id oppure usa un manifest valido');
  }

  const site = await netlifyApi('getSite', { site_id: siteId }, repoRoot);
  const liveDeployAtCheck = String(site?.published_deploy?.id || '');
  const baselineDeployId = String(manifest?.live?.deploy_id || '');
  const liveLockOk = liveDeployAtCheck === baselineDeployId;
  if (strictLiveLock && !liveLockOk) {
    throw new Error(
      [
        'Parity bloccata: live deploy cambiato rispetto al baseline.',
        `baseline: ${baselineDeployId}`,
        `live now: ${liveDeployAtCheck}`
      ].join('\n')
    );
  }

  const routes = ['/login', '/dashboard/pratiche'];
  const routeReports = [];
  for (const route of routes) {
    // eslint-disable-next-line no-await-in-loop
    const [liveSnapshot, previewSnapshot] = await Promise.all([
      fetchSnapshot(liveUrl, route, timeoutMs),
      fetchSnapshot(previewUrl, route, timeoutMs)
    ]);
    routeReports.push(endpointParityReport(route, liveSnapshot, previewSnapshot));
  }

  const praticheRoute = routeReports.find((item) => item.route === '/dashboard/pratiche');
  const loginRoute = routeReports.find((item) => item.route === '/login');
  const assetPathRaw =
    praticheRoute?.live_pratiche_chunk || loginRoute?.live_login_chunk || '/_next/static/chunks/main-app-f1851c1ea67b08ed.js';
  const assetPath = assetPathRaw.startsWith('/') ? assetPathRaw : `/${assetPathRaw}`;

  const [liveAsset, previewAsset] = await Promise.all([
    fetchAssetSnapshot(liveUrl, assetPath, timeoutMs),
    fetchAssetSnapshot(previewUrl, assetPath, timeoutMs)
  ]);
  const assetReport = {
    path: assetPath,
    live_status: liveAsset.status,
    preview_status: previewAsset.status,
    status_match: liveAsset.status === previewAsset.status,
    live_hash_sha256: liveAsset.hash_sha256,
    preview_hash_sha256: previewAsset.hash_sha256,
    hash_match: liveAsset.hash_sha256 === previewAsset.hash_sha256,
    live_size: liveAsset.size,
    preview_size: previewAsset.size,
    size_match: liveAsset.size === previewAsset.size
  };
  assetReport.ok = assetReport.status_match && assetReport.hash_match && assetReport.size_match;

  const allRoutesOk = routeReports.every((report) => report.ok);
  const parityOk = allRoutesOk && assetReport.ok;
  const report = {
    schema_version: 1,
    generated_at: toIsoUtc(),
    live_url: liveUrl,
    preview_url: previewUrl,
    baseline_deploy_id: baselineDeployId,
    live_deploy_id_at_check: liveDeployAtCheck,
    live_lock_ok: liveLockOk,
    strict_live_lock: strictLiveLock,
    endpoints: routeReports,
    asset: assetReport,
    ok: parityOk
  };

  const reportPath = path.join(stateDir, 'parity-report.json');
  await writeJson(reportPath, report);
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: report.ok,
        report_path: reportPath,
        live_lock_ok: report.live_lock_ok,
        endpoint_count: routeReports.length,
        asset_path: assetPath
      },
      null,
      2
    )}\n`
  );

  if (!report.ok) {
    process.exit(2);
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.stack || error?.message || String(error)}\n`);
  process.exit(1);
});
