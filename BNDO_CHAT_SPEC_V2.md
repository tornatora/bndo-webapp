# BNDO CHAT SPEC V2 — Documento Definitivo di Prodotto

> Versione: 2.0.0
> Data: 2026-03-10
> Autore: Principal Engineering / AI Systems
> Stato: ATTIVO — Fonte di verità per il progetto

---

## 1. VISIONE DEL SISTEMA

### Cos'è BNDO Chat
BNDO Chat è un assistente conversazionale specializzato in finanza agevolata italiana.
Raccoglie i dati dell'utente tramite dialogo naturale, avvia una ricerca automatica sui bandi
pubblici disponibili e restituisce risultati filtrati e classificati per compatibilità.

### Cosa fa
- Interpreta il linguaggio naturale dell'utente
- Estrae dati strutturati (regione, stato impresa, obiettivo, settore, budget...)
- Valuta la completezza del profilo in modo **deterministico**
- Avvia lo scanner bandi **solo** quando il profilo è sufficientemente completo
- Mostra risultati con score di matching, motivazioni e avvertenze
- Risponde a FAQ su misure specifiche (Nuova Sabatini, Resto al Sud, FUSESE, ecc.)
- Spiega risultati già restituiti dal sistema

### Cosa NON fa
- **Non inventa bandi**: ogni risultato proviene dallo scanner deterministico
- **Non decide la compatibilità**: solo il motore di matching determina se un bando è adatto
- **Non indovina eleggibilità**: requisiti, percentuali, scadenze provengono da fonti dati verificate
- **Non fabbrica importi o condizioni**: se un dato non è disponibile, lo dichiara

### Principio architetturale: Deterministic First
```
┌─────────────────────────────────────────────────────────┐
│ L'AI (LLM) NON decide MAI quali bandi sono compatibili │
│                                                         │
│ L'AI può solo:                                          │
│ ✓ Interpretare linguaggio naturale                      │
│ ✓ Estrarre dati strutturati                             │
│ ✓ Rilevare ambiguità                                    │
│ ✓ Proporre una action                                   │
│ ✓ Spiegare risultati GIÀ restituiti dal sistema         │
│ ✓ Rispondere a FAQ grounded                             │
│                                                         │
│ La verità del matching è nei moduli deterministic-first  │
└─────────────────────────────────────────────────────────┘
```

---

## 2. MODALITÀ CONVERSAZIONALI

| Modalità | Descrizione | Trigger |
|---|---|---|
| **discovery** | Raccolta dati iniziale, domande sul profilo | Primo messaggio / profilo incompleto |
| **profiling** | Raccolta progressiva di dettagli aggiuntivi | Profilo parziale, step specifico |
| **preScanConfirm** | Domanda pre-scan: "c'è altro da specificare?" | 4 pilastri completi, manca 5° |
| **scan_ready** | Scanner avviato automaticamente | Profilo ≥ pre_scan_ready + conferma utente |
| **refine_after_scan** | Domande migliorative dopo primo scan | Risultati mostrati, qualità migliorabile |
| **answer_measure_question** | Risposta grounded a domanda su misura specifica | "Come funziona la Nuova Sabatini?" |
| **answer_general_qa** | FAQ generali sulla finanza agevolata | "Cosa puoi fare?", "Cos'è il fondo perduto?" |
| **no_result_explanation** | Spiega perché lo scan non ha trovato risultati | Scan con 0 risultati |
| **handoff_human** | Passaggio a consulente umano | Richiesta esplicita / caso troppo complesso |
| **small_talk** | Saluti e convenevoli | "Ciao", "Grazie", "Buongiorno" |

---

## 3. REQUISITI MINIMI DI SCAN — Profile Completeness Engine V2

### I 5 Pilastri

