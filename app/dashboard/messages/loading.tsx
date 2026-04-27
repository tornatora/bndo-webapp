import { AtomicPageLoader } from '@/components/dashboard/AtomicPageLoader';

export default function DashboardMessagesLoading() {
  return <AtomicPageLoader title="Sto caricando" targetWord="messaggi" strictTargetWord />;
}
