'use client';

import { useState } from 'react';
import type { ClientRecord } from '@/app/types/client';
import ExternalRefsPanel from './ExternalRefsPanel';

export default function ClientDetailExtras({
  client,
}: {
  client: ClientRecord;
}) {
  const [intakeData, setIntakeData] = useState(client.intakeData);

  return (
    <ExternalRefsPanel
      clientId={client.id}
      intakeData={intakeData}
      onUpdated={setIntakeData}
    />
  );
}
