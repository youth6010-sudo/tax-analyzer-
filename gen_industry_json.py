import xlrd, json, sys, glob, os

sys.stdout.reconfigure(encoding='utf-8')

# 파일 찾기
files = glob.glob(r'C:\Users\ADMIN\Desktop\RIMI\**\*.xls', recursive=True)
xls_path = None
for f in files:
    basename = os.path.basename(f)
    if '\uc5c5\uc885\ucf54\ub4dc' in basename or 'xls' in basename.lower():
        if len(basename) > 5 and '2025' in basename:
            xls_path = f
            break

if not xls_path:
    # fallback: 직접 경로
    xls_path = files[4]  # 5번째 파일 (종합소득세 분석)

print('Using:', xls_path, file=sys.stderr)

wb = xlrd.open_workbook(xls_path, encoding_override='cp949')
ws = wb.sheet_by_index(0)
print(f'Rows: {ws.nrows}, Cols: {ws.ncols}', file=sys.stderr)

# 컬럼 확인 (1행)
for c in range(ws.ncols):
    val = ws.cell_value(0, c)
    print(f'  col[{c}]: {repr(val)}', file=sys.stderr)

# 데이터 파싱
# col[0]=귀속연도, col[1]=업종코드, col[2]=업태명, col[5]=세세분류
# col[7]=단순경비율(일반), col[8]=단순경비율(초과), col[9]=기준소득율
def to_rate(v):
    try:
        f = float(v)
        return f if f > 0 else None
    except:
        return None

result = {}
for r in range(1, ws.nrows):
    try:
        code_raw = ws.cell_value(r, 1)  # col[1] = 업종코드
        if not code_raw:
            continue
        code = str(int(float(code_raw))).zfill(6)
        name = str(ws.cell_value(r, 2)).strip()      # 업태명 (col 2)
        sub_class = str(ws.cell_value(r, 5)).strip()  # 세세분류 (col 5)

        simple_general = to_rate(ws.cell_value(r, 7))
        simple_excess  = to_rate(ws.cell_value(r, 8))
        standard       = to_rate(ws.cell_value(r, 9))

        result[code] = {
            'code': code,
            'name': name,
            'subClass': sub_class,
            'simpleRateGeneral': simple_general,
            'simpleRateExcess': simple_excess,
            'standardRate': standard,
        }
    except Exception as e:
        pass

# 이 스크립트가 있는 폴더(tax-analyzer) 기준 — 옮겨도 바탕화면에 폴더가 생기지 않음
_script_dir = os.path.dirname(os.path.abspath(__file__))
_out_dir = os.path.join(_script_dir, 'public')
os.makedirs(_out_dir, exist_ok=True)
out_path = os.path.join(_out_dir, 'industry_rates.json')
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

print(f'Saved {len(result)} entries to {out_path}', file=sys.stderr)

# 샘플 출력
sample_keys = list(result.keys())[:3]
for k in sample_keys:
    print(k, result[k])
