import { getDb } from '@/db';
import {
  churnRecords,
  clientMeetings,
  clients,
  intakeInquiries,
  intakeProcesses,
  reportDeliveries,
  settlementVisits,
  users,
  workChecklists,
} from '@/db/schema';

type SafeUser = Omit<(typeof users.$inferSelect), 'pinHash'> & { pinHash: string };

export type DbBackup = {
  exportedAt: string;
  version: 1;
  tables: {
    users: SafeUser[];
    clients: (typeof clients.$inferSelect)[];
    churnRecords: (typeof churnRecords.$inferSelect)[];
    intakeInquiries: (typeof intakeInquiries.$inferSelect)[];
    intakeProcesses: (typeof intakeProcesses.$inferSelect)[];
    clientMeetings: (typeof clientMeetings.$inferSelect)[];
    reportDeliveries: (typeof reportDeliveries.$inferSelect)[];
    settlementVisits: (typeof settlementVisits.$inferSelect)[];
    workChecklists: (typeof workChecklists.$inferSelect)[];
  };
};

export async function exportDatabaseBackup(): Promise<DbBackup> {
  const db = getDb();
  const [
    userRows,
    clientRows,
    churnRows,
    inquiryRows,
    processRows,
    meetingRows,
    reportRows,
    settlementRows,
    checklistRows,
  ] = await Promise.all([
    db.select().from(users),
    db.select().from(clients),
    db.select().from(churnRecords),
    db.select().from(intakeInquiries),
    db.select().from(intakeProcesses),
    db.select().from(clientMeetings),
    db.select().from(reportDeliveries),
    db.select().from(settlementVisits),
    db.select().from(workChecklists),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    version: 1,
    tables: {
      users: userRows.map(u => ({ ...u, pinHash: '[REDACTED]' })),
      clients: clientRows,
      churnRecords: churnRows,
      intakeInquiries: inquiryRows,
      intakeProcesses: processRows,
      clientMeetings: meetingRows,
      reportDeliveries: reportRows,
      settlementVisits: settlementRows,
      workChecklists: checklistRows,
    },
  };
}
