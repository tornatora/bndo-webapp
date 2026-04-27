import { runStreamingChat } from '../lib/ai/conversationOrchestrator';
import type { UserProfile } from '../lib/conversation/types';

export type StreamResult = {
  text: string;
  metadata: Record<string, unknown> | null;
  textChunks: number;
};

export const LIMITED_OPTIONS = {
  limitedSpecialistMode: true,
  allowedMeasures: ['resto-al-sud-20', 'autoimpiego-centro-nord'],
};

export function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

export function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function includesAny(text: string, snippets: string[]) {
  const normalizedText = normalize(text);
  return snippets.some((snippet) => normalizedText.includes(normalize(snippet)));
}

export async function collectTurn(args: {
  message: string;
  profile?: Partial<UserProfile>;
  history?: { role: 'user' | 'assistant'; text: string }[];
}): Promise<StreamResult> {
  const chunks: string[] = [];
  let metadata: Record<string, unknown> | null = null;
  let textChunks = 0;

  for await (const event of runStreamingChat(args.message, args.profile ?? {}, args.history ?? [], LIMITED_OPTIONS)) {
    if (event.type === 'text') {
      textChunks += 1;
      chunks.push(String(event.content ?? ''));
    }
    if (event.type === 'metadata') metadata = (event.content ?? null) as Record<string, unknown> | null;
    if (event.type === 'error') throw new Error(String(event.content ?? 'stream error'));
  }

  return {
    text: chunks.join('').replace(/\s+/g, ' ').trim(),
    metadata,
    textChunks,
  };
}

export async function runCases(cases: Array<{ name: string; fn: () => Promise<void> }>) {
  const results: Array<{ name: string; ok: boolean; detail?: string }> = [];

  for (const item of cases) {
    try {
      await item.fn();
      results.push({ name: item.name, ok: true });
    } catch (error) {
      results.push({ name: item.name, ok: false, detail: String((error as Error)?.message ?? error) });
    }
  }

  const passed = results.filter((entry) => entry.ok).length;
  const total = results.length;

  for (const result of results) {
    if (result.ok) {
      console.log(`PASS ${result.name}`);
    } else {
      console.error(`FAIL ${result.name}: ${result.detail}`);
    }
  }

  if (passed !== total) {
    throw new Error(`failed (${passed}/${total} passed)`);
  }

  console.log(`PASS (${passed}/${total})`);
}
