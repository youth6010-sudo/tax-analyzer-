(function () {
  "use strict";

  let expandedRowR = null;
  let expandedHost = null;
  let expandedDetailBtn = null;
  let modalBackdrop = null;
  let modalDirty = false;

  function resetDetailButtons() {
    document.querySelectorAll(".client-detail-btn").forEach(function (btn) {
      btn.setAttribute("aria-expanded", "false");
      btn.classList.remove("active");
    });
  }

  function setDetailButton(btn, expanded) {
    if (!btn) return;
    btn.setAttribute("aria-expanded", expanded ? "true" : "false");
    btn.classList.toggle("active", expanded);
  }

  function removeTableExpandRow(host) {
    const next = host && host.nextElementSibling;
    if (next && next.classList.contains("client-expand-row")) {
      next.remove();
    }
  }

  function closeModal() {
    if (modalBackdrop) {
      modalBackdrop.remove();
      modalBackdrop = null;
    }
    document.body.classList.remove("client-detail-modal-open");
    if (expandedHost && expandedHost.tagName === "TR") {
      expandedHost.classList.remove("client-row-expanded");
    }
    if (expandedDetailBtn) setDetailButton(expandedDetailBtn, false);
    const shouldRerender = modalDirty;
    modalDirty = false;
    expandedRowR = null;
    expandedHost = null;
    expandedDetailBtn = null;
    return shouldRerender;
  }

  function collapseAll() {
    const shouldRerender = closeModal();
    document.querySelectorAll(".client-expand-row").forEach(function (el) {
      el.remove();
    });
    document.querySelectorAll(".portal-expand-panel").forEach(function (el) {
      el.remove();
    });
    document.querySelectorAll(".portal-row-expanded, .portal-footer-expanded, .client-row-expanded").forEach(function (el) {
      el.classList.remove("portal-row-expanded", "portal-footer-expanded", "client-row-expanded");
      el.removeAttribute("aria-expanded");
    });
    resetDetailButtons();
    expandedRowR = null;
    expandedHost = null;
    expandedDetailBtn = null;
    return shouldRerender;
  }

  function collapseHost(host) {
    if (!host) return false;
    if (host.tagName === "TR" && modalBackdrop) {
      const ctx = host._expandContext;
      const rerender = closeModal();
      if (rerender && ctx && ctx.onRerender) ctx.onRerender();
      return true;
    }
    if (host.tagName === "TR") {
      removeTableExpandRow(host);
      setDetailButton(host.querySelector(".client-detail-btn"), false);
    } else {
      const panel = host.querySelector(".portal-expand-panel");
      if (panel) panel.remove();
    }
    host.classList.remove("portal-row-expanded", "portal-footer-expanded", "client-row-expanded");
    host.removeAttribute("aria-expanded");
    if (expandedHost === host) {
      expandedRowR = null;
      expandedHost = null;
      expandedDetailBtn = null;
    }
    return false;
  }

  function editable(context) {
    return context.canEdit && !context.readOnly;
  }

  function listColForField(field, context) {
    const kind = context.kind || "income";
    if (kind === "corp") {
      return field.c - context.sheet.minC + 1;
    }
    return field.c;
  }

  function fieldCellKey(field, context) {
    const kind = context.kind || "income";
    if (kind !== "corp" || !field.patch) {
      return kind === "corp" && context.corpSheet
        ? field.c - context.corpSheet.minC + 1
        : field.c;
    }
    if (field.patch.source === "corp") {
      const rel =
        field.patch.relC != null
          ? field.patch.relC
          : context.corpSheet
            ? field.patch.c - context.corpSheet.minC + 1
            : field.patch.c;
      return ReviewReadable.cellKey("corp", rel);
    }
    return ReviewReadable.cellKey("fee", field.patch.c);
  }

  function syncListCell(row, field, text, context) {
    if (!expandedHost || expandedHost.tagName !== "TR") return;
    const tr = expandedHost;
    const kind = context.kind || "income";
    const listKind =
      kind === "income"
        ? ReviewReadable.incomeListKind(context.listMode || "income")
        : kind;
    const cols = ReviewReadable.getVisibleListCols(listKind);
    const listCol =
      field.patch && field.patch.isNewRow
        ? field.patch.cellKey
        : kind === "corp"
          ? fieldCellKey(field, context)
          : listColForField(field, context);
    let colIndex = -1;
    for (let i = 0; i < cols.length; i++) {
      const colId = ReviewReadable.listColId(cols[i]);
      if (colId === listCol || cols[i].c === listCol) {
        colIndex = i;
        break;
      }
    }
    if (colIndex < 0) return;
    const offset = kind === "income" || kind === "corp" ? 1 : 0;
    const td = tr.children[colIndex + offset];
    if (!td) return;
    const parsed = ReviewGridEdit.parseCellValue(text);
    const display = ReviewReadable.hasValue(parsed) ? ReviewReadable.formatVal(parsed) : "—";
    td.textContent = display;
    td.classList.toggle("is-empty", !ReviewReadable.hasValue(parsed));
    const cellKey = typeof listCol === "string" ? listCol : listCol;
    if (kind === "income" && listCol === 18) {
      if (!row.cells[18]) row.cells[18] = {};
      row.cells[18].v = parsed;
      td.classList.toggle("cell-unpaid", ReviewReadable.rowHasUnpaid(row));
    }
    if (!row.cells[cellKey]) row.cells[cellKey] = {};
    row.cells[cellKey].v = parsed;
  }

  function commitFieldEdit(row, field, rawText, context) {
    const patch = field.patch;
    if (!patch) return;
    const parsed = ReviewGridEdit.parseCellValue(rawText);
    if (patch && patch.isNewRow) {
      ReviewGridEdit.updateNewRowField(patch.newRowId, patch.cellKey, parsed);
      const kind = context.kind || "income";
      const key = patch.cellKey;
      if (!row.cells[key]) row.cells[key] = {};
      row.cells[key].v = parsed;
      field.v = parsed;
      syncListCell(row, field, rawText, context);
      if (context.onPatch) context.onPatch();
      return;
    }
    const sheetName = patch.sheetName || (context.sheet && context.sheet.name);
    if (!sheetName) return;
    const r = patch ? patch.r : row.r;
    const c = patch ? patch.c : field.c;
    ReviewGridEdit.applyFieldEdit(sheetName, r, c, rawText, context.onPatch);
    const kind = context.kind || "income";
    const key =
      field.patch || kind === "corp"
        ? fieldCellKey(field, context)
        : listColForField(field, context);
    if (!row.cells[key]) row.cells[key] = {};
    row.cells[key].v = parsed;
    field.v = parsed;
    syncListCell(row, field, rawText, context);
    if (context.onPatch) context.onPatch();
  }

  function renderModalSections(sections, row, context) {
    const wrap = document.createElement("div");
    wrap.className = "modal-detail-sections";
    sections.forEach(function (section) {
      const sec = document.createElement("section");
      sec.className = "modal-detail-section";
      const h3 = document.createElement("h3");
      h3.className = "modal-detail-section-title";
      h3.textContent = section.title;
      sec.appendChild(h3);
      sec.appendChild(renderFieldGrid(section.fields, row, context, true));
      wrap.appendChild(sec);
    });
    return wrap;
  }

  function formatShareholderDisplay(colKey, val) {
    if (!ReviewReadable.hasValue(val)) return "—";
    if (colKey === "ratio") return ReviewReadable.formatShareRatio(val);
    if (typeof val === "number") return ReviewReadable.formatVal(val);
    return String(val);
  }

  function shareholderInputValue(colKey, val) {
    if (!ReviewReadable.hasValue(val)) return "";
    if (colKey === "ratio") return ReviewReadable.formatShareRatio(val);
    return String(val);
  }

  function normalizeShareholderRaw(colKey, rawText) {
    if (colKey !== "ratio") return (rawText || "").trim();
    return ReviewReadable.parseShareRatioText(rawText);
  }

  function commitShareholderEdit(row, sh, colKey, rawText, context) {
    const sheet = context.corpFullSheet;
    if (!sheet || !sh.cols || sh.cols[colKey] == null) return;
    const sheetName = sh.sheetName || sheet.name;
    const normalized = normalizeShareholderRaw(colKey, rawText);
    ReviewGridEdit.applyFieldEdit(sheetName, sh.r, sh.cols[colKey], normalized, context.onPatch);
    sh[colKey] = ReviewGridEdit.parseCellValue(normalized);
    modalDirty = true;
    if (context.onPatch) context.onPatch();
  }

  function renderShareholderCell(row, sh, colKey, val, context, canEdit) {
    const td = document.createElement("td");
    const numeric = colKey !== "shareholder" && colKey !== "resolution";
    if (numeric) td.className = "num";

    if (canEdit) {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "shareholder-cell-input" + (numeric ? " field-num-input" : "");
      if (numeric) input.inputMode = "decimal";
      input.value = shareholderInputValue(colKey, val);
      input.setAttribute("spellcheck", "false");
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          input.blur();
        }
      });
      input.addEventListener("blur", function () {
        commitShareholderEdit(row, sh, colKey, input.value, context);
        input.value = shareholderInputValue(colKey, sh[colKey]);
      });
      td.appendChild(input);
      return td;
    }

    td.textContent = formatShareholderDisplay(colKey, val);
    return td;
  }

  function renderShareholderSection(row, context) {
    context = context || {};
    if (!row.shareholders || !row.shareholders.length) return null;
    const canEdit = editable(context) && context.corpFullSheet;
    const sec = document.createElement("section");
    sec.className = "modal-detail-section modal-shareholder-section";
    const h3 = document.createElement("h3");
    h3.className = "modal-detail-section-title";
    h3.textContent = "지분 · 배당";
    sec.appendChild(h3);

    const table = document.createElement("table");
    table.className = "shareholder-table";
    const thead = document.createElement("thead");
    const headTr = document.createElement("tr");
    ["주주명", "지분", "지분율", "배당금액", "실지급액", "주총결의"].forEach(function (label) {
      const th = document.createElement("th");
      th.textContent = label;
      headTr.appendChild(th);
    });
    thead.appendChild(headTr);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    const colKeys = ["shareholder", "share", "ratio", "dividend", "paid", "resolution"];
    row.shareholders.forEach(function (sh) {
      const tr = document.createElement("tr");
      colKeys.forEach(function (colKey) {
        tr.appendChild(renderShareholderCell(row, sh, colKey, sh[colKey], context, canEdit));
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    sec.appendChild(table);
    return sec;
  }

  function isModalSections(detail) {
    return detail.length && detail[0] && detail[0].title && detail[0].fields;
  }

  function renderReadOnlyValue(field, modalMode) {
    const value = document.createElement("div");
    value.className = "portal-data portal-expand-value";
    if (typeof field.v === "number") value.classList.add("is-num");
    value.textContent = ReviewReadable.formatDetailVal(field.v);
    if (!modalMode && field.bg) value.style.backgroundColor = field.bg;
    return value;
  }

  function renderFieldCard(field, row, context, modalMode) {
    const kind = context.kind || "income";
    const card = document.createElement("div");
    card.className = "portal-expand-field" + (modalMode ? " modal-field" : "");
    if (!ReviewReadable.hasValue(field.v)) card.classList.add("is-empty");
    if (modalMode && ReviewReadable.isDetailEmphasized(field, kind, context)) {
      card.classList.add("modal-field-emphasis");
    }

    const label = document.createElement("div");
    label.className = "portal-field-label";
    label.textContent =
      kind === "corp" ? ReviewReadable.formatCorpFeeColLabel(field) : field.label;
    card.appendChild(label);

    if (modalMode) {
      card.title = ReviewReadable.isExcelEmphasisBg(field.bg)
        ? "엑셀 노란 배경으로 강조됨"
        : "더블클릭하여 강조 표시";
      card.addEventListener("dblclick", function (e) {
        if (e.target.closest(".portal-expand-value") || e.target.closest(".field-num-input")) return;
        if (ReviewReadable.isExcelEmphasisBg(field.bg)) return;
        e.preventDefault();
        const emphasized = ReviewReadable.toggleDetailEmphasisField(field, kind);
        card.classList.toggle("modal-field-emphasis", emphasized);
      });
    }

    const canEditModal = editable(context) && modalMode && field.patch;

    if (canEditModal) {
      const colKind =
        kind === "income"
          ? ReviewReadable.incomeListKind(context.listMode || "income")
          : kind;
      const colDef = ReviewReadable.colDefForField(field, colKind, context.sheet);
      const editor = ReviewReadable.resolveFieldEditor(colDef);
      if (editor.kind === "number") {
        card.appendChild(renderNumberInput(field, row, context));
      } else {
        card.appendChild(renderTextInput(field, row, context));
      }
    } else {
      card.appendChild(renderReadOnlyValue(field, modalMode));
    }

    return card;
  }

  function renderNumberInput(field, row, context) {
    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "decimal";
    input.className = "portal-data portal-expand-value field-num-input";
    input.value = ReviewReadable.hasValue(field.v) ? String(field.v) : "";
    input.setAttribute("spellcheck", "false");
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        input.blur();
      }
    });
    input.addEventListener("blur", function () {
      const text = input.value || "";
      commitFieldEdit(row, field, text, context);
      const card = input.closest(".portal-expand-field");
      if (card) {
        card.classList.toggle("is-empty", !ReviewReadable.hasValue(field.v));
      }
    });
    return input;
  }

  function renderTextInput(field, row, context) {
    const value = document.createElement("div");
    value.className = "portal-data portal-expand-value cell-editable";
    value.contentEditable = "true";
    value.setAttribute("spellcheck", "false");
    value.textContent = ReviewReadable.hasValue(field.v) ? String(field.v) : "";
    value.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        value.blur();
      }
    });
    value.addEventListener("blur", function () {
      const text = value.textContent || "";
      commitFieldEdit(row, field, text, context);
      const card = value.closest(".portal-expand-field");
      if (card) {
        card.classList.toggle("is-empty", !ReviewReadable.hasValue(field.v));
      }
    });
    return value;
  }

  function renderFieldGrid(fields, row, context, modalMode) {
    const grid = document.createElement("div");
    grid.className = "portal-expand-grid" + (modalMode ? " modal-detail-grid" : "");
    fields.forEach(function (field) {
      if (!ReviewReadable.hasValue(field.v) && !(editable(context) && field.patch)) return;
      grid.appendChild(renderFieldCard(field, row, context, modalMode));
    });
    return grid;
  }

  function renderMiniRowEditor(host, row, context) {
    const existing = host.querySelector(".portal-expand-mini-grid");
    if (existing) {
      existing.remove();
      return;
    }

    const wrap = document.createElement("div");
    wrap.className = "portal-expand-mini-grid section-grid";
    ReviewGridCore.renderSheet(context.sheet, wrap, {
      readOnly: true,
      rowFilter: function (r) {
        return r === row.r;
      },
    });
    const table = wrap.querySelector("table");
    if (table) ReviewGridEdit.enableEditOnTable(table, context.sheet.name, true, context.onPatch);
    host.appendChild(wrap);
  }

  function modalTitle(row, context) {
    const kind = context.kind || "income";
    const parts = [];
    if (kind === "income") {
      const name = row.cells[3] && row.cells[3].v;
      const company = row.cells[4] && row.cells[4].v;
      if (ReviewReadable.hasValue(name)) parts.push(String(name));
      if (ReviewReadable.hasValue(company) && String(company) !== String(name)) parts.push(String(company));
    } else {
      const company =
        (row.cells["fee:2"] && row.cells["fee:2"].v) ||
        (row.cells["corp:1"] && row.cells["corp:1"].v) ||
        (row.cells[2] && row.cells[2].v);
      if (ReviewReadable.hasValue(company)) parts.push(String(company));
    }
    if (!parts.length) parts.push("상세 정보");
    const meta = [context.owner, row.sectionLabel, row.isTransfer ? "이관/폐업" : null]
      .filter(Boolean)
      .join(" · ");
    return { title: parts.join(" · "), meta: meta };
  }

  function closeSettingsPanels() {
    document.querySelectorAll(".list-col-settings-panel").forEach(function (panel) {
      panel.hidden = true;
      panel.classList.remove("is-fixed");
    });
    document.querySelectorAll(".list-col-settings-btn").forEach(function (btn) {
      btn.setAttribute("aria-expanded", "false");
      btn.classList.remove("active");
    });
  }

  function renderNameColorPalette(row, context) {
    const kind = context.kind || "income";
    let palette = [];
    let patchTarget = null;
    let cellKeys = [];

    if (kind === "income") {
      if (!context.sheet) return null;
      palette = ReviewReadable.extractSheetColorPalette(context.sheet);
      patchTarget = { sheetName: context.sheet.name, r: row.r, c: 3 };
      cellKeys = ["3"];
    } else if (kind === "corp") {
      patchTarget = ReviewReadable.resolveCorpNameColorPatch(row, context);
      if (!patchTarget) return null;
      palette = ReviewReadable.extractCorpColorPalette(context);
      cellKeys = patchTarget.cellKeys || [];
    } else {
      return null;
    }

    const wrap = document.createElement("div");
    wrap.className = "name-color-palette";
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "이름표 색상");

    function applyAccent(color, rawBg) {
      const softened = color ? ReviewGridCore.softenBg(color) : null;
      row.rowAccent = softened;
      row.bg = softened;
      cellKeys.forEach(function (key) {
        if (row.cells[key]) row.cells[key].bg = rawBg || null;
      });
      modalDirty = true;
      if (context.onPatch) context.onPatch();
      wrap.querySelectorAll(".name-color-swatch").forEach(function (btn) {
        btn.classList.remove("active");
      });
    }

    const noneBtn = document.createElement("button");
    noneBtn.type = "button";
    noneBtn.className =
      "name-color-swatch name-color-swatch--none" + (!row.rowAccent ? " active" : "");
    noneBtn.title = "없음";
    noneBtn.addEventListener("click", function () {
      ReviewGridEdit.upsertPatch(patchTarget.sheetName, patchTarget.r, patchTarget.c, undefined, null);
      applyAccent(null, null);
      noneBtn.classList.add("active");
    });
    wrap.appendChild(noneBtn);

    palette.forEach(function (color) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "name-color-swatch";
      btn.style.backgroundColor = color;
      btn.title = color;
      if (row.rowAccent && ReviewGridCore.softenBg(color) === row.rowAccent) {
        btn.classList.add("active");
      }
      btn.addEventListener("click", function () {
        ReviewGridEdit.upsertPatch(patchTarget.sheetName, patchTarget.r, patchTarget.c, undefined, color);
        applyAccent(color, color);
        btn.classList.add("active");
      });
      wrap.appendChild(btn);
    });

    return wrap;
  }

  function openModal(row, context, detailBtn, hostEl) {
    if (ReviewGridEdit.isBoardEditMode && ReviewGridEdit.isBoardEditMode()) return;
    closeModal();
    closeSettingsPanels();
    modalDirty = false;
    expandedRowR = row.r;
    expandedHost = hostEl;
    expandedDetailBtn = detailBtn;
    hostEl._expandContext = context;

    setDetailButton(detailBtn, true);
    hostEl.classList.add("client-row-expanded");

    const detail = ReviewReadable.extractModalDetail(
      context.sheet,
      row.r,
      context.kind || "income",
      { includeEmpty: editable(context) },
      row,
      context
    );

    const backdrop = document.createElement("div");
    backdrop.className = "client-detail-modal-backdrop";
    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop) {
        const rerender = collapseHost(hostEl);
        if (rerender && context.onRerender) context.onRerender();
      }
    });

    const dialog = document.createElement("div");
    dialog.className = "client-detail-modal" + (context.kind === "corp" ? " client-detail-modal--corp" : "");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "client-detail-modal-title");

    const head = document.createElement("header");
    head.className = "client-detail-modal-head";

    const headText = document.createElement("div");
    headText.className = "client-detail-modal-head-text";
    const titles = modalTitle(row, context);
    const h2 = document.createElement("h2");
    h2.id = "client-detail-modal-title";
    h2.className = "client-detail-modal-title";
    h2.textContent = titles.title;
    headText.appendChild(h2);
    if (titles.meta) {
      const sub = document.createElement("p");
      sub.className = "client-detail-modal-meta";
      sub.textContent = titles.meta;
      headText.appendChild(sub);
    }
    head.appendChild(headText);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "client-detail-modal-close";
    closeBtn.setAttribute("aria-label", "닫기");
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", function () {
      const rerender = collapseHost(hostEl);
      if (rerender && context.onRerender) context.onRerender();
    });
    head.appendChild(closeBtn);
    dialog.appendChild(head);

    if ((context.kind === "income" || context.kind === "corp") && editable(context)) {
      const palette = renderNameColorPalette(row, context);
      if (palette) {
        const paletteWrap = document.createElement("div");
        paletteWrap.className = "client-detail-modal-palette";
        const paletteLabel = document.createElement("span");
        paletteLabel.className = "name-color-palette-label";
        paletteLabel.textContent = "이름표 색상";
        paletteWrap.appendChild(paletteLabel);
        paletteWrap.appendChild(palette);
        dialog.appendChild(paletteWrap);
      }
    }

    const body = document.createElement("div");
    body.className = "client-detail-modal-body";
    if (isModalSections(detail)) {
      body.appendChild(renderModalSections(detail, row, context));
      const shSec = renderShareholderSection(row, context);
      if (shSec) body.appendChild(shSec);
    } else if (detail.length) {
      body.appendChild(renderFieldGrid(detail, row, context, true));
    } else {
      const empty = document.createElement("p");
      empty.className = "portal-expand-empty";
      empty.textContent = "표시할 항목 없음";
      body.appendChild(empty);
    }
    dialog.appendChild(body);

    const foot = document.createElement("footer");
    foot.className = "client-detail-modal-foot";
    foot.textContent = editable(context)
      ? "항목을 클릭해 수정합니다. 항목을 더블클릭하면 강조 표시됩니다. 변경 사항은 자동 저장됩니다."
      : "항목을 더블클릭하면 강조 표시됩니다.";
    dialog.appendChild(foot);

    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);
    document.body.classList.add("client-detail-modal-open");
    modalBackdrop = backdrop;
    closeBtn.focus();
  }

  function renderExpandPanel(row, context) {
    const panel = document.createElement("div");
    panel.className = "portal-expand-panel";
    const kind = context.kind || "income";
    const useListDetail = !!context.useListDetail;
    const visibleCols = context.visibleListCols || ReviewReadable.getVisibleListCols(kind);
    const fields = useListDetail
      ? ReviewReadable.extractListExcludedDetail(
          context.sheet,
          row.r,
          kind,
          ReviewReadable.getListExcludedCols(visibleCols, kind)
        )
      : null;
    const detail = fields
      ? { primary: [], other: fields }
      : ReviewReadable.extractRowDetail(context.sheet, row.r, kind);

    const head = document.createElement("div");
    head.className = "portal-expand-head";
    const headText = document.createElement("span");
    headText.className = "portal-expand-head-text";
    headText.textContent = [context.owner, row.sectionLabel || context.sectionTitle, row.r + "행"]
      .filter(Boolean)
      .join(" · ");
    head.appendChild(headText);

    if (editable(context) && !useListDetail) {
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "portal-btn-secondary portal-expand-edit-btn";
      editBtn.textContent = "이 행 엑셀 편집";
      editBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        renderMiniRowEditor(panel, row, context);
      });
      head.appendChild(editBtn);
    }
    panel.appendChild(head);

    if (useListDetail) {
      const visible = detail.other.filter(function (f) {
        return ReviewReadable.hasValue(f.v) || editable(context);
      });
      if (visible.length) {
        panel.appendChild(renderFieldGrid(visible, row, context, false));
      } else {
        const empty = document.createElement("p");
        empty.className = "portal-expand-empty";
        empty.textContent = "추가 항목 없음";
        panel.appendChild(empty);
      }
    } else {
      const primaryVisible = detail.primary.filter(function (f) {
        return ReviewReadable.hasValue(f.v) || editable(context);
      });
      if (primaryVisible.length) {
        const section = document.createElement("section");
        section.className = "portal-expand-section";
        const title = document.createElement("h4");
        title.className = "portal-expand-section-title";
        title.textContent = "주요 항목";
        section.appendChild(title);
        section.appendChild(renderFieldGrid(primaryVisible, row, context, false));
        panel.appendChild(section);
      }

      if (detail.other.length) {
        const more = document.createElement("details");
        more.className = "portal-expand-more";
        const summary = document.createElement("summary");
        summary.textContent = "기타 열 " + detail.other.length + "개";
        more.appendChild(summary);
        more.appendChild(renderFieldGrid(detail.other, row, context, false));
        panel.appendChild(more);
      }
    }

    return panel;
  }

  function toggle(row, hostEl, context, detailBtn) {
    if (!hostEl || !context || !context.sheet) return;
    if (ReviewGridEdit.isBoardEditMode && ReviewGridEdit.isBoardEditMode()) return;

    const btn = detailBtn || (hostEl.tagName === "TR" ? hostEl.querySelector(".client-detail-btn") : null);
    const useModal = context.useListDetail && hostEl.tagName === "TR";

    if (expandedRowR === row.r && expandedHost === hostEl) {
      const rerender = collapseHost(hostEl);
      if (rerender && context.onRerender) context.onRerender();
      return;
    }

    const needsRefresh = collapseAll();

    if (useModal) {
      if (needsRefresh && context.onRerender) context.onRerender();
      const tr = document.querySelector('.client-list-table tr[data-row-num="' + row.r + '"]');
      const openBtn = (tr && tr.querySelector(".client-detail-btn")) || btn;
      const openHost = tr || hostEl;
      openModal(row, context, openBtn, openHost);
      return;
    }

    expandedRowR = row.r;
    expandedHost = hostEl;
    expandedDetailBtn = btn || null;

    if (hostEl.tagName === "TR") {
      hostEl.classList.add("client-row-expanded");
      setDetailButton(btn, true);
      const expandTr = document.createElement("tr");
      expandTr.className = "client-expand-row";
      expandTr.dataset.expandFor = String(row.r);
      const td = document.createElement("td");
      td.colSpan =
        hostEl.children.length ||
        ReviewReadable.getVisibleListCols(context.kind || "income").length +
          (context.kind === "income" || context.kind === "corp" ? 2 : 1);
      td.appendChild(renderExpandPanel(row, context));
      expandTr.appendChild(td);
      hostEl.parentNode.insertBefore(expandTr, hostEl.nextSibling);
      return;
    }

    hostEl.setAttribute("aria-expanded", "true");
    hostEl.classList.add(
      hostEl.classList.contains("portal-footer-line") ? "portal-footer-expanded" : "portal-row-expanded"
    );
    hostEl.appendChild(renderExpandPanel(row, context));
  }

  function bindEscape() {
    if (document.body.dataset.expandEscapeBound) return;
    document.body.dataset.expandEscapeBound = "1";
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (modalBackdrop && expandedHost) {
        const ctx = expandedHost._expandContext;
        const rerender = collapseHost(expandedHost);
        if (rerender && ctx && ctx.onRerender) ctx.onRerender();
        return;
      }
      collapseAll();
    });
  }

  bindEscape();

  window.ReviewRowExpand = {
    toggle: toggle,
    openModal: openModal,
    collapseAll: collapseAll,
    closeModal: closeModal,
  };
})();
