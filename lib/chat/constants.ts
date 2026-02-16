export const AUTO_REPLY_BODY = 'Un nostro consulente ti rispondera il prima possibile.';

export function isAutoReplyMessage(body: string | null | undefined) {
  return (body ?? '').trim() === AUTO_REPLY_BODY;
}

