# Netlify Env Checklist

Questa checklist serve per migrare il deploy da [`/Users/macbookdinatale/Documents/New project`](/Users/macbookdinatale/Documents/New%20project) a [`/Users/macbookdinatale/Documents/bndo-final`](/Users/macbookdinatale/Documents/bndo-final) senza perdere configurazioni necessarie.

Nota importante:

- nel workspace non c'e un `.env` legacy versionato
- la source of truth legacy disponibile qui e composta da [`/Users/macbookdinatale/Documents/New project/GUIDA-NETLIFY-PASSO-PASSO.md`](/Users/macbookdinatale/Documents/New%20project/GUIDA-NETLIFY-PASSO-PASSO.md), [`/Users/macbookdinatale/Documents/New project/PROJECT-STATE.md`](/Users/macbookdinatale/Documents/New%20project/PROJECT-STATE.md), [`/Users/macbookdinatale/Documents/New project/README.md`](/Users/macbookdinatale/Documents/New%20project/README.md) e dal codice
- i valori reali vanno quindi copiati dal site Netlify attuale che oggi serve `bndo.it`

## 1. Copia pari pari dal vecchio site Netlify

Queste variabili esistevano gia nel progetto legacy o sono compatibili 1:1 con il nuovo deploy.

| Variabile | Staging | Produzione | Azione |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_MARKETING_URL` | staging host marketing | `https://bndo.it` | copia la stessa logica del sito attuale |
| `NEXT_PUBLIC_APP_URL` | staging host app | `https://app.bndo.it` | copia la stessa logica del sito attuale |
| `NEXT_PUBLIC_ADMIN_URL` | staging host admin | `https://admin.bndo.it` | copia la stessa logica del sito attuale |
| `NEXT_PUBLIC_SUPABASE_URL` | uguale a prod o clone | valore live attuale | copia dal vecchio site Netlify |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | uguale a prod o clone | valore live attuale | copia dal vecchio site Netlify |
| `SUPABASE_SERVICE_ROLE_KEY` | uguale a prod o clone | valore live attuale | copia dal vecchio site Netlify |
| `STRIPE_SECRET_KEY` | test o live controllato | live | copia dal vecchio site se gia attivo |
| `STRIPE_WEBHOOK_SECRET` | webhook staging | webhook live | copia/rigenera dal relativo endpoint Stripe |
| `STRIPE_PRICE_ID` | price test o live | price live | copia dal vecchio site se gia usato |
| `RESEND_API_KEY` | stesso account o sandbox | live | copia dal vecchio site se gia attivo |
| `RESEND_FROM_EMAIL` | mittente staging o live | mittente live | copia dal vecchio site se gia attivo |
| `ALLOW_SUCCESS_PAGE_CREDENTIALS` | `false` | `false` | mantieni `false` |
| `MOCK_BACKEND` | `false` | `false` | mantieni `false` |

## 2. Nuove variabili obbligatorie in `bndo-final`

Queste non risultano parte del perimetro legacy Netlify documentato, ma il nuovo progetto le usa davvero.

| Variabile | Staging | Produzione | Come valorizzarla |
| --- | --- | --- | --- |
| `AUTH_SESSION_SECRET` | random forte | random forte | genera un secret lungo, almeno 32 byte |
| `AUTH_SECRET` | random forte | random forte | puoi usare lo stesso valore di `AUTH_SESSION_SECRET` per semplificare |
| `AUTH_SESSION_TTL_SECONDS` | `2592000` | `2592000` | default 30 giorni |
| `NEXT_PUBLIC_BOOKING_URL` | URL/prenotazione staging | `https://bndo.it/prenota` o path live | obbligatoria per CTA scanner |
| `SCANNER_API_ENABLED` | `true` | `true` | abilita il motore scanner live |
| `SCANNER_API_BASE_URL` | endpoint scanner staging/live | endpoint scanner live | server-side only |
| `SCANNER_API_EMAIL` | credenziale tecnica scanner | credenziale tecnica scanner | server-side only |
| `SCANNER_API_PASSWORD` | credenziale tecnica scanner | credenziale tecnica scanner | server-side only |
| `CRON_SECRET` | random forte | random forte | usato da refresh bandi e Netlify function |
| `HEALTHCHECK_SECRET` | random forte | random forte | usato da `/api/health` |

## 3. Nuove variabili fortemente consigliate

Non tutte bloccano il boot, ma senza queste perdi pezzi di prodotto o di operativita.

