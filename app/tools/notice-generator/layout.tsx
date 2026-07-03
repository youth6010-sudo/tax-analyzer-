import PortalPageShell from '@/app/components/portal/PortalPageShell';

export default function NoticeGeneratorLayout({ children }: { children: React.ReactNode }) {
  return <PortalPageShell className="!max-w-none w-full">{children}</PortalPageShell>;
}
