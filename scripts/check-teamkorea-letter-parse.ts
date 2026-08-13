import path from "path";
import { parseArrearsLetterWorkbookFile } from "../lib/arrearsLetterParse";

const f = path.join(
  "z:",
  "10_미수관리",
  "미수금 공문 - 26년",
  "미수수수료_다야-26.07.27.xls",
);
const sheets = parseArrearsLetterWorkbookFile(f);
const tk = sheets.find((s) => s.companyName.includes("팀코리아"));
console.log("sheet", tk?.companyName, "lines", tk?.lines.length);
const carry = tk?.lines.find((l) => l.description.includes("이월"));
console.log("carry", carry);
const open = tk?.lines.reduce((s, l) => s + l.amount - l.paidAmount, 0);
console.log("letter open", open);
