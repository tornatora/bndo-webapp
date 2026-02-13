export type MockClient = {
  companyId: string;
  companyName: string;
  vatNumber: string | null;
  industry: string | null;
  createdAt: string;
  clientEmail: string;
  clientFullName: string;
};

export type MockPractice = {
  id: string;
  tender_id: string;
  status: 'draft' | 'submitted' | 'reviewed';
  supplier_registry_status: 'pending' | 'in_progress' | 'completed';
  notes: string | null;
  updated_at: string;
};

export type MockDocument = {
  id: string;
  application_id: string;
  file_name: string;
  storage_path: string;
  file_size: number;
  mime_type: string;
  created_at: string;
  downloadUrl: string | null;
};

export type MockClientDetail = {
  client: MockClient;
  threadId: string;
  practices: MockPractice[];
  documents: MockDocument[];
};

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

// Hardcoded UUIDs so routing/params stay stable.
const CLIENTS: MockClient[] = [
  {
    companyId: '11111111-1111-1111-1111-111111111111',
    companyName: 'Azienda Demo Srl',
    vatNumber: 'IT01234567890',
    industry: 'Servizi',
    createdAt: isoDaysAgo(12),
    clientEmail: 'demo@example.com',
    clientFullName: 'Mario Rossi'
  },
  {
    companyId: '22222222-2222-2222-2222-222222222222',
    companyName: 'Beta Costruzioni Spa',
    vatNumber: 'IT09876543210',
    industry: 'Edilizia',
    createdAt: isoDaysAgo(28),
    clientEmail: 'beta@example.com',
    clientFullName: 'Laura Bianchi'
  }
];

export function getMockClients(): MockClient[] {
  return CLIENTS;
}

export function getMockClientDetail(companyId: string): MockClientDetail | null {
  const client = CLIENTS.find((c) => c.companyId === companyId);
  if (!client) return null;

  const threadId = `mock-thread-${companyId}`;
  const now = new Date().toISOString();

  const practices: MockPractice[] = [
    {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
      tender_id: 'resto_sud_2_0',
      status: 'submitted',
      supplier_registry_status: 'in_progress',
      notes: 'DEMO: in attesa documenti integrativi per completare la pratica.',
      updated_at: now
    },
    {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
      tender_id: 'autoimpiego_centro_nord',
      status: 'draft',
      supplier_registry_status: 'pending',
      notes: null,
      updated_at: isoDaysAgo(2)
    }
  ];

  // Make docs exist for the first practice only, so "mancanti" is testable.
  const documents: MockDocument[] = [
    {
      id: 'dddddddd-dddd-dddd-dddd-dddddddddd01',
      application_id: practices[0].id,
      file_name: 'Visura-camerale-demo.pdf',
      storage_path: 'mock/demo/visura.pdf',
      file_size: 182400,
      mime_type: 'application/pdf',
      created_at: isoDaysAgo(1),
      downloadUrl: null
    },
    {
      id: 'dddddddd-dddd-dddd-dddd-dddddddddd02',
      application_id: practices[0].id,
      file_name: 'Bilancio-2023-demo.pdf',
      storage_path: 'mock/demo/bilancio-2023.pdf',
      file_size: 512000,
      mime_type: 'application/pdf',
      created_at: isoDaysAgo(1),
      downloadUrl: null
    }
  ];

  return { client, threadId, practices, documents };
}
