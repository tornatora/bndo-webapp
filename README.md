# BidPilot - Piattaforma gare in outsourcing

Web app full-stack per acquisizione clienti, vendita servizio, provisioning automatico account, dashboard gare personalizzata, candidatura con upload documenti e chat con consulente.

## Stack scelto (scalabile)

- Next.js 14 (App Router) + TypeScript
- Supabase (Postgres + Auth + Storage + Realtime)
- Stripe Checkout + Webhook provisioning
- Resend (email transazionali credenziali)
- Tailwind CSS con UI corporate moderna

## Flusso prodotto implementato

1. Utente arriva in landing e compila il form lead.
2. Checkout Stripe per acquistare il servizio.
3. Webhook Stripe crea azienda, utente Supabase, profilo, credenziali username/password e ordine.
4. Dopo pagamento, webhook crea l'account e invia credenziali via email.
5. La pagina success conferma stato provisioning e invio email.
6. Login con username o email + password.
7. Dashboard mostra gare matchate, sintesi e stato pratica.
8. Click su "Partecipa": upload documenti e aggiornamento candidatura.
9. Chat real-time con consulente dalla dashboard.

## Novita implementate (stabilita chat + admin + quiz)

- Landing responsive aggiornata in `/` con menu mobile corretto.
- Quiz reale in `/quiz` collegato ai pulsanti "Verifica requisiti".
- Salvataggio quiz via API in `quiz_submissions` e `leads`.
- Nuovo pannello admin in `/admin` con inbox conversazioni e realtime.
- Notifiche chat sincronizzate tramite `consultant_thread_participants` (`last_read_at`).
- API chat unificata (`GET` + `POST`) e endpoint `POST /api/chat/mark-read`.

## Struttura principale

- `/app`: pagine, layout e API route
- `/components`: componenti UI (landing, dashboard, chat, upload)
- `/lib`: client Supabase/Stripe, auth helper, provisioning logic
- `/supabase/schema.sql`: schema DB + RLS + bucket storage
- `/supabase/seed.sql`: dataset gare iniziale

## Rotte principali

- `/` landing pubblica (dominio: `bndo.it`)
- `/quiz` verifica requisiti
- `/login` accesso utenti
- `/dashboard` area cliente (dominio consigliato: `app.bndo.it`)
- `/admin` pannello operativo (dominio consigliato: `admin.bndo.it`)

## Mapping domini (middleware)

- `app.bndo.it` su `/` reindirizza a `/login`
- `admin.bndo.it` su `/` reindirizza a `/admin`

## Deploy consigliato

- Questa codebase funziona sia su Netlify che su Vercel.
- Per Next.js 14 App Router, Vercel e la scelta piu semplice e stabile.
- Se resti su Netlify, configura plugin Next e tutte le variabili `.env`.
- In entrambi i casi, collega i tre domini:
  - `bndo.it` -> `/`
  - `app.bndo.it` -> `/login` (root redirect automatico da middleware)
  - `admin.bndo.it` -> `/admin` (root redirect automatico da middleware)
- Guida pronta non tecnica:
  - `/Users/macbookdinatale/Documents/New project/GUIDA-NETLIFY-PASSO-PASSO.md`

## Setup locale

1. Crea file `.env.local` partendo da `.env.example`.
2. Installa dipendenze:

```bash
npm install
```

3. Applica schema su Supabase SQL Editor:

- esegui `supabase/schema.sql`
- esegui `supabase/seed.sql`
- se avevi gia creato il DB, riesegui `supabase/schema.sql` per aggiungere i nuovi campi email su `onboarding_credentials`
- per l'ultima versione riesegui `supabase/schema.sql` anche per creare:
  - `quiz_submissions`
  - `consultant_thread_participants`
  - policy e indici relativi

4. Configura Stripe:

- crea un prodotto/price e imposta `STRIPE_PRICE_ID`
- configura webhook endpoint verso `/api/stripe/webhook`
- imposta `STRIPE_WEBHOOK_SECRET`

5. Configura Resend:

- imposta `RESEND_API_KEY`
- imposta `RESEND_FROM_EMAIL` con dominio verificato in Resend (esempio: `"BidPilot <onboarding@tuodominio.it>"`)
- opzionale debug: `ALLOW_SUCCESS_PAGE_CREDENTIALS=true` per mostrare password anche nella pagina success
- opzionale test locale rapido: `DEV_PROVISION_SECRET` per usare `/api/dev/provision` senza Stripe webhook

6. Avvia app:

```bash
npm run dev
```

7. (Locale webhook) inoltro eventi Stripe:

```bash
stripe listen --forward-to http://localhost:3000/api/stripe/webhook
```

## Tabelle chiave Supabase

- `leads`: contatti dalla landing
- `companies`: aziende clienti
- `profiles`: utenti autenticati con username
- `service_orders`: ordini acquistati
- `onboarding_credentials`: credenziali generate post-checkout
- `tenders`: gare pubbliche indicizzate
- `tender_matches`: gare rilevanti per azienda
- `tender_applications`: candidature
- `application_documents`: file caricati per candidatura
- `consultant_threads`, `consultant_messages`: chat consulente

## Note sicurezza MVP

- Le credenziali vengono inviate via email transazionale (Resend) in provisioning.
- La visualizzazione password nella pagina success e disattivata di default (`ALLOW_SUCCESS_PAGE_CREDENTIALS=false`).
- Per produzione conviene:
  - forzare reset password al primo login
  - aggiungere rate limit e auditing sugli endpoint pubblici
  - impostare retention breve per `temp_password` e masking lato backoffice

## Test end-to-end

1. Completa setup env (`Supabase`, `Stripe`, `Resend`), poi avvia:

```bash
npm install
npm run dev
```

2. Avvia listener Stripe locale:

```bash
stripe listen --forward-to http://localhost:3000/api/stripe/webhook
```

2.b Se non usi Stripe CLI, puoi simulare il provisioning in locale (solo dev):

```bash
curl -X POST http://localhost:3000/api/dev/provision \\
  -H "Content-Type: application/json" \\
  -H "x-dev-provision-secret: $DEV_PROVISION_SECRET" \\
  -d '{"email":"test@example.com","companyName":"Azienda Demo Srl","contactName":"Mario Rossi"}'
```

Questo endpoint crea account, company, credenziali, match gare e invia email tramite Resend.

3. Apri la landing e fai checkout con carta test Stripe:

- numero: `4242 4242 4242 4242`
- scadenza: qualsiasi data futura
- CVC: qualsiasi 3 cifre

4. Verifica provisioning in Supabase:

- tabella `service_orders`: nuovo record con `checkout_session_id`
- tabella `profiles`: nuovo utente con `username`
- tabella `onboarding_credentials`: `emailed_at` valorizzato

5. Verifica email:

- ricevuta all'indirizzo usato in checkout
- subject: `Credenziali accesso BidPilot - <azienda>`
- presenza `username` e `password temporanea`

6. Esegui login in `/login` con le credenziali ricevute e verifica:

- dashboard con gare visibili
- apertura dettaglio gara
- upload documento in candidatura
- messaggio chat consulente salvato

## Roadmap consigliata

- workflow consulente interno (backoffice)
- matching gare AI con scoring spiegabile
- notifiche email/WhatsApp su nuove gare
- firma digitale e invio telematico guidato
- fatturazione ricorrente e piani multipli
