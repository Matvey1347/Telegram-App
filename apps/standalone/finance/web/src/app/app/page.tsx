import { financeBrandIcon } from "@consumer-finance/web/lib/finance-brand-icon";
import { FinanceRootApp } from "@finance-web/components/finance-root-app";

export const metadata = {
  title: "Groshly — особисті фінанси",
  icons: {
    icon: `${financeBrandIcon("light")}?theme=light&v=2`,
  },
};

export default function FinanceApplicationPage() {
  return <FinanceRootApp />;
}
