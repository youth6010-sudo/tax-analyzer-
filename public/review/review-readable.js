(function () {
  "use strict";

  const LIST_COL_STORAGE_KEY = "reviewIncomeListCols";
  const CONSULT_LIST_COL_STORAGE_KEY = "reviewConsultListCols";
  const CORP_LIST_COL_STORAGE_KEY = "reviewCorpListCols";
  const FEE_LIST_COL_STORAGE_KEY = "reviewFeeListCols";
  const FEE_STAFF_FILTER_KEY = "reviewFeeStaffFilters";
  const DETAIL_EMPHASIS_STORAGE_KEY = "reviewDetailEmphasis";
  const FEE_STAFF_ORDER = ["블루", "다야", "윈터", "리아", "페리", "인디"];
  /** 조정료 시트: 담당 구간 안에서 업체 행 사이 공백이 이만큼 이상이면 다음 담당자 블록 */
  const FEE_SEGMENT_GAP = 10;

  /** 엑셀에서 셀 단위로 칠한 강조 노란색 (#FFFF00). 섹션/구분색(#FFC000 등)은 제외 */
  const EXCEL_EMPHASIS_BGS = new Set(["#FFFF00"]);

  function isExcelEmphasisBg(hex) {
    if (!hex || typeof hex !== "string") return false;
    return EXCEL_EMPHASIS_BGS.has(hex.toUpperCase());
  }

  function cellBgSoft(cell) {
    return cell && cell.bg ? ReviewGridCore.softenBg(cell.bg) : null;
  }

  function detailEmphasisStorageKey(kind) {
    return DETAIL_EMPHASIS_STORAGE_KEY + ":" + (kind || "income");
  }

  function fieldIdForDetail(field, kind) {
    kind = kind || "income";
    if (kind === "corp") {
      if (field.patch) {
        if (field.patch.source === "corp" && field.patch.corpMinC != null) {
          return cellKey("corp", field.patch.c - field.patch.corpMinC + 1);
        }
        if (field.patch.source === "corp" && field.patch.relC != null) {
          return cellKey("corp", field.patch.relC);
        }
        return cellKey(field.patch.source, field.patch.c);
      }
      if (field.source) return cellKey(field.source, field.c);
      return String(field.c);
    }
    return String(field.c);
  }

  function getDetailEmphasisCatalog(kind) {
    kind = kind || "income";
    if (kind === "corp") {
      const catalog = [];
      CORP_MERGED_FIELD_GROUPS.forEach(function (group) {
        group.fields.forEach(function (def) {
          const id = cellKey(def.source, def.c);
          catalog.push({ id: id, label: def.label, group: group.title });
        });
      });
      return catalog;
    }
    return INCOME_TOGGLEABLE_COLS.map(function (col) {
      return { id: String(col.c), label: col.label };
    });
  }

  function getDetailEmphasisFields(kind) {
    kind = kind || "income";
    try {
      const raw = sessionStorage.getItem(detailEmphasisStorageKey(kind));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      /* ignore */
    }
    return [];
  }

  function setDetailEmphasisFields(ids, kind) {
    sessionStorage.setItem(detailEmphasisStorageKey(kind || "income"), JSON.stringify(ids));
  }

  function toggleDetailEmphasisField(field, kind) {
    kind = kind || "income";
    if (isExcelEmphasisBg(field.bg)) {
      return true;
    }
    const id = fieldIdForDetail(field, kind);
    const manual = getDetailEmphasisFields(kind).slice();
    const idx = manual.indexOf(id);
    if (idx >= 0) {
      manual.splice(idx, 1);
    } else {
      manual.push(id);
    }
    setDetailEmphasisFields(manual, kind);
    return manual.indexOf(id) >= 0;
  }

  function isDetailEmphasized(field, kind, context) {
    if (isExcelEmphasisBg(field.bg)) return true;
    const id = fieldIdForDetail(field, kind);
    const manual = getDetailEmphasisFields(kind);
    return manual.indexOf(id) >= 0;
  }

  function scanSheetRowEmphasis(sheet, rowNum, headerRow, visibleColIds, kind) {
    if (!sheet || !rowNum) return { offListLabels: [] };
    const visible = visibleColIds || new Set();
    const offListLabels = [];
    const maxC = effectiveMaxCol(sheet, rowNum);
    for (let c = sheet.minC; c <= maxC; c++) {
      const dataCell = cellAt(sheet, rowNum, c);
      if (!dataCell || !isExcelEmphasisBg(dataCell.bg)) continue;
      const colId = kind === "corp" ? cellKey("corp", c - sheet.minC + 1) : c;
      const inList = kind === "income" ? visible.has(c) : visible.has(colId) || visible.has(String(c));
      if (!inList) {
        const headerCell = cellAt(sheet, headerRow, c);
        const label =
          headerCell && hasValue(headerCell.v)
            ? String(headerCell.v)
            : ReviewGridCore.colLetter(c);
        if (offListLabels.indexOf(label) < 0) offListLabels.push(label);
      }
    }
    return { offListLabels: offListLabels };
  }

  function attachIncomeRowEmphasis(item, sheet, r, visibleCols) {
    const visible = new Set((visibleCols || getVisibleListCols("income")).map(listColId));
    const scan = scanSheetRowEmphasis(sheet, r, 1, visible, "income");
    item.emphasisOffList = scan.offListLabels;
  }

  function attachCorpRowEmphasis(item, corpSheet, corpR, feeSheet, feeR) {
    const visible = new Set(getVisibleListCols("corp").map(listColId));
    const labels = [];
    if (corpSheet && corpR) {
      scanSheetRowEmphasis(corpSheet, corpR, 2, visible, "corp").offListLabels.forEach(function (l) {
        if (labels.indexOf(l) < 0) labels.push(l);
      });
    }
    if (feeSheet && feeR) {
      for (let c = 3; c <= 21; c++) {
        const dataCell = cellAt(feeSheet, feeR, c);
        if (!dataCell || !isExcelEmphasisBg(dataCell.bg)) continue;
        const id = cellKey("fee", c);
        if (visible.has(id)) continue;
        const headerCell = cellAt(feeSheet, 1, c);
        const label =
          headerCell && hasValue(headerCell.v) ? String(headerCell.v) : ReviewGridCore.colLetter(c);
        if (labels.indexOf(label) < 0) labels.push(label);
      }
    }
    item.emphasisOffList = labels;
  }


  const TRANSFER_KEYWORDS = ["폐업", "이관", "해지", "퇴사", "종료", "폐쇄", "말소", "중단"];

  const INCOME_TOGGLEABLE_COLS = [
    { c: 3, label: "성명", defaultVisible: true, sticky: true },
    { c: 4, label: "상호", defaultVisible: true, sticky: true, companyLink: true },
    { c: 5, label: "미팅일정 및 연락처", defaultVisible: true },
    { c: 6, label: "고용" },
    { c: 7, label: "감면" },
    { c: 8, label: "유형" },
    { c: 9, label: "내년 유형" },
    { c: 10, label: "사업용계좌" },
    { c: 11, label: "타소득" },
    { c: 12, label: "수입금액", num: true },
    { c: 13, label: "소득세", num: true },
    { c: 14, label: "수수료", defaultVisible: true, highlight: true, num: true },
    { c: 15, label: "입금" },
    { c: 16, label: "CMS" },
    { c: 17, label: "T/C" },
    { c: 18, label: "미수", defaultVisible: true, highlight: true, num: true },
    { c: 19, label: "미수입금", num: true },
    { c: 20, label: "미수CMS" },
    { c: 21, label: "비고", wrap: true },
    { c: 22, label: "사업유형" },
    { c: 23, label: "사업타소득" },
    { c: 24, label: "사업수입", num: true },
    { c: 25, label: "사업소득세", num: true },
    { c: 26, label: "사업수수료", highlight: true, num: true },
    { c: 27, label: "사업T/C" },
    { c: 28, label: "사업비고", wrap: true },
  ];

  const CLIENT_LIST_COLS = INCOME_TOGGLEABLE_COLS.filter(function (col) {
    return col.defaultVisible;
  });

  const LIST_DETAIL_EXCLUDE_COLS = [2, 3, 4, 5, 14, 18];

  const CONSULT_TOGGLEABLE_COLS = [
    { c: 2, label: "No" },
    { c: 3, label: "성함", defaultVisible: true, sticky: true },
    { c: 4, label: "상호", defaultVisible: true, sticky: true, companyLink: true },
    { c: 5, label: "전화번호", defaultVisible: true },
    { c: 6, label: "주민번호" },
    { c: 7, label: "담당", defaultVisible: true },
    { c: 8, label: "연락", defaultVisible: true },
    { c: 9, label: "수임등록", defaultVisible: true },
    { c: 10, label: "수수료입금" },
    { c: 11, label: "입금통장" },
    { c: 12, label: "입금확인" },
    { c: 13, label: "한화종신H" },
    { c: 14, label: "자료수령" },
    { c: 15, label: "완료" },
    { c: 16, label: "비고", defaultVisible: true, wrap: true },
    { c: 17, label: "채널아이디" },
    { c: 18, label: "감면" },
    { c: 19, label: "유형" },
    { c: 20, label: "소득종류" },
    { c: 21, label: "사업용계좌/현금영수증" },
    { c: 22, label: "타소득" },
    { c: 23, label: "수입금액", num: true },
    { c: 24, label: "소득세", num: true },
    { c: 25, label: "수수료", num: true },
    { c: 26, label: "T/C" },
    { c: 27, label: "상담메모" },
    { c: 28, label: "상담유형" },
  ];

  const CORP_TOGGLEABLE_COLS = [
    { key: "corp:1", label: "업체명", defaultVisible: true, sticky: true, companyLink: true },
    { key: "corp:2", label: "시산표", defaultVisible: true },
    { key: "fee:3", label: "신고기한", defaultVisible: true },
    { key: "fee:4", label: "수수료", defaultVisible: true, highlight: true, num: true },
    { key: "fee:5", label: "매출액", defaultVisible: true, num: true },
    { key: "fee:6", label: "조정료", defaultVisible: true, highlight: true, num: true },
    { key: "fee:7", label: "수수료(2)", num: true },
    { key: "fee:9", label: "매출액(2)", num: true },
    { key: "fee:10", label: "조정료(2)", num: true },
    { key: "corp:4", label: "방문/전화", defaultVisible: true },
    { key: "corp:3", label: "보고서" },
    { key: "fee:13", label: "보고서(체크)" },
    { key: "corp:5", label: "참고", wrap: true },
    { key: "corp:6", label: "수수료(법인)" },
    { key: "corp:7", label: "향후일정" },
    { key: "fee:11", label: "기장", wrap: true },
    { key: "fee:12", label: "cms" },
    { key: "fee:14", label: "고용증대" },
    { key: "fee:15", label: "배당" },
    { key: "fee:16", label: "상법임원" },
    { key: "fee:17", label: "경리나라" },
    { key: "fee:19", label: "보험" },
    { key: "fee:21", label: "컨설팅", wrap: true },
  ];

  const CORP_MERGED_FIELD_GROUPS = [
    {
      title: "진행 현황",
      fields: [
        { source: "corp", c: 2, label: "시산표" },
        { source: "corp", c: 3, label: "보고서" },
        { source: "corp", c: 4, label: "방문/전화" },
        { source: "corp", c: 5, label: "참고사항", wrap: true },
        { source: "corp", c: 6, label: "수수료" },
        { source: "corp", c: 7, label: "향후일정" },
      ],
    },
    {
      title: "조정료 · 매출",
      fields: [
        { source: "fee", c: 3, label: "신고기한" },
        { source: "fee", c: 4, label: "수수료", num: true },
        { source: "fee", c: 5, label: "매출액", num: true },
        { source: "fee", c: 6, label: "조정료 등", num: true },
        { source: "fee", c: 7, label: "수수료(2)", num: true },
        { source: "fee", c: 8, label: "희망수수료", num: true },
        { source: "fee", c: 9, label: "매출액(2)", num: true },
        { source: "fee", c: 10, label: "조정료 등(2)", num: true },
      ],
    },
    {
      title: "체크 · 컨설팅",
      fields: [
        { source: "fee", c: 11, label: "기장", wrap: true },
        { source: "fee", c: 12, label: "cms" },
        { source: "fee", c: 13, label: "보고서" },
        { source: "fee", c: 14, label: "고용증대검토" },
        { source: "fee", c: 15, label: "배당" },
        { source: "fee", c: 16, label: "상법임원출구" },
        { source: "fee", c: 17, label: "경리나라" },
        { source: "fee", c: 18, label: "손익분기점" },
        { source: "fee", c: 19, label: "보험" },
        { source: "fee", c: 20, label: "보험가입상태", wrap: true },
        { source: "fee", c: 21, label: "컨설팅", wrap: true },
      ],
    },
  ];

  const FEE_TOGGLEABLE_COLS = [
    { c: 2, label: "업체명", defaultVisible: true, sticky: true, companyLink: true },
    { c: 3, label: "신고기한", defaultVisible: true },
    { c: 4, label: "수수료", defaultVisible: true, highlight: true, num: true },
    { c: 5, label: "매출액", defaultVisible: true, num: true },
    { c: 6, label: "조정료 등", defaultVisible: true, num: true },
    { c: 7, label: "수수료(2)", num: true },
    { c: 8, label: "희망수수료", num: true },
    { c: 9, label: "매출액(2)", num: true },
    { c: 10, label: "조정료 등(2)", num: true },
    { c: 11, label: "기장", wrap: true },
    { c: 12, label: "cms" },
    { c: 13, label: "보고서" },
    { c: 14, label: "고용증대검토" },
    { c: 15, label: "배당" },
    { c: 16, label: "상법임원출구" },
    { c: 17, label: "경리나라" },
    { c: 18, label: "손익분기점" },
    { c: 19, label: "보험" },
    { c: 20, label: "보험가입상태" },
    { c: 21, label: "컨설팅", wrap: true },
  ];

  function getColCatalog(kind) {
    if (kind === "corp-fee") return CORP_FEE_LIST_COLS;
    if (kind === "corp-sheet") return CORP_SHEET_LIST_COLS;
    if (kind === "corp") return CORP_FEE_LIST_COLS;
    if (kind === "fee") return FEE_TOGGLEABLE_COLS;
    if (kind === "income-consult") return CONSULT_TOGGLEABLE_COLS;
    return INCOME_TOGGLEABLE_COLS;
  }

  function incomeListKind(listMode) {
    return listMode === "consult" ? "income-consult" : "income";
  }

  function corpListKind(corpListMode) {
    if (!corpListMode || corpListMode === "corp-fee") return "corp-fee";
    if (corpListMode === "corp-sheet" || String(corpListMode).indexOf("corp-tax:") === 0) {
      return "corp-sheet";
    }
    return "corp-fee";
  }

  function parseCorpListMode(corpListMode) {
    if (!corpListMode || corpListMode === "corp-fee") return { type: "fee" };
    if (corpListMode === "corp-sheet") return { type: "tax", versionId: "26.3" };
    if (String(corpListMode).indexOf("corp-tax:") === 0) {
      return { type: "tax", versionId: corpListMode.slice("corp-tax:".length) };
    }
    return { type: "fee" };
  }

  function corpTaxModeId(versionId) {
    return "corp-tax:" + versionId;
  }

  function corpTaxChipLabel(versionId) {
    return "법인세(" + versionId + ")";
  }

  function getCorpTaxVersions(access) {
    if (access && access.corpTaxVersions && access.corpTaxVersions.length) {
      return access.corpTaxVersions;
    }
    if (access && access.corpSheet) {
      return [{ id: "26.3", sheet: access.corpSheet }];
    }
    return [{ id: "26.3", sheet: "법인세(26.3)" }];
  }

  function resolveIncomeListMode(rows) {
    if (!rows || !rows.length) return "income";
    for (let i = 0; i < rows.length; i++) {
      if (!rows[i].isConsult) return "income";
    }
    return "consult";
  }

  function findConsultHeaderRow(sheet, consultSection) {
    if (!sheet || !consultSection) return null;
    for (let r = consultSection.startR; r <= Math.min(consultSection.startR + 8, consultSection.endR); r++) {
      const nameCell = cellAt(sheet, r, 3);
      if (nameCell && (nameCell.v === "성함" || nameCell.v === "성명")) return r;
    }
    return null;
  }

  function listColStorageKey(kind) {
    if (kind === "corp") return CORP_LIST_COL_STORAGE_KEY;
    if (kind === "fee") return FEE_LIST_COL_STORAGE_KEY;
    if (kind === "income-consult") return CONSULT_LIST_COL_STORAGE_KEY;
    return LIST_COL_STORAGE_KEY;
  }

  function colDefByKey(key, kind) {
    kind = kind || "income";
    const catalog = getColCatalog(kind);
    for (let i = 0; i < catalog.length; i++) {
      if (catalog[i].key === key || catalog[i].c === key) return catalog[i];
    }
    return null;
  }

  function colDefByNumber(c, kind) {
    kind = kind || "income";
    const catalog = getColCatalog(kind);
    for (let i = 0; i < catalog.length; i++) {
      if (catalog[i].c === c) return catalog[i];
      if (catalog[i].key === "corp:" + c || catalog[i].key === "fee:" + c) return catalog[i];
    }
    return null;
  }

  function parseFieldKey(key) {
    if (!key || typeof key !== "string") return null;
    const parts = key.split(":");
    if (parts.length !== 2) return null;
    return { source: parts[0], c: parseInt(parts[1], 10) };
  }

  function cellKey(source, c) {
    return source + ":" + c;
  }

  function normalizeCompanyName(name) {
    if (!hasValue(name)) return "";
    var s = String(name).trim().normalize("NFKC");
    if (!s) return "";
    s = s
      .replace(
        /주식회사|유한회사|유한책임회사|합자회사|합명회사|재단법인|사단법인|의료법인|사회복지법인|학교법인|영농조합법인|농업회사법인|협동조합/g,
        ""
      )
      .replace(/㈜|㈐|㈎|\(주\)|\(유\)|\(재\)|\(사\)|\(의\)|\(학\)|\(농\)|（주）|（유）|（재）|（사）/gi, "");
    s = s.replace(/[\s()[\]{}<>.,·•\-_/\\'"`~!@#$%^&*+=|:;?（）]/g, "");
    var withoutBranch = s.replace(/(본점|지점|제\d+공장)$/, "");
    if (withoutBranch.length >= 4) s = withoutBranch;
    return s.toLowerCase();
  }

  function coreCompanyName(name) {
    var s = normalizeCompanyName(name);
    if (!s) return "";
    return s.replace(/[^a-z0-9가-힣]/g, "");
  }

  function companyLinkKey(name) {
    return normalizeCompanyName(name);
  }

  function scopedReviewKey(owner, baseKey, personName) {
    var base = String(baseKey || "").trim();
    if (!base) return "";
    var ownerPart = String(owner || "").trim();
    var personKey = personName ? companyLinkKey(personName) : "";
    if (ownerPart && personKey) return ownerPart + "/" + base + "/" + personKey;
    if (ownerPart) return ownerPart + "/" + base;
    if (personKey) return base + "/" + personKey;
    return base;
  }

  function linkKeyFromName(name) {
    return normalizeCompanyName(name) || null;
  }

  function corpCompanyFromRow(row) {
    const data = row.cells["corp:1"] || row.cells[1];
    return data && data.v;
  }

  function incomeCompanyFromRow(row) {
    const data = row.cells[4];
    return data && data.v;
  }

  function incomePersonFromRow(row) {
    const data = row.cells[3];
    return data && data.v;
  }

  function rowDataScore(row) {
    let score = 0;
    Object.keys(row.cells || {}).forEach(function (key) {
      const v = row.cells[key] && row.cells[key].v;
      if (hasValue(v)) score++;
    });
    return score;
  }

  function mergeShareholders(primary, secondary) {
    const out = primary && primary.length ? primary.slice() : [];
    if (!secondary || !secondary.length) return out;
    secondary.forEach(function (sh) {
      const exists = out.some(function (x) {
        return x.shareholder === sh.shareholder && x.r === sh.r;
      });
      if (!exists) out.push(sh);
    });
    return out;
  }

  function pickDuplicateWinner(existing, candidate, kind) {
    if (kind === "income") {
      if (existing.isTransfer && !candidate.isTransfer) return candidate;
      if (!existing.isTransfer && candidate.isTransfer) return existing;
      const er = existing.r || 0;
      const cr = candidate.r || 0;
      if (er !== cr) return er < cr ? existing : candidate;
      return rowDataScore(candidate) > rowDataScore(existing) ? candidate : existing;
    }
    const er = existing.r || 0;
    const cr = candidate.r || 0;
    return er <= cr ? existing : candidate;
  }

  function dedupeClientRowsByCompany(rows, options) {
    options = options || {};
    const kind = options.kind || "corp";
    const samePerson = options.samePerson === true;
    const pickMap = new Map();
    const order = [];

    rows.forEach(function (row) {
      if (!isClientRow(row)) {
        order.push({ type: "fixed", row: row });
        return;
      }

      let key;
      if (kind === "income") {
        const company = incomeCompanyFromRow(row);
        if (!hasValue(company)) {
          order.push({ type: "fixed", row: row });
          return;
        }
        const normCo = normalizeCompanyName(company);
        if (!normCo) {
          order.push({ type: "fixed", row: row });
          return;
        }
        key = samePerson ? normCo + "|" + normalizeCompanyName(incomePersonFromRow(row)) : normCo;
      } else {
        const company = corpCompanyFromRow(row);
        if (!hasValue(company)) {
          order.push({ type: "fixed", row: row });
          return;
        }
        key = normalizeCompanyName(company);
        if (!key) {
          order.push({ type: "fixed", row: row });
          return;
        }
      }

      if (!pickMap.has(key)) {
        pickMap.set(key, row);
        order.push({ type: "key", key: key });
        return;
      }

      const existing = pickMap.get(key);
      const winner = pickDuplicateWinner(existing, row, kind);
      const loser = winner === existing ? row : existing;
      if (kind === "corp") {
        winner.shareholders = mergeShareholders(winner.shareholders, loser.shareholders);
      }
      pickMap.set(key, winner);
    });

    return order.map(function (slot) {
      if (slot.type === "fixed") return slot.row;
      return pickMap.get(slot.key);
    });
  }

  function hasTransferSignal(sheet, r) {
    for (let c = sheet.minC; c <= Math.min(sheet.maxC, 29); c++) {
      const cell = cellAt(sheet, r, c);
      const v = cell ? cell.v : null;
      if (typeof v !== "string") continue;
      for (let i = 0; i < TRANSFER_KEYWORDS.length; i++) {
        if (v.indexOf(TRANSFER_KEYWORDS[i]) >= 0) return true;
      }
    }
    return false;
  }

  function buildTransferHint(sheet, r) {
    const marker = cellAt(sheet, r, 2);
    if (marker && hasValue(marker.v)) {
      const s = String(marker.v).trim();
      if (s) return s;
    }
    const parts = [];
    for (let c = 2; c <= Math.min(sheet.maxC, 29); c++) {
      const cell = cellAt(sheet, r, c);
      const v = cell ? cell.v : null;
      if (typeof v !== "string") continue;
      for (let i = 0; i < TRANSFER_KEYWORDS.length; i++) {
        if (v.indexOf(TRANSFER_KEYWORDS[i]) >= 0) {
          const trimmed = v.trim();
          if (trimmed && parts.indexOf(trimmed) < 0) parts.push(trimmed);
          break;
        }
      }
    }
    return parts.length ? parts.join(" · ") : null;
  }

  function feeRowCompany(sheet, r) {
    const bCell = cellAt(sheet, r, 2);
    const bVal = bCell ? bCell.v : null;
    if (hasValue(bVal) && detectCorpRowKind(bVal) === "client") {
      return { cell: bCell, v: bVal };
    }
    const aCell = cellAt(sheet, r, 1);
    const aVal = aCell ? aCell.v : null;
    if (hasValue(aVal) && typeof aVal === "string" && detectCorpRowKind(aVal) === "client") {
      return { cell: aCell, v: aVal };
    }
    return null;
  }

  function isCorpDividendHeaderRow(sheet, r) {
    const col1 = cellAt(sheet, r, sheet.minC);
    const col2 = cellAt(sheet, r, sheet.minC + 1);
    const v1 = col1 ? col1.v : null;
    const v2 = col2 ? col2.v : null;
    if (v2 === "주주명") return true;
    if (v1 === "업체명" && v2 === "주주명") return true;
    return false;
  }

  function isCorpShareholderRatioValue(ratio) {
    if (typeof ratio === "number" && ratio > 0 && ratio <= 100) return true;
    if (typeof ratio === "string" && /%/.test(ratio)) return true;
    return false;
  }

  function isCorpShareholderDataRow(sheet, r) {
    const col1 = cellAt(sheet, r, sheet.minC);
    const col2 = cellAt(sheet, r, sheet.minC + 1);
    const co = col1 ? col1.v : null;
    const sh = col2 ? col2.v : null;
    if (!hasValue(sh) || typeof sh !== "string") return false;
    const shTrim = sh.trim();
    if (shTrim === "주주명" || shTrim === "합계") return false;
    const ratioCell = cellAt(sheet, r, sheet.minC + 3);
    const ratio = ratioCell ? ratioCell.v : null;
    if (isCorpShareholderRatioValue(ratio)) return true;
    if (!hasValue(co) || typeof co !== "string") return true;
    if (detectCorpRowKind(co) !== "client") return false;
    const shareCell = cellAt(sheet, r, sheet.minC + 2);
    const share = shareCell ? shareCell.v : null;
    if (typeof share === "number" || (hasValue(share) && !isNaN(Number(share)))) return true;
    return false;
  }

  function colDefForField(field, kind, sheet) {
    kind = kind || "income";
    if (field.source && field.c) {
      return {
        label: field.label,
        num: field.num,
        wrap: field.wrap,
        key: cellKey(field.source, field.c),
      };
    }
    if (kind === "corp" && field.patch) {
      const rel =
        field.patch.relC != null
          ? field.patch.relC
          : field.patch.source === "corp" && sheet
            ? field.patch.c - sheet.minC + 1
            : field.patch.c;
      return (
        colDefByKey(cellKey(field.patch.source, rel), kind) || {
          label: field.label,
          num: field.num,
          wrap: field.wrap,
        }
      );
    }
    if (kind === "income" && field.patch) {
      return (
        colDefByNumber(field.patch.c, "income") || {
          label: field.label,
          num: field.num,
          wrap: field.wrap,
        }
      );
    }
    if (kind === "corp" && sheet) {
      return colDefByNumber(field.c - sheet.minC + 1, "corp");
    }
    if (kind === "corp") {
      return { label: field.label, num: field.num, wrap: field.wrap };
    }
    return colDefByNumber(field.c, kind);
  }

  function getDefaultVisibleListCols(kind) {
    return getColCatalog(kind || "income").filter(function (col) {
      return col.defaultVisible;
    });
  }

  function getVisibleListCols(kind) {
    return getColCatalog(kind || "income");
  }

  function setVisibleListCols(colNumbers, kind) {
    sessionStorage.setItem(listColStorageKey(kind || "income"), JSON.stringify(colNumbers));
  }

  function listColId(col) {
    return col.key || col.c;
  }

  function getListExcludedCols(visibleCols, kind) {
    kind = kind || "income";
    if (kind === "corp-fee" || kind === "corp-sheet" || kind === "corp") {
      const exclude = new Set();
      (visibleCols || getVisibleListCols(kind === "corp" ? "corp-fee" : kind)).forEach(function (col) {
        exclude.add(listColId(col));
      });
      return exclude;
    }
    if (kind === "fee") {
      const exclude = new Set();
      (visibleCols || getVisibleListCols("fee")).forEach(function (col) {
        exclude.add(col.c);
      });
      return exclude;
    }
    const exclude = new Set([2]);
    (visibleCols || getVisibleListCols("income")).forEach(function (col) {
      exclude.add(col.c);
    });
    return exclude;
  }

  function getFeeStaffFilters() {
    try {
      const raw = sessionStorage.getItem(FEE_STAFF_FILTER_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch {
      /* ignore */
    }
    return FEE_STAFF_ORDER.slice();
  }

  function setFeeStaffFilters(staffList) {
    sessionStorage.setItem(FEE_STAFF_FILTER_KEY, JSON.stringify(staffList));
  }

  function companyCellKey(kind) {
    if (kind === "corp") return "corp:1";
    if (kind === "fee") return "fee:2";
    return 3;
  }

  function rowHasUnpaid(row) {
    const v = row.cells[18] && row.cells[18].v;
    return hasValue(v) && v !== 0;
  }

  const INCOME_COLS = [
    { c: 3, label: "성명", sticky: true },
    { c: 4, label: "상호", sticky: true, companyLink: true },
    { c: 8, label: "유형" },
    { c: 12, label: "수입금액" },
    { c: 13, label: "소득세" },
    { c: 14, label: "수수료", highlight: true },
    { c: 18, label: "미수", highlight: true },
    { c: 21, label: "비고" },
  ];

  const CORP_COLS = [
    { c: 1, label: "업체명", sticky: true, companyLink: true },
    { c: 2, label: "시산표" },
    { c: 3, label: "보고서" },
    { c: 4, label: "방문/전화" },
    { c: 6, label: "수수료", highlight: true, num: true },
    { c: 7, label: "향후일정" },
    { c: 5, label: "참고", wrap: true },
  ];

  const CORP_FEE_LIST_COLS = [
    { key: "fee:2", label: "업체명", sticky: true, companyLink: true },
  ].concat(
    FEE_TOGGLEABLE_COLS.filter(function (col) {
      return col.c >= 3;
    }).map(function (col) {
      return {
        key: "fee:" + col.c,
        label: col.label,
        num: col.num,
        highlight: col.highlight,
        wrap: col.wrap,
      };
    })
  );

  const CORP_SHEET_LIST_COLS = CORP_COLS.map(function (col) {
    return Object.assign({}, col);
  });

  const sheetCellMaps = new WeakMap();

  function getSheetCellMap(sheet) {
    if (!sheet || !sheet.cells) return null;
    if (sheetCellMaps.has(sheet)) return sheetCellMaps.get(sheet);
    const map = ReviewGridCore.buildCellMap(sheet.cells);
    sheetCellMaps.set(sheet, map);
    return map;
  }

  function cellAt(sheet, r, c) {
    const map = getSheetCellMap(sheet);
    if (map) return map.get(r + ":" + c) || null;
    for (let i = 0; i < sheet.cells.length; i++) {
      const cell = sheet.cells[i];
      if (cell.r === r && cell.c === c) return cell;
    }
    return null;
  }

  function rowBg(sheet, r) {
    const anchor = sheet.minC || 2;
    const cell = cellAt(sheet, r, anchor);
    if (cell && cell.bg) return ReviewGridCore.softenBg(cell.bg);
    for (let i = 0; i < sheet.cells.length; i++) {
      const c = sheet.cells[i];
      if (c.r === r && c.bg) return ReviewGridCore.softenBg(c.bg);
    }
    return null;
  }

  function hasValue(v) {
    return v !== null && v !== undefined && v !== "";
  }

  function shareRatioToPercent(val) {
    if (typeof val === "string") {
      const t = val.trim();
      if (!t) return null;
      if (/%/.test(t)) {
        const n = parseFloat(t.replace(/%/g, "").replace(/,/g, "").trim());
        return isNaN(n) ? null : n;
      }
      const n = parseFloat(t.replace(/,/g, ""));
      if (isNaN(n)) return null;
      val = n;
    }
    if (typeof val !== "number" || isNaN(val)) return null;
    if (val >= 0 && val <= 1) return val * 100;
    if (val > 1 && val <= 100) return val;
    return val;
  }

  function formatPercentDisplay(pct) {
    const rounded = Math.round(pct * 100) / 100;
    if (Number.isInteger(rounded)) return String(rounded) + "%";
    return rounded.toFixed(2).replace(/\.?0+$/, "") + "%";
  }

  function formatShareRatio(val) {
    if (!hasValue(val)) return "—";
    const pct = shareRatioToPercent(val);
    if (pct == null) return String(val).trim();
    return formatPercentDisplay(pct);
  }

  function parseShareRatioText(rawText) {
    const text = (rawText || "").trim();
    if (!text) return "";
    if (text.indexOf("%") >= 0) {
      const num = parseFloat(text.replace(/%/g, "").replace(/,/g, "").trim());
      if (isNaN(num)) return text;
      return String(num / 100);
    }
    const num = parseFloat(text.replace(/,/g, ""));
    if (isNaN(num)) return text;
    if (num >= 0 && num <= 1) return String(num);
    if (num > 1 && num <= 100) return String(num / 100);
    return text;
  }

  function formatVal(v) {
    if (!hasValue(v)) return "";
    if (typeof v === "number") return v.toLocaleString("ko-KR");
    return String(v);
  }

  function formatDetailVal(v) {
    if (!hasValue(v)) return "—";
    if (typeof v === "number") return v.toLocaleString("ko-KR");
    return String(v);
  }

  function resolveFieldEditor(colDef) {
    if (!colDef) return { kind: "text" };
    if (colDef.num) return { kind: "number" };
    return { kind: "text" };
  }

  function isTotalLabel(v) {
    if (!hasValue(v) || typeof v !== "string") return null;
    const s = v.trim();
    if (s === "소계") return "subtotal";
    if (s === "합계" || s === "총계") return "total";
    return null;
  }

  function isSectionMarker(no, name) {
    if (typeof no === "string" && /^(기장|성실|신고|업체|상담)/.test(no) && !name) return true;
    return false;
  }

  function detectIncomeRowKind(no, name) {
    return isTotalLabel(no) || isTotalLabel(name) || "client";
  }

  function totalLabelText(no, name, rowKind) {
    if (rowKind === "subtotal") return "소계";
    if (rowKind === "total") {
      if (isTotalLabel(no) === "total") return String(no).trim();
      if (isTotalLabel(name) === "total") return String(name).trim();
      return "합계";
    }
    return null;
  }

  function buildIncomeItem(sheet, r, colDefs) {
    const cols = colDefs || INCOME_COLS;
    const item = { r: r, bg: rowBg(sheet, r), cells: {}, chips: [], rowKind: "client" };
    let hasData = false;
    cols.forEach(function (col) {
      const cell = cellAt(sheet, r, col.c);
      const v = cell ? cell.v : null;
      item.cells[col.c] = {
        v: v,
        bg: cell && cell.bg ? ReviewGridCore.softenBg(cell.bg) : null,
      };
      if (hasValue(v)) hasData = true;
    });
    return { item: item, hasData: hasData };
  }

  function isConsultHeaderRow(no, name, company) {
    if (no === "No" || no === "번호") return true;
    if (name === "성함" || name === "성명") return true;
    if (company === "상호" && (name === "성함" || name === "성명" || !name)) return true;
    return false;
  }

  function incomeItemFromNewRow(nr) {
    const cells = nr.cells || {};
    const item = {
      r: nr.id,
      newRowId: nr.id,
      isNew: true,
      bg: nr.rowAccent || null,
      rowAccent: nr.rowAccent || null,
      cells: {},
      chips: ["신규"],
      rowKind: "client",
      sectionKind: nr.filterKey,
      sectionLabel: nr.sectionLabel || "",
      sectionId: nr.sectionId || nr.filterKey,
      isTransfer: !!nr.isTransfer,
      isConsult: nr.filterKey === "consult" || nr.filterKey === "excluded",
      filterKey:
        nr.filterKey === "excluded" || nr.filterKey === "consult" || nr.isTransfer || nr.filterKey === "transfer"
          ? "excluded"
          : nr.filterKey,
      emphasisOffList: nr.emphasisOffList || [],
    };
    Object.keys(cells).forEach(function (key) {
      item.cells[key] = Object.assign({}, cells[key]);
    });
    const unpaid = item.cells[18] && item.cells[18].v;
    if (hasValue(unpaid) && unpaid !== 0 && item.chips.indexOf("미수") < 0) item.chips.push("미수");
    const note = item.cells[21] && item.cells[21].v;
    if (hasValue(note) && item.chips.indexOf("비고") < 0) item.chips.push("비고");
    return item;
  }

  function corpItemFromNewRow(nr) {
    const cells = nr.cells || {};
    const company = (cells["corp:1"] && cells["corp:1"].v) || (cells["fee:2"] && cells["fee:2"].v);
    return {
      r: nr.id,
      newRowId: nr.id,
      isNew: true,
      corpR: null,
      feeR: null,
      bg: nr.rowAccent || null,
      rowAccent: nr.rowAccent || null,
      cells: Object.assign({}, cells),
      chips: ["신규"],
      rowKind: "client",
      company: company,
      shareholders: nr.shareholders || [],
      emphasisOffList: nr.emphasisOffList || [],
    };
  }

  function extractStoredRowModalDetail(row, kind, options) {
    options = options || {};
    const includeEmpty = !!options.includeEmpty;
    if (kind === "corp") {
      const sections = [];
      CORP_MERGED_FIELD_GROUPS.forEach(function (group) {
        const fields = [];
        group.fields.forEach(function (def) {
          const key = cellKey(def.source, def.c);
          const data = row.cells[key] || {};
          const v = data.v;
          if (!hasValue(v) && !includeEmpty) return;
          fields.push({
            label: formatCorpFeeColLabel(def),
            v: v,
            source: def.source,
            c: def.c,
            num: def.num,
            wrap: def.wrap,
            bg: data.bg || null,
            patch: {
              isNewRow: true,
              newRowId: row.newRowId,
              cellKey: key,
            },
          });
        });
        if (fields.length) sections.push({ title: group.title, fields: fields });
      });
      const used = new Set();
      CORP_MERGED_FIELD_GROUPS.forEach(function (g) {
        g.fields.forEach(function (d) {
          used.add(cellKey(d.source, d.c));
        });
      });
      const extra = [];
      Object.keys(row.cells).forEach(function (key) {
        if (used.has(key)) return;
        const data = row.cells[key];
        if (!hasValue(data.v) && !includeEmpty) return;
        extra.push({
          label: key,
          v: data.v,
          bg: data.bg || null,
          patch: { isNewRow: true, newRowId: row.newRowId, cellKey: key },
        });
      });
      if (extra.length) sections.push({ title: "기타", fields: extra });
      return sections;
    }

    const fields = [];
    INCOME_TOGGLEABLE_COLS.forEach(function (col) {
      const data = row.cells[col.c] || {};
      const v = data.v;
      if (!hasValue(v) && !includeEmpty) return;
      fields.push({
        c: col.c,
        label: col.label,
        v: v,
        bg: data.bg || null,
        num: col.num,
        wrap: col.wrap,
        patch: { isNewRow: true, newRowId: row.newRowId, cellKey: col.c },
      });
    });
    return fields;
  }

  function buildIncomeClientRows(sheet) {
    const sections = ReviewGridSections.getSections(sheet);
    const consultSection = sections.find(function (s) {
      return s.kind === "consult";
    });
    const consultHeaderR = consultSection ? findConsultHeaderRow(sheet, consultSection) : null;
    const rows = [];
    for (let r = 2; r <= sheet.maxR; r++) {
      const noCell = cellAt(sheet, r, 2);
      const nameCell = cellAt(sheet, r, 3);
      const companyCell = cellAt(sheet, r, 4);
      const phoneCell = cellAt(sheet, r, 5);
      const no = noCell ? noCell.v : null;
      const name = nameCell ? nameCell.v : null;
      const company = companyCell ? companyCell.v : null;
      const phone = phoneCell ? phoneCell.v : null;
      if (isSectionMarker(no, name)) continue;

      const rowKind = detectIncomeRowKind(no, name);
      if (rowKind !== "client") continue;

      const located = ReviewGridSections.findRowSection(r, sections);
      const sec = located.section;
      if (!sec) continue;

      const parent = located.parent;
      const transferSignal = hasTransferSignal(sheet, r);
      const isTransfer = (parent && parent.kind === "transfer") || transferSignal;
      const isConsult = sec.kind === "consult";

      if (isConsult) {
        if (isConsultHeaderRow(no, name, company)) continue;
        if (!hasValue(name) && !hasValue(company) && !hasValue(phone)) continue;
      } else if (!name && typeof no !== "number") {
        continue;
      }

      const built = buildIncomeItem(
        sheet,
        r,
        isConsult ? CONSULT_TOGGLEABLE_COLS : INCOME_TOGGLEABLE_COLS
      );
      const item = built.item;
      const nameBgCell = cellAt(sheet, r, 3);
      item.rowAccent =
        nameBgCell && nameBgCell.bg
          ? ReviewGridCore.softenBg(nameBgCell.bg)
          : rowBg(sheet, r);
      item.bg = item.rowAccent;
      item.rowKind = "client";
      item.sectionKind = sec.kind;
      item.sectionLabel = sec.label;
      item.sectionId = sec.id;
      item.isTransfer = isTransfer;
      item.isConsult = isConsult;
      if (isTransfer) item.transferHint = buildTransferHint(sheet, r);
      item.consultHeaderR = isConsult ? consultHeaderR : null;
      item.filterKey = isConsult || isTransfer ? "excluded" : sec.kind;

      const unpaid = item.cells[18] && item.cells[18].v;
      const noteCell = cellAt(sheet, r, 21);
      const note = noteCell ? noteCell.v : null;
      if (hasValue(unpaid) && unpaid !== 0) item.chips.push("미수");
      if (hasValue(note)) item.chips.push("비고");

      attachIncomeRowEmphasis(item, sheet, r);

      if (built.hasData || name || company || phone) rows.push(item);
    }
    if (typeof ReviewGridEdit !== "undefined") {
      ReviewGridEdit.getNewRowsForSheet(sheet.name).forEach(function (nr) {
        if (nr.kind === "income") rows.push(incomeItemFromNewRow(nr));
      });
    }
    return dedupeClientRowsByCompany(rows, { kind: "income", samePerson: true });
  }

  function parseIncomeRows(sheet) {
    const rows = [];
    for (let r = 2; r <= sheet.maxR; r++) {
      const noCell = cellAt(sheet, r, 2);
      const nameCell = cellAt(sheet, r, 3);
      const no = noCell ? noCell.v : null;
      const name = nameCell ? nameCell.v : null;
      if (isSectionMarker(no, name)) continue;

      const rowKind = detectIncomeRowKind(no, name);
      if (rowKind === "client" && !name && typeof no !== "number") continue;

      const built = buildIncomeItem(sheet, r, INCOME_COLS);
      const item = built.item;
      item.rowKind = rowKind;
      if (rowKind !== "client") {
        item.totalLabel = totalLabelText(no, name, rowKind);
      }

      const unpaid = item.cells[18] && item.cells[18].v;
      const note = item.cells[21] && item.cells[21].v;
      if (rowKind === "client") {
        if (hasValue(unpaid) && unpaid !== 0) item.chips.push("미수");
        if (hasValue(note)) item.chips.push("비고");
      }
      if (built.hasData || name || rowKind !== "client") rows.push(item);
    }
    return rows;
  }

  function detectCorpRowKind(company) {
    if (!hasValue(company) || typeof company !== "string") return "client";
    const s = company.trim();
    if (s === "업체명" || s === "주주명") return "header";
    if (s === "소계") return "subtotal";
    if (s === "합계" || s === "총계" || s.indexOf("합계") >= 0) return "total";
    return "client";
  }

  function parseCorpRows(sheet) {
    const rows = [];
    let inDividend = false;
    for (let r = 3; r <= sheet.maxR; r++) {
      if (isCorpDividendHeaderRow(sheet, r)) {
        inDividend = true;
        continue;
      }
      if (inDividend || isCorpShareholderDataRow(sheet, r)) continue;

      const companyCell = cellAt(sheet, r, sheet.minC);
      const company = companyCell ? companyCell.v : null;
      const rowKind = detectCorpRowKind(company);
      if (rowKind === "header") continue;
      if (rowKind === "client" && (!hasValue(company) || typeof company !== "string")) continue;

      const item = { r: r, bg: rowBg(sheet, r), cells: {}, chips: [], rowKind: rowKind };
      if (rowKind !== "client") {
        item.totalLabel = typeof company === "string" ? company.trim() : "합계";
      }
      let hasData = false;
      CORP_COLS.forEach(function (col) {
        const absC = sheet.minC + (col.c - 1);
        const cell = cellAt(sheet, r, absC);
        const v = cell ? cell.v : null;
        item.cells[col.c] = {
          v: v,
          bg: cell && cell.bg ? ReviewGridCore.softenBg(cell.bg) : null,
        };
        if (hasValue(v)) hasData = true;
      });
      const memo = item.cells[5] && item.cells[5].v;
      if (rowKind === "client" && hasValue(memo)) item.chips.push("참고");
      if (hasData || rowKind !== "client") rows.push(item);
    }
    return rows;
  }

  function shareholderSheetForOwner(corpSheet, corpFullSheet, owner) {
    if (corpSheet) return corpSheet;
    if (!corpFullSheet || !owner) return null;
    const blocks = corpFullSheet.meta && corpFullSheet.meta.blocks;
    if (blocks && blocks.length) {
      for (let i = 0; i < blocks.length; i++) {
        if (blocks[i].owner === owner) {
          return ReviewGridCore.sliceSheet(corpFullSheet, blocks[i].minC, blocks[i].maxC);
        }
      }
    }
    return null;
  }

  function parseCorpShareholderMapForOwner(corpSheet, corpFullSheet, owner) {
    const sheet = shareholderSheetForOwner(corpSheet, corpFullSheet, owner);
    return sheet ? parseCorpShareholderMap(sheet) : {};
  }

  function buildCorpClientRows(corpSheet, feeSheet, staffName, corpFullSheet) {
    if (!corpSheet && !feeSheet) return [];
    staffName = staffName || corpSheet?.meta?.owner || "";

    const shareholderMap = parseCorpShareholderMapForOwner(corpSheet, corpFullSheet, staffName);
    const feeByCompany = new Map();

    if (feeSheet && staffName) {
      buildFeeClientRows(feeSheet)
        .filter(function (row) {
          return row.filterKey === staffName;
        })
        .forEach(function (feeRow) {
          const name = feeRow.cells[2] && feeRow.cells[2].v;
          if (!hasValue(name)) return;
          feeByCompany.set(normalizeCompanyName(name), feeRow);
        });
    }

    const merged = [];
    const seen = new Set();

    if (corpSheet) {
      let inDividend = false;
      for (let r = 3; r <= corpSheet.maxR; r++) {
        if (isCorpDividendHeaderRow(corpSheet, r)) {
          inDividend = true;
          continue;
        }
        if (inDividend) continue;

        const companyCell = cellAt(corpSheet, r, corpSheet.minC);
        const company = companyCell ? companyCell.v : null;
        if (!hasValue(company) || typeof company !== "string") continue;
        if (detectCorpRowKind(company) !== "client") continue;

        const norm = normalizeCompanyName(company);
        if (seen.has(norm)) continue;
        seen.add(norm);

        const feeRow = feeByCompany.get(norm);
        if (feeRow) feeByCompany.delete(norm);

        merged.push(
          finalizeMergedCorpRow(
            buildMergedCorpRow(corpSheet, feeRow, r, company, companyCell, shareholderMap[norm] || []),
            corpSheet,
            feeSheet
          )
        );
      }
    }

    feeByCompany.forEach(function (feeRow) {
      const company = feeRow.cells[2] && feeRow.cells[2].v;
      if (!hasValue(company)) return;
      const norm = normalizeCompanyName(company);
      if (seen.has(norm)) return;
      seen.add(norm);
      merged.push(
        finalizeMergedCorpRow(
          buildMergedCorpRow(null, feeRow, null, company, null, shareholderMap[norm] || []),
          null,
          feeSheet
        )
      );
    });

    if (typeof ReviewGridEdit !== "undefined") {
      ReviewGridEdit.getNewCorpRows(staffName).forEach(function (nr) {
        const company =
          (nr.cells["corp:1"] && nr.cells["corp:1"].v) ||
          (nr.cells["fee:2"] && nr.cells["fee:2"].v);
        if (!hasValue(company)) return;
        const norm = normalizeCompanyName(company);
        if (seen.has(norm)) return;
        seen.add(norm);
        merged.push(corpItemFromNewRow(nr));
      });
    }

    return dedupeClientRowsByCompany(merged, { kind: "corp" });
  }

  function buildMergedCorpRow(corpSheet, feeRow, corpR, company, companyCell, shareholders) {
    const cells = {};
    cells[cellKey("corp", 1)] = { v: company, bg: companyCell?.bg ? ReviewGridCore.softenBg(companyCell.bg) : null };

    if (corpSheet && corpR) {
      CORP_COLS.forEach(function (col) {
        if (col.c === 1) return;
        const absC = corpSheet.minC + (col.c - 1);
        const cell = cellAt(corpSheet, corpR, absC);
        cells[cellKey("corp", col.c)] = {
          v: cell ? cell.v : null,
          bg: cell && cell.bg ? ReviewGridCore.softenBg(cell.bg) : null,
        };
      });
    }

    if (feeRow) {
      FEE_TOGGLEABLE_COLS.forEach(function (col) {
        if (col.c === 2) return;
        const data = feeRow.cells[col.c] || {};
        cells[cellKey("fee", col.c)] = { v: data.v, bg: data.bg || null };
      });
    }

    const rowAccent =
      companyCell && companyCell.bg
        ? ReviewGridCore.softenBg(companyCell.bg)
        : feeRow && feeRow.rowAccent
          ? feeRow.rowAccent
          : null;

    return {
      r: (feeRow && feeRow.r) || corpR,
      corpR: corpR,
      feeR: feeRow ? feeRow.r : null,
      mergeStatus: corpR && feeRow ? "merged" : feeRow ? "fee-only" : corpR ? "corp-only" : "unknown",
      bg: rowAccent,
      rowAccent: rowAccent,
      cells: cells,
      chips: [],
      rowKind: "client",
      company: company,
      shareholders: shareholders || [],
    };
  }

  function finalizeMergedCorpRow(row, corpSheet, feeSheet) {
    attachCorpRowEmphasis(row, corpSheet, row.corpR, feeSheet, row.feeR);
    return row;
  }

  function parseCorpShareholderMap(sheet) {
    const map = {};
    let inDividend = false;
    let currentCompany = null;

    for (let r = 3; r <= sheet.maxR; r++) {
      if (isCorpDividendHeaderRow(sheet, r)) {
        inDividend = true;
        currentCompany = null;
        continue;
      }
      if (!inDividend) continue;

      const coCell = cellAt(sheet, r, sheet.minC);
      const shCell = cellAt(sheet, r, sheet.minC + 1);
      const co = coCell ? coCell.v : null;
      const sh = shCell ? shCell.v : null;

      if (co === "합계" || sh === "합계") {
        currentCompany = null;
        continue;
      }
      if (hasValue(co) && typeof co === "string" && co !== "업체명") {
        if (detectCorpRowKind(co) !== "client") {
          currentCompany = null;
          continue;
        }
        currentCompany = String(co).trim();
        const norm = normalizeCompanyName(currentCompany);
        if (!map[norm]) map[norm] = [];
        if (!hasValue(sh) || typeof sh !== "string" || sh.trim() === "주주명") continue;
      }
      if (!currentCompany || !hasValue(sh) || typeof sh !== "string") continue;
      if (sh.trim() === "주주명" || sh.trim() === "합계") continue;

      const norm = normalizeCompanyName(currentCompany);
      if (!map[norm]) map[norm] = [];
      const minC = sheet.minC;
      map[norm].push({
        shareholder: String(sh).trim(),
        share: cellVal(sheet, r, minC + 2),
        ratio: cellVal(sheet, r, minC + 3),
        dividend: cellVal(sheet, r, minC + 4),
        paid: cellVal(sheet, r, minC + 5),
        resolution: cellVal(sheet, r, minC + 6),
        r: r,
        sheetName: sheet.name,
        cols: {
          shareholder: minC + 1,
          share: minC + 2,
          ratio: minC + 3,
          dividend: minC + 4,
          paid: minC + 5,
          resolution: minC + 6,
        },
      });
    }
    return map;
  }

  function cellVal(sheet, r, c) {
    const cell = cellAt(sheet, r, c);
    return cell ? cell.v : null;
  }

  function buildCorpClientRowsLegacy(sheet) {
    return parseCorpRows(sheet)
      .filter(isClientRow)
      .map(function (item) {
        const companyCell = cellAt(sheet, item.r, sheet.minC);
        item.rowAccent =
          companyCell && companyCell.bg
            ? ReviewGridCore.softenBg(companyCell.bg)
            : item.bg;
        item.bg = item.rowAccent;
        return item;
      });
  }

  function buildCorpSheetClientRows(corpSheet, corpFullSheet, owner) {
    if (!corpSheet) return [];
    const shareholderMap = parseCorpShareholderMapForOwner(corpSheet, corpFullSheet, owner);
    const rows = parseCorpRows(corpSheet)
      .filter(isClientRow)
      .map(function (item) {
        const companyCell = cellAt(corpSheet, item.r, corpSheet.minC);
        item.rowAccent =
          companyCell && companyCell.bg
            ? ReviewGridCore.softenBg(companyCell.bg)
            : item.bg;
        item.bg = item.rowAccent;
        const company = item.cells[1] && item.cells[1].v;
        const norm = normalizeCompanyName(company);
        item.shareholders = shareholderMap[norm] || [];
        return item;
      });
    return dedupeClientRowsByCompany(rows, { kind: "corp" });
  }

  function detectFeeSegments(sheet) {
    const starts = [];
    for (let r = 2; r <= sheet.maxR; r++) {
      const noCell = cellAt(sheet, r, 1);
      const companyCell = cellAt(sheet, r, 2);
      if (noCell && noCell.v === 1 && companyCell && hasValue(companyCell.v)) {
        starts.push(r);
      }
    }
    return starts.map(function (startR, i) {
      return {
        staff: FEE_STAFF_ORDER[i] || "기타",
        startR: startR,
        endR: (starts[i + 1] || sheet.maxR + 1) - 1,
      };
    });
  }

  function feeRowStaffMap(sheet, segments) {
    const map = new Map();
    segments.forEach(function (seg) {
      let staff = seg.staff;
      let lastCompanyR = null;
      for (let r = seg.startR; r <= seg.endR; r++) {
        const companyCell = cellAt(sheet, r, 2);
        const company = companyCell ? companyCell.v : null;
        if (detectCorpRowKind(company) !== "client" || !hasValue(company)) continue;
        if (lastCompanyR !== null && r - lastCompanyR >= FEE_SEGMENT_GAP) {
          const nextIdx = FEE_STAFF_ORDER.indexOf(staff) + 1;
          if (nextIdx > 0 && nextIdx < FEE_STAFF_ORDER.length) {
            staff = FEE_STAFF_ORDER[nextIdx];
          }
        }
        map.set(r, staff);
        lastCompanyR = r;
      }
    });
    return map;
  }

  function buildFeeClientRows(sheet) {
    const segments = detectFeeSegments(sheet);
    const staffByRow = feeRowStaffMap(sheet, segments);
    const rows = [];
    segments.forEach(function (seg) {
      for (let r = seg.startR; r <= seg.endR; r++) {
        const staff = staffByRow.get(r);
        if (!staff) continue;
        const companyInfo = feeRowCompany(sheet, r);
        if (!companyInfo) continue;
        const companyCell = companyInfo.cell;
        const company = companyInfo.v;

        const item = {
          r: r,
          bg: rowBg(sheet, r),
          cells: {},
          chips: [],
          rowKind: "client",
          sectionLabel: staff,
          filterKey: staff,
        };
        item.cells[2] = {
          v: company,
          bg: companyCell && companyCell.bg ? ReviewGridCore.softenBg(companyCell.bg) : null,
        };
        item.rowAccent =
          companyCell && companyCell.bg
            ? ReviewGridCore.softenBg(companyCell.bg)
            : item.bg;
        item.bg = item.rowAccent;

        let hasData = false;
        FEE_TOGGLEABLE_COLS.forEach(function (col) {
          const cell = cellAt(sheet, r, col.c);
          const v = cell ? cell.v : null;
          item.cells[col.c] = {
            v: v,
            bg: cell && cell.bg ? ReviewGridCore.softenBg(cell.bg) : null,
          };
          if (hasValue(v)) hasData = true;
        });
        if (hasData || company) rows.push(item);
      }
    });
    return rows;
  }

  function mapFeeRowCellsToKeys(cells) {
    const out = {};
    Object.keys(cells || {}).forEach(function (key) {
      const num = parseInt(key, 10);
      const mapped = !isNaN(num) && String(num) === String(key) ? cellKey("fee", num) : key;
      out[mapped] = cells[key];
    });
    return out;
  }

  function buildFeeClientRowsForStaff(feeSheet, staffName) {
    if (!feeSheet || !staffName) return [];
    return buildFeeClientRows(feeSheet)
      .filter(function (row) {
        return row.filterKey === staffName && isClientRow(row);
      })
      .map(function (row) {
        return Object.assign({}, row, {
          cells: mapFeeRowCellsToKeys(row.cells),
          feeR: row.r,
          sectionLabel: "",
        });
      });
  }

  function corpClientMatchesQuery(row, query) {
    if (!query) return true;
    const q = query.toLowerCase();
    const catalogs = [CORP_FEE_LIST_COLS, CORP_SHEET_LIST_COLS, CORP_TOGGLEABLE_COLS];
    for (let c = 0; c < catalogs.length; c++) {
      for (let i = 0; i < catalogs[c].length; i++) {
        const col = catalogs[c][i];
        const colId = col.key || col.c;
        const data = row.cells[colId];
        const v = data && data.v;
        if (hasValue(v) && String(v).toLowerCase().indexOf(q) >= 0) return true;
      }
    }
    if (row.cells) {
      for (const key in row.cells) {
        if (!Object.prototype.hasOwnProperty.call(row.cells, key)) continue;
        const v = row.cells[key] && row.cells[key].v;
        if (hasValue(v) && String(v).toLowerCase().indexOf(q) >= 0) return true;
      }
    }
    if (row.shareholders) {
      for (let j = 0; j < row.shareholders.length; j++) {
        const sh = row.shareholders[j];
        if (sh.shareholder && sh.shareholder.toLowerCase().indexOf(q) >= 0) return true;
      }
    }
    return false;
  }

  function filterCorpClientRows(rows, query) {
    if (!query) return rows;
    return rows.filter(function (row) {
      return corpClientMatchesQuery(row, query);
    });
  }

  function feeClientMatchesQuery(row, query) {
    return rowMatchesQuery(row, FEE_TOGGLEABLE_COLS, query);
  }

  function filterFeeClientRows(rows, checkedStaff, query) {
    if (!checkedStaff || !checkedStaff.length) {
      return { rows: [], filterEmpty: true };
    }
    const set = new Set(checkedStaff);
    let out = rows.filter(function (row) {
      return set.has(row.filterKey);
    });
    if (query) {
      out = out.filter(function (row) {
        return feeClientMatchesQuery(row, query);
      });
    }
    return { rows: out, filterEmpty: false };
  }

  function buildDetailField(sheet, rowNum, headerRow, c, label) {
    const dataCell = cellAt(sheet, rowNum, c);
    return {
      c: c,
      label: label,
      v: dataCell ? dataCell.v : null,
      bg: dataCell && dataCell.bg ? ReviewGridCore.softenBg(dataCell.bg) : null,
    };
  }

  function extractFullRowDetail(sheet, rowNum, headerRow) {
    const fields = [];
    for (let c = sheet.minC; c <= sheet.maxC; c++) {
      const headerCell = cellAt(sheet, headerRow, c);
      const dataCell = cellAt(sheet, rowNum, c);
      const label =
        headerCell && hasValue(headerCell.v)
          ? String(headerCell.v)
          : ReviewGridCore.colLetter(c);
      fields.push({
        c: c,
        label: label,
        v: dataCell ? dataCell.v : null,
        bg: dataCell && dataCell.bg ? ReviewGridCore.softenBg(dataCell.bg) : null,
      });
    }
    return fields;
  }

  function effectiveMaxCol(sheet, rowNum) {
    let maxC = sheet.minC;
    for (let i = 0; i < sheet.cells.length; i++) {
      const cell = sheet.cells[i];
      if (cell.r === rowNum && hasValue(cell.v) && cell.c > maxC) {
        maxC = cell.c;
      }
    }
    return maxC;
  }

  function extractListExcludedDetail(sheet, rowNum, kind, excludeCols) {
    const headerRow = kind === "corp" ? 2 : 1;
    const exclude =
      excludeCols instanceof Set
        ? excludeCols
        : kind === "income"
          ? getListExcludedCols(excludeCols)
          : new Set(LIST_DETAIL_EXCLUDE_COLS);
    const maxC = effectiveMaxCol(sheet, rowNum);
    const fields = [];
    for (let c = sheet.minC; c <= maxC; c++) {
      if (kind === "corp") {
        if (exclude.has(c - sheet.minC + 1)) continue;
      } else if (exclude.has(c)) {
        continue;
      }
      const headerCell = cellAt(sheet, headerRow, c);
      const dataCell = cellAt(sheet, rowNum, c);
      if (!hasValue(dataCell && dataCell.v)) continue;
      fields.push({
        c: c,
        label:
          headerCell && hasValue(headerCell.v)
            ? String(headerCell.v)
            : ReviewGridCore.colLetter(c),
        v: dataCell.v,
        bg: dataCell && dataCell.bg ? ReviewGridCore.softenBg(dataCell.bg) : null,
      });
    }
    return fields;
  }

  function buildIncomeField(sheet, rowNum, col, includeEmpty) {
    const dataCell = cellAt(sheet, rowNum, col.c);
    const v = dataCell ? dataCell.v : null;
    if (!hasValue(v) && !includeEmpty) return null;
    const bg = cellBgSoft(dataCell);
    return {
      c: col.c,
      label: col.label,
      v: v,
      bg: bg,
      num: col.num,
      wrap: col.wrap,
      patch: { sheetName: sheet.name, r: rowNum, c: col.c },
    };
  }

  function extractIncomeModalDetail(sheet, rowNum, options, row) {
    options = options || {};
    const includeEmpty = !!options.includeEmpty;
    const isConsult = row && row.isConsult;
    const headerRow = isConsult && row.consultHeaderR ? row.consultHeaderR : 1;
    const catalog = isConsult ? CONSULT_TOGGLEABLE_COLS : INCOME_TOGGLEABLE_COLS;
    const fields = [];
    const catalogC = new Set();

    catalog.forEach(function (col) {
      catalogC.add(col.c);
      const field = buildIncomeField(sheet, rowNum, col, includeEmpty);
      if (field) fields.push(field);
    });

    const maxC = effectiveMaxCol(sheet, rowNum);
    for (let c = sheet.minC; c <= maxC; c++) {
      if (c === 2 || catalogC.has(c)) continue;
      const headerCell = cellAt(sheet, headerRow, c);
      const dataCell = cellAt(sheet, rowNum, c);
      const v = dataCell ? dataCell.v : null;
      if (!hasValue(v) && !includeEmpty) continue;
      fields.push({
        c: c,
        label:
          headerCell && hasValue(headerCell.v)
            ? String(headerCell.v)
            : ReviewGridCore.colLetter(c),
        v: v,
        bg: cellBgSoft(dataCell),
        patch: { sheetName: sheet.name, r: rowNum, c: c },
      });
    }

    return fields;
  }

  function corpModalSectionsFromCells(row, options) {
    options = options || {};
    const includeEmpty = !!options.includeEmpty;
    const sections = [];
    CORP_MERGED_FIELD_GROUPS.forEach(function (group) {
      const fields = [];
      group.fields.forEach(function (def) {
        const key = cellKey(def.source, def.c);
        const data = row.cells[key] || {};
        const v = data.v;
        if (!hasValue(v) && !includeEmpty) return;
        fields.push({
          label: formatCorpFeeColLabel(def),
          v: v,
          source: def.source,
          c: def.c,
          num: def.num,
          wrap: def.wrap,
          bg: data.bg || null,
          patch: null,
        });
      });
      if (fields.length) sections.push({ title: group.title, fields: fields });
    });
    return sections;
  }

  function extractMergedCorpModalDetail(row, corpSheet, feeSheet, options) {
    options = options || {};
    const includeEmpty = !!options.includeEmpty;
    const mode = options.corpListMode || "corp-fee";
    const parsedMode = parseCorpListMode(mode);
    const sourceFilter = parsedMode.type === "tax" ? "corp" : "fee";
    const sections = [];
    const usedKeys = new Set();

    function pushField(fields, def, sheet, rowNum, absC, relC) {
      const dataCell = cellAt(sheet, rowNum, absC);
      const v = dataCell ? dataCell.v : null;
      if (!hasValue(v) && !includeEmpty) return;
      const key = cellKey(def.source, def.source === "corp" ? relC : def.c);
      usedKeys.add(key);
      fields.push({
        label: formatCorpFeeColLabel(def),
        v: v,
        source: def.source,
        c: absC,
        num: def.num,
        wrap: def.wrap,
        bg: cellBgSoft(dataCell),
        patch: {
          source: def.source,
          c: absC,
          relC: def.source === "corp" ? relC : def.c,
          corpMinC: def.source === "corp" ? sheet.minC : null,
          r: rowNum,
          sheetName: sheet.name,
        },
      });
    }

    CORP_MERGED_FIELD_GROUPS.forEach(function (group) {
      const fields = [];
      group.fields.forEach(function (def) {
        if (sourceFilter === "fee" && def.source !== "fee") return;
        if (sourceFilter === "corp" && def.source !== "corp") return;
        const sheet = def.source === "fee" ? feeSheet : corpSheet;
        const rowNum = def.source === "fee" ? row.feeR : row.corpR;
        if (!sheet || !rowNum) {
          if (def.source === "corp") return;
          if (!includeEmpty) return;
          const key = cellKey(def.source, def.c);
          const cellData = row.cells[key];
          if (!cellData && !includeEmpty) return;
          usedKeys.add(key);
          fields.push({
            label: formatCorpFeeColLabel(def),
            v: cellData ? cellData.v : null,
            source: def.source,
            c: def.c,
            num: def.num,
            wrap: def.wrap,
            bg: cellData && cellData.bg ? cellData.bg : null,
            patch: null,
          });
          return;
        }
        const absC = def.source === "corp" ? sheet.minC + (def.c - 1) : def.c;
        pushField(fields, def, sheet, rowNum, absC, def.c);
      });
      if (fields.length) sections.push({ title: group.title, fields: fields });
    });

    const extraFields = [];
    if (includeEmpty || corpSheet || feeSheet) {
      if (corpSheet && row.corpR) {
        for (let c = corpSheet.minC; c <= corpSheet.maxC; c++) {
          const relC = c - corpSheet.minC + 1;
          const key = cellKey("corp", relC);
          if (usedKeys.has(key)) continue;
          const headerCell = cellAt(corpSheet, 2, c);
          const dataCell = cellAt(corpSheet, row.corpR, c);
          const v = dataCell ? dataCell.v : null;
          if (!hasValue(v) && !includeEmpty) continue;
          usedKeys.add(key);
          extraFields.push({
            label:
              headerCell && hasValue(headerCell.v)
                ? String(headerCell.v)
                : ReviewGridCore.colLetter(c),
            v: v,
            source: "corp",
            c: c,
            bg: cellBgSoft(dataCell),
            patch: {
              source: "corp",
              c: c,
              relC: relC,
              corpMinC: corpSheet.minC,
              r: row.corpR,
              sheetName: corpSheet.name,
            },
          });
        }
      }
      if (feeSheet && row.feeR) {
        for (let c = 3; c <= feeSheet.maxC; c++) {
          const key = cellKey("fee", c);
          if (usedKeys.has(key)) continue;
          const headerCell = cellAt(feeSheet, 1, c);
          const dataCell = cellAt(feeSheet, row.feeR, c);
          const v = dataCell ? dataCell.v : null;
          if (!hasValue(v) && !includeEmpty) continue;
          usedKeys.add(key);
          extraFields.push({
            label:
              headerCell && hasValue(headerCell.v)
                ? String(headerCell.v)
                : ReviewGridCore.colLetter(c),
            v: v,
            source: "fee",
            c: c,
            bg: cellBgSoft(dataCell),
            patch: {
              source: "fee",
              c: c,
              relC: c,
              r: row.feeR,
              sheetName: feeSheet.name,
            },
          });
        }
      }
    }
    if (extraFields.length) sections.push({ title: "기타", fields: extraFields });

    const hasFields = sections.some(function (s) {
      return s.fields && s.fields.length;
    });
    if (!hasFields && row.cells) {
      return corpModalSectionsFromCells(row, options);
    }

    return sections;
  }

  function extractCorpModalDetail(sheet, rowNum, options) {
    options = options || {};
    const includeEmpty = !!options.includeEmpty;
    const headerRow = 2;
    const fields = [];
    const catalogC = new Set();

    CORP_TOGGLEABLE_COLS.forEach(function (col) {
      const absC = sheet.minC + (col.c - 1);
      catalogC.add(absC);
      const dataCell = cellAt(sheet, rowNum, absC);
      const v = dataCell ? dataCell.v : null;
      if (!hasValue(v) && !includeEmpty) return;
      fields.push({
        c: absC,
        label: formatCorpFeeColLabel(col),
        v: v,
      });
    });

    const maxC = effectiveMaxCol(sheet, rowNum);
    for (let c = sheet.minC; c <= maxC; c++) {
      if (catalogC.has(c)) continue;
      const headerCell = cellAt(sheet, headerRow, c);
      const dataCell = cellAt(sheet, rowNum, c);
      if (!hasValue(dataCell && dataCell.v)) continue;
      fields.push({
        c: c,
        label:
          headerCell && hasValue(headerCell.v)
            ? String(headerCell.v)
            : ReviewGridCore.colLetter(c),
        v: dataCell.v,
      });
    }

    return fields;
  }

  function extractFeeModalDetail(sheet, rowNum, options) {
    options = options || {};
    const includeEmpty = !!options.includeEmpty;
    const headerRow = 1;
    const fields = [];
    const catalogC = new Set();

    FEE_TOGGLEABLE_COLS.forEach(function (col) {
      catalogC.add(col.c);
      const dataCell = cellAt(sheet, rowNum, col.c);
      const v = dataCell ? dataCell.v : null;
      if (!hasValue(v) && !includeEmpty) return;
      fields.push({
        c: col.c,
        label: formatCorpFeeColLabel(col),
        v: v,
      });
    });

    const maxC = effectiveMaxCol(sheet, rowNum);
    for (let c = sheet.minC; c <= maxC; c++) {
      if (c === 1 || catalogC.has(c)) continue;
      const headerCell = cellAt(sheet, headerRow, c);
      const dataCell = cellAt(sheet, rowNum, c);
      if (!hasValue(dataCell && dataCell.v)) continue;
      fields.push({
        c: c,
        label:
          headerCell && hasValue(headerCell.v)
            ? String(headerCell.v)
            : ReviewGridCore.colLetter(c),
        v: dataCell.v,
      });
    }

    return fields;
  }

  function extractModalDetail(sheet, rowNum, kind, options, row, context) {
    if (row && row.isNew) {
      return extractStoredRowModalDetail(row, kind, options);
    }
    if (kind === "corp" && row && context) {
      const parsed = parseCorpListMode(context.corpListMode);
      if (parsed.type === "tax") {
        return extractCorpModalDetail(context.corpSheet || sheet, row.r, options);
      }
      if (parsed.type === "fee" && context.feeSheet) {
        return extractFeeModalDetail(context.feeSheet, row.feeR || row.r, options);
      }
      return extractMergedCorpModalDetail(
        row,
        context.corpSheet || sheet,
        context.feeSheet,
        Object.assign({}, options, { corpListMode: context.corpListMode || "corp-fee" })
      );
    }
    if (kind === "corp") return extractCorpModalDetail(sheet, rowNum, options);
    if (kind === "fee") return extractFeeModalDetail(sheet, rowNum, options);
    return extractIncomeModalDetail(sheet, rowNum, options, row);
  }

  function extractRowDetail(sheet, rowNum, kind) {
    const headerRow = kind === "corp" ? 2 : 1;
    const colDefs = kind === "corp" ? CORP_COLS : INCOME_COLS;
    const usedC = new Set();
    const primary = [];

    colDefs.forEach(function (col) {
      const absC = kind === "corp" ? sheet.minC + (col.c - 1) : col.c;
      usedC.add(absC);
      primary.push(buildDetailField(sheet, rowNum, headerRow, absC, col.label));
    });

    const other = [];
    for (let c = sheet.minC; c <= sheet.maxC; c++) {
      if (usedC.has(c)) continue;
      const headerCell = cellAt(sheet, headerRow, c);
      const dataCell = cellAt(sheet, rowNum, c);
      if (!hasValue(dataCell && dataCell.v)) continue;
      other.push({
        c: c,
        label:
          headerCell && hasValue(headerCell.v)
            ? String(headerCell.v)
            : ReviewGridCore.colLetter(c),
        v: dataCell.v,
        bg: dataCell && dataCell.bg ? ReviewGridCore.softenBg(dataCell.bg) : null,
      });
    }

    return { primary: primary, other: other };
  }

  function isClientRow(row) {
    return !row.rowKind || row.rowKind === "client";
  }

  function incomeClientMatchesQuery(row, sheet, query) {
    if (!query) return true;
    const q = query.toLowerCase();
    const cols = row.isConsult ? CONSULT_TOGGLEABLE_COLS : INCOME_TOGGLEABLE_COLS;
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i];
      const v = row.cells[col.c] && row.cells[col.c].v;
      if (hasValue(v) && String(v).toLowerCase().indexOf(q) >= 0) return true;
    }
    return false;
  }

  function filterIncomeClientRows(rows, sheet, query) {
    if (!query) return rows;
    return rows.filter(function (row) {
      return incomeClientMatchesQuery(row, sheet, query);
    });
  }

  function computePanelStats(incomeSheet, corpSheet, feeSheet, owner) {
    const incomeRows = incomeSheet ? buildIncomeClientRows(incomeSheet) : [];
    const corpListRows =
      corpSheet && owner
        ? buildCorpSheetClientRows(corpSheet, corpSheet, owner).filter(isClientRow)
        : [];
    const feeRows =
      feeSheet && owner ? buildFeeClientRowsForStaff(feeSheet, owner).filter(isClientRow) : [];
    const corpRows = corpSheet ? parseCorpRows(corpSheet) : [];
    const incomeClients = incomeRows.filter(isClientRow);
    let unpaid = 0;
    let notes = 0;
    incomeClients.forEach(function (row) {
      if (row.chips.indexOf("미수") >= 0) unpaid++;
      if (row.chips.indexOf("비고") >= 0) notes++;
    });
    return {
      income: incomeClients.length,
      corp: corpListRows.length,
      fee: feeRows.length,
      unpaid: unpaid,
      notes: notes,
      incomeRows: incomeRows,
      corpRows: corpRows,
      corpListRows: corpListRows,
      feeRows: feeRows,
    };
  }

  function rowMatchesQuery(row, columns, query) {
    if (!query) return true;
    const q = query.toLowerCase();
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const v = row.cells[col.c] && row.cells[col.c].v;
      if (hasValue(v) && String(v).toLowerCase().indexOf(q) >= 0) return true;
    }
    return false;
  }

  function filterRows(rows, columns, query) {
    if (!query) return rows;
    return rows.filter(function (row) {
      return rowMatchesQuery(row, columns, query);
    });
  }

  function panelMatchesQuery(stats, owner, query) {
    if (!query) return true;
    const q = query.toLowerCase();
    if (owner.toLowerCase().indexOf(q) >= 0) return true;
    const corpRows = (stats.feeRows || []).concat(stats.corpListRows || stats.corpRows || []);
    if (
      filterRows(stats.incomeRows, INCOME_TOGGLEABLE_COLS, query).length ||
      filterCorpClientRows(corpRows, query).length
    ) {
      return true;
    }
    return false;
  }

  function renderChips(chips) {
    const wrap = document.createElement("span");
    wrap.className = "row-chips";
    chips.forEach(function (label) {
      const span = document.createElement("span");
      span.className = "chip chip-" + label;
      span.textContent = label;
      wrap.appendChild(span);
    });
    return wrap;
  }

  function renderReadableTable(columns, rows, options) {
    options = options || {};
    const wrap = document.createElement("div");
    wrap.className = "readable-scroll" + (options.boardMode ? " readable-board" : "");
    const table = document.createElement("table");
    table.className = "readable-table";

    const thead = document.createElement("thead");
    const headTr = document.createElement("tr");
    columns.forEach(function (col, idx) {
      const th = document.createElement("th");
      th.textContent = col.label;
      if (col.highlight) th.classList.add("col-highlight");
      if (col.sticky) th.classList.add("sticky-col", "sticky-col-" + idx);
      headTr.appendChild(th);
    });
    const thChip = document.createElement("th");
    thChip.className = "col-chips";
    thChip.textContent = "";
    headTr.appendChild(thChip);
    thead.appendChild(headTr);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    if (!rows.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = columns.length + 1;
      td.className = "empty-row";
      td.textContent = "데이터 없음";
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      rows.forEach(function (row) {
        const tr = document.createElement("tr");
        tr.dataset.rowNum = String(row.r);
        if (options.boardMode && row.bg) {
          tr.classList.add("row-stripe");
          tr.style.boxShadow = "inset 4px 0 0 0 " + row.bg;
        } else if (row.bg) {
          tr.style.backgroundColor = row.bg;
        }
        if (options.onRowClick) {
          tr.classList.add("row-clickable");
          tr.title = "클릭하면 상단에 상세 정보";
          tr.addEventListener("click", function () {
            document.querySelectorAll(".readable-table tr.row-selected").forEach(function (el) {
              el.classList.remove("row-selected");
            });
            tr.classList.add("row-selected");
            options.onRowClick(row);
          });
        }
        columns.forEach(function (col, idx) {
          const td = document.createElement("td");
          const data = row.cells[col.c] || {};
          td.textContent = formatVal(data.v);
          if (data.bg) td.style.backgroundColor = data.bg;
          if (col.highlight) td.classList.add("col-highlight");
          if (col.sticky) td.classList.add("sticky-col", "sticky-col-" + idx);
          if (typeof data.v === "number" || col.c === 12 || col.c === 13 || col.c === 14 || col.c === 6)
            td.classList.add("num");
          if (col.wrap || col.c === 5 || col.c === 21) td.classList.add("wrap");
          if (hasValue(data.v)) {
            td.setAttribute("title", String(formatVal(data.v)));
            td.classList.add("has-cell-tooltip");
          }
          if (col.companyLink && hasValue(data.v)) td.classList.add("name-col");
          tr.appendChild(td);
        });
        const tdChip = document.createElement("td");
        tdChip.className = "col-chips";
        if (row.chips && row.chips.length) tdChip.appendChild(renderChips(row.chips));
        tr.appendChild(tdChip);
        tbody.appendChild(tr);
      });
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  function rowHasTcIncomplete(row) {
    const tc = row.cells[17] && row.cells[17].v;
    if (!hasValue(tc)) return true;
    const s = String(tc).trim();
    return s !== "O" && s.indexOf("O") < 0;
  }

  function isCheckChipValue(v) {
    if (!hasValue(v)) return false;
    const s = String(v).trim();
    return s === "O" || s === "X" || s === "△";
  }

  function extractSheetColorPalette(sheet) {
    const colors = new Set();
    if (!sheet || !Array.isArray(sheet.cells)) return [];
    sheet.cells.forEach(function (cell) {
      if (!cell.bg || typeof cell.bg !== "string") return;
      const hex = cell.bg.trim().toUpperCase();
      if (!hex || hex === "#FFFFFF" || hex === "#FFF") return;
      colors.add(hex);
    });
    return Array.from(colors).sort();
  }

  function resolveCorpNameColorPatch(row, context) {
    const parsed = parseCorpListMode((context && context.corpListMode) || "corp-fee");
    if (parsed.type === "tax") {
      const sheet = (context && (context.sheet || context.corpSheet)) || null;
      if (!sheet || !row || !row.r) return null;
      return {
        sheetName: sheet.name,
        r: row.r,
        c: sheet.minC,
        cellKeys: ["1", "corp:1"],
      };
    }
    const feeSheet = (context && (context.feeSheet || context.sheet)) || null;
    const feeR = row && row.feeR != null ? row.feeR : row && row.r;
    if (!feeSheet || !feeR) return null;
    return {
      sheetName: feeSheet.name,
      r: feeR,
      c: 2,
      cellKeys: ["2", "fee:2", "corp:1"],
    };
  }

  function extractCorpColorPalette(context) {
    const colors = new Set();
    if (!context) return [];
    const parsed = parseCorpListMode(context.corpListMode || "corp-fee");
    const sheets = [];
    if (parsed.type === "tax") {
      if (context.sheet) sheets.push(context.sheet);
      else if (context.corpSheet) sheets.push(context.corpSheet);
    } else {
      if (context.feeSheet) sheets.push(context.feeSheet);
      else if (context.sheet) sheets.push(context.sheet);
      if (context.corpSheet && context.corpSheet !== context.sheet) sheets.push(context.corpSheet);
    }
    sheets.forEach(function (sheet) {
      extractSheetColorPalette(sheet).forEach(function (color) {
        colors.add(color);
      });
    });
    return Array.from(colors).sort();
  }

  function formatPanelSummary(stats) {
    const parts = [];
    if (stats.income) parts.push("종소세 " + stats.income + "건");
    if (stats.fee) parts.push("조정료 " + stats.fee + "건");
    if (stats.corp) parts.push("법인 " + stats.corp + "건");
    if (stats.unpaid) parts.push("미수 " + stats.unpaid);
    if (stats.notes) parts.push("비고 " + stats.notes);
    return parts.length ? parts.join(" · ") : "0건";
  }

  const CORP_FEE_PRIOR_COLS = { 4: true, 5: true, 6: true };
  const CORP_FEE_CURRENT_COLS = { 7: true, 9: true, 10: true };

  function corpFeeYearScope(colOrField) {
    if (!colOrField) return null;
    let feeC = null;
    if (colOrField.key && String(colOrField.key).indexOf("fee:") === 0) {
      feeC = parseInt(String(colOrField.key).slice(4), 10);
    } else if (colOrField.source === "fee" && colOrField.c != null) {
      feeC = colOrField.c;
    } else if (colOrField.c != null && colOrField.source == null && !colOrField.key) {
      feeC = colOrField.c;
    }
    if (feeC == null || isNaN(feeC)) return null;
    if (CORP_FEE_PRIOR_COLS[feeC]) return "prior";
    if (CORP_FEE_CURRENT_COLS[feeC]) return "current";
    return null;
  }

  function formatCorpFeeColLabel(colOrField) {
    const base = colOrField && colOrField.label;
    if (!base) return base || "";
    const scope = corpFeeYearScope(colOrField);
    if (scope === "prior") return base + " · 전기";
    if (scope === "current") return base + " · 당기";
    return base;
  }

  window.ReviewReadable = {
    INCOME_COLS,
    INCOME_TOGGLEABLE_COLS,
    CORP_TOGGLEABLE_COLS,
    CORP_FEE_LIST_COLS,
    CORP_SHEET_LIST_COLS,
    CORP_MERGED_FIELD_GROUPS,
    FEE_TOGGLEABLE_COLS,
    FEE_STAFF_ORDER,
    CLIENT_LIST_COLS,
    LIST_DETAIL_EXCLUDE_COLS,
    LIST_COL_STORAGE_KEY,
    CORP_LIST_COL_STORAGE_KEY,
    FEE_LIST_COL_STORAGE_KEY,
    FEE_STAFF_FILTER_KEY,
    DETAIL_EMPHASIS_STORAGE_KEY,
    CORP_COLS,
    parseIncomeRows,
    buildIncomeClientRows,
    buildCorpClientRows,
    buildCorpSheetClientRows,
    buildFeeClientRows,
    buildFeeClientRowsForStaff,
    detectFeeSegments,
    parseCorpRows,
    extractRowDetail,
    extractListExcludedDetail,
    extractIncomeModalDetail,
    extractCorpModalDetail,
    extractFeeModalDetail,
    extractModalDetail,
    getColCatalog,
    incomeListKind,
    corpListKind,
    parseCorpListMode,
    corpTaxModeId,
    corpTaxChipLabel,
    getCorpTaxVersions,
    resolveIncomeListMode,
    getDefaultVisibleListCols,
    getVisibleListCols,
    setVisibleListCols,
    getListExcludedCols,
    getFeeStaffFilters,
    setFeeStaffFilters,
    isExcelEmphasisBg,
    getDetailEmphasisCatalog,
    getDetailEmphasisFields,
    setDetailEmphasisFields,
    toggleDetailEmphasisField,
    isDetailEmphasized,
    fieldIdForDetail,
    companyCellKey,
    rowHasUnpaid,
    colDefByNumber,
    colDefByKey,
    parseFieldKey,
    cellKey,
    normalizeCompanyName,
    coreCompanyName,
    companyLinkKey,
    scopedReviewKey,
    dedupeClientRowsByCompany,
    linkKeyFromName,
    rowHasTcIncomplete,
    isCheckChipValue,
    listColId,
    colDefForField,
    resolveFieldEditor,
    computePanelStats,
    filterRows,
    filterIncomeClientRows,
    filterCorpClientRows,
    filterFeeClientRows,
    incomeClientMatchesQuery,
    corpClientMatchesQuery,
    feeClientMatchesQuery,
    panelMatchesQuery,
    renderReadableTable,
    formatPanelSummary,
    corpFeeYearScope,
    formatCorpFeeColLabel,
    extractSheetColorPalette,
    resolveCorpNameColorPatch,
    extractCorpColorPalette,
    formatVal,
    formatShareRatio,
    parseShareRatioText,
    formatDetailVal,
    isClientRow,
    hasValue,
  };
})();
