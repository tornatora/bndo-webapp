#!/usr/bin/env bash
set -e

cd /Users/nataleletteriotornatora/Desktop/bndo-live-v2

echo "=== 1. Build ==="
npm run build:app

echo ""
echo "=== 2. Deploy ==="
npx netlify deploy --prod --skip-functions-cache

echo ""
echo "=== FATTO! ==="
