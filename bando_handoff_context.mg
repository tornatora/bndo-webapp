# BNDO Handoff Context (auto-updated)

## Timestamp
- 2026-04-29 22:35 Europe/Rome

## Git
- Commit SHA base: `75e63cb2f7864f62e32f7dd0e307681575f9dd5f`
- Working tree: modified (non committed)

## Preview
- URL branch deploy stabile (consigliata per test): `https://fix-pdf-extraction--cheerful-cobbler-f23efc.netlify.app`
- Deploy CLI stabile: `69f271e9c2e4c620ed5febf6`
- URL alias cache-pulita (test consigliato ora): `https://compila-bando-clean-20260429--cheerful-cobbler-f23efc.netlify.app`
- Deploy alias cache-pulita: `69f27039e2bc551bdd0f29f4`
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
10. Fix deploy branch Netlify (env mancanti):
   - `app/reset-password/page.tsx` ora non va in crash a build-time se mancano env Supabase
   - fallback UI: messaggio esplicito in preview non configurata
   - build testato con `.env` assenti: `npm run build:app` OK
11. Chiarimento stato documenti compilati:
   - pipeline Step9/SPID/autofill online e testabile
   - compilazione massiva template DSAN/C2 fino a PDF pronti firma non è ancora chiusa end-to-end su tutti i template reali
12. Step9 UX allineata alla richiesta “no fake browser”:
   - rimosso mirror/controlli remoti dalla dashboard
   - SPID gestito solo con nuova scheda Browserbase
   - dashboard resta control center con stato + auto-start compilazione
13. Step7 documenti allineato agli allegati reali:
   - mostrati 5 template reali (DSAN Antiriciclaggio, DSAN Casellario, DSAN Requisiti iniziativa, DSAN Requisiti soggettivi, C2 Descrizione iniziativa)
   - aggiunti box compilabili/di conferma in UI (luogo/data firma, residenza, importo programma, descrizione C2)
   - mostrata lista file utente caricati in Step4 dentro Step7
   - `generate-docs` manifest esteso con `generatedDocs[]` e `reviewRequired[]` coerenti
14. Creato handoff `.md` esterno per continuità con altra AI:
   - `/Users/nataleletteriotornatora/Desktop/bndo_handoff_context.md`
15. Hotfix deploy:
   - ridistribuito alias `fix-pdf-extraction` con build `69f271e9c2e4c620ed5febf6`
   - confermato che alias `compila-bando-clean-20260429` risponde 404

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
- Branch deploy Netlify (Git) operativo:
  - `/login` -> `200`
  - `/dashboard/compila-bando` -> `307 /login` (comportamento atteso se non autenticato)
- Deploy pubblicato via CLI su alias branch:
  - URL: `https://fix-pdf-extraction--cheerful-cobbler-f23efc.netlify.app`
  - Deploy ID ultimo: `69f26ec03a245a1361eb9514`
  - check runtime:
    - `GET /login` -> `200`
    - `GET /dashboard/compila-bando` -> `307 /login`
- Branch deploy successivi (`75e63cb`, `4a84d40`) falliti prima del fix con errore build:
  - `@supabase/ssr: Your project's URL and API key are required...`
  - causa: env Supabase assenti nel contesto branch deploy
  - fix applicato su `/reset-password`; in corso nuovo push/deploy.
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
# 2026-04-30 (oggi)

## Stato Netlify preview (fix-pdf-extraction)

- Repo corretto: `/Users/nataleletteriotornatora/Documents/bndo-webapp`
- Branch: `fix-pdf-extraction`
- Ultimo commit pushato: `d27381307226fadfbb8ed3660388d3747d6c4832`
- Netlify branch deploy in corso (al momento della nota): deploy id `69f3240cfc118100081ea0dc` (state: building)

### Link da usare per test

- Preview principale (branch subdomain): `https://fix-pdf-extraction--cheerful-cobbler-f23efc.netlify.app/compila-bando-preview`
- Se vedi ancora “Pagina non trovata” su quel link mentre il deploy e' in build, usa temporaneamente il permalink dell'ultimo deploy pronto (cambia a ogni deploy) e poi torna al link sopra appena la build finisce.

### Causa del 404 intermittente su /compila-bando-preview

- Il subdomain `fix-pdf-extraction--...` a volte serviva un deploy precedente (build id diverso) e quindi mostrava la pagina `/_not-found`.
- Fix: deploy da `bndo-webapp` con Netlify config coerente (in particolare `publish = ".next"` in `netlify.toml`) e push su branch per forzare il branch deploy aggiornato.

### Cosa c'e' nel flow (riassunto tecnico, senza segreti)

- Step 8: documenti DSAN mostrati come 5 box + download (template reali in `public/templates` e `public/templates_tagged`, generazione via API `POST /api/compila-bando/generate-dsan`).
- Step 10: SPID control center (no fake browser), apre Live View Browserbase in nuova scheda e auto-start della compilazione quando login rilevato.

## Fix critici applicati oggi (2026-04-30) in `bndo-live-aligned`

### 1) Visura non estratta in preview (causa + fix)
- Causa: `netlify.toml` aveva `functions.directory = ".netlify/functions"` (output), quindi Netlify non prendeva i sorgenti in `netlify/functions` e l'endpoint `/.netlify/functions/extract-pdf-text` risultava assente/non affidabile.
- Fix: `functions.directory = "netlify/functions"` in `bndo-live-aligned/netlify.toml`.

### 2) DSAN/C2 PDF identici ai template originali (no conversione)
- `POST /api/compila-bando/generate-dsan` ora in `format="pdf"` non richiede piu `docxtemplater` (che su Netlify puo' mancare e causava 500).
- Template PDF sostituiti con i PDF forniti dall'utente e copiati in `public/templates_pdf` con filename ASCII.
- Build: aggiunta dependency `jspdf-autotable` per sbloccare `npm run build:app` (mancava e rompeva il build Netlify).
