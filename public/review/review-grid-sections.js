(function () {
  "use strict";

  const SECTION_LABELS = {
    bookkeeping: "기장",
    sincere: "성실",
    corp_client: "업체",
    agent: "신고",
    transfer: "이관/폐업",
    consult: "상담",
  };

  const FULL_KEY = "reviewIncomeFullView";
  const SECTION_KEY = "reviewIncomeSection";
  const FILTERS_KEY = "reviewIncomeFilters";

  const FILTER_KINDS = [
    { key: "bookkeeping", label: "기장" },
    { key: "sincere", label: "성실" },
    { key: "corp_client", label: "업체" },
    { key: "agent", label: "신고" },
    { key: "transfer", label: "이관/폐업" },
    { key: "consult", label: "상담" },
  ];

  const MARKER_COL = 2;

  function classifyMarker(value) {
    if (value === null || value === undefined || typeof value !== "string") return null;
    const raw = value.trim();
    const s = raw.replace(/\s/g, "");
    if (raw.indexOf("이관") >= 0 && raw.indexOf("폐업") >= 0) return "transfer";
    if (s === "상담" || /^상담\d*$/.test(s)) return "consult";
    if (s === "소계" || s === "합계") return null;
    if (/^기장\d*$/.test(s) || (s.indexOf("기장") === 0 && s.length <= 8)) return "bookkeeping";
    if (/^성실\d*$/.test(s) || (s.indexOf("성실") === 0 && s.length <= 8)) return "sincere";
    if (/^업체\d*$/.test(s) || (s.indexOf("업체") === 0 && s.length <= 8)) return "corp_client";
    if (/^신고\d*$/.test(s) || (s.indexOf("신고") === 0 && s.length <= 8)) return "agent";
    return null;
  }

  function sectionDict(m, startR, endR, idPrefix) {
    return {
      id: idPrefix ? idPrefix + m.kind + "-" + startR : m.kind,
      kind: m.kind,
      label: SECTION_LABELS[m.kind],
      startR: startR,
      endR: endR,
      rowCount: endR - startR + 1,
      marker: m.marker,
    };
  }

  function buildMarkerSections(markers, endR, idPrefix) {
    const out = [];
    for (let i = 0; i < markers.length; i++) {
      const startR = markers[i].r;
      const nextR = i + 1 < markers.length ? markers[i + 1].r : endR + 1;
      out.push(sectionDict(markers[i], startR, nextR - 1, idPrefix || ""));
    }
    return out;
  }

  function detectSections(sheet) {
    const markerCol = (sheet.meta && sheet.meta.markerCol) || MARKER_COL;
    const markers = [];
    for (let r = 2; r <= sheet.maxR; r++) {
      const cell = cellAt(sheet, r, markerCol);
      const kind = classifyMarker(cell ? cell.v : null);
      if (kind) markers.push({ r: r, kind: kind, marker: cell && cell.v ? String(cell.v).trim() : "" });
    }

    let transferI = -1;
    let consultI = -1;
    for (let i = 0; i < markers.length; i++) {
      if (markers[i].kind === "transfer" && transferI < 0) transferI = i;
      if (markers[i].kind === "consult") consultI = i;
    }

    const splitAt = transferI >= 0 ? transferI : consultI >= 0 ? consultI : markers.length;
    const preMain = markers.slice(0, splitAt);
    const mainMarkers = [];
    const preTransfer = [];
    let seenAgent = false;

    preMain.forEach(function (m) {
      if (m.kind === "agent") {
        seenAgent = true;
        mainMarkers.push(m);
      } else if (seenAgent && (m.kind === "bookkeeping" || m.kind === "sincere" || m.kind === "corp_client" || m.kind === "agent")) {
        preTransfer.push(m);
      } else {
        mainMarkers.push(m);
      }
    });

    const mainEnd =
      transferI >= 0 ? markers[transferI].r - 1 : consultI >= 0 ? markers[consultI].r - 1 : sheet.maxR;

    const sections = [];
    for (let i = 0; i < mainMarkers.length; i++) {
      const startR = mainMarkers[i].r;
      let endR;
      if (i + 1 < mainMarkers.length) {
        endR = mainMarkers[i + 1].r - 1;
      } else if (preTransfer.length) {
        endR = preTransfer[0].r - 1;
      } else {
        endR = mainEnd;
      }
      sections.push(Object.assign(sectionDict(mainMarkers[i], startR, endR), { children: [] }));
    }

    if (transferI >= 0) {
      const childMarkers = preTransfer.concat(
        markers.slice(transferI + 1, consultI >= 0 ? consultI : markers.length)
      );
      const childEnd = consultI >= 0 ? markers[consultI].r - 1 : sheet.maxR;
      const children = buildMarkerSections(childMarkers, childEnd, "transfer-");
      const tm = markers[transferI];
      sections.push(
        Object.assign(sectionDict(tm, tm.r, children.length ? children[children.length - 1].endR : childEnd), {
          id: "transfer",
          label: SECTION_LABELS.transfer,
          children: children,
        })
      );
    }

    if (consultI >= 0) {
      const cm = markers[consultI];
      sections.push(
        Object.assign(sectionDict(cm, cm.r, sheet.maxR), {
          id: "consult",
          label: SECTION_LABELS.consult,
          children: [],
        })
      );
    }

    return sections;
  }

  function sectionsLookBroken(sections) {
    if (!sections || !sections.length) return true;
    const hasMain = sections.some(function (s) {
      return s.kind === "bookkeeping" || s.kind === "sincere" || s.kind === "corp_client" || s.kind === "agent";
    });
    if (!hasMain && sections.every(function (s) {
      return s.kind === "transfer";
    })) {
      return true;
    }
    return false;
  }

  function getSections(sheet) {
    if (sheet.meta && sheet.meta.sections && sheet.meta.sections.length && !sectionsLookBroken(sheet.meta.sections)) {
      return sheet.meta.sections;
    }
    return detectSections(sheet);
  }

  function cellAt(sheet, r, c) {
    for (let i = 0; i < sheet.cells.length; i++) {
      const cell = sheet.cells[i];
      if (cell.r === r && cell.c === c) return cell;
    }
    return null;
  }

  function storageKey(base, owner) {
    return base + ":" + (owner || "default");
  }

  function getFullView(owner) {
    try {
      return sessionStorage.getItem(storageKey(FULL_KEY, owner)) === "1";
    } catch {
      return false;
    }
  }

  function setFullView(owner, on) {
    sessionStorage.setItem(storageKey(FULL_KEY, owner), on ? "1" : "0");
  }

  function getActiveSectionId(owner) {
    try {
      return sessionStorage.getItem(storageKey(SECTION_KEY, owner));
    } catch {
      return null;
    }
  }

  function setActiveSectionId(owner, id) {
    sessionStorage.setItem(storageKey(SECTION_KEY, owner), id);
  }

  function findSection(sections, id) {
    for (let i = 0; i < sections.length; i++) {
      const sec = sections[i];
      if (sec.id === id) return sec;
      if (sec.children) {
        for (let j = 0; j < sec.children.length; j++) {
          if (sec.children[j].id === id) return sec.children[j];
        }
      }
    }
    return sections[0] || null;
  }

  function findRowSection(r, sections) {
    for (let i = 0; i < sections.length; i++) {
      const sec = sections[i];
      if (sec.kind === "transfer" && sec.children) {
        for (let j = 0; j < sec.children.length; j++) {
          const ch = sec.children[j];
          if (r >= ch.startR && r <= ch.endR) {
            return { parent: sec, section: ch };
          }
        }
      }
    }
    for (let i = 0; i < sections.length; i++) {
      const sec = sections[i];
      if (sec.children && sec.children.length) continue;
      if (r >= sec.startR && r <= sec.endR) {
        return { parent: sec, section: sec };
      }
    }
    return { parent: null, section: null };
  }

  function getAvailableFilterKinds(sections) {
    const keys = new Set();
    sections.forEach(function (sec) {
      if (sec.kind === "transfer") {
        if (sec.children && sec.children.length) keys.add("transfer");
      } else if (sec.kind === "consult") {
        keys.add("consult");
      } else if (FILTER_KINDS.some(function (f) {
        return f.key === sec.kind;
      })) {
        keys.add(sec.kind);
      }
    });
    return FILTER_KINDS.filter(function (f) {
      return keys.has(f.key);
    });
  }

  function getIncomeMainFilterKinds(sections) {
    return getAvailableFilterKinds(sections).filter(function (f) {
      return f.key !== "consult";
    });
  }

  function getIncomeMainFilters(owner, sections) {
    const available = getIncomeMainFilterKinds(sections);
    const availableKeys = available.map(function (f) {
      return f.key;
    });
    try {
      const raw = sessionStorage.getItem(storageKey(FILTERS_KEY, owner));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter(function (k) {
            return availableKeys.indexOf(k) >= 0;
          });
          if (filtered.length) return filtered;
        }
      }
    } catch {
      /* ignore */
    }
    return availableKeys.slice();
  }

  function getIncomeFilters(owner, sections) {
    const available = getAvailableFilterKinds(sections);
    const availableKeys = available.map(function (f) {
      return f.key;
    });
    try {
      const raw = sessionStorage.getItem(storageKey(FILTERS_KEY, owner));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter(function (k) {
            return availableKeys.indexOf(k) >= 0;
          });
          if (filtered.length) return filtered;
        }
      }
    } catch {
      /* ignore */
    }
    return availableKeys.slice();
  }

  function setIncomeFilters(owner, kinds) {
    sessionStorage.setItem(storageKey(FILTERS_KEY, owner), JSON.stringify(kinds));
  }

  function findParentSection(sections, childId) {
    for (let i = 0; i < sections.length; i++) {
      const sec = sections[i];
      if (!sec.children) continue;
      for (let j = 0; j < sec.children.length; j++) {
        if (sec.children[j].id === childId) return sec;
      }
    }
    return null;
  }

  function defaultSectionId(sections) {
    if (!sections.length) return null;
    const first = sections[0];
    if (first.kind === "transfer" && first.children && first.children.length) {
      return first.children[0].id;
    }
    return first.id;
  }

  function sectionRowFilter(startR, endR, headerR) {
    return function (r, sheetHeaderR) {
      const h = sheetHeaderR || headerR;
      if (r === h) return true;
      return r >= startR && r <= endR;
    };
  }

  function renderIncomeSection(sheet, host, options) {
    const owner = options.owner || sheet.meta && sheet.meta.owner;
    const sections = getSections(sheet);
    const sec = document.createElement("section");
    sec.className = "excel-section excel-section-income";

    const head = document.createElement("div");
    head.className = "excel-section-head income-section-head";
    const h2 = document.createElement("h2");
    h2.textContent = "종합소득세 · " + sheet.name;
    head.appendChild(h2);

    const toolbar = document.createElement("div");
    toolbar.className = "income-toolbar";

    const fullBtn = document.createElement("button");
    fullBtn.type = "button";
    fullBtn.className = "income-toggle-btn";
    const fullView = getFullView(owner);
    fullBtn.textContent = fullView ? "구간별 보기" : "전체 보기";
    fullBtn.addEventListener("click", function () {
      setFullView(owner, !getFullView(owner));
      options.onRerender();
    });
    toolbar.appendChild(fullBtn);
    head.appendChild(toolbar);
    sec.appendChild(head);

    const body = document.createElement("div");
    body.className = "income-body";
    sec.appendChild(body);

    if (!sections.length || fullView) {
      const gridHost = document.createElement("div");
      gridHost.className = "section-grid";
      body.appendChild(gridHost);
      mountGrid(sheet, gridHost, options, null);
      host.appendChild(sec);
      return sec;
    }

    let activeId = getActiveSectionId(owner);
    if (!activeId || !findSection(sections, activeId)) {
      activeId = defaultSectionId(sections);
    }

    const layout = document.createElement("div");
    layout.className = "income-layout";

    const nav = document.createElement("nav");
    nav.className = "section-nav";
    nav.setAttribute("aria-label", "종소세 구간");

    const content = document.createElement("div");
    content.className = "section-content";

    function renderActive() {
      content.innerHTML = "";
      const active = findSection(sections, activeId);
      if (!active) return;

      const parent = findParentSection(sections, activeId);
      if (parent && parent.children && parent.children.length > 1) {
        const sub = document.createElement("div");
        sub.className = "subsection-tabs";
        parent.children.forEach(function (child) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "subsection-tab" + (child.id === activeId ? " active" : "");
          const dup =
            parent.children.filter(function (c) {
              return c.label === child.label;
            }).length > 1;
          btn.textContent = dup
            ? child.label + " (" + child.startR + "–" + child.endR + ")"
            : child.label + " (" + child.rowCount + ")";
          btn.addEventListener("click", function () {
            activeId = child.id;
            setActiveSectionId(owner, activeId);
            renderNav();
            renderActive();
          });
          sub.appendChild(btn);
        });
        content.appendChild(sub);
      }

      const title = document.createElement("div");
      title.className = "section-content-title";
      title.textContent =
        active.label +
        " · " +
        active.rowCount +
        "행 (엑셀 " +
        active.startR +
        "–" +
        active.endR +
        "행)";
      content.appendChild(title);

      const gridHost = document.createElement("div");
      gridHost.className = "section-grid";
      content.appendChild(gridHost);
      mountGrid(sheet, gridHost, options, active);
    }

    function renderNav() {
      nav.innerHTML = "";
      sections.forEach(function (item) {
        const btn = document.createElement("button");
        btn.type = "button";
        const isTransfer = item.kind === "transfer";
        const childActive =
          isTransfer &&
          item.children &&
          item.children.some(function (c) {
            return c.id === activeId;
          });
        const isActive = item.id === activeId || childActive;
        btn.className = "section-nav-btn" + (isActive ? " active" : "");
        if (isTransfer) btn.classList.add("section-nav-btn-group");

        const label = document.createElement("span");
        label.className = "section-nav-label";
        label.textContent = item.label;

        const count = document.createElement("span");
        count.className = "section-nav-count";
        count.textContent = item.rowCount + "행";

        btn.appendChild(label);
        btn.appendChild(count);

        btn.addEventListener("click", function () {
          if (isTransfer && item.children && item.children.length) {
            activeId = item.children[0].id;
          } else {
            activeId = item.id;
          }
          setActiveSectionId(owner, activeId);
          renderNav();
          renderActive();
        });

        nav.appendChild(btn);
      });
    }

    function mountGrid(targetSheet, gridHost, opts, section) {
      const renderOpts = { readOnly: opts.readOnly };
      if (section) {
        renderOpts.rowFilter = sectionRowFilter(section.startR, section.endR, targetSheet.minR);
      }

      const table = ReviewGridCore.renderSheet(targetSheet, gridHost, renderOpts);

      if (opts.canEdit && !opts.readOnly) {
        ReviewGridEdit.enableEditOnTable(table, targetSheet.name, true, opts.onPatch);
      }

      if (opts.searchQuery && opts.applySearchFilter) {
        opts.applySearchFilter(table, targetSheet, opts.searchQuery, "income");
      }
    }

    layout.appendChild(nav);
    layout.appendChild(content);
    body.appendChild(layout);

    renderNav();
    renderActive();
    host.appendChild(sec);
    return sec;
  }

  window.ReviewGridSections = {
    getSections,
    detectSections,
    renderIncomeSection,
    getFullView,
    setFullView,
    getActiveSectionId,
    setActiveSectionId,
    findSection,
    findParentSection,
    findRowSection,
    getAvailableFilterKinds,
    getIncomeMainFilterKinds,
    getIncomeMainFilters,
    getIncomeFilters,
    setIncomeFilters,
    FILTER_KINDS,
    defaultSectionId,
  };
})();
