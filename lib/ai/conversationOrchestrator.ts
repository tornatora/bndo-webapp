/**
 * Conversation Orchestrator V2
 *
 * Architettura: Deterministic-First, LLM as Sensor/Translator
 *
 * Flusso:
 * 1. Extraction euristica deterministica (profileExtractor) – sempre
 * 2. Grounded FAQ/Measure check – prima di OpenAI
 * 3. Profile Completeness evaluation
 * 4. Decision: ask_clarification | run_scan | answer_measure_question | answer_general_qa
 * 5. LLM extraction (opzionale, solo se OPENAI_API_KEY presente)
 * 6. Merge controllato
 * 7. Validation finale in TypeScript – sovrascrive sempre le decisioni LLM
 *
 * REGOLE ANTI-HALLUCINATION:
 * - Il LLM non decide mai la compatibilità dei bandi
 * - Lo scan parte SOLO con strong_ready profile
 * - FAQ e misure usano SOLO knowledge modules grounded
 * - In assenza di OPENAI_API_KEY: fallback deterministico completo
 */
import { ChatDecisionModel, ChatAction } from './ChatDecisionModel';
import { STRUCTURED_EXTRACTION_SYSTEM_PROMPT } from './structuredPrompt';
import { UserFundingProfile } from '../../types/userFundingProfile';
import { UserProfile } from '../conversation/types';
import { evaluateScanReadiness } from '../conversation/scanReadiness';
import { WebSearchService } from './webSearchEngine';
import { evaluateProfileCompleteness } from '../conversation/profileCompleteness';
import { answerFaq, buildKnowledgeContext as buildKnowledgeContextFromRules } from '../knowledge/regoleBandi';
import {
    answerGroundedMeasureQuestion,
    composeConsultantMeasureReply,
    detectMeasureIds,
    isClosedMeasureQuestion
} from '../knowledge/groundedMeasureAnswerer';
import { extractProfileFromMessage } from '../engines/profileExtractor';
import { getChangedFields, evolveFundingGoal } from '../conversation/profileMemory';
import { detectTurnIntent, isDiscoveryIntent, isQuestionLike } from '../conversation/intentRouter';
import { loadHybridDatasetDocs } from '../matching/datasetRepository';
import { evaluateHardEligibility } from '../matching/eligibilityEngine';
import { normalizeProfile } from '../matching/profileNormalizer';
import { NormalizedMatchingProfile } from '../matching/types';

const DEFAULT_SIMPLE_MODEL = 'gpt-4.1-mini';
const DEFAULT_COMPLEX_MODEL = 'gpt-4o';
const DEFAULT_EXTRACTION_MODEL = 'gpt-4o-mini';

export type ChatCitation = {
  title: string;
  url: string;
  sourceTier: 'official' | 'authoritative' | 'web';
  publishedAt: string | null;
  evidenceSnippet: string;
};

export type ModelRoutingDecision = {
  modelUsed: string;
  routingReason: string;
  complexity: 'simple' | 'complex';
};

function resolveConversationModels() {
    const configuredComplex = process.env.OPENAI_MODEL_COMPLEX?.trim() || DEFAULT_COMPLEX_MODEL;
    const configuredSimple = process.env.OPENAI_MODEL_SIMPLE?.trim();
    const legacySimple = process.env.OPENAI_MODEL?.trim();
    const simpleModel = configuredSimple || (legacySimple && legacySimple !== configuredComplex ? legacySimple : DEFAULT_SIMPLE_MODEL);
    const complexModel = configuredComplex;
    const extractionModel = process.env.OPENAI_MODEL_EXTRACTION?.trim() || DEFAULT_EXTRACTION_MODEL;
    return { simpleModel, complexModel, extractionModel };
}

