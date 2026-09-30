import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['.env.local', '.env']) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}
const { clearSettledLetters } = await import('../lib/arrearsImportApply.ts');

const apply = process.argv.includes('--apply');
const cleared = await clearSettledLetters('clear-settled-letters', !apply);
const out = cleared.map(c => `${c.externalCode} ${c.companyName} (${c.lines.length}줄)`);
fs.writeFileSync(path.join(root, 'data', '_clear-settled.txt'), [`${apply ? 'APPLIED' : 'DRY'} ${cleared.length}`, ...out].join('\n'), 'utf8');
if (apply) {
  fs.mkdirSync(path.join(root, 'backups'), { recursive: true });
  fs.writeFileSync(path.join(root, 'backups', `letters-before-clear-settled-${Date.now()}.json`), JSON.stringify(cleared, null, 2));
}
process.exit(0);
