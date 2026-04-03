import { APP_URL, MARKETING_URL } from '@/shared/lib';

export type DashboardNavKey =
  | 'home'
  | 'pratiche'
  | 'catalogo_bandi'
  | 'documenti'
  | 'messaggi'
  | 'profilo'
  | 'new_practice';

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
    catalogoBandi: '/dashboard/catalogo-bandi',
    documents: '/dashboard/documents',
    messages: '/dashboard/messages',
    notifications: '/dashboard/notifications',
    profile: '/dashboard/profile',
    password: '/dashboard/password',
    newPractice: '/dashboard/new-practice',
    practicesPrefix: '/dashboard/practices',
    list: '/dashboard/pratiche',
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
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase();
    if (host.endsWith('.netlify.app') || host === 'localhost' || host === '127.0.0.1') {
      return window.location.origin;
    }
  }

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
    { key: 'pratiche', label: 'Le tue pratiche', href: routes.dashboard.list, icon: 'pratiche' },
    { key: 'catalogo_bandi', label: 'Catalogo Bandi', href: routes.dashboard.catalogoBandi, icon: 'catalogo_bandi' },
    { key: 'messaggi', label: 'Messaggi', href: routes.dashboard.messages, icon: 'messaggi' },
    { key: 'profilo', label: 'Profilo', href: routes.dashboard.profile, icon: 'profilo' },
    { key: 'new_practice', label: 'Nuova pratica', href: routes.dashboard.newPractice, icon: 'new_practice' },
  ];
}

export function resolveDashboardNavKey(pathname: string): DashboardNavKey {
  if (
    pathname === routes.dashboard.root ||
    pathname === routes.dashboard.list ||
    pathname.startsWith(routes.dashboard.practicesPrefix)
  ) {
    return pathname === routes.dashboard.list ? 'pratiche' : 'messaggi';
  }
  if (pathname === routes.dashboard.home) return 'home';
  if (pathname.startsWith(routes.dashboard.catalogoBandi)) return 'catalogo_bandi';
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
  if (pathname.startsWith(routes.dashboard.newPractice)) return 'new_practice';
  return 'messaggi';
}

export function isPublicDashboardShellPath(pathname: string) {
  return DASHBOARD_PUBLIC_SHELL_PATHS.has(pathname);
}

export function resolveDashboardInitialView(
  slugs: string[] | undefined
): 'chat' | 'home' | 'form' | 'pratiche' | 'choice' | 'quiz' | 'myPractices' | 'practiceDetail' {
  if (!slugs || slugs.length === 0) {
    return 'myPractices';
  }
  const main = slugs[0];
  if (main === 'chat') return 'chat';
  if (main === 'scanner') return 'form';
  if (main === 'pratiche') return 'myPractices';
  if (main === 'bandi') return 'myPractices';
  if (main === 'quiz') return 'quiz';
  if (main === 'new-practice') {
    if (slugs[1] === 'quiz') return 'quiz';
    return 'choice';
  }
  if (main === 'practices' && slugs[1]) {
    return 'practiceDetail';
  }
  return 'myPractices';
}
