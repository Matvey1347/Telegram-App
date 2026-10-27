export function GroshlyLoadingScreen() {
  const icon = process.env.NODE_ENV === "development" ? "/brand/groshly-dev-icon.png" : "/brand/groshly-icon.png";
  return (
    <main className="groshly-page-loading" aria-busy="true" data-testid="groshly-loading">
      <div role="status" aria-live="polite">
        <span className="groshly-loading-brand"><img src={icon} alt="" />Groshly<span>.</span></span>
        <span>Завантаження…</span>
      </div>
    </main>
  );
}
