import { IncentiviDoc } from '@/lib/matching/types';

export type ComparisonResult = {
  measureA: { title: string; coverage: string; maxAmount: string; keyStrengths: string[] };
  measureB: { title: string; coverage: string; maxAmount: string; keyStrengths: string[] };
  verdict: string;
};

/**
 * Compares two grants to provide a structured "Consultant Advice" on which one is better.
 */
export function compareMeasures(a: IncentiviDoc, b: IncentiviDoc): ComparisonResult {
  const coverageA = a.coverageMaxPercent || 0;
  const coverageB = b.coverageMaxPercent || 0;
  
  const amountA = a.costMax || 0;
  const amountB = b.costMax || 0;

  const strengthsA: string[] = [];
  const strengthsB: string[] = [];

  if (coverageA > coverageB) strengthsA.push(`Copertura superiore (${coverageA}% vs ${coverageB}%)`);
  if (coverageB > coverageA) strengthsB.push(`Copertura superiore (${coverageB}% vs ${coverageA}%)`);
  
  if (amountA > amountB) strengthsA.push(`Budget massimo più elevato (€${amountA.toLocaleString()})`);
  if (amountB > amountA) strengthsB.push(`Budget massimo più elevato (€${amountB.toLocaleString()})`);

  // Specific Logic for Strategic Measures
  if (a.id === 'strategic-resto-al-sud-20') strengthsA.push('Include voucher di avvio a fondo perduto fino a 50k');
  if (b.id === 'strategic-resto-al-sud-20') strengthsB.push('Include voucher di avvio a fondo perduto fino a 50k');

  let verdict = '';
  if (coverageA > coverageB || (coverageA === coverageB && amountA > amountB)) {
    verdict = `Considerando il tuo profilo, **${a.title}** sembra più vantaggioso principalmente per la maggiore intensità di aiuto.`;
  } else if (coverageB > coverageA || (coverageB === coverageA && amountB > amountA)) {
    verdict = `Considerando il tuo profilo, **${b.title}** sembra più vantaggioso principalmente per la maggiore intensità di aiuto.`;
  } else {
    verdict = `Entrambe le misure sono eccellenti. La scelta dipende dalla tua capacità di investimento iniziale e dalla complessità del progetto.`;
  }

  return {
    measureA: {
      title: (a.title || 'Misura A') as string,
      coverage: (a.displayCoverageLabel || `${coverageA}%`) as string,
      maxAmount: (a.displayProjectAmountLabel || `€${amountA.toLocaleString()}`) as string,
      keyStrengths: strengthsA,
    },
    measureB: {
      title: (b.title || 'Misura B') as string,
      coverage: (b.displayCoverageLabel || `${coverageB}%`) as string,
      maxAmount: (b.displayProjectAmountLabel || `€${amountB.toLocaleString()}`) as string,
      keyStrengths: strengthsB,
    },
    verdict,
  };
}

/**
 * Formats a comparison into a human-readable consultant message.
 */
export function formatComparisonMessage(res: ComparisonResult): string {
  return `### Confronto: ${res.measureA.title} vs ${res.measureB.title}\n\n` +
    `**${res.measureA.title}:**\n` +
    `- Copertura: ${res.measureA.coverage}\n` +
    `- Importo Max: ${res.measureA.maxAmount}\n` +
    (res.measureA.keyStrengths.length > 0 ? `- Punti di forza: ${res.measureA.keyStrengths.join(', ')}\n` : '') +
    `\n**${res.measureB.title}:**\n` +
    `- Copertura: ${res.measureB.coverage}\n` +
    `- Importo Max: ${res.measureB.maxAmount}\n` +
    (res.measureB.keyStrengths.length > 0 ? `- Punti di forza: ${res.measureB.keyStrengths.join(', ')}\n` : '') +
    `\n**Il mio parere:**\n${res.verdict}`;
}
