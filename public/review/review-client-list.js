(function () {
  "use strict";

  const SECTION_DISPLAY_KEY = "reviewIncomeSectionDisplay";

  function getSectionDisplayEnabled() {
    try {
      return sessionStorage.getItem(SECTION_DISPLAY_KEY) !== "0";
    } catch {
      return true;
    }
  }

  function setSectionDisplayEnabled(on) {
    try {
      sessionStorage.setItem(SECTION_DISPLAY_KEY, on ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

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

  function renderIncomeExcludedFilterChip(owner, showExcluded, onChange) {
    const label = document.createElement("label");
    label.className = "category-filter-chip";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "category-filter-input";
    input.value = "excluded";
    input.checked = showExcluded;
    input.addEventListener("change", function () {
      ReviewGridSections.setIncomeExcludedVisible(owner, input.checked);
      onChange(input.checked);
    });

    const text = document.createElement("span");
    text.className = "category-filter-label";
    text.textContent = "이관/폐업/상담";

    label.appendChild(input);
    label.appendChild(text);
    return label;
  }

  function renderIncomeMainFilterBar(sections, owner, checkedKinds, onChange, excludedOpts) {
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
          if (el.checked && el.value !== "excluded") next.push(el.value);
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

    if (excludedOpts && ReviewGridSections.hasExcludedSection(sections)) {
      bar.appendChild(
        renderIncomeExcludedFilterChip(owner, excludedOpts.showExcluded, excludedOpts.onExcludedChange)
      );
    }

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
      if (kind === "income") {
        const sectionToggle = document.createElement("label");
        sectionToggle.className = "category-filter-chip";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.className = "category-filter-input";
        input.checked = !!options.showSections;
        input.addEventListener("change", function () {
          setSectionDisplayEnabled(input.checked);
          if (typeof options.onSectionDisplayChange === "function") {
            options.onSectionDisplayChange(input.checked);
          } else {
            onRefresh();
          }
        });
        const text = document.createElement("span");
        text.className = "category-filter-label";
        text.textContent = "구분표시";
        sectionToggle.appendChild(input);
        sectionToggle.appendChild(text);
        filterRow.appendChild(sectionToggle);
      }
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
      "기장 · 성실 · 신고 · 업체 — 신고 대상 구간입니다. 이관/폐업/상담은 하단 별도 목록입니다.";
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
    td.setAttribute("title", str);
    td.classList.add("has-cell-tooltip");
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

  function closePortalPickerMenu() {
    const existing = document.querySelector(".review-portal-link-menu");
    if (existing) existing.remove();
  }

  function positionPickerMenu(menu, anchor) {
    const rect = anchor.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 328)) + "px";
    menu.style.top = rect.bottom + 6 + "px";
    const menuRect = menu.getBoundingClientRect();
    if (menuRect.bottom > window.innerHeight - 8) {
      menu.style.top = Math.max(8, rect.top - menuRect.height - 6) + "px";
    }
  }

  function showClientPickerMenu(anchor, clients, nameVal) {
    closePortalPickerMenu();

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

    document.body.appendChild(menu);
    positionPickerMenu(menu, anchor);
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

  function canManageClientLinks() {
    const session = window.__REVIEW_SESSION__;
    return !!(session && session.isMaster);
  }

  function updateClientLinksIndex(key, data) {
    if (!window.__REVIEW_CLIENT_LINKS_INDEX__) window.__REVIEW_CLIENT_LINKS_INDEX__ = {};
    const entry = {
      linked: !!data.linked,
      clients: Array.isArray(data.clients) ? data.clients : [],
      primary: data.primary || null,
      manual: !!data.manual,
    };
    window.__REVIEW_CLIENT_LINKS_INDEX__[key] = entry;
    installClientLinksResolver(window.__REVIEW_CLIENT_LINKS_INDEX__);
  }

  function resolveSheetOwner(options, sheet) {
    if (options && options.owner) return options.owner;
    if (sheet && sheet.meta && sheet.meta.owner) return sheet.meta.owner;
    return null;
  }

  function installClientLinksResolver(index) {
    const resolve = {};
    if (!index) {
      window.__REVIEW_CLIENT_LINKS_RESOLVE__ = resolve;
      return;
    }
    Object.keys(index).forEach(function (k) {
      const entry = index[k];
      if (!entry) return;
      resolve[k] = entry;
      if (k.indexOf("/") < 0) {
        var ambiguous = false;
        var baseCount = 0;
        Object.keys(index).forEach(function (other) {
          if (other === k || other.endsWith("/" + k) || other.indexOf("/" + k + "/") >= 0) {
            baseCount++;
          }
        });
        ambiguous = baseCount > 1;
        if (!ambiguous) {
          buildAltLinkKeysForName(k).forEach(function (alt) {
            if (!resolve[alt]) resolve[alt] = entry;
          });
        }
      }
      if (entry.primary && entry.primary.id) {
        resolve["id:" + entry.primary.id] = entry;
      }
      (entry.clients || []).forEach(function (c) {
        if (c && c.id) resolve["id:" + c.id] = entry;
      });
    });
    window.__REVIEW_CLIENT_LINKS_RESOLVE__ = resolve;
  }

  function installClientLinksIndex(index) {
    window.__REVIEW_CLIENT_LINKS_INDEX__ = index || {};
    installClientLinksResolver(window.__REVIEW_CLIENT_LINKS_INDEX__);
  }

  function filingCheckTaxParam(linkOpts) {
    if (!linkOpts) return "comprehensive";
    const kind = linkOpts.kind || "income";
    if (kind === "income") return "comprehensive";
    return "corporate";
  }

  function navigateToFilingCheck(reviewKey, linkOpts) {
    const tax = filingCheckTaxParam(linkOpts);
    const cached = resolveClientLinkData(reviewKey, linkOpts);
    const primary =
      cached && (cached.primary || (cached.clients && cached.clients.length ? cached.clients[0] : null));
    if (primary && primary.id) {
      window.location.href =
        "/clients/filing-check?tax=" +
        encodeURIComponent(tax) +
        "&client=" +
        encodeURIComponent(primary.id);
      return;
    }
    window.location.href = "/clients/filing-check?tax=" + encodeURIComponent(tax);
  }

  function createPortalAction(label, className) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "review-detail-portal-action" + (className ? " " + className : "");
    btn.textContent = label;
    return btn;
  }

  function buildCompanyLinkMeta(nameVal, options) {
    options = options || {};
    const baseKey = ReviewReadable.companyLinkKey
      ? ReviewReadable.companyLinkKey(nameVal)
      : ReviewReadable.normalizeCompanyName(nameVal);
    const owner = options.owner || null;
    const personName = options.personName || null;
    const scopedKey =
      ReviewReadable.scopedReviewKey && owner
        ? ReviewReadable.scopedReviewKey(owner, baseKey, personName)
        : baseKey;
    return {
      key: scopedKey || baseKey,
      baseKey: baseKey,
      scopedKey: scopedKey || baseKey,
      owner: owner,
      personName: personName,
      nameVal: nameVal,
      linkOpts: {
        kind: options.kind || "income",
        corpListMode: options.corpListMode || "corp-fee",
        owner: owner,
        personName: personName,
        baseKey: baseKey,
        scopedKey: scopedKey || baseKey,
      },
    };
  }

  function buildAltLinkKeysForName(name) {
    const keys = new Set();
    const trimmed = String(name || "").trim();
    if (!trimmed) return [];

    function addKey(label) {
      const k = ReviewReadable.companyLinkKey(label);
      if (k && k.length >= 2) keys.add(k);
      if (ReviewReadable.coreCompanyName) {
        const core = ReviewReadable.coreCompanyName(label);
        if (core && core.length >= 2) keys.add(core);
      }
    }

    addKey(trimmed);
    const noLegal = trimmed
      .replace(/\(주\)|（주）|㈜|주식회사|\(유\)|（유）/gi, "")
      .replace(/\s+/g, "")
      .trim();
    if (noLegal) addKey(noLegal);
    if (!/\(주\)|㈜|주식회사/i.test(trimmed)) {
      addKey("(주)" + trimmed);
      addKey("㈜" + trimmed);
    }
    const inner = trimmed.match(/^\(주\)\s*(.+)$/i);
    if (inner && inner[1]) addKey(inner[1].trim());

    return Array.from(keys);
  }

  function readRowCompanyName(row, context) {
    const kind = context.kind || "income";
    if (kind === "income") {
      const company = row.cells[4] && row.cells[4].v;
      if (ReviewReadable.hasValue(company)) return company;
      const person = row.cells[3] && row.cells[3].v;
      if (ReviewReadable.hasValue(person)) return person;
      return null;
    }
    if (kind === "corp" || kind === "fee") {
      const listKind = kind === "corp" ? context.corpListMode || "corp-fee" : "fee";
      const cols = ReviewReadable.getVisibleListCols(listKind);
      for (let i = 0; i < cols.length; i++) {
        const col = cols[i];
        if (!col.companyLink) continue;
        const colId = ReviewReadable.listColId(col);
        const data = row.cells[colId] || (col.c != null ? row.cells[col.c] : null);
        if (data && ReviewReadable.hasValue(data.v)) return data.v;
      }
      const corpCell = row.cells["corp:1"] || row.cells[1];
      if (corpCell && ReviewReadable.hasValue(corpCell.v)) return corpCell.v;
    }
    return null;
  }

  function resolveCompanyLinkMetaForRow(row, context) {
    const nameVal = readRowCompanyName(row, context);
    if (!ReviewReadable.hasValue(nameVal)) return null;
    const kind = context.kind || "income";
    let personName = null;
    if (kind === "income") {
      const person = row.cells[3] && row.cells[3].v;
      if (ReviewReadable.hasValue(person)) personName = person;
    }
    return buildCompanyLinkMeta(nameVal, {
      kind: context.kind,
      corpListMode: context.corpListMode,
      owner: resolveSheetOwner(context, context.sheet),
      personName: personName,
    });
  }

  function normalizeLinkData(data) {
    const clients = Array.isArray(data.clients) ? data.clients : data.match ? [data.match] : [];
    return {
      linked: !!(data.linked || clients.length),
      clients: clients,
      primary: data.primary || data.match || clients[0] || null,
      manual: !!data.manual,
      suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
    };
  }

  function saveClientLinks(meta, clientIds, onLinked, onBusy) {
    const ids = Array.isArray(clientIds) ? clientIds.filter(Boolean) : [];
    if (!ids.length) {
      window.alert("수임처를 1곳 이상 선택하세요.");
      return Promise.resolve();
    }
    if (typeof onBusy === "function") onBusy(true);
    return fetch("/api/review/client-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reviewKey: meta.key,
        reviewName: meta.nameVal,
        clientIds: ids,
      }),
    })
      .then(function (res) {
        return res.json().then(function (body) {
          return { ok: res.ok, body: body };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          throw new Error(result.body.error || "연결 저장 실패");
        }
        const linkedData = normalizeLinkData({
          linked: true,
          clients: result.body.clients || [],
          primary: result.body.primary || null,
          manual: true,
        });
        updateClientLinksIndex(meta.key, linkedData);
        if (typeof onLinked === "function") onLinked(linkedData);
      })
      .catch(function (err) {
        window.alert(err && err.message ? err.message : "연결 저장 실패");
      })
      .finally(function () {
        if (typeof onBusy === "function") onBusy(false);
      });
  }

  function saveClientLink(meta, clientId, onLinked, onBusy) {
    return saveClientLinks(meta, [clientId], onLinked, onBusy);
  }

  function searchClientsApi(query) {
    const q = String(query || "").trim();
    if (!q) return Promise.resolve([]);
    const params = new URLSearchParams({ q: q, includeChurned: "1" });
    return fetch("/api/clients/search?" + params.toString())
      .then(function (res) {
        return res.ok ? res.json() : { clients: [] };
      })
      .then(function (data) {
        const list = Array.isArray(data.clients) ? data.clients : [];
        return list.slice(0, 20);
      })
      .catch(function () {
        return [];
      });
  }

  function renderQuickLinkPanel(host, meta, data, onLinked) {
    const row = document.createElement("div");
    row.className = "review-detail-portal-row review-detail-portal-row--unlinked";

    const status = document.createElement("span");
    status.className = "review-detail-portal-status review-detail-portal-status--unlinked";
    status.textContent = "미연결";
    row.appendChild(status);

    const filingBtn = createPortalAction(
      "신고확인",
      "review-detail-portal-action--filing review-detail-portal-action--compact",
    );
    filingBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      navigateToFilingCheck(meta.key, meta.linkOpts);
    });
    row.appendChild(filingBtn);

    if (!canManageClientLinks()) {
      const hint = document.createElement("span");
      hint.className = "review-detail-portal-hint-inline";
      hint.textContent = "연결은 인디·찰리만 가능";
      row.appendChild(hint);
      host.appendChild(row);
      return;
    }

    host.appendChild(row);

    const quick = document.createElement("div");
    quick.className = "review-detail-portal-quick";
    host.appendChild(quick);

    const suggestRow = document.createElement("div");
    suggestRow.className = "review-detail-portal-suggest-row";
    suggestRow.hidden = true;
    quick.appendChild(suggestRow);

    const multiHint = document.createElement("p");
    multiHint.className = "review-detail-portal-hint";
    multiHint.textContent = "맨 위 수임처가 매출 대표입니다. ↑↓로 순서를 바꿀 수 있습니다.";
    multiHint.hidden = true;
    quick.appendChild(multiHint);

    const multiListHost = document.createElement("div");
    multiListHost.className = "review-detail-portal-multi-list";
    multiListHost.hidden = true;
    quick.appendChild(multiListHost);

    const multiActions = document.createElement("div");
    multiActions.className = "review-detail-portal-multi-actions";
    multiActions.hidden = true;
    const saveMultiBtn = createPortalAction(
      "연결 저장",
      "review-detail-portal-action--primary review-detail-portal-action--compact",
    );
    const cancelMultiBtn = createPortalAction(
      "취소",
      "review-detail-portal-action--ghost review-detail-portal-action--compact",
    );
    multiActions.appendChild(saveMultiBtn);
    multiActions.appendChild(cancelMultiBtn);
    quick.appendChild(multiActions);

    const search = document.createElement("input");
    search.type = "search";
    search.className = "review-detail-portal-search";
    search.placeholder = "수임처 검색 (상호·담당·사업자번호)";
    search.value = String(meta.nameVal || "");
    quick.appendChild(search);

    const list = document.createElement("div");
    list.className =
      "review-detail-portal-client-list review-detail-portal-client-list--compact";
    quick.appendChild(list);

    const multiToggle = document.createElement("button");
    multiToggle.type = "button";
    multiToggle.className = "review-detail-portal-multi-toggle";
    multiToggle.textContent = "복수 연결 · 대표 업체 지정…";
    quick.appendChild(multiToggle);

    let busy = false;
    let multiMode = false;
    let searchTimer = null;
    let suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
    const pickedIds = [];
    const pickedInfo = {};

    function setBusyState(next) {
      busy = next;
      search.disabled = busy;
      saveMultiBtn.disabled = busy;
      cancelMultiBtn.disabled = busy;
      multiToggle.disabled = busy;
      suggestRow.querySelectorAll("button").forEach(function (btn) {
        btn.disabled = busy;
      });
      list.querySelectorAll("button").forEach(function (btn) {
        btn.disabled = busy;
      });
      multiListHost.querySelectorAll("button").forEach(function (btn) {
        btn.disabled = busy;
      });
    }

    function clientSubLabel(c) {
      return (c.manager || "") + (c.status === "churned" ? " · 유출" : "");
    }

    function addPicked(client) {
      if (!client || !client.id || pickedIds.includes(client.id)) return;
      pickedIds.push(client.id);
      pickedInfo[client.id] = {
        id: client.id,
        companyName: client.companyName || client.id,
        manager: client.manager || "",
        status: client.status || "",
      };
      renderMultiList();
      if (multiMode) {
        renderSuggestions();
        scheduleSearch();
      }
    }

    function removePicked(id) {
      const idx = pickedIds.indexOf(id);
      if (idx < 0) return;
      pickedIds.splice(idx, 1);
      delete pickedInfo[id];
      renderMultiList();
      if (multiMode) {
        renderSuggestions();
        scheduleSearch();
      }
    }

    function movePicked(idx, dir) {
      const next = idx + dir;
      if (next < 0 || next >= pickedIds.length) return;
      const tmp = pickedIds[idx];
      pickedIds[idx] = pickedIds[next];
      pickedIds[next] = tmp;
      renderMultiList();
    }

    function renderMultiList() {
      multiListHost.innerHTML = "";
      if (!pickedIds.length) {
        const empty = document.createElement("p");
        empty.className = "review-detail-portal-hint";
        empty.textContent = "아래 검색에서 수임처를 추가하세요. 맨 위가 매출 대표입니다.";
        multiListHost.appendChild(empty);
        return;
      }
      pickedIds.forEach(function (id, idx) {
        const c = pickedInfo[id] || { id: id, companyName: id, manager: "" };
        const item = document.createElement("div");
        item.className = "review-detail-portal-multi-item";

        const num = document.createElement("span");
        num.className = "review-detail-portal-multi-item-num";
        num.textContent = String(idx + 1);
        item.appendChild(num);

        const label = document.createElement("span");
        label.className = "review-detail-portal-multi-item-label";
        label.textContent =
          (c.companyName || id) + (c.manager ? " · " + c.manager : "");
        item.appendChild(label);

        if (idx === 0) {
          const badge = document.createElement("span");
          badge.className = "review-detail-portal-multi-badge";
          badge.textContent = "대표";
          item.appendChild(badge);
        }

        const upBtn = createPortalAction(
          "↑",
          "review-detail-portal-action--ghost review-detail-portal-action--compact",
        );
        upBtn.disabled = busy || idx === 0;
        upBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          movePicked(idx, -1);
        });
        item.appendChild(upBtn);

        const downBtn = createPortalAction(
          "↓",
          "review-detail-portal-action--ghost review-detail-portal-action--compact",
        );
        downBtn.disabled = busy || idx === pickedIds.length - 1;
        downBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          movePicked(idx, 1);
        });
        item.appendChild(downBtn);

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "review-detail-portal-multi-remove";
        removeBtn.textContent = "제거";
        removeBtn.disabled = busy;
        removeBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          removePicked(id);
        });
        item.appendChild(removeBtn);

        multiListHost.appendChild(item);
      });
    }

    function setMultiMode(on) {
      multiMode = on;
      multiHint.hidden = !on;
      multiListHost.hidden = !on;
      multiActions.hidden = !on;
      multiToggle.hidden = on;
      if (on) {
        renderMultiList();
        scheduleSearch();
      } else {
        pickedIds.length = 0;
        Object.keys(pickedInfo).forEach(function (key) {
          delete pickedInfo[key];
        });
        multiListHost.innerHTML = "";
        scheduleSearch();
      }
      renderSuggestions();
    }

    function renderSuggestions() {
      suggestRow.innerHTML = "";
      const visible = suggestions.filter(function (s) {
        return !multiMode || !pickedIds.includes(s.clientId);
      });
      if (!visible.length) {
        suggestRow.hidden = true;
        return;
      }
      suggestRow.hidden = false;
      const label = document.createElement("span");
      label.className = "review-detail-portal-suggest-label";
      label.textContent = "추천";
      suggestRow.appendChild(label);
      visible.forEach(function (s) {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "review-detail-portal-suggest-chip";
        chip.textContent =
          (s.companyName || "") + (s.manager ? " · " + s.manager : "");
        chip.title = s.reason || "";
        chip.addEventListener("click", function (e) {
          e.stopPropagation();
          if (busy) return;
          if (multiMode) {
            addPicked({
              id: s.clientId,
              companyName: s.companyName,
              manager: s.manager,
            });
            return;
          }
          const prev = chip.textContent;
          chip.textContent = "저장 중…";
          saveClientLink(meta, s.clientId, onLinked, setBusyState).then(function () {
            if (chip.isConnected) chip.textContent = prev;
          });
        });
        suggestRow.appendChild(chip);
      });
    }

    function renderSearchResults(items) {
      list.innerHTML = "";
      const q = String(search.value || "").trim();
      if (!q || q.length < 2) {
        const hint = document.createElement("p");
        hint.className = "review-detail-portal-hint";
        hint.textContent = "2글자 이상 입력하면 검색됩니다";
        list.appendChild(hint);
        return;
      }
      const visible = multiMode
        ? items.filter(function (c) {
            return !pickedIds.includes(c.id);
          })
        : items;
      if (!visible.length) {
        const empty = document.createElement("p");
        empty.className = "review-detail-portal-hint";
        empty.textContent = "검색 결과 없음";
        list.appendChild(empty);
        return;
      }
      visible.forEach(function (c) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "review-detail-portal-client-item";
        const name = document.createElement("span");
        name.className = "review-detail-portal-client-name";
        name.textContent = c.companyName || c.id;
        btn.appendChild(name);
        const sub = document.createElement("span");
        sub.className = "review-detail-portal-client-sub";
        sub.textContent = clientSubLabel(c);
        btn.appendChild(sub);
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          if (busy) return;
          if (multiMode) {
            addPicked(c);
            return;
          }
          const prevName = name.textContent;
          name.textContent = "저장 중…";
          saveClientLink(meta, c.id, onLinked, setBusyState).then(function () {
            if (name.isConnected) name.textContent = prevName;
          });
        });
        list.appendChild(btn);
      });
    }

    function scheduleSearch() {
      if (searchTimer) clearTimeout(searchTimer);
      const q = String(search.value || "").trim();
      if (!q || q.length < 2) {
        renderSearchResults([]);
        return;
      }
      list.innerHTML = '<p class="review-detail-portal-hint">검색 중…</p>';
      searchTimer = setTimeout(function () {
        searchClientsApi(q).then(renderSearchResults);
      }, 300);
    }

    search.addEventListener("input", function () {
      scheduleSearch();
    });

    multiToggle.addEventListener("click", function (e) {
      e.stopPropagation();
      if (busy) return;
      setMultiMode(true);
    });

    saveMultiBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (busy) return;
      saveClientLinks(meta, pickedIds.slice(), onLinked, setBusyState);
    });

    cancelMultiBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (busy) return;
      setMultiMode(false);
    });

    renderSuggestions();
    fetchClientLinkSuggestions(meta.key, meta.linkOpts).then(function (items) {
      if (items && items.length) {
        suggestions = items;
        renderSuggestions();
      }
    });
    renderSearchResults([]);
  }

  function renderLinkedPanel(host, meta, data) {
    const normalized = normalizeLinkData(data);
    const clients = normalized.clients;

    const row = document.createElement("div");
    row.className = "review-detail-portal-row review-detail-portal-row--linked";

    const status = document.createElement("span");
    status.className = "review-detail-portal-status review-detail-portal-status--linked";
    status.textContent = normalized.manual ? "수동 연결" : "연결됨";
    row.appendChild(status);

    const primary = normalized.primary || clients[0];
    if (primary) {
      const label = document.createElement("span");
      label.className = "review-detail-portal-linked-label";
      label.textContent =
        (clients.length > 1 ? clients.length + "곳 · " : "") +
        (primary.companyName || "") +
        (primary.manager ? " · " + primary.manager : "");
      row.appendChild(label);
    }

    const portalBtn = createPortalAction(
      clients.length > 1 ? "수임처" : "수임처",
      "review-detail-portal-action--portal review-detail-portal-action--compact",
    );
    portalBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (clients.length > 1) {
        showClientPickerMenu(portalBtn, clients, meta.nameVal);
        return;
      }
      if (primary && primary.href) {
        navigateToClient(primary.href);
      } else {
        navigateToClient("/clients/directory?q=" + encodeURIComponent(String(meta.nameVal)));
      }
    });
    row.appendChild(portalBtn);

    const filingBtn = createPortalAction(
      "신고확인",
      "review-detail-portal-action--filing review-detail-portal-action--compact",
    );
    filingBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      navigateToFilingCheck(meta.key, meta.linkOpts);
    });
    row.appendChild(filingBtn);

    host.appendChild(row);
  }

  function paintPortalLinkBody(body, meta, data) {
    body.innerHTML = "";
    const normalized = normalizeLinkData(data);
    if (normalized.clients.length) {
      renderLinkedPanel(body, meta, normalized);
      return;
    }
    renderQuickLinkPanel(body, meta, normalized, function (linkedData) {
      body.innerHTML = "";
      renderLinkedPanel(body, meta, linkedData);
    });
  }

  function renderPortalLinkSection(container, meta) {
    if (!container || !meta || !meta.key) return;
    container.innerHTML = "";

    const shell = document.createElement("div");
    shell.className = "review-detail-portal-section";

    const header = document.createElement("div");
    header.className = "review-detail-portal-head";
    header.textContent = "수임처 · 신고확인";
    shell.appendChild(header);

    const body = document.createElement("div");
    body.className = "review-detail-portal-body";
    shell.appendChild(body);
    container.appendChild(shell);

    const cached = resolveClientLinkData(meta.key, meta.linkOpts);

    if (cached) {
      const normalizedCached = normalizeLinkData(cached);
      paintPortalLinkBody(body, meta, normalizedCached);
      return;
    }

    body.innerHTML =
      '<span class="review-detail-portal-hint-inline">연결 정보 확인 중…</span>';
    fetchClientLinkData(meta.key, meta.linkOpts).then(function (data) {
      paintPortalLinkBody(body, meta, data);
    });
  }

  function fetchClientLinkSuggestions(key, opts) {
    opts = opts || {};
    const params = new URLSearchParams({ key: key, suggestions: "1" });
    if (opts.owner) params.set("owner", opts.owner);
    if (opts.personName) params.set("personName", opts.personName);
    return fetch("/api/review/client-link?" + params.toString())
      .then(function (res) {
        return res.ok ? res.json() : { suggestions: [] };
      })
      .then(function (data) {
        return Array.isArray(data.suggestions) ? data.suggestions : [];
      })
      .catch(function () {
        return [];
      });
  }

  function fetchClientLinkData(key, opts) {
    opts = opts || {};
    const cached = resolveClientLinkData(key, opts);
    if (cached) return Promise.resolve(normalizeLinkData(cached));

    const lookupKey = opts.scopedKey || key;
    const params = new URLSearchParams({ key: lookupKey });
    if (opts.owner) params.set("owner", opts.owner);
    if (opts.personName) params.set("personName", opts.personName);

    return fetch("/api/review/client-link?" + params.toString())
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        const normalized = normalizeLinkData(data);
        rememberClientLinkData(lookupKey, normalized);
        return normalized;
      })
      .catch(function () {
        return normalizeLinkData({});
      });
  }

  function rememberClientLinkData(key, normalized) {
    if (!key || !window.__REVIEW_CLIENT_LINKS_INDEX__) return;
    window.__REVIEW_CLIENT_LINKS_INDEX__[key] = {
      linked: !!normalized.linked,
      clients: normalized.clients || [],
      primary: normalized.primary || null,
      manual: !!normalized.manual,
    };
    installClientLinksResolver(window.__REVIEW_CLIENT_LINKS_INDEX__);
  }

  function resolveClientLinkData(key, opts) {
    opts = opts || {};
    const keys = [];
    if (opts.scopedKey) keys.push(opts.scopedKey);
    if (opts.owner && opts.baseKey && ReviewReadable.scopedReviewKey) {
      keys.push(ReviewReadable.scopedReviewKey(opts.owner, opts.baseKey, opts.personName));
    }
    if (key) keys.push(key);
    if (opts.baseKey && opts.baseKey !== key) keys.push(opts.baseKey);

    const resolve = window.__REVIEW_CLIENT_LINKS_RESOLVE__;
    const index = window.__REVIEW_CLIENT_LINKS_INDEX__;

    for (let i = 0; i < keys.length; i++) {
      const lookupKey = keys[i];
      if (!lookupKey) continue;
      if (resolve && resolve[lookupKey]) return resolve[lookupKey];
      if (index && index[lookupKey]) return index[lookupKey];
    }

    const legacyKey = opts.baseKey || key;
    if (!opts.owner && legacyKey && legacyKey.indexOf("/") < 0) {
      const altKeys = buildAltLinkKeysForName(legacyKey);
      for (let j = 0; j < altKeys.length; j++) {
        if (resolve && resolve[altKeys[j]]) return resolve[altKeys[j]];
        if (index && index[altKeys[j]]) return index[altKeys[j]];
      }
    }

    return null;
  }

  function attachRowDetailClick(tr, td, row, options, labelVal) {
    if (options.boardEditMode) return;
    tr.dataset.rowNum = String(row.r);
    td.classList.add("name-col-clickable");
    td.setAttribute("role", "button");
    td.setAttribute("tabindex", "0");
    td.setAttribute("aria-label", (labelVal ? String(labelVal) : "행") + " 상세정보");

    function openDetail(e) {
      if (e && e.target.closest(".corp-shareholder-count")) return;
      if (e) e.stopPropagation();
      const ctx = expandContext(options);
      if (window.__REVIEW_EMBED__) {
        ctx.companyLinkMeta = resolveCompanyLinkMetaForRow(row, ctx);
      }
      ReviewRowExpand.toggle(row, tr, ctx, null);
    }

    td.addEventListener("click", openDetail);
    td.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openDetail(e);
      }
    });
  }

  function attachNameClick(tr, td, row, options, col) {
    const colId = ReviewReadable.listColId(col);
    const nameVal = row.cells[colId] && row.cells[colId].v;
    attachRowDetailClick(tr, td, row, options, nameVal);
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
      owner: resolveSheetOwner(options, options.sheet || corpSheet),
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
    } else if (role === "person") {
      td.classList.add("cell-accent-person");
    } else if (role === "name") {
      td.classList.add("cell-accent-name");
      if (options.endStripe) {
        td.classList.add("cell-accent-name-end-stripe");
      }
    }
  }

  function isAccentNameColumn(col, kind) {
    if (kind === "income") return false;
    if (kind === "corp" && (col.key === "corp:1" || col.c === 1 || col.companyLink)) return true;
    return false;
  }

  function isAccentPersonColumn(col, kind) {
    return kind === "income" && col.c === 3;
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
    const reviewPage = document.getElementById("review-page");
    const stickyBar = reviewPage ? reviewPage.querySelector(".page-sticky-bar") : null;
    const stickyTop = stickyBar ? Math.ceil(stickyBar.getBoundingClientRect().height) : 0;
    const scrollWrap = table.parentElement;
    const stickyHead = scrollWrap ? scrollWrap.querySelector(".client-list-sticky-head") : null;
    const stickyHeadH = stickyHead ? Math.ceil(stickyHead.getBoundingClientRect().height || 34) : 34;
    table.style.setProperty("--review-table-sticky-top", stickyTop + "px");
    table.style.setProperty("--review-list-head-height", stickyHeadH + "px");
    if (scrollWrap) {
      scrollWrap.style.setProperty("--review-table-sticky-top", stickyTop + "px");
      scrollWrap.style.setProperty("--review-list-head-height", stickyHeadH + "px");
    }
    if (stickyHead) {
      stickyHead.style.setProperty("--review-table-sticky-top", stickyTop + "px");
      stickyHead.style.setProperty("--review-list-head-height", stickyHeadH + "px");
    }
    if (scrollWrap && stickyHead) {
      const stickyTable = stickyHead.querySelector("table");
      const bodyRow = table.querySelector(
        "tbody tr:not(.section-divider-row):not(.section-summary-row):not(.shareholder-inline-row)"
      );
      if (stickyTable && bodyRow) {
        const headCells = Array.from(stickyTable.querySelectorAll("thead th"));
        const bodyCells = Array.from(bodyRow.children);
        if (headCells.length === bodyCells.length) {
          stickyTable.style.width = table.getBoundingClientRect().width + "px";
          headCells.forEach(function (th, index) {
            const bodyCell = bodyCells[index];
            const width = Math.ceil(bodyCell.getBoundingClientRect().width);
            if (width > 0) {
              th.style.width = width + "px";
              th.style.minWidth = width + "px";
              th.style.maxWidth = width + "px";
            }
          });
        }
      }
    }
    if (kind !== "income") return;
    const firstDataRow = table.querySelector(
      "tbody tr:not(.section-divider-row):not(.section-summary-row):not(.shareholder-inline-row)"
    );
    if (firstDataRow) {
      const cells = Array.from(firstDataRow.children);
      const leadCell = cells[0];
      const personCell = cells[1];
      const leadW = leadCell ? Math.ceil(leadCell.getBoundingClientRect().width) : 0;
      const personW = personCell ? Math.ceil(personCell.getBoundingClientRect().width) : 0;
      if (leadW > 0) table.style.setProperty("--sticky-person-left", leadW + "px");
      if (leadW > 0 && personW > 0) table.style.setProperty("--sticky-name-left", leadW + personW + "px");
    }
    if (scrollWrap && stickyHead) {
      const shell = scrollWrap.parentElement;
      const dockScroll = shell ? shell.querySelector(".client-list-top-scroll--dock") : null;
      const wrapRect = scrollWrap.getBoundingClientRect();
      const tableRect = table.getBoundingClientRect();
      if (tableRect.top <= stickyTop && wrapRect.bottom > stickyTop + stickyHeadH + 12) {
        stickyHead.style.display = "block";
        stickyHead.style.position = "fixed";
        stickyHead.style.top = stickyTop + "px";
        stickyHead.style.left = wrapRect.left + "px";
        stickyHead.style.width = wrapRect.width + "px";
        if (dockScroll) {
          dockScroll.style.position = "fixed";
          dockScroll.style.top = stickyTop + stickyHeadH + "px";
          dockScroll.style.left = wrapRect.left + "px";
          dockScroll.style.width = wrapRect.width + "px";
          dockScroll.style.zIndex = "40";
        }
      } else {
        stickyHead.style.display = "none";
        if (dockScroll) {
          dockScroll.style.position = "";
          dockScroll.style.top = "";
          dockScroll.style.left = "";
          dockScroll.style.width = "";
          dockScroll.style.zIndex = "";
        }
      }
      if (!scrollWrap.__reviewStickyHeadBound) {
        scrollWrap.addEventListener("scroll", function () {
          applyStickyOffsets(table, kind);
        });
        [
          document.querySelector(".review-embed-root .grid-scroll"),
          document.querySelector(".portal-main-column"),
          window,
        ]
          .filter(Boolean)
          .forEach(function (host) {
            host.addEventListener("scroll", function () {
              applyStickyOffsets(table, kind);
            }, { passive: true });
          });
        window.addEventListener("resize", function () {
          applyStickyOffsets(table, kind);
        });
        scrollWrap.__reviewStickyHeadBound = true;
      }
    }
  }

  function toNumberValue(v) {
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    if (v == null) return 0;
    const n = Number(String(v).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function formatSectionFeeTotal(rows, kind) {
    if (kind !== "income") return "";
    let total = 0;
    rows.forEach(function (row) {
      total += toNumberValue(row.cells[14] && row.cells[14].v);
      total += toNumberValue(row.cells[26] && row.cells[26].v);
    });
    return total ? total.toLocaleString("ko-KR") + "원" : "0원";
  }

  function buildSectionGroups(rows, kind) {
    const out = [];
    let current = null;
    rows.forEach(function (row) {
      const sectionId = row.sectionId || row.filterKey || "default";
      const sectionLabel = row.sectionLabel || (row.isConsult ? "상담" : row.isTransfer ? "이관/폐업" : "기타");
      if (!current || current.id !== sectionId) {
        current = { id: sectionId, label: sectionLabel, rows: [] };
        out.push(current);
      }
      current.rows.push(row);
    });
    out.forEach(function (group) {
      group.feeTotalText = formatSectionFeeTotal(group.rows, kind);
    });
    return out;
  }

  function enableBoardEditOnList(table, sheetName, options) {
    if (!options.boardEditMode || options.readOnly) return;
    const canEditLayout = !!(
      options.canEditLayout != null
        ? options.canEditLayout
        : window.__REVIEW_SESSION__ && window.__REVIEW_SESSION__.canEditLayout
    );
    if (options.canEdit) {
      ReviewGridEdit.enableEditOnTable(table, sheetName, true, options.onPatch, {
        headerMaxR: 0,
        canEditHeader: false,
      });
    }
    if (!canEditLayout) return;
    const headerR = options.kind === "corp" ? 2 : 1;
    table.querySelectorAll("thead th[data-sheet-c] .th-label-text").forEach(function (label) {
      const th = label.closest("th");
      if (!th) return;
      label.contentEditable = "true";
      label.classList.add("cell-editable", "cell-editable-header");
      label.title = "제목 수정 (인디) · Enter로 확정";
      label.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          label.blur();
        }
      });
      label.addEventListener("blur", function () {
        const c = parseInt(th.getAttribute("data-sheet-c"), 10);
        if (!c || !sheetName) return;
        const text = (label.textContent || "").trim();
        ReviewGridEdit.applyFieldEdit(sheetName, headerR, c, text, options.onPatch);
      });
    });
  }

  function buildListHeader(table, visibleCols, kind, listKind, showSectionColumn, accentOnlyColumn, sectionHeader, options) {
    options = options || {};
    const canEditLayout = !!(
      options.boardEditMode &&
      (options.canEditLayout != null
        ? options.canEditLayout
        : window.__REVIEW_SESSION__ && window.__REVIEW_SESSION__.canEditLayout)
    );
    const thead = document.createElement("thead");
    const headTr = document.createElement("tr");
    if (showSectionColumn) {
      const thGroup = document.createElement("th");
      thGroup.className =
        "col-group col-sticky-lead col-id-section" + (accentOnlyColumn ? " col-group--accent-only" : "");
      thGroup.textContent = accentOnlyColumn ? "" : sectionHeader;
      if (accentOnlyColumn) thGroup.setAttribute("aria-label", "구분색");
      headTr.appendChild(thGroup);
    }
    visibleCols.forEach(function (col, colIndex) {
      const th = document.createElement("th");
      th.classList.add("col-id-" + String(ReviewReadable.listColId(col)).replace(/[^a-zA-Z0-9_-]/g, "-"));
      if (col.highlight) th.classList.add("col-highlight");
      if (col.wrap) th.classList.add("wrap");
      if (isAccentPersonColumn(col, kind)) th.classList.add("col-sticky-person");
      if (isAccentNameColumn(col, kind)) th.classList.add("col-sticky-name");
      if (typeof col.c === "number") th.setAttribute("data-sheet-c", String(col.c));

      const label = document.createElement("span");
      label.className = "th-label-text";
      label.textContent = listColDisplayLabel(col, kind, listKind);
      th.appendChild(label);

      if (canEditLayout) {
        const tools = document.createElement("span");
        tools.className = "th-layout-tools";
        const leftBtn = document.createElement("button");
        leftBtn.type = "button";
        leftBtn.className = "th-layout-btn";
        leftBtn.textContent = "◀";
        leftBtn.title = "열 왼쪽 이동";
        leftBtn.disabled = colIndex === 0;
        leftBtn.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (ReviewReadable.moveVisibleListCol(listKind, ReviewReadable.listColId(col), -1) && options.onRerender) {
            options.onRerender();
          }
        });
        const rightBtn = document.createElement("button");
        rightBtn.type = "button";
        rightBtn.className = "th-layout-btn";
        rightBtn.textContent = "▶";
        rightBtn.title = "열 오른쪽 이동";
        rightBtn.disabled = colIndex >= visibleCols.length - 1;
        rightBtn.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (ReviewReadable.moveVisibleListCol(listKind, ReviewReadable.listColId(col), 1) && options.onRerender) {
            options.onRerender();
          }
        });
        tools.appendChild(leftBtn);
        tools.appendChild(rightBtn);
        if (!col.sticky && visibleCols.length > 1) {
          const delBtn = document.createElement("button");
          delBtn.type = "button";
          delBtn.className = "th-layout-btn th-layout-btn--danger";
          delBtn.textContent = "×";
          delBtn.title = "항목 삭제";
          delBtn.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            const name = listColDisplayLabel(col, kind, listKind);
            if (!confirm("「" + name + "」 항목을 목록에서 제거할까요?")) return;
            if (ReviewReadable.removeVisibleListCol(listKind, ReviewReadable.listColId(col)) && options.onRerender) {
              options.onRerender();
            }
          });
          tools.appendChild(delBtn);
        }
        th.appendChild(tools);
      }

      headTr.appendChild(th);
    });
    thead.appendChild(headTr);
    table.appendChild(thead);
  }

  function syncListScrollPositions(wrap, source) {
    if (!wrap) return;
    const shell = wrap.parentElement;
    const topScroll = shell ? shell.querySelector(".client-list-top-scroll--dock") : null;
    const left = source && typeof source.scrollLeft === "number" ? source.scrollLeft : wrap.scrollLeft;
    if (wrap.scrollLeft !== left) wrap.scrollLeft = left;
    if (topScroll && topScroll.scrollLeft !== left) topScroll.scrollLeft = left;
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
    const showSections = kind === "income" && options.showSections !== false;

    const shell = document.createElement("div");
    shell.className = "client-list-shell";

    const canEditLayout = !!(
      options.boardEditMode &&
      (options.canEditLayout != null
        ? options.canEditLayout
        : window.__REVIEW_SESSION__ && window.__REVIEW_SESSION__.canEditLayout)
    );
    if (canEditLayout) {
      const layoutBar = document.createElement("div");
      layoutBar.className = "client-list-layout-bar";
      const hint = document.createElement("span");
      hint.className = "client-list-layout-hint";
      hint.textContent = "제목·순서·항목 추가/삭제 (인디)";
      layoutBar.appendChild(hint);

      const hidden = ReviewReadable.getHiddenListCols(listKind);
      if (hidden.length) {
        const select = document.createElement("select");
        select.className = "client-list-layout-add-select";
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "항목 추가…";
        select.appendChild(placeholder);
        hidden.forEach(function (col) {
          const opt = document.createElement("option");
          opt.value = String(ReviewReadable.listColId(col));
          opt.textContent = listColDisplayLabel(col, kind, listKind);
          select.appendChild(opt);
        });
        select.addEventListener("change", function () {
          const id = select.value;
          if (!id) return;
          if (ReviewReadable.addVisibleListCol(listKind, id) && options.onRerender) {
            options.onRerender();
          }
        });
        layoutBar.appendChild(select);
      } else {
        const none = document.createElement("span");
        none.className = "client-list-layout-hint";
        none.textContent = "추가할 숨김 항목 없음";
        layoutBar.appendChild(none);
      }
      shell.appendChild(layoutBar);
    }

    const topScroll = document.createElement("div");
    topScroll.className = "client-list-top-scroll client-list-top-scroll--dock";
    const topScrollInner = document.createElement("div");
    topScrollInner.className = "client-list-top-scroll-inner";
    topScroll.appendChild(topScrollInner);
    shell.appendChild(topScroll);

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
    buildListHeader(table, visibleCols, kind, listKind, showSectionColumn, accentOnlyColumn, sectionHeader, options);

    const stickyHead = document.createElement("div");
    stickyHead.className = "client-list-sticky-head";
    const stickyTable = document.createElement("table");
    stickyTable.className = tableClass + " client-list-table--sticky-head";
    buildListHeader(stickyTable, visibleCols, kind, listKind, showSectionColumn, accentOnlyColumn, sectionHeader, options);
    stickyHead.appendChild(stickyTable);
    wrap.appendChild(stickyHead);
    shell.appendChild(wrap);

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
      const groupedRows =
        kind === "income" && showSections ? buildSectionGroups(rows, kind) : [{ id: "all", label: "", rows: rows }];
      groupedRows.forEach(function (group) {
        if (kind === "income" && showSections) {
          const dividerTr = document.createElement("tr");
          dividerTr.className = "section-divider-row";
          const dividerTd = document.createElement("td");
          dividerTd.colSpan = colCount;
          dividerTd.className = "section-divider-cell";
          const dividerInner = document.createElement("div");
          dividerInner.className = "section-divider-inner";
          const title = document.createElement("span");
          title.className = "section-divider-title";
          title.textContent = group.label;
          dividerInner.appendChild(title);
          dividerTd.appendChild(dividerInner);
          dividerTr.appendChild(dividerTd);
          tbody.appendChild(dividerTr);
        }

        group.rows.forEach(function (row) {
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
          td.classList.add("col-id-" + String(colId).replace(/[^a-zA-Z0-9_-]/g, "-"));
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
            td.title = String(ReviewReadable.formatVal(v));
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
            if (
              kind === "income" &&
              col.c === 3 &&
              ReviewReadable.hasValue(data.v) &&
              !options.boardEditMode
            ) {
              attachRowDetailClick(tr, td, row, options, data.v);
            }
          }
          if (isAccentPersonColumn(col, kind) && !ReviewReadable.isExcelEmphasisBg(data.bg)) {
            paintAccentCell(td, row, "person");
          }
          if (isAccentNameColumn(col, kind) && !ReviewReadable.isExcelEmphasisBg(data.bg)) {
            paintAccentCell(td, row, "name", { endStripe: kind === "corp" });
          } else if (kind !== "income" && kind !== "corp" && data.bg && !accent) {
            td.style.backgroundColor = data.bg;
          }
          paintListCellEmphasis(td, data, kind, row, col);
          td.classList.add(
            "col-id-" + String(ReviewReadable.listColId(col)).replace(/[^a-zA-Z0-9_-]/g, "-")
          );
          if (col.highlight) td.classList.add("col-highlight");
          if (col.num || typeof data.v === "number") td.classList.add("num");
          if (col.wrap || col.c === 5 || col.c === 11 || col.c === 21) td.classList.add("wrap");
          if (isAccentPersonColumn(col, kind)) td.classList.add("col-sticky-person");
          if (isAccentNameColumn(col, kind)) td.classList.add("col-sticky-name");
          if (!ReviewReadable.hasValue(data.v)) td.classList.add("is-empty");
          tr.appendChild(td);
        });

        tbody.appendChild(tr);
        });

        if (kind === "income" && showSections) {
          const sumTr = document.createElement("tr");
          sumTr.className = "section-summary-row";
          const sumTd = document.createElement("td");
          sumTd.colSpan = colCount;
          sumTd.className = "section-summary-cell";
          const sumInner = document.createElement("div");
          sumInner.className = "section-summary-inner";
          const sumLabel = document.createElement("span");
          sumLabel.className = "section-summary-label";
          sumLabel.textContent = group.label + " 수수료 합계";
          const sumValue = document.createElement("span");
          sumValue.className = "section-summary-fee";
          sumValue.textContent = group.feeTotalText;
          sumInner.appendChild(sumLabel);
          sumInner.appendChild(sumValue);
          sumTd.appendChild(sumInner);
          sumTr.appendChild(sumTd);
          tbody.appendChild(sumTr);
        }
      });
    }

    table.appendChild(tbody);
    wrap.appendChild(table);
    if (options.boardEditMode && options.sheet && options.sheet.name) {
      enableBoardEditOnList(table, options.sheet.name, options);
      enableBoardEditOnList(stickyTable, options.sheet.name, options);
    }
    requestAnimationFrame(function () {
      applyStickyOffsets(table, kind);
      topScrollInner.style.width = table.getBoundingClientRect().width + "px";
      syncListScrollPositions(wrap, wrap);
    });
    if (!wrap.__reviewStickyResizeBound) {
      window.addEventListener("resize", function () {
        applyStickyOffsets(table, kind);
        topScrollInner.style.width = table.getBoundingClientRect().width + "px";
        syncListScrollPositions(wrap, wrap);
      });
      wrap.__reviewStickyResizeBound = true;
    }
    if (!wrap.__reviewTopScrollBound) {
      wrap.addEventListener("scroll", function () {
        syncListScrollPositions(wrap, wrap);
      });
      topScroll.addEventListener("scroll", function () {
        syncListScrollPositions(wrap, topScroll);
      });
      wrap.__reviewTopScrollBound = true;
    }
    return shell;
  }

  function renderBoardContent(sheet, host, options, config) {
    const owner = resolveSheetOwner(options, sheet);
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
    const owner = resolveSheetOwner(options, sheet);
    const sections = ReviewGridSections.getSections(sheet);
    let checkedKinds = ReviewGridSections.getIncomeMainFilters(owner, sections);
    let showExcluded = ReviewGridSections.getIncomeExcludedVisible(owner);
    let showSections = getSectionDisplayEnabled();
    let activeSheet = sheet;

    const boardOpts = Object.assign({}, options, {
      sheet: activeSheet,
      owner: owner,
      kind: "income",
      showSections: showSections,
    });

    const root = document.createElement("div");
    root.className = "client-list-root";

    const mainHost = document.createElement("div");
    mainHost.className = "client-list-host income-main";

    const excludedSection = document.createElement("section");
    excludedSection.className = "income-consult-section income-excluded-section";
    const excludedTitle = document.createElement("h3");
    excludedTitle.className = "income-consult-title";
    excludedTitle.textContent = "이관/폐업/상담";
    excludedSection.appendChild(excludedTitle);
    const excludedHost = document.createElement("div");
    excludedHost.className = "client-list-host income-consult";
    excludedSection.appendChild(excludedHost);

    function allIncomeRows() {
      return ReviewReadable.buildIncomeClientRows(activeSheet);
    }

    function mainRows() {
      return allIncomeRows().filter(function (row) {
        return row.filterKey !== "excluded";
      });
    }

    function excludedRows() {
      return allIncomeRows().filter(function (row) {
        return row.filterKey === "excluded";
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
        renderClientList(
          rows,
          Object.assign({}, boardOpts, { listMode: "income", filterEmpty: filterEmpty, showSections: showSections })
        )
      );
    }

    function refreshExcluded() {
      excludedHost.innerHTML = "";
      if (!showExcluded) {
        excludedSection.hidden = true;
        return;
      }
      excludedSection.hidden = false;
      let rows = excludedRows();
      if (options.searchQuery) {
        rows = ReviewReadable.filterIncomeClientRows(rows, activeSheet, options.searchQuery);
      }
      excludedHost.appendChild(
        renderClientList(rows, Object.assign({}, boardOpts, { listMode: "income", showSections: showSections }))
      );
    }

    function refreshAll() {
      refreshMain();
      refreshExcluded();
    }

    boardOpts.onRerender = function () {
      activeSheet = ReviewGridEdit.applyPatchesToSheet(activeSheet);
      boardOpts.sheet = activeSheet;
      refreshAll();
    };
    boardOpts.onSectionDisplayChange = function (next) {
      showSections = next;
      boardOpts.showSections = next;
      refreshAll();
    };

    const filterBar = renderIncomeMainFilterBar(sections, owner, checkedKinds, function (next) {
      checkedKinds = next;
      refreshMain();
    }, {
      showExcluded: showExcluded,
      onExcludedChange: function (next) {
        showExcluded = next;
        refreshExcluded();
      },
    });

    const toolbar = buildListToolbar("income", refreshAll, filterBar, boardOpts);

    root.appendChild(toolbar);
    root.appendChild(mainHost);
    if (ReviewGridSections.hasExcludedSection(sections)) {
      root.appendChild(excludedSection);
    }
    refreshAll();
    host.appendChild(root);
  }

  function renderCorpBoardContent(sheet, host, options) {
    const owner = resolveSheetOwner(options, sheet) || "담당";
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
    resolveCompanyLinkMetaForRow,
    installClientLinksIndex,
    renderPortalLinkSection,
  };
})();
