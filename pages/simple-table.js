// table component that renders the row progressively
export default class SimpleTable extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    /**
       * @type {Array<Array<string>>}
       */
    this._data = [];
    this._currentIndex = 0;
    this._pageSize = 100;
    this._maxCols = 0;

    // Create persistent elements
    this.container = document.createElement("div");
    this.container.className = "container";

    this.stats = document.createElement("div");
    this.stats.className = "stats";

    this.table = document.createElement("table");
    this.thead = document.createElement("thead");
    this.tbody = document.createElement("tbody");

    this.loadMoreBtn = document.createElement("button");
    this.loadMoreBtn.textContent = "Load More Rows";
    this.loadMoreBtn.style.display = "none";
    this.loadMoreBtn.onclick = () => this.renderNextBatch();

    this.table.append(this.thead, this.tbody);
    this.container.append(this.stats, this.table, this.loadMoreBtn);
  }

  connectedCallback() {
    const style = document.createElement("style");
    style.textContent = `
      :host { display: block; font-family: system-ui, sans-serif; }
      .container { max-width: 900px; margin: 20px auto; }
      .stats { margin-bottom: 12px; font-weight: 600; color: #374151; font-size: 0.95rem; }
      table { width: 100%; border-collapse: collapse; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border-radius: 8px; overflow: hidden; table-layout: auto; }
      thead { background: linear-gradient(135deg, #4f46e5, #6366f1); color: white; }
      th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e5e7eb; min-width: 50px; }
      tr:nth-child(even) { background: #f9fafb; }
      tr:hover { background-color: #f3f4f6; }
      button { 
        margin-top: 16px; padding: 12px 24px; background: #4f46e5; color: white; 
        border: none; border-radius: 6px; cursor: pointer; width: 100%; font-weight: 600;
        transition: background 0.2s;
      }
      button:hover { background: #4338ca; }
    `;
    // @ts-ignore
    this.shadowRoot.append(style, this.container);
  }

  /**
     * @param {Array<Array<string>>} value
     */
  set data(value) {
    if (!Array.isArray(value) || value.length === 0) return;
    this._data = value;

    // 1. Calculate max columns across all rows
    this._maxCols = this._data.reduce(
      (max, row) => Math.max(max, row.length),
      0,
    );

    this._currentIndex = 0;
    this.initialRender();
  }

  initialRender() {
    const [rawHeaders, ...rows] = this._data;
    this._rows = rows;

    // 2. Update Stats
    this.stats.textContent =
      `Total Rows: ${rows.length} | Max Columns: ${this._maxCols}`;

    // 3. Build Headers (Fill with empty th if header row is shorter than maxCols)
    this.thead.innerHTML = "";
    const tr = document.createElement("tr");

    for (let i = 0; i < this._maxCols; i++) {
      const th = document.createElement("th");
      th.textContent = rawHeaders[i] || ""; // Use header name or empty string
      tr.appendChild(th);
    }
    this.thead.appendChild(tr);

    // 4. Reset body and render first batch
    this.tbody.innerHTML = "";
    this.renderNextBatch();
  }

  renderNextBatch() {
    // @ts-ignore
    const nextBatch = this._rows.slice(
      this._currentIndex,
      this._currentIndex + this._pageSize,
    );

    nextBatch.forEach((rowData) => {
      const tr = document.createElement("tr");

      // Ensure row has exactly this._maxCols cells
      for (let i = 0; i < this._maxCols; i++) {
        const td = document.createElement("td");
        td.textContent = rowData[i] !== undefined ? rowData[i] : "";
        tr.appendChild(td);
      }
      this.tbody.appendChild(tr);
    });

    this._currentIndex += this._pageSize;
    // @ts-ignore
    this.loadMoreBtn.style.display = (this._currentIndex >= this._rows.length)
      ? "none"
      : "block";
  }
}

customElements.define("simple-table", SimpleTable);

// ---- DEMO WITH INCONSISTENT COLUMNS ----
function test() {
    const messyData = [
        ["ID", "Name"], // Only 2 headers provided
        [1, "Alice", "Engineer", "Berlin"], // 4 columns
        [2, "Bob", "Designer"], // 3 columns
        [3, "Charlie"], // 2 columns
    ];

    // Adding 150 more rows to test progressive rendering
    for (let i = 4; i <= 150; i++) {
        messyData.push([i, `User ${i}`, "Extra Data"]);
    }

    // @ts-ignore
    document.querySelector("pretty-table").data = messyData;
}

