# Test Facile (1 file solo)

1. Fai doppio click su `START-QUI.command`.
2. Segui le scritte a schermo (molto poche).
3. Se non hai ancora le chiavi: si apre la demo visiva (`/demo`) automaticamente.
4. Se hai le chiavi: apre il flusso completo e poi il login in automatico.
5. Per vedere il comportamento uguale all'online usa questi link locali:
   - `http://bndo.lvh.me:3000`
   - `http://app.lvh.me:3000/login`
   - `http://admin.lvh.me:3000/admin`
6. Per aggiungere pratiche + documenti di prova (per test admin):
   - doppio click su `Crea-Pratiche-Documenti-Demo.command`
   - poi apri `http://admin.lvh.me:3000/admin`
7. Se manca `SUPABASE_SERVICE_ROLE_KEY`, parte comunque l'app reale in modalita locale limitata (UI e navigazione ok, provisioning automatico limitato).

## Mock mode (test UI senza Supabase)

Se vuoi testare l'admin e le funzionalita UI senza configurare Supabase:

1. In `.env.local` aggiungi `MOCK_BACKEND=true`
2. Avvia con `START-QUI.command`
3. Apri:
   - `http://admin.lvh.me:3000/admin`
   - scegli un cliente mock e testa pratiche/documenti/richieste/chat (persistono in `localStorage`)

## Prima volta

- Compila `.env.local` con le chiavi richieste.
- `DEV_PROVISION_SECRET` ora viene creato automaticamente se manca.

## Se macOS blocca il file

- Tasto destro sul file `.command` -> `Apri`.
