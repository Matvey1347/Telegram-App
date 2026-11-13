import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "@/providers/i18n-provider";
import ru from "@/i18n/locales/ru/ad-sales/common";
import { renderWithProviders } from "@/test/render-with-providers";
import { AdCampaignsTable } from "./campaigns-table";
import { AdsSectionTabs } from "./ads-section-tabs";

describe("advertising Russian copy", () => {
  it("renders actual translated navigation and table headings on first render", () => {
    renderWithProviders(<I18nProvider initialLocale="ru" preloadedCatalogs={{ "ad-sales/common": ru }}>
      <AdsSectionTabs value="campaigns" />
      <AdCampaignsTable campaigns={[]} moneySettings={{}} rates={[]} showHypotheses={false} />
    </I18nProvider>);
    expect(screen.getByText("Рекламные кампании")).toBeInTheDocument();
    for (const name of ["Кампания", "Результаты", "Действия"]) expect(screen.getByRole("columnheader", { name })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("ads.");
  });
});
