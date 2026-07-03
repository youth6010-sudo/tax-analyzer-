import PortalPageShell from '@/app/components/portal/PortalPageShell';

export default function NoticeGeneratorLayout({ children }: { children: React.ReactNode }) {
  return <PortalPageShell narrow>{children}</PortalPageShell>;
}
