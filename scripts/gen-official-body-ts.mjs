import fs from 'node:fs';

const html = fs.readFileSync(
  'app/tools/notice-generator/_lib/defaultOfficialIncomeBody.html',
  'utf8',
);
const escaped = html.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
fs.writeFileSync(
  'app/tools/notice-generator/_lib/defaultOfficialIncomeBody.ts',
  `/** @generated from defaultOfficialIncomeBody.html */\nexport const DEFAULT_OFFICIAL_INCOME_BODY = \`${escaped}\`;\n`,
);
