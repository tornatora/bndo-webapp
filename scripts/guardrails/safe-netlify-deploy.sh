#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

node scripts/guardrails/verify-workspace.mjs

if ! command -v netlify >/dev/null 2>&1; then
  echo "[ERROR] netlify CLI not found in PATH"
  exit 1
fi

echo "[DEPLOY] Running netlify deploy (guarded)"
netlify deploy "$@"

