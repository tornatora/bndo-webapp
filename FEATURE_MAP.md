# Feature Map

| Funzione | Cartella principale | Route principali | Note |
| --- | --- | --- | --- |
| Public shell + chat AI | `features/chat`, `components/chat`, `components/views` | `/`, `/dashboard/home`, `/dashboard/chat`, `/grants/[id]` | UI shell finale presa da `New project 2` |
| Auth | `features/auth`, `app/login`, `app/api/auth/*`, `lib/auth*` | `/login`, `/register`, `/forgot-password`, `/reset-password` | Login cliente/admin condividono lo stesso entrypoint |
| Quiz | `features/quiz`, `app/quiz`, `lib/quiz` | `/quiz`, `/quiz/autoimpiego`, `/api/quiz/submit` | Redirect index -> autoimpiego |
| Dashboard cliente | `features/dashboard-client`, `components/dashboard`, `app/dashboard/*` | `/dashboard`, `/dashboard/documents`, `/dashboard/messages`, `/dashboard/profile`, `/dashboard/practices/[applicationId]` | `/dashboard` è pubblico da anonimo e passa alla dashboard cliente protetta quando esiste una sessione valida |
| Dashboard admin | `features/dashboard-admin`, `components/admin`, `app/admin/*` | `/admin`, `/admin/clients/[companyId]` | Supporta `MOCK_BACKEND=true` oppure Supabase live |
| Scanner bandi | `features/scanner`, `components/views`, `app/api/scan-bandi`, `lib/scannerApiClient.ts` | `/dashboard/scanner`, `/dashboard/scanner-bandi`, `/dashboard/bandi`, `/api/scan-bandi` | Integrazione scanner migrata da `Scanner Bandi pro` |
| Shared routing/config | `shared/config`, `shared/api`, `shared/layouts`, `shared/lib`, `shared/types`, `shared/ui` | usato da tutte le feature | Punto unico per route map, wrapper auth/Supabase e shell |

## Route wrappers

These app routes now delegate to feature entrypoints:

- [`app/page.tsx`](/Users/macbookdinatale/Documents/bndo-final/app/page.tsx)
- [`app/login/page.tsx`](/Users/macbookdinatale/Documents/bndo-final/app/login/page.tsx)
- [`app/quiz/page.tsx`](/Users/macbookdinatale/Documents/bndo-final/app/quiz/page.tsx)
- [`app/quiz/autoimpiego/page.tsx`](/Users/macbookdinatale/Documents/bndo-final/app/quiz/autoimpiego/page.tsx)
- [`app/dashboard/layout.tsx`](/Users/macbookdinatale/Documents/bndo-final/app/dashboard/layout.tsx)
- [`app/dashboard/page.tsx`](/Users/macbookdinatale/Documents/bndo-final/app/dashboard/page.tsx)
- [`app/dashboard/[...slug]/page.tsx`](/Users/macbookdinatale/Documents/bndo-final/app/dashboard/[...slug]/page.tsx)
- [`app/admin/layout.tsx`](/Users/macbookdinatale/Documents/bndo-final/app/admin/layout.tsx)
- [`app/admin/page.tsx`](/Users/macbookdinatale/Documents/bndo-final/app/admin/page.tsx)

## Source mapping used for the merge

- Shell/UI baseline source: [`New project 2`](/Users/macbookdinatale/Documents/New%20project%202)
- Legacy auth/quiz/client/admin source: [`New project`](/Users/macbookdinatale/Documents/New%20project)
- Scanner source: [`Scanner Bandi pro`](/Users/macbookdinatale/Documents/Scanner%20Bandi%20pro)
