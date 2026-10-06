/**
 * 해임통보 안내문 PDF — 직인 위치만 보정 (로컬 파일 시험용)
 * 운영 저장소 일괄 보정은 /api/arrears/bond/seal-fix (BOND_SEAL_FIX_TOKEN)
 *
 * npx tsx scripts/fix-notice-seal.ts --local <폴더>   결과: data/_seal-fix/ (원본은 그대로)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fixNoticeSeal, loadSealRgba } from '../lib/noticeSealFix';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const localIdx = process.argv.indexOf('--local');
const LOCAL_DIR = localIdx >= 0 ? process.argv[localIdx + 1] : '';
const OUT_DIR = path.join(root, 'data', '_seal-fix');

async function main() {
  if (!LOCAL_DIR) throw new Error('--local <폴더> 를 지정하세요.');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const seal = await loadSealRgba(fs.readFileSync(path.join(root, 'public', 'seal-youth-busan.png')));
  const lines: string[] = [];
  for (const f of fs.readdirSync(LOCAL_DIR).filter(n => /^세무보수_미수금_안내문_.*\.pdf$/.test(n))) {
    const pdf = fs.readFileSync(path.join(LOCAL_DIR, f));
    const size = pdf.length;
    const r = await fixNoticeSeal(pdf, seal);
    lines.push(`${r.status}\t${f}`);
    if (r.status !== 'fixed') continue;
    if (pdf.length !== size) throw new Error(`길이 변경됨: ${f}`);
    fs.writeFileSync(path.join(OUT_DIR, `${f}__before.png`), r.before);
    fs.writeFileSync(path.join(OUT_DIR, `${f}__after.png`), r.after);
    fs.writeFileSync(path.join(OUT_DIR, f), pdf);
  }
  fs.writeFileSync(path.join(OUT_DIR, '_result.txt'), lines.join('\n'), 'utf8');
  console.log(`done -> ${OUT_DIR}`);
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
