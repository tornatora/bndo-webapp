# BNDO Web App (Project State)

Questo file serve come checkpoint per continuare velocemente (senza perdere contesto) e per poter aprire una nuova chat senza ripetere tutto.

Nota sicurezza:
- NON incollare mai qui chiavi Supabase/Stripe/Resend o password.
- Le variabili ambiente vanno indicate solo per nome, senza valori.

## Domini (Produzione)
- Marketing: `https://bndo.it`
- App clienti: `https://app.bndo.it`
- Admin: `https://admin.bndo.it`

La web app e' una Next.js (App Router) unica, ma con routing/redirect per dominio.

## Locale (per test senza Netlify)
Si usa `lvh.me` per simulare i domini di produzione:
- Marketing: `http://bndo.lvh.me:3000`
- App: `http://app.lvh.me:3000/login`
- Admin: `http://admin.lvh.me:3000/admin`

Avvio consigliato:
- doppio click su `START-QUI.command`
  - riavvia il server su porta 3000 se necessario
  - pulisce `.next` per evitare cache corrotta
  - apre il browser sul dominio marketing locale
- Per aggiungere dati demo (pratiche + documenti) per test admin:
  - doppio click su `Crea-Pratiche-Documenti-Demo.command`
  - usa API dev `POST /api/dev/seed-client-data` (solo sviluppo, protetta da `DEV_PROVISION_SECRET`)

- Modalita test UI senza backend reale (Mock):
  - aggiungi `MOCK_BACKEND=true` in `.env.local`
  - bypass auth su `/admin` e mostra clienti/pratiche/documenti finti
  - chat e richieste documenti salvate in `localStorage`

## Variabili ambiente richieste (Netlify)
- `NEXT_PUBLIC_MARKETING_URL`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_ADMIN_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Auth / Ruoli
- Login basato su Supabase Auth (email/password).
- Accesso Admin consentito solo a profili con `public.profiles.role` in `ops_admin` o `consultant`.
- Recupero password in modalita admin disabilitato (per sicurezza).

File chiave:
- `lib/auth.ts` (`requireUserProfile`, `requireOpsProfile`)
- `app/api/auth/login/route.ts` (login user/admin con redirect sicuri)
- `app/api/auth/forgot-password/route.ts` (blocca recupero admin)
- `lib/supabase/admin.ts` (admin client + `hasRealServiceRoleKey()`)

## Routing per dominio
Gestito in `middleware.ts`.
- Marketing: quiz e pagine pubbliche
- App: login/register/dashboard cliente
- Admin: pannello `/admin` e login admin (`/login?mode=admin`)

Helper URL:
- `lib/site-urls.ts` (`MARKETING_URL`, `APP_URL`, `ADMIN_URL`, `buildAbsoluteUrl`, ecc.)

## Notifiche (cliente)
Le notifiche sono basate sui messaggi consulente: quando arriva un nuovo record in `consultant_messages` del thread del cliente, la campanella aumenta.

Implementazione attuale:
- Campanella in tutte le pagine dashboard: `components/dashboard/NotificationsBell.tsx`
- Layout dashboard cliente: `app/dashboard/layout.tsx`
- Chat: `components/dashboard/ChatPanel.tsx` (solo chat, senza logica campanella duplicata)

## Admin (stato attuale e direzione)
Obiettivo:
- Prima schermata: elenco clienti + ricerca.
- Scheda cliente: info, documenti, pratiche, richiesta documento, chat.
- Menu coerente con dashboard cliente.

Stato attuale:
- Home admin = lista clienti + ricerca:
  - `app/admin/page.tsx` + `components/admin/ClientsList.tsx`
  - (alias) `app/admin/clients/page.tsx` -> redirect a `/admin`
- Scheda cliente:
  - `app/admin/clients/[companyId]/page.tsx`
  - mostra pratiche, documenti caricati, chat
  - include richiesta documenti mancanti con testo libero + priorita (invia un messaggio in chat):
    - `components/admin/RequestDocumentsForm.tsx`
  - se il thread chat non esiste, viene creato lato server per permettere all'admin di scrivere subito
- API dettagli cliente (usata da inbox legacy):
  - `app/api/admin/client-summary/route.ts`
  - Shared logic (session-based, no service-role required): `lib/admin/client-summary.ts`

Prossimi step admin:
1. (Opzionale) Tabelle dedicate per richieste documenti (status + priorita + storico), invece di usare solo la chat.
2. Sezione pratiche/quiz per cliente (elegibilita, bando_type, ecc).
3. Rifinire la scheda cliente: raggruppare documenti per pratica, filtri, paging.

## Prima di fare push (per risparmiare crediti Netlify)
- Accumulare modifiche e fare 1 push.
- Verificare build locale: `npm run build` (usa Node locale in `.tools/node/bin`).

## File cambiati recentemente (indicativo)
- `START-QUI.command`
- `app/admin/layout.tsx`
- `app/admin/page.tsx`
- `app/admin/clients/page.tsx`
- `app/admin/clients/[companyId]/page.tsx`
- `app/api/auth/login/route.ts`
- `app/login/actions.ts`
- `app/globals.css`
- `components/admin/ClientsList.tsx`
- `components/admin/RequestDocumentsForm.tsx`
- `lib/supabase/admin.ts`
- `lib/admin/client-summary.ts`
- `app/dashboard/layout.tsx`
- `components/dashboard/NotificationsBell.tsx`
- `components/dashboard/ChatPanel.tsx`
- `components/admin/AdminInbox.tsx`
- `app/api/admin/client-summary/route.ts`
