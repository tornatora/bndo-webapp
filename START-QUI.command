#!/bin/zsh
set -e

cd "$(dirname "$0")"
export PATH="$PWD/.tools/node/bin:$PATH"

DEV_LOG="$PWD/.tmp-bidpilot-dev.log"
STARTED_BY_SCRIPT=0
DEV_PID=""
DEV_PROVISION_SECRET=""
PREVIEW_ONLY=0
LOCAL_LIMITED_MODE=0
SUPABASE_ANON_KEY_LOCAL=""
LOCAL_MARKETING_URL="http://bndo.lvh.me:3000"
LOCAL_APP_URL="http://app.lvh.me:3000"
LOCAL_ADMIN_URL="http://admin.lvh.me:3000"

open_text_file() {
  local file_path="$1"
  open -a "TextEdit" "$file_path" >/dev/null 2>&1 || open -t "$file_path" >/dev/null 2>&1 || true
}

read_dev_secret() {
  local secret
  secret=$(awk -F= '/^DEV_PROVISION_SECRET=/{sub(/^DEV_PROVISION_SECRET=/, ""); print; exit}' "$PWD/.env.local" | tr -d '\r')
  secret="${secret%\"}"
  secret="${secret#\"}"
  printf '%s' "$secret"
}

read_env_value() {
  local key_name="$1"
  local value
  value=$(awk -F= -v key="$key_name" '$1==key {sub("^[^=]*=", ""); print; exit}' "$PWD/.env.local" | tr -d '\r')
  value="${value%\"}"
  value="${value#\"}"
  printf '%s' "$value"
}

