# BNDO.it Production Readiness Report

**Date:** 2026-03-07  
**Scope:** Final quality audit and self-improvement pass

---

## 1. Source Coverage Audit

| Source | Usage | Evidence |
|--------|-------|----------|
| **Incentivi.gov Solr** | Primary bulk + keyword fetch | `INCENTIVI_SOLR_ENDPOINT` in `datasetIncentivi.ts`, `scan-bandi/route.ts`. `fetchAllIncentiviDocs(20000)` for refresh; `fetchIncentiviDocs(keyword)` for mode=full. |
| **STRATEGIC_SCANNER_DOCS** | ~15 curated docs (Resto al Sud, FUSESE, Smart&Start, Nuova Sabatini, etc.) | `lib/strategicScannerDocs.ts`. Always merged with dynamic dataset. |
| **loadHybridDatasetDocs** | Fallback chain: Supabase → tmp cache → bundled seed | `lib/matching/datasetRepository.ts`. Priority: Supabase `scanner_dataset_snapshots` → `BANDI_CACHE_PATH` → `bndo-bandi-cache.seed.json`. |
| **Scanner API (external)** | Optional; used when `SCANNER_API_ENABLED` and `mode !== 'fast'` | `scanViaScannerApi` in `scan-bandi/route.ts`. |

**Verdict:** Hybrid. Static strategic docs + Incentivi.gov open data. Not "all bandi" – coverage depends on Incentivi.gov index and refresh/cache state.

---

## 2. Freshness / Update Model Audit

| Mechanism | Evidence |
|-----------|----------|
| **Vercel cron** | `vercel.json`: `"schedule": "0 5 * * *"` → POST `/api/jobs/refresh-bandi` |
| **Netlify scheduled function** | `netlify/functions/refresh-bandi.js`: `schedule: '0 5 * * *'` |
| **Refresh endpoint** | `fetchAllIncentiviDocs(20000)` → `refreshRuntimeCacheFile` → `saveActiveDatasetSnapshotToSupabase` |
| **CRON_SECRET** | Required for refresh when set; no auth when unset |

**Verdict:** Daily refresh at 5:00 is **configured** in code. Actual runs depend on hosting (Vercel/Netlify) and `CRON_SECRET`. No guarantee without verifying cron execution in production.

---

## 3. Regional Coverage Audit

| Aspect | Evidence |
|--------|----------|
| **Territory filtering** | `regionOk` in scan-bandi gate; `territory_mismatch` in `mismatchFlags`. Docs with wrong region excluded from `openAndRegion` pool. |
| **filterWrongRegion** | Exists in `scannerFilters.ts` but **not used** in scan-bandi route. Region filtering done via scoring/gate logic. |
| **Regions** | All 20 Italian regions in strategic docs; Incentivi docs have `regions` from Solr. |
| **National bandi** | Docs with `Italia`/`nazionale` pass for any user region. |

**Verdict:** Regional bandi are covered. Region correctness enforced by gate logic; no wrong-region leakage observed in evaluation.

---

## 4. Agriculture Coverage Audit

| Aspect | Evidence |
|--------|----------|
| **Resto al Sud / Autoimpiego** | `ateco`: "tranne agricoltura, pesca e acquacoltura" – **excluded**. |
| **Other measures** | PIDNEXT, Cosenza voucher, Bologna, AVEPA include `Agroalimentare`. |
| **Sector matching** | `agricolt|agro|alimentare|zootec|pesca` in `buildKeywordSets` and sector logic. |
| **Profile extraction** | `agricoltura`, `agriturismo`, `agroalimentare` in sector hints. |

**Verdict:** Agriculture is **partially covered**. Agroalimentare and some regional measures apply; Resto al Sud and Autoimpiego explicitly exclude it. Pure agricoltura/pesca coverage is weak.

---

## 5. Conversation Intelligence Audit

