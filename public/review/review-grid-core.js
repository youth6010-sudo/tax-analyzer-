(function () {
  "use strict";

  const COL_LETTERS = (function () {
    const a = [];
    for (let i = 1; i <= 702; i++) {
      let n = i;
      let s = "";
      while (n > 0) {
        const r = (n - 1) % 26;
        s = String.fromCharCode(65 + r) + s;
        n = Math.floor((n - 1) / 26);
      }
      a[i] = s;
    }
    return a;
  })();

  function colLetter(c) {
    return COL_LETTERS[c] || String(c);
  }

  function colLetterToIndex(letter) {
    let n = 0;
    const s = String(letter).toUpperCase();
    for (let i = 0; i < s.length; i++) {
      n = n * 26 + (s.charCodeAt(i) - 64);
    }
    return n;
  }

  function defaultColWidth() {
    return 72;
  }

  function pxWidth(chars) {
    return Math.max(32, Math.round(chars * 7.2 + 8));
  }

  function buildCellMap(cells) {
    const map = new Map();
    for (const cell of cells) {
      map.set(cell.r + ":" + cell.c, cell);
    }
    return map;
  }

  function buildMergeMap(merges) {
    const master = new Map();
    const covered = new Set();
    for (const m of merges) {
      const key = m.r + ":" + m.c;
      master.set(key, m);
      for (let dr = 0; dr < m.rs; dr++) {
        for (let dc = 0; dc < m.cs; dc++) {
          if (dr || dc) covered.add(m.r + dr + ":" + (m.c + dc));
        }
      }
    }
    return { master, covered };
  }

  function formatValue(v) {
    if (v === null || v === undefined) return "";
    if (typeof v === "number") {
      return Number.isInteger(v) ? String(v) : String(v);
    }
    return String(v);
  }

  function softenBg(hex) {
    if (!hex) return hex;
    const h = hex.toUpperCase();
    if (h === "#000000" || h === "#000") return "#E8E8E8";
    return hex;
  }

  function parseHexRgb(hex) {
    const raw = String(hex).replace(/^#/, "");
    if (raw.length === 3) {
      return [
        parseInt(raw[0] + raw[0], 16),
        parseInt(raw[1] + raw[1], 16),
        parseInt(raw[2] + raw[2], 16),
      ];
    }
    if (raw.length !== 6) return null;
    return [parseInt(raw.slice(0, 2), 16), parseInt(raw.slice(2, 4), 16), parseInt(raw.slice(4, 6), 16)];
  }

  function tintBg(hex, percent) {
    const rgb = parseHexRgb(hex);
    if (!rgb) return hex;
    const ratio = (percent == null ? 16 : percent) / 100;
    const mix = function (channel) {
      return Math.round(255 * (1 - ratio) + channel * ratio);
    };
    const toHex = function (n) {
      return n.toString(16).padStart(2, "0");
    };
    return "#" + toHex(mix(rgb[0])) + toHex(mix(rgb[1])) + toHex(mix(rgb[2]));
  }

  function applyCell(td, cell, rowBg) {
    if (cell) {
      const text = formatValue(cell.v);
      if (text !== "") td.textContent = text;
      if (cell.bg) td.style.backgroundColor = softenBg(cell.bg);
      else if (rowBg) td.style.backgroundColor = softenBg(rowBg);
      if (cell.fg) td.style.color = cell.fg;
      if (cell.b) td.classList.add("bold");
      if (typeof cell.v === "number") td.classList.add("num");
      if (cell.ha === "center") td.classList.add("center");
      else if (cell.ha === "right") td.classList.add("num");
      if (cell.ha) td.style.textAlign = cell.ha;
      if (cell.va) td.style.verticalAlign = cell.va;
    } else if (rowBg) {
      td.style.backgroundColor = softenBg(rowBg);
    }
  }

  function buildRowBgMap(sheet) {
    const map = new Map();
    const anchor =
      sheet.meta && sheet.meta.kind === "income"
        ? sheet.meta.markerCol || 2
        : sheet.minC;
    for (let i = 0; i < sheet.cells.length; i++) {
      const cell = sheet.cells[i];
      if (!cell.bg) continue;
      if (cell.c === anchor) map.set(cell.r, cell.bg);
      else if (!map.has(cell.r)) map.set(cell.r, cell.bg);
    }
    return map;
  }

  function sliceSheet(sheet, minC, maxC) {
    const cells = sheet.cells.filter(function (c) {
      return c.c >= minC && c.c <= maxC;
    });
    const merges = [];
    for (const m of sheet.merges || []) {
      const endC = m.c + m.cs - 1;
      if (endC < minC || m.c > maxC) continue;
      const clipC = Math.max(m.c, minC);
      const clipEnd = Math.min(endC, maxC);
      merges.push({
        r: m.r,
        c: clipC,
        rs: m.rs,
        cs: clipEnd - clipC + 1,
      });
    }
    const colWidths = {};
    if (sheet.colWidths) {
      for (const [letter, w] of Object.entries(sheet.colWidths)) {
        const idx = colLetterToIndex(letter);
        if (idx >= minC && idx <= maxC) colWidths[letter] = w;
      }
    }
    return {
      name: sheet.name,
      meta: sheet.meta,
      minR: sheet.minR,
      maxR: sheet.maxR,
      minC: minC,
      maxC: maxC,
      merges: merges,
      colWidths: colWidths,
      cells: cells,
    };
  }

  function renderSheet(sheet, container, options) {
    options = options || {};
    const { minR, maxR, minC, maxC, cells, merges, colWidths } = sheet;
    const cellMap = buildCellMap(cells);
    const rowBgMap = buildRowBgMap(sheet);
    const { master, covered } = buildMergeMap(merges || []);

    const wrap = document.createElement("div");
    wrap.className = "sheet-grid-wrap";
    if (options.readOnly) wrap.classList.add("sheet-readonly");

    const table = document.createElement("table");
    table.className = "excel-table";
    table.dataset.sheetName = sheet.name;

    const colgroup = document.createElement("colgroup");
    const cornerCol = document.createElement("col");
    cornerCol.style.width = "42px";
    colgroup.appendChild(cornerCol);
    for (let c = minC; c <= maxC; c++) {
      const col = document.createElement("col");
      const letter = colLetter(c);
      const w = colWidths && colWidths[letter] ? pxWidth(colWidths[letter]) : defaultColWidth();
      col.style.width = w + "px";
      colgroup.appendChild(col);
    }
    table.appendChild(colgroup);

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    const corner = document.createElement("th");
    corner.className = "corner";
    corner.textContent = "";
    headRow.appendChild(corner);
    for (let c = minC; c <= maxC; c++) {
      const th = document.createElement("th");
      th.className = "col-head";
      th.textContent = colLetter(c);
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    const rowFilter = options.rowFilter;
    const headerR = minR;
    for (let r = minR; r <= maxR; r++) {
      if (rowFilter && !rowFilter(r, headerR)) continue;
      const tr = document.createElement("tr");
      tr.dataset.sheetRow = String(r);
      const rowBg = rowBgMap.get(r);
      if (rowBg) tr.style.backgroundColor = softenBg(rowBg);
      const rowHead = document.createElement("th");
      rowHead.className = "row-head";
      rowHead.textContent = String(r);
      tr.appendChild(rowHead);

      for (let c = minC; c <= maxC; c++) {
        const key = r + ":" + c;
        if (covered.has(key)) continue;

        const td = document.createElement("td");
        const merge = master.get(key);
        if (merge) {
          if (merge.rs > 1) td.rowSpan = merge.rs;
          if (merge.cs > 1) td.colSpan = merge.cs;
        }
        td.dataset.r = String(r);
        td.dataset.c = String(c);
        applyCell(td, cellMap.get(key), rowBg);
        tr.appendChild(td);

        if (merge && merge.cs > 1) {
          for (let skip = 1; skip < merge.cs; skip++) {
            c++;
          }
        }
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    wrap.appendChild(table);
    container.innerHTML = "";
    container.appendChild(wrap);
    return table;
  }

  function sheetForDisplay(sheet) {
    return sheet;
  }

  window.ReviewGridCore = {
    colLetter,
    colLetterToIndex,
    formatValue,
    softenBg,
    tintBg,
    buildCellMap,
    buildRowBgMap,
    sliceSheet,
    sheetForDisplay,
    renderSheet,
  };
})();
