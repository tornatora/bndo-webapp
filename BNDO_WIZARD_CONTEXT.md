# BNDO Wizard — Contesto Completo per Codex (Resume Point)

> **LAST UPDATED**: 2024-04-30  
> **DEPLOY URL**: https://fix-pdf-extraction--cheerful-cobbler-f23efc.netlify.app  
> **DEPLOY ALIAS**: `fix-pdf-extraction`  
> **DEPLOY FROM**: `/Users/nataleletteriotornatora/Documents/bndo-webapp` (NOT `bndo-live-aligned/`)  
> **BUILD CMD**: `npm run build:app` then `netlify deploy --alias fix-pdf-extraction`

---

## 🚀 RESUME POINT — START HERE

> **ULTIMO MESSAGGIO PROCESSATO**: L'utente ha chiesto di aggiungere al file di contesto il punto esatto da cui Codex deve ripartire. Questo è quel messaggio.
>
> **STATO AL MOMENTO DELLA RICHIESTA**:
> - Deploy completato su Netlify: `https://fix-pdf-extraction--cheerful-cobbler-f23efc.netlify.app`
> - Build OK, nessun errore TypeScript
> - File di contesto `BNDO_WIZARD_CONTEXT.md` creato
> - File guida `NETLIFY_PREVIEW_GUIDE.md` creato
> - File `BNDO_WIZARD_CONTEXT.md` viene aggiornato con questa sezione
>
> **PROSSIMO STEP**: Aspettare istruzioni dall'utente. Possibili direzioni:
> 1. Testare il deploy e verificare se i PDF DSAN funzionano correttamente
> 2. Pulire manualmente i template DOCX taggati (placeholder in posizioni errate)
> 3. Aggiungere fallback client-side se Puppeteer fallisce su Netlify
> 4. Aggiungere placeholder mancanti nei template
> 5. Qualsiasi altra modifica richiesta dall'utente
>
> **IMPORTANTE**: Non fare nulla di autonomo — aspettare sempre l'input dell'utente prima di procedere.

---

## 1. Architecture Overview

Next.js 14.2.35 app. Wizard 11-step for compiling BNDO (Invitalia) grant applications.

**Steps:**
1. Benvenuto
2. Upload Visura Camerale (PDF)
3. Upload Carta d'Identità
4. Altri Documenti
5. Estrazione Dati (AI extraction from uploaded docs)
6. Revisione Dati (editable table of extracted fields)
7. Compilazione Documenti (fillable override fields + generate docs)
8. Documenti DSAN (5 individual document boxes with download)
9. Offerta AI Agent (Yes/No)
10. Browser Bando (SPID login + auto-fill control center)
11. Conferma Finale (success + summary)

**Key directories:**
```
features/compila-bando/
  components/          # Step1-Step11 + sub-components
  hooks/               # useCompilaBandoWizard (state management)
  layouts/             # CompilaBandoLayout (sidebar + footer nav)
  lib/                 # types.ts, pdfGenerator.ts, demoData.ts
  pages/               # CompilaBandoPage.tsx (orchestrator)
  styles/              # compila-bando.module.css
public/templates/          # Original DOCX templates (untagged)
public/templates_tagged/   # DOCX templates with {placeholder} inserted
```

---

## 2. State Shape (WizardState)

```ts
export type WizardState = {
  currentStep: WizardStep;        // 1-11
  direction: 'next' | 'back';
  useAiAgent: boolean;
  files: {
    visura: UploadedFile | null;
    cartaIdentita: UploadedFile | null;
    altri: UploadedFile[];
  };
  extracted: ExtractedData;       // ragione_sociale, sede_legale, cf, piva, etc.
  customFields: CustomField[];
  generatedPdfBlob: Blob | null;  // Scheda Aziendale PDF (client-side jsPDF)
  generatedDocs: GeneratedDoc[];  // 5 DSAN docs (each with blob)
  dsanStatus: DocStatus;          // 'generating' | 'ready' | 'error'
  dsanError: string;
  spidPhase: SpidPhase;
  spidAuthenticated: boolean;
};
```

