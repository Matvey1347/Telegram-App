export function GroshlyLoadingScreen() {
  const language =
    typeof window === "undefined"
      ? "uk"
      : window.localStorage.getItem("groshly-language") || "uk";
  const label =
    language === "en"
      ? "Loading…"
      : language === "ru"
        ? "Загрузка…"
        : "Завантаження…";

  return (
    <main className="app-shell" aria-busy="true" data-testid="groshly-loading">
      <div className="busy-cover">
        <div className="busy-card" role="status" aria-live="polite">
          <span className="loader-ring" aria-hidden="true" />
          <b>{label}</b>
        </div>
      </div>
    </main>
  );
}
