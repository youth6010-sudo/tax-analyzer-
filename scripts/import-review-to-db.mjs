#!/usr/bin/env node
/**
 * review-grid.json → Supabase(review_grid_sheets) 업로드
 * 사용: npm run import:review && npm run db:import-review-sheets
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['.env.local', '.env']) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const jsonPath = path.join(root, 'public', 'data', 'review-grid.json');
if (!fs.existsSync(jsonPath)) {
  console.error('review-grid.json 없음. 먼저 npm run import:review 실행');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const sheets = Array.isArray(raw.sheets) ? raw.sheets : [];
if (!sheets.length) {
  console.error('시트가 비어 있습니다.');
  process.exit(1);
}

const importedAt = raw.importedAt ? new Date(raw.importedAt) : new Date();
const version = raw.version ?? null;
const source = raw.source ?? null;
const when = Number.isNaN(importedAt.getTime()) ? new Date() : importedAt;

const sql = postgres(url, { max: 1, prepare: false });

try {
  await sql`
    CREATE TABLE IF NOT EXISTS review_grid_sheets (
      sheet_name text PRIMARY KEY,
      sheet_data jsonb NOT NULL,
      version text,
      source text,
      imported_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  await sql`DELETE FROM review_grid_sheets`;

  for (const sheet of sheets) {
    const name = sheet?.name;
    if (!name) continue;
    await sql`
      INSERT INTO review_grid_sheets (sheet_name, sheet_data, version, source, imported_at)
      VALUES (${name}, ${sql.json(sheet)}, ${version}, ${source}, ${when})
    `;
  }

  console.log(`Supabase review_grid_sheets 업로드 완료: ${sheets.length}개 시트`);
} finally {
  await sql.end();
}

console.log('업체 인덱스 재빌드 중…');
const rebuild = spawnSync('npm', ['run', 'rebuild:company-index'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
});
if (rebuild.status !== 0) {
  console.error('rebuild:company-index 실패');
  process.exit(rebuild.status ?? 1);
}
