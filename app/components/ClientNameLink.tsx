import Link from 'next/link';

export default function ClientNameLink({
  clientId,
  companyName,
  highlight,
}: {
  clientId?: string | null;
  companyName: string;
  highlight?: string;
}) {
  const active = highlight && companyName.includes(highlight);
  const inner = (
    <span className={active ? 'font-black text-blue-700' : 'font-bold text-gray-900'}>
      {companyName}
    </span>
  );
  if (!clientId) return inner;
  return (
    <Link href={`/clients/${clientId}`} className="hover:underline">
      {inner}
    </Link>
  );
}
