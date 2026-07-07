import { listClients } from '@/lib/clientsDb';
import { companyLinkKey } from '@/lib/review/companyKey';
import {
  buildPrimaryClientLinksByKey,
  listLinksByReviewKey,
  listReviewClientLinks,
} from '@/lib/review/clientLinkDb';

export type LinkedClient = {
  id: string;
  companyName: string;
  manager: string;
  status: string;
  href: string;
};

export type ClientLinkEntry = {
  linked: boolean;
  clients: LinkedClient[];
  primary: LinkedClient | null;
  manual: boolean;
};

function toLinkedClient(client: {
  id: string;
  companyName: string;
  manager: string;
  status: string;
}): LinkedClient {
  return {
    id: client.id,
    companyName: client.companyName,
    manager: client.manager,
    status: client.status,
    href: `/clients/${client.id}`,
  };
}

/** 검토표 초기 로드용 — 수임처 연결 맵 일괄 구축 */
export async function buildClientLinksIndex(): Promise<Record<string, ClientLinkEntry>> {
  const [manualLinks, pool] = await Promise.all([
    listReviewClientLinks(),
    listClients({ includeChurned: true }),
  ]);

  const clientById = new Map(pool.map(c => [c.id, c]));
  const index: Record<string, ClientLinkEntry> = {};

  const manualByKey = new Map<string, string[]>();
  for (const link of manualLinks) {
    const ids = manualByKey.get(link.reviewKey) ?? [];
    ids.push(link.clientId);
    manualByKey.set(link.reviewKey, ids);
  }

  for (const [key, clientIds] of manualByKey) {
    const clients = clientIds
      .map(id => clientById.get(id))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map(toLinkedClient);
    index[key] = {
      linked: clients.length > 0,
      clients,
      primary: clients[0] ?? null,
      manual: true,
    };
  }

  for (const client of pool) {
    const key = companyLinkKey(client.companyName);
    if (!key || index[key]) continue;
    const linked = toLinkedClient(client);
    index[key] = {
      linked: true,
      clients: [linked],
      primary: linked,
      manual: false,
    };
  }

  return index;
}

export async function findClientsByCompanyLinkKey(key: string) {
  const normalized = companyLinkKey(key);
  if (!normalized) return [];

  const manualLinks = await listLinksByReviewKey(normalized);
  if (manualLinks.length) {
    const pool = await listClients({ includeChurned: true });
    const clientById = new Map(pool.map(c => [c.id, c]));
    return manualLinks
      .map(link => clientById.get(link.clientId))
      .filter((c): c is NonNullable<typeof c> => !!c);
  }

  const pool = await listClients({ includeChurned: true });
  const exact = pool.find(c => companyLinkKey(c.companyName) === normalized);
  if (exact) return [exact];

  const partial = pool.find(c => {
    const ck = companyLinkKey(c.companyName);
    return ck.includes(normalized) || normalized.includes(ck);
  });
  return partial ? [partial] : [];
}

/** @deprecated 단일 반환 — 첫 번째만 */
export async function findClientByCompanyLinkKey(key: string) {
  const clients = await findClientsByCompanyLinkKey(key);
  return clients[0] ?? null;
}

export async function resolveClientLink(key: string) {
  const normalized = companyLinkKey(key);
  if (!normalized) {
    return { key: '', clients: [] as LinkedClient[], primary: null, manual: false };
  }

  const manualLinks = await listLinksByReviewKey(normalized);
  if (manualLinks.length) {
    const pool = await listClients({ includeChurned: true });
    const clientById = new Map(pool.map(c => [c.id, c]));
    const clients: LinkedClient[] = [];
    for (const link of manualLinks) {
      const client = clientById.get(link.clientId);
      if (client) clients.push(toLinkedClient(client));
    }
    return {
      key: normalized,
      clients,
      primary: clients[0] ?? null,
      manual: true,
    };
  }

  const matched = await findClientsByCompanyLinkKey(normalized);
  const clients = matched.map(toLinkedClient);
  return {
    key: normalized,
    clients,
    primary: clients[0] ?? null,
    manual: false,
  };
}

export { buildPrimaryClientLinksByKey };
