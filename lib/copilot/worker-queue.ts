import { spawn } from 'node:child_process';
import path from 'node:path';

type WorkerJobInput = {
  credentials?: {
    email?: string;
    password?: string;
  };
  source?: 'deterministic' | 'ai_fallback';
  instruction?: string;
};

export async function enqueueCopilotWorkerJob(sessionId: string, input?: WorkerJobInput) {
  const webhookUrl = process.env.COPILOT_WORKER_WEBHOOK_URL?.trim();
  if (webhookUrl) {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(process.env.COPILOT_WORKER_WEBHOOK_SECRET
          ? { authorization: `Bearer ${process.env.COPILOT_WORKER_WEBHOOK_SECRET}` }
          : {}),
      },
      body: JSON.stringify({
        sessionId,
        credentials: input?.credentials ?? {},
        source: input?.source ?? 'deterministic',
        instruction: input?.instruction ?? '',
      }),
      cache: 'no-store',
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Worker webhook failed (${response.status}): ${body}`);
    }
    return;
  }

  if (process.env.NODE_ENV === 'production') {
    return;
  }

  const runnerPath = path.join(process.cwd(), 'worker', 'runner.mjs');
  const child = spawn(process.execPath, [runnerPath, '--session', sessionId], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      COPILOT_SESSION_CREDENTIALS: JSON.stringify(input?.credentials ?? {}),
      COPILOT_JOB_SOURCE: input?.source ?? 'deterministic',
      COPILOT_JOB_INSTRUCTION: input?.instruction ?? '',
    },
  });
  child.unref();
}
