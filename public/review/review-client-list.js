(function () {
  "use strict";

  function filterClientRows(rows, checkedKinds) {
    if (!checkedKinds || !checkedKinds.length) {
      return { rows: [], filterEmpty: true };
    }
    const set = new Set(checkedKinds);
    return {
      rows: rows.filter(function (row) {
        return set.has(row.filterKey);
      }),
      filterEmpty: false,
    };
  }

  function filterFeeStaffRows(rows, checkedStaff) {
    if (!checkedStaff || !checkedStaff.length) {
      return { rows: [], filterEmpty: true };
    }
    const set = new Set(checkedStaff);
    return {
      rows: rows.filter(function (row) {
        return set.has(row.filterKey);
      }),
      filterEmpty: false,
    };
  }

  function renderIncomeMainFilterBar(sections, owner, checkedKinds, onChange) {
    const available = ReviewGridSections.getIncomeMainFilterKinds(sections);
    const bar = document.createElement("div");
    bar.className = "category-filter-bar";
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", "구분 필터");

    available.forEach(function (kind) {
      const label = document.createElement("label");
      label.className = "category-filter-chip";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.className = "category-filter-input";
      input.value = kind.key;
      input.checked = checkedKinds.indexOf(kind.key) >= 0;
      input.addEventListener("change", function () {
        const next = [];
        bar.querySelectorAll(".category-filter-input").forEach(function (el) {
          if (el.checked) next.push(el.value);
        });
        ReviewGridSections.setIncomeFilters(owner, next);
        onChange(next);
      });

      const text = document.createElement("span");
      text.className = "category-filter-label";
      text.textContent = kind.label;

      label.appendChild(input);
      label.appendChild(text);
      bar.appendChild(label);
    });

    return bar;
  }

  function renderFilterBar(sections, owner, checkedKinds, onChange) {
    const available = ReviewGridSections.getAvailableFilterKinds(sections);
    const bar = document.createElement("div");
    bar.className = "category-filter-bar";
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", "구분 필터");

    available.forEach(function (kind) {
      const label = document.createElement("label");
      label.className = "category-filter-chip";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.className = "category-filter-input";
      input.value = kind.key;
      input.checked = checkedKinds.indexOf(kind.key) >= 0;
      input.addEventListener("change", function () {
        const next = [];
        bar.querySelectorAll(".category-filter-input").forEach(function (el) {
          if (el.checked) next.push(el.value);
        });
        ReviewGridSections.setIncomeFilters(owner, next);
        onChange(next);
      });

      const text = document.createElement("span");
      text.className = "category-filter-label";
      text.textContent = kind.label;

      label.appendChild(input);
      label.appendChild(text);
      bar.appendChild(label);
    });

    return bar;
  }

  function renderFeeStaffFilterBar(checkedStaff, onChange) {
    const bar = document.createElement("div");
    bar.className = "category-filter-bar";
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", "담당자 필터");

    ReviewReadable.FEE_STAFF_ORDER.forEach(function (staff) {
      const label = document.createElement("label");
      label.className = "category-filter-chip";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.className = "category-filter-input";
      input.value = staff;
      input.checked = checkedStaff.indexOf(staff) >= 0;
      input.addEventListener("change", function () {
        const next = [];
        bar.querySelectorAll(".category-filter-input").forEach(function (el) {
          if (el.checked) next.push(el.value);
        });
        ReviewReadable.setFeeStaffFilters(next);
        onChange(next);
      });

      const text = document.createElement("span");
      text.className = "category-filter-label";
      text.textContent = staff;

      label.appendChild(input);
      label.appendChild(text);
      bar.appendChild(label);
    });

    return bar;
  }

  function buildListToolbar(kind, onRefresh, filterBar, options) {
    const toolbar = document.createElement("div");
    toolbar.className = "client-list-toolbar";

    if (filterBar) {
      const filterRow = document.createElement("div");
      filterRow.className = "client-list-toolbar-row client-list-toolbar-row--filter";
      filterRow.appendChild(filterBar);
      toolbar.appendChild(filterRow);
    }

    if (kind === "corp" && options.onCorpListModeChange) {
      const corpRow = document.createElement("div");
      corpRow.className = "client-list-toolbar-row client-list-toolbar-row--corp-mode";
      corpRow.dataset.corpModeRow = "true";
      const modes = [{ id: "corp-fee", label: "조정료" }];
      (options.corpTaxVersions || ReviewReadable.getCorpTaxVersions(null)).forEach(function (ver) {
        modes.push({
          id: ReviewReadable.corpTaxModeId(ver.id),
          label: ReviewReadable.corpTaxChipLabel(ver.id),
        });
      });
      modes.forEach(function (item) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.dataset.corpMode = item.id;
        btn.className =
          "view-mode-chip" + (options.corpListMode === item.id ? " active" : "");
        btn.textContent = item.label;
        btn.addEventListener("click", function () {
          options.onCorpListModeChange(item.id);
        });
        corpRow.appendChild(btn);
      });
      toolbar._corpModeRow = corpRow;
      toolbar.appendChild(corpRow);
    }

    const legend = document.createElement("details");
    legend.className = "list-color-legend";
    const sum = document.createElement("summary");
    sum.textContent = "구분 배지 설명";
    legend.appendChild(sum);
    const list = document.createElement("p");
    list.className = "list-color-legend-text";
    list.textContent =
      "기장 · 성실 · 신고 · 업체 · 이관/폐업 · 상담 — 엑셀 구간별 분류입니다. 행 왼쪽 색 띠는 엑셀 행 색을 반영합니다.";
    legend.appendChild(list);
    toolbar.appendChild(legend);

    const settingsRow = document.createElement("div");
    settingsRow.className = "client-list-toolbar-row client-list-toolbar-row--settings";
    if (window.ReviewAddClient && options) {
      const addBtn = ReviewAddClient.renderAddClientButton(
        Object.assign({}, options, { kind: kind, onRerender: onRefresh })
      );
      if (addBtn) settingsRow.appendChild(addBtn);
    }
    if (settingsRow.childNodes.length) toolbar.appendChild(settingsRow);

    return toolbar;
  }

  function setCellDisplay(td, data, col, kind) {
    const v = data.v;
    if (ReviewReadable.isCheckChipValue(v)) {
      const span = document.createElement("span");
      const s = String(v).trim();
      span.className = "check-chip check-chip--" + (s === "△" ? "tri" : s.toLowerCase());
      span.textContent = s;
      td.appendChild(span);
      return null;
    }
    const text = ReviewReadable.hasValue(v) ? ReviewReadable.formatVal(v) : "—";
    td.textContent = text;
    return text;
  }

  function attachCellTooltip(td, text, col, listKind) {
    if (!text || text === "—") return;
    const str = String(text);
    const alwaysTooltip = listKind === "corp-sheet";
    if (alwaysTooltip || (col && col.wrap) || str.length > 24) {
      td.setAttribute("title", str);
      td.classList.add("has-cell-tooltip");
    }
  }

  function formatShareholderInline(val, key) {
    if (!ReviewReadable.hasValue(val)) return "—";
    if (key === "ratio") return ReviewReadable.formatShareRatio(val);
    if (typeof val === "number") return ReviewReadable.formatVal(val);
    return String(val);
  }

  function renderShareholderPreviewRow(row, colCount) {
    const tr = document.createElement("tr");
    tr.className = "shareholder-inline-row";
    const td = document.createElement("td");
    td.colSpan = colCount;
    const table = document.createElement("table");
    table.className = "shareholder-inline-table";
    const thead = document.createElement("thead");
    const headTr = document.createElement("tr");
    ["주주명", "지분", "지분율"].forEach(function (label) {
      const th = document.createElement("th");
      th.textContent = label;
      headTr.appendChild(th);
    });
    thead.appendChild(headTr);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    const keys = ["shareholder", "share", "ratio"];
    row.shareholders.forEach(function (sh) {
      const shTr = document.createElement("tr");
      keys.forEach(function (key) {
        const shTd = document.createElement("td");
        shTd.textContent = formatShareholderInline(sh[key], key);
        if (key === "share" || key === "ratio") shTd.classList.add("num");
        shTr.appendChild(shTd);
      });
      tbody.appendChild(shTr);
    });
    table.appendChild(tbody);
    td.appendChild(table);
    tr.appendChild(td);
    return tr;
  }

  function attachShareholderToggle(btn, dataTr, row, colCount) {
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-label", "지분 " + row.shareholders.length + "명 펼치기");
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      const next = dataTr.nextElementSibling;
      const isOpen = next && next.classList.contains("shareholder-inline-row");
      if (isOpen) {
        next.remove();
        btn.classList.remove("active");
        btn.setAttribute("aria-expanded", "false");
        dataTr.classList.remove("shareholder-expanded");
        return;
      }
      dataTr.after(renderShareholderPreviewRow(row, colCount));
      dataTr.classList.add("shareholder-expanded");
      btn.classList.add("active");
      btn.setAttribute("aria-expanded", "true");
    });
  }

  function navigateToClient(href) {
    window.location.href = href;
  }

  function showClientPickerMenu(anchor, clients, nameVal) {
    const existing = document.querySelector(".review-portal-link-menu");
    if (existing) existing.remove();

    const menu = document.createElement("div");
    menu.className = "review-portal-link-menu";
    clients.forEach(function (c, idx) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "review-portal-link-menu-item";
      const label = document.createElement("span");
      label.textContent = (idx === 0 ? "대표 · " : "") + (c.companyName || c.clientId || "");
      btn.appendChild(label);
      if (c.status === "churned") {
        const tag = document.createElement("span");
        tag.className = "review-portal-link-menu-churned";
        tag.textContent = "유출";
        btn.appendChild(tag);
      }
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        menu.remove();
        if (c.href) navigateToClient(c.href);
      });
      menu.appendChild(btn);
    });

    anchor.after(menu);
    const close = function (e) {
      if (!menu.contains(e.target) && e.target !== anchor) {
        menu.remove();
        document.removeEventListener("click", close, true);
      }
    };
    setTimeout(function () {
      document.addEventListener("click", close, true);
    }, 0);
  }

  function applyPortalLinkUI(inner, nameVal, data) {
    const clients = Array.isArray(data.clients) ? data.clients : data.match ? [data.match] : [];
    if (!data.linked && !inner.querySelector(".review-unlinked-badge")) {
      const badge = document.createElement("span");
      badge.className = "review-unlinked-badge";
      badge.textContent = "미연결";
      inner.appendChild(badge);
    }
    if (!data.linked || inner.querySelector(".review-portal-link")) return;

    const linkBtn = document.createElement("a");
    linkBtn.className = "review-portal-link";
    linkBtn.href = "#";
    linkBtn.textContent = clients.length > 1 ? "수임처 " + clients.length : "수임처";
    linkBtn.title =
      clients.length > 1 ? "연결된 수임처 " + clients.length + "곳" : "포털 수임처로 이동";
    linkBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (clients.length > 1) {
        showClientPickerMenu(linkBtn, clients, nameVal);
        return;
      }
      const primary = data.primary || data.match || clients[0];
      if (primary && primary.href) {
        navigateToClient(primary.href);
      } else {
        navigateToClient("/clients/directory?q=" + encodeURIComponent(String(nameVal)));
      }
    });
    inner.appendChild(linkBtn);
  }

  function resolveClientLinkData(key) {
    const index = window.__REVIEW_CLIENT_LINKS_INDEX__;
    if (!index) return null;
    const entry = index[key];
    if (entry) return entry;
    return { linked: false, clients: [], primary: null, manual: false };
  }

  function attachPortalLink(inner, key, nameVal) {
    const cached = resolveClientLinkData(key);
    if (cached) {
      applyPortalLinkUI(inner, nameVal, cached);
      return;
    }
    fetch("/api/review/client-link?key=" + encodeURIComponent(key))
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        applyPortalLinkUI(inner, nameVal, data);
      })
      .catch(function () {
        if (inner.querySelector(".review-portal-link")) return;
        const linkBtn = document.createElement("a");
        linkBtn.className = "review-portal-link";
        linkBtn.href = "#";
        linkBtn.textContent = "수임처";
        linkBtn.title = "포털 수임처로 이동";
        linkBtn.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          navigateToClient("/clients/directory?q=" + encodeURIComponent(String(nameVal)));
        });
        inner.appendChild(linkBtn);
      });
  }

  function attachNameClick(tr, td, row, options, col) {
    if (options.boardEditMode) return;
    tr.dataset.rowNum = String(row.r);
    const colId = ReviewReadable.listColId(col);
    const nameVal = row.cells[colId] && row.cells[colId].v;
    td.classList.add("name-col-clickable");
    td.setAttribute("role", "button");
    td.setAttribute("tabindex", "0");
    td.setAttribute("aria-label", (nameVal ? String(nameVal) : "행") + " 상세정보");

    function openDetail(e) {
      if (e && e.target.closest(".corp-shareholder-count")) return;
      if (e && e.target.closest(".review-portal-link")) return;
      if (e) e.stopPropagation();
      ReviewRowExpand.toggle(row, tr, expandContext(options), null);
    }

    td.addEventListener("click", openDetail);
    td.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openDetail(e);
      }
    });

    if (window.__REVIEW_EMBED__ && ReviewReadable.hasValue(nameVal)) {
      const inner = td.querySelector(".name-col-inner");
      if (inner && !inner.querySelector(".review-portal-link")) {
        const key = ReviewReadable.companyLinkKey
          ? ReviewReadable.companyLinkKey(nameVal)
          : ReviewReadable.normalizeCompanyName(nameVal);
        attachPortalLink(inner, key, nameVal);
      }
    }
  }

  function expandContext(options) {
    const kind = options.kind || "income";
    const listKind =
      kind === "income"
        ? ReviewReadable.incomeListKind(options.listMode || "income")
        : kind === "corp"
        ? ReviewReadable.corpListKind(options.corpListMode || "corp-fee")
        : kind;
    const corpSheet = options.corpSheet != null ? options.corpSheet : options.sheet || null;
    return {
      sheet: options.sheet || corpSheet || null,
      corpSheet: corpSheet,
      corpFullSheet: options.corpFullSheet || null,
      feeSheet: options.feeSheet || null,
      kind: kind,
      listMode: options.listMode || "income",
      corpListMode: options.corpListMode || "corp-fee",
      owner: options.owner,
      sectionTitle: null,
      canEdit: !!options.canEdit,
      readOnly: !!options.readOnly,
      onPatch: options.onPatch,
      onRerender: options.onRerender,
      useListDetail: true,
      visibleListCols: ReviewReadable.getVisibleListCols(listKind),
    };
  }

  function applyStripeHighlight(td, stripeColor) {
    td.style.setProperty("--cell-stripe-color", stripeColor);
    td.style.setProperty("--cell-stripe-bg", ReviewGridCore.tintBg(stripeColor, 16));
    td.classList.add("cell-stripe-highlight");
  }

  function paintListCellEmphasis(td, data, kind, row, col) {
    if (ReviewReadable.isExcelEmphasisBg(data.bg)) {
      td.classList.remove("cell-accent-bg", "cell-accent-group", "cell-accent-name");
      td.style.removeProperty("backgroundColor");
      td.classList.add("cell-excel-emphasis");
      applyStripeHighlight(td, "#FFFF00");
      return;
    }
    if (kind === "income" && col.c === 18 && ReviewReadable.rowHasUnpaid(row)) {
      td.classList.add("cell-unpaid");
    }
  }

  function rowAccentColor(row) {
    return row.rowAccent || row.bg || null;
  }

  function paintAccentCell(td, row, role, options) {
    options = options || {};
    const accent = rowAccentColor(row);
    if (!accent) return;
    applyStripeHighlight(td, accent);
    td.classList.add("cell-accent-bg");
    if (options.stripeOnly) {
      td.classList.add("cell-accent-stripe-only");
    }
    if (role === "group") {
      td.classList.add("cell-accent-group");
      if (row.isTransfer) {
        td.style.setProperty("--cell-stripe-color", "#f59e0b");
      }
    } else if (role === "name") {
      td.classList.add("cell-accent-name");
      if (options.endStripe) {
        td.classList.add("cell-accent-name-end-stripe");
      }
    }
  }

  function isAccentNameColumn(col, kind) {
    if (kind === "income" && col.c === 3) return true;
    if (kind === "corp" && (col.key === "corp:1" || col.c === 1 || col.companyLink)) return true;
    return false;
  }

  function showLeadAccentColumn(kind) {
    return kind === "income" || kind === "corp";
  }

  function isAccentOnlyColumn(kind) {
    return kind === "corp";
  }

  function renderSectionBadge(row, kind) {
    if (kind === "corp" && !row.sectionLabel) return null;
    const span = document.createElement("span");
    span.className = "client-section-badge";
    if (kind === "fee") {
      span.textContent = row.sectionLabel || "—";
      return span;
    }
    if (row.isConsult) span.classList.add("is-consult");
    if (row.isTransfer) {
      span.classList.add("is-transfer");
      span.textContent = row.sectionLabel || "—";
      return span;
    }
    span.textContent = row.sectionLabel || "—";
    return span;
  }

  function listColDisplayLabel(col, kind, listKind) {
    if (kind === "corp" || kind === "fee" || listKind === "corp-fee" || listKind === "fee") {
      return ReviewReadable.formatCorpFeeColLabel(col);
    }
    return col.label;
  }

  function applyStickyOffsets(table, kind) {
    if (kind !== "income") return;
    const lead = table.querySelector("thead th.col-sticky-lead");
    if (!lead) return;
    const w = lead.getBoundingClientRect().width;
    if (w > 0) table.style.setProperty("--sticky-name-left", w + "px");
  }

  function enableBoardEditOnList(table, sheetName, options) {
    if (!options.boardEditMode || !options.canEdit || options.readOnly) return;
    ReviewGridEdit.enableEditOnTable(table, sheetName, true, options.onPatch);
  }

  function renderClientList(rows, options) {
    options = options || {};
    const kind = options.kind || "income";
    const listKind =
      kind === "income"
        ? ReviewReadable.incomeListKind(options.listMode || "income")
        : kind === "corp"
        ? ReviewReadable.corpListKind(options.corpListMode || "corp-fee")
        : kind;
    const showSectionColumn = showLeadAccentColumn(kind);
    const accentOnlyColumn = isAccentOnlyColumn(kind);
    const sectionHeader = kind === "fee" ? "담당" : "구분";
    const visibleCols = ReviewReadable.getVisibleListCols(listKind);
    const colCount = visibleCols.length + (showSectionColumn ? 1 : 0);

    const wrap = document.createElement("div");
    wrap.className = "client-list-scroll";

    const table = document.createElement("table");
    let tableClass = "client-list-table client-list-table--" + kind;
    if (kind === "corp") {
      const parsed = ReviewReadable.parseCorpListMode(options.corpListMode || "corp-fee");
      tableClass +=
        parsed.type === "fee"
          ? " client-list-table--corp-fee"
          : " client-list-table--corp-sheet";
    }
    if (options.boardEditMode) {
      tableClass += " client-list-table--board-edit";
    }
    table.className = tableClass;

    const thead = document.createElement("thead");
    const headTr = document.createElement("tr");
    if (showSectionColumn) {
      const thGroup = document.createElement("th");
      thGroup.className =
        "col-group col-sticky-lead" + (accentOnlyColumn ? " col-group--accent-only" : "");
      thGroup.textContent = accentOnlyColumn ? "" : sectionHeader;
      if (accentOnlyColumn) thGroup.setAttribute("aria-label", "구분색");
      headTr.appendChild(thGroup);
    }
    visibleCols.forEach(function (col) {
      const th = document.createElement("th");
      th.textContent = listColDisplayLabel(col, kind, listKind);
      if (col.highlight) th.classList.add("col-highlight");
      if (isAccentNameColumn(col, kind)) th.classList.add("col-sticky-name");
      headTr.appendChild(th);
    });
    thead.appendChild(headTr);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    if (!rows.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = colCount;
      td.className = "empty-row";
      if (options.filterEmpty) {
        td.classList.add("is-filter-hint");
        td.textContent =
          kind === "fee"
            ? "담당자 필터를 하나 이상 선택하세요."
            : "구분 필터를 하나 이상 선택하세요.";
      } else if (options.searchQuery) {
        td.textContent = "검색 결과 없음";
      } else if (options.emptyHint) {
        td.textContent = options.emptyHint;
      } else {
        td.textContent = "표시할 업체 없음";
      }
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      rows.forEach(function (row) {
        const tr = document.createElement("tr");
        const accent = rowAccentColor(row);
        if (accent) tr.classList.add("row-stripe");
        if (row.isTransfer) tr.classList.add("row-transfer");
        if (row.isNew) tr.classList.add("row-new-client");

        if (showSectionColumn) {
          const tdGroup = document.createElement("td");
          tdGroup.className =
            "col-group col-sticky-lead" + (accentOnlyColumn ? " col-group--accent-only" : "");
          if (rowAccentColor(row)) {
            paintAccentCell(tdGroup, row, "group", { stripeOnly: accentOnlyColumn });
          }
          const badge = renderSectionBadge(row, kind);
          if (badge) tdGroup.appendChild(badge);
          tr.appendChild(tdGroup);
        }

        visibleCols.forEach(function (col) {
          const td = document.createElement("td");
          if (row.r) td.dataset.r = String(row.r);
          if (col.c != null) td.dataset.c = String(col.c);
          const colId = ReviewReadable.listColId(col);
          const data = row.cells[colId] || row.cells[col.c] || {};
          const isCompanyNameCell = col.companyLink && ReviewReadable.hasValue(data.v);

          if (isCompanyNameCell) {
            td.classList.add("name-col");
            const inner = document.createElement("span");
            inner.className = "name-col-inner";
            const nameText = document.createElement("span");
            nameText.className = "name-col-text";
            const v = data.v;
            if (ReviewReadable.isCheckChipValue(v)) {
              const s = String(v).trim();
              const span = document.createElement("span");
              span.className = "check-chip check-chip--" + (s === "△" ? "tri" : s.toLowerCase());
              span.textContent = s;
              nameText.appendChild(span);
            } else {
              nameText.textContent = ReviewReadable.formatVal(v);
            }
            inner.appendChild(nameText);
            if (kind === "corp" && row.shareholders && row.shareholders.length) {
              const shBtn = document.createElement("button");
              shBtn.type = "button";
              shBtn.className = "corp-shareholder-count";
              shBtn.textContent = "지분" + row.shareholders.length;
              inner.appendChild(shBtn);
            }
            td.appendChild(inner);
            attachNameClick(tr, td, row, options, col);
            if (kind === "corp" && row.shareholders && row.shareholders.length) {
              const shBtn = inner.querySelector(".corp-shareholder-count");
              attachShareholderToggle(shBtn, tr, row, colCount);
            }
          } else {
            const displayText = setCellDisplay(td, data, col, kind);
            if (!row.isTransfer) {
              attachCellTooltip(td, displayText, col, listKind);
            }
          }
          if (isAccentNameColumn(col, kind) && !ReviewReadable.isExcelEmphasisBg(data.bg)) {
            paintAccentCell(td, row, "name", { endStripe: kind === "corp" });
          } else if (kind !== "income" && kind !== "corp" && data.bg && !accent) {
            td.style.backgroundColor = data.bg;
          }
          paintListCellEmphasis(td, data, kind, row, col);
          if (col.highlight) td.classList.add("col-highlight");
          if (col.num || typeof data.v === "number") td.classList.add("num");
          if (col.wrap || col.c === 5 || col.c === 11 || col.c === 21) td.classList.add("wrap");
          if (isAccentNameColumn(col, kind)) td.classList.add("col-sticky-name");
          if (!ReviewReadable.hasValue(data.v)) td.classList.add("is-empty");
          tr.appendChild(td);
        });

        tbody.appendChild(tr);
      });
    }

    table.appendChild(tbody);
    wrap.appendChild(table);
    if (options.boardEditMode && options.sheet && options.sheet.name) {
      enableBoardEditOnList(table, options.sheet.name, options);
    }
    requestAnimationFrame(function () {
      applyStickyOffsets(table, kind);
    });
    return wrap;
  }

  function renderBoardContent(sheet, host, options, config) {
    const owner = options.owner || sheet.name;
    let activeSheet = sheet;
    const kind = config.kind;
    const boardOptions = Object.assign({}, options, {
      sheet: activeSheet,
      owner: owner,
      kind: kind,
    });
    const allRows = config.buildRows(activeSheet);

    const root = document.createElement("div");
    root.className = "client-list-root";

    const listHost = document.createElement("div");
    listHost.className = "client-list-host";

    let filterState = config.getFilterState();

    function refreshList(state) {
      if (state !== undefined) filterState = state;
      listHost.innerHTML = "";
      const filtered = config.filterRows(allRows, filterState, boardOptions.searchQuery || "");
      const listRows = Array.isArray(filtered) ? filtered : filtered.rows;
      boardOptions.filterEmpty = filtered.filterEmpty || false;
      if (kind === "income") {
        boardOptions.listMode = ReviewReadable.resolveIncomeListMode(listRows);
      }
      listHost.appendChild(renderClientList(listRows, boardOptions));
    }

    if (config.extendBoardOptions) config.extendBoardOptions(boardOptions, refreshList);

    boardOptions.onRerender = function () {
      if (activeSheet) activeSheet = ReviewGridEdit.applyPatchesToSheet(activeSheet);
      boardOptions.sheet = activeSheet;
      const fresh = config.buildRows(activeSheet);
      allRows.length = 0;
      fresh.forEach(function (r) {
        allRows.push(r);
      });
      refreshList();
    };

    const filterBar = config.renderFilterBar
      ? config.renderFilterBar(filterState, function (state) {
          refreshList(state);
        }, boardOptions)
      : null;

    const toolbar = buildListToolbar(
      kind,
      function () {
        refreshList();
      },
      filterBar,
      boardOptions
    );

    root.appendChild(toolbar);
    root.appendChild(listHost);
    refreshList(filterState);
    host.appendChild(root);
  }

  function renderIncomeBoardContent(sheet, host, options) {
    const owner = options.owner || sheet.name;
    const sections = ReviewGridSections.getSections(sheet);
    let checkedKinds = ReviewGridSections.getIncomeMainFilters(owner, sections);
    let activeSheet = sheet;

    const boardOpts = Object.assign({}, options, {
      sheet: activeSheet,
      owner: owner,
      kind: "income",
    });

    const root = document.createElement("div");
    root.className = "client-list-root";

    const mainHost = document.createElement("div");
    mainHost.className = "client-list-host income-main";

    const consultSection = document.createElement("section");
    consultSection.className = "income-consult-section";
    const consultTitle = document.createElement("h3");
    consultTitle.className = "income-consult-title";
    consultTitle.textContent = "상담";
    consultSection.appendChild(consultTitle);
    const consultHost = document.createElement("div");
    consultHost.className = "client-list-host income-consult";
    consultSection.appendChild(consultHost);

    function allIncomeRows() {
      return ReviewReadable.buildIncomeClientRows(activeSheet);
    }

    function mainRows() {
      return allIncomeRows().filter(function (row) {
        return row.filterKey !== "consult";
      });
    }

    function consultRows() {
      return allIncomeRows().filter(function (row) {
        return row.filterKey === "consult";
      });
    }

    function refreshMain() {
      mainHost.innerHTML = "";
      const base = filterClientRows(mainRows(), checkedKinds);
      let rows = base.rows;
      const filterEmpty = base.filterEmpty;
      if (options.searchQuery) {
        rows = ReviewReadable.filterIncomeClientRows(rows, activeSheet, options.searchQuery);
      }
      mainHost.appendChild(
        renderClientList(rows, Object.assign({}, boardOpts, { listMode: "income", filterEmpty: filterEmpty }))
      );
    }

    function refreshConsult() {
      consultHost.innerHTML = "";
      let rows = consultRows();
      if (options.searchQuery) {
        rows = ReviewReadable.filterIncomeClientRows(rows, activeSheet, options.searchQuery);
      }
      consultHost.appendChild(
        renderClientList(rows, Object.assign({}, boardOpts, { listMode: "consult" }))
      );
    }

    function refreshAll() {
      refreshMain();
      refreshConsult();
    }

    boardOpts.onRerender = function () {
      activeSheet = ReviewGridEdit.applyPatchesToSheet(activeSheet);
      boardOpts.sheet = activeSheet;
      refreshAll();
    };

    const filterBar = renderIncomeMainFilterBar(sections, owner, checkedKinds, function (next) {
      checkedKinds = next;
      refreshMain();
    });

    const toolbar = buildListToolbar("income", refreshAll, filterBar, boardOpts);

    root.appendChild(toolbar);
    root.appendChild(mainHost);
    root.appendChild(consultSection);
    refreshAll();
    host.appendChild(root);
  }

  function renderCorpBoardContent(sheet, host, options) {
    const owner = options.owner || (sheet && sheet.name) || "담당";
    let activeCorp = sheet || null;
    let activeFee = options.feeSheet || null;
    let activeCorpFull = options.corpFullSheet || null;
    const corpTaxVersions = options.corpTaxVersions || ReviewReadable.getCorpTaxVersions(null);
    const corpTaxSheets = options.corpTaxSheets || {};
    let corpListMode = "corp-fee";
    let corpModeRow = null;
    const boardOptions = Object.assign({}, options, {
      sheet: activeCorp,
      corpSheet: activeCorp,
      corpFullSheet: activeCorpFull,
      feeSheet: activeFee,
      owner: owner,
      kind: "corp",
      corpListMode: corpListMode,
      corpTaxVersions: corpTaxVersions,
      corpTaxSheets: corpTaxSheets,
    });
    let allRows = [];

    function taxSheetForVersion(versionId) {
      if (corpTaxSheets[versionId] != null) return corpTaxSheets[versionId];
      return versionId === "26.3" ? activeCorp : null;
    }

    function rebuildRows() {
      const parsed = ReviewReadable.parseCorpListMode(corpListMode);
      if (parsed.type === "fee") {
        allRows = ReviewReadable.buildFeeClientRowsForStaff(activeFee, owner);
        boardOptions.sheet = activeFee;
        boardOptions.corpSheet = activeCorp;
        boardOptions.feeSheet = activeFee;
        boardOptions.emptyHint = !activeFee ? "조정료 시트가 없습니다." : null;
      } else {
        const taxSheet = taxSheetForVersion(parsed.versionId);
        allRows = ReviewReadable.buildCorpSheetClientRows(taxSheet, activeCorpFull, owner);
        boardOptions.sheet = taxSheet;
        boardOptions.corpSheet = taxSheet;
        boardOptions.emptyHint = !taxSheet
          ? ReviewReadable.corpTaxChipLabel(parsed.versionId) + " 시트가 없습니다."
          : null;
      }
    }
    rebuildRows();

    const root = document.createElement("div");
    root.className = "client-list-root";

    const listHost = document.createElement("div");
    listHost.className = "client-list-host";

    function syncCorpModeChips() {
      if (!corpModeRow) return;
      corpModeRow.querySelectorAll(".view-mode-chip").forEach(function (btn) {
        btn.classList.toggle("active", btn.dataset.corpMode === corpListMode);
      });
    }

    function refreshList() {
      listHost.innerHTML = "";
      boardOptions.corpListMode = corpListMode;
      const searched = ReviewReadable.filterCorpClientRows(allRows, boardOptions.searchQuery || "");
      listHost.appendChild(renderClientList(searched, boardOptions));
    }

    boardOptions.onRerender = function () {
      if (activeCorp) activeCorp = ReviewGridEdit.applyPatchesToSheet(activeCorp);
      if (activeFee) activeFee = ReviewGridEdit.applyPatchesToSheet(activeFee);
      if (activeCorpFull) activeCorpFull = ReviewGridEdit.applyPatchesToSheet(activeCorpFull);
      Object.keys(corpTaxSheets).forEach(function (vid) {
        if (corpTaxSheets[vid]) {
          corpTaxSheets[vid] = ReviewGridEdit.applyPatchesToSheet(corpTaxSheets[vid]);
        }
      });
      boardOptions.corpFullSheet = activeCorpFull;
      boardOptions.feeSheet = activeFee;
      rebuildRows();
      refreshList();
    };

    boardOptions.onCorpListModeChange = function (mode) {
      corpListMode = mode;
      boardOptions.corpListMode = mode;
      rebuildRows();
      syncCorpModeChips();
      refreshList();
    };

    const toolbar = buildListToolbar(
      "corp",
      function () {
        refreshList();
      },
      null,
      boardOptions
    );
    corpModeRow = toolbar._corpModeRow || null;

    root.appendChild(toolbar);
    root.appendChild(listHost);
    refreshList();
    host.appendChild(root);
  }

  function renderFeeBoardContent(sheet, host, options) {
    let checkedStaff = ReviewReadable.getFeeStaffFilters();

    renderBoardContent(sheet, host, options, {
      kind: "fee",
      buildRows: ReviewReadable.buildFeeClientRows,
      getFilterState: function () {
        return checkedStaff;
      },
      filterRows: function (rows, staff, query) {
        const base = filterFeeStaffRows(rows, staff);
        if (!query) return base;
        return {
          rows: ReviewReadable.filterFeeClientRows(base.rows, staff, query),
          filterEmpty: false,
        };
      },
      renderFilterBar: function (staff, onChange) {
        return renderFeeStaffFilterBar(staff, function (next) {
          checkedStaff = next;
          onChange(next);
        });
      },
    });
  }

  window.ReviewClientList = {
    filterClientRows,
    filterFeeStaffRows,
    renderFilterBar,
    renderIncomeMainFilterBar,
    renderFeeStaffFilterBar,
    buildListToolbar,
    renderClientList,
    renderIncomeBoardContent,
    renderCorpBoardContent,
    renderFeeBoardContent,
    expandContext,
  };
})();
