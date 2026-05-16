import { APP_URL, MARKETING_URL } from '@/shared/lib';

/* Lite version — nav items for bndo.it + app.bndo.it */
export type DashboardNavKey =
  | 'home'
  | 'pratiche'
  | 'catalogo_bandi'
  | 'documenti'
  | 'messaggi'
  | 'profilo'
  | 'avvio_pratica'
  | 'new_practice'
  | 'chat_consulente'
  | 'chat_bubble'
  | 'chat_ai'
  | 'monitor';

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
    avvioPratica: '/dashboard/avviopratica',
    newPractice: '/dashboard/new-practice',
    practicesPrefix: '/dashboard/practices',
    list: '/dashboard/pratiche',
  },
  admin: {
    root: '/admin',
    clients: '/admin/clients',
    consultants: '/admin/consultants',
    assignments: '/admin/assignments',
    finance: '/admin/finance',
    chatLog: '/admin/chat-log',
    visits: '/admin/visits-traffic',
    notifications: '/admin/notifications',
    quizResponses: '/admin/quiz-responses',
    audit: '/admin/audit',
  },
  api: {
    authLogin: '/api/auth/login',
    logout: '/api/auth/logout',
  },
} as const;

const DASHBOARD_PUBLIC_SHELL_PATHS = new Set<string>([
  routes.dashboard.home,
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

/** Items for authenticated dashboard (app.bndo.it — sidebar blu) */
export function getAuthShellItems(): DashboardShellItem[] {
  return [
    { key: 'home', label: 'Home', href: routes.dashboard.list, icon: 'home' },
    { key: 'catalogo_bandi', label: 'Bandi Disponibili', href: routes.dashboard.catalogoBandi, icon: 'catalogo_bandi' },
    { key: 'messaggi', label: 'Chat con il tuo consulente umano', href: routes.dashboard.messages, icon: 'messaggi' },
    { key: 'chat_consulente', label: 'Chiedi all\'AI', href: routes.dashboard.chat, icon: 'chat_ai' },
    { key: 'avvio_pratica', label: 'Avvio pratica', href: routes.dashboard.avvioPratica, icon: 'avvio_pratica' },
    { key: 'profilo', label: 'Profilo', href: routes.dashboard.profile, icon: 'profilo' },
  ];
}

/** Items for guest/public dashboard (bndo.it — sidebar bianca) */
export function getGuestShellItems(): DashboardShellItem[] {
  return [
    { key: 'catalogo_bandi', label: 'Bandi Disponibili', href: routes.dashboard.catalogoBandi, icon: 'catalogo_bandi' },
    { key: 'messaggi', label: 'Messaggi', href: routes.dashboard.messages, icon: 'messaggi' },
    { key: 'profilo', label: 'Profilo', href: routes.dashboard.profile, icon: 'profilo' },
  ];
}

/** Keep for backward compat — same as auth for now */
export function getDashboardShellItems(): DashboardShellItem[] {
  return getAuthShellItems();
}

export function resolveDashboardNavKey(pathname: string): DashboardNavKey {
  const normalizedPathname = pathname.replace(/\/+$/, '') || '/';

  if (
    normalizedPathname === routes.dashboard.root ||
    normalizedPathname === routes.dashboard.list ||
    normalizedPathname.startsWith(routes.dashboard.practicesPrefix)
  ) {
    return 'home';
  }
  if (normalizedPathname === routes.dashboard.home) return 'home';
  if (normalizedPathname.startsWith(routes.dashboard.catalogoBandi)) return 'catalogo_bandi';
  if (normalizedPathname.startsWith(routes.dashboard.documents)) return 'documenti';
  if (
    normalizedPathname.startsWith(routes.dashboard.messages) ||
    normalizedPathname.startsWith(routes.dashboard.notifications)
  ) {
    return 'messaggi';
  }
  if (
    normalizedPathname.startsWith(routes.dashboard.profile) ||
    normalizedPathname.startsWith(routes.dashboard.password)
  ) {
    return 'profilo';
  }
  if (normalizedPathname.startsWith(routes.dashboard.avvioPratica)) return 'avvio_pratica';
  if (normalizedPathname.startsWith(routes.dashboard.newPractice)) return 'new_practice';
  if (normalizedPathname === routes.dashboard.chat) return 'chat_consulente';
  return 'messaggi';
}

export function resolveDashboardLoaderWord(pathname: string): string {
  const normalizedPathname = pathname.replace(/\/+$/, '') || '/';

  if (
    normalizedPathname === routes.dashboard.root ||
    normalizedPathname === routes.dashboard.list ||
    normalizedPathname.startsWith(routes.dashboard.practicesPrefix)
  ) {
    return 'pratiche';
  }

  if (
    normalizedPathname.startsWith(routes.dashboard.messages) ||
    normalizedPathname.startsWith(routes.dashboard.notifications)
  ) {
    return 'messaggi';
  }

  if (
    normalizedPathname.startsWith(routes.dashboard.profile) ||
    normalizedPathname.startsWith(routes.dashboard.password)
  ) {
    return 'profilo';
  }

  if (normalizedPathname.startsWith(routes.dashboard.documents)) return 'documenti';
  if (normalizedPathname.startsWith(routes.dashboard.catalogoBandi)) return 'catalogo bandi';
  if (normalizedPathname.startsWith(routes.dashboard.avvioPratica)) return 'avvio pratica';
  if (normalizedPathname.startsWith(routes.dashboard.newPractice)) return 'nuova pratica';
  if (normalizedPathname === routes.dashboard.chat) return 'chat';
  if (
    normalizedPathname === routes.dashboard.scanner ||
    normalizedPathname === routes.dashboard.scannerLegacy
  ) {
    return 'scanner';
  }

  return 'dashboard';
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
