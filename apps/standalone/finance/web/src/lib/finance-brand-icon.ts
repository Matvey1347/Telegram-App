import { financeBrandIcon as productBrandIcon } from "@consumer-finance/web/lib/finance-brand-icon";
import { publicFinanceWebEnvironment } from "@finance-web/config/public-env";

export function financeBrandIcon(theme: "light" | "dark") {
  return productBrandIcon(theme, publicFinanceWebEnvironment.isDevelopment);
}
