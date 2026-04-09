# TASK_SINGLE_BANDO.md

## Objective
Implement the strongest practical single-bando "Verifica requisiti" system with:
- maximum practical quality
- low runtime cost per user click
- strong internal correctness
- strong final UX quality
- no degradation of `/quiz/autoimpiego`

The task is complete only if both are true:
1. **Internal correctness**
2. **Final user-visible quiz quality**

Passing tests is necessary but not sufficient.
Runtime truth is the source of truth.

---

## Required architecture

### 1. Compile once per bando
Do not generate the quiz live from raw text on every click.

For each bando, compile source material into a persisted `EligibilitySpec` using:
- title
- page content
- PDF
- attachments
- official related content already available in the project flow

The heavy reasoning must happen once per bando (or when the source fingerprint changes), not once per user click.

### 2. AI compiler
Use the existing OpenAI integration in the repo if available.
Do not hardcode secrets.
Do not print env values.

The compiler must produce strict structured JSON, not prose, including at least:
- family classification
- beneficiary types
- applicant nature
- legal subject type
- constituted vs to-be-constituted
- startup innovativa status
- female composition
- youth composition
- age / employment constraints
- territory / local unit / registered office constraints
- sector / project type constraints
- company size
- exclusions
- askable vs non-askable rules
- source evidence excerpts
- confidence score
- ideal applicant profile
- branch dimensions
- decision graph blueprint

### 3. AI reviewer
Run a separate review pass on the compiled `EligibilitySpec`.
The reviewer must not regenerate the quiz from scratch.
It must review the spec and return structured JSON with:
- detected errors
- contradictions
- missing decisive requirements
- bad askable / non-askable classification
- branch-consistency risks
- suspicious numeric extraction
- weak / too-shallow plan risks
- confidence / reliability score
- repair suggestions

### 4. Deterministic validators
Implement deterministic validation in code for:
- duplicate/conflicting transitions
- branch-invalid questions
- incompatible downstream questions after profile-defining answers
- option-set contradictions
- path contradictions
- success paths bypassing decisive gates
- invalid branch-specific wording
- semantically invalid next questions
- numeric sanity
- minimum meaningful depth
- Italian wording quality
- publication readiness

### 5. Persisted spec
Persist the compiled + reviewed spec with metadata such as:
- compile status
- compile timestamp
- source fingerprint/version
- confidence
- reviewer status
- publication status
- publication reasons
- spec revision

If the source has not changed, reuse the stored spec.
Do not redo full AI work on every click.

### 6. Family classifier + family blueprints
Do not use one flat planner.
Implement family-aware blueprints at least for:
- natural_person_new_business
- existing_business
- startup_innovativa
- female_entrepreneurship
- youth_entrepreneurship
- university_research_entity
- network_consortium
- territorial_chamber
- local_unit_required
- mixed_beneficiaries

### 7. Active branch state
At runtime, maintain a semantic active branch state updated after every answer.
It must track at least:
- applicant family
- applicant nature
- person / company / university / research entity / network / consortium
- constituted vs to-be-constituted
- startup applicability
- female/youth applicability
- territory/local unit applicability
- legal compatibility
- remaining possible profiles
- unresolved decisive dimensions

Every next question must use this state.

### 8. Next-best-question engine
After every answer, recalculate:
- what is already known
- what is no longer possible
- which decisive dimensions are still unresolved
- which is the best next branch-valid discriminating question

Do not ask the next generic global question.
Ask the best next question for that branch.

### 9. Question and option applicability filters
Before showing a question, validate:
- grounded
- askable
- branch-compatible
- semantically stronger than what is already known
- not redundant
- not generic
- not inconsistent with previous answers

Before showing options:
- ensure options are compatible with the active branch
- remove impossible options

### 10. Low-cost runtime
At user click time, the runtime should mostly:
- load persisted `EligibilitySpec`
- initialize candidate state
- execute deterministic interview logic
- filter questions/options
- evaluate the outcome

Avoid runtime model calls per question unless absolutely necessary.

---

## Hard publication gate

No quiz may be shown as a normal user-facing quiz unless it passes all publication gates.

