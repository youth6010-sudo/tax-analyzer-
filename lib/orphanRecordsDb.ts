import { desc, isNull } from 'drizzle-orm';
import { getDb } from '@/db';
import { churnRecords, intakeInquiries, intakeProcesses } from '@/db/schema';

export async function listOrphanRecords() {
  const db = getDb();

  const [inquiries, processes, churns] = await Promise.all([
    db
      .select({
        id: intakeInquiries.id,
        companyName: intakeInquiries.companyName,
        consultant: intakeInquiries.consultant,
        businessNo: intakeInquiries.businessNo,
        inquiryDate: intakeInquiries.inquiryDate,
      })
      .from(intakeInquiries)
      .where(isNull(intakeInquiries.clientId))
      .orderBy(desc(intakeInquiries.createdAt)),
    db
      .select({
        id: intakeProcesses.id,
        companyName: intakeProcesses.companyName,
        monthlyFee: intakeProcesses.monthlyFee,
        channel: intakeProcesses.channel,
      })
      .from(intakeProcesses)
      .where(isNull(intakeProcesses.clientId))
      .orderBy(desc(intakeProcesses.updatedAt)),
    db
      .select({
        id: churnRecords.id,
        companyName: churnRecords.companyName,
        manager: churnRecords.manager,
        feeAmount: churnRecords.feeAmount,
        churnedAt: churnRecords.churnedAt,
      })
      .from(churnRecords)
      .where(isNull(churnRecords.clientId))
      .orderBy(desc(churnRecords.churnedAt)),
  ]);

  return { inquiries, processes, churns };
}
