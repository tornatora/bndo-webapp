# Live Snapshots

Questa cartella contiene snapshot GitHub della baseline live di `bndo.it`.

## Regola operativa

- la baseline ufficiale e' sempre il `published_deploy.id` corrente del sito Netlify
- ogni snapshot salva: commit Git, deploy live, preview alias, hash file/funzioni, risultato parity

## Snapshot corrente

- file: `ops/live-snapshots/2026-04-24-bndo-live-baseline.json`
- commit baseline: `6b20e01a0f1b1b23764fc194ee2bca79fb9d3352`
- deploy live baseline: `69ea8c6c9edf825e1ce9db6b`

## Ripristino rapido

```bash
git fetch --all --tags
git checkout codex/live-baseline-2026-04-24
```

