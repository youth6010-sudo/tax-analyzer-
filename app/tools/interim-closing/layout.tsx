import PortalPageShell from '@/app/components/portal/PortalPageShell';

export default function InterimClosingLayout({ children }: { children: React.ReactNode }) {
  return <PortalPageShell className="!max-w-none w-full">{children}</PortalPageShell>;
}
