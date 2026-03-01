import type { ConversationMode } from '@/lib/conversation/types';

function pickFirstQuestion(text: string) {
  const segments = text.split('\n').map((x) => x.trim()).filter(Boolean);
  if (segments.length <= 1) return text.trim();

  const out: string[] = [];
  let hasQuestion = false;
  for (const s of segments) {
    const isQuestion = s.includes('?');
    if (isQuestion && hasQuestion) continue;
    if (isQuestion) hasQuestion = true;
    out.push(s);
  }
  return out.join('\n\n').trim();
}

export function composeAssistantReply(args: {
  directAnswer: string | null;
  recap: string | null;
  bridgeQuestion: string | null;
  mode: ConversationMode;
}) {
  const { directAnswer, recap, bridgeQuestion, mode } = args;
  const chunks: string[] = [];
  if (directAnswer) chunks.push(directAnswer.trim());
  if (recap && mode !== 'qa') chunks.push(recap.trim());
  if (bridgeQuestion && mode !== 'scan_ready') chunks.push(bridgeQuestion.trim());
  return pickFirstQuestion(chunks.filter(Boolean).join('\n\n'));
}

