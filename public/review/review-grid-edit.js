(function () {
  "use strict";

  const PATCH_KEY = "reviewGridPatches";
  const NEW_ROWS_KEY = "reviewGridNewRows";

  let patchesCache = null;
  let newRowsCache = null;
  let storageReady = null;
  let saveTimer = null;
  let boardEditMode = false;

  function isEmbed() {
    return !!window.__REVIEW_EMBED__;
  }

  function flushRemoteSave() {
    if (!isEmbed()) return Promise.resolve();
    clearTimeout(saveTimer);
    saveTimer = null;
    return fetch("/api/review/patches", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patches: patchesCache || [],
        newRows: newRowsCache || [],
      }),
    }).catch(function (err) {
      console.error("[review] patch save failed", err);
    });
  }

  function scheduleRemoteSave() {
    if (!isEmbed()) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushRemoteSave, 400);
  }

  function isBoardEditMode() {
    return boardEditMode;
  }

  function setBoardEditMode(on) {
    boardEditMode = !!on;
    return boardEditMode;
  }

  async function initStorage() {
    if (!isEmbed()) return;
    if (storageReady) return storageReady;
    storageReady = fetch("/api/review/patches", {
      signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined,
    })
      .then(function (res) {
        if (!res.ok) throw new Error("패치 로드 실패");
        return res.json();
      })
      .then(function (data) {
        patchesCache = Array.isArray(data.patches) ? data.patches : [];
        newRowsCache = Array.isArray(data.newRows) ? data.newRows : [];
      })
      .catch(function () {
        patchesCache = [];
        newRowsCache = [];
      })
      .finally(function () {
        storageReady = Promise.resolve();
      });
    return storageReady;
  }

  function loadNewRows() {
    if (isEmbed()) return newRowsCache || [];
    try {
      const raw = localStorage.getItem(NEW_ROWS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveNewRows(rows) {
    if (isEmbed()) {
      newRowsCache = rows;
      scheduleRemoteSave();
      return;
    }
    localStorage.setItem(NEW_ROWS_KEY, JSON.stringify(rows));
  }

  function generateNewRowId() {
    return "nr-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  }

  function addNewRow(def) {
    const rows = loadNewRows();
    const item = Object.assign(
      {
        id: generateNewRowId(),
        createdAt: new Date().toISOString(),
        cells: {},
      },
      def
    );
    rows.push(item);
    saveNewRows(rows);
    return item;
  }

  function updateNewRowField(id, cellKey, v) {
    const rows = loadNewRows();
    const row = rows.find(function (r) {
      return r.id === id;
    });
    if (!row) return false;
    if (!row.cells) row.cells = {};
    if (!row.cells[cellKey]) row.cells[cellKey] = {};
    row.cells[cellKey].v = v;
    saveNewRows(rows);
    return true;
  }

  function getNewRowsForSheet(sheetName) {
    return loadNewRows().filter(function (r) {
      return r.sheetName === sheetName;
    });
  }

  function getNewCorpRows(owner) {
    return loadNewRows().filter(function (r) {
      return r.kind === "corp" && r.owner === owner;
    });
  }

  function removeNewRow(id) {
    const rows = loadNewRows().filter(function (r) {
      return r.id !== id;
    });
    saveNewRows(rows);
  }

  function loadPatches() {
    if (isEmbed()) return patchesCache || [];
    try {
      const raw = localStorage.getItem(PATCH_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function savePatches(patches) {
    if (isEmbed()) {
      patchesCache = patches;
      scheduleRemoteSave();
      return;
    }
    localStorage.setItem(PATCH_KEY, JSON.stringify(patches));
  }

  function patchKey(sheetName, r, c) {
    return sheetName + "|" + r + "|" + c;
  }

  function upsertPatch(sheetName, r, c, v, bg) {
    const patches = loadPatches();
    const key = patchKey(sheetName, r, c);
    const idx = patches.findIndex(function (p) {
      return patchKey(p.sheetName, p.r, p.c) === key;
    });
    const prev = idx >= 0 ? patches[idx] : null;
    const item = {
      sheetName: sheetName,
      r: r,
      c: c,
      v: v !== undefined ? v : prev ? prev.v : v,
    };
    if (bg !== undefined) {
      item.bg = bg;
    } else if (prev && prev.bg !== undefined) {
      item.bg = prev.bg;
    }
    if (idx >= 0) patches[idx] = item;
    else patches.push(item);
    savePatches(patches);
    return patches.length;
  }

  function clearPatches() {
    if (isEmbed()) {
      patchesCache = [];
      newRowsCache = [];
      fetch("/api/review/patches", { method: "DELETE" }).catch(function (err) {
        console.error("[review] clear failed", err);
      });
      return;
    }
    localStorage.removeItem(PATCH_KEY);
    localStorage.removeItem(NEW_ROWS_KEY);
  }

  function applyPatchesToSheet(sheet) {
    const patches = loadPatches().filter(function (p) {
      return p.sheetName === sheet.name;
    });
    if (!patches.length) return sheet;
    const cellMap = new Map();
    for (const cell of sheet.cells) {
      cellMap.set(cell.r + ":" + cell.c, Object.assign({}, cell));
    }
    for (const p of patches) {
      const key = p.r + ":" + p.c;
      const existing = cellMap.get(key) || { r: p.r, c: p.c };
      if (p.v === "" || p.v === null || p.v === undefined) {
        delete existing.v;
      } else if (p.v !== undefined) {
        existing.v = p.v;
      }
      if (p.bg !== undefined) {
        if (p.bg === "" || p.bg === null) {
          delete existing.bg;
        } else {
          existing.bg = p.bg;
        }
      }
      cellMap.set(key, existing);
    }
    return Object.assign({}, sheet, {
      cells: Array.from(cellMap.values()),
    });
  }

  function parseCellValue(text) {
    const t = text.trim();
    if (t === "") return "";
    if (/^-?\d+$/.test(t)) return parseInt(t, 10);
    if (/^-?\d+\.\d+$/.test(t)) return parseFloat(t);
    return t;
  }

  function enableEditOnTable(table, sheetName, canEdit, onPatch) {
    if (!canEdit) return;
    const tds = table.querySelectorAll("td");
    tds.forEach(function (td) {
      td.contentEditable = "true";
      td.classList.add("cell-editable");
      td.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          td.blur();
        }
      });
      td.addEventListener("blur", function () {
        const r = parseInt(td.dataset.r, 10);
        const c = parseInt(td.dataset.c, 10);
        if (!r || !c) return;
        const v = parseCellValue(td.textContent || "");
        const count = upsertPatch(sheetName, r, c, v);
        if (onPatch) onPatch(count);
      });
    });
  }

  function exportPatchesJson() {
    const payload = {
      patches: loadPatches(),
      newRows: loadNewRows(),
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "review-grid-patches.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function applyFieldEdit(sheetName, r, c, text, onPatch) {
    const v = parseCellValue(text);
    const count = upsertPatch(sheetName, r, c, v);
    if (onPatch) onPatch(count);
    return count;
  }

  function resetEmbed() {
    storageReady = null;
    patchesCache = null;
    newRowsCache = null;
    boardEditMode = false;
    clearTimeout(saveTimer);
    saveTimer = null;
  }

  window.ReviewGridEdit = {
    isEmbed,
    initStorage,
    resetEmbed,
    isBoardEditMode,
    setBoardEditMode,
    flushRemoteSave,
    loadPatches,
    loadNewRows,
    addNewRow,
    updateNewRowField,
    getNewRowsForSheet,
    getNewCorpRows,
    removeNewRow,
    upsertPatch,
    clearPatches,
    applyPatchesToSheet,
    enableEditOnTable,
    applyFieldEdit,
    parseCellValue,
    exportPatchesJson,
  };
})();