export function selectModelForTurn(args: {
    intent: ChatDecisionModel['intent'];
    action: ChatAction;
    message: string;
    groundedContext: string | null;
    citationsCount: number;
    models?: { simpleModel: string; complexModel: string };
}): ModelRoutingDecision {
    const models = args.models ?? resolveConversationModels();
    const norm = args.message.toLowerCase();
    const technicalTokens =
      /(requisit|ammissibil|normativ|de minimis|scadenz|aliquot|spesa|intensit|graduator|istruttori|document|ateco|invitalia|smart&start|resto al sud|sabatini|pnrr|credito d'imposta|transizione)/.test(
        norm
      );
    const isComplexIntent = args.intent === 'measure_question' || args.intent === 'general_qa';
    const needsDeepReasoning =
      technicalTokens ||
      Boolean(args.groundedContext) ||
      args.citationsCount > 0 ||
      args.action === 'answer_measure_question' ||
      args.action === 'answer_general_qa';

    if (isComplexIntent || needsDeepReasoning) {
      return {
        modelUsed: models.complexModel,
        routingReason: isComplexIntent
          ? 'Intent tecnico/QA su bando o misura'
          : 'Richiesta con reasoning tecnico o fonti web',
        complexity: 'complex'
      };
    }

    return {
      modelUsed: models.simpleModel,
      routingReason: 'Turno banale/profiling leggero',
      complexity: 'simple'
    };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function computeConfidenceScore(args: {
  intent: ChatDecisionModel['intent'];
  action: ChatAction;
  groundedContext: string | null;
  citationsCount: number;
  estimatedWithWarning: boolean;
}) {
  let score = 0.68;
  if (args.intent === 'measure_question' || args.intent === 'general_qa') score += 0.05;
  if (args.groundedContext) score += 0.08;
  if (args.citationsCount > 0) score += Math.min(0.12, args.citationsCount * 0.03);
  if (args.action === 'run_scan') score += 0.04;
  if (args.estimatedWithWarning) score -= 0.12;
  return Number(clamp(score, 0.35, 0.96).toFixed(2));
}

// ─── Strategic Feedback Generator ───────────────────────────────────────────

export async function calculateStrategicFeedback(profile: Partial<UserProfile>): Promise<string | null> {
    const { docs } = await loadHybridDatasetDocs().catch((err) => {
        console.error('[strategic-feedback] Error loading docs:', err);
        return { docs: [] };
    });
    if (!docs || docs.length === 0) return null;

    const normProfile = normalizeProfile(profile as Record<string, unknown>);

    let totalFiltered = 0;
    let atecoFiltered = 0;
    let budgetFiltered = 0;
    let regionFiltered = 0;

    for (const doc of docs) {
        const eligibility = evaluateHardEligibility(normProfile, doc);
        if (!eligibility.eligible) {
            totalFiltered++;
            if (eligibility.reason?.includes('ATECO')) atecoFiltered++;
            if (eligibility.reason?.includes('budget') || eligibility.reason?.includes('minimo')) budgetFiltered++;
            if (eligibility.reason?.includes('regione')) regionFiltered++;
        }
    }

    if (totalFiltered === 0) return null;

    const parts: string[] = [];
    if (regionFiltered > 0) parts.push(`${regionFiltered} fuori regione`);
    if (atecoFiltered > 0) parts.push(`${atecoFiltered} non adatti al tuo ATECO`);
    if (budgetFiltered > 0) parts.push(`${budgetFiltered} non compatibili con il tuo budget`);

    const remaining = docs.length - totalFiltered;
    if (parts.length === 0) return `Ho filtrato ${totalFiltered} bandi non compatibili. Restano ${remaining} opportunità.`;
    
    return `Tra gli 8.000 bandi mappati, ne ho esclusi ${parts.join(', ')}. Restano ${remaining} opportunità potenziali per te.`;
}

// ─── Payload builder for OpenAI structured extraction ──────────────────────────

export function buildExtractionPayload(
    userMessage: string, 
    memoryProfile: UserFundingProfile,
    history?: { role: string; text: string }[],
    groundedContext?: string | null
) {
    const messages: any[] = [
        { role: 'system', content: STRUCTURED_EXTRACTION_SYSTEM_PROMPT }
    ];

    if (history && history.length > 0) {
        for (const turn of history) {
            messages.push({ 
                role: turn.role === 'assistant' ? 'assistant' : 'user', 
                content: turn.text 
            });
        }
    }

    if (groundedContext) {
        messages.push({ 
            role: 'system', 
            content: `🎯 CONTESTO DI RIFERIMENTO (Usa questo come fonte di verità):\n${groundedContext}` 
        });
    }

    messages.push({ 
        role: 'user', 
        content: `Profilo attualmente memorizzato (JSON):\n${JSON.stringify(memoryProfile)}\n\nUltimo messaggio utente:\n${userMessage}` 
    });

    return {
        messages,
        response_format: {
            "type": "json_schema",
            "json_schema": {
                "name": "chat_decision_model",
                "strict": true,
                "schema": {
                    "type": "object",
                    "properties": {
                        "intent": { "type": "string", "enum": ['profiling', 'scan_ready', 'general_qa', 'measure_question', 'discovery', 'small_talk', 'handoff_human', 'off_topic', 'unknown'] },
                        "action": { "type": "string", "enum": ['ask_clarification', 'run_scan', 'refine_after_scan', 'answer_measure_question', 'answer_general_qa', 'no_result_explanation', 'handoff_human', 'small_talk', 'off_topic'] },
                        "reasoning": { "type": "string", "description": "Spiegazione logica della decisione presa." },
                        "response_text": { "type": "string", "description": "La risposta finale (prosa) da mostrare all'utente (max 30 parole)." },
                        "self_critique": { "type": "string", "description": "Analisi critica dell'AI sul proprio ragionamento per evitare ripetizioni o errori." },
                        "strategic_note": { "type": ["string", "null"], "description": "Suggerimento proattivo per il consulente." },
                        "extracted_profile_entities": {
                            "type": "object",
                            "properties": {
                                "regione": { "type": ["string", "null"] },
                                "provincia": { "type": ["string", "null"] },
                                "comune": { "type": ["string", "null"] },
                                "ateco": { "type": ["string", "null"] },
                                "settore": { "type": ["string", "null"] },
                                "dimensione_impresa": { "type": ["string", "null"], "enum": ["micro", "pmi", "grande", null] },
                                "forma_giuridica": { "type": ["string", "null"] },
                                "anni_attivita": { "type": ["number", "null"] },
                                "startup": { "type": ["boolean", "null"] },
                                "impresa_gia_costituita": { "type": ["boolean", "null"] },
                                "investimento_previsto": { "type": ["number", "null"] },
                                "contributo_richiesto": { "type": ["number", "null"] },
                                "numero_dipendenti": { "type": ["number", "null"] },
                                "eta_richiedente": { "type": ["number", "null"] },
                                "occupazione_richiedente": { "type": ["string", "null"] },
                                "obiettivo": { "type": ["string", "null"] },
                                "needs": { "type": ["array", "null"], "items": { "type": "string" } },
                                "is_private_request": { "type": ["boolean", "null"] },
                                "territory_basis": { "type": ["string", "null"], "enum": ["sede_legale", "sede_operativa", "luogo_investimento", "unknown", null] },
                                "team_maggioranza_femminile_giovanile": { "type": ["string", "null"], "enum": ["female", "youth", "mixed", "none", null] },
                                "agricoltura_terreni_iap": { "type": ["string", "null"], "enum": ["has_land_iap", "no_land_iap", "unknown", null] },
                                "innovazione_tecnologica_40": { "type": ["boolean", "null"] },
                                "iscrizione_albo_professionale": { "type": ["boolean", "null"] },
                                "is_third_sector": { "type": ["boolean", "null"] },
                                "property_status": { "type": ["string", "null"], "enum": ["owned", "rented_registered", "none", null] },
                                "mental_model": { "type": ["string", "null"] },
                                "hypotheses": { "type": ["array", "null"], "items": { "type": "string" } },
                                "risk_assessment": { "type": ["string", "null"] },
                                "success_probability": { "type": ["number", "null"] },
                                "strategic_synthesis": { "type": ["string", "null"] },
                                "commercial_pulse": { "type": ["string", "null"] },
                                "expert_nugget": { "type": ["string", "null"] },
                                "execution_roadmap": { "type": ["array", "null"], "items": { "type": "string" } },
                                "normative_deep_dive": { "type": ["string", "null"] }
                            },
                            "required": ["regione", "provincia", "comune", "ateco", "settore", "dimensione_impresa", "forma_giuridica", "anni_attivita", "startup", "impresa_gia_costituita", "investimento_previsto", "contributo_richiesto", "numero_dipendenti", "eta_richiedente", "occupazione_richiedente", "obiettivo", "needs", "is_private_request", "territory_basis", "team_maggioranza_femminile_giovanile", "agricoltura_terreni_iap", "innovazione_tecnologica_40", "iscrizione_albo_professionale", "is_third_sector", "property_status", "mental_model", "hypotheses", "risk_assessment", "success_probability", "strategic_synthesis", "commercial_pulse", "expert_nugget", "execution_roadmap", "normative_deep_dive"],
                            "additionalProperties": false
                        },
                        "missing_fields": { "type": "array", "items": { "type": "string" } },
                        "ambiguities": { "type": "array", "items": { "type": "string" } }
                    },
                    "required": ["intent", "action", "reasoning", "response_text", "self_critique", "strategic_note", "extracted_profile_entities", "missing_fields", "ambiguities"],
                    "additionalProperties": false
                }
            }
        }
    };
}

// ─── Merge + deterministic override ────────────────────────────────────────────

/**
 * Fonde l'output LLM con la memoria corrente e applica il decisore deterministico finale.
 * Il LLM può suggerire un'azione, ma la decisione finale appartiene sempre a TypeScript.
 */
export function validateAndMergeExtraction(
    llmResponse: ChatDecisionModel, 
    currentMemory: Partial<UserProfile>,
    message: string,
    history?: { role: string; text: string }[]
): { 
    mergedProfile: Partial<UserProfile>, 
    finalAction: ChatDecisionModel['action'],
    intent: ChatDecisionModel['intent'],
    missing_fields: string[],
    ambiguities: string[],
    groundedContext: string | null,
    activeMeasure?: { id: string | null; title: string | null },
    response_text?: string,
    strategic_note?: string | null,
    mental_model?: string | null,
    reasoning?: string | null,
    self_critique?: string | null,
    hypotheses?: string[] | null,
    risk_assessment?: string | null,
    success_probability?: number | null,
    strategic_synthesis?: string | null,
    commercial_pulse?: string | null,
    expert_nugget?: string | null,
    execution_roadmap?: string[] | null,
    normative_deep_dive?: string | null
} {
    const trimmed = message.trim();
    const extracted = llmResponse.extracted_profile_entities;

    // Translation from UserFundingProfile → UserProfile
    const updates: Partial<UserProfile> = {};
    if (extracted.regione) {
        updates.location = { 
            region: extracted.regione, 
            municipality: extracted.comune ?? currentMemory.location?.municipality ?? null 
        };
        updates.locationNeedsConfirmation = false;
    } else if (extracted.comune) {
        updates.location = { 
            region: currentMemory.location?.region ?? null, 
            municipality: extracted.comune 
        };
    }
    if (extracted.ateco) updates.ateco = extracted.ateco;
    if (extracted.settore) updates.sector = extracted.settore;
    if (extracted.forma_giuridica) updates.legalForm = extracted.forma_giuridica;
    if (typeof extracted.startup === 'boolean') updates.businessExists = !extracted.startup;
    if (typeof extracted.impresa_gia_costituita === 'boolean') updates.businessExists = extracted.impresa_gia_costituita;
    if (extracted.numero_dipendenti !== null && extracted.numero_dipendenti !== undefined) updates.employees = extracted.numero_dipendenti;
    if (extracted.investimento_previsto !== null && extracted.investimento_previsto !== undefined) {
        updates.revenueOrBudgetEUR = extracted.investimento_previsto;
        updates.budgetAnswered = true;
    }
    if (extracted.contributo_richiesto !== null && extracted.contributo_richiesto !== undefined) updates.requestedContributionEUR = extracted.contributo_richiesto;
    if (extracted.eta_richiedente !== null && extracted.eta_richiedente !== undefined) updates.age = extracted.eta_richiedente;
    if (extracted.occupazione_richiedente) updates.employmentStatus = extracted.occupazione_richiedente;
    
    // Per obiettivo: accettiamo solo se abbastanza specifico (non termine generico finanziario)
    if (extracted.obiettivo) {
        const g = extracted.obiettivo.trim().toLowerCase();
        const isGeneric = /^(bando|bandi|contributo|contributi|fondo perduto|finanziamento|finanziamenti|agevolazione|agevolazioni|incentivo|incentivi|misura|misure|fondi|aiut)$/.test(g);
        if (!isGeneric && g.length >= 5) {
            updates.fundingGoal = evolveFundingGoal(currentMemory.fundingGoal, extracted.obiettivo);
        }
    }

    // Advanced Intelligence Fields
    if (extracted.team_maggioranza_femminile_giovanile && extracted.team_maggioranza_femminile_giovanile !== 'none') {
        updates.teamMajority = extracted.team_maggioranza_femminile_giovanile;
    }
    if (extracted.agricoltura_terreni_iap && extracted.agricoltura_terreni_iap !== 'unknown') {
        updates.agricultureStatus = extracted.agricoltura_terreni_iap;
    }
    if (extracted.innovazione_tecnologica_40 !== null && extracted.innovazione_tecnologica_40 !== undefined) {
        updates.tech40 = extracted.innovazione_tecnologica_40;
    }
    if (extracted.iscrizione_albo_professionale !== null && extracted.iscrizione_albo_professionale !== undefined) {
        updates.professionalRegister = extracted.iscrizione_albo_professionale;
    }
    if (extracted.is_third_sector !== null && extracted.is_third_sector !== undefined) {
        updates.isThirdSector = extracted.is_third_sector;
    }
    if (extracted.property_status) {
        updates.propertyStatus = extracted.property_status as 'owned' | 'rented_registered' | 'none';
    }

    // Persist active measure if already in memory
    if (currentMemory.activeMeasureId) {
        updates.activeMeasureId = currentMemory.activeMeasureId;
        updates.activeMeasureTitle = currentMemory.activeMeasureTitle;
    }
    
    const mergedProfile = { ...currentMemory, ...updates };

    // ─── DECISORE DETERMINISTICO FINALE ────────────────────────────────────────
    // Il LLM può suggerire, ma la verità è qui.
    
    const completeness = evaluateProfileCompleteness(mergedProfile as UserProfile);
    const scanReady = completeness.level === 'strong_ready';

    let finalAction = llmResponse.action;
    let finalIntent = llmResponse.intent;
    let activeMeasure: { id: string | null; title: string | null } = { 
        id: mergedProfile.activeMeasureId ?? null, 
        title: mergedProfile.activeMeasureTitle ?? null 
    };

    // PRODUCTION LOCKDOWN: Regola di esclusione totale per richieste private
    const isDomesticRequest = (text: string) => {
        const n = text.toLowerCase();
        return (
            n.includes('ristrutturare casa') || 
            n.includes('ristrutturazione casa') || 
            n.includes('ristrutturare il mio') ||
            n.includes('ristrutturazione privata') ||
            n.includes('appartamento') || 
            n.includes('condominio') ||
            n.includes('casa mia') || 
            n.includes('mia stanza') ||
            n.includes('famiglia') || 
            n.includes('personale') && (n.includes('casa') || n.includes('auto')) ||
            n.includes('domestico') ||
            n.includes('arredare casa') ||
            n.includes('mobili per casa')
        );
    };

    const isForeignRequest = (text: string, extRegion: string | null) => {
        const n = text.toLowerCase();
        const countries = ['estero', 'francia', 'spagna', 'germania', 'america', 'usa', 'regno unito', 'uk', 'svizzera', 'europa', 'mondo'];
        const hasCountry = countries.some(c => n.includes(c));
        const isForeignRegion = extRegion === 'estero' || extRegion === 'all\'estero';
        return hasCountry || isForeignRegion;
    };

    if (extracted.is_private_request === true || isDomesticRequest(trimmed)) {
        finalAction = 'handoff_human'; // L'assistente deve rifiutare con il prompt off-topic
        finalIntent = 'off_topic';
    } else if (isForeignRequest(trimmed, extracted.regione ?? null)) {
        finalAction = 'handoff_human';
        finalIntent = 'off_topic';
        // We set a marker for the route to know it's a foreign request
        (mergedProfile as any).isForeignRequest = true;
    } else if (scanReady) {
        // Profilo strong_ready: andiamo allo scan a meno che non sia QA o esplicitamente piccola chiacchierata
        if (finalAction !== 'answer_measure_question' && finalAction !== 'answer_general_qa' && finalAction !== 'handoff_human' && finalIntent !== 'small_talk') {
            finalAction = 'run_scan';
        }
    } else if (completeness.level === 'hard_scan_ready') {
        // Profilo hard_scan_ready: BILANCIAMENTO. 
        // Se il LLM ha deciso di chiedere ancora (ask_clarification), lo lasciamo fare.
        // Se ha deciso di scansionare (run_scan), lo lasciamo fare.
        if (finalAction !== 'run_scan' && finalAction !== 'ask_clarification') {
             // Fallback: se ha deciso altro (es. QA), seguiamo il LLM.
        }
    } else {
        // Profilo non ancora sufficiente: blocca qualsiasi scan forzato
        if (finalAction === 'run_scan' || finalAction === 'refine_after_scan') {
            finalAction = 'ask_clarification';
        }
    }

    // Logic for avoiding repetition: Check if the AI is about to ask something it already asked
    if (history && history.length > 0 && finalAction === 'ask_clarification') {
        const lastQuestions = history
            .filter(h => h.role === 'assistant')
            .slice(-3)
            .map(h => h.text.toLowerCase());
        
        const isRepeating = lastQuestions.some(q => 
            q.includes(completeness.nextPriorityField?.toLowerCase() ?? '____') || 
            (llmResponse?.response_text && q.includes(llmResponse.response_text.toLowerCase().slice(0, 10)))
        );

        if (isRepeating && scanReady) {
            // Se sta ripetendo ma è quasi pronto, forza lo scan per sbloccare
            finalAction = 'run_scan';
        }
    }

    return { 
        mergedProfile, 
        finalAction, 
        intent: finalIntent, 
        missing_fields: completeness.missingSignals, 
        ambiguities: llmResponse.ambiguities,
        groundedContext: null, // Will be populated in runTwoPassChat if applicable
        activeMeasure,
        response_text: llmResponse.response_text,
        strategic_note: llmResponse.strategic_note,
        mental_model: extracted.mental_model,
        reasoning: llmResponse.reasoning,
        self_critique: llmResponse.self_critique,
        hypotheses: extracted.hypotheses,
        risk_assessment: extracted.risk_assessment,
        success_probability: extracted.success_probability,
        strategic_synthesis: extracted.strategic_synthesis,
        commercial_pulse: extracted.commercial_pulse,
        expert_nugget: extracted.expert_nugget,
        execution_roadmap: extracted.execution_roadmap,
        normative_deep_dive: extracted.normative_deep_dive
    };
}

export interface OrchestratorResult {
    mergedProfile: Partial<UserProfile>;
    finalAction: ChatAction;
    intent: ChatDecisionModel['intent'];
    missing_fields: string[];
    ambiguities: string[];
    groundedContext: string | null;
    factSource?: 'scanner_dataset' | 'faq' | 'mixed' | 'none';
    groundingStatus?: 'grounded' | 'estimated_with_warning' | 'degraded' | 'none';
    response_text?: string;
    strategicFeedback?: string | null;
    activeMeasure?: { id: string | null; title: string | null };
    strategic_note?: string | null;
    mental_model?: string | null;
    reasoning?: string | null;
    self_critique?: string | null;
    hypotheses?: string[] | null;
    risk_assessment?: string | null;
    success_probability?: number | null;
    strategic_synthesis?: string | null;
    commercial_pulse?: string | null;
    expert_nugget?: string | null;
    execution_roadmap?: string[] | null;
    normative_deep_dive?: string | null;
}

// ─── Two-Pass Chat (Deterministic + optional LLM) ──────────────────────────────

/**
 * Esegue il flusso conversazionale completo:
 * 1. Extraction deterministica (sempre)
 * 2. Grounded knowledge check (sempre)
 * 3. LLM extraction (solo se OPENAI_API_KEY configurata)
 * 4. Merge + decisione deterministica finale
 *
 * In assenza di OPENAI_API_KEY: fallback deterministico robusto senza crash.
 */
export async function runTwoPassChat(
    userMessage: string,
    currentMemory: Partial<UserProfile>,
    history?: { role: string; text: string }[]
): Promise<OrchestratorResult> {
    const { extractionModel } = resolveConversationModels();

    // ── PASS 1: HEURISTIC EXTRACTION (sempre attivo) ──────────────────────────
    const heuristic = extractProfileFromMessage(userMessage);
    const updates: Partial<UserProfile> = {};
    
    if (heuristic.updates.location?.region) {
        updates.location = { 
            region: heuristic.updates.location.region, 
            municipality: currentMemory.location?.municipality ?? null 
        };
    }
    if (heuristic.updates.sector) updates.sector = heuristic.updates.sector;
    if (heuristic.updates.fundingGoal) {
        updates.fundingGoal = evolveFundingGoal(currentMemory.fundingGoal, heuristic.updates.fundingGoal);
    }
    if (heuristic.updates.businessExists !== undefined) updates.businessExists = heuristic.updates.businessExists;
    if (heuristic.updates.activityType) updates.activityType = heuristic.updates.activityType;
    if (heuristic.updates.age !== undefined && heuristic.updates.age !== null) updates.age = heuristic.updates.age;
    if (heuristic.updates.ageBand) updates.ageBand = heuristic.updates.ageBand;
    if (heuristic.updates.employmentStatus) updates.employmentStatus = heuristic.updates.employmentStatus;
    if (heuristic.updates.legalForm) updates.legalForm = heuristic.updates.legalForm;
    if (heuristic.updates.revenueOrBudgetEUR !== undefined && heuristic.updates.revenueOrBudgetEUR !== null) {
        updates.revenueOrBudgetEUR = heuristic.updates.revenueOrBudgetEUR;
        updates.budgetAnswered = true;
    }
    if (heuristic.updates.requestedContributionEUR !== undefined && heuristic.updates.requestedContributionEUR !== null) {
        updates.requestedContributionEUR = heuristic.updates.requestedContributionEUR;
    }
    if (heuristic.updates.employees !== undefined && heuristic.updates.employees !== null) {
        updates.employees = heuristic.updates.employees;
    }
    if (heuristic.updates.ateco) {
        updates.ateco = heuristic.updates.ateco;
        updates.atecoAnswered = true;
    }
    if (heuristic.updates.contributionPreference) updates.contributionPreference = heuristic.updates.contributionPreference;
    if (heuristic.updates.contactEmail) updates.contactEmail = heuristic.updates.contactEmail;
    if (heuristic.updates.contactPhone) updates.contactPhone = heuristic.updates.contactPhone;
    if (heuristic.updates.locationNeedsConfirmation !== undefined) updates.locationNeedsConfirmation = heuristic.updates.locationNeedsConfirmation;
    
    const baseProfile = { ...currentMemory, ...updates };

    // ── PASS 2: GROUNDED KNOWLEDGE CHECK (sempre, prima di OpenAI) ───────────
    const isQuestion = isQuestionLike(userMessage);
    const hasProfilingData = getChangedFields(currentMemory as UserProfile, baseProfile as UserProfile).length > 0;
    const isDiscovery = isDiscoveryIntent(userMessage);

    // Measure question check
    const measureResponse = await answerGroundedMeasureQuestion(userMessage, {
      activeMeasureId: currentMemory.activeMeasureId ?? null,
      activeMeasureTitle: currentMemory.activeMeasureTitle ?? null,
    });
    let groundedContext: string | null = null;
    if (measureResponse && isQuestion) {
        groundedContext = measureResponse.text;
        if (!hasProfilingData) {
            return {
                mergedProfile: {
                    ...baseProfile,
                    activeMeasureId: measureResponse.measureId,
                    activeMeasureTitle: measureResponse.measureName ?? detectMeasureIds(userMessage)[0]?.name ?? null
                },
                finalAction: 'answer_measure_question' as const,
                intent: 'measure_question' as const,
                missing_fields: [],
                ambiguities: [],
                groundedContext,
                strategicFeedback: undefined,
                activeMeasure: {
                    id: measureResponse.measureId,
                    title: measureResponse.measureName ?? detectMeasureIds(userMessage)[0]?.name ?? null
                }
            };
        }
        // If we found a measure in the question, lock it in the mergedProfile for Pass 4
        baseProfile.activeMeasureId = measureResponse.measureId;
        baseProfile.activeMeasureTitle = measureResponse.measureName ?? detectMeasureIds(userMessage)[0]?.name ?? null;
    }

    // FAQ check
    const faqResponse = answerFaq(userMessage);
    if (faqResponse && isQuestion && !hasProfilingData && !isDiscovery) {
        return {
            mergedProfile: baseProfile,
            finalAction: 'answer_general_qa' as const,
            intent: 'general_qa' as const,
            missing_fields: [],
            ambiguities: [],
            groundedContext: faqResponse,
            strategicFeedback: undefined,
            activeMeasure: {
                id: baseProfile.activeMeasureId ?? null,
                title: baseProfile.activeMeasureTitle ?? null
            }
        };
    }
    if (faqResponse && isQuestion && hasProfilingData) {
        groundedContext = faqResponse;
    }

    // ── PASS 3: COMPLETENESS CHECK DETERMINISTICO ─────────────────────────────
    const completeness = evaluateProfileCompleteness(baseProfile as UserProfile);
    
    // Build the UserFundingProfile for LLM context
    const memoryProfile: UserFundingProfile = {
        regione: baseProfile.location?.region ?? null,
        provincia: null,
        comune: baseProfile.location?.municipality ?? null,
        ateco: (baseProfile.ateco as string) ?? null,
        settore: (baseProfile.sector as string) ?? null,
        dimensione_impresa: null,
        forma_giuridica: (baseProfile.legalForm as string) ?? null,
        anni_attivita: null,
        startup: baseProfile.businessExists === false ? true : baseProfile.businessExists === true ? false : null,
        impresa_gia_costituita: baseProfile.businessExists ?? null,
        investimento_previsto: (baseProfile.revenueOrBudgetEUR as number) ?? null,
        contributo_richiesto: (baseProfile.requestedContributionEUR as number) ?? null,
        numero_dipendenti: (baseProfile.employees as number) ?? null,
        eta_richiedente: (baseProfile.age as number) ?? null,
        occupazione_richiedente: (baseProfile.employmentStatus as string) ?? null,
        obiettivo: (baseProfile.fundingGoal as string) ?? null,
        needs: []
    };

    // --- PASS 3.5: REAL-TIME WEB INTELLIGENCE ---
    const activeMeasure = {
        id: baseProfile.activeMeasureId ?? (measureResponse?.measureId ?? null),
        title: baseProfile.activeMeasureTitle ?? (detectMeasureIds(userMessage)[0]?.name ?? null)
    };

    if (groundedContext && activeMeasure.id && (isDiscovery || isQuestion)) {
        try {
            const searchOutcome = await WebSearchService.search(`${activeMeasure.title} requisiti scadenza aggiornamenti`);
            if (searchOutcome.ok && searchOutcome.results.length > 0) {
                const searchContext = searchOutcome.results
                  .slice(0, 4)
                  .map((result) => `• [${result.sourceTier.toUpperCase()}] ${result.title}: ${result.evidenceSnippet} (Link: ${result.url})`)
                  .join('\n');
                groundedContext = `[DATI WEB RECENTI]\n${searchContext}\n\n[DATI INTERNI]\n${groundedContext}`;
            } else if (!searchOutcome.ok && searchOutcome.unavailableReason) {
                groundedContext = `${groundedContext}\n\nNota fonti web: ${searchOutcome.unavailableReason}`;
            }
        } catch (searchError) {
            console.error('[Orchestrator] Search pass failed:', searchError);
        }
    }

    // ── PASS 4: LLM EXTRACTION (opzionale, fallback se assente) ──────────────
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    
    if (!apiKey) {
        // FALLBACK DETERMINISTICO: nessun OpenAI, logica pura
        const scanReady = completeness.level === 'strong_ready';
        const finalAction = scanReady ? 'run_scan' : 'ask_clarification';
        const intent = scanReady ? 'scan_ready' : 'profiling';
        return {
            mergedProfile: baseProfile,
            finalAction: finalAction as ChatDecisionModel['action'],
            intent: (groundedContext ? 'measure_question' : intent) as ChatDecisionModel['intent'],
            missing_fields: completeness.missingSignals,
            ambiguities: [],
            groundedContext,
            strategicFeedback: undefined,
            activeMeasure: {
                id: baseProfile.activeMeasureId ?? null,
                title: baseProfile.activeMeasureTitle ?? null
            }
        };
    }

    try {
        const payload = buildExtractionPayload(userMessage, memoryProfile, history, groundedContext);
        
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: extractionModel,
                ...payload,
                temperature: 0.0
            })
        });

        if (!response.ok) {
            // OpenAI error: fallback deterministico
            console.warn(`[orchestrator] OpenAI error ${response.status}, falling back to deterministic`);
            const scanReady = completeness.level === 'strong_ready';
            return {
                mergedProfile: baseProfile,
                finalAction: (scanReady ? 'run_scan' : 'ask_clarification') as ChatDecisionModel['action'],
                intent: (groundedContext ? 'measure_question' : (scanReady ? 'scan_ready' : 'profiling')) as ChatDecisionModel['intent'],
                missing_fields: completeness.missingSignals,
                ambiguities: [],
                groundedContext,
                activeMeasure: {
                    id: baseProfile.activeMeasureId ?? null,
                    title: baseProfile.activeMeasureTitle ?? null
                }
            };
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        
        if (!content) {
            // No content: fallback deterministico
            const scanReady = completeness.level === 'strong_ready';
            return {
                mergedProfile: baseProfile,
                finalAction: (scanReady ? 'run_scan' : 'ask_clarification') as ChatDecisionModel['action'],
                intent: (groundedContext ? 'measure_question' : (scanReady ? 'scan_ready' : 'profiling')) as ChatDecisionModel['intent'],
                missing_fields: completeness.missingSignals,
                ambiguities: [],
                groundedContext,
                activeMeasure: {
                    id: baseProfile.activeMeasureId ?? null,
                    title: baseProfile.activeMeasureTitle ?? null
                }
            };
        }

        const parsedLlmResponse = JSON.parse(content) as ChatDecisionModel;
        const finalResult = validateAndMergeExtraction(parsedLlmResponse, baseProfile, userMessage, history);
        
        // Calculate strategic feedback if substantial profile info is present
        let strategicFeedback: string | undefined;
        if (baseProfile.location?.region || baseProfile.ateco || baseProfile.revenueOrBudgetEUR) {
            strategicFeedback = await calculateStrategicFeedback(baseProfile) || undefined;
        }

        return { 
            ...finalResult, 
            groundedContext,
            strategicFeedback,
            intent: (groundedContext ? 'measure_question' : finalResult.intent) as ChatDecisionModel['intent']
        };
        
    } catch (e) {
        // Exception (parse error, network): fallback deterministico, no crash
        console.warn('[orchestrator] Fallback to deterministic due to error:', e instanceof Error ? e.message : String(e));
        const scanReady = completeness.level === 'strong_ready';
        return {
            mergedProfile: baseProfile,
            finalAction: (scanReady ? 'run_scan' : 'ask_clarification') as ChatDecisionModel['action'],
            intent: (groundedContext ? 'measure_question' : (scanReady ? 'scan_ready' : 'profiling')) as ChatDecisionModel['intent'],
            missing_fields: completeness.missingSignals,
            ambiguities: [],
            groundedContext,
            strategicFeedback: undefined,
            activeMeasure: {
                id: baseProfile.activeMeasureId ?? null,
                title: baseProfile.activeMeasureTitle ?? null
            }
        };
    }
}

