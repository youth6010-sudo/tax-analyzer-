(function () {

  "use strict";



  const SELECT_KEY = "reviewSelectedPanel";

  const TAX_KEY = "reviewTaxTab";

  let lastMountedPanelId = null;
  let remountingPanel = false;



  function findSheet(sheets, name) {

    return sheets.find(function (s) {

      return s.name === name;

    });

  }



  function getSelectedId() {

    try {

      return sessionStorage.getItem(SELECT_KEY);

    } catch {

      return null;

    }

  }



  function saveSelectedId(id) {

    sessionStorage.setItem(SELECT_KEY, id);

  }



  function getTaxTab() {

    try {

      return sessionStorage.getItem(TAX_KEY) || "income";

    } catch {

      return "income";

    }

  }



  function saveTaxTab(tab) {

    sessionStorage.setItem(TAX_KEY, tab);

  }



  function invalidatePanels(data) {
    if (!data) return;
    data._shared = null;
    data.panels.forEach(function (panel) {
      panel.hydrated = false;
      panel.incomeSheet = null;
      panel.corpSheet = null;
      panel.corpFullSheet = null;
      panel.feeSheet = null;
      panel.corpTaxSheets = null;
      panel.stats = null;
      panel.summary = "";
    });
    if (data.feePanel) {
      data.feePanel.hydrated = false;
      data.feePanel.feeSheet = null;
      data.feePanel.summary = "";
    }
  }

  function sheetsByName(sheets) {
    const map = {};
    (sheets || []).forEach(function (s) {
      if (s && s.name) map[s.name] = s;
    });
    return map;
  }

  function buildSharedSheets(access, byName) {
    const corpFull = access.corpSheet ? byName[access.corpSheet] : null;
    const feeSheetRaw = access.corpFeeSheet ? byName[access.corpFeeSheet] : null;
    return {
      corpFull: corpFull,
      patchedCorpFull: corpFull ? ReviewGridEdit.applyPatchesToSheet(corpFull) : null,
      patchedFee: feeSheetRaw ? ReviewGridEdit.applyPatchesToSheet(feeSheetRaw) : null,
    };
  }

  function getSharedSheets(data) {
    if (!data._shared) {
      data._shared = buildSharedSheets(data.access, data._sheetsByName || {});
    }
    return data._shared;
  }

  function hydratePanel(panel, data) {
    if (!panel || panel.hydrated) return panel;

    const access = data.access;
    const byName = data._sheetsByName || {};
    const shared = getSharedSheets(data);
    const map = (access.sheetMap && access.sheetMap[panel.owner]) || {};
    const corpTaxVersions = panel.corpTaxVersions || ReviewReadable.getCorpTaxVersions(access);

    const incomeSheetRaw = map.income ? byName[map.income] : null;
    let corpSheet = null;
    if (shared.corpFull && map.corpCols) {
      corpSheet = ReviewGridCore.sliceSheet(shared.corpFull, map.corpCols[0], map.corpCols[1]);
    }

    const patchedIncome = incomeSheetRaw ? ReviewGridEdit.applyPatchesToSheet(incomeSheetRaw) : null;
    const patchedCorp = corpSheet ? ReviewGridEdit.applyPatchesToSheet(corpSheet) : null;

    const corpTaxSheets = {};
    corpTaxVersions.forEach(function (ver) {
      const taxFull = byName[ver.sheet];
      if (taxFull && map.corpCols) {
        const taxSlice = ReviewGridCore.sliceSheet(taxFull, map.corpCols[0], map.corpCols[1]);
        corpTaxSheets[ver.id] = ReviewGridEdit.applyPatchesToSheet(taxSlice);
      } else {
        corpTaxSheets[ver.id] = null;
      }
    });

    const stats = ReviewReadable.computePanelStats(
      patchedIncome,
      patchedCorp,
      shared.patchedFee,
      panel.owner
    );

    panel.incomeSheet = patchedIncome;
    panel.corpSheet = patchedCorp;
    panel.corpFullSheet = shared.patchedCorpFull;
    panel.feeSheet = shared.patchedFee;
    panel.corpTaxSheets = corpTaxSheets;
    panel.corpTaxVersions = corpTaxVersions;
    panel.stats = stats;
    panel.summary = ReviewReadable.formatPanelSummary(stats);
    panel.hydrated = true;
    return panel;
  }

  function hydrateFeePanel(feePanel, data) {
    if (!feePanel || feePanel.hydrated) return feePanel;
    const shared = getSharedSheets(data);
    if (shared.patchedFee) {
      feePanel.feeSheet = shared.patchedFee;
      feePanel.summary = shared.patchedFee.maxR - shared.patchedFee.minR + 1 + "행";
    }
    feePanel.hydrated = true;
    return feePanel;
  }

  async function buildPanels(user, access, sheets) {

    const master = await ReviewAuth.isMaster(user);

    const owners = master ? access.incomeOrder : [user];

    const panels = [];

    const corpTaxVersions = ReviewReadable.getCorpTaxVersions(access);

    for (const owner of owners) {

      const map = access.sheetMap[owner];

      if (map === undefined) continue;



      panels.push({

        id: "panel-" + owner,

        owner: owner,

        title: owner,

        summary: "",

        stats: null,

        hydrated: false,

        incomeSheet: null,

        corpSheet: null,

        corpFullSheet: null,

        feeSheet: null,

        corpTaxSheets: null,

        corpTaxVersions: corpTaxVersions,

        readOnly: !master && owner !== user,

      });

    }



    let feePanel = null;

    if (master && access.corpFeeSheet) {

      feePanel = {

        id: "panel-fee",

        owner: null,

        title: access.corpFeeSheet,

        summary: "",

        hydrated: false,

        feeSheet: null,

        readOnly: false,

        stats: null,

      };

    }



    return {
      panels: panels,
      feePanel: feePanel,
      master: master,
      access: access,
      _sheetsByName: sheetsByName(sheets),
      _shared: null,
    };

  }



  function rowMatchesSearch(sheet, r, query, kind) {

    if (!query) return true;

    const q = query.toLowerCase();

    const map = ReviewGridCore.buildCellMap(sheet.cells);

    const cols =

      kind === "corp"

        ? [sheet.minC, sheet.minC + 1, sheet.minC + 2, sheet.minC + 4, sheet.minC + 5]

        : [3, 4, 5, 21];



    for (let i = 0; i < cols.length; i++) {

      const cell = map.get(r + ":" + cols[i]);

      if (cell && cell.v !== null && cell.v !== undefined) {

        if (String(cell.v).toLowerCase().indexOf(q) >= 0) return true;

      }

    }

    return false;

  }



  function applySearchFilter(table, sheet, query, kind) {

    if (!query || kind === "fee") return;

    const headerEnd = kind === "corp" ? 2 : 1;

    table.querySelectorAll("tbody tr").forEach(function (tr) {

      const r = parseInt(tr.dataset.sheetRow, 10);

      if (!r || r <= headerEnd) return;

      const match = rowMatchesSearch(sheet, r, query, kind);

      tr.classList.toggle("search-hidden", !match);

    });

  }




  function renderExcelSection(title, sheet, host, options) {

    const sec = document.createElement("section");

    sec.className = "excel-section";



    const head = document.createElement("div");

    head.className = "excel-section-head";

    const h2 = document.createElement("h2");

    h2.textContent = title;

    head.appendChild(h2);

    sec.appendChild(head);



    const gridHost = document.createElement("div");

    gridHost.className = "section-grid";

    sec.appendChild(gridHost);



    const table = ReviewGridCore.renderSheet(sheet, gridHost, {
      readOnly: options.readOnly,
    });



    if (options.canEdit && !options.readOnly) {

      ReviewGridEdit.enableEditOnTable(table, sheet.name, true, options.onPatch);

    }



    if (options.searchQuery) {

      applySearchFilter(table, sheet, options.searchQuery, options.kind);

    }



    host.appendChild(sec);

    return sec;

  }



  function renderPanelBody(panel, options) {

    const wrap = document.createElement("div");

    wrap.className = "panel-excel-wrap";

    const taxTab = options.taxTab || "income";

    const boardOpts = {
      owner: panel.owner,
      readOnly: panel.readOnly,
      canEdit: options.canEdit,
      boardEditMode: options.boardEditMode,
      onPatch: options.onPatch,
      searchQuery: options.searchQuery,
      onRerender: options.onRerender,
    };

    if (taxTab === "income" && panel.incomeSheet) {
      ReviewBoardView.renderIncomeBoard(panel.incomeSheet, wrap, boardOpts);
    }

    if (taxTab === "corp" && (panel.corpSheet || panel.feeSheet)) {
      ReviewBoardView.renderCorpBoard(panel.corpSheet, wrap, Object.assign({}, boardOpts, {
        feeSheet: panel.feeSheet,
        corpFullSheet: panel.corpFullSheet,
        corpTaxSheets: panel.corpTaxSheets,
        corpTaxVersions: panel.corpTaxVersions,
      }));
    }

    if (!wrap.children.length) {
      wrap.innerHTML = '<p class="loading">이 탭에 표시할 데이터가 없습니다.</p>';
    } else {
      const excelHost = document.createElement("div");
      excelHost.className = "panel-excel-fallback";
      const details = document.createElement("details");
      details.className = "excel-fallback";
      const summary = document.createElement("summary");
      summary.textContent = "원본 엑셀 그리드";
      details.appendChild(summary);
      const gridWrap = document.createElement("div");
      gridWrap.className = "excel-fallback-grid";
      details.appendChild(gridWrap);
      details.addEventListener("toggle", function () {
        if (!details.open || gridWrap.children.length) return;
        const sheet =
          taxTab === "corp"
            ? panel.corpFullSheet || panel.corpSheet || panel.feeSheet
            : panel.incomeSheet;
        if (sheet) {
          renderExcelSection(panel.title + " · 원본", sheet, gridWrap, {
            readOnly: panel.readOnly,
            canEdit: options.canEdit,
            onPatch: options.onPatch,
            searchQuery: options.searchQuery,
            kind: taxTab,
          });
        }
      });
      excelHost.appendChild(details);
      wrap.appendChild(excelHost);
    }

    return wrap;

  }



  function panelMatchesSearch(panel, query) {

    if (!query) return true;

    if (panel.stats) {

      return ReviewReadable.panelMatchesQuery(panel.stats, panel.owner, query);

    }

    return true;

  }



  function renderManagerChips(data, chipsEl, activeId, onSelect, searchQuery, taxTab) {

    if (!chipsEl) return;

    chipsEl.innerHTML = "";



    if (taxTab === "fee") {

      chipsEl.hidden = true;

      return;

    }



    const items = data.panels.filter(function (panel) {

      if (searchQuery && panel.stats && !panelMatchesSearch(panel, searchQuery)) {

        return false;

      }

      return true;

    });



    if (!data.master || items.length <= 1) {

      chipsEl.hidden = true;

      return;

    }



    chipsEl.hidden = false;



    items.forEach(function (panel) {

      const btn = document.createElement("button");

      btn.type = "button";

      btn.className = "manager-chip" + (panel.id === activeId ? " active" : "");

      btn.setAttribute("aria-label", panel.title);

      btn.textContent = panel.title;

      btn.addEventListener("click", function () {

        onSelect(panel.id);

      });



      chipsEl.appendChild(btn);

    });

  }



  function panelNeedsIncomeSheet(data, panelId) {

    const panel = data.panels.find(function (p) {

      return p.id === panelId;

    });

    if (!panel) return false;

    const map = data.access && data.access.sheetMap && data.access.sheetMap[panel.owner];

    if (!map || !map.income) return false;

    const byName = data._sheetsByName || {};

    return !byName[map.income];

  }



  function mountPanelWhenReady(scrollEl, data, panelId, options, taxTab, chipsEl, tabsEl) {

    const viewOpts = panelViewOptions(data, scrollEl, chipsEl, tabsEl, options, taxTab);

    const run = function () {

      mountPanel(scrollEl, data, panelId, viewOpts);

    };

    if (

      taxTab === "income" &&

      panelNeedsIncomeSheet(data, panelId) &&

      window.ReviewGridApp &&

      typeof window.ReviewGridApp.ensurePanelSheets === "function"

    ) {

      window.ReviewGridApp.ensurePanelSheets(panelId).then(run).catch(run);

      return;

    }

    run();

  }



  function mountPanel(scrollEl, data, panelId, options) {

    let panel =

      data.panels.find(function (p) {

        return p.id === panelId;

      }) || null;



    if (options.taxTab === "fee") {

      panel = data.feePanel;

      if (panel) hydrateFeePanel(panel, data);

    } else if (!panel) {

      panel = data.feePanel;

      if (panel) hydrateFeePanel(panel, data);

    } else {

      hydratePanel(panel, data);

    }



    if (!panel) {

      scrollEl.innerHTML = '<p class="empty-hint">표시할 내용이 없습니다.</p>';

      return;

    }



    lastMountedPanelId = panelId;

    scrollEl.innerHTML = "";
    const shouldRerender = window.ReviewRowExpand ? ReviewRowExpand.collapseAll() : false;
    scrollEl.appendChild(renderPanelBody(panel, options));
    if (shouldRerender && options.onRerender && !remountingPanel) options.onRerender();

    const scrollCol = document.getElementById("portal-main-column");
    if (scrollCol) scrollCol.scrollTop = 0;

  }



  function renderTaxTabs(tabsEl, data, activeTab, onChange) {

    if (!tabsEl) return;

    tabsEl.innerHTML = "";



    const tabs = [{ id: "income", label: "종합소득세" }];

    if (data.feePanel) {

      tabs.push({ id: "corp", label: "법인세" });

    } else if (data.panels.some(function (p) {

      if (p.corpSheet) return true;

      const map = data.access && data.access.sheetMap && data.access.sheetMap[p.owner];

      return !!(map && map.corpCols);

    })) {

      tabs.push({ id: "corp", label: "법인세" });

    }



    tabs.forEach(function (tab) {

      const btn = document.createElement("button");

      btn.type = "button";

      btn.className = "tax-tab" + (tab.id === activeTab ? " active" : "");

      btn.textContent = tab.label;

      btn.addEventListener("click", function () {

        saveTaxTab(tab.id);

        onChange(tab.id);

      });

      tabsEl.appendChild(btn);

    });

  }



  function refreshMountedPanel(scrollEl, data, chipsEl, tabsEl, options, taxTab) {
    if (!lastMountedPanelId) {
      renderView(data, scrollEl, chipsEl, tabsEl, options);
      return;
    }
    remountingPanel = true;
    try {
      mountPanel(
        scrollEl,
        data,
        lastMountedPanelId,
        panelViewOptions(data, scrollEl, chipsEl, tabsEl, options, taxTab)
      );
    } finally {
      remountingPanel = false;
    }
  }

  function panelViewOptions(data, scrollEl, chipsEl, tabsEl, options, taxTab) {
    return Object.assign({}, options, {
      taxTab: taxTab,
      onRerender: function () {
        refreshMountedPanel(scrollEl, data, chipsEl, tabsEl, options, taxTab);
      },
    });
  }



  function renderView(data, scrollEl, chipsEl, tabsEl, options) {

    const searchQuery = (options.searchQuery || "").trim();

    const taxTab = options.taxTab || getTaxTab();



    if (searchQuery) {

      data.panels.forEach(function (panel) {

        if (!panel.hydrated) hydratePanel(panel, data);

      });

    }



    renderTaxTabs(tabsEl, data, taxTab, function (tab) {

      options.taxTab = tab;

      renderView(data, scrollEl, chipsEl, tabsEl, options);

    });



    const staffPanels = data.panels.filter(function (panel) {

      return panelMatchesSearch(panel, searchQuery);

    });



    if (taxTab === "fee") {
      taxTab = "corp";
      saveTaxTab("corp");
    }

    if (!staffPanels.length) {

      scrollEl.innerHTML = '<p class="empty-hint">검색 결과가 없습니다.</p>';

      if (chipsEl) chipsEl.hidden = true;

      return;

    }



    if (!data.master || staffPanels.length <= 1) {

      if (chipsEl) chipsEl.hidden = true;

      mountPanelWhenReady(scrollEl, data, staffPanels[0].id, options, taxTab, chipsEl, tabsEl);

      return;

    }



    let activeId = getSelectedId();

    const ids = staffPanels.map(function (p) {

      return p.id;

    });

    if (!activeId || ids.indexOf(activeId) < 0) {

      activeId = staffPanels[0].id;

    }

    if (searchQuery && ids.indexOf(activeId) < 0) {

      activeId = staffPanels[0].id;

    }



    saveSelectedId(activeId);



    renderManagerChips(

      data,

      chipsEl,

      activeId,

      function (id) {

        saveSelectedId(id);

        const run = function () {
          renderView(data, scrollEl, chipsEl, tabsEl, options);
        };

        if (window.ReviewGridApp && typeof window.ReviewGridApp.ensurePanelSheets === "function") {
          window.ReviewGridApp.ensurePanelSheets(id).then(run).catch(run);
          return;
        }

        run();

      },

      searchQuery,

      taxTab

    );



    mountPanelWhenReady(scrollEl, data, activeId, options, taxTab, chipsEl, tabsEl);

  }



  window.ReviewGridDashboard = {

    findSheet,

    buildPanels,

    hydratePanel,

    invalidatePanels,

    getSharedSheets,

    renderView,

    getTaxTab,

    saveTaxTab,

  };

})();

