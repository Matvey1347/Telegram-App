import { ConsumerFinanceProvider } from "@/providers/consumer-finance-provider";

export default function ConsumerFinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <ConsumerFinanceProvider>{children}</ConsumerFinanceProvider>
  );
}