export async function* runStreamingChat(
    userMessage: string,
    currentMemory: Partial<UserProfile>,
    history?: { role: string; text: string }[],
    options?: { strictFocusedGrant?: boolean }
): AsyncGenerator<{ type: 'text' | 'metadata' | 'error' | 'thinking'; content: any }> {
    const { simpleModel, complexModel, extractionModel } = resolveConversationModels();
    const apiKey = process.env.OPENAI_API_KEY?.trim();

    // 0. SIGNAL IMMEDIATE THINKING STATE: Formula 1 TTFT Goal
    yield { type: 'thinking', content: true };

    const strictFocusedGrant = Boolean(options?.strictFocusedGrant);
    const intentData = detectTurnIntent({ message: userMessage, sessionQaMode: false });
    const isGreetingOnly = intentData.greeting && !intentData.discovery && !intentData.questionLike;
    
    // --- ULTRA FAST PATH: Hardcoded Greetings (Skip OpenAI) ---
    if (isGreetingOnly) {
      const greetings = [
        "Ciao! Sono il tuo assistente BNDO. Come posso aiutarti oggi a trovare il finanziamento giusto per il tuo progetto?",
        "Ehilà! Benvenuto su BNDO. Hai in mente un progetto specifico da finanziare o vuoi che ti aiuti a scoprire le opportunità disponibili?",
        "Ciao! Sono pronto ad aiutarti a navigare tra i bandi e gli incentivi. Da dove vogliamo iniziare?"
      ];
      const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
      
      yield { type: 'thinking', content: false };
      // Simulated stream for consistency
      const words = randomGreeting.split(' ');
      for (const word of words) {
        yield { type: 'text', content: word + ' ' };
        // No await needed here, we want it essentially instant but streamed for UI consistency
      }
      
      yield {
        type: 'metadata',
        content: {
          mergedProfile: currentMemory,
          finalAction: 'small_talk',
          intent: 'small_talk',
          missing_fields: [],
          ambiguities: [],
          groundedContext: null,
          factSource: 'none',
          groundingStatus: 'none',
          strategicFeedback: undefined,
          activeMeasure: {
            id: currentMemory.activeMeasureId ?? null,
            title: currentMemory.activeMeasureTitle ?? null
          },
          response_text: randomGreeting
        }
      };
      return;
    }

    async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
        if (ms <= 0) return promise.catch(() => fallback);
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        try {
            return await Promise.race([
                promise,
                new Promise<T>((resolve) => {
                    timeoutId = setTimeout(() => resolve(fallback), ms);
                })
            ]);
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }
    }

    function sanitizeUserFacingMeasureText(text: string) {
      return text
        .replace(/https?:\/\/\S+/gi, '')
        .replace(/\[[^\]]+]\((https?:\/\/[^)]+)\)/gi, '')
        .replace(/\bforma aiuto:\s*/gi, '')
        .replace(/\bcopertura indicativa:\s*/gi, '')
        .replace(/\bstima forte bndo:\s*/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    }

    function isClosedMeasurePrompt(msg: string) {
      const n = msg.toLowerCase();
      const asksClosed =
        /\b(100|100%|tutto|interamente|fondo perduto|voucher|ammissibil|copre|posso|si puo|si può)\b/.test(n) &&
        /\?/.test(msg);
      return asksClosed;
    }

    function hasContradictingOpening(
      question: string,
      measure: { outcome?: string; factsSnapshot?: { coversUpTo100?: boolean | null } | null },
      candidate: string
    ) {
      const lowerQuestion = question.toLowerCase();
      const lowerReply = candidate.trim().toLowerCase();
      const startsYes = lowerReply.startsWith('si.') || lowerReply.startsWith('sì.');
      const startsNo = lowerReply.startsWith('no.');
      const asks100 = /\b(100|100%)\b/.test(lowerQuestion) && /\bfondo perduto\b/.test(lowerQuestion);
      if (!asks100) return false;

      if (measure.outcome === 'no' && startsYes) return true;
      if (measure.outcome !== 'no' && measure.factsSnapshot?.coversUpTo100 && startsNo) return true;
      return false;
    }

    async function polishGroundedMeasureReply(args: {
      question: string;
      draft: string;
      measure: { outcome?: string; measureName?: string | null; measureId?: string | null; factsSnapshot?: Record<string, unknown> | null };
      citations: ChatCitation[];
    }) {
      if (!apiKey) return null;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3_400);
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: complexModel,
            temperature: 0.25,
            messages: [
              {
                role: 'system',
                content: [
                  'Sei un consulente senior BNDO di finanza agevolata.',
                  'Riscrivi la risposta in italiano naturale, chiaro, molto pratico e umano.',
                  'Mantieni SOLO i fatti presenti in DRAFT e FACTS. Non inventare numeri, condizioni, scadenze o vincoli.',
                  'Non includere URL, fonti o riferimenti tecnici interni.',
                  'Se la domanda è chiusa, apri con: "Sì.", "No." oppure "Dipende."',
                  'Chiudi con una sola domanda utile per avanzare la verifica del caso reale.',
                  'Formato: 1-2 paragrafi, massimo 8 frasi.',
                ].join('\n'),
              },
              {
                role: 'user',
                content: [
                  `DOMANDA: ${args.question}`,
                  `DRAFT: ${args.draft}`,
                  `FACTS: ${JSON.stringify(args.measure.factsSnapshot ?? {}, null, 2)}`,
                  `OUTCOME: ${args.measure.outcome}`,
                  `MISURA: ${args.measure.measureName ?? args.measure.measureId ?? 'n/d'}`,
                  `WEB_CITATIONS_COUNT: ${args.citations.length}`,
                ].join('\n\n'),
              },
            ],
          }),
          signal: controller.signal,
        });
        if (!response.ok) return null;
        const json = await response.json().catch(() => null);
        const text = String(json?.choices?.[0]?.message?.content ?? '').trim();
        if (!text) return null;
        const sanitized = sanitizeUserFacingMeasureText(text);
        if (!sanitized) return null;
        if (hasContradictingOpening(args.question, args.measure, sanitized)) return null;
        if (isClosedMeasurePrompt(args.question) && !/^(s(i|ì)\.|no\.|dipende\.)/i.test(sanitized)) return null;
        return sanitized;
      } catch {
        return null;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    // PASS 1-3.5 (Deterministic + Knowledge) are fast; do not block TTFT on anything optional.
    const heuristic = extractProfileFromMessage(userMessage);
    const updates: Partial<UserProfile> = {};
    if (heuristic.updates.location?.region) {
        updates.location = { 
            region: heuristic.updates.location.region, 
            municipality: currentMemory.location?.municipality ?? null 
        };
    }
    if (heuristic.updates.sector) updates.sector = heuristic.updates.sector;
    if (heuristic.updates.fundingGoal) {
        updates.fundingGoal = evolveFundingGoal(currentMemory.fundingGoal, heuristic.updates.fundingGoal);
    }
    if (heuristic.updates.businessExists !== undefined) updates.businessExists = heuristic.updates.businessExists;
    if (heuristic.updates.activityType) updates.activityType = heuristic.updates.activityType;
    if (heuristic.updates.age !== undefined && heuristic.updates.age !== null) updates.age = heuristic.updates.age;
    if (heuristic.updates.ageBand) updates.ageBand = heuristic.updates.ageBand;
    if (heuristic.updates.employmentStatus) updates.employmentStatus = heuristic.updates.employmentStatus;
    if (heuristic.updates.legalForm) updates.legalForm = heuristic.updates.legalForm;
    if (heuristic.updates.revenueOrBudgetEUR !== undefined && heuristic.updates.revenueOrBudgetEUR !== null) {
        updates.revenueOrBudgetEUR = heuristic.updates.revenueOrBudgetEUR;
        updates.budgetAnswered = true;
    }
    if (heuristic.updates.ateco) {
        updates.ateco = heuristic.updates.ateco;
        updates.atecoAnswered = true;
    }
    if (heuristic.updates.contributionPreference) updates.contributionPreference = heuristic.updates.contributionPreference;
    if (heuristic.updates.contactEmail) updates.contactEmail = heuristic.updates.contactEmail;
    if (heuristic.updates.contactPhone) updates.contactPhone = heuristic.updates.contactPhone;

    const baseProfile = { ...currentMemory, ...updates };

    const isQuestion = intentData.questionLike;
    const isDiscovery = intentData.discovery;

    let activeMeasure = {
        id: currentMemory.activeMeasureId ?? null,
        title: currentMemory.activeMeasureTitle ?? (detectMeasureIds(userMessage)[0]?.name ?? null)
    };

    // Knowledge (measure/FAQ) is valuable but must be timeboxed to keep TTFT low.
    const knowledgePromise = Promise.all([
        answerGroundedMeasureQuestion(userMessage, {
          activeMeasureId: activeMeasure.id,
          activeMeasureTitle: activeMeasure.title,
        }),
        Promise.resolve(answerFaq(userMessage))
    ]);
    const knowledgeTimeoutMs = strictFocusedGrant
      ? 6_000
      : intentData.measureQuestion || intentData.comparison
        ? 5_200
        : intentData.questionLike
          ? 1_600
          : 260;
    let [measureAnswer, faqAnswer] = await withTimeout(knowledgePromise, knowledgeTimeoutMs, [null, null] as any);
    // Hard guard: su domande misura non permettere fallback “vuoto” verso ramo LLM generico.
    if ((intentData.measureQuestion || intentData.comparison || strictFocusedGrant) && !measureAnswer) {
      measureAnswer = await withTimeout(
        answerGroundedMeasureQuestion(userMessage, {
          activeMeasureId: activeMeasure.id,
          activeMeasureTitle: activeMeasure.title,
        }),
        4_500,
        null as any,
      );
    }
    if (measureAnswer?.measureId) {
      activeMeasure = {
        id: measureAnswer.measureId,
        title: measureAnswer.measureName ?? activeMeasure.title ?? detectMeasureIds(userMessage)[0]?.name ?? null,
      };
    }
    const groundedContext = (measureAnswer?.text || faqAnswer || null) as string | null;
    let factSource: 'scanner_dataset' | 'faq' | 'mixed' | 'none' =
      (measureAnswer?.factSource as 'scanner_dataset' | 'faq' | 'mixed' | 'none' | undefined) ??
      (faqAnswer ? 'faq' : 'none');
    let groundingStatus: 'grounded' | 'estimated_with_warning' | 'degraded' | 'none' =
      (measureAnswer?.groundingStatus as 'grounded' | 'estimated_with_warning' | 'degraded' | 'none' | undefined) ??
      (groundedContext ? 'grounded' : 'none');
    const rulesContext = buildKnowledgeContextFromRules(userMessage, baseProfile as UserProfile);

    const memoryProfile: UserFundingProfile = {
        regione: baseProfile.location?.region ?? null,
        provincia: null,
        comune: baseProfile.location?.municipality ?? null,
        ateco: (baseProfile.ateco as string) ?? null,
        settore: (baseProfile.sector as string) ?? null,
        dimensione_impresa: null,
        forma_giuridica: (baseProfile.legalForm as string) ?? null,
        anni_attivita: null,
        startup: baseProfile.businessExists === false ? true : baseProfile.businessExists === true ? false : null,
        impresa_gia_costituita: baseProfile.businessExists ?? null,
        investimento_previsto: (baseProfile.revenueOrBudgetEUR as number) ?? null,
        contributo_richiesto: (baseProfile.requestedContributionEUR as number) ?? null,
        numero_dipendenti: (baseProfile.employees as number) ?? null,
        eta_richiedente: (baseProfile.age as number) ?? null,
        occupazione_richiedente: (baseProfile.employmentStatus as string) ?? null,
        obiettivo: (baseProfile.fundingGoal as string) ?? null,
        needs: []
    };

    const completeness = evaluateProfileCompleteness(baseProfile as UserProfile);
    const scanReadiness = evaluateScanReadiness(baseProfile as UserProfile);

    const directOnClosedQuestion = isClosedMeasureQuestion(userMessage);
    const directOnAmbiguousMeasure = measureAnswer?.measureId === 'resto-al-sud-ambiguous';
    const shouldServeGroundedMeasureDirectly = Boolean(
      measureAnswer?.text &&
        (
          strictFocusedGrant ||
          directOnClosedQuestion ||
          directOnAmbiguousMeasure ||
          intentData.comparison ||
          !apiKey ||
          intentData.measureQuestion
        )
    );

    if (shouldServeGroundedMeasureDirectly) {
      let citations: ChatCitation[] = [];
      let estimatedWithWarning = groundingStatus === 'estimated_with_warning';

      try {
        const looksLikeSpecificBandoQuestion =
          /(\bbando\b|resto al sud|invitalia|sabatini|smart&start|autoimpiego|de minimis|credito d[' ]imposta|transizione|pnrr|fondo perduto)/i.test(
            userMessage
          );
        if (looksLikeSpecificBandoQuestion) {
          const queryBase = (activeMeasure.title ?? '').trim() || userMessage.trim();
          const searchOutcome = await withTimeout(
            WebSearchService.search(`${queryBase} requisiti scadenza aggiornamenti`),
            5_200,
            {
              ok: false,
              query: queryBase,
              results: [],
              providersUsed: [],
              unavailableReason: 'Timeout ricerca web'
            }
          );
          if (searchOutcome.ok && searchOutcome.results.length > 0) {
            citations = searchOutcome.results.slice(0, 6).map((result) => ({
              title: result.title,
              url: result.url,
              sourceTier: result.sourceTier,
              publishedAt: result.publishedAt,
              evidenceSnippet: result.evidenceSnippet
            }));
            if (searchOutcome.warning) {
              estimatedWithWarning = true;
              if (groundingStatus === 'grounded') groundingStatus = 'estimated_with_warning';
            }
            if (factSource === 'none') factSource = 'scanner_dataset';
          } else if (!searchOutcome.ok) {
            estimatedWithWarning = true;
            if (groundingStatus === 'grounded') groundingStatus = 'estimated_with_warning';
          }
        }
      } catch {
        estimatedWithWarning = true;
      }

      const draftResponseText = composeConsultantMeasureReply(
        userMessage,
        {
          ...(measureAnswer as NonNullable<typeof measureAnswer>),
          text: String(measureAnswer?.text ?? groundedContext ?? '').trim()
        }
      );
      const polishedResponseText = await polishGroundedMeasureReply({
        question: userMessage,
        draft: draftResponseText,
        measure: {
          outcome: measureAnswer?.outcome,
          measureName: measureAnswer?.measureName ?? null,
          measureId: measureAnswer?.measureId ?? null,
          factsSnapshot: measureAnswer?.factsSnapshot ?? null,
        },
        citations,
      });
      const responseText = sanitizeUserFacingMeasureText(polishedResponseText || draftResponseText);

      yield { type: 'thinking', content: false };
      const streamTokens = responseText.split(/(\s+)/).filter(Boolean);
      for (const token of streamTokens) {
        yield { type: 'text', content: token };
      }

      yield {
        type: 'metadata',
        content: {
          mergedProfile: baseProfile,
          finalAction: 'answer_measure_question' as const,
          intent: 'measure_question' as const,
          missing_fields: completeness.missingSignals,
          ambiguities: [],
          groundedContext: measureAnswer?.text ?? groundedContext,
          factSource,
          groundingStatus: estimatedWithWarning ? 'estimated_with_warning' : groundingStatus,
          strategicFeedback: undefined,
          activeMeasure,
          response_text: responseText,
          modelUsed: 'grounded-resolver',
          routingReason: 'Risposta tecnica servita dal resolver unificato chat/scanner',
          confidence: computeConfidenceScore({
            intent: 'measure_question',
            action: 'answer_measure_question',
            groundedContext: measureAnswer?.text ?? groundedContext,
            citationsCount: citations.length,
            estimatedWithWarning
          }),
          citations,
          estimatedWithWarning
        }
      };
      return;
    }

    // ── PASS 4: LLM reply streaming (text-first) ─────────────
    if (!apiKey) {
        yield { type: 'thinking', content: false };
        const fallbackText = "Connessione API assente.";
        yield { type: 'text', content: fallbackText };
        yield {
          type: 'metadata',
          content: {
            mergedProfile: baseProfile,
            finalAction: 'ask_clarification' as const,
            intent: 'profiling' as const,
            missing_fields: completeness.missingSignals,
            ambiguities: [],
            groundedContext: null,
            factSource: 'none',
            groundingStatus: 'degraded',
            strategicFeedback: undefined,
            activeMeasure,
            response_text: fallbackText,
            modelUsed: 'none',
            routingReason: 'API key mancante',
            confidence: 0.35,
            citations: [],
            estimatedWithWarning: true
          }
        };
        return;
    }

    const intent: ChatDecisionModel['intent'] =
        intentData.asksHumanConsultant
            ? 'handoff_human'
            : intentData.smallTalk || intentData.greeting
                ? 'small_talk'
                : intentData.measureQuestion || intentData.comparison
                    ? 'measure_question'
                    : intentData.qaModeActive || isQuestion
                        ? 'general_qa'
                        : scanReadiness.hardScanReady
                            ? 'scan_ready'
                            : isDiscovery
                                ? 'discovery'
                                : 'profiling';

    const finalAction: ChatDecisionModel['action'] =
        intentData.asksHumanConsultant
            ? 'handoff_human'
            : intentData.smallTalk || intentData.greeting
                ? 'small_talk'
                : intent === 'measure_question'
                    ? 'answer_measure_question'
                    : intent === 'general_qa'
                        ? 'answer_general_qa'
                        : scanReadiness.ready
                            ? 'run_scan'
                            : 'ask_clarification'; // For hardScanReady, we still default to clarification unless strong_ready


    const nextFieldHint = completeness.nextPriorityField
        ? `Prossimo dato da chiedere (UNO): ${completeness.nextPriorityField}`
        : `Prossimo dato da chiedere (UNO): nessuno`;

    let webContext: string | null = null;
    let citations: ChatCitation[] = [];
    let estimatedWithWarning = false;
    try {
        const looksLikeSpecificBandoQuestion =
            (isQuestion || intentData.measureQuestion || intentData.comparison) &&
            /(\bbando\b|resto al sud|invitalia|sabatini|smart&start|autoimpiego|de minimis|credito d[' ]imposta|transizione|pnrr|fondo perduto)/i.test(
                userMessage
            );
        if (looksLikeSpecificBandoQuestion) {
            const queryBase = (activeMeasure.title ?? '').trim() || userMessage.trim();
            const searchTimeoutMs = intent === 'measure_question' || intent === 'general_qa' ? 5_200 : 1_400;
            const searchOutcome = await withTimeout(
                WebSearchService.search(`${queryBase} requisiti scadenza aggiornamenti`),
                searchTimeoutMs,
                {
                  ok: false,
                  query: queryBase,
                  results: [],
                  providersUsed: [],
                  unavailableReason: 'Timeout ricerca web'
                }
            );
            if (searchOutcome.ok && searchOutcome.results.length > 0) {
                citations = searchOutcome.results.map((result) => ({
                  title: result.title,
                  url: result.url,
                  sourceTier: result.sourceTier,
                  publishedAt: result.publishedAt,
                  evidenceSnippet: result.evidenceSnippet
                }));
                webContext = searchOutcome.results
                    .slice(0, 6)
                    .map((result) => `• [${result.sourceTier.toUpperCase()}] ${result.title}: ${result.evidenceSnippet}`)
                    .join('\n');
                if (searchOutcome.warning) {
                  estimatedWithWarning = true;
                }
                if (factSource === 'faq') factSource = 'mixed';
                else if (factSource === 'none') factSource = 'scanner_dataset';
                groundingStatus = searchOutcome.warning ? 'estimated_with_warning' : 'grounded';
            } else if (!searchOutcome.ok && searchOutcome.unavailableReason) {
                webContext = `LIMITAZIONE RICERCA WEB: ${searchOutcome.unavailableReason}`;
                estimatedWithWarning = true;
                groundingStatus = 'degraded';
            }
        }
    } catch {
        webContext = null;
        estimatedWithWarning = true;
        groundingStatus = 'degraded';
    }

    const enhancedPrompt = [
        'Sei BNDO Sovereign V8: il massimo esperto di finanza agevolata in Italia. Sei un consulente senior carismatico, empatico e profondamente competente. Il tuo obiettivo è essere più utile e brillante di ChatGPT nel tuo dominio specifico.',
        'CONTEXT RETENTION: Utilizza tutti i dettagli del profilo e della cronologia recente per dare risposte personalizzate. Ricorda SEMPRE quello che l\'utente ha già detto (es. regione, settore, obiettivo) e usalo per contestualizzare la risposta.',
        'INTELLIGENCE & VALUE: Non limitarti a raccogliere dati. Sei qui per capire il progetto. Se hai i dati base ma senti che fare "una domanda in più" (es. fatturato, dipendenti, età) può sbloccare bandi più precisi, FALA con garbo. Non avere fretta di lanciare lo scanner se la conversazione è ancora fertile.',
        'TONO: Professionale ma amichevole, caloroso, mai robotico o burocratico. Niente preamboli inutili.',
        'STILE CONSULENZIALE OBBLIGATORIO: rispondi come un consulente umano senior. Evita etichette tecniche in output (es. "forma aiuto:", "copertura indicativa:", "stima forte BNDO:").',
        'LINGUAGGIO: scrivi in italiano semplice e chiarissimo (livello utente non tecnico). Evita frasi complesse e parole burocratiche.',
        'FORMATO: usa testo naturale in 1-2 paragrafi, senza elenchi puntati salvo richiesta esplicita dell’utente.',
        'SE LA DOMANDA È CHIUSA (es. "è tutto a fondo perduto?"): apri sempre con "Sì." oppure "No." e poi spiega in modo chiaro e concreto.',
        'FONTI: non mostrare mai URL o elenco fonti nella risposta all’utente. Integra invece una frase naturale tipo "abbiamo verificato fonti ufficiali e autorevoli".',
        `LUNGHEZZA: ${
            finalAction === 'ask_clarification'
                ? '30–70 parole'
                : intent === 'measure_question' || intent === 'general_qa'
                    ? '6-8 frasi chiare (circa 90-180 parole)'
                    : '60–150 parole'
        }.`,
        groundedContext
            ? 'FONTE GROUNDED: Usa il contesto fornito come verità assoluta. Se mancano dati, dillo chiaramente.'
            : 'CONOSCENZA: Usa la tua vasta conoscenza dei bandi italiani in modo prudente.',
        '',
        'REGOLE COMPORTAMENTALI:',
        '- Se azione=run_scan: Annuncia con entusiasmo che il profilo è maturo e stai analizzando le opportunità.',
        '- Se azione=ask_clarification: Fai UNA domanda mirata, motivando perché quella specifica informazione fa la differenza per trovare il bando perfetto.',
        '- Se azione=answer_*: Rispondi in modo pratico e chiudi con un invito discreto a proseguire se mancano dati chiave.',
        '',
        `AZIONE_ATTUALE=${finalAction}`,
        `INTENT_RILEVATO=${intent}`,
        nextFieldHint
    ].join('\n');


    try {
        const structuredExtractionPromise = (async () => {
            try {
                const payload = buildExtractionPayload(userMessage, memoryProfile, history, groundedContext);
                const extractionController = new AbortController();
                const extractionTimeout = setTimeout(() => extractionController.abort(), 8_000);
                try {
                    const extractionRes = await fetch('https://api.openai.com/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${apiKey}`
                        },
                        body: JSON.stringify({
                            model: extractionModel,
                            ...payload,
                            temperature: 0.0
                        }),
                        signal: extractionController.signal
                    });
                    if (!extractionRes.ok) return null;
                    const extractionJson = await extractionRes.json().catch(() => null);
                    const content = extractionJson?.choices?.[0]?.message?.content;
                    if (typeof content !== 'string' || !content.trim()) return null;
                    const parsed = JSON.parse(content) as ChatDecisionModel;
                    return validateAndMergeExtraction(parsed, baseProfile, userMessage, history);
                } finally {
                    clearTimeout(extractionTimeout);
                }
            } catch {
                return null;
            }
        })();

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15_000);
        try {
          const messages: any[] = [
              { role: 'system', content: enhancedPrompt }
          ];

          if (history && history.length > 0) {
              for (const turn of history) {
                  messages.push({ 
                      role: turn.role === 'assistant' ? 'assistant' : 'user', 
                      content: turn.text 
                  });
              }
          }

          let userContent = `Profilo (JSON):\n${JSON.stringify(memoryProfile)}`;
          if (webContext) userContent += `\n\nCONTESTO WEB AGGIORNATO:\n${webContext}`;
          if (rulesContext) userContent += `\n\nREGOLE BNDO:\n${rulesContext}`;
          if (groundedContext) userContent += `\n\nDOCUMENTO DI RIFERIMENTO:\n${groundedContext}`;
          userContent += `\n\nMessaggio Utente: ${userMessage}`;

          messages.push({ role: 'user', content: userContent });

          const routingDecision = selectModelForTurn({
            intent,
            action: finalAction,
            message: userMessage,
            groundedContext,
            citationsCount: citations.length,
            models: { simpleModel, complexModel }
          });
          const generatingModel = routingDecision.modelUsed;

          const response = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${apiKey}`
              },
              body: JSON.stringify({
                  model: generatingModel,
                  messages,
                  temperature: 0.45,
                  stream: true
              }),
              signal: controller.signal
          });

          if (!response.ok) throw new Error(`OpenAI Error: ${response.statusText}`);

          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          let hasStoppedThinking = false;
          let assistantText = '';
          let sseBuffer = '';

          while (true) {
              const { done, value } = await reader?.read()!;
              if (done) break;

              sseBuffer += decoder.decode(value, { stream: true });
              const lines = sseBuffer.split('\n');
              sseBuffer = lines.pop() || "";

              for (const line of lines) {
                  const trimmedLine = line.trim();
                  if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;
                  if (trimmedLine.includes('[DONE]')) break;

                  try {
                      const data = JSON.parse(trimmedLine.slice(6));
                      const delta = data?.choices?.[0]?.delta?.content ?? '';
                      if (!delta) continue;
                      if (!hasStoppedThinking) {
                          yield { type: 'thinking', content: false };
                          hasStoppedThinking = true;
                      }
                      assistantText += delta;
                      yield { type: 'text', content: delta };
                  } catch {}
              }
          }

          // Safety: ensure thinking stops
          if (!hasStoppedThinking) {
              yield { type: 'thinking', content: false };
          }

          const extraction = await withTimeout(structuredExtractionPromise, 800, null);
          const mergedProfile = (extraction?.mergedProfile ?? baseProfile) as UserProfile;
          const mergedActiveMeasure = extraction?.activeMeasure ?? activeMeasure;

          // Calculate strategic feedback if substantial profile info is present
          let strategicFeedback: string | undefined;
          if (mergedProfile.location?.region || mergedProfile.ateco || mergedProfile.revenueOrBudgetEUR) {
              strategicFeedback = await calculateStrategicFeedback(mergedProfile) || undefined;
          }

          yield {
              type: 'metadata',
              content: {
                  mergedProfile,
                  finalAction,
                  intent,
                  missing_fields: extraction?.missing_fields ?? completeness.missingSignals,
                  ambiguities: extraction?.ambiguities ?? [],
                  groundedContext,
                  factSource,
                  groundingStatus: estimatedWithWarning ? 'estimated_with_warning' : groundingStatus,
                  strategicFeedback, // Now populated
                  activeMeasure: mergedActiveMeasure,
                  response_text: assistantText.trim(),
                  modelUsed: generatingModel,
                  routingReason: routingDecision.routingReason,
                  confidence: computeConfidenceScore({
                    intent,
                    action: finalAction,
                    groundedContext,
                    citationsCount: citations.length,
                    estimatedWithWarning
                  }),
                  citations: citations.slice(0, 6),
                  estimatedWithWarning
              }
          };
        } finally {
          clearTimeout(timeoutId);
        }
        
    } catch (e) {
        console.error("Stream error in runStreamingChat:", e);
        yield { type: 'thinking', content: false };
        yield { type: 'error', content: "Mmm, c'è un piccolo intoppo nella connessione. Riprova tra un istante." };
    }
}
