/** 사업자번호 10자리 정규화 */
export function normBizNo(value) {
  return String(value ?? '').replace(/\D/g, '');
}

const PLACEHOLDER_NAMES = /^(테스트|test|관리|미입력|샘플|sample|tbd|없음|\-)$/i;

const BUSINESS_HINTS =
  /주식회사|\(주\)|㈜|유한회사|유한책임|법인|컴퍼니|company|협동|재단|학원|병원|의원|식당|카페|센터|스토어|shop|inc|corp|협회|공방|공사|건설|물류|무역|산업|테크|tech|studio|스튜디오/i;

/** 상호 정규화 (매칭용) */
export function normalizeCompanyKey(name) {
  return String(name ?? '')
    .trim()
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .toLowerCase();
}

/**
 * 담당·이름(대표자=상호)만 있고 업체 정보가 없는 행
 * — 사업자번호 없음 + 상호≈대표자 개인명 (TP export 기준)
 */
export function isManagerNameOnlyRow(row) {
  const companyName = String(row.companyName ?? '').trim();
  const representative = String(row.representative ?? '').trim();
  const businessNo = normBizNo(row.businessNo);
  const douzoneCode = String(row.code ?? row.intakeData?.douzoneCode ?? '').trim();

  if (!companyName) return false;
  if (businessNo.length >= 10) return false;
  // 세무사랑 코드 있으면 신고대리·개인명만 등록도 반영
  if (douzoneCode) return false;
  if (PLACEHOLDER_NAMES.test(companyName)) return true;

  // 대표자 없으면 상호만으로 개인명 판별하지 않음 (구글시트 수임처관리 등)
  if (!representative) return false;

  if (BUSINESS_HINTS.test(companyName)) return false;

  // 상호=대표자 2~4자 한글 이름 (신고대리·개인명만 등록)
  if (companyName === representative && /^[가-힣]{2,4}$/.test(companyName)) return true;

  return false;
}

export function filterImportableClients(clients, { label = '수임처' } = {}) {
  const importable = [];
  const skipped = [];

  for (const c of clients) {
    if (isManagerNameOnlyRow(c)) {
      skipped.push({
        reason: 'manager_name_only',
        companyName: c.companyName,
        representative: c.representative ?? '',
        manager: c.manager ?? '',
        businessNo: c.businessNo ?? '',
        status: c.status ?? '',
      });
    } else {
      importable.push(c);
    }
  }

  return { importable, skipped, label };
}

export function reportSkippedRows(skipped, { maxLog = 30 } = {}) {
  if (skipped.length === 0) return;
  console.log('');
  console.log(`⚠ 반영 제외 (${skipped.length}건) — 담당·이름만 있고 업체 정보 없음:`);
  for (const row of skipped.slice(0, maxLog)) {
    console.log(
      `  · [${row.manager || '-'}] 상호="${row.companyName}" 대표="${row.representative || '-'}"` +
        (row.status ? ` (${row.status})` : ''),
    );
  }
  if (skipped.length > maxLog) {
    console.log(`  … 외 ${skipped.length - maxLog}건`);
  }
}
