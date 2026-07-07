import fs from 'node:fs';

const html = fs.readFileSync(
  'app/tools/notice-generator/_lib/defaultOfficialVatBody.html',
  'utf8',
);
const escaped = html.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
fs.writeFileSync(
  'app/tools/notice-generator/_lib/defaultOfficialVatBody.ts',
  `/** @generated from defaultOfficialVatBody.html */\nexport const DEFAULT_OFFICIAL_VAT_BODY = \`${escaped}\`;\n`,
);
