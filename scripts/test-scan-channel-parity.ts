/* eslint-disable no-console */

type UserProfile = Record<string, unknown>;

type ScanRouteResult = {
  id?: string;
  grantId?: string;
  title?: string;
  matchScore?: number;
};

type ScanResponse = {
  results?: ScanRouteResult[];
  nearMisses?: ScanRouteResult[];
  engineVersion?: string;
  profileHash?: string;
  error?: string;
};

const baseUrl = (process.env.SCANNER_BASE_URL || process.env.CONVERSATION_BASE_URL || 'http://127.0.0.1:3300').replace(/\/$/, '');

const parityCases: Array<{ id: string; profile: UserProfile }> = [
  {
    id: 'south-startup-under35',
    profile: {
      region: 'Calabria',
      businessExists: false,
      ageBand: 'under35',
      employmentStatus: 'disoccupato',
      fundingGoal: 'aprire una nuova attività imprenditoriale',
      contributionPreference: 'fondo perduto',
    },
  },
  {
    id: 'ict-existing-lombardia',
    profile: {
      region: 'Lombardia',
      businessExists: true,
      sector: 'ICT',
      fundingGoal: 'digitalizzazione software cybersecurity',
      contributionPreference: 'fondo perduto',
    },
  },
  {
    id: 'agro-existing-sicilia',
    profile: {
      region: 'Sicilia',
      businessExists: true,
      sector: 'agroalimentare',
      fundingGoal: 'ammodernamento impianti e macchinari',
      contributionPreference: 'fondo perduto',
    },
  },
  {
    id: 'startup-centro-nord',
    profile: {
      region: 'Lazio',
      businessExists: false,
      ageBand: 'under35',
      employmentStatus: 'disoccupato',
      fundingGoal: 'avviare attività servizi',
      contributionPreference: 'fondo perduto',
    },
  },
  {
    id: 'tourism-existing-campania',
    profile: {
      region: 'Campania',
      businessExists: true,
      sector: 'turismo',
      fundingGoal: 'riqualificazione struttura ricettiva e digitalizzazione',
      contributionPreference: 'fondo perduto',
    },
  },
];

async function runScan(profile: UserProfile, channel: 'chat' | 'scanner'): Promise<ScanResponse> {
  const response = await fetch(`${baseUrl}/api/scan-bandi`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      userProfile: profile,
      channel,
      strictness: 'high',
      mode: 'full',
      limit: 8,
    }),
  });

  const json = (await response.json().catch(() => ({}))) as ScanResponse;
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} channel=${channel} error=${json.error ?? 'unknown'}`);
  }
  return json;
}

function resultKey(item: ScanRouteResult): string {
  return String(item.id || item.grantId || item.title || '').trim().toLowerCase();
}

function topSignature(items: ScanRouteResult[] | undefined, topN = 6): string[] {
  return (items ?? []).slice(0, topN).map(resultKey);
}

async function main() {
  for (const scenario of parityCases) {
    const [chatRes, scannerRes] = await Promise.all([
      runScan(scenario.profile, 'chat'),
      runScan(scenario.profile, 'scanner'),
    ]);

    const chatTop = topSignature(chatRes.results, 6);
    const scannerTop = topSignature(scannerRes.results, 6);

    const sameOrder =
      chatTop.length === scannerTop.length &&
      chatTop.every((entry, idx) => entry === scannerTop[idx]);

    if (!sameOrder) {
      throw new Error(
        [
          `parity failed for ${scenario.id}`,
          `chat top: ${chatTop.join(' | ') || '[]'}`,
          `scanner top: ${scannerTop.join(' | ') || '[]'}`,
          `chat engine=${chatRes.engineVersion ?? 'n/a'} hash=${chatRes.profileHash ?? 'n/a'}`,
          `scanner engine=${scannerRes.engineVersion ?? 'n/a'} hash=${scannerRes.profileHash ?? 'n/a'}`,
        ].join('\n')
      );
    }

    console.log(
      `PASS ${scenario.id}: parity ok (${chatTop.length} risultati, engine=${chatRes.engineVersion ?? 'n/a'}, hash=${chatRes.profileHash ?? 'n/a'})`
    );
  }

  console.log(`PASS scan-channel-parity against ${baseUrl}`);
}

main().catch((error) => {
  console.error(`FAIL scan-channel-parity: ${error.message}`);
  process.exit(1);
});
