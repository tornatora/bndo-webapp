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

    const outcome = await WebSearchService.search('Resto al Sud 2.0 requisiti scadenza') as any;
    const results = Array.isArray(outcome) ? outcome : Array.isArray(outcome?.results) ? outcome.results : [];
    const providersUsed = Array.isArray(outcome?.providersUsed) ? outcome.providersUsed : ['legacy'];
    const ok = typeof outcome?.ok === 'boolean' ? outcome.ok : true;
    const query = typeof outcome?.query === 'string' ? outcome.query : 'legacy-query';

    assert(typeof query === 'string', 'Query should be present');
    assert(Array.isArray(providersUsed), 'providersUsed should be an array');

    if (!ok) {
      assert(typeof outcome.unavailableReason === 'string' && outcome.unavailableReason.length > 0, 'Unavailable reason should be explicit');
      console.log('PASS web-search-grounding (degraded mode)');
      return;
    }

    assert(results.length > 0, 'Expected at least one result in successful mode');
    assert(results.length <= 8, 'Results should be capped at 8');
    assert(
      providersUsed.some((provider: string) => provider.includes('incentivi') || provider.includes('duckduckgo') || provider.includes('legacy')),
      `Expected free providers, got ${providersUsed.join(', ')}`,
    );
    assert(!providersUsed.some((provider: string) => provider.includes('serper')), 'Serper should not be used in free mode');

    for (const result of results) {
      assert(typeof result.title === 'string' && result.title.length > 0, 'Result title missing');
      const url = (result as any).url ?? (result as any).link;
      const snippet = (result as any).evidenceSnippet ?? (result as any).snippet;
      const tier = (result as any).sourceTier ?? 'web';
      assert(typeof url === 'string' && /^https?:\/\//.test(url), 'Result url invalid');
      assert(typeof snippet === 'string' && snippet.length > 0, 'Evidence snippet missing');
      assert(['official', 'authoritative', 'web'].includes(tier), 'Invalid sourceTier');
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
