import { LegacyCreativeLinkRedirect } from "@/components/features/workspace/creatives/legacy-creative-link-redirect";
import { DashboardPage } from "@/components/features/operations/dashboard/dashboard-page";

export default function Page() {
  return (
    <>
      <LegacyCreativeLinkRedirect />
      <DashboardPage />
    </>
  );
}
