(function () {
  "use strict";

  function closeDialog(backdrop) {
    if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    document.body.classList.remove("client-detail-modal-open");
  }

  function fieldRow(labelText, inputEl) {
    const row = document.createElement("label");
    row.className = "add-client-field";
    const label = document.createElement("span");
    label.className = "add-client-label";
    label.textContent = labelText;
    row.appendChild(label);
    row.appendChild(inputEl);
    return row;
  }

  function textInput(placeholder) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "add-client-input";
    input.placeholder = placeholder || "";
    return input;
  }

  function selectInput(options, value) {
    const select = document.createElement("select");
    select.className = "add-client-input";
    options.forEach(function (opt) {
      const o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.label;
      if (value && value === opt.value) o.selected = true;
      select.appendChild(o);
    });
    return select;
  }

  function attachClientSearch(body, onPick) {
    const wrap = document.createElement("div");
    wrap.className = "add-client-search-wrap";

    const hint = document.createElement("p");
    hint.className = "add-client-search-hint";
    hint.textContent = "수임처 목록에서 검색해 선택하면 아래 항목이 자동으로 채워집니다.";
    wrap.appendChild(hint);

    const searchInput = textInput("업체명·사업자번호·대표자 검색");
    searchInput.type = "search";
    searchInput.autocomplete = "off";
    wrap.appendChild(searchInput);

    const results = document.createElement("div");
    results.className = "add-client-search-results";
    results.hidden = true;
    wrap.appendChild(results);

    let debounceTimer = null;
    let abortCtrl = null;

    function hideResults() {
      results.hidden = true;
      results.innerHTML = "";
    }

    function renderResults(items) {
      results.innerHTML = "";
      if (!items.length) {
        const empty = document.createElement("p");
        empty.className = "add-client-search-empty";
        empty.textContent = "검색 결과가 없습니다.";
        results.appendChild(empty);
        results.hidden = false;
        return;
      }
      items.slice(0, 12).forEach(function (client) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "add-client-search-item";
        const name = client.companyName || "(상호 없음)";
        const meta = [client.businessNo, client.representative, client.manager]
          .filter(Boolean)
          .join(" · ");
        btn.innerHTML =
          '<span class="add-client-search-name"></span><span class="add-client-search-meta"></span>';
        btn.querySelector(".add-client-search-name").textContent = name;
        btn.querySelector(".add-client-search-meta").textContent = meta;
        btn.addEventListener("click", function () {
          onPick(client);
          searchInput.value = name;
          hideResults();
        });
        results.appendChild(btn);
      });
      results.hidden = false;
    }

    searchInput.addEventListener("input", function () {
      const q = (searchInput.value || "").trim();
      if (debounceTimer) clearTimeout(debounceTimer);
      if (!q) {
        hideResults();
        return;
      }
      debounceTimer = setTimeout(function () {
        if (abortCtrl) abortCtrl.abort();
        abortCtrl = new AbortController();
        fetch("/api/clients/search?q=" + encodeURIComponent(q) + "&scope=notice", {
          signal: abortCtrl.signal,
          credentials: "same-origin",
        })
          .then(function (res) {
            return res.ok ? res.json() : { clients: [] };
          })
          .then(function (data) {
            renderResults(data.clients || []);
          })
          .catch(function (err) {
            if (err && err.name === "AbortError") return;
            hideResults();
          });
      }, 180);
    });

    body.insertBefore(wrap, body.firstChild);
    return searchInput;
  }

  function openAddIncomeDialog(options, onSaved) {
    const sections = ReviewGridSections.getSections(options.sheet);
    const kinds = ReviewGridSections.getAvailableFilterKinds(sections);
    const backdrop = document.createElement("div");
    backdrop.className = "client-detail-modal-backdrop";
    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop) closeDialog(backdrop);
    });

    const dialog = document.createElement("div");
    dialog.className = "client-detail-modal add-client-dialog";
    dialog.setAttribute("role", "dialog");

    const head = document.createElement("header");
    head.className = "client-detail-modal-head";
    const h2 = document.createElement("h2");
    h2.className = "client-detail-modal-title";
    h2.textContent = "새 업체 추가 (종합소득세)";
    head.appendChild(h2);
    dialog.appendChild(head);

    const body = document.createElement("div");
    body.className = "client-detail-modal-body add-client-body";

    const kindSelect = selectInput(
      kinds.map(function (k) {
        return { value: k.key, label: k.label };
      }),
      kinds[0] ? kinds[0].key : "agent"
    );

    const nameInput = textInput("성명");
    const companyInput = textInput("상호");
    const phoneInput = textInput("연락처");

    attachClientSearch(body, function (client) {
      if (client.representative) nameInput.value = client.representative;
      if (client.companyName) companyInput.value = client.companyName;
      const phone = client.mobilePhone || client.phone || "";
      if (phone) phoneInput.value = phone;
    });

    body.appendChild(fieldRow("구분", kindSelect));
    body.appendChild(fieldRow("성명", nameInput));
    body.appendChild(fieldRow("상호", companyInput));
    body.appendChild(fieldRow("연락처", phoneInput));

    dialog.appendChild(body);

    const foot = document.createElement("footer");
    foot.className = "client-detail-modal-foot add-client-foot";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "tool-btn";
    cancelBtn.textContent = "취소";
    cancelBtn.addEventListener("click", function () {
      closeDialog(backdrop);
    });
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "tool-btn add-client-save-btn";
    saveBtn.textContent = "추가";
    saveBtn.addEventListener("click", function () {
      const filterKey = kindSelect.value;
      const name = (nameInput.value || "").trim();
      const company = (companyInput.value || "").trim();
      const phone = (phoneInput.value || "").trim();
      if (!name && !company && !phone) {
        window.alert("수임처를 선택하거나 성명·상호·연락처 중 하나 이상 입력해 주세요.");
        return;
      }
      const kindMeta = kinds.find(function (k) {
        return k.key === filterKey;
      });
      const cells = {};
      if (name) cells[3] = { v: name };
      if (company) cells[4] = { v: company };
      if (phone) cells[5] = { v: phone };
      ReviewGridEdit.addNewRow({
        kind: "income",
        sheetName: options.sheet.name,
        owner: options.owner,
        filterKey: filterKey,
        sectionLabel: kindMeta ? kindMeta.label : filterKey,
        isTransfer: filterKey === "excluded" || filterKey === "transfer",
        cells: cells,
      });
      closeDialog(backdrop);
      if (onSaved) onSaved();
    });
    foot.appendChild(cancelBtn);
    foot.appendChild(saveBtn);
    dialog.appendChild(foot);

    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);
    document.body.classList.add("client-detail-modal-open");
    body.querySelector(".add-client-search-wrap input")?.focus();
  }

  function openAddCorpDialog(options, onSaved) {
    const backdrop = document.createElement("div");
    backdrop.className = "client-detail-modal-backdrop";
    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop) closeDialog(backdrop);
    });

    const dialog = document.createElement("div");
    dialog.className = "client-detail-modal add-client-dialog";
    dialog.setAttribute("role", "dialog");

    const head = document.createElement("header");
    head.className = "client-detail-modal-head";
    const h2 = document.createElement("h2");
    h2.className = "client-detail-modal-title";
    h2.textContent = "새 업체 추가 (법인세)";
    head.appendChild(h2);
    dialog.appendChild(head);

    const body = document.createElement("div");
    body.className = "client-detail-modal-body add-client-body";

    const companyInput = textInput("업체명");
    const deadlineInput = textInput("신고기한");
    const feeInput = textInput("수수료");

    attachClientSearch(body, function (client) {
      if (client.companyName) companyInput.value = client.companyName;
    });

    body.appendChild(fieldRow("업체명", companyInput));
    body.appendChild(fieldRow("신고기한", deadlineInput));
    body.appendChild(fieldRow("수수료", feeInput));

    dialog.appendChild(body);

    const foot = document.createElement("footer");
    foot.className = "client-detail-modal-foot add-client-foot";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "tool-btn";
    cancelBtn.textContent = "취소";
    cancelBtn.addEventListener("click", function () {
      closeDialog(backdrop);
    });
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "tool-btn add-client-save-btn";
    saveBtn.textContent = "추가";
    saveBtn.addEventListener("click", function () {
      const company = (companyInput.value || "").trim();
      if (!company) {
        window.alert("수임처를 선택하거나 업체명을 입력해 주세요.");
        return;
      }
      const cells = {};
      cells["corp:1"] = { v: company };
      if (options.feeSheet) {
        cells["fee:2"] = { v: company };
      }
      const deadline = (deadlineInput.value || "").trim();
      const fee = (feeInput.value || "").trim();
      if (deadline) cells["fee:3"] = { v: deadline };
      if (fee) cells["fee:4"] = { v: ReviewGridEdit.parseCellValue(fee) };

      ReviewGridEdit.addNewRow({
        kind: "corp",
        sheetName: options.feeSheet ? options.feeSheet.name : options.corpSheet ? options.corpSheet.name : "corp-" + options.owner,
        owner: options.owner,
        cells: cells,
      });
      closeDialog(backdrop);
      if (onSaved) onSaved();
    });
    foot.appendChild(cancelBtn);
    foot.appendChild(saveBtn);
    dialog.appendChild(foot);

    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);
    document.body.classList.add("client-detail-modal-open");
    body.querySelector(".add-client-search-wrap input")?.focus();
  }

  function renderAddClientButton(options) {
    if (!options.canEdit || options.readOnly) return null;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "list-col-settings-btn add-client-btn";
    btn.textContent = "+ 새 업체";
    btn.addEventListener("click", function () {
      const kind = options.kind || "income";
      if (kind === "corp") {
        openAddCorpDialog(options, options.onRerender);
      } else if (kind === "income" && options.sheet) {
        openAddIncomeDialog(options, options.onRerender);
      }
    });
    return btn;
  }

  window.ReviewAddClient = {
    renderAddClientButton,
    openAddIncomeDialog,
    openAddCorpDialog,
  };
})();