| # | Pilastro | Campo | Obbligatorio per scan? |
|---|---|---|---|
| 1 | **Regione** | `location.region` (non negata, non ambigua) | ✅ OBBLIGATORIO |
| 2 | **Stato impresa** | `businessExists` (attiva / da costituire / startup) | ✅ OBBLIGATORIO |
| 3 | **Obiettivo specifico** | `fundingGoal` (non generico: "macchinari", "digitalizzazione", NON "fondo perduto") | ✅ OBBLIGATORIO |
| 4 | **Settore** | `sector` (manifattura, agricoltura, ICT, turismo...) | ✅ OBBLIGATORIO |
| 5 | **Dettaglio economico/operativo** | Budget OPPURE contributionPreference OPPURE employees OPPURE dati fondatore (per nuove imprese) | Opzionale (richiesto per strong_ready) |

### Livelli di readiness

```
not_ready      → Mancano 1+ pilastri tra regione/stato/obiettivo → Continua profiling
weak_ready     → Manca il settore (pilastri 1-3 presenti) → Chiedi settore
pre_scan_ready → Pilastri 1-4 presenti, manca solo il 5° → Chiedi conferma preScanConfirm
strong_ready   → Tutti e 5 i pilastri → Scan automatico
```

### Flusso decisionale

```
Utente scrive → Estrazione profilo → evaluateProfileCompleteness()
                                      │
                                      ├── not_ready → chiedi il prossimo campo mancante
                                      ├── weak_ready → chiedi settore
                                      ├── pre_scan_ready → preScanConfirm ("c'è altro?")
                                      │                     │
                                      │                     ├── utente conferma → SCAN
                                      │                     └── utente aggiunge info → ricalcola
                                      └── strong_ready → SCAN immediato
```

---

## 4. REGOLE TERRITORIALI

### Regola fondamentale
> Se l'utente vuole investire/avviare in Calabria, NON devono uscire bandi di Sicilia,
> Lombardia o altre regioni incompatibili. MAI.

### Compatibilità bandi regionali
| Tipo bando | Regola |
|---|---|
| **Bando regionale** (es. "Regione Marche") | Compatible SOLO se la regione del bando = regione utente |
| **Bando multi-regione** (es. ZES Unica Sud) | Compatible se la regione utente è nella lista ammessa |
| **Bando nazionale** (es. Nuova Sabatini) | Compatible per TUTTI gli utenti italiani |
| **Regione nell'authority name** (es. "Regione Sicilia") | Hard exclusion se ≠ regione utente |

### Come trattare sede vs luogo investimento
- Se l'utente specifica REGIONE senza qualificare: si assume = sede di investimento
- Se l'utente dice "ho sede in Puglia ma investo nel Lazio": il matching usa LAZIO per i bandi regionali
- Se l'utente dice "ho sede in Calabria": si assume che investe e ha sede in Calabria

### Implementazione (evaluateTerritory in unifiedPipeline.ts)
1. Se l'authority contiene "Regione X" e X ≠ regione utente → `compatible: false`
2. Se il bando ha una lista regioni e la regione utente non è presente → `compatible: false`
3. Se l'authority è nazionale (Invitalia, Ministero, ecc.) → `compatible: true`
4. Se il bando copre tutte le 20 regioni → `compatible: true`

---

## 5. FAQ VS MATCHING

### Come il sistema distingue

| Segnale | Tipo | Esempio |
|---|---|---|
| Contiene "come funziona", "cos'è", "cosa prevede" | **FAQ/measure_question** | "Come funziona la Nuova Sabatini?" |
| Contiene nome misura noto (Resto al Sud, FUSESE, ON...) | **measure_question** | "Posso accedere al FUSESE?" |
| Contiene "voglio", "cerco", "mi servono" + obiettivo | **discovery/profiling** | "Voglio macchinari in Calabria" |
| Contiene solo saluto | **small_talk** | "Ciao" |
| Domanda generica sul sistema | **general_qa** | "Cosa puoi fare?" |

### Regola chiave
- Se è una FAQ → rispondi con knowledge grounded, NON forzare il profiling
- Se è discovery → raccogli dati e prosegui verso lo scan
- Se è misto (FAQ + dato profilo) → rispondi alla FAQ E estrai il dato

---

## 6. HARD EXCLUSIONS

Queste incompatibilità escludono un bando in modo NETTO (score = 0, hardExcluded = true):

