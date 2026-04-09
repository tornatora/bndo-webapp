/**
 * Notifications engine unit checks.
 * Run with: npx tsx scripts/test-notifications-engine-unit.ts
 */
import { __notificationTestUtils } from '@/lib/notifications/engine';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

let passed = 0;

function main() {
  const actionClientDoc = __notificationTestUtils.defaultActionPath(
    {
      eventType: 'document_requested',
      applicationId: '00000000-0000-0000-0000-000000000123'
    },
    'client_admin'
  );
  assert(
    actionClientDoc === '/dashboard/practices/00000000-0000-0000-0000-000000000123',
    'client document action path should point to practice detail'
  );
  passed++;

  const actionConsultantPayment = __notificationTestUtils.defaultActionPath(
    { eventType: 'payment_received' },
    'consultant'
  );
  assert(actionConsultantPayment === '/consultant/billing', 'consultant payment action should point billing');
  passed++;

  const copy = __notificationTestUtils.copyForRole(
    { eventType: 'assignment_updated' },
    'client_admin',
    {
      actorName: 'Ops',
      customerName: 'Mario Rossi',
      practiceTitle: 'Bando Smart',
      companyName: 'Mario SRL',
      documentLabel: 'Documento',
      amountLabel: '€600,00',
      progressLabel: 'Istruttoria',
      messagePreview: 'Test'
    }
  );
  assert(
    /consulente assegnato/i.test(copy.title),
    'assignment copy for client should explicitly mention consultant assignment'
  );
  passed++;

  const deliverPayoutToClient = __notificationTestUtils.shouldDeliverToRecipient(
    { eventType: 'payout_paid' },
    { id: 'x', role: 'client_admin', fullName: null, email: null }
  );
  assert(deliverPayoutToClient === false, 'payout events should not be delivered to client');
  passed++;

  const skipSelf = __notificationTestUtils.shouldDeliverToRecipient(
    { eventType: 'chat_message_new', actorProfileId: 'same-id' },
    { id: 'same-id', role: 'consultant', fullName: null, email: null }
  );
  assert(skipSelf === false, 'sender should not receive own notification');
  passed++;

  const money = __notificationTestUtils.currencyLabel(65000, 'EUR');
  assert(/65/.test(money), 'currency formatting should expose amount');
  passed++;

  console.log(`✅ Notifications unit checks passed: ${passed}`);
}

main();