validate_supabase_env() {
  local missing_keys=()
  local supabase_url supabase_anon supabase_service

  supabase_url="$(read_env_value "NEXT_PUBLIC_SUPABASE_URL")"
  supabase_anon="$(read_env_value "NEXT_PUBLIC_SUPABASE_ANON_KEY")"
  supabase_service="$(read_env_value "SUPABASE_SERVICE_ROLE_KEY")"
  SUPABASE_ANON_KEY_LOCAL="$supabase_anon"

  if [ -z "$supabase_url" ] || [[ "$supabase_url" == *"YOUR_"* ]] || [[ "$supabase_url" == *"example.supabase.co"* ]]; then
    missing_keys+=("NEXT_PUBLIC_SUPABASE_URL")
  fi
  if [ -z "$supabase_anon" ] || [[ "$supabase_anon" == *"YOUR_"* ]] || [[ "$supabase_anon" == *"..."* ]]; then
    missing_keys+=("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  fi
  if [ ${#missing_keys[@]} -gt 0 ]; then
    echo "Chiavi Supabase mancanti: avvio DEMO VISIVA senza backend reale."
    echo "Quando vuoi test reale, compila in .env.local:"
    for key in "${missing_keys[@]}"; do
      echo " - $key"
    done
    PREVIEW_ONLY=1
    return
  fi

  if [ -z "$supabase_service" ] || [[ "$supabase_service" == *"YOUR_"* ]] || [[ "$supabase_service" == *"..."* ]]; then
    echo "SUPABASE_SERVICE_ROLE_KEY non impostata: avvio APP REALE in modalita locale limitata."
    echo "Potrai vedere UI e navigazione senza deploy Netlify."
    echo "Nota: provisioning automatico e alcune azioni admin potrebbero essere limitate."
    LOCAL_LIMITED_MODE=1
  fi
}

ensure_dev_secret() {
  DEV_PROVISION_SECRET="$(read_dev_secret)"

  if [ -z "$DEV_PROVISION_SECRET" ] || [ "$DEV_PROVISION_SECRET" = "change-me" ]; then
    local generated
    generated="dev_$(LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 18)"

    if awk -F= '/^DEV_PROVISION_SECRET=/{found=1} END{exit found?0:1}' "$PWD/.env.local"; then
      sed -i '' "s|^DEV_PROVISION_SECRET=.*|DEV_PROVISION_SECRET=\"$generated\"|" "$PWD/.env.local"
    else
      printf '\nDEV_PROVISION_SECRET="%s"\n' "$generated" >> "$PWD/.env.local"
    fi

    DEV_PROVISION_SECRET="$generated"
    echo "DEV_PROVISION_SECRET generato automaticamente."
  fi
}

cleanup() {
  if [ "$STARTED_BY_SCRIPT" = "1" ] && [ -n "$DEV_PID" ]; then
    kill "$DEV_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

stop_node_on_port_3000() {
  # Avoid stale/corrupted Next dev servers. Only kill if the listener is `node`.
  local pid comm
  pid=$(lsof -ti tcp:3000 2>/dev/null | head -n 1 || true)
  if [ -z "$pid" ]; then
    return 0
  fi

  comm=$(ps -p "$pid" -o comm= 2>/dev/null | tr -d ' \t\r\n' || true)
  if [ "$comm" != "node" ]; then
    echo "La porta 3000 e occupata da un processo non-node (pid=$pid, comm=$comm)."
    echo "Chiudi quel programma e rilancia questo file."
    read -k 1 "?Premi un tasto per chiudere..."
    echo
    exit 1
  fi

  echo "Riavvio server locale (trovato node su porta 3000, pid=$pid)..."
  kill "$pid" >/dev/null 2>&1 || true
  sleep 1
  if kill -0 "$pid" >/dev/null 2>&1; then
    kill -9 "$pid" >/dev/null 2>&1 || true
  fi
}

if [ ! -x "$PWD/.tools/node/bin/node" ]; then
  echo "Node locale non trovato."
  echo "Contattami e lo reinstallo in automatico."
  read -k 1 "?Premi un tasto per chiudere..."
  echo
  exit 1
fi

if [ ! -d "$PWD/node_modules" ]; then
  echo "Installo dipendenze (solo la prima volta)..."
  npm install
fi

if [ ! -f "$PWD/.env.local" ]; then
  cp "$PWD/.env.example" "$PWD/.env.local"
  echo "Ho creato .env.local. Inserisci le chiavi richieste e riapri questo file."
  open_text_file "$PWD/.env.local"
  read -k 1 "?Premi un tasto per chiudere..."
  echo
  exit 1
fi

validate_supabase_env
ensure_dev_secret

# Force local "production-like" domains so behavior matches online routing.
export NEXT_PUBLIC_MARKETING_URL="$LOCAL_MARKETING_URL"
export NEXT_PUBLIC_APP_URL="$LOCAL_APP_URL"
export NEXT_PUBLIC_ADMIN_URL="$LOCAL_ADMIN_URL"
if [ "$LOCAL_LIMITED_MODE" = "1" ] && [ -n "$SUPABASE_ANON_KEY_LOCAL" ]; then
  # Local fallback: avoids server crashes when service role key is not set.
  export SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_ANON_KEY_LOCAL"
fi

if curl -sS http://127.0.0.1:3000 >/dev/null 2>&1; then
  echo "App gia attiva su http://localhost:3000"
fi

# Always restart + wipe .next before starting dev server.
stop_node_on_port_3000

if [ -d "$PWD/.next" ]; then
  echo "Pulizia cache Next.js locale (.next)..."
  rm -rf "$PWD/.next"
fi

echo "Avvio app..."
npm run dev > "$DEV_LOG" 2>&1 &
DEV_PID=$!
STARTED_BY_SCRIPT=1

for i in {1..60}; do
  if curl -sS http://127.0.0.1:3000 >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -sS http://127.0.0.1:3000 >/dev/null 2>&1; then
  echo "Non riesco ad avviare l'app su porta 3000."
  echo "Controlla log: $DEV_LOG"
  read -k 1 "?Premi un tasto per chiudere..."
  echo
  exit 1
fi

if [ "$PREVIEW_ONLY" = "1" ]; then
  open "$LOCAL_MARKETING_URL/demo"
else
  open "$LOCAL_MARKETING_URL"
fi

echo
if [ "$PREVIEW_ONLY" = "1" ]; then
  echo "Aperta DEMO VISIVA: $LOCAL_MARKETING_URL/demo"
  echo "Non servono chiavi per vedere il prodotto."
  echo "Link utili (stesso routing dell'online):"
  echo " - $LOCAL_MARKETING_URL"
  echo " - $LOCAL_APP_URL/login"
  echo " - $LOCAL_ADMIN_URL/admin"
  echo "Per chiudere questa procedura premi un tasto."
  read -k 1
  echo
  exit 0
fi

echo "Sito aperto."
echo "Link locali (uguali alla struttura online):"
echo " - Public: $LOCAL_MARKETING_URL"
echo " - App:    $LOCAL_APP_URL/login"
echo " - Admin:  $LOCAL_ADMIN_URL/admin"

if [ "$LOCAL_LIMITED_MODE" = "1" ]; then
  echo
  echo "Modalita locale limitata attiva: apro direttamente login app."
  echo "Nota: in questa modalita il login con USERNAME puo non funzionare. Usa la tua EMAIL."
  open "$LOCAL_APP_URL/login"
  echo "Per chiudere questa procedura premi un tasto."
  read -k 1
  echo
  exit 0
fi

echo "Premi INVIO per creare subito un cliente demo e aprire il login..."
read

RESPONSE=$(curl -sS -X POST http://localhost:3000/api/dev/provision \
  -H "Content-Type: application/json" \
  -H "x-dev-provision-secret: $DEV_PROVISION_SECRET" \
  -d '{"email":"demo@example.com","companyName":"Azienda Demo Srl","contactName":"Mario Rossi"}')

echo
echo "Risposta provisioning:"
printf '%s\n' "$RESPONSE"
echo

open "$LOCAL_APP_URL/login"

echo "Login aperto. Usa le credenziali arrivate via email."
echo "Per chiudere questa procedura premi un tasto."
read -k 1

echo
