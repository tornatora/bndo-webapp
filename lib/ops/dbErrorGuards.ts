type DbErrorLike = { message?: string | null } | string | null | undefined;

function readMessage(error: DbErrorLike) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  return String(error.message ?? '');
}

export function isMissingDbObjectError(error: DbErrorLike) {
  const message = readMessage(error).toLowerCase();
  if (!message) return false;
  return (
    message.includes('could not find the table') ||
    message.includes('could not find the relation') ||
    message.includes('schema cache') ||
    (message.includes('relation') && message.includes('does not exist')) ||
    (message.includes('column') && message.includes('does not exist'))
  );
}

export function isMissingTable(error: DbErrorLike, tableName: string) {
  const message = readMessage(error).toLowerCase();
  if (!message) return false;
  const table = tableName.toLowerCase();
  return isMissingDbObjectError(error) && message.includes(table);
}
