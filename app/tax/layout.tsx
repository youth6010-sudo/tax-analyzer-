import PortalPageShell from '../components/portal/PortalPageShell';

export default function TaxLayout({ children }: { children: React.ReactNode }) {
  return <PortalPageShell bare>{children}</PortalPageShell>;
}
