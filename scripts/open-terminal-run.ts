import { execSync } from 'child_process';
import fs from 'fs';

const templatePath = process.argv[2];
const dataPath = process.argv[3];

if (!templatePath || !fs.existsSync(templatePath)) {
  console.error('Usage: npx tsx scripts/open-terminal-run.ts <template.json> [data.json]');
  process.exit(1);
}

const dataArg = dataPath && fs.existsSync(dataPath) ? ` --data="${dataPath}"` : '';
const command = `cd ~/Documents/bndo-webapp && npx tsx scripts/run-copilot-playwright.ts --template="${templatePath}"${dataArg} --slow-mo=100`;

const appleScript = `tell application "Terminal"
    do script "${command.replace(/"/g, '\\"')}"
    activate
end tell`;

fs.writeFileSync('/tmp/bndo-run.scpt', appleScript);

try {
  execSync('osascript /tmp/bndo-run.scpt', { stdio: 'inherit' });
  console.log('Terminale aperto!');
} catch (err) {
  console.error('Errore:', err);
}
