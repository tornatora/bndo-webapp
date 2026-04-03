import { WebSearchService } from '../lib/ai/webSearchEngine';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function run() {
  const prevSerper = process.env.SERPER_API_KEY;
  const prevProvider = process.env.WEBSEARCH_PROVIDER;
  const prevPaidFallback = process.env.WEBSEARCH_ALLOW_PAID_FALLBACK;
  try {
    process.env.WEBSEARCH_PROVIDER = 'free';
    process.env.WEBSEARCH_ALLOW_PAID_FALLBACK = '0';
    delete process.env.SERPER_API_KEY;

    const outcome = await WebSearchService.search('Resto al Sud 2.0 requisiti scadenza');

    assert(typeof outcome.query === 'string', 'Query should be present');
    assert(Array.isArray(outcome.providersUsed), 'providersUsed should be an array');

    if (!outcome.ok) {
      assert(typeof outcome.unavailableReason === 'string' && outcome.unavailableReason.length > 0, 'Unavailable reason should be explicit');
      console.log('PASS web-search-grounding (degraded mode)');
      return;
    }

    assert(outcome.results.length > 0, 'Expected at least one result in successful mode');
    assert(outcome.results.length <= 8, 'Results should be capped at 8');
    assert(
      outcome.providersUsed.some((provider) => provider.includes('incentivi') || provider.includes('duckduckgo')),
      `Expected free providers, got ${outcome.providersUsed.join(', ')}`,
    );
    assert(!outcome.providersUsed.some((provider) => provider.includes('serper')), 'Serper should not be used in free mode');

    for (const result of outcome.results) {
      assert(typeof result.title === 'string' && result.title.length > 0, 'Result title missing');
      assert(typeof result.url === 'string' && /^https?:\/\//.test(result.url), 'Result url invalid');
      assert(typeof result.evidenceSnippet === 'string' && result.evidenceSnippet.length > 0, 'Evidence snippet missing');
      assert(['official', 'authoritative', 'web'].includes(result.sourceTier), 'Invalid sourceTier');
    }

    console.log('PASS web-search-grounding');
  } finally {
    if (prevSerper !== undefined) process.env.SERPER_API_KEY = prevSerper;
    else delete process.env.SERPER_API_KEY;
    if (prevProvider !== undefined) process.env.WEBSEARCH_PROVIDER = prevProvider;
    else delete process.env.WEBSEARCH_PROVIDER;
    if (prevPaidFallback !== undefined) process.env.WEBSEARCH_ALLOW_PAID_FALLBACK = prevPaidFallback;
    else delete process.env.WEBSEARCH_ALLOW_PAID_FALLBACK;
  }
}

run().catch((error) => {
  console.error(`FAIL web-search-grounding: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
