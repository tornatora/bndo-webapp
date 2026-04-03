import type { PracticeType } from '@/lib/bandi';

export const SUPPORT_WHATSAPP_NUMBER = '+393477298671';
export const SUPPORT_WHATSAPP_URL = 'https://wa.me/393477298671';

export function buildEligibleQuizWhatsAppUrl(practiceType: PracticeType) {
  const measureLabel = practiceType === 'resto_sud_2_0' ? 'Resto al Sud 2.0' : 'Autoimpiego Centro Nord';
  const text = `Salve, sono risultato idoneo per il bando ${measureLabel} e vorrei maggiori informazioni prima di avviare la pratica.`;
  return `https://wa.me/393477298671?text=${encodeURIComponent(text)}`;
}
