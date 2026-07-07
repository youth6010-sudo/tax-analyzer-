import fs from 'node:fs';

const src = 'z:/02_직원별 업무관리/박혜림/업무참고/2025_종합소득세_신고안내문.html';
const out =
  'app/tools/notice-generator/_lib/defaultOfficialIncomeBody.html';

const html = fs.readFileSync(src, 'utf8');
const m = html.match(/<div class="a4-page"[^>]*>([\s\S]*?)<\/div>\s*<script>/);
if (!m) {
  console.error('no match');
  process.exit(1);
}
let body = m[1];
body = body.replace(/data:image\/png;base64,[^"]+/g, '/logo.png');
body = body.replace(/youth3@taxbiz\.kr/g, '{담당자메일}');
body = body.replace(/youth3_tax/g, '{담당자카카오}');
body = body.replace(/2025년 귀속 종합소득세/g, '{귀속연도}년 귀속 종합소득세');
body = body.replace(/2025년/g, '{귀속연도}년');
body = body.replace(/05월 08일/g, '{자료제출마감일}');
console.log('len', body.length);
fs.writeFileSync(out, body);
