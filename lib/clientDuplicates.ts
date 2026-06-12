import { eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  churnRecords,
  clientMeetings,
  clients,
  intakeInquiries,
  intakeProcesses,
  reportDeliveries,
  settlementVisits,
} from '@/db/schema';
import type { ClientRecord } from '@/app/types/client';
import type {
  ClientRelatedCounts,
  DuplicateClientItem,
  DuplicateGroup,
} from '@/app/types/clientDuplicates';
import { REASON_LABEL, REASON_PRIORITY } from '@/app/types/clientDuplicates';
import { clientToRecord } from '@/lib/clientMapper';
import { getClientById, updateClient, type ClientPatch } from '@/lib/clientsDb';

export function normalizeCompanyName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, '')
    .replace(/\(주\)|주식회사|㈜|\(유\)|유한회사|유한책임회사/gi, '')
    .toLowerCase();
}

export function normalizeBusinessNo(no: string): string {
  return no.replace(/\D/g, '');
}

function namesAreSimilar(a: string, b: string): boolean {
  const na = normalizeCompanyName(a);
  const nb = normalizeCompanyName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length <= nb.length ? nb : na;
  return shorter.length >= 4 && longer.includes(shorter);
}

class UnionFind {
  private parent = new Map<string, string>();

  find(id: string): string {
    if (!this.parent.has(id)) this.parent.set(id, id);
    if (this.parent.get(id) !== id) {
      this.parent.set(id, this.find(this.parent.get(id)!));
    }
    return this.parent.get(id)!;
  }

  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }

  groups(): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const id of this.parent.keys()) {
      const root = this.find(id);
      if (!map.has(root)) map.set(root, []);
      map.get(root)!.push(id);
    }
    return map;
  }
}

async function getRelatedCountsMap(clientIds: string[]): Promise<Map<string, ClientRelatedCounts>> {
  const map = new Map<string, ClientRelatedCounts>();
  if (clientIds.length === 0) return map;

  const db = getDb();
  const empty = (): ClientRelatedCounts => ({
    inquiries: 0,
    processes: 0,
    churns: 0,
    meetings: 0,
    reports: 0,
    settlements: 0,
  });

  for (const id of clientIds) map.set(id, empty());

  const tables = [
    { table: intakeInquiries, key: 'inquiries' as const },
    { table: intakeProcesses, key: 'processes' as const },
    { table: churnRecords, key: 'churns' as const },
    { table: clientMeetings, key: 'meetings' as const },
    { table: reportDeliveries, key: 'reports' as const },
    { table: settlementVisits, key: 'settlements' as const },
  ];

  for (const { table, key } of tables) {
    const rows = await db
      .select({
        clientId: table.clientId,
        count: sql<number>`count(*)::int`,
      })
      .from(table)
      .where(inArray(table.clientId, clientIds))
      .groupBy(table.clientId);

    for (const row of rows) {
      if (!row.clientId) continue;
      const counts = map.get(row.clientId);
      if (counts) counts[key] = row.count;
    }
  }

  return map;
}

function dedupeGroups(groups: DuplicateGroup[]): DuplicateGroup[] {
  const byKey = new Map<string, DuplicateGroup>();
  for (const group of groups) {
    const key = group.clients.map(c => c.id).sort().join('|');
    const existing = byKey.get(key);
    if (!existing || REASON_PRIORITY[group.reason] > REASON_PRIORITY[existing.reason]) {
      byKey.set(key, { ...group, id: key });
    }
  }
  return Array.from(byKey.values()).sort((a, b) => {
    if (b.clients.length !== a.clients.length) return b.clients.length - a.clients.length;
    return a.clients[0]?.companyName.localeCompare(b.clients[0]?.companyName ?? '', 'ko');
  });
}

