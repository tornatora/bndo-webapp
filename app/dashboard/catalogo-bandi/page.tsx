import { BandiCatalogView } from '@/components/views/BandiCatalogView';

export default function DashboardCatalogoBandiPage() {
  return (
    <section className="welcome-section">
      <BandiCatalogView
        title="Catalogo Bandi"
        subtitle="Bandi italiani attivi (no-UE), ordinati e pronti alla verifica requisiti."
      />
    </section>
  );
}
