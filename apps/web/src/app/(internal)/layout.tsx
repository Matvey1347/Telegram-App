import { AppProvider } from "@/providers/app-provider";

export default function InternalLayout({ children }: { children: React.ReactNode }) {
  return <AppProvider>{children}</AppProvider>;
}
