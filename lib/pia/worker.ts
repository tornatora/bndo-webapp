/**
 * PIA Automation Worker
 *
 * Esegue la compilazione automatica sul portale Invitalia PIA.
 * Può essere avviato come:
 *   1. Script standalone: node -r dotenv/config lib/pia/worker.mjs
 *   2. Webhook handler: chiamato da un orchestratore esterno
 *
 * Flusso:
 *   1. Connetti a Browserbase/Browserless via CDP
 *   2. Carica input (dati utente, documenti, progetto)
 *   3. Naviga su Invitalia e fa login SPID (attesa manuale)
 *   4. Compila tutti i form
 *   5. Scarica format di domanda
 *   6. Attende firma digitale (upload P7M)
 *   7. Carica allegati
 *   8. Aggiorna job su Supabase
 */

import type { Page } from 'playwright';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { loadPiaAutomationInputs } from './loadInputs';
import { connectToRemoteBrowser, runPiaFormFill, waitForSpidLogin, finalStep1_controlli, finalStep2_downloadFormat, finalStep2_uploadSignedFormat, finalStep3_uploadAttachments, ensureFinalFlowStep } from './automation';
import { mapDocumentsToInvitaliaTargets, type InvitaliaAttachmentTarget } from './attachments';
import { createJob, getJob, updateJob, withAppendedLog } from './jobStore';
import type { PiaAutomationLogger, PiaAutomationRuntime } from './automation';
import type { PiaAutomationDocumentSlot, PiaAutomationInputs, PiaAutomationJobRow } from './types';

export type WorkerOptions = {
  applicationId: string;
  createdBy: string;
  browserConnectUrl: string;
  jobId?: string;
};

export type WorkerResult = {
  success: boolean;
  jobId: string;
  error?: string;
  formatBytes?: Uint8Array;
};

function makeLogger(jobId: string, supabaseAdmin: any, jobRef: { current: PiaAutomationJobRow | null }): PiaAutomationLogger {
  return async (level, msg) => {
    console.log(`[${level.toUpperCase()}] [${jobId.slice(0, 8)}] ${msg}`);
    if (jobRef.current) {
      try {
        jobRef.current.progress = withAppendedLog(jobRef.current.progress, { level, msg });
        await updateJob(supabaseAdmin, jobId, { progress: jobRef.current.progress });
      } catch {
        // Ignora errori di scrittura log
      }
    }
  };
}

async function waitForJobStart(supabaseAdmin: any, jobId: string, maxWaitMs = 60_000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < maxWaitMs) {
    const job = await getJob(supabaseAdmin, jobId);
    if (!job) throw new Error('Job non trovato dopo creazione');
    if (job.status === 'running' || job.status === 'queued') return;
    if (job.status === 'stopped') throw new Error('Job fermato prima dell\'avvio');
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('Timeout attesa avvio job');
}

