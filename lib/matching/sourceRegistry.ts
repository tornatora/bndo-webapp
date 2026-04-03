export type IngestionSourceTier = 'official' | 'authoritative';
export type IngestionSourceKind = 'api' | 'rss' | 'html' | 'curated' | 'db';

export type IngestionSourceDefinition = {
  id: string;
  name: string;
  kind: IngestionSourceKind;
  tier: IngestionSourceTier;
  cadenceHours: number;
  scope: 'national' | 'regional' | 'camera_commercio' | 'gal' | 'territorial';
  enabled: boolean;
  endpoint?: string;
};

export const SOURCE_REGISTRY: IngestionSourceDefinition[] = [
  {
    id: 'incentivi-gov-solr',
    name: 'Incentivi.gov.it (SOLR)',
    kind: 'api',
    tier: 'official',
    cadenceHours: 24,
    scope: 'national',
    enabled: true,
    endpoint: 'https://www.incentivi.gov.it/solr/coredrupal/select',
  },
  {
    id: 'regional-scraped-grants',
    name: 'Regional Scraped Grants',
    kind: 'db',
    tier: 'authoritative',
    cadenceHours: 24,
    scope: 'regional',
    enabled: true,
  },
  {
    id: 'strategic-curated',
    name: 'Strategic Curated Dataset',
    kind: 'curated',
    tier: 'authoritative',
    cadenceHours: 168,
    scope: 'national',
    enabled: true,
  },
  {
    id: 'regional-curated',
    name: 'Regional Curated Dataset',
    kind: 'curated',
    tier: 'authoritative',
    cadenceHours: 168,
    scope: 'regional',
    enabled: true,
  },
  {
    id: 'camera-commercio-catalog',
    name: 'Camera di Commercio Catalog',
    kind: 'html',
    tier: 'authoritative',
    cadenceHours: 24,
    scope: 'camera_commercio',
    enabled: true,
  },
  {
    id: 'gal-catalog',
    name: 'GAL Catalog',
    kind: 'html',
    tier: 'authoritative',
    cadenceHours: 24,
    scope: 'gal',
    enabled: true,
  },
];

export function getEnabledSources() {
  return SOURCE_REGISTRY.filter((source) => source.enabled);
}

export function sourceCadenceBreachHours(source: IngestionSourceDefinition, ageHours: number) {
  return ageHours > source.cadenceHours;
}

