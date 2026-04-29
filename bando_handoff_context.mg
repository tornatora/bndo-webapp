# BNDO Handoff Context (auto-updated)

## Timestamp
- 2026-04-29 22:10 Europe/Rome

## Git
- Commit SHA base: `15fa33d98d121a7b510312ca903085ebbb4dfb77`
- Working tree: modified (non committed)

## Preview
- URL ultimo draft (sito dedicato): `https://69f264c5abe40ff6927858ac--bndo-step9-preview-20260429.netlify.app`
- URL sito dedicato: `https://bndo-step9-preview-20260429.netlify.app`
- Deploy ID (sito dedicato): `69f264c5abe40ff6927858ac`
- Build log (sito dedicato): `https://app.netlify.com/projects/bndo-step9-preview-20260429/deploys/69f264c5abe40ff6927858ac`

## Implementato in questo passaggio
1. `POST /api/compila-bando/readiness-check`
   - blocco pre-Step9 con output:
     - `ready`
     - `missingFields[]`
     - `missingDocuments[]`
     - `inferredFields[]`
     - `applicationId`
2. `POST /api/compila-bando/upload-signed`
   - supporto upload firmati `pdf` e `p7m`
   - salvataggio in `application_documents`
   - update requirement `practice_document_requirements.status=uploaded`
3. `POST /api/compila-bando/execute-flow`
   - input esteso (retrocompatibile): `sessionId`, `applicationId`, `phase`
   - response estesa:
     - `phase`
     - `applicationId`
     - `sessionId`
     - `requiresHumanAction`
4. `POST /api/compila-bando/session-status`
   - aggiunto `lastSeenAt`
5. Step9 frontend (`Step9BrowserBando`)
   - data gate pre-SPID via readiness-check
   - stop avvio SPID se mancano campi/documenti
   - passaggio `sessionId/applicationId/phase` a execute-flow
   - pannello controlli collassato di default (meno overlay bianco)
6. Step5 estrazione (`Step5Estrazione`)
   - fallback robusto: se API extract fallisce, non blocca il wizard e passa con dati base editabili.
7. `POST /api/compila-bando/generate-docs`
   - modalità `mode=manifest` con `{ ok, generatedDocs, reviewRequired }`
   - modalità binaria DOCX mantenuta per compatibilità.
8. `Step9BrowserBando` animazione realistica compilazione:
   - typing campo-per-campo con velocità naturale (jitter)
   - cursore `|` durante digitazione
   - progressione sequenziale su tutti i campi in fase `auto-filling`
9. `Step9BrowserBando` miglioramento UX richiesto:
   - velocità typing resa leggermente più rapida dell'umano
   - aggiunto fake cursor visivo con movimento tra campi + feedback click

## File toccati
- `app/api/compila-bando/readiness-check/route.ts`
- `app/api/compila-bando/upload-signed/route.ts`
- `app/api/compila-bando/execute-flow/route.ts`
- `app/api/compila-bando/session-status/route.ts`
- `app/api/compila-bando/generate-docs/route.ts`
- `features/compila-bando/components/Step9BrowserBando.tsx`
- `features/compila-bando/components/Step5Estrazione.tsx`
- `features/compila-bando/pages/CompilaBandoPage.tsx`
- `lib/compila-bando/types.ts`
- `middleware.ts`
- `app/dashboard/compila-bando/page.tsx`
- `netlify.toml`
- `package-lock.json`
- `package.json`
- `features/compila-bando/components/Step9BrowserBando.tsx` (typing animation)

## Stato build locale
- `npm run build:app` OK
- warning lint non bloccanti già esistenti in altre aree

## Nota deploy corrente
- Netlify build completa, ma sui deploy CLI preview/prod le route app rispondono 404 mentre gli asset statici `_next/static` sono serviti.
- Tentativo fallback redirect `/* -> /.netlify/functions/___netlify-server-handler` rimosso: eliminava i 404 ma introduceva 502 (`invalid character '\x00' after top-level value`).
- Da API Netlify: nei deploy CLI `plugin_state` risulta `none`; in alcuni deploy compare `___netlify-server-handler`, ma il routing pagina resta 404.
- Il dominio `main--cheerful-cobbler-f23efc.netlify.app` risponde correttamente per `/login` (routing Next attivo).
- Correzioni già applicate in repo:
  - plugin Next aggiornato a `@netlify/plugin-nextjs@5.15.10`
  - `netlify.toml` con plugin attivo
  - bypass auth preview su `/dashboard/compila-bando` per test e2e (codice pronto, non verificabile finché il routing Netlify non torna operativo)
  - build setting Netlify `build_settings.dir` pulito via API (rimosso `.next` forzato su sito principale)

## Rischi aperti / prossimi step consigliati
1. E2E live SPID su preview per validare:
   - auto-start execute-flow dopo login
   - recovery su disconnect websocket/liveview
2. Completare pipeline DSAN template reali (docx -> pdf firmabili) con mapping campi avanzato.
3. Aggiungere orchestrazione fasi post-firma e upload allegati fino a conferma finale.
