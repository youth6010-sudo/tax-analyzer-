import { Suspense } from 'react';
import BatchInvoiceClient from './BatchInvoiceClient';

export default function ArrearsBatchInvoicePage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-slate-500">불러오는 중…</p>}>
      <BatchInvoiceClient />
    </Suspense>
  );
}
