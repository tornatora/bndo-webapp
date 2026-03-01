# Netlify Go-Live

## Staging first

1. Crea un nuovo site Netlify temporaneo puntando a [`/Users/macbookdinatale/Documents/bndo-final`](/Users/macbookdinatale/Documents/bndo-final).
2. Imposta `Node 20` e usa [`/Users/macbookdinatale/Documents/bndo-final/netlify.toml`](/Users/macbookdinatale/Documents/bndo-final/netlify.toml).
3. Copia tutte le env richieste da [`/Users/macbookdinatale/Documents/bndo-final/.env.example`](/Users/macbookdinatale/Documents/bndo-final/.env.example) seguendo la checklist in [`/Users/macbookdinatale/Documents/bndo-final/NETLIFY_ENV_CHECKLIST.md`](/Users/macbookdinatale/Documents/bndo-final/NETLIFY_ENV_CHECKLIST.md).
4. Tieni `MOCK_BACKEND=false`.
5. Imposta `SCANNER_API_BASE_URL`, `SCANNER_API_EMAIL`, `SCANNER_API_PASSWORD`.
6. Verifica `CRON_SECRET` e `HEALTHCHECK_SECRET`.

## Supabase audit

Controlla che il progetto Supabase produzione abbia:

- tabelle `profiles`, `companies`, `tenders`, `tender_matches`, `tender_applications`
- tabelle `application_documents`, `consultant_threads`, `consultant_thread_participants`, `consultant_messages`
- bucket `application-documents`
- policy RLS allineate allo schema in [`/Users/macbookdinatale/Documents/bndo-final/supabase/schema.sql`](/Users/macbookdinatale/Documents/bndo-final/supabase/schema.sql)

Se manca qualcosa, applica solo delta compatibili. Non fare reset.

Per promuovere un admin ops usa [`/Users/macbookdinatale/Documents/bndo-final/supabase/promote_ops_admin.sql`](/Users/macbookdinatale/Documents/bndo-final/supabase/promote_ops_admin.sql).

## Smoke staging

Verifica almeno questi casi:

1. `bndo.it` style routes: `/`, `/quiz`, `/onboarding`
2. `app.bndo.it` style routes: `/`, `/login`, `/dashboard`, `/dashboard/practices/[id]`
3. `admin.bndo.it` style routes: `/`, `/login?mode=admin`, `/admin`
4. chat AI
5. scanner bandi
6. dettaglio incentivo `/grants/[id]`
7. upload documento
8. checkout Stripe
9. email Resend
10. healthcheck `GET /api/health` con secret
11. cron `refresh-bandi`

## Cutover

1. Sul site Netlify produzione esistente, aggiorna repo/base directory o collega il nuovo source di [`/Users/macbookdinatale/Documents/bndo-final`](/Users/macbookdinatale/Documents/bndo-final).
2. Copia le env definitive.
3. Lascia invariati i custom domains `bndo.it`, `app.bndo.it`, `admin.bndo.it`.
4. Pubblica.
5. Esegui subito smoke post-deploy su tutti e tre gli host.

## Rollback

1. Se compare un blocker, ripubblica l’ultimo deploy stabile precedente da Netlify.
2. Non cambiare progetto Supabase durante il cutover.
3. Non ruotare i domini a un nuovo site se non serve.