| Variabile | Staging | Produzione | Note |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_ASSISTANT_HOME_URL` | host marketing staging | `https://bndo.it` | mantiene i link assistant/home coerenti |
| `NEXT_PUBLIC_APP_AUTH_ORIGIN` | host app staging | `https://app.bndo.it` | utile per login/origin checks |
| `NEXT_PUBLIC_HOME_EMBED_URL` | landing staging | `https://bndo.it/landing` | usata da embed landing |
| `NEXT_PUBLIC_CONSULTING_URL` | URL contatto staging | URL contatto live | usata in CTA grant detail/card |
| `NEXT_PUBLIC_CONSULTING_EMAIL` | email staging | email live | fallback CTA consulenza |
| `SCANNER_API_TIMEOUT_MS` | `20000` | `20000` | timeout server-side scanner |
| `BANDI_CACHE_PATH` | `/tmp/bndo-bandi-cache.json` | `/tmp/bndo-bandi-cache.json` | cache refresh bandi |
| `DEV_PROVISION_SECRET` | valorizzata se vuoi usare route dev | opzionale/non necessaria | non esporla pubblicamente |

## 4. Variabili AI nuove

Servono per la chat AI del progetto finale.

| Variabile | Staging | Produzione | Note |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | chiave staging/controlled | chiave live | richiesta per chat AI vera |
| `OPENAI_MODEL` | `gpt-4.1-mini` | `gpt-4.1-mini` | default consigliato |
| `AI_CHAT_V2` | `true` | `true` | lascia attiva la pipeline nuova |
| `AI_MAX_BUDGET_EUR` | `10` o piu basso | `10` | limite mensile hard |
| `AI_USAGE_TRACK_PATH` | `/tmp/bndo-ai-usage.json` | `/tmp/bndo-ai-usage.json` | file di tracking locale |
| `USD_TO_EUR` | `0.92` | `0.92` | cambio per cost tracking |

## 5. Variabili QA e test

Queste non sono necessarie al deploy pubblico, ma sono utili per verify e smoke automatici.

| Variabile | Staging | Produzione | Note |
| --- | --- | --- | --- |
| `TEST_CLIENT_EMAIL` | opzionale | opzionale | utile per smoke protetti |
| `TEST_CLIENT_PASSWORD` | opzionale | opzionale | utile per smoke protetti |
| `TEST_ADMIN_EMAIL` | opzionale | opzionale | utile per smoke protetti |
| `TEST_ADMIN_PASSWORD` | opzionale | opzionale | utile per smoke protetti |

## 6. Variabili da non portare nel nuovo deploy

Queste non vanno usate nel go-live finale:

- `NEXT_PUBLIC_SCANNER_DEMO_EMAIL`
- `NEXT_PUBLIC_SCANNER_DEMO_PASSWORD`
- `NEXT_PUBLIC_SCANNER_ADMIN_EMAIL`
- `NEXT_PUBLIC_SCANNER_ADMIN_PASSWORD`
- qualunque fallback pubblico a `localhost`, `127.0.0.1` o endpoint scanner privati lato browser

`bndo-final` usa lo scanner via route same-origin e credenziali server-side. Le env scanner pubbliche non vanno piu copiate.

## 7. Raccomandazione staging

Per uno staging davvero fedele conviene avere tre host distinti anche in staging:

- marketing staging
- app staging
- admin staging

Se usi un solo hostname Netlify temporaneo, il middleware continua a funzionare, ma non verifichi davvero il comportamento host-based finale.

Schema consigliato:

- `NEXT_PUBLIC_MARKETING_URL=https://staging.bndo.it`
- `NEXT_PUBLIC_APP_URL=https://app-staging.bndo.it`
- `NEXT_PUBLIC_ADMIN_URL=https://admin-staging.bndo.it`

Se non hai questi host, per smoke veloci puoi usare un solo deploy URL, ma il test domini resta incompleto.

## 8. Ordine pratico di compilazione su Netlify

1. Copia prima tutte le variabili della sezione 1 dal vecchio site.
2. Aggiungi tutte le variabili della sezione 2.
3. Completa la sezione 3.
4. Se vuoi chat live, completa la sezione 4.
5. Aggiungi la sezione 5 solo se vuoi smoke automatici post-deploy.

## 9. File collegati

- template finale: [`/Users/macbookdinatale/Documents/bndo-final/.env.example`](/Users/macbookdinatale/Documents/bndo-final/.env.example)
- deploy Netlify finale: [`/Users/macbookdinatale/Documents/bndo-final/netlify.toml`](/Users/macbookdinatale/Documents/bndo-final/netlify.toml)
- cron Netlify: [`/Users/macbookdinatale/Documents/bndo-final/netlify/functions/refresh-bandi.js`](/Users/macbookdinatale/Documents/bndo-final/netlify/functions/refresh-bandi.js)
- playbook go-live: [`/Users/macbookdinatale/Documents/bndo-final/NETLIFY_GO_LIVE.md`](/Users/macbookdinatale/Documents/bndo-final/NETLIFY_GO_LIVE.md)
- guida legacy: [`/Users/macbookdinatale/Documents/New project/GUIDA-NETLIFY-PASSO-PASSO.md`](/Users/macbookdinatale/Documents/New%20project/GUIDA-NETLIFY-PASSO-PASSO.md)
