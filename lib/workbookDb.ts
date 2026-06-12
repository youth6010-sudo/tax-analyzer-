import { desc, eq, or, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { churnRecords, intakeInquiries, intakeProcesses } from '@/db/schema';

export async function getClientRelatedCounts(clientId: string, companyName: string) {
  const db = getDb();
  const name = companyName.trim();

  const [[inq], [proc], [ch]] = await Promise.all([
    db.select().from(intakeInquiries)
      .where(or(eq(intakeInquiries.clientId, clientId), eq(intakeInquiries.companyName, name)))
      .limit(1),
    db.select().from(intakeProcesses)
      .where(or(eq(intakeProcesses.clientId, clientId), eq(intakeProcesses.companyName, name)))
      .limit(1),
    db.select().from(churnRecords)
      .where(or(eq(churnRecords.clientId, clientId), eq(churnRecords.companyName, name)))
      .limit(1),
  ]);

  return {
    hasInquiry: Boolean(inq),
    hasProcess: Boolean(proc),
    hasChurn: Boolean(ch),
    companyName: name,
  };
}

export async function listInquiries(limit = 200) {
  return getDb().select().from(intakeInquiries)
    .where(sql`(${intakeInquiries.extra}->>'draft') IS DISTINCT FROM 'true'`)
    .orderBy(desc(intakeInquiries.createdAt))
    .limit(limit);
}

export async function listIntakeProcesses(limit = 200) {
  return getDb().select().from(intakeProcesses).orderBy(desc(intakeProcesses.updatedAt)).limit(limit);
}
