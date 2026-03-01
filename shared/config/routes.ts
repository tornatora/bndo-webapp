import { APP_URL, MARKETING_URL } from '@/shared/lib';

export type DashboardNavKey = 'home' | 'pratiche' | 'documenti' | 'messaggi' | 'profilo';

export type DashboardShellItem = {
  key: DashboardNavKey;
  label: string;
  href: string;
  icon: DashboardNavKey;
  external?: boolean;
};

export const routes = {
  marketing: {
    home: '/',
    landing: '/landing',
  },
  auth: {
    login: '/login',
    register: '/register',
    forgotPassword: '/forgot-password',
    resetPassword: '/reset-password',
  },
  quiz: {
    index: '/quiz',
    autoimpiego: '/quiz/autoimpiego',
  },
  dashboard: {
    root: '/dashboard',
    home: '/dashboard/home',
    chat: '/dashboard/chat',
    scanner: '/dashboard/scanner',
    scannerLegacy: '/dashboard/scanner-bandi',
    bandi: '/dashboard/bandi',
    documents: '/dashboard/documents',
    messages: '/dashboard/messages',
    notifications: '/dashboard/notifications',
    profile: '/dashboard/profile',
    password: '/dashboard/password',
    practicesPrefix: '/dashboard/practices',
  },
  admin: {
    root: '/admin',
    clients: '/admin/clients',
  },
  api: {
    authLogin: '/api/auth/login',
    logout: '/api/auth/logout',
  },
} as const;

const DASHBOARD_PUBLIC_SHELL_PATHS = new Set<string>([
  routes.dashboard.home,
  routes.dashboard.chat,
  routes.dashboard.scanner,
  routes.dashboard.scannerLegacy,
  routes.dashboard.bandi,
]);

export function resolveAssistantHomeUrl() {
  const raw = process.env.NEXT_PUBLIC_ASSISTANT_HOME_URL?.trim();
  if (!raw) return MARKETING_URL;
  return raw.replace(/\/+$/, '');
}

export function resolveAppAuthOrigin() {
  const raw = process.env.NEXT_PUBLIC_APP_AUTH_ORIGIN?.trim();
  if (!raw) return APP_URL;
  return raw.replace(/\/+$/, '');
}

export function buildLogoutPath(redirectTarget: string) {
  return `${routes.api.logout}?redirect=${encodeURIComponent(redirectTarget)}`;
}

export function getDashboardShellItems(): DashboardShellItem[] {
  return [
    { key: 'home', label: 'Home', href: resolveAssistantHomeUrl(), icon: 'home', external: true },
    { key: 'pratiche', label: 'Le tue pratiche', href: routes.dashboard.root, icon: 'pratiche' },
    { key: 'documenti', label: 'I tuoi documenti', href: routes.dashboard.documents, icon: 'documenti' },
    { key: 'messaggi', label: 'Messaggi', href: routes.dashboard.messages, icon: 'messaggi' },
    { key: 'profilo', label: 'Profilo', href: routes.dashboard.profile, icon: 'profilo' },
  ];
}

export function resolveDashboardNavKey(pathname: string): DashboardNavKey {
  if (
    pathname === routes.dashboard.root ||
    pathname.startsWith(routes.dashboard.practicesPrefix)
  ) {
    return 'pratiche';
  }
  if (pathname === routes.dashboard.home) return 'home';
  if (pathname.startsWith(routes.dashboard.documents)) return 'documenti';
  if (
    pathname.startsWith(routes.dashboard.messages) ||
    pathname.startsWith(routes.dashboard.notifications)
  ) {
    return 'messaggi';
  }
  if (
    pathname.startsWith(routes.dashboard.profile) ||
    pathname.startsWith(routes.dashboard.password)
  ) {
    return 'profilo';
  }
  return 'pratiche';
}

export function isPublicDashboardShellPath(pathname: string) {
  return DASHBOARD_PUBLIC_SHELL_PATHS.has(pathname);
}

export function resolveDashboardInitialView(
  slug: string[] | undefined
): 'home' | 'chat' | 'form' | 'pratiche' {
  const first = String(slug?.[0] || '').toLowerCase();
  if (first === 'home') return 'home';
  if (first === 'chat') return 'chat';
  if (first === 'scanner' || first === 'scanner-bandi' || first === 'bandi') return 'form';
  return 'pratiche';
}
