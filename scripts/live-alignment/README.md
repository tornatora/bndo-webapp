# Live Alignment (bndo.it -> locale/preview)

Questo flusso blocca mismatch tra versione live e preview.

## Comandi

```bash
npm run live-align:prepare-workspace
npm run live-align:sync-baseline
npm run live-align:clone-preview
npm run live-align:verify-parity
```

Esecuzione completa in un colpo:

```bash
npm run live-align:cycle
```

## Guardrail attivi

- workspace sporco: operazioni bloccate (salvo `--allow-dirty`)
- repository sbagliata: operazioni bloccate (fingerprint root + remote)
- baseline non allineato al live corrente: clone bloccato

## Policy preview

- default: alias stabile via `branch` (`live-current-preview--cheerful-cobbler-f23efc.netlify.app`)
- fallback URL: permalink univoco se alias non assegnato da Netlify
- puntatore corrente aggiornato in `.netlify/live-alignment/preview-current.json`

## Nota tecnica su funzioni

Il clone tenta sempre `files + functions` dal manifest live.
Se Netlify richiede `required_functions` (upload binari non clonabili via digest), il flusso passa in fallback `files_only_fallback` e lo registra esplicitamente nei risultati.

## Stato salvato

Directory stato default:

```text
.netlify/live-alignment/
```

File principali:

- `baseline-manifest.json`
- `baseline-files-map.json`
- `baseline-functions-digest-map.json`
- `preview-current.json`
- `parity-report.json`
- `workspace-current.json`
