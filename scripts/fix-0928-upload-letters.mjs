import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { eq } from 'drizzle-orm';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['.env.local', '.env']) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}
const { getDb } = await import('../db/index.ts');
const { arrearsEntries } = await import('../db/schema.ts');
const { listLetterLines, replaceLetterLines } = await import('../lib/arrearsLetterDb.ts');

const apply = process.argv.includes('--apply');
const target = {
  '00149': [],
  '00223': [],
  '01804': [],
  '01963': [],
  '02185': [
    { description: '2026년 8월', amount: 110000, paidAmount: 0, paidDate: '', source: 'letter' },
    { description: '박빛나', amount: 0, paidAmount: 220000, paidDate: '9월 21일', source: 'payment' },
  ],
  '01984': [
    { description: '2026년 8월', amount: 55000, paidAmount: 0, paidDate: '', source: 'letter' },
    { description: '', amount: 0, paidAmount: 110000, paidDate: '9월 21일', source: 'payment' },
  ],
};

const db = getDb();
const backup = {};
for (const [code, lines] of Object.entries(target)) {
  const [e] = await db.select().from(arrearsEntries).where(eq(arrearsEntries.externalCode, code)).limit(1);
  const before = await listLetterLines(e.id);
  backup[code] = before;
  const open = lines.reduce((s, l) => s + l.amount - l.paidAmount, 0);
  console.log(code, e.balance, 'before', before.length, 'lines -> after', lines.length, 'lines open', open, open === e.balance ? 'OK' : 'MISMATCH');
  if (apply) await replaceLetterLines(e.id, 'fix-0928-upload', lines, { syncBalance: false });
}
if (apply) {
  fs.mkdirSync(path.join(root, 'backups'), { recursive: true });
  fs.writeFileSync(path.join(root, 'backups', `letters-before-fix-0928-${Date.now()}.json`), JSON.stringify(backup, null, 2));
}
process.exit(0);
