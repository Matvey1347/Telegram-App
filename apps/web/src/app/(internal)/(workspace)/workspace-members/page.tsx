'use client';

import { AppShell } from '@/components/layout/app-shell';
import { WorkspaceMembersSection } from '@/components/features/workspace/workspace-members-section';

export default function WorkspaceMembersPage() {
  return (
    <AppShell>
      <WorkspaceMembersSection />
    </AppShell>
  );
}