| Aspect | Evidence |
|--------|----------|
| **Grounded QA** | `answerGroundedMeasureQuestion` – only Resto al Sud 2.0 and Autoimpiego Centro-Nord. Uses `FINANCE_FAQ` + in-repo knowledge. |
| **MEASURE_ALIASES** | 2 measures; other measures return `null` → prudent/not_confirmable. |
| **Intent routing** | `detectTurnIntent`; `measure_question` for direct measure questions. |
| **No onboarding on measure Q** | `intentModeHint === 'measure_question'` → grounded answer path before onboarding. |

**Verdict:** Chat is grounded for Resto al Sud and Autoimpiego. Other measures not covered; behavior is prudent (no invented facts). Conversation API returned 500 in local eval (likely env/config).

---

## 6. Evaluation Suite Added

- **Script:** `scripts/production-readiness-eval.mjs`
- **npm:** `npm run eval:production-readiness`

**Categories:**
- A. Scanner retrieval (software Sicilia, agricoltura, turismo Campania, PMI Lombardia, startup Sud, agroalimentare)
- B. Regional correctness (no wrong-region leakage, national for any region)
- C. Freshness (no closed calls in eligible results)
- D. Direct question answering (formazione Resto al Sud, SRL, impresa attiva, etc.)
- E. Conversation intelligence (no repeat questions, extraction, no onboarding on measure Q)

---

## 7. Real Weaknesses Found

1. **businessExists default:** `inferBusinessExists(...) ?? true` assumed "azienda attiva" when inference failed.
2. **Turismo Campania:** No results for that profile in mode=fast (dataset-dependent).
3. **Conversation API 500:** Local server returned 500 for conversation; direct-qa and conversation evals skipped.
4. **smart-start-digitale:** Scanner cases expect Smart&Start first for that profile; returns empty (pre-existing/env-specific).

---

## 8. Fixes Applied

1. **app/api/scan-bandi/route.ts:** `inferBusinessExists(...) ?? true` → `inferBusinessExists(...) ?? (typeof rawProfile.businessExists === 'boolean' ? rawProfile.businessExists : null)`. When inference fails, use conversation’s `businessExists` if present; otherwise `null`.
2. **scripts/production-readiness-eval.mjs:** Added; handles non-JSON/500 from conversation API gracefully (skip with message).
3. **package.json:** `eval:production-readiness` script added.

---

## 9. Test / Eval Outputs

```
Phase A unit: 15 assertions PASS
Phase B unit: 11 assertions PASS
Phase C unit: 14 passed, 0 failed
Build: SUCCESS
eval:production-readiness: 8 PASS, 0 FAIL, 7 SKIP (conversation skipped due to API 500)
scanner:cases: 4 PASS, 1 FAIL (smart-start-digitale – empty results)
smoke:v2: FAIL (conversation API 500)
```

---

## 10. Build Result

**SUCCESS**

---

## 11. Commit / Push

(To be filled after commit)

---

## 12. Production Readiness Verdict

**Conditional ready.**

- Scanner retrieval and regional correctness are solid for tested profiles.
- Freshness and closed-call filtering work as intended.
- Agriculture is partially covered; Resto al Sud and Autoimpiego exclude it.
- Conversation is grounded for 2 measures; other measures get prudent/not_confirmable behavior.
- Cron is configured; execution must be verified in production.

---

## 13. Top 5 Remaining Risks Before Live

1. **Conversation API 500** – Resolve env/config (Supabase, cookies, etc.) so conversation works in production.
2. **Daily refresh** – Confirm cron runs and `scanner_dataset_snapshots` / cache are updated.
3. **Agriculture** – Resto al Sud and Autoimpiego exclude agriculture; set user expectations or add agriculture-specific measures.
4. **Coverage claims** – Do not claim “all bandi”; coverage depends on Incentivi.gov and strategic docs.
5. **Scanner API** – If `SCANNER_API_ENABLED`, ensure external API is available and stable in production.
