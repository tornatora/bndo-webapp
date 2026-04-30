# GUIDA — Come fare Preview su Netlify

## ⚠️ IMPORTANTE: directory giusta!

Il deploy VA FATTO da `bndo-webapp/`, MAI da `bndo-live-aligned/`.

`bndo-live-aligned/` ha un `netlify.toml` rotto (manca `publish = ".next"`), quindi il deploy finisce in un sito non funzionante.

---

## Passaggi esatti

### 1. Vai nella directory corretta

```bash
cd /Users/nataleletteriotornatora/Documents/bndo-webapp
```

### 2. Assicurati che il build funzioni in locale

```bash
npm run build:app
```

Se fallisce per i test chat (problema pre-esistente non legato al wizard):
```bash
npm run build:app   # già salta i test, fa solo next build
```

### 3. Deploy su Netlify (preview / draft)

```bash
netlify deploy --alias fix-pdf-extraction
```

Questo crea una preview URL:
```
https://fix-pdf-extraction--cheerful-cobbler-f23efc.netlify.app
```

### 4. Per vedere subito la pagina wizard

Apri nel browser:
```
https://fix-pdf-extraction--cheerful-cobbler-f23efc.netlify.app/compila-bando-preview
```

Oppure:
```
https://fix-pdf-extraction--cheerful-cobbler-f23efc.netlify.app/dashboard/compila-bando
```

### 5. Per mettere in produzione (solo quando tutto è verificato)

```bash
netlify deploy --prod
```

---

## Info tecniche

| Parametro | Valore |
|-----------|--------|
| Directory deploy | `/Users/nataleletteriotornatora/Documents/bndo-webapp` |
| Netlify site | `cheerful-cobbler-f23efc` |
| Site ID | `0c6924aa-7626-492e-94fa-a4c368cfb85b` |
| Alias preview | `fix-pdf-extraction` |
| Branch correlata | `fix-pdf-extraction` |
| Build command in netlify.toml | `npm run build` (fa test + build) |
| Build solo app | `npm run build:app` (salta test) |
| Publish directory | `.next` |
| Functions directory | `.netlify/functions` |

---

## Se vedi errori dopo il deploy

### Errore 404 su /compila-bando-preview
- Verifica che `app/compila-bando-preview/page.tsx` esista
- Controlla i log build: https://app.netlify.com/projects/cheerful-cobbler-f23efc/deploys

### Errore 500 su API generate-dsan
- Controlla i function logs: https://app.netlify.com/projects/cheerful-cobbler-f23efc/logs/functions
- Puppeteer/Chromium potrebbe fare timeout o superare dimensione bundle

---

## Shortcut — comando unico

```bash
cd /Users/nataleletteriotornatora/Documents/bndo-webapp && npm run build:app && netlify deploy --alias fix-pdf-extraction
```
