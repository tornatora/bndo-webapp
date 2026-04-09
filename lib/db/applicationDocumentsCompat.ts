import { isMissingDbObjectError } from '@/lib/ops/dbErrorGuards';

type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        order: (column: string, opts: { ascending: boolean }) => {
          limit: (value: number) => Promise<{ data: Array<Record<string, unknown>> | null; error: { message?: string } | null }>;
        };
      };
      in: (column: string, values: string[]) => {
        order: (column: string, opts: { ascending: boolean }) => {
          limit: (value: number) => Promise<{ data: Array<Record<string, unknown>> | null; error: { message?: string } | null }>;
        };
      };
    };
  };
};

export type ApplicationDocumentCompatRow = {
  id?: string;
  application_id: string;
  file_name: string;
  requirement_key: string | null;
  created_at?: string;
  storage_path?: string;
  file_size?: number;
  mime_type?: string;
};

function asCompatRows(rows: Array<Record<string, unknown>>) {
  return rows.map((row) => ({
    id: typeof row.id === 'string' ? row.id : undefined,
    application_id: String(row.application_id ?? ''),
    file_name: String(row.file_name ?? ''),
    requirement_key: typeof row.requirement_key === 'string' ? row.requirement_key : null,
    created_at: typeof row.created_at === 'string' ? row.created_at : undefined,
    storage_path: typeof row.storage_path === 'string' ? row.storage_path : undefined,
    file_size: typeof row.file_size === 'number' ? row.file_size : undefined,
    mime_type: typeof row.mime_type === 'string' ? row.mime_type : undefined
  })) as ApplicationDocumentCompatRow[];
}

export async function listApplicationDocumentsCompat(args: {
  client: SupabaseLike;
  applicationIds: string[];
  limit?: number;
  ascending?: boolean;
  includeExtendedColumns?: boolean;
}) {
  const { client, applicationIds, limit = 500, ascending = false, includeExtendedColumns = false } = args;
  if (applicationIds.length === 0) {
    return { rows: [] as ApplicationDocumentCompatRow[], usedFallbackWithoutRequirementKey: false, error: null };
  }

  const withRequirementKeyColumns = includeExtendedColumns
    ? 'id, application_id, file_name, requirement_key, created_at, storage_path, file_size, mime_type'
    : 'application_id, file_name, requirement_key';
  const withoutRequirementKeyColumns = includeExtendedColumns
    ? 'id, application_id, file_name, created_at, storage_path, file_size, mime_type'
    : 'application_id, file_name';

  const primary = await client
    .from('application_documents')
    .select(withRequirementKeyColumns)
    .in('application_id', applicationIds)
    .order('created_at', { ascending })
    .limit(limit);

  if (!primary.error) {
    return {
      rows: asCompatRows(primary.data ?? []),
      usedFallbackWithoutRequirementKey: false,
      error: null
    };
  }

  if (!isMissingDbObjectError(primary.error)) {
    return { rows: [] as ApplicationDocumentCompatRow[], usedFallbackWithoutRequirementKey: false, error: primary.error };
  }

  const fallback = await client
    .from('application_documents')
    .select(withoutRequirementKeyColumns)
    .in('application_id', applicationIds)
    .order('created_at', { ascending })
    .limit(limit);

  if (fallback.error) {
    return { rows: [] as ApplicationDocumentCompatRow[], usedFallbackWithoutRequirementKey: true, error: fallback.error };
  }

  return {
    rows: asCompatRows(
      (fallback.data ?? []).map((row) => ({
        ...row,
        requirement_key: null
      }))
    ),
    usedFallbackWithoutRequirementKey: true,
    error: null
  };
}

export async function listApplicationDocumentsForSingleApplicationCompat(args: {
  client: SupabaseLike;
  applicationId: string;
  limit?: number;
  ascending?: boolean;
  includeExtendedColumns?: boolean;
}) {
  return listApplicationDocumentsCompat({
    client: args.client,
    applicationIds: [args.applicationId],
    limit: args.limit,
    ascending: args.ascending,
    includeExtendedColumns: args.includeExtendedColumns
  });
}
