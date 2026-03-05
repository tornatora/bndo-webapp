#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://localhost:3200}"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Errore: comando richiesto non trovato: $1" >&2
    exit 1
  }
}

need_cmd curl
need_cmd jq

tmpjar="$(mktemp)"
cleanup() {
  rm -f "$tmpjar"
}
trap cleanup EXIT

echo "[1/4] Greeting + QA mode"
greet="$(curl -sS -c "$tmpjar" -b "$tmpjar" -X POST "$BASE_URL/api/conversation" -H 'content-type: application/json' -d '{"message":"ciao"}')"
echo "$greet" | jq -e '.mode == "profiling"' >/dev/null
echo "$greet" | jq -e '.assistantText | length > 40' >/dev/null

qa1="$(curl -sS -c "$tmpjar" -b "$tmpjar" -X POST "$BASE_URL/api/conversation" -H 'content-type: application/json' -d '{"message":"possiamo prima parlare?"}')"
echo "$qa1" | jq -e '.mode == "qa"' >/dev/null

qa2="$(curl -sS -c "$tmpjar" -b "$tmpjar" -X POST "$BASE_URL/api/conversation" -H 'content-type: application/json' -d '{"message":"sei intelligente?"}')"
echo "$qa2" | jq -e '.assistantText | test("consulente|BNDO"; "i")' >/dev/null

echo "[2/4] Handoff consulente umano"
tmpjar2="$(mktemp)"
trap 'rm -f "$tmpjar" "$tmpjar2"' EXIT
curl -sS -c "$tmpjar2" -b "$tmpjar2" -X POST "$BASE_URL/api/conversation" -H 'content-type: application/json' -d '{"message":"voglio parlare con un consulente umano"}' >/dev/null
curl -sS -c "$tmpjar2" -b "$tmpjar2" -X POST "$BASE_URL/api/conversation" -H 'content-type: application/json' -d '{"message":"avvio attivita artigianale"}' >/dev/null
curl -sS -c "$tmpjar2" -b "$tmpjar2" -X POST "$BASE_URL/api/conversation" -H 'content-type: application/json' -d '{"message":"da costituire"}' >/dev/null
curl -sS -c "$tmpjar2" -b "$tmpjar2" -X POST "$BASE_URL/api/conversation" -H 'content-type: application/json' -d '{"message":"Calabria"}' >/dev/null
curl -sS -c "$tmpjar2" -b "$tmpjar2" -X POST "$BASE_URL/api/conversation" -H 'content-type: application/json' -d '{"message":"ho 27 anni"}' >/dev/null
curl -sS -c "$tmpjar2" -b "$tmpjar2" -X POST "$BASE_URL/api/conversation" -H 'content-type: application/json' -d '{"message":"sono disoccupato"}' >/dev/null
curl -sS -c "$tmpjar2" -b "$tmpjar2" -X POST "$BASE_URL/api/conversation" -H 'content-type: application/json' -d '{"message":"50000"}' >/dev/null
curl -sS -c "$tmpjar2" -b "$tmpjar2" -X POST "$BASE_URL/api/conversation" -H 'content-type: application/json' -d '{"message":"test@example.com"}' >/dev/null
handoff_final="$(curl -sS -c "$tmpjar2" -b "$tmpjar2" -X POST "$BASE_URL/api/conversation" -H 'content-type: application/json' -d '{"message":"+39 333 1234567"}')"
echo "$handoff_final" | jq -e '.mode == "handoff"' >/dev/null
echo "$handoff_final" | jq -e '.assistantText | test("ricontatter"; "i")' >/dev/null

echo "[3/4] Matching Calabria + explainability"
scan="$(curl -sS -X POST "$BASE_URL/api/scan-bandi" -H 'content-type: application/json' -d '{"userProfile":{"activityType":"PMI","sector":"ICT","fundingGoal":"digitalizzazione e-commerce","location":{"region":"Calabria"},"contributionPreference":"fondo perduto"},"limit":3}')"
echo "$scan" | jq -e '.results | length >= 1' >/dev/null
echo "$scan" | jq -e '.results[0].matchScore != null' >/dev/null
echo "$scan" | jq -e '.results[0].matchReasons != null' >/dev/null
echo "$scan" | jq -e '.qualityBand != null' >/dev/null

echo "[4/4] Scan payload robusto con campi null"
scan_null="$(curl -sS -X POST "$BASE_URL/api/scan-bandi" -H 'content-type: application/json' -d '{"userProfile":{"activityType":"PMI","sector":null,"ateco":null,"fundingGoal":"digitalizzazione","contributionPreference":null,"location":{"region":"Calabria","municipality":null}},"limit":3}')"
echo "$scan_null" | jq -e 'has("error") | not or .error == null' >/dev/null
echo "$scan_null" | jq -e '.results != null' >/dev/null

echo "OK: smoke v2 passed on $BASE_URL"
