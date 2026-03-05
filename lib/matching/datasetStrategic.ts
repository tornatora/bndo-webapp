import { STRATEGIC_SCANNER_DOCS } from '@/lib/strategicScannerDocs';
import type { IncentiviDoc } from '@/lib/matching/types';

export function strategicDocToIncentiviDoc(rawDoc: unknown): IncentiviDoc {
  const doc = (rawDoc ?? {}) as Record<string, unknown>;
  return {
    id: typeof doc.id === 'string' || typeof doc.id === 'number' ? doc.id : undefined,
    title: typeof doc.title === 'string' ? doc.title : undefined,
    description: typeof doc.description === 'string' ? doc.description : undefined,
    authorityName: typeof doc.authorityName === 'string' ? doc.authorityName : undefined,
    openDate: typeof doc.openDate === 'string' ? doc.openDate : undefined,
    closeDate: typeof doc.closeDate === 'string' ? doc.closeDate : undefined,
    regions:
      Array.isArray(doc.regions) ? doc.regions.map((entry) => String(entry)) : typeof doc.regions === 'string' ? doc.regions : undefined,
    sectors:
      Array.isArray(doc.sectors) ? doc.sectors.map((entry) => String(entry)) : typeof doc.sectors === 'string' ? doc.sectors : undefined,
    beneficiaries:
      Array.isArray(doc.beneficiaries)
        ? doc.beneficiaries.map((entry) => String(entry))
        : typeof doc.beneficiaries === 'string'
          ? doc.beneficiaries
          : undefined,
    dimensions:
      Array.isArray(doc.dimensions) ? doc.dimensions.map((entry) => String(entry)) : typeof doc.dimensions === 'string' ? doc.dimensions : undefined,
    purposes:
      Array.isArray(doc.purposes) ? doc.purposes.map((entry) => String(entry)) : typeof doc.purposes === 'string' ? doc.purposes : undefined,
    supportForm:
      Array.isArray(doc.supportForm)
        ? doc.supportForm.map((entry) => String(entry))
        : typeof doc.supportForm === 'string'
          ? doc.supportForm
          : undefined,
    ateco: Array.isArray(doc.ateco) ? doc.ateco.map((entry) => String(entry)) : typeof doc.ateco === 'string' ? doc.ateco : undefined,
    costMin: doc.costMin as string | number | undefined,
    costMax: doc.costMax as string | number | undefined,
    grantMin: doc.grantMin as string | number | undefined,
    grantMax: doc.grantMax as string | number | undefined,
    coverageMinPercent: doc.coverageMinPercent as string | number | undefined,
    coverageMaxPercent: doc.coverageMaxPercent as string | number | undefined,
    displayAmountLabel: typeof doc.displayAmountLabel === 'string' ? doc.displayAmountLabel : undefined,
    displayProjectAmountLabel: typeof doc.displayProjectAmountLabel === 'string' ? doc.displayProjectAmountLabel : undefined,
    displayCoverageLabel: typeof doc.displayCoverageLabel === 'string' ? doc.displayCoverageLabel : undefined,
    institutionalLink: typeof doc.institutionalLink === 'string' ? doc.institutionalLink : undefined,
    url: typeof doc.url === 'string' ? doc.url : undefined,
    score: typeof doc.score === 'number' ? doc.score : undefined,
  };
}

export function getStrategicDatasetDocs() {
  return STRATEGIC_SCANNER_DOCS.map((doc) => strategicDocToIncentiviDoc(doc));
}

