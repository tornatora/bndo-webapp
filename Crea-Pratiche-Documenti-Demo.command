#!/bin/zsh
set -e

cd "$(dirname "$0")"
DEV_PROVISION_SECRET=""

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

  if [ -z "$supabase_url" ] || [[ "$supabase_url" == *"YOUR_"* ]] || [[ "$supabase_url" == *"example.supabase.co"* ]]; then
    missing_keys+=("NEXT_PUBLIC_SUPABASE_URL")
  fi
  if [ -z "$supabase_anon" ] || [[ "$supabase_anon" == *"YOUR_"* ]] || [[ "$supabase_anon" == *"..."* ]]; then
    missing_keys+=("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  fi
  if [ -z "$supabase_service" ] || [[ "$supabase_service" == *"YOUR_"* ]] || [[ "$supabase_service" == *"..."* ]]; then
    missing_keys+=("SUPABASE_SERVICE_ROLE_KEY")
  fi

  if [ ${#missing_keys[@]} -gt 0 ]; then
    echo "Prima di creare i dati demo, completa queste chiavi in .env.local:"
    for key in "${missing_keys[@]}"; do
      echo " - $key"
    done
    open_text_file "$PWD/.env.local"
    read -k 1 "?Premi un tasto per chiudere..."
    echo
    exit 1
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

if [ ! -f "$PWD/.env.local" ]; then
  echo "Manca .env.local. Apri prima Apri-BidPilot.command"
  read -k 1 "?Premi un tasto per chiudere..."
  echo
  exit 1
fi

validate_supabase_env
ensure_dev_secret

echo "Creo pratiche e documenti demo (serve app attiva su localhost:3000)..."
echo

read "email?Email cliente (default: demo@example.com): "
email="${email:-demo@example.com}"
read "practices?Numero pratiche (default: 2): "
practices="${practices:-2}"

JSON_PAYLOAD=$(printf '{"email":"%s","practices":%s}' "$email" "$practices")

RESPONSE=$(curl -sS -X POST http://localhost:3000/api/dev/seed-client-data \
  -H "Content-Type: application/json" \
  -H "x-dev-provision-secret: $DEV_PROVISION_SECRET" \
  -d "$JSON_PAYLOAD")

echo
printf '%s\n' "$RESPONSE"
echo

echo "Ora apri http://admin.lvh.me:3000/admin (clicca il cliente -> vedrai pratiche/documenti)."
open "http://admin.lvh.me:3000/admin"

read -k 1 "?Premi un tasto per chiudere..."
echo