| Gate | Descrizione |
|---|---|
| **territory** | Regione utente incompatibile con il bando |
| **businessTarget** | Il bando è per individui (borse studio, servizio civile) e l'utente è un'impresa |
| **businessStage** | Impresa da costituire vs bando solo per imprese attive (e viceversa) |
| **demographics** | Bando under-35 e utente over-35 |
| **hardStatus** | Bando chiuso/scaduto |

---

## 7. RANKING RULES

### Criteri di scoring (pesi in unifiedPipeline.ts)

| Dimensione | Peso | Descrizione |
|---|---|---|
| **purpose** | 35% | Allineamento obiettivo utente ↔ finalità bando |
| **territory** | 20% | Compatibilità territoriale |
| **subject** | 15% | Beneficiario ammissibile (PMI, startup, professionista) |
| **sector** | 15% | Corrispondenza settore |
| **stage** | 5% | Stadio impresa compatibile |
| **expenses** | 5% | Spese ammissibili allineate all'obiettivo |
| **status** | 3% | Bando aperto / in arrivo / chiuso |
| **special** | 2% | Requisiti speciali |

### Bande di risultato
- **excellent** (≥85): perfetta corrispondenza
- **strong** (≥70): ottima corrispondenza
- **good** (≥60): buona corrispondenza
- **borderline** (50-59): corrispondenza parziale
- **excluded** (<50 o hard excluded): non mostrato

### Explainability
Ogni risultato include:
- `whyFit[]`: motivazioni in italiano perché il bando è compatibile
- `warnings[]`: criticità residue
- `dimensions[]`: punteggio per ogni dimensione
- `hardExclusionReason`: se escluso, perché

---

## 8. PROGRESSIVE REFINEMENT

### Regole dopo il primo scan
1. **Una sola domanda utile per turno** — mai interrogatorio
2. **Mai ri-chiedere campi già noti** — lista esplicita nel prompt AI
3. **Priorità campi refine**: budget → contributionPreference → employees → ateco
4. **Quando fermarsi**: dopo 2 turni senza nuove informazioni
5. **Quando mostrare risultati**: immediatamente dopo il primo scan riuscito

### Come funziona il re-scan
Se l'utente aggiunge informazioni dopo il primo scan:
- Si calcola il nuovo scanHash
- Se l'hash è diverso dal precedente → nuovo scan automatico
- Se l'hash è uguale → nessun re-scan

---

## 9. FAQ / KNOWLEDGE / MEASURE ANSWERS

### Fonti di verità
1. **Knowledge modules interni** (`lib/knowledge/regoleBandi.ts`)
   - Contengono informazioni verificate su misure note
2. **STRATEGIC_SCANNER_DOCS** (`lib/strategicScannerDocs.ts`)
   - Schede informative dettagliate delle misure principali
3. **LLM come layer di spiegazione** — MAI come fonte di verità
   - L'LLM formatta e spiega, non inventa

### Pattern di risposta FAQ
```
Utente: "Come funziona la Nuova Sabatini?"
→ Sistema cerca in knowledge modules + scanner docs
→ Trova scheda "Nuova Sabatini"
→ LLM formatta la risposta basandosi SOLO sul contesto fornito
→ Risposta: "La Nuova Sabatini finanzia l'acquisto di beni strumentali..."
```

---

## 10. ANTI-HALLUCINATION RULES

```
■ NEVER invent bandi — ogni risultato proviene dallo scanner
■ NEVER guess eligibility — solo il motore deterministico decide
■ NEVER fabricate requisiti, importi, percentuali, scadenze
■ NEVER output a bando unless it comes from scanner results
■ NEVER say "Ho gli elementi necessari" se il profilo è incompleto
■ NEVER claim scan readiness if evaluateProfileCompleteness ≠ strong_ready
■ NEVER re-ask a field already present in the profile
■ ALWAYS distinguish between "sì", "sì ma in certe condizioni", "non confermabile"
■ ALWAYS declare when a detail cannot be verified with current data
```

---

## 11. FALLBACK SENZA OPENAI

Quando `OPENAI_API_KEY` non è configurata:

