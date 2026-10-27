import { FinanceProductPreview } from "@finance-web/components/finance-product-preview";

export const metadata = { robots: { index: false, follow: false } };

export default async function PreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ screen: string }>;
  searchParams: Promise<{ lang?: string; theme?: string; botId?: string }>;
}) {
  const [{ screen }, { lang, theme, botId }] = await Promise.all([params, searchParams]);
  if (screen !== "home" && screen !== "analytics") return null;
  return <FinanceProductPreview screen={screen} lang={lang} theme={theme} botId={botId} />;
}
