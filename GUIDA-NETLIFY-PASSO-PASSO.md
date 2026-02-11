# Guida Netlify (senza codice)

## 1) Chiavi da prendere

In Supabase:
1. Apri `Project Settings -> API`.
2. Copia:
   - `Project URL` (es: `https://xxx.supabase.co`)
   - `anon public` key
   - `service_role` key (segreta, non condividerla pubblicamente)

## 2) Crea il sito su Netlify

1. Vai su Netlify -> `Add new site` -> `Import an existing project`.
2. Collega il repository di `/Users/macbookdinatale/Documents/New project`.
3. Build settings:
   - Build command: `npm run build`
   - Publish directory: `.next`
4. Il file `netlify.toml` e gia pronto in:
   - `/Users/macbookdinatale/Documents/New project/netlify.toml`

## 3) Variabili ambiente su Netlify

In Netlify -> `Site configuration -> Environment variables`, aggiungi:
- `NEXT_PUBLIC_APP_URL` = `https://bndo.it`
- `NEXT_PUBLIC_SUPABASE_URL` = (Project URL Supabase)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = (anon public key)
- `SUPABASE_SERVICE_ROLE_KEY` = (service role key)
- `ALLOW_SUCCESS_PAGE_CREDENTIALS` = `false`

Se usi Stripe/Resend aggiungi anche:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

## 4) Domini custom

In Netlify -> `Domain management` aggiungi:
- `bndo.it`
- `app.bndo.it`
- `admin.bndo.it`

La tua app gestisce gia il routing:
- `bndo.it` -> landing (`/`)
- `app.bndo.it` -> redirect automatico a `/login`
- `admin.bndo.it` -> redirect automatico a `/admin`

## 5) DNS (provider dominio)

Configura DNS verso Netlify secondo i record mostrati da Netlify Domain management.
Di solito:
- root domain con record ALIAS/ANAME o A records Netlify
- subdomain con CNAME verso il target Netlify

## 6) Admin operativo

1. Crea il tuo utente con login normale (`/login`) almeno una volta.
2. In Supabase SQL Editor esegui:
   - `/Users/macbookdinatale/Documents/New project/supabase/promote_ops_admin.sql`
3. Sostituisci `admin@yourdomain.com` con la tua email e lancia la query.

## 7) Test finale

1. Apri `https://bndo.it` e clicca `Verifica requisiti`.
2. Verifica quiz su `https://bndo.it/quiz`.
3. Login cliente su `https://app.bndo.it`.
4. Login admin su `https://admin.bndo.it`.
