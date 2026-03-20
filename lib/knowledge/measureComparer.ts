import { IncentiviDoc } from '@/lib/matching/types';

export interface ComparisonDimension {
    label: string;
    valA: string;
    valB: string;
    isIdentical: boolean;
}

export interface ComparisonResult {
    measureA: { title: string; id: string | number };
    measureB: { title: string; id: string | number };
    dimensions: ComparisonDimension[];
    verdict: string;
}

/**
 * Compares two grants to provide a structured side-by-side breakdown.
 */
export function compareMeasures(a: IncentiviDoc, b: IncentiviDoc): ComparisonResult {
    const dimensions: ComparisonDimension[] = [];

    const formatList = (val: unknown) => {
        if (Array.isArray(val)) return val.length > 5 ? `${val.slice(0, 5).join(', ')}... (+${val.length - 5})` : val.join(', ');
        return String(val || 'N/D');
    };

    const normalizeList = (val: unknown): string => {
        if (Array.isArray(val)) return val.sort().join('|').toLowerCase();
        return String(val || '').toLowerCase();
    };

    const addDimension = (label: string, field: keyof IncentiviDoc | ((d: IncentiviDoc) => string)) => {
        const getVal = typeof field === 'function' ? field : (d: IncentiviDoc) => formatList(d[field]);
        const getNorm = typeof field === 'function' ? field : (d: IncentiviDoc) => normalizeList(d[field]);
        
        const valA = getVal(a);
        const valB = getVal(b);
        dimensions.push({
            label,
            valA,
            valB,
            isIdentical: getNorm(a) === getNorm(b)
        });
    };

    addDimension('Beneficiari', 'beneficiaries');
    addDimension('Destinazione (Regioni)', 'regions');
    addDimension('Forma Aiuto', 'supportForm');
    addDimension('Spese Ammissibili', 'purposes');
    addDimension('Investimento Min', (d) => d.costMin ? `€${Number(d.costMin).toLocaleString()}` : 'N/D');
    addDimension('Investimento Max', (d) => d.costMax ? `€${Number(d.costMax).toLocaleString()}` : 'N/D');
    
    // Coverage logic
    const covA = Math.max(Number(a.coverageMaxPercent || 0), Number(a.grantMax || 0) > 0 ? 1 : 0);
    const covB = Math.max(Number(b.coverageMaxPercent || 0), Number(b.grantMax || 0) > 0 ? 1 : 0);

    let verdict = '';
    if (covA > covB) {
        verdict = `**${a.title}** offre un'intensità di aiuto potenzialmente superiore.`;
    } else if (covB > covA) {
        verdict = `**${b.title}** sembra più generoso in termini di copertura percentuale.`;
    } else {
        verdict = `Entrambe le misure sono competitive. La scelta dipende dalla localizzazione e dalla tipologia di spese specifica del tuo progetto.`;
    }

    return {
        measureA: { title: a.title || 'Misura A', id: a.id || 'N/D' },
        measureB: { title: b.title || 'Misura B', id: b.id || 'N/D' },
        dimensions,
        verdict
    };
}

/**
 * Formats a comparison into a human-readable consultant message.
 */
export function formatComparisonMessage(res: ComparisonResult): string {
    let msg = `### Analisi Comparativa: ${res.measureA.title} vs ${res.measureB.title}\n\n`;
    
    msg += `| Caratteristica | ${res.measureA.title} | ${res.measureB.title} |\n`;
    msg += `| :--- | :--- | :--- |\n`;
    
    for (const dim of res.dimensions) {
        const marker = dim.isIdentical ? '' : ' 🔍';
        msg += `| **${dim.label}**${marker} | ${dim.valA} | ${dim.valB} |\n`;
    }
    
    msg += `\n**Consulenza BNDO:**\n${res.verdict}\n\n`;
    msg += `*Nota: Le icone 🔍 indicano differenze strutturali importanti tra i due bandi.*`;
    
    return msg;
}
