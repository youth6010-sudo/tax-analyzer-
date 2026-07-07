(function () {

  "use strict";



  function renderIncomeBoard(sheet, host, options) {

    host.innerHTML = "";



    const root = document.createElement("div");

    root.className = "board-root";

    root.dataset.manager = options.owner || sheet.name;



    ReviewClientList.renderIncomeBoardContent(sheet, root, Object.assign({}, options, { sheet: sheet }));

    host.appendChild(root);

  }



  function renderCorpBoard(sheet, host, options) {

    host.innerHTML = "";



    const owner = options.owner || (sheet && sheet.name) || "담당";

    const root = document.createElement("div");

    root.className = "board-root";

    root.dataset.manager = owner;



    ReviewClientList.renderCorpBoardContent(sheet, root, Object.assign({}, options, {
      sheet: sheet,
      feeSheet: options.feeSheet,
      corpFullSheet: options.corpFullSheet,
    }));

    host.appendChild(root);

  }



  function renderFeeBoard(sheet, host, options) {

    host.innerHTML = "";



    const root = document.createElement("div");

    root.className = "board-root";

    root.dataset.manager = "fee";



    ReviewClientList.renderFeeBoardContent(sheet, root, Object.assign({}, options, { sheet: sheet }));

    host.appendChild(root);

  }



  window.ReviewBoardView = {

    renderIncomeBoard,

    renderCorpBoard,

    renderFeeBoard,

  };

})();

