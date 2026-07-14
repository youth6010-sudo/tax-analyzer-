(function () {
  "use strict";

  let dashboardData = null;
  let searchQuery = "";
  let searchTimer = null;
  let canEdit = false;
  let bootGen = 0;
  let mountRoot = null;
  let activeMountId = 0;
  let currentMountOpts = null;

  function resetReviewGridState() {
    dashboardData = null;
    searchQuery = "";
    if (searchTimer) {
      clearTimeout(searchTimer);
      searchTimer = null;
    }
    if (window.ReviewRowExpand && window.ReviewRowExpand.collapseAll) {
      window.ReviewRowExpand.collapseAll();
    }
  }

  function invalidateBoot() {
    activeMountId += 1;
    bootGen += 1;
    mountRoot = null;
    currentMountOpts = null;
    resetReviewGridState();
  }

  function isLiveEl(el) {
    return !!(el && el.isConnected && mountRoot && mountRoot.contains(el));
  }

  function collectSharedSheetNames(access) {
    const names = new Set();
    if (access.corpSheet) names.add(access.corpSheet);
    if (access.corpFeeSheet) names.add(access.corpFeeSheet);
    (access.corpTaxVersions || []).forEach(function (ver) {
      if (ver.sheet) names.add(ver.sheet);
    });
    return names;
  }

  function resolveActivePanelId(access, user, master) {
    if (!master && user) {
      return "panel-" + user;
    }
    try {
      const saved = sessionStorage.getItem("reviewSelectedPanel");
      if (saved && saved.indexOf("panel-") === 0) {
        const owner = saved.slice("panel-".length);
        if (access.incomeOrder && access.incomeOrder.indexOf(owner) >= 0) {
          return saved;
        }
      }
    } catch (e) {
      /* ignore */
    }
    const owner = access.incomeOrder && access.incomeOrder[0];
    return owner ? "panel-" + owner : null;
  }

  function resolveIncomeSheetOwner(access, user, master) {
    if (!master) return user;
    const panelId = resolveActivePanelId(access, user, master);
    if (panelId && panelId.indexOf("panel-") === 0) {
      return panelId.slice("panel-".length);
    }
    return access.incomeOrder && access.incomeOrder[0] ? access.incomeOrder[0] : user;
  }

  function collectIncomeSheetNames(access, owners) {
    const names = [];
    owners.forEach(function (owner) {
      const map = access.sheetMap[owner];
      if (map && map.income) names.push(map.income);
    });
    return names;
  }

  function mergeSheetsIntoDashboard(sheets) {
    if (!dashboardData || !sheets || !sheets.length) return;
    if (!dashboardData._sheetsByName) dashboardData._sheetsByName = {};
    sheets.forEach(function (sheet) {
      if (sheet && sheet.name) {
        dashboardData._sheetsByName[sheet.name] = sheet;
        dashboardData.panels.forEach(function (panel) {
          if (panel.hydrated) panel.hydrated = false;
        });
        if (dashboardData.feePanel) dashboardData.feePanel.hydrated = false;
        dashboardData._shared = null;
      }
    });
  }

  async function fetchSheetsByNames(names) {
    const missing = names.filter(function (name) {
      return name && (!dashboardData || !dashboardData._sheetsByName || !dashboardData._sheetsByName[name]);
    });
    if (!missing.length) return [];
    const dataRes = await fetch(
      "/api/review/grid-sheet?names=" + encodeURIComponent(missing.join(","))
    );
    if (!dataRes.ok) {
      throw new Error("review-grid 시트 로드 실패 (" + dataRes.status + ")");
    }
    const data = await dataRes.json();
    const sheets = data.sheets || [];
    mergeSheetsIntoDashboard(sheets);
    return sheets;
  }

  async function ensurePanelSheets(panelId) {
    if (!dashboardData || !panelId) return;
    const panel = dashboardData.panels.find(function (p) {
      return p.id === panelId;
    });
    if (!panel || !panel.owner) return;
    const map = dashboardData.access.sheetMap[panel.owner];
    if (!map || !map.income) return;
    await fetchSheetsByNames([map.income]);
  }

  async function ensureAllIncomeSheetsForSearch() {
    if (!dashboardData || !dashboardData.master) return;
    const names = collectIncomeSheetNames(dashboardData.access, dashboardData.access.incomeOrder);
    await fetchSheetsByNames(names);
  }

  function updateBoardEditButtons() {
    const editBtn = mountRoot && mountRoot.querySelector("#board-edit-btn");
    const saveBtn = mountRoot && mountRoot.querySelector("#board-save-btn");
    const editing = ReviewGridEdit.isBoardEditMode();
    if (editBtn) editBtn.hidden = editing;
    if (saveBtn) saveBtn.hidden = !editing;
  }

  function enterBoardEditMode() {
    if (!canEdit) return;
    if (window.ReviewRowExpand) ReviewRowExpand.collapseAll();
    ReviewGridEdit.setBoardEditMode(true);
    updateBoardEditButtons();
    render();
  }

  function exitBoardEditMode(save) {
    if (!ReviewGridEdit.isBoardEditMode()) return;
    const finish = function () {
      ReviewGridEdit.setBoardEditMode(false);
      if (dashboardData) ReviewGridDashboard.invalidatePanels(dashboardData);
      updateBoardEditButtons();
      updatePatchStatus();
      render();
    };
    if (save) {
      ReviewGridEdit.flushRemoteSave().then(finish);
      return;
    }
    const count = ReviewGridEdit.loadPatches().length + ReviewGridEdit.loadNewRows().length;
    if (count > 0 && !confirm("저장하지 않은 변경이 있습니다. 편집 모드를 종료할까요?")) return;
    finish();
  }

  function getEls() {
    const root = mountRoot;
    if (!root) {
      return {
        pageEl: null,
        chipsEl: null,
        scrollEl: null,
        tabsEl: null,
        metaEl: null,
        searchInput: null,
        userEl: null,
        editTools: null,
        patchStatus: null,
      };
    }
    return {
      pageEl: root,
      chipsEl: root.querySelector("#manager-chips"),
      scrollEl: root.querySelector("#grid-scroll"),
      tabsEl: root.querySelector("#tax-tabs"),
      metaEl: root.querySelector("#meta"),
      searchInput: root.querySelector("#search-input"),
      userEl: root.querySelector("#user-label"),
      editTools: root.querySelector("#edit-tools"),
      patchStatus: root.querySelector("#patch-status"),
    };
  }

  function updatePatchStatus() {
    const el = getEls().patchStatus;
    if (!el) return;
    const count = ReviewGridEdit.loadPatches().length + ReviewGridEdit.loadNewRows().length;
    if (count > 0) {
      el.textContent = "변경 " + count + "건";
      el.classList.add("has-patches");
    } else {
      el.textContent = "";
      el.classList.remove("has-patches");
    }
  }

  function activeOwnerId() {
    if (!dashboardData) return null;
    const taxTab = ReviewGridDashboard.getTaxTab();
    if (taxTab === "fee") return null;
    try {
      const saved = sessionStorage.getItem("reviewSelectedPanel");
      if (saved) {
        const panel = dashboardData.panels.find(function (p) {
          return p.id === saved;
        });
        if (panel) return panel.owner;
      }
    } catch (e) {
      /* ignore */
    }
    const staff = dashboardData.panels.filter(function (p) {
      if (!searchQuery) return true;
      if (!p.stats) return true;
      return ReviewReadable.panelMatchesQuery(p.stats, p.owner, searchQuery);
    });
    return staff.length ? staff[0].owner : null;
  }

  function updateMeta() {
    const meta = getEls().metaEl;
    if (!meta || !dashboardData) return;
    const owner = activeOwnerId();
    const chipsEl = getEls().chipsEl;
    const chipsVisible = chipsEl && !chipsEl.hidden;
    meta.textContent = owner && !chipsVisible ? owner : "";
  }

  function render() {
    if (!dashboardData) return;
    const els = getEls();
    if (!isLiveEl(els.scrollEl)) return;
    const taxTab = ReviewGridDashboard.getTaxTab();
    const run = function () {
      if (!isLiveEl(els.scrollEl)) return;
      ReviewGridDashboard.renderView(dashboardData, els.scrollEl, els.chipsEl, els.tabsEl, {
        canEdit: canEdit,
        boardEditMode: ReviewGridEdit.isBoardEditMode(),
        searchQuery: searchQuery,
        taxTab: taxTab,
        onPatch: function () {
          updatePatchStatus();
        },
      });
      updateMeta();
    };
    if (searchQuery && dashboardData.master) {
      ensureAllIncomeSheetsForSearch().then(run).catch(run);
      return;
    }
    run();
  }

  function bindControls(user, master, access) {
    const els = getEls();
    const map = access && access.sheetMap ? access.sheetMap[user] : null;
    const staffEdit = !!(map && (map.income || map.corpCols));
    const sessionCanEdit =
      window.__REVIEW_SESSION__ && typeof window.__REVIEW_SESSION__.canEdit === "boolean"
        ? window.__REVIEW_SESSION__.canEdit
        : null;
    canEdit = sessionCanEdit !== null ? sessionCanEdit : master || staffEdit;

    if (els.userEl) els.userEl.textContent = user;
    if (els.editTools) els.editTools.hidden = !canEdit;
    updateBoardEditButtons();

    const boardEditBtn = mountRoot && mountRoot.querySelector("#board-edit-btn");
    if (boardEditBtn && !boardEditBtn.dataset.bound) {
      boardEditBtn.dataset.bound = "1";
      boardEditBtn.addEventListener("click", enterBoardEditMode);
    }

    const boardSaveBtn = mountRoot && mountRoot.querySelector("#board-save-btn");
    if (boardSaveBtn && !boardSaveBtn.dataset.bound) {
      boardSaveBtn.dataset.bound = "1";
      boardSaveBtn.addEventListener("click", function () {
        exitBoardEditMode(true);
      });
    }

    if (els.searchInput && !els.searchInput.dataset.bound) {
      els.searchInput.dataset.bound = "1";
      els.searchInput.addEventListener("input", function () {
        searchQuery = els.searchInput.value.trim();
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
          render();
        }, 350);
      });
    }

    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn && !logoutBtn.dataset.bound) {
      logoutBtn.dataset.bound = "1";
      logoutBtn.addEventListener("click", function () {
        ReviewAuth.clearUser();
        window.location.href = "./login.html";
      });
    }

    const clearBtn = mountRoot && mountRoot.querySelector("#clear-patches-btn");
    if (clearBtn) {
      clearBtn.hidden = !master;
    }
    if (clearBtn && !clearBtn.dataset.bound) {
      clearBtn.dataset.bound = "1";
      clearBtn.addEventListener("click", function () {
        if (!confirm("저장된 변경 사항을 모두 초기화할까요?")) return;
        ReviewGridEdit.clearPatches();
        if (dashboardData) ReviewGridDashboard.invalidatePanels(dashboardData);
        updatePatchStatus();
        resetReviewGridState();
        boot(activeMountId, currentMountOpts);
      });
    }

    const exportBtn = mountRoot && mountRoot.querySelector("#export-patches-btn");
    if (exportBtn && !exportBtn.dataset.bound) {
      exportBtn.dataset.bound = "1";
      exportBtn.addEventListener("click", function () {
        ReviewGridEdit.exportPatchesJson();
      });
    }
  }

  function showBootError(els, message) {
    if (els && isLiveEl(els.scrollEl)) {
      els.scrollEl.innerHTML =
        '<p class="error">' +
        message +
        "<br><br>터미널에서 <code>npm run import:review:full</code> 실행 후 새로고침하세요.</p>";
    }
  }

  function applyDeepLinkFocus() {
    const link = window.__REVIEW_DEEP_LINK__;
    if (!link || !link.focus) return;
    const focusKey = String(link.focus).toLowerCase();
    const normalize =
      ReviewReadable && ReviewReadable.companyLinkKey
        ? ReviewReadable.companyLinkKey
        : function (v) {
            return String(v || "")
              .trim()
              .toLowerCase();
          };

    window.setTimeout(function () {
      const rows = document.querySelectorAll("tr[data-row-num]");
      for (let i = 0; i < rows.length; i++) {
        const tr = rows[i];
        const nameCell = tr.querySelector(".name-col-inner, .name-col-clickable");
        if (!nameCell) continue;
        const text = (nameCell.textContent || "").trim();
        const key = normalize(text);
        if (!key) continue;
        if (key === focusKey || key.indexOf(focusKey) >= 0 || focusKey.indexOf(key) >= 0) {
          tr.classList.add("row-highlight");
          tr.scrollIntoView({ block: "center", behavior: "smooth" });
          window.setTimeout(function () {
            tr.classList.remove("row-highlight");
          }, 2500);
          break;
        }
      }
    }, 500);
  }

  function notifyBootError(mountId, opts, message) {
    if (mountId !== activeMountId) return;
    const els = getEls();
    showBootError(els, message);
    if (opts && typeof opts.onError === "function") {
      opts.onError(message);
    }
  }

  function notifyBootReady(mountId, opts) {
    if (mountId !== activeMountId) return;
    if (opts && typeof opts.onReady === "function") {
      opts.onReady();
    }
  }

  async function fetchWithTimeout(url, ms) {
    const opts = {};
    if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) {
      opts.signal = AbortSignal.timeout(ms);
    }
    const res = await fetch(url, opts);
    return res;
  }

  async function boot(mountId, opts) {
    const gen = ++bootGen;
    const isEmbed = !!window.__REVIEW_EMBED__;

    if (isEmbed) {
      if (window.__REVIEW_SESSION__ && ReviewAuth.initFromPortal) {
        await ReviewAuth.initFromPortal(window.__REVIEW_SESSION__);
      } else {
        try {
          const sessionRes = await fetch("/api/review/session");
          if (sessionRes.ok) {
            const session = await sessionRes.json();
            window.__REVIEW_SESSION__ = session;
            await ReviewAuth.initFromPortal(session);
          }
        } catch (e) {
          /* session preloaded by embed host */
        }
      }
      if (
        window.__REVIEW_SESSION__ &&
        window.ReviewReadable &&
        ReviewReadable.applyServerListLayouts
      ) {
        ReviewReadable.applyServerListLayouts(
          window.__REVIEW_SESSION__.listLayouts,
          window.__REVIEW_SESSION__.listWidths
        );
      }
      if (ReviewGridEdit.initStorage && !window.__REVIEW_PATCHES_READY__) {
        void ReviewGridEdit.initStorage();
      }
    }

    const els = getEls();

    const user = ReviewAuth.requireUser();
    if (!user) {
      if (gen === bootGen && mountId === activeMountId) {
        notifyBootError(mountId, opts, "로그인 정보를 확인할 수 없습니다. 다시 로그인해 주세요.");
        return { ok: false, reason: "error", message: "로그인 정보를 확인할 수 없습니다. 다시 로그인해 주세요." };
      }
      return { ok: false, reason: "superseded" };
    }

    const master = await ReviewAuth.isMaster(user);
    if (gen !== bootGen || mountId !== activeMountId) return { ok: false, reason: "superseded" };

    if (isEmbed) {
      const logoutBtn = document.getElementById("logout-btn");
      if (logoutBtn) logoutBtn.hidden = true;
      const userEl = els.userEl;
      if (userEl) userEl.textContent = user;
    }

    try {
      const access = await ReviewAuth.loadAccessConfig();
      if (gen !== bootGen || mountId !== activeMountId) return { ok: false, reason: "superseded" };
      bindControls(user, master, access);
      updatePatchStatus();
      let sheets = [];

      if (isEmbed) {
        const owner = resolveIncomeSheetOwner(access, user, master);
        const names = collectSharedSheetNames(access);
        const map = owner ? access.sheetMap[owner] : null;
        if (map && map.income) names.add(map.income);

        void fetch("/api/review/client-links-index")
          .then(function (res) {
            return res.ok ? res.json() : { index: {} };
          })
          .then(function (data) {
            if (window.ReviewClientList && window.ReviewClientList.installClientLinksIndex) {
              window.ReviewClientList.installClientLinksIndex(data.index || {});
            } else {
              window.__REVIEW_CLIENT_LINKS_INDEX__ = data.index || {};
            }
          })
          .catch(function () {
            window.__REVIEW_CLIENT_LINKS_INDEX__ = {};
          });

        const dataRes = await fetchWithTimeout(
          "/api/review/grid-sheet?names=" + encodeURIComponent(Array.from(names).join(",")),
          60000
        );

        if (!dataRes.ok) {
          throw new Error("review-grid 시트 로드 실패 (" + dataRes.status + ")");
        }
        const data = await dataRes.json();
        if (gen !== bootGen || mountId !== activeMountId) return { ok: false, reason: "superseded" };
        sheets = data.sheets || [];
      } else {
        const dataRes = await fetch("./assets/review-grid.json");
        if (!dataRes.ok) {
          throw new Error("review-grid.json 로드 실패 (" + dataRes.status + ")");
        }
        const data = await dataRes.json();
        if (gen !== bootGen || mountId !== activeMountId) return { ok: false, reason: "superseded" };
        sheets = data.sheets || [];
      }

      dashboardData = await ReviewGridDashboard.buildPanels(user, access, sheets);
      if (gen !== bootGen || mountId !== activeMountId) return { ok: false, reason: "superseded" };
      render();
      applyDeepLinkFocus();
      notifyBootReady(mountId, opts);
      return { ok: true };
    } catch (err) {
      const message = err && err.message ? err.message : "검토표를 불러오지 못했습니다.";
      if (gen === bootGen && mountId === activeMountId) {
        notifyBootError(mountId, opts, message);
        return { ok: false, reason: "error", message: message };
      }
      return { ok: false, reason: "superseded" };
    }
  }

  function mount(rootEl, opts) {
    if (!rootEl) {
      return Promise.resolve({ ok: false, reason: "error", message: "mount root missing" });
    }
    const id = ++activeMountId;
    mountRoot = rootEl;
    currentMountOpts = opts || null;
    resetReviewGridState();
    return boot(id, currentMountOpts);
  }

  function bootStandalone() {
    const root = document.getElementById("review-page");
    if (root) {
      return mount(root, null);
    }
    activeMountId += 1;
    const id = activeMountId;
    return boot(id, null);
  }

  window.ReviewGridApp = {
    mount: mount,
    render: render,
    boot: boot,
    reset: invalidateBoot,
    ensurePanelSheets: ensurePanelSheets,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      if (!window.__REVIEW_EMBED__) bootStandalone();
    });
  } else if (!window.__REVIEW_EMBED__) {
    bootStandalone();
  }
})();
