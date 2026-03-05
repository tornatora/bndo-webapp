const baseUrl = process.env.SCANNER_BASE_URL || 'http://localhost:3300';

const cases = [
  {
    id: 'resto-al-sud-20',
    expectFirst: 'Resto al Sud 2.0',
    expectAmount: 'Da € 10.000 a € 200.000',
    expectCoverage: '70% - 100%',
    payload: {
      userProfile: {
        region: 'Campania',
        businessExists: false,
        activityType: 'Startup',
        legalForm: 'Startup innovativa',
        employmentStatus: 'Disoccupato',
        founderAge: 28,
        sector: 'Turismo',
        ateco: '55.20',
        fundingGoal: 'Avviare una nuova attività ricettiva e turistica',
        contributionPreference: 'fondo perduto',
        revenueOrBudgetEUR: 150000,
        requestedContributionEUR: 120000,
      },
      limit: 5,
    },
  },
  {
    id: 'south-youth-startup-priority',
    expectIncludes: ['Resto al Sud 2.0', 'FUSESE', 'Oltre Nuove imprese a tasso zero'],
    expectOrder: ['Resto al Sud 2.0', 'FUSESE', 'Oltre Nuove imprese a tasso zero'],
    expectMustNotInclude: ['Smart Money', 'Borsa di studio'],
    payload: {
      userProfile: {
        region: 'Calabria',
        businessExists: false,
        activityType: 'Da costituire',
        legalForm: 'Ditta individuale',
        employmentStatus: 'Disoccupato',
        founderAge: 27,
        fundingGoal: 'Aprire una nuova attività imprenditoriale',
        contributionPreference: null,
      },
      mode: 'fast',
      channel: 'chat',
      strictness: 'high',
      limit: 10,
    },
  },
  {
    id: 'south-youth-startup-ageband-priority',
    expectIncludes: ['Resto al Sud 2.0', 'FUSESE', 'Oltre Nuove imprese a tasso zero'],
    expectOrder: ['Resto al Sud 2.0', 'FUSESE', 'Oltre Nuove imprese a tasso zero'],
    expectMustNotInclude: ['Smart Money', 'Borsa di studio'],
    payload: {
      userProfile: {
        region: 'Calabria',
        businessExists: false,
        ageBand: 'under35',
        employmentStatus: 'Disoccupato',
        fundingGoal: 'Aprire una nuova attività imprenditoriale',
        contributionPreference: 'fondo_perduto',
      },
      mode: 'fast',
      channel: 'chat',
      strictness: 'high',
      limit: 10,
    },
  },
  {
    id: 'autoimpiego-centro-nord',
    expectFirst: 'Autoimpiego Centro-Nord',
    expectAmount: 'Fino a € 200.000',
    expectCoverage: '60% - 100%',
    payload: {
      userProfile: {
        region: 'Lazio',
        businessExists: false,
        activityType: 'Startup',
        legalForm: 'Ditta individuale',
        employmentStatus: 'Disoccupato',
        founderAge: 27,
        sector: 'Servizi',
        ateco: '96.09',
        fundingGoal: 'Avviare una nuova attività di servizi in autoimpiego',
        contributionPreference: 'fondo perduto',
        revenueOrBudgetEUR: 80000,
        requestedContributionEUR: 50000,
      },
      limit: 5,
    },
  },
  {
    id: 'smart-start-digitale',
    expectFirst: 'Smart&Start Italia',
    expectAmount: 'Da € 100.000 a € 1.500.000',
    expectCoverage: '0%',
    payload: {
      userProfile: {
        region: 'Lazio',
        businessExists: false,
        activityType: 'Startup',
        legalForm: 'Startup innovativa',
        employmentStatus: 'Occupato',
        founderAge: 31,
        sector: 'Digitale',
        ateco: '62.01',
        fundingGoal: 'Sviluppare una startup innovativa AI con software SaaS',
        contributionPreference: 'finanziamento agevolato',
        revenueOrBudgetEUR: 400000,
        requestedContributionEUR: 250000,
      },
      limit: 5,
    },
  },
  {
    id: 'smart-start-mezzogiorno',
    expectFirst: 'Smart&Start Italia',
    expectAmount: 'Da € 100.000 a € 1.500.000',
    expectCoverage: '30%',
    payload: {
      userProfile: {
        region: 'Campania',
        businessExists: false,
        activityType: 'Startup',
        legalForm: 'Startup innovativa',
        employmentStatus: 'Occupato',
        founderAge: 29,
        sector: 'Digitale',
        ateco: '62.01',
        fundingGoal: 'Sviluppare una startup innovativa software AI nel Mezzogiorno',
        contributionPreference: 'fondo perduto',
        revenueOrBudgetEUR: 500000,
        requestedContributionEUR: 250000,
      },
      limit: 5,
    },
  },
  {
    id: 'nuova-sabatini-macchinari',
    expectFirst: 'Nuova Sabatini',
    expectAmount: 'Da € 20.000 a € 4.000.000',
    expectCoverage: '0%',
    payload: {
      userProfile: {
        region: 'Lombardia',
        businessExists: true,
        activityType: 'PMI',
        legalForm: 'SRL',
        employees: 16,
        sector: 'Manifattura',
        ateco: '28.29',
        fundingGoal: 'Acquistare macchinari e software 4.0 per ampliare la produzione',
        contributionPreference: 'finanziamento agevolato',
        revenueOrBudgetEUR: 600000,
        requestedContributionEUR: 300000,
      },
      limit: 5,
    },
  },
  {
    id: 'agri-existing-sicilia',
    expectIncludes: ['Nuova Sabatini'],
    expectMustNotInclude: ['Resto al Sud', 'FUSESE', 'Nuove imprese a tasso zero'],
    payload: {
      userProfile: {
        region: 'Sicilia',
        businessExists: true,
        activityType: 'PMI',
        legalForm: 'SRL',
        sector: 'agricoltura',
        fundingGoal: 'Ammodernare un impresa agricola con nuovi macchinari e irrigazione efficiente',
        contributionPreference: 'fondo perduto',
        revenueOrBudgetEUR: 120000,
        requestedContributionEUR: 60000,
      },
      mode: 'fast',
      channel: 'chat',
      strictness: 'high',
      limit: 8,
    },
  },
  {
    id: 'pidnext-assessment-digitale',
    expectFirst: 'PIDNEXT',
    expectAmount: 'Fino a € 2.883',
    expectCoverage: '100%',
    payload: {
      userProfile: {
        region: 'Lombardia',
        businessExists: true,
        activityType: 'PMI',
        legalForm: 'SRL',
        employees: 8,
        sector: 'Commercio',
        ateco: '47.91',
        fundingGoal: 'Fare un assessment digitale e una roadmap di trasformazione digitale e cybersecurity',
        contributionPreference: 'fondo perduto',
        revenueOrBudgetEUR: 10000,
        requestedContributionEUR: 2500,
      },
      limit: 5,
    },
  },
  {
    id: 'smau-milano-marche',
    expectFirst: 'SMAU Milano 2026',
    expectAmount: 'Fino a € 5.000',
    expectCoverage: '100%',
    payload: {
      userProfile: {
        region: 'Marche',
        businessExists: true,
        activityType: 'Startup',
        legalForm: 'Startup innovativa',
        employees: 6,
        sector: 'Digitale',
        ateco: '62.01',
        fundingGoal: 'Partecipare a SMAU Milano con stand e incontri B2B per l internazionalizzazione',
        contributionPreference: 'fondo perduto',
        revenueOrBudgetEUR: 5000,
        requestedContributionEUR: 5000,
      },
      limit: 5,
    },
  },
  {
    id: 'cosenza-voucher-digitali',
    expectFirst: 'Voucher digitali I4.0',
    expectAmount: 'Da € 4.000 a € 20.000',
    expectCoverage: '50% - 70%',
    payload: {
      userProfile: {
        region: 'Calabria',
        businessExists: true,
        activityType: 'PMI',
        legalForm: 'SRL',
        employees: 12,
        sector: 'Commercio',
        ateco: '47.91',
        fundingGoal: 'Digitalizzare i processi aziendali con ecommerce CRM software e cybersecurity',
        contributionPreference: 'fondo perduto',
        revenueOrBudgetEUR: 12000,
        requestedContributionEUR: 10000,
      },
      limit: 5,
    },
  },
  {
    id: 'cosenza-creazione-nuove-imprese-iv',
    expectIncludes: ['creazione nuove imprese'],
    expectById: {
      id: 'incentivi-7753',
      amountAnyOf: ['Da € 4.000 a € 20.000', 'Da verificare'],
      coverageAnyOf: ['50% - 60%', 'Da verificare'],
    },
    payload: {
      userProfile: {
        region: 'Calabria',
        businessExists: false,
        activityType: 'Startup',
        legalForm: 'Ditta individuale',
        employmentStatus: 'Disoccupato',
        founderAge: 29,
        sector: 'Commercio',
        fundingGoal: 'Creazione nuova impresa in Calabria',
        contributionPreference: 'fondo perduto',
        revenueOrBudgetEUR: 20000,
        requestedContributionEUR: 10000,
      },
      limit: 10,
    },
  },
  {
    id: 'nuova-impresa-piccoli-comuni-lombardia',
    expectFirst: 'Nuova Impresa - Piccoli Comuni e Frazioni 2026',
    expectAmount: 'Da € 3.000 a € 50.000',
    expectCoverage: '80%',
    payload: {
      userProfile: {
        region: 'Lombardia',
        businessExists: false,
        activityType: 'Startup',
        legalForm: 'Ditta individuale',
        employees: 1,
        sector: 'Commercio',
        ateco: '47.11',
        fundingGoal: 'Aprire un negozio di alimentari e generi di prima necessità in un piccolo comune lombardo',
        contributionPreference: 'fondo perduto',
        revenueOrBudgetEUR: 40000,
        requestedContributionEUR: 30000,
      },
      limit: 5,
    },
  },
  {
    id: 'connessi-digital-export-lombardia',
    expectFirst: 'Bando CONneSSi',
    expectAmount: 'Da € 4.000 a € 16.667',
    expectCoverage: '60%',
    payload: {
      userProfile: {
        region: 'Lombardia',
        businessExists: true,
        activityType: 'PMI',
        legalForm: 'SRL',
        employees: 12,
        sector: 'Commercio',
        ateco: '47.91',
        fundingGoal: 'Sviluppare ecommerce multilingua, marketplace e strategie di marketing digitale per i mercati esteri',
        contributionPreference: 'fondo perduto',
        revenueOrBudgetEUR: 16000,
        requestedContributionEUR: 10000,
      },
      limit: 5,
    },
  },
  {
    id: 'cosenza-risparmio-energetico',
    expectFirst: 'sostenibilità e risparmio energetico',
    expectAmount: 'Da € 2.000 a € 20.000',
    expectCoverage: '50% - 60%',
    payload: {
      userProfile: {
        region: 'Calabria',
        businessExists: true,
        activityType: 'PMI',
        legalForm: 'SRL',
        employees: 9,
        sector: 'Commercio',
        ateco: '47.19',
        fundingGoal: 'Efficientare energeticamente il punto vendita con fotovoltaico, riduzione consumi e mobilità sostenibile',
        contributionPreference: 'fondo perduto',
        revenueOrBudgetEUR: 18000,
        requestedContributionEUR: 10000,
      },
      limit: 5,
    },
  },
  {
    id: 'bologna-fiere-italia',
    expectFirst: 'CCIAA Bologna',
    expectAmount: 'Da € 3.000 a € 8.000',
    expectCoverage: '50%',
    payload: {
      userProfile: {
        region: 'Emilia-Romagna',
        businessExists: true,
        activityType: 'PMI',
        legalForm: 'SRL',
        employees: 20,
        sector: 'Meccanica',
        ateco: '28.29',
        fundingGoal: 'Partecipare a una fiera internazionale in Italia con stand e promozione commerciale',
        contributionPreference: 'fondo perduto',
        revenueOrBudgetEUR: 6000,
        requestedContributionEUR: 3000,
      },
      limit: 5,
    },
  },
  {
    id: 'museo-impresa-lombardia-2026',
    expectFirst: 'Musei d’impresa 2026',
    expectAmount: 'Da € 10.000 a € 80.000',
    expectCoverage: '100%',
    payload: {
      userProfile: {
        region: 'Lombardia',
        businessExists: true,
        activityType: 'Impresa',
        legalForm: 'SRL',
        employees: 12,
        sector: 'Cultura',
        ateco: '91.02',
        fundingGoal: "Realizzare e promuovere un museo d'impresa",
        contributionPreference: 'fondo perduto',
        revenueOrBudgetEUR: 120000,
        requestedContributionEUR: 80000,
      },
      limit: 5,
    },
  },
];

