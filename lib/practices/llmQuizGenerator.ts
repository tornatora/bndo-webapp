import { OpenAI } from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import type { GrantDetailRecord, GrantExplainabilityRecord } from '@/lib/grants/details';
import type { PracticeQuizQuestion, PracticeQuizOption } from './orchestrator';

const openai = new OpenAI(); // Automatically uses OPENAI_API_KEY from environment

// Schema definition for the expected JSON structured output from the LLM
const PracticeQuizOptionSchema = z.object({
  value: z.string(),
  label: z.string()
});

const PracticeQuizQuestionSchema = z.object({
  questionKey: z.string().describe("Identificativo univoco della domanda in inglese snake_case (es. age_check, region_check)"),
  label: z.string().describe("La domanda cruda e diretta posta all'utente (es. 'Hai un'eta compresa tra 18 e 35 anni?', 'Sei disoccupato?', 'Aprirai l'attivita nel Mezzogiorno?')"),
  description: z.string().nullable().describe("Spiegazione aggiuntiva breve. Può essere null."),
  reasoning: z.string().describe("Spiegazione tecnica del PERCHÉ questa domanda è fondamentale per questo bando specifico, citando se possibile la soglia o il requisito normativo."),
  questionType: z.enum(['single_select', 'boolean', 'text', 'number']),
  options: z.array(PracticeQuizOptionSchema).describe("Per 'boolean', fornisci sempre: [{value: 'yes', label: 'Si'}, {value: 'no', label: 'No'}]"),
  isRequired: z.boolean().describe("Imposta sempre a true per le domande fondamentali."),
  validation: z.object({
    min: z.number().nullable().optional(),
    max: z.number().nullable().optional(),
    maxLength: z.number().nullable().optional()
  }).describe("Regole sui campi input testuali o numerici, default { }"),
  rule: z.object({
    kind: z.enum(['critical_boolean', 'investment_range', 'ateco_validation', 'geographic_validation', 'informational', 'none']),
    expected: z.string().nullable().optional()
  }).describe("CRITICO: Per i requisiti bloccanti usa 'critical_boolean'. Per ATECO usa 'ateco_validation'. Per Sede usa 'geographic_validation'."),
  metadata: z.object({
    category: z.string().nullable().optional()
  }).describe("Categoria (es. { category: 'age' })")
});

const QuizTemplateSchema = z.object({
  questions: z.array(PracticeQuizQuestionSchema).describe("Lista di domande CRITICHE (max 10). Più sono specifiche e 'hard', meglio è.")
});

