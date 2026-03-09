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
import { ChatDecisionModel } from './ChatDecisionModel';
import { STRUCTURED_EXTRACTION_SYSTEM_PROMPT } from './structuredPrompt';
import { UserFundingProfile } from '../../types/userFundingProfile';
import { UserProfile } from '../conversation/types';
import { evaluateScanReadiness, isStrongReady } from '../conversation/scanReadiness';
import { evaluateProfileCompleteness } from '../conversation/profileCompleteness';
import { answerFaq } from '../knowledge/regoleBandi';
import { answerGroundedMeasureQuestion } from '../knowledge/groundedMeasureAnswerer';
import { extractProfileFromMessage } from '../engines/profileExtractor';
import { getChangedFields } from '../conversation/profileMemory';
import { isDiscoveryIntent, isQuestionLike } from '../conversation/intentRouter';

// ─── Payload builder for OpenAI structured extraction ──────────────────────────

export function buildExtractionPayload(
    userMessage: string, 
    memoryProfile: UserFundingProfile
) {
    return {
        messages: [
            { role: 'system', content: STRUCTURED_EXTRACTION_SYSTEM_PROMPT },
            { role: 'user', content: `Profilo attualmente memorizzato (JSON):\n${JSON.stringify(memoryProfile)}\n\nUltimo messaggio utente:\n${userMessage}` }
        ],
        response_format: {
            "type": "json_schema",
            "json_schema": {
                "name": "chat_decision_model",
                "strict": true,
                "schema": {
                    "type": "object",
                    "properties": {
                        "intent": { "type": "string", "enum": ['profiling', 'scan_ready', 'general_qa', 'measure_question', 'discovery', 'small_talk', 'handoff_human', 'unknown'] },
                        "action": { "type": "string", "enum": ['ask_clarification', 'run_scan', 'refine_after_scan', 'answer_measure_question', 'answer_general_qa', 'no_result_explanation', 'handoff_human', 'small_talk'] },
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
                                "territory_basis": { "type": ["string", "null"], "enum": ["sede_legale", "sede_operativa", "luogo_investimento", "unknown", null] }
                            },
                            "required": ["regione", "provincia", "comune", "ateco", "settore", "dimensione_impresa", "forma_giuridica", "anni_attivita", "startup", "impresa_gia_costituita", "investimento_previsto", "contributo_richiesto", "numero_dipendenti", "eta_richiedente", "occupazione_richiedente", "obiettivo", "needs", "territory_basis"],
                            "additionalProperties": false
                        },
                        "missing_fields": { "type": "array", "items": { "type": "string" } },
                        "ambiguities": { "type": "array", "items": { "type": "string" } }
                    },
                    "required": ["intent", "action", "extracted_profile_entities", "missing_fields", "ambiguities"],
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
    currentMemory: Partial<UserProfile>
): { 
    mergedProfile: Partial<UserProfile>, 
    finalAction: ChatDecisionModel['action'],
    intent: ChatDecisionModel['intent'],
    missing_fields: string[],
    ambiguities: string[]
} {
    const extracted = llmResponse.extracted_profile_entities;

    // Translation from UserFundingProfile → UserProfile
    const updates: Partial<UserProfile> = {};
    if (extracted.regione) {
        updates.location = { 
            region: extracted.regione, 
            municipality: extracted.comune ?? currentMemory.location?.municipality ?? null 
        };
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
            updates.fundingGoal = extracted.obiettivo;
        }
    }
    
    const mergedProfile = { ...currentMemory, ...updates };

    // ─── DECISORE DETERMINISTICO FINALE ────────────────────────────────────────
    // Il LLM può suggerire, ma la verità è qui.
    
    const completeness = evaluateProfileCompleteness(mergedProfile as UserProfile);
    const scanReady = completeness.level === 'strong_ready';

    let finalAction = llmResponse.action;

    if (scanReady) {
        // Profilo strong_ready: andiamo allo scan a meno che non sia QA
        if (finalAction !== 'answer_measure_question' && finalAction !== 'answer_general_qa' && finalAction !== 'handoff_human') {
            finalAction = 'run_scan';
        }
    } else {
        // Profilo non ancora strong_ready: blocca qualsiasi scan
        if (finalAction === 'run_scan' || finalAction === 'refine_after_scan') {
            finalAction = 'ask_clarification';
        }
    }

    return { 
        mergedProfile, 
        finalAction, 
        intent: llmResponse.intent, 
        missing_fields: completeness.missingSignals, 
        ambiguities: llmResponse.ambiguities 
    };
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
    currentMemory: Partial<UserProfile>
) {
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
    if (heuristic.updates.fundingGoal) updates.fundingGoal = heuristic.updates.fundingGoal;
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
    const measureResponse = answerGroundedMeasureQuestion(userMessage);
    if (measureResponse && isQuestion && !hasProfilingData) {
        return {
            mergedProfile: baseProfile,
            finalAction: 'answer_measure_question' as const,
            intent: 'measure_question' as const,
            missing_fields: [],
            ambiguities: []
        };
    }

    // FAQ check
    const faqResponse = answerFaq(userMessage);
    if (faqResponse && isQuestion && !hasProfilingData && !isDiscovery) {
        return {
            mergedProfile: baseProfile,
            finalAction: 'answer_general_qa' as const,
            intent: 'general_qa' as const,
            missing_fields: [],
            ambiguities: []
        };
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
            intent: intent as ChatDecisionModel['intent'],
            missing_fields: completeness.missingSignals,
            ambiguities: []
        };
    }

    try {
        const payload = buildExtractionPayload(userMessage, memoryProfile);
        
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
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
                intent: (scanReady ? 'scan_ready' : 'profiling') as ChatDecisionModel['intent'],
                missing_fields: completeness.missingSignals,
                ambiguities: []
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
                intent: (scanReady ? 'scan_ready' : 'profiling') as ChatDecisionModel['intent'],
                missing_fields: completeness.missingSignals,
                ambiguities: []
            };
        }

        const parsedLlmResponse = JSON.parse(content) as ChatDecisionModel;
        return validateAndMergeExtraction(parsedLlmResponse, baseProfile);
        
    } catch (e) {
        // Exception (parse error, network): fallback deterministico, no crash
        console.warn('[orchestrator] Fallback to deterministic due to error:', e instanceof Error ? e.message : String(e));
        const scanReady = completeness.level === 'strong_ready';
        return {
            mergedProfile: baseProfile,
            finalAction: (scanReady ? 'run_scan' : 'ask_clarification') as ChatDecisionModel['action'],
            intent: (scanReady ? 'scan_ready' : 'profiling') as ChatDecisionModel['intent'],
            missing_fields: completeness.missingSignals,
            ambiguities: []
        };
    }
}