function titles(results) {
  return Array.isArray(results) ? results.map((item) => String(item?.title || '')) : [];
}

function firstResultData(data) {
  const first = Array.isArray(data?.results) ? data.results[0] : null;
  const economic = first?.economicOffer && typeof first.economicOffer === 'object' ? first.economicOffer : null;
  return {
    title: String(first?.title || first?.grantTitle || ''),
    amount: typeof economic?.displayProjectAmountLabel === 'string' ? economic.displayProjectAmountLabel : null,
    coverage: typeof economic?.displayCoverageLabel === 'string' ? economic.displayCoverageLabel : null,
  };
}

function resultDataById(data, lookupId) {
  const list = Array.isArray(data?.results) ? data.results : [];
  const found = list.find((item) => String(item?.id || '').toLowerCase() === String(lookupId || '').toLowerCase());
  if (!found) return null;
  const economic = found?.economicOffer && typeof found.economicOffer === 'object' ? found.economicOffer : null;
  return {
    id: String(found.id || ''),
    title: String(found?.title || found?.grantTitle || ''),
    amount: typeof economic?.displayProjectAmountLabel === 'string' ? economic.displayProjectAmountLabel : null,
    coverage: typeof economic?.displayCoverageLabel === 'string' ? economic.displayCoverageLabel : null,
  };
}