### Quarantine conditions
A quiz must be quarantined / downgraded / converted to `needs_review` if any of these fail:

1. **Source groundedness**
   - visible questions or critical values not traceable to source evidence

2. **Branch consistency**
   - a branch shows a question incompatible with earlier answers

3. **Option consistency**
   - option set contains impossible or irrelevant options after branch narrowing

4. **Numeric sanity**
   Reject suspicious values such as:
   - absurdly low/high amounts
   - OCR-like truncation
   - decimal/comma mistakes
   - impossible age ranges
   - impossible percentages
   - implausible months since incorporation
   - spend thresholds like “6 euro” unless clearly source-supported

5. **Minimum meaningful depth**
   If a bando has several decisive dimensions but the quiz resolves too few of them, reject or expand the plan.

6. **Italian quality**
   Reject questions that are:
   - broken Italian
   - incomplete
   - unnatural machine-like fragments
   - semantically sloppy

7. **Consultant-like value**
   Reject plans that are technically valid but banal, weak, or not serious enough to filter users properly.

### Fail-closed rule
If a quiz does not pass publication gates:
- do not expose it as a normal verification quiz
- return a safe reduced flow or `needs_review`
- do not bluff confidence

It is better to quarantine a weak quiz than to publish it.

---

## UX standard
The final visible quiz must feel:
- deep
- precise
- progressive
- intelligent
- consultant-like
- close in final seriousness to `/quiz/autoimpiego`

It must not feel like:
- a shallow 2–3 question checklist for a rich bando
- a generic generated form
- a mega-compressed first selector
- a system that forgot the previous answer
- a quiz with absurd numeric values

### First question rule
The first question must be clean.
Forbidden:
- overloaded titles like “Seleziona il tuo profilo (ammessi: …)”
- giant legal matrices in the title
- vague meta-questions

### Depth rule
A rich bando must produce a rich quiz.
A simple bando may produce a short quiz.
Do not add filler.
Do not under-generate when the source supports more.

### Success rule
Success must require sufficient evidence, not only absence of contradiction.
No premature success on rich branches.

---

## Onboarding rule
Preserve these outcomes:
- eligible
- likely_eligible
- needs_review
- not_eligible

Allow onboarding for:
- eligible
- likely_eligible
- needs_review

Block onboarding only for:
- not_eligible

Persist the outcome in the practice/application record.
Do not break the current “Avvia la pratica con BNDO” UX.

---

## Mandatory validations

### ARTES validation
Use “ARTES 4.0 - Aiuti erogazione servizi alle imprese” as a validation case for the general engine.
Do not hardcode it.

Prove that if the user chooses “Università / Ente di ricerca”, the next questions are branch-valid and do not fall back to a company-only “Impresa / Altro” path.

### Real-family validation set
Validate across at least:
- territorial chamber
- startup innovativa
- existing business
- natural person / new business
- female entrepreneurship
- mixed entity case with university/research/network
- low-quality source fail-safe case
- suspicious numeric extraction case

For each, verify:
- deterministic plan
- grounded questions
- branch validity
- option validity
- no reopened ambiguity
- enough depth
- no premature success
- no ridiculous numeric values
- clean Italian
- `/quiz/autoimpiego` unchanged
- onboarding outcomes preserved

---

## Definition of done
The task is complete only if all are true:
- the engine is internally correct
- the engine is family-aware
- the engine is branch-aware
- every next question uses prior answers semantically
- no incompatible downstream question survives
- rich bandi generate rich quizzes
- poor bandi fail safe
- first question is clean
- quiz feels serious and intelligent to users
- suspicious numeric values are quarantined
- weak quizzes are quarantined
- onboarding proceeds for eligible / likely_eligible / needs_review
- `/quiz/autoimpiego` remains untouched
- proof on real bandi confirms this behavior

---

## Final output required from Codex
Return only:
1. files changed
2. commands run
3. test results
4. runtime proof results on required real bandi
5. final verdict: ready or not ready

Do not answer with theory only.
Do not answer with reports only.
The task is not complete until the real runtime path behaves correctly.
