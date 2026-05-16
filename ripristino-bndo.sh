#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

echo "=== RIPRISTINO bndo.it (versione full) ==="
rm -rf __bndo-live-v1_temp__
rm -rf .next
npm run build:app
npx netlify deploy --prod
echo "=== Fatto! ==="