| Componente | Comportamento |
|---|---|
| Estrazione profilo | Usa regex/pattern matching deterministico |
| Domanda successiva | `questionPlanner.ts` genera la domanda basandosi sullo step |
| FAQ | Risponde da knowledge modules con template statici |
| Scan | Funziona normalmente (non dipende da OpenAI) |
| Testo assistente | Template statico: "Capisco. [domanda successiva]" |

---

## 12. OFFICIAL ACCEPTANCE TESTS

### Caso 1: "Voglio macchinari in Calabria"
- **Intent**: profiling (discovery)
- **Action**: ask_clarification
- **Campi estratti**: fundingGoal=macchinari, location.region=Calabria
- **Scan**: NO (manca stato impresa + settore)
- **Domanda attesa**: "Siete già operativi / state aprendo?"

### Caso 2: "Voglio macchinari in Calabria" + "attiva"
- **Intent**: profiling
- **Action**: ask_clarification
- **Campi**: fundingGoal=macchinari, region=Calabria, businessExists=true
- **Scan**: NO (manca settore)
- **Domanda attesa**: "In quale settore operate?"

### Caso 3: "Voglio macchinari in Calabria" + "attiva" + "manifattura"
- **Intent**: profiling → preScanConfirm
- **Action**: ask_clarification
- **Campi**: fundingGoal=macchinari, region=Calabria, businessExists=true, sector=manifattura
- **Scan**: NO (preScanConfirm: "c'è altro da specificare?")
- **Step**: preScanConfirm

### Caso 4: Caso 3 + "no procedi"
- **Intent**: conferma scan
- **Action**: run_scan
- **readyToScan**: true
- **Scan**: SÌ — scanner parte automaticamente
- **Risultati attesi**: Nuova Sabatini (85%+), bandi nazionali per macchinari
- **Vincoli territoriali**: solo bandi compatibili con Calabria

### Caso 5: "Come funziona la Nuova Sabatini?"
- **Intent**: measure_question
- **Action**: answer_measure_question
- **Scan**: NO
- **Risposta attesa**: informazioni grounded su Nuova Sabatini (beni strumentali, PMI, contributo ministeriale)
- **Anti-hallucination**: nessuna percentuale/scadenza inventata

### Caso 6: "Cosa puoi fare?"
- **Intent**: general_qa
- **Action**: answer_general_qa
- **Scan**: NO
- **Risposta attesa**: spiegazione delle capacità di BNDO

### Caso 7: "Ho sede in Puglia ma l'investimento si fa nel Lazio"
- **Intent**: profiling con ambiguità territoriale
- **locationNeedsConfirmation**: true
- **Scan**: NO (richiede conferma regione)
- **Domanda attesa**: "In quale regione si fa l'investimento?"

### Caso 8: "Non sono in Calabria"
- **Intent**: profiling con negazione
- **Campi**: location.region = undefined/null (negazione gestita)
- **Scan**: NO
- **Domanda attesa**: "In quale regione operate?"

### Caso 9: "Voglio avviare in Calabria"
- **Intent**: profiling (avvio nuova attività)
- **Campi**: businessExists=false, location.region=Calabria
- **Scan**: NO (mancano obiettivo, settore)
- **Domanda attesa**: "Cosa vuoi finanziare?"

### Caso 10: "Sto aprendo un'attività agricola in Campania"
- **Intent**: profiling
- **Campi**: businessExists=false, sector=agricoltura, region=Campania
- **Scan**: NO (manca obiettivo specifico)
- **Domanda attesa**: "Cosa vuoi finanziare in concreto?"

### Caso 11: "Ho una PMI attiva in Calabria, voglio comprare macchinari"
- **Intent**: profiling
- **Campi**: businessExists=true, activityType=PMI, region=Calabria, fundingGoal=macchinari
- **Scan**: NO (manca settore)
- **Step**: sector
- **NON deve ri-chiedere**: stato impresa (già "attiva")

---

## Changelog

| Data | Versione | Modifica |
|---|---|---|
| 2026-03-10 | 2.0.0 | Creazione documento, Profile Completeness Engine V2, preScanConfirm, fix scanner |