async function runCase(testCase) {
  const response = await fetch(`${baseUrl}/api/scan-bandi`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(testCase.payload),
  });

  if (!response.ok) {
    throw new Error(`${testCase.id}: HTTP ${response.status}`);
  }

  const data = await response.json();
  const resultTitles = titles(data.results);
  const first = firstResultData(data);

  if (Array.isArray(testCase.expectIncludes)) {
    for (const expected of testCase.expectIncludes) {
      if (!resultTitles.some((title) => title.toLowerCase().includes(expected.toLowerCase()))) {
        throw new Error(
          `${testCase.id}: expected "${expected}" in results, got ${resultTitles.length ? resultTitles.join(' | ') : '[]'}`,
        );
      }
    }
  }

  if (Array.isArray(testCase.expectMustNotInclude)) {
    for (const denied of testCase.expectMustNotInclude) {
      if (resultTitles.some((title) => title.toLowerCase().includes(denied.toLowerCase()))) {
        throw new Error(`${testCase.id}: expected to exclude "${denied}", got ${resultTitles.join(' | ')}`);
      }
    }
  }

  if (Array.isArray(testCase.expectOrder) && testCase.expectOrder.length > 1) {
    let prevIndex = -1;
    for (const expected of testCase.expectOrder) {
      const idx = resultTitles.findIndex((title) => title.toLowerCase().includes(expected.toLowerCase()));
      if (idx === -1) {
        throw new Error(
          `${testCase.id}: expected ordered item "${expected}" in results, got ${resultTitles.length ? resultTitles.join(' | ') : '[]'}`,
        );
      }
      if (idx <= prevIndex) {
        throw new Error(
          `${testCase.id}: expected order ${testCase.expectOrder.join(' > ')}, got ${resultTitles.join(' | ')}`,
        );
      }
      prevIndex = idx;
    }
  }

  if (typeof testCase.expectFirst === 'string') {
    if (!first.title.toLowerCase().includes(testCase.expectFirst.toLowerCase())) {
      throw new Error(`${testCase.id}: expected first "${testCase.expectFirst}", got ${first.title || '[]'}`);
    }
  }

  if (typeof testCase.expectAmount === 'string') {
    if ((first.amount || '').trim() !== testCase.expectAmount.trim()) {
      throw new Error(`${testCase.id}: expected amount "${testCase.expectAmount}", got "${first.amount || ''}"`);
    }
  }

  if (typeof testCase.expectCoverage === 'string') {
    if ((first.coverage || '').trim() !== testCase.expectCoverage.trim()) {
      throw new Error(`${testCase.id}: expected coverage "${testCase.expectCoverage}", got "${first.coverage || ''}"`);
    }
  }

  if (testCase.expectById && typeof testCase.expectById.id === 'string') {
    const byId = resultDataById(data, testCase.expectById.id);
    if (!byId) {
      throw new Error(`${testCase.id}: expected result id "${testCase.expectById.id}" not found`);
    }
    if (Array.isArray(testCase.expectById.amountAnyOf)) {
      const ok = testCase.expectById.amountAnyOf.some((expected) => (byId.amount || '').trim() === String(expected).trim());
      if (!ok) {
        throw new Error(
          `${testCase.id}: expected amount for ${testCase.expectById.id} in [${testCase.expectById.amountAnyOf.join(
            ', ',
          )}], got "${byId.amount || ''}"`,
        );
      }
    }
    if (Array.isArray(testCase.expectById.coverageAnyOf)) {
      const ok = testCase.expectById.coverageAnyOf.some((expected) => (byId.coverage || '').trim() === String(expected).trim());
      if (!ok) {
        throw new Error(
          `${testCase.id}: expected coverage for ${testCase.expectById.id} in [${testCase.expectById.coverageAnyOf.join(
            ', ',
          )}], got "${byId.coverage || ''}"`,
        );
      }
    }
  }

  return {
    id: testCase.id,
    qualityBand: data.qualityBand,
    results: resultTitles,
    first,
  };
}

const outputs = [];
for (const testCase of cases) {
  const result = await runCase(testCase);
  outputs.push(result);
  console.log(
    `PASS ${result.id}: ${result.results.length ? result.results.join(' | ') : '[]'} [${result.first.amount || '-'} | ${
      result.first.coverage || '-'
    }] (${result.qualityBand})`,
  );
}

console.log(`\nCompleted ${outputs.length} scanner cases against ${baseUrl}`);
