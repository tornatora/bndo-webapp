# BNDO Handoff (Produzione) — 2026-05-07

## Stato produzione
- Dominio live: https://bndo.it
- Deploy ID live: `69fcf404bafbf92ae1a541ca`
- Unique deploy URL: https://69fcf404bafbf92ae1a541ca--cheerful-cobbler-f23efc.netlify.app
- Build logs: https://app.netlify.com/projects/cheerful-cobbler-f23efc/deploys/69fcf404bafbf92ae1a541ca

## Cartella locale di riferimento (fonte di verità)
- `/Users/nataleletteriotornatora/Desktop/bndo-prod-safe`

## Modifica appena applicata
- File toccato: `components/chat/ChatWindow.tsx`
- Tipo modifica: solo layout banner "Modalità limitata" (no logica AI, no prompt, no motore)
- Effetto richiesto:
  - banner posizionato poco sopra "Vorresti partecipare ad un BNDO?"
  - banner visibile solo in homepage principale (condizione `pathname === '/'`)

## Vincoli rispettati in questa patch
- Nessuna modifica a `/quiz/autoimpiego`
- Nessuna modifica a orchestratori/chat legacy lato motore
- Nessuna modifica a prompt runtime
- Nessun segreto esposto nel frontend

## Come continuare da qui (altra AI)
1. Aprire questa cartella: `/Users/nataleletteriotornatora/Desktop/bndo-prod-safe`
2. Verificare deploy live corrente su `https://bndo.it`
3. Applicare modifiche minime e isolate
4. Build locale: `npm run build:app`
5. Deploy produzione: `npx netlify deploy --prod`

## Nota operativa
- In questo progetto, la prassi è: prima modifica locale nella cartella sopra, poi deploy su Netlify produzione.
