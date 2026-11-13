import { financeBrandIcon } from "@consumer-finance/web/lib/finance-brand-icon";

export function GroshlyLoadingScreen() {
  const icon = financeBrandIcon("light");
  return (
    <main className="groshly-page-loading" aria-busy="true" data-testid="groshly-loading">
      <div role="status" aria-live="polite">
        <span className="groshly-loading-brand"><img src={icon} alt="" />Groshly<span>.</span></span>
        <span>Завантаження…</span>
      </div>
    </main>
  );
}
