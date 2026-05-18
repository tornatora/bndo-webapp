import { NextResponse } from 'next/server';
import { sendQuizSubmissionAlertEmail } from '@/lib/services/email';

/**
 * GET /api/diagnostic/email/test-quiz
 *
 * Invia una mail di test che simula una notifica quiz completa (con risposte, nome, esito).
 * Esattamente come quella che arriva quando un utente compila un quiz sul sito.
 *
 * Opzionale: ?to=email@esempio.com per inviare a un destinatario specifico
 * (default: usa admin@bndo.it dal client)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const customTo = searchParams.get('to')?.trim().toLowerCase();

  const recipients = customTo
    ? [customTo]
    : [process.env.QUIZ_NOTIFICATION_EMAIL || 'admin@bndo.it'];

  const result = await sendQuizSubmissionAlertEmail({
    recipients,
    fullName: 'Mario Rossi (TEST)',
    email: 'mario.rossi@esempio.it',
    phone: '+39 333 1234567',
    quizType: 'Quiz Autoimpiego (Resto al Sud 2.0)',
    practiceTitle: 'Resto al Sud 2.0',
    eligibility: 'eligible',
    submittedAtIso: new Date().toISOString(),
    adminLink: 'https://bndo.it/admin/quiz-responses',
    answers: {
      'Hai già una Partita IVA?': 'No, la aprirò se idoneo',
      'Sei residente in una delle regioni del Sud Italia?': 'Sì, in Campania',
      'Hai meno di 35 anni?': 'Sì, ho 28 anni',
      'Qual è il tuo titolo di studio?': 'Laurea magistrale',
      'Hai esperienza nel settore?': 'Sì, 3 anni',
      'Quanti soci coinvolgerai?': '2 soci',
      'Hai già individuato la sede operativa?': 'Sì, a Napoli',
      'Budget stimato per l\'investimento?': 'Circa 40.000€',
      'Hai già un business plan?': 'Sì, bozza da perfezionare',
      'Come hai conosciuto BNDO?': 'Ricerca online',
    },
  });

  return NextResponse.json({
    testMode: true,
    recipients,
    sent: result.sent,
    skipped: !!result.skipped,
    error: result.error || null,
    providerMessageId: result.providerMessageId || null,
    note: 'Controlla la tua casella email. Se la mail non arriva, controlla anche lo spam.',
    timestamp: new Date().toISOString(),
  });
}
