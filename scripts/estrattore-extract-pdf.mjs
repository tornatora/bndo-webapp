import { readFile } from 'node:fs/promises';

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error('Missing input PDF path');
  }

  const buffer = await readFile(inputPath);
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer), disableWorker: true });
  const doc = await loadingTask.promise;

  let text = '';
  try {
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
      const page = await doc.getPage(pageNum);
      const textContent = await page.getTextContent();
      for (const item of textContent.items) {
        if (!item || typeof item !== 'object' || !('str' in item)) continue;
        const str = typeof item.str === 'string' ? item.str : '';
        if (!str) continue;
        text += str;
        text += item.hasEOL ? '\n' : ' ';
      }
      text += `\n-- ${pageNum} of ${doc.numPages} --\n`;
    }
  } finally {
    await doc.destroy();
  }

  process.stdout.write(JSON.stringify({ text, total: doc.numPages }));
}

main().catch((error) => {
  process.stderr.write((error instanceof Error ? error.message : String(error)) + '\n');
  process.exit(1);
});
