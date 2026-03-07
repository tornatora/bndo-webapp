import { loadHybridDatasetDocs } from '../lib/matching/datasetRepository';

async function inspect() {
  const { docs } = await loadHybridDatasetDocs();
  const bando = docs.find(d => d.title?.includes('ammodernamento Artigianato artistico'));
  if (bando) {
    console.log('ID:', bando.id);
    console.log('Title:', bando.title);
    console.log('Regions:', bando.regions);
    console.log('Authority:', bando.authorityName);
  } else {
    console.log('Bando not found');
  }
}

inspect().catch(console.error);