**Important:** `generatedDocxBlob` was REMOVED from state. All 5 DSAN docs are now stored individually in `generatedDocs` array, each with its own `blob`.

---

## 3. What Was Done (Chronological)

### 3.1 Fixed Deploy Issues
- **Problem**: Deploys were going to `bndo-live-aligned/` with broken `netlify.toml` (missing `publish = ".next"`)
- **Solution**: Deploy from `bndo-webapp/` which has correct `netlify.toml`
- **Netlify site ID**: `0c6924aa-7626-492e-94fa-a4c368cfb85b`

### 3.2 Step 10 — Browser Bando (SPID)
**Before**: Fake browser with animated cursor, typing simulation, screenshots
**After**: Clean control center:
- Calls `/api/compila-bando/auto-fill` to initialize Browserbase session
- Shows connection status + progress bar during auto-fill
- Polls `/api/compila-bando/session-status` every 2s
- **CRITICAL FIX**: "Accedi con SPID" button is ALWAYS clickable now
  - If `session` exists → opens `session.liveViewUrl`
  - If no session → opens `https://www.invitalia.it/` as fallback
  - Removed `disabled={!session}` constraint
- Auto-starts `execute-flow` when login detected

### 3.3 Step 7 → Step 8 — Document Generation Evolution

#### Phase 1: Fake DOCX (REMOVED)
- `generate-docs` API created a single generic "Documento Anagrafico" DOCX
- 5 DSAN names were listed but NOT actually generated
- **This was completely removed**

#### Phase 2: Custom PDFs with jsPDF (REPLACED)
- Generated 5 PDFs programmatically with jsPDF + jspdf-autotable
- Each had title, declaratory text, data table, signature block
- **User rejected**: "not the real templates, just similar documents"

#### Phase 3: REAL Templates → DOCX → PDF (CURRENT)
1. **Found original templates** in user's Downloads:
   `/Users/nataleletteriotornatora/Downloads/Documenti Compilazione Automatica/`
   - `DSAN Antiriciclaggio rsud acn.docx`
   - `DSAN Casellario e procedure concorsuali liquidatorie.docx`
   - `DSAN Possesso requisiti iniziativa economica.docx`
   - `DSAN Possesso requisiti soggettivi.docx`
   - `Descrizione iniziativa economica_attività individuali.docx`

2. **Copied to project**:
   - `public/templates/` — original untouched templates
   - `public/templates_tagged/` — templates with {placeholders} inserted

3. **Tagged templates with Python** (`/tmp/tag_templates.py`):
   - Used `python-docx` to find text patterns and insert placeholders
   - Patterns replaced:
     - `Il/La sottoscritto/a` → `Il/La sottoscritto/a {nome_legale_rappresentante}`
     - `Denominazione iniziativa economica:` → `Denominazione iniziativa economica: {ragione_sociale}`
     - `Sede legale` → `Sede legale {sede_legale}`
     - `P.IVA` → `P.IVA {partita_iva}`
     - `codice ATECO:` → `codice ATECO: {ateco}`
     - `Descrizione ATECO:` → `Descrizione ATECO: {descrizione_ateco}`
     - `residente a` → `residente a {residenza}`
     - `Provincia` → `Provincia {provincia}`
     - `CAP` → `CAP {cap}`
     - `Via/Piazza` → `Via/Piazza {indirizzo}`
     - `descrizione dell'iniziativa economica:` → `descrizione dell'iniziativa economica: {descrizione_iniziativa}`
     - `Importo stimato` → `Importo stimato {importo_programma}`
   - **WARNING**: The Python script did blanket replace across ALL tables. Some replacements may have hit wrong cells. The tagged templates likely need manual cleanup in Word.

