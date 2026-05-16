#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "=== BNDO Deploy ==="

# Patch for unique server function
echo "[1/3] Patching Netlify plugin..."
python3 -c "
path = 'node_modules/@netlify/plugin-nextjs/dist/build/functions/server.js'
with open(path) as f:
  content = f.read()
content = content.replace(
  'generator: \`\${ctx.pluginName}@\${ctx.pluginVersion}\`',
  'generator: \`\${ctx.pluginName}@\${ctx.pluginVersion} build-\${Date.now()}\`'
)
if '// Build timestamp' not in content:
  content = content.replace(
    'await writeFile(join(ctx.serverHandlerRootDir, \`\${SERVER_HANDLER_NAME}.mjs\`), handler);',
    'await writeFile(join(ctx.serverHandlerRootDir, \`\${SERVER_HANDLER_NAME}.mjs\`), handler + \`\\n// Build timestamp: \${Date.now()}\\n\`);'
  )
with open(path, 'w') as f:
  f.write(content)
print('   Patch applicata ✓')
"

echo "[2/3] Building Next.js..."
rm -rf .next
npx next build 2>&1

echo "[3/3] Deploying to Netlify..."
npx netlify deploy --prod --skip-functions-cache 2>&1

echo ""
echo "=== Done! ==="
