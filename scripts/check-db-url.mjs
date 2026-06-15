import fs from 'node:fs';
const file = process.argv[2] ?? '.env.vercel.production';
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
const l = lines.find(x => x.startsWith('DATABASE_URL='));
const v = l?.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '') ?? '';
console.log('file', file, 'length', v.length, 'ok', v.length > 20);
