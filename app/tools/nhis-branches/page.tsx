import InsuranceBranchesPageClient from './InsuranceBranchesPageClient';

export default async function InsuranceBranchesPage({
  searchParams,
}: {
  searchParams?: Promise<{ query?: string; org?: string; returnTo?: string; returnLabel?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const initialQuery = typeof params.query === 'string' ? params.query : '';
  const initialOrg = params.org === 'nps' || params.org === 'comwel' || params.org === 'nhis' ? params.org : 'nhis';
  const returnTo = typeof params.returnTo === 'string' ? params.returnTo : '';
  const returnLabel = typeof params.returnLabel === 'string' ? params.returnLabel : '';

  return (
    <InsuranceBranchesPageClient
      initialQuery={initialQuery}
      initialOrg={initialOrg}
      returnTo={returnTo}
      returnLabel={returnLabel}
    />
  );
}