export async function runPiaAutomationWorker(options: WorkerOptions): Promise<WorkerResult> {
  const { applicationId, createdBy, browserConnectUrl, jobId: existingJobId } = options;
  const supabaseAdmin = getSupabaseAdmin();

  // Crea o recupera job
  let jobId = existingJobId || '';
  if (!jobId) {
    const job = await createJob(supabaseAdmin, {
      applicationId,
      createdBy,
      browserbaseSessionId: browserConnectUrl,
      status: 'queued',
      phase: 'bootstrap',
    });
    jobId = job.id;
  }

  const jobRef: { current: PiaAutomationJobRow | null } = { current: null };
  const logger = makeLogger(jobId, supabaseAdmin, jobRef);

  let runtime: PiaAutomationRuntime | null = null;

  try {
    // Carica job e input
    jobRef.current = await getJob(supabaseAdmin, jobId);
    if (!jobRef.current) throw new Error('Job non trovato');

    logger('info', 'Carico dati pratica…');
    const inputs: PiaAutomationInputs = await loadPiaAutomationInputs({ supabaseAdmin, applicationId });

    logger('info', 'Connessione al browser remoto…');
    await updateJob(supabaseAdmin, jobId, { status: 'running', phase: 'bootstrap' });
    jobRef.current = await getJob(supabaseAdmin, jobId);
    if (!jobRef.current) throw new Error('Job non trovato');

    runtime = await connectToRemoteBrowser(browserConnectUrl);
    const page = runtime.page;

    // Wait for SPID login
    logger('info', 'Attendo login SPID (apri il browser e fai login via SPID)...');
    await updateJob(supabaseAdmin, jobId, { phase: 'spid_wait' });
    jobRef.current = await getJob(supabaseAdmin, jobId);

    await waitForSpidLogin(page, logger, 300_000);

    // Form fill
    logger('info', 'Avvio compilazione form…');
    await updateJob(supabaseAdmin, jobId, { phase: 'form_fill' });
    jobRef.current = await getJob(supabaseAdmin, jobId);

    await runPiaFormFill(page, inputs, logger);

    // Final step 1: controlli
    logger('info', 'Step 1: Controlli…');
    await updateJob(supabaseAdmin, jobId, { phase: 'final_step_1' });
    jobRef.current = await getJob(supabaseAdmin, jobId);
    await ensureFinalFlowStep(page, logger);
    await finalStep1_controlli(page, logger);

    // Download format
    logger('info', 'Download format domanda…');
    await updateJob(supabaseAdmin, jobId, { phase: 'format_download' });
    jobRef.current = await getJob(supabaseAdmin, jobId);
    const format = await finalStep2_downloadFormat(page, logger);

    // Waiting for signature
    logger('info', 'Format scaricato. Attesa firma digitale…');
    await updateJob(supabaseAdmin, jobId, { phase: 'waiting_signature', status: 'waiting_user' });
    jobRef.current = await getJob(supabaseAdmin, jobId);

    // A questo punto l'utente deve firmare digitalmente il format.
    // Il worker si ferma qui e aspetta che l'utente carichi il P7M.
    // Quando il P7M viene caricato tramite API, il worker riprende.

    logger('info', 'Worker in attesa di firma digitale…');
    return {
      success: true,
      jobId,
      formatBytes: format.bytes,
    };

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger('error', `Worker fallito: ${msg}`);

    await updateJob(supabaseAdmin, jobId, {
      status: 'failed',
      error: msg.slice(0, 500),
    }).catch(() => undefined);

    return { success: false, jobId, error: msg };
  }
}

/**
 * Continua un worker dopo che la firma digitale è stata caricata.
 * Questa funzione riprende dal phase 'waiting_signature'.
 */
export async function resumePiaAutomationAfterSignature(
  options: WorkerOptions & { signedFormat: PiaAutomationDocumentSlot }
): Promise<WorkerResult> {
  const { applicationId, browserConnectUrl, jobId: existingJobId, signedFormat } = options;
  const supabaseAdmin = getSupabaseAdmin();

  if (!existingJobId) throw new Error('jobId richiesto per resume');

  const jobRef: { current: PiaAutomationJobRow | null } = { current: null };
  const logger = makeLogger(existingJobId, supabaseAdmin, jobRef);

  let runtime: PiaAutomationRuntime | null = null;

  try {
    jobRef.current = await getJob(supabaseAdmin, existingJobId);
    if (!jobRef.current) throw new Error('Job non trovato');

    logger('info', 'Riprendo automazione dopo firma digitale…');
    await updateJob(supabaseAdmin, existingJobId, { status: 'running', phase: 'format_upload' });

    const inputs: PiaAutomationInputs = await loadPiaAutomationInputs({ supabaseAdmin, applicationId });

    runtime = await connectToRemoteBrowser(browserConnectUrl);
    const page = runtime.page;

    // Upload signed format
    await finalStep2_uploadSignedFormat(page, signedFormat, logger);
    logger('info', 'Format firmato caricato.');

    // Upload attachments
    logger('info', 'Carico allegati…');
    await updateJob(supabaseAdmin, existingJobId, { phase: 'attachments' });
    const targets: InvitaliaAttachmentTarget[] = mapDocumentsToInvitaliaTargets(inputs);
    await finalStep3_uploadAttachments(page, targets, logger);

    // Done
    logger('info', 'Automazione completata con successo!');
    await updateJob(supabaseAdmin, existingJobId, { status: 'done', phase: 'ready_to_submit' });

    return { success: true, jobId: existingJobId };

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger('error', `Resume fallito: ${msg}`);
    await updateJob(supabaseAdmin, existingJobId, { status: 'failed', error: msg.slice(0, 500) }).catch(() => undefined);
    return { success: false, jobId: existingJobId, error: msg };
  }
}