export async function findDuplicateClientGroups(search?: string): Promise<DuplicateGroup[]> {
  const db = getDb();
  const rows = await db.select().from(clients).orderBy(clients.companyName);
  let allClients = rows.map(clientToRecord);

  const q = search?.trim().toLowerCase();
  if (q) {
    allClients = allClients.filter(c => {
      const hay = [
        c.companyName,
        c.businessNo,
        c.manager,
        c.representative,
        normalizeCompanyName(c.companyName),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }

  const byId = new Map(allClients.map(c => [c.id, c]));
  const groups: DuplicateGroup[] = [];

  const nameBuckets = new Map<string, ClientRecord[]>();
  for (const client of allClients) {
    const key = normalizeCompanyName(client.companyName);
    if (!key || key.length < 2) continue;
    if (!nameBuckets.has(key)) nameBuckets.set(key, []);
    nameBuckets.get(key)!.push(client);
  }
  for (const [key, members] of nameBuckets) {
    if (members.length < 2) continue;
    groups.push({
      id: `same_name:${members.map(c => c.id).sort().join('|')}`,
      reason: 'same_name',
      label: `${REASON_LABEL.same_name} · ${members[0].companyName}`,
      clients: members.map(c => ({ ...c, relatedCounts: { inquiries: 0, processes: 0, churns: 0, meetings: 0, reports: 0, settlements: 0 } })),
    });
  }

  const bizBuckets = new Map<string, ClientRecord[]>();
  for (const client of allClients) {
    const key = normalizeBusinessNo(client.businessNo);
    if (key.length < 10) continue;
    if (!bizBuckets.has(key)) bizBuckets.set(key, []);
    bizBuckets.get(key)!.push(client);
  }
  for (const [key, members] of bizBuckets) {
    if (members.length < 2) continue;
    groups.push({
      id: `same_business_no:${members.map(c => c.id).sort().join('|')}`,
      reason: 'same_business_no',
      label: `${REASON_LABEL.same_business_no} · ${key}`,
      clients: members.map(c => ({ ...c, relatedCounts: { inquiries: 0, processes: 0, churns: 0, meetings: 0, reports: 0, settlements: 0 } })),
    });
  }

  const uf = new UnionFind();
  const prefixBuckets = new Map<string, ClientRecord[]>();
  for (const client of allClients) {
    const key = normalizeCompanyName(client.companyName).slice(0, 4);
    if (key.length < 2) continue;
    if (!prefixBuckets.has(key)) prefixBuckets.set(key, []);
    prefixBuckets.get(key)!.push(client);
  }
  for (const members of prefixBuckets.values()) {
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        if (namesAreSimilar(members[i].companyName, members[j].companyName)) {
          uf.union(members[i].id, members[j].id);
        }
      }
    }
  }
  for (const ids of uf.groups().values()) {
    if (ids.length < 2) continue;
    const members = ids.map(id => byId.get(id)).filter(Boolean) as ClientRecord[];
    const normalized = new Set(members.map(c => normalizeCompanyName(c.companyName)));
    if (normalized.size === 1) continue;
    groups.push({
      id: `similar_name:${ids.sort().join('|')}`,
      reason: 'similar_name',
      label: `${REASON_LABEL.similar_name} · ${members.map(c => c.companyName).join(' / ')}`,
      clients: members.map(c => ({ ...c, relatedCounts: { inquiries: 0, processes: 0, churns: 0, meetings: 0, reports: 0, settlements: 0 } })),
    });
  }

  const deduped = dedupeGroups(groups);
  const allIds = [...new Set(deduped.flatMap(g => g.clients.map(c => c.id)))];
  const countsMap = await getRelatedCountsMap(allIds);

  return deduped.map(group => ({
    ...group,
    clients: group.clients.map(c => ({
      ...c,
      relatedCounts: countsMap.get(c.id) ?? {
        inquiries: 0,
        processes: 0,
        churns: 0,
        meetings: 0,
        reports: 0,
        settlements: 0,
      },
    })),
  }));
}

async function reassignClientLinks(fromId: string, toId: string) {
  const db = getDb();
  await db.update(intakeInquiries).set({ clientId: toId }).where(eq(intakeInquiries.clientId, fromId));
  await db.update(intakeProcesses).set({ clientId: toId }).where(eq(intakeProcesses.clientId, fromId));
  await db.update(churnRecords).set({ clientId: toId }).where(eq(churnRecords.clientId, fromId));
  await db.update(clientMeetings).set({ clientId: toId }).where(eq(clientMeetings.clientId, fromId));
  await db.update(reportDeliveries).set({ clientId: toId }).where(eq(reportDeliveries.clientId, fromId));
  await db.update(settlementVisits).set({ clientId: toId }).where(eq(settlementVisits.clientId, fromId));
}

function pickNonEmpty<T>(values: T[], isEmpty: (v: T) => boolean): T | undefined {
  for (const v of values) {
    if (!isEmpty(v)) return v;
  }
  return undefined;
}

function mergeClientRecords(survivor: ClientRecord, others: ClientRecord[]): ClientPatch {
  const all = [survivor, ...others];
  const str = (v: string) => !v.trim();
  return {
    companyName: pickNonEmpty(all.map(c => c.companyName), str) ?? survivor.companyName,
    manager: pickNonEmpty(all.map(c => c.manager), str) ?? survivor.manager,
    representative: pickNonEmpty(all.map(c => c.representative), str) ?? survivor.representative,
    businessNo: pickNonEmpty(all.map(c => c.businessNo), str) ?? survivor.businessNo,
    corporateNo: pickNonEmpty(all.map(c => c.corporateNo), str) ?? survivor.corporateNo,
    residentNo: pickNonEmpty(all.map(c => c.residentNo), str) ?? survivor.residentNo,
    phone: pickNonEmpty(all.map(c => c.phone), str) ?? survivor.phone,
    mobilePhone: pickNonEmpty(all.map(c => c.mobilePhone), str) ?? survivor.mobilePhone,
    fax: pickNonEmpty(all.map(c => c.fax), str) ?? survivor.fax,
    taxTypes: [...new Set(all.flatMap(c => c.taxTypes))],
    serviceTypes: [...new Set(all.flatMap(c => c.serviceTypes))],
    businessEntityType: pickNonEmpty(all.map(c => c.businessEntityType), str) ?? survivor.businessEntityType,
    feeSummary: pickNonEmpty(all.map(c => c.feeSummary), v => v == null) ?? survivor.feeSummary,
    program: pickNonEmpty(all.map(c => c.program), str) ?? survivor.program,
    intakeData: Object.assign({}, ...all.map(c => c.intakeData ?? {})),
  };
}

export async function mergeClients(survivorId: string, duplicateIds: string[]) {
  const survivor = await getClientById(survivorId);
  if (!survivor) throw new Error('NOT_FOUND');

  const uniqueDupes = [...new Set(duplicateIds.filter(id => id !== survivorId))];
  const others: ClientRecord[] = [];
  for (const id of uniqueDupes) {
    const client = await getClientById(id);
    if (client) others.push(client);
  }
  if (others.length === 0) throw new Error('NO_DUPLICATES');

  const merged = mergeClientRecords(survivor, others);
  await updateClient(survivorId, merged);

  for (const dup of others) {
    await reassignClientLinks(dup.id, survivorId);
    const db = getDb();
    await db.delete(clients).where(eq(clients.id, dup.id));
  }

  return getClientById(survivorId);
}

export async function updateClientAsAdmin(id: string, patch: Partial<ClientPatch>) {
  const existing = await getClientById(id);
  if (!existing) throw new Error('NOT_FOUND');

  return updateClient(id, {
    companyName: patch.companyName ?? existing.companyName,
    manager: patch.manager ?? existing.manager,
    representative: patch.representative ?? existing.representative,
    businessNo: patch.businessNo ?? existing.businessNo,
    corporateNo: patch.corporateNo ?? existing.corporateNo,
    residentNo: patch.residentNo ?? existing.residentNo,
    phone: patch.phone ?? existing.phone,
    mobilePhone: patch.mobilePhone ?? existing.mobilePhone,
    fax: patch.fax ?? existing.fax,
    taxTypes: patch.taxTypes ?? existing.taxTypes,
    businessEntityType: patch.businessEntityType ?? existing.businessEntityType,
    serviceTypes: patch.serviceTypes ?? existing.serviceTypes,
    feeSummary: patch.feeSummary !== undefined ? patch.feeSummary : existing.feeSummary,
    program: patch.program ?? existing.program,
    intakeData: patch.intakeData ?? existing.intakeData,
  });
}

