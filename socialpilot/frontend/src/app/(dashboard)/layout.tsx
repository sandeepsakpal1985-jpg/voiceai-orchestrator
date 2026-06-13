export const dynamic = 'force-dynamic';

import DashboardShell from './DashboardShell';
import { DemoProvider, DemoBadge } from '@/lib/demo-context';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DemoProvider>
      <DashboardShell>{children}</DashboardShell>
      <DemoBadge />
    </DemoProvider>
  );
}
