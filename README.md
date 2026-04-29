# BNDO Bandi Assistant (New project 2)

## Env

- `NEXT_PUBLIC_BOOKING_URL` (required): URL o path che si apre al click su `Prenota consulenza`.
  - Esempio: `https://bndo.it/prenota`
  - Esempio: `/prenota`
- `OPENAI_API_KEY` (optional): abilita risposte conversazionali piu “umane” via modello OpenAI.
- `Scanner bandi` ora e integrato nativamente nella UI (nessun iframe / URL esterno richiesto).
- `SCANNER_API_BASE_URL` (required in production): API di Scanner Bandi PRO usata lato server anche da `chat` per avere lo stesso matching preciso. In locale, se non impostata, il fallback resta `http://127.0.0.1:3301`.
- `SCANNER_API_EMAIL` / `SCANNER_API_PASSWORD` (recommended): credenziali tecniche per chiamare il motore matching.
- `SCANNER_API_ENABLED` (optional): `true` default. Se `false`, usa solo fallback locale Incentivi.gov.
- `SCANNER_API_TIMEOUT_MS` (optional): timeout chiamate al motore matching. Default `14000`.
- `NEXT_PUBLIC_API_BASE_URL` (optional): override pubblico esplicito per API browser. Se vuota, il frontend usa solo route same-origin di `bndo-final`.
- `AI_CHAT_V2` (optional): feature flag orchestratore conversazionale v2. Default `true`.
- `OPENAI_MODEL` (optional): default `gpt-4.1-mini`.
- `AI_MAX_BUDGET_EUR` (optional): tetto mensile hard lato server per l'uso AI a pagamento. Default `10`.
- `USD_TO_EUR` (optional): cambio usato per tracking costi. Default `0.92`.
- `AI_USAGE_TRACK_PATH` (optional): file json locale per tracciare consumo mensile.

Vedi `.env.example`.

### Nota costi OpenAI

Le sottoscrizioni ChatGPT (Free/Plus/Team) e l'API OpenAI sono piani separati.
Quindi la modalita API non e inclusa automaticamente nel piano ChatGPT gratuito.

### Budget cap consigliato (prima release)

Per stare entro 10€:

- imposta `OPENAI_MODEL=gpt-4.1-mini`
- imposta `AI_MAX_BUDGET_EUR=10`

Quando il budget viene raggiunto, la chat passa automaticamente alla logica locale (nessun costo API aggiuntivo).

## Output risultati + CTA

Lo scan (`POST /api/scan-bandi`) restituisce:

- `explanation`
- `results[]` con `title`, `authorityName`, `deadlineAt`, `sourceUrl`, `requirements`
- `results[].matchScore`, `results[].matchReasons[]`, `results[].mismatchFlags[]`
- `nearMisses[]` (opzionale): bandi non idonei ora, ma recuperabili con azioni chiare (`mismatchFlags`)
- `qualityBand` (`high` | `medium` | `low`)
- `refineQuestion` (opzionale, se servono dati aggiuntivi)
- `topPickBandoId`
- `bookingUrl`

Priorita motore:
1. Motore ufficiale Scanner Bandi PRO (`SCANNER_API_*`) con regole hard e scoring calibrato.
2. Fallback locale su open-data Incentivi.gov solo se il motore ufficiale non e raggiungibile.

La UI (`/`) renderizza:

1. Spiegazione breve
2. Elenco bandi compatibili
3. Follow-up con testo:
   - “Vuoi partecipare a questo BANDO con BNDO? Prenota una consulenza con un nostro consulente.”
   - bottone/link `Prenota consulenza` verso `bookingUrl`

## Conversazione guidata

`POST /api/conversation`:

- raccoglie `userProfile` a step (una domanda per volta)
- salva sessione in cookie httpOnly `bndo_assistant_session`
- quando il profilo e completo risponde con `readyToScan=true`
- include metadati: `mode`, `nextBestField`, `assistantConfidence`, `needsClarification`, `aiSource`

`aiSource` utile per debug connessione AI:
- `openai` = risposta generata dal modello
- `budget` = fallback locale per budget esaurito
- `disabled` = fallback locale (chiave assente/feature flag disattiva)
- `error` = fallback locale per errore API

## Refresh giornaliero (cache)

`POST /api/jobs/refresh-bandi`:

- scarica bulk (open data) da Incentivi.gov
- salva su cache locale in `BANDI_CACHE_PATH` (default `/tmp/bndo-bandi-cache.json`)
- se `CRON_SECRET` e impostata, richiede header `x-cron-secret`

## Smoke test v2 (consigliato)

Con server avviato:

```bash
npm run smoke:v2 -- http://localhost:3300
```

Verifica automaticamente:
- greeting + modalita QA naturale
- handoff consulente umano con raccolta dati obbligatoria
- matching con `matchScore/matchReasons`
- robustezza scan anche con campi `null` dal profilo chat

<!-- Deploy sync: 2026-04-30T00:01:49 -->
