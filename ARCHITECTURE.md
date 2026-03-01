# BNDO Final Architecture

`/Users/macbookdinatale/Documents/bndo-final` is the merged codebase built from three local sources:

- `SHELL_PATH`: `/Users/macbookdinatale/Documents/New project 2`
- `LEGACY_PATH`: `/Users/macbookdinatale/Documents/New project`
- `SCANNER_PATH`: `/Users/macbookdinatale/Documents/Scanner Bandi pro`

## Why `LEGACY_PATH = New project`

The correct legacy source is the root of [`New project`](/Users/macbookdinatale/Documents/New%20project), not a nested subfolder.

- It is the app actually serving the protected legacy flows on port `3000`.
- Its route surface matches the baseline capture: `/login`, `/dashboard`, `/dashboard/documents`, `/dashboard/messages`, `/dashboard/profile`, `/admin`, `/admin/clients/[companyId]`.
- It contains the Supabase-backed auth, admin APIs, quiz submission flow, customer dashboard pages, and related server actions used by those views.
- The baseline client/admin captures line up with its DOM structure and data model, while [`New project 2`](/Users/macbookdinatale/Documents/New%20project%202) provides the public shell, home, chat framing, sidebar, and scanner-oriented UI shell.

## Merge strategy

- Base shell copied from [`New project 2`](/Users/macbookdinatale/Documents/New%20project%202).
- Legacy routes, API handlers, Supabase helpers, and protected views copied from [`New project`](/Users/macbookdinatale/Documents/New%20project).
- Scanner-specific UI and API integration copied from [`Scanner Bandi pro`](/Users/macbookdinatale/Documents/Scanner%20Bandi%20pro).
- Final routing and imports normalized so `bndo-final` does not import from external project folders.

## Current layout

```text
app/              Next.js App Router route wrappers
features/         Feature public APIs and route-level entrypoints
shared/           Shared config, API wrappers, layouts, UI exports, types
components/       Existing merged UI implementations
lib/              Existing merged domain/services logic
supabase/         SQL and migration assets
public/           Static assets
```

## Feature boundaries

- `features/auth`: login entrypoint and auth-facing route wrappers.
- `features/quiz`: quiz public API and index redirect.
- `features/dashboard-client`: protected client dashboard layout and route entrypoints.
- `features/dashboard-admin`: admin layout and main admin page.
- `features/chat`: public shell home/chat entrypoint.
- `features/scanner`: scanner public exports consumed by chat/shell flows.

## Shared layer

- `shared/config/routes.ts`: route map, dashboard shell path rules, auth origin helpers.
- `shared/api`: Supabase/auth wrappers re-exported from local app code.
- `shared/layouts`: shell layout exports.
- `shared/ui`: generic reusable UI exports.
- `shared/lib`: site URLs, legal constants, support URLs, role helpers.
- `shared/types`: app-wide type exports.

## Runtime model

- Public marketing/chat shell renders through the shell UI inherited from [`New project 2`](/Users/macbookdinatale/Documents/New%20project%202).
- Anonymous `/dashboard`, `/dashboard/home`, `/dashboard/chat`, `/dashboard/scanner`, `/dashboard/scanner-bandi`, and `/dashboard/bandi` stay in the public shell flow.
- Authenticated `/dashboard` switches to the protected customer dashboard entrypoint inside the client shell/sidebar.
- Authenticated customer routes render inside the client dashboard shell/sidebar.
- Admin routes render through the admin layout and use Supabase or mock backend mode.
- Scanner bandi is exposed through the shell/chat flow and `/api/scan-bandi`.

## Guardrails

- Route files in `app/` should stay thin and delegate to `features/*`.
- Cross-feature access should happen through each feature `index.ts`.
- Route/path constants should live in `shared/config/routes.ts`.
- No imports should point back to the original source folders.
