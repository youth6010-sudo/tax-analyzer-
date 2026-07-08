import Link from 'next/link';
import type { ClientRecord } from '@/app/types/client';
import { BUSINESS_ENTITY_LABEL, SERVICE_TYPE_LABEL } from '@/app/types/contact';
import { TAX_TYPES } from '@/app/config/taxTypes';

const TAX_LABEL: Record<string, string> = Object.fromEntries(
  TAX_TYPES.map(t => [t.id, t.label]),
);

export default function ClientCard({ client }: { client: ClientRecord }) {
  return (
    <Link
      href={`/clients/${client.id}`}
      prefetch={false}
      className="block rounded-xl border border-gray-100 bg-white p-4 hover:border-blue-300 hover:shadow-md transition-all"
    >
      <h3 className="font-bold text-gray-900 leading-snug">{client.companyName}</h3>
      <div className="flex flex-wrap gap-1 mt-2">
        {client.businessEntityType && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
            {BUSINESS_ENTITY_LABEL[client.businessEntityType]}
          </span>
        )}
        {client.serviceTypes.map(t => (
          <span key={t} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
            {SERVICE_TYPE_LABEL[t]}
          </span>
        ))}
        {client.taxTypes.map(t => (
          <span key={t} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
            {TAX_LABEL[t] ?? t}
          </span>
        ))}
      </div>
      {client.representative && (
        <p className="mt-2 text-xs text-gray-500">대표 {client.representative}</p>
      )}
    </Link>
  );
}