4. **API Endpoint** (`app/api/compila-bando/generate-dsan/route.ts`):
   - `POST` with `{ doc, data, overrides, mode, format }`
   - `doc`: one of `dsan_antiriciclaggio`, `dsan_casellario_liquidatorie`, `dsan_requisiti_iniziativa`, `dsan_requisiti_soggettivi`, `descrizione_iniziativa_c2`
   - Uses `docxtemplater` + `pizzip` to compile placeholders
   - `format: 'docx'` → returns compiled DOCX
   - `format: 'pdf'` → converts DOCX→HTML (mammoth) → PDF (Puppeteer + @sparticuz/chromium)
   - **Payload mapping**:
     ```ts
     {
       ragione_sociale, sede_legale, codice_fiscale, partita_iva,
       rea, forma_giuridica, nome_legale_rappresentante, email_pec, telefono,
       ateco, descrizione_ateco,
       residenza: overrides.residenza_legale_rappresentante,
       provincia: parsed from sede_legale regex /\(([A-Z]{2})\)/,
       cap: parsed from sede_legale regex /\b(\d{5})\b/,
       indirizzo: parsed from sede_legale regex /^([^,(]+)/,
       descrizione_iniziativa: overrides.descrizione_iniziativa,
       importo_programma: overrides.importo_programma,
       luogo: overrides.luogo_firma,
       data: overrides.data_firma
     }
     ```

5. **Frontend** (`Step7CompilazioneDoc.tsx`):
   - Still generates Scheda Aziendale PDF client-side via `generatePDF()`
   - For DSAN: calls `/api/compila-bando/generate-dsan` with `format: 'pdf'` for each of 5 docs
   - Receives base64, converts to Blob, stores in `generatedDocs`
   - Passes to parent via `onGeneratedDocs(docs)`

6. **Step 8** (`Step8DocumentiDSAN.tsx`):
   - Shows 5 boxes, one per document
   - Each has: filename, status icon, "Scarica DOCX" button
   - Downloads individual blob on click

---

## 4. File Inventory with Status

| File | Purpose | Status |
|------|---------|--------|
| `features/compila-bando/lib/types.ts` | Type definitions | ✅ Updated (dsan instead of docx) |
| `features/compila-bando/lib/pdfGenerator.ts` | jsPDF generators | ✅ Has generatePDF + 5 DSAN generators (now mostly unused, Scheda Aziendale still used) |
| `features/compila-bando/hooks/useCompilaBandoWizard.ts` | State management | ✅ Updated (dsanStatus, dsanError, removed docxBlob) |
| `features/compila-bando/pages/CompilaBandoPage.tsx` | Orchestrator | ✅ Updated props for Step7, Step8, Step11 |
| `features/compila-bando/components/Step7CompilazioneDoc.tsx` | Doc generation | ✅ Calls API with format:pdf, has manual fields |
| `features/compila-bando/components/Step8DocumentiDSAN.tsx` | 5 doc boxes | ✅ Shows individual downloads |
| `features/compila-bando/components/Step10BrowserBando.tsx` | SPID control | ✅ Button always clickable |
| `features/compila-bando/components/Step11ConfermaFinale.tsx` | Success | ✅ Updated to hasDsan |
| `app/api/compila-bando/generate-dsan/route.ts` | DSAN compilation | ✅ Docxtemplater + optional PDF via Puppeteer |
| `public/templates_tagged/*.docx` | Tagged templates | ⚠️ May need manual cleanup |

**REMOVED:**
- `app/api/compila-bando/generate-docs/route.ts` — old fake DOCX generator

---

## 5. Installed Dependencies

```bash
# PDF generation (client-side, for Scheda Aziendale)
npm install jspdf jspdf-autotable

# DOCX manipulation
npm install docxtemplater pizzip

# DOCX → HTML conversion (server-side for PDF)
npm install mammoth

# Browser automation for PDF printing
npm install @sparticuz/chromium puppeteer-core

# Browser cloud (Step 10)
npm install @browserbasehq/sdk
```

