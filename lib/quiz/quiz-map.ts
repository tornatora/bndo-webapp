import type { Json } from '@/lib/supabase/database.types';

export type QuizBandoType = 'sud' | 'centro_nord';

type Option = { value: string; label: string };
type Question = { id: string; title: string; options?: Option[]; freeText?: boolean };

const q10Sud: Option[] = [
  { value: 'A', label: '0 - 50.000 EUR' },
  { value: 'B', label: '50.000 - 120.000 EUR' },
  { value: 'C', label: '120.000 - 200.000 EUR' }
];

const q10CentroNord: Option[] = [
  { value: 'A', label: '0 - 40.000 EUR' },
  { value: 'B', label: '40.000 - 120.000 EUR' },
  { value: 'C', label: '120.000 - 200.000 EUR' }
];

export function getQuizQuestions(bandoType: QuizBandoType | null): Question[] {
  return [
    {
      id: 'q1',
      title: 'Quanti anni hai?',
      options: [
        { value: 'A', label: 'Meno di 18 anni' },
        { value: 'B', label: 'Tra 18 e 34 anni (inclusi)' },
        { value: 'C', label: '35 anni o piu' }
      ]
    },
    {
      id: 'q1b',
      title: 'Puoi costituire una societa con un socio 18-34 anni al 51%?',
      options: [
        { value: 'A', label: 'Si' },
        { value: 'B', label: 'No' }
      ]
    },
    {
      id: 'q2',
      title: 'Qual e la tua cittadinanza?',
      options: [
        { value: 'A', label: 'Italiana' },
        { value: 'B', label: 'UE' },
        { value: 'C', label: 'Extra UE con permesso di soggiorno valido' },
        { value: 'D', label: 'Extra UE senza permesso' }
      ]
    },
    { id: 'q3', title: "In quale regione aprirai l'attivita?", freeText: true },
    {
      id: 'q4',
      title: "Sei residente nella regione in cui aprirai l'attivita?",
      options: [
        { value: 'A', label: 'Si' },
        { value: 'B', label: 'No' }
      ]
    },
    {
      id: 'q4b',
      title: "Sei disposto a trasferire la residenza prima dell'erogazione?",
      options: [
        { value: 'A', label: 'Si' },
        { value: 'B', label: 'No' }
      ]
    },
    {
      id: 'q5',
      title: 'Qual e la tua situazione lavorativa attuale?',
      options: [
        { value: 'A', label: 'Disoccupato' },
        { value: 'B', label: 'Inoccupato' },
        { value: 'C', label: 'Iscritto Programma GOL' },
        { value: 'D', label: 'Working poor' },
        { value: 'E', label: 'Lavoratore a tempo determinato' },
        { value: 'F', label: 'Lavoratore a tempo indeterminato' },
        { value: 'G', label: 'Libero professionista / Partita IVA' }
      ]
    },
    {
      id: 'q5b',
      title: "Sei disposto a chiudere P.IVA o contratto prima dell'erogazione?",
      options: [
        { value: 'A', label: 'Si' },
        { value: 'B', label: 'No' }
      ]
    },
    {
      id: 'q5c',
      title: "Sei disposto a dimetterti prima dell'erogazione?",
      options: [
        { value: 'A', label: 'Si' },
        { value: 'B', label: 'No' }
      ]
    },
    {
      id: 'q6',
      title: 'Hai una Partita IVA attiva o chiusa di recente?',
      options: [
        { value: 'A', label: 'No, mai avuta' },
        { value: 'B', label: 'Si, ma e chiusa' },
        { value: 'C', label: 'Si, e attiva' }
      ]
    },
    {
      id: 'q6b',
      title: 'La nuova attivita ha progetto diverso o primi 3 numeri ATECO diversi?',
      options: [
        { value: 'A', label: 'Si' },
        { value: 'B', label: 'No' }
      ]
    },
    {
      id: 'q7',
      title: "Come intendi avviare l'attivita?",
      options: [
        { value: 'A', label: 'Ditta individuale' },
        { value: 'B', label: 'Societa' },
        { value: 'C', label: 'Attivita professionale' }
      ]
    },
    {
      id: 'q8',
      title: 'Sono presenti soci con 35 anni o piu?',
      options: [
        { value: 'A', label: 'No' },
        { value: 'B', label: 'Si' }
      ]
    },
    {
      id: 'q8b',
      title: 'Il socio 18-34 anni deterra almeno il 51%?',
      options: [
        { value: 'A', label: 'Si' },
        { value: 'B', label: 'No' }
      ]
    },
    {
      id: 'q9',
      title: "Qual e lo stato dell'attivita?",
      options: [
        { value: 'A', label: 'Non ancora avviata' },
        { value: 'B', label: 'Avviata da meno di 1 mese' },
        { value: 'C', label: 'Avviata da piu di 1 mese' }
      ]
    },
    {
      id: 'q10',
      title: "Qual e l'investimento complessivo previsto?",
      options: bandoType === 'sud' ? q10Sud : q10CentroNord
    },
    {
      id: 'q11',
      title: 'Quante risorse personali puoi dimostrare di avere disponibili?',
      options: [
        { value: 'A', label: 'Meno del 10%' },
        { value: 'B', label: 'Circa il 10%' },
        { value: 'C', label: 'Oltre il 10%' }
      ]
    }
  ];
}

export function formatQuizAnswerValue(question: Question, raw: unknown) {
  if (raw == null) return null;
  const value = typeof raw === 'string' ? raw : String(raw);
  if (question.freeText) return value || null;
  if (!question.options) return value || null;
  const match = question.options.find((o) => o.value === value);
  return match ? match.label : value;
}

export function safeAnswersRecord(answers: Json): Record<string, unknown> {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return {};
  return answers as Record<string, unknown>;
}

