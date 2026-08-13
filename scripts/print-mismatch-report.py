import json
from collections import defaultdict
from pathlib import Path

d = json.loads(Path("scripts/.mismatch-classify.json").read_text(encoding="utf-8"))
samples = json.loads(Path("scripts/.mismatch-samples.json").read_text(encoding="utf-8"))

g = defaultdict(list)
for i in d["items"]:
    g[i["category"]].append(i)

lines = []
lines.append(f"letterOnly={d['letterOnly']} mismatch={d['mismatchCount']}")
lines.append(json.dumps(d["byCategory"], ensure_ascii=False))
for k in sorted(g.keys()):
    lines.append(f"\n== {k} ({len(g[k])}) ==")
    for i in g[k]:
        lines.append(
            f"  {i['code']} {i['name']} 원장={i['ledger']} 내역={i['open']} 차={i['diff']} "
            f"pdfNet={i['pdfNet']} letterOpen={i['letterOpen']} src={i['sources']}"
        )

# key sample pdf txs
for code in ["00206", "00212", "00611", "01206", "00213", "00170"]:
    s = samples.get(code)
    if not s or s.get("missing"):
        continue
    lines.append(f"\n## SAMPLE {code} {s['name']} bal={s['balance']} open={s['open']}")
    for t in s.get("pdfTxs") or []:
        lines.append(f"  PDF {t['kind']} {t['eventDate']} {t['description']} {t['amount']}")

Path("scripts/.mismatch-report.txt").write_text("\n".join(lines), encoding="utf-8")
print("wrote scripts/.mismatch-report.txt", len(lines))