---

## 6. Known Issues & Risks

### 6.1 Puppeteer/Chromium on Netlify
- **Risk**: `@sparticuz/chromium` + `puppeteer-core` may exceed Netlify function bundle size limit (~50MB)
- **Risk**: PDF conversion may timeout (>10s) on cold start
- **Mitigation**: If this fails, fallback to returning DOCX only and add client-side mammoth+html2pdf conversion

### 6.2 Tagged Templates Quality
- Python script did global text replacement across paragraphs AND table cells
- Some placeholders may have been inserted in wrong locations
- **Recommended**: Open each tagged DOCX in Word and manually verify/adjust placeholder positions

### 6.3 Missing Placeholders
- Some fields in original templates may not have been tagged
- For example: "Estremi documento di identità", "data di nascita", etc.
- Need manual review of each template to identify ALL fillable fields

### 6.4 PDF Fidelity
- DOCX → HTML → PDF conversion loses some Word-specific formatting
- Not pixel-perfect to original DOCX
- **Alternative**: If user wants perfect PDFs, need LibreOffice headless on server (not feasible on Netlify) or use external conversion API

### 6.5 Page 404 on /compila-bando-preview
- User reported this URL returns 404
- Check if route exists in `app/` directory structure
- May need to verify `app/compila-bando-preview/page.tsx` exists

---

## 7. Next Steps (Priority Order)

1. **TEST THE DEPLOY** — Verify PDF generation works on Netlify (check function logs for errors)
2. **If PDF fails** — Implement fallback: API returns compiled DOCX, client converts DOCX→PDF via mammoth+html2pdf.js
3. **Manual template cleanup** — Open each tagged DOCX in Word, verify placeholder positions, fix any misplaced tags
4. **Add missing placeholders** — Identify all fillable fields in original templates and add missing {placeholders}
5. **Improve PDF quality** — If Puppeteer conversion is too slow/low-quality, consider:
   - Using `pdf-lib` to create field-perfect PDFs from scratch (replicate original layouts precisely)
   - Using external conversion service (ConvertAPI, CloudConvert)
   - Deploying a separate LibreOffice microservice

---

## 8. How to Resume Work

```bash
# 1. Go to correct directory
cd /Users/nataleletteriotornatora/Documents/bndo-webapp

# 2. Verify dependencies are installed
npm ls docxtemplater pizzip mammoth @sparticuz/chromium puppeteer-core jspdf jspdf-autotable

# 3. Build (skip tests — they have pre-existing failures)
npm run build:app

# 4. Deploy
netlify deploy --alias fix-pdf-extraction

# 5. Check function logs if errors
open https://app.netlify.com/projects/cheerful-cobbler-f23efc/logs/functions
```

---

## 9. Key Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| Apr 29 | Deploy from `bndo-webapp/` not `bndo-live-aligned/` | Broken netlify.toml in aligned |
| Apr 29 | Removed fake browser from Step 10 | User wanted real functionality |
| Apr 29 | Replaced DOCX with custom PDFs (jsPDF) | User wanted PDF not DOCX |
| Apr 30 | Replaced custom PDFs with real templates | User wanted original Invitalia templates |
| Apr 30 | Used docxtemplater on tagged DOCX | Only way to compile real templates dynamically |
| Apr 30 | Added Puppeteer PDF conversion | User insisted on PDF output |
| Apr 30 | Made SPID button always clickable | Session initialization was failing silently |

---

## 10. User Requirements (Extracted from Chat)

- "5 box per ogni documento" — 5 individual download boxes
- "si devono compilare davvero con i contenuti dello step precedente" — Real data pre-filled
- "si devono compilare perfettamente negli appositi campi" — Data in correct template fields
- "non docx, deve restituirli all'utente in pdf convertiti perfettamente" — PDF output, perfect conversion
- "senza trasformazioni assolutamente" — User wants no format mutations (ideal: native PDF from template)
