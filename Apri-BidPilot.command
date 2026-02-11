#!/bin/zsh
set -e

cd "$(dirname "$0")"
export PATH="$PWD/.tools/node/bin:$PATH"

open_text_file() {
  local file_path="$1"
  open -a "TextEdit" "$file_path" >/dev/null 2>&1 || open -t "$file_path" >/dev/null 2>&1 || true
}

if [ ! -x "$PWD/.tools/node/bin/node" ]; then
  echo "Node locale non trovato in .tools/node/bin."
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
  echo "Ho creato .env.local."
  echo "Inserisci le chiavi in .env.local e riapri questo file."
  open_text_file "$PWD/.env.local"
  read -k 1 "?Premi un tasto per chiudere..."
  echo
  exit 1
fi

open "http://localhost:3000"

echo "Avvio BidPilot su http://localhost:3000"
echo "Per fermare: premi CTRL+C in questa finestra."

npm run dev
