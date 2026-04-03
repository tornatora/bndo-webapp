export type AppRole = 'client_admin' | 'consultant' | 'ops_admin';

export function hasOpsAccess(role: string) {
  return role === 'consultant' || role === 'ops_admin';
}

export function hasAdminAccess(role: string) {
  return role === 'ops_admin';
}

export function hasConsultantAccess(role: string) {
  return role === 'consultant';
}