export async function generatePracticeQuizTemplateWithAI(
  detail: GrantDetailRecord,
  explainability: GrantExplainabilityRecord
): Promise<PracticeQuizQuestion[]> {
  const systemPrompt = `Sei l'intelligenza artificiale di BNDO, un esperto seniore di finanza agevolata italiana.
Il tuo compito è creare un quiz di pre-fattibilità "Level MAX" per un bando specifico.
L'obiettivo è ESSERE SPIETATI: devi escludere immediatamente chiunque non abbia i requisiti minimi, evitando domande "soft" o generiche.

Esempi di domande LIVELLO MAX:
- "Il tuo fatturato 2023 è superiore a 500.000€?" (Invece di "Hai un buon fatturato?")
- "La tua azienda è iscritta al Registro Imprese da almeno 24 mesi?" (Invece di "L'azienda è operativa?")
- "Il 51% della compagine sociale è composta da donne o giovani under 35?" (Invece di "Sei un'impresa femminile/giovanile?")
- "Qual è il tuo codice ATECO primario?" (Indispensabile se il bando ha restrizioni settoriali).

Regole TASSATIVE:
1. **Reasoning**: Per ogni domanda, spiega il PERCHÉ normativo (es: "Il bando richiede l'iscrizione al registro imprese da almeno 2 anni ai sensi dell'Art. 4").
2. **Fast-Fail**: Usa 'critical_boolean' per ogni requisito bloccante.
3. **Specificità**: Se il bando cita soglie numeriche (euro, anni, dipendenti), USALE nella domanda.
6. **Documentazione**: Ogni bando ha requisiti documentali diversi. Analizza attentamente la 'Descrizione' e i 'Requisiti' forniti per estrarre la lista REALE dei documenti necessari (es. Preventivi, Business Plan, ISEE, ecc.). Se generi una domanda sulla documentazione, DEVI elencare esplicitamente tali documenti nella 'description' o nella 'label' della domanda. NON citare documenti come la 'DID' a meno che non sia esplicitamente richiesta per quel bando specifico.

Usa un tono professionale ma diretto (dai del tu all'utente).`;

  const bandoInfo = `
Titolo: ${detail.title}
Tipo Agevolazione: ${detail.aidForm}
CPV Code: ${detail.cpvCode || 'Non specificato'}
Beneficiari: ${detail.beneficiaries.join(', ')}
Settori ammessi: ${detail.sectors.join(', ')}

Documentazione Minima Richiesta:
${detail.requiredDocuments?.length ? detail.requiredDocuments.join(', ') : 'Non specificata esplicitamente (estrai dalla descrizione se presente)'}

Descrizione Testuale del Bando (Normativa):
${detail.description || 'Nessuna descrizione disponibile.'}

Requisiti da estrarre e verificare (hard/soft):
${JSON.stringify({
  requisitiDuri: detail.requisitiHard,
  requisitiSoft: detail.requisitiSoft,
  coseMancantiSpessoInGere: explainability.missingRequirements
}, null, 2)}
`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o', // Upgraded to GPT-4o for maximum precision
      messages: [
        { role: 'system', content: systemPrompt },
        { 
          role: 'user', 
          content: `Genera le domande fondamentali (massimo 10) per verificare i requisiti bloccanti di questo bando:\n\n${bandoInfo}\n\nRISPONDI ESATTAMENTE CON UN OGGETTO JSON CHE RISPETTI QUESTO SCHEMA:\n{"questions": [{"questionKey": "string", "label": "string", "description": "string|null", "reasoning": "string", "questionType": "single_select|boolean|text|number", "options": [{"value": "string", "label": "string"}], "isRequired": true, "validation": {"min": 0, "max": 0, "maxLength": 0}, "rule": {"kind": "critical_boolean|investment_range|ateco_validation|geographic_validation|informational|none", "expected": "string|null"}, "metadata": {"category": "string"}}]}` 
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    const rawContent = completion.choices[0]?.message.content;
    if (!rawContent) return [];
    const parsedData = JSON.parse(rawContent);
    const parsed = QuizTemplateSchema.parse(parsedData);

    if (!parsed || !parsed.questions) {
      console.warn('[generatePracticeQuizTemplateWithAI] OpenAI failed to parse questions');
      return [];
    }

    // Convert the parsed zod objects back into the exact expected type (Record<string, unknown>)
    return parsed.questions.map((q: any) => {
      // Clean up nulls
      const validationObj: Record<string, unknown> = {};
      if (q.validation?.min != null) validationObj.min = q.validation.min;
      if (q.validation?.max != null) validationObj.max = q.validation.max;
      if (q.validation?.maxLength != null) validationObj.maxLength = q.validation.maxLength;

      const ruleObj: any = {
        kind: q.rule.kind
      };
      if (q.rule.expected != null) {
        ruleObj.expected = q.rule.expected;
      }

      const metaObj: Record<string, unknown> = {};
      if (q.metadata?.category != null) {
        metaObj.category = q.metadata.category;
      }

      return {
        questionKey: q.questionKey,
        label: q.label,
        description: q.description,
        reasoning: q.reasoning,
        questionType: q.questionType,
        options: q.options as PracticeQuizOption[],
        isRequired: q.isRequired,
        validation: validationObj,
        rule: ruleObj,
        metadata: metaObj
      } as PracticeQuizQuestion;
    });
  } catch (error) {
    console.error('[generatePracticeQuizTemplateWithAI] OpenAI Error:', error);
    return [];
  }
}
