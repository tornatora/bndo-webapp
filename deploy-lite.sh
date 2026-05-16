#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

echo "=== Deploy versione LITE su bndo.it ==="
echo ""

# npm install se manca next
if ! [ -f node_modules/.bin/next ]; then
  echo "[0/3] npm install..."
  npm install
fi

# Patch node_modules per forzare funzione server univoca
echo "[0/3] Patch funzione server..."
python3 -c "
path = 'node_modules/@netlify/plugin-nextjs/dist/build/functions/server.js'
with open(path) as f:
  content = f.read()
content = content.replace(
  \"generator: \\\`\\\${ctx.pluginName}@\\\${ctx.pluginVersion}\\\`\",
  \"generator: \\\`\\\${ctx.pluginName}@\\\${ctx.pluginVersion} build-\\\${Date.now()}\\\`\"
)
if '// Build timestamp' not in content:
  content = content.replace(
    \"await writeFile(join(ctx.serverHandlerRootDir, \\\`\\\${SERVER_HANDLER_NAME}.mjs\\\`), handler);\",
    \"await writeFile(join(ctx.serverHandlerRootDir, \\\`\\\${SERVER_HANDLER_NAME}.mjs\\\`), handler + \\\`\\n// Build timestamp: \\\${Date.now()}\\n\\\`);\"
  )
with open(path, 'w') as f:
  f.write(content)
print('   ✓ Patch applicata')
"

# Build
echo "[1/2] Build..."
rm -rf .next
npm run build:app

# Deploy forzando refresh funzione server
echo "[2/2] Deploy su bndo.it..."
npx netlify deploy --prod --skip-functions-cache

echo ""
echo "=== Fatto! ==="
