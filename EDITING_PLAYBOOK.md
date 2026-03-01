# Editing Playbook

## Default editing order

1. Identify the feature first.
2. Change the feature entrypoint or internal implementation.
3. Touch the `app/` route wrapper only if the public route surface changes.
4. Move shared path/auth helpers into `shared/*` instead of duplicating them.

## Routing rules

- Keep route literals centralized in [`shared/config/routes.ts`](/Users/macbookdinatale/Documents/bndo-final/shared/config/routes.ts).
- Public shell exceptions for dashboard routes belong in [`shared/config/routes.ts`](/Users/macbookdinatale/Documents/bndo-final/shared/config/routes.ts) and [`components/dashboard/DashboardShellBoundary.tsx`](/Users/macbookdinatale/Documents/bndo-final/components/dashboard/DashboardShellBoundary.tsx).
- Do not add new route logic directly inside multiple components.

## Feature boundaries

- Import another feature through its `index.ts`, not through deep internal paths.
- Put reusable auth/Supabase wrappers in [`shared/api/index.ts`](/Users/macbookdinatale/Documents/bndo-final/shared/api/index.ts).
- Put reusable layout exports in [`shared/layouts/index.ts`](/Users/macbookdinatale/Documents/bndo-final/shared/layouts/index.ts).
- Keep generic UI exports in [`shared/ui/index.ts`](/Users/macbookdinatale/Documents/bndo-final/shared/ui/index.ts).

## Safe change workflow

1. Run `npm run build` inside [`bndo-final`](/Users/macbookdinatale/Documents/bndo-final).
2. Run `npm run typecheck` inside [`bndo-final`](/Users/macbookdinatale/Documents/bndo-final).
3. Use `npm run dev -- --port 3300` for daily development.
4. Use `npm run dev:clean -- --port 3300` only when you intentionally want to rebuild `.next` and local caches.
5. Use `npm run preview:stable` when you need final visual QA without HMR noise.
6. If `next dev` was already running during `build`, restart it before Playwright verify so dev output is regenerated cleanly.
7. From the workspace root, run `npm run qa:prepare`.
8. From the workspace root, run `npm run qa:verify`.
9. From the workspace root, run `npm run qa:diff`.
10. Treat any `BLOCKER` in [`runtime-verify/DIFF_REPORT.md`](/Users/macbookdinatale/Documents/runtime-verify/DIFF_REPORT.md) as a stop condition.

## Local recovery / chunk errors

Symptoms:
- Next dev shows `Cannot find module './XXXX.js'` from `.next/server/webpack-runtime.js`
- the browser renders the Next.js red server error overlay
- shell pages intermittently lose CSS or load only part of the UI after a restart

Probable cause:
- `.next` was deleted while the browser or HMR still referenced old chunk ids
- dev server state and generated artifacts drifted out of sync

Recovery steps:
1. Stop every `next dev` process running for [`bndo-final`](/Users/macbookdinatale/Documents/bndo-final).
2. Run `npm run clean` or `npm run clean:all` inside [`bndo-final`](/Users/macbookdinatale/Documents/bndo-final).
3. Restart with `npm run dev -- --port 3300`.
4. Hard refresh the browser page.
5. If the issue still appears, switch to `npm run preview:stable` and verify there.

## QA credentials

Set these env vars before verify:

- `TEST_CLIENT_EMAIL`
- `TEST_CLIENT_PASSWORD`
- `TEST_ADMIN_EMAIL`
- `TEST_ADMIN_PASSWORD`

The helper scripts in [`runtime-tools`](/Users/macbookdinatale/Documents/runtime-tools) provision and reseed these accounts against [`bndo-final`](/Users/macbookdinatale/Documents/bndo-final) on `http://localhost:3300`.

## When editing scanner/chat

- Shell UI behavior must stay aligned with the public shell from `New project 2`.
- If you touch scan matching, verify both `/dashboard/scanner` shell rendering and `/api/scan-bandi`.
- Do not hardcode external origins in components when a helper already exists in `shared/config/routes.ts`.
