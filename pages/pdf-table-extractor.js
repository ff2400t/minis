import { html, map, ref, render, when } from "/vendor/lit-html@3.3.2.js";
import {
  component,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "/vendor/haunted@6.1.0.js";
import "/drop-zone.js";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const initialState = {
  isProcessing: false,
  processingStep: "",
  extractedData: [],
  error: null,
  lastFile: null,
  triggerWord: "Date",
  rowLeniency: 8,
  colLeniency: 45,
  copyStatus: {},
  showManualSettings: false,
  manualAnchors: null,
  showAllPages: false,
  showPasswordModal: false,
  showVisualModal: false,
};

/**
 * @param {{ lastFile: any; extractedData: any; manualAnchors: any; }} state
 * @param {{ type: any; key: any; value: any; file: any; step: any; pageData: any; anchors: undefined; error: any; status: any; }} action
 */
function reducer(state, action) {
  switch (action.type) {
    case "SET_CONFIG":
      return { ...state, [action.key]: action.value };
    case "START_PROCESSING":
      return {
        ...state,
        isProcessing: true,
        processingStep: "Initializing...",
        error: null,
        lastFile: action.file || state.lastFile,
        showPasswordModal: false,
      };
    case "SET_STEP":
      return { ...state, processingStep: action.step };
    case "APPEND_PAGE_DATA":
      // we don't remove the data when we start processing to prevent the page from jumping each time the reparse button is pressed
      // here when the data is set for the first time we create the data array
      if (action.pageData.page === 1) {
        return {
          ...state,
          extractedData: [action.pageData],
          manualAnchors: action.anchors !== undefined
            ? action.anchors
            : state.manualAnchors,
        };
      }
      return {
        ...state,
        extractedData: [...state.extractedData, action.pageData],
        manualAnchors: action.anchors !== undefined
          ? action.anchors
          : state.manualAnchors,
      };
    case "FINISH_PROCESSING":
      return { ...state, isProcessing: false, processingStep: "" };
    case "SET_ERROR":
      return { ...state, isProcessing: false, error: action.error };
    case "SHOW_PASSWORD_PROMPT":
      return { ...state, isProcessing: false, showPasswordModal: true };
    case "RESET":
      return { ...initialState };
    case "SET_ANCHORS":
      return { ...state, manualAnchors: action.anchors };
    case "SET_COPY_STATUS":
      return { ...state, copyStatus: action.status };
    case "TOGGLE_VISUAL_MODAL":
      return { ...state, showVisualModal: action.value };
    default:
      return state;
  }
}

/**
 * Vanilla Web Component: Visual Alignment Modal
 */
class VisualModal extends HTMLElement {
  constructor() {
    super();
    /**
     * @type {{ arrayBuffer: () => any; } | null}
     */
    this.pdfFile = null;
    /**
     * @type {any[]}
     */
    this.anchors = [];
    this.pdfDoc = null;
    this.currentPage = 1;
    this.totalPages = 0;
    this.scale = 1;
  }

  connectedCallback() {
    this.render();
    this.loadPdf();
  }

  static get observedAttributes() {
    return ["page"];
  }

  async loadPdf() {
    if (!this.pdfFile) return;
    try {
      this.updateStatus("Loading Document...");
      const arrayBuffer = await this.pdfFile.arrayBuffer();
      // @ts-ignore
      this.pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      this.totalPages = this.pdfDoc.numPages;
      this.renderPage(1);
    } catch (e) {
      console.error(e);
      this.updateStatus("Error loading PDF.");
    }
  }

  /**
   * @param {number} num
   */
  async renderPage(num) {
    if (!this.pdfDoc) return;
    this.currentPage = num;
    this.updateStatus("Rendering Page...");

    try {
      const page = await this.pdfDoc.getPage(num);
      const viewport = page.getViewport({ scale: 1.5 });

      const canvas = this.querySelector("canvas");
      if (canvas === null) return;
      const context = canvas.getContext("2d");
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      this.scale = viewport.width / 800; // Base width for coordinates

      await page.render({ canvasContext: context, viewport: viewport }).promise;
      this.updateStatus("");
      this.renderControls();
      this.renderAnchors();
    } catch (e) {
      console.error(e);
      this.updateStatus("Error rendering page.");
    }
  }

  /**
   * @param {string} text
   */
  updateStatus(text) {
    const statusEl = this.querySelector("#render-status");
    if (statusEl) statusEl.textContent = text;
    const wrapper = this.querySelector(".visual-canvas-wrapper");
    // @ts-ignore
    if (wrapper) wrapper.style.display = text ? "none" : "block";
  }

  /**
   * @param {{ clientX: number; }} e
   */
  addAnchor(e) {
    const overlay = this.querySelector(".visual-overlay");
    if (!overlay) return;
    const rect = overlay.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pt = clickX / this.scale;

    this.anchors = [...this.anchors, pt].sort((a, b) => a - b);
    this.dispatchEvent(new CustomEvent("update", { detail: this.anchors }));
    this.renderAnchors();
  }

  /**
   * @param {MouseEvent} e
   */
  removeAnchor(e) {
    if (e.altKey) {
      // @ts-ignore
      const idx = e.target.dataset.anchorIdx;
      this.anchors = this.anchors.filter((_, i) => i !== idx);
      this.dispatchEvent(new CustomEvent("update", { detail: this.anchors }));
      this.renderAnchors();
    }
  }

  renderAnchors() {
    const overlay = this.querySelector(".visual-overlay");
    if (!overlay) return;
    overlay.innerHTML = "";
    this.anchors.forEach((x, i) => {
      const marker = document.createElement("div");
      marker.className = "anchor-marker";
      marker.style.cssText = `left: ${
        x * this.scale
      }px; height: 100%; position: absolute; top: 0; width: 4px; background: #6366f1; cursor: pointer; box-shadow: 0 0 10px rgba(99, 102, 241, 0.5); border-radius: 2px;`;
      marker.dataset.anchorIdx = i.toString();
      marker.onclick = (e) => {
        e.stopPropagation();
      };
      overlay.appendChild(marker);
    });
  }

  renderControls() {
    const nav = this.querySelector("#page-nav");
    if (!nav) return;
    nav.innerHTML = `
                    <button class="btn btn-ghost" ${
      this.currentPage <= 1 ? "disabled" : ""
    } id="prev-btn" style="color:white">←</button>
                    <span style="color:white; font-size: 0.875rem;">Page ${this.currentPage} / ${this.totalPages}</span>
                    <button class="btn btn-ghost" ${
      this.currentPage >= this.totalPages ? "disabled" : ""
    } id="next-btn" style="color:white">→</button>
                `;
    nav.querySelector("#prev-btn")?.addEventListener(
      "click",
      () => this.renderPage(this.currentPage - 1),
    );
    nav.querySelector("#next-btn")?.addEventListener(
      "click",
      () => this.renderPage(this.currentPage + 1),
    );
  }

  render() {
    this.innerHTML = `
                    <div class="modal-overlay">
                        <div class="modal-container">
                            <div class="modal-header">
                                <div style="display: flex; align-items: center; gap: 2rem;">
                                    <h2 style="margin:0; font-size:1.1rem; color:white;">Visual Aligner</h2>
                                    <div id="page-nav" style="display: flex; align-items: center; gap: 0.5rem;"></div>
                                </div>
                                <button id="close-btn-top" class="btn btn-ghost" style="color:white;">✕</button>
                            </div>
                            <div class="modal-body">
                                <div id="render-status" style="color: #94a3b8; font-weight: 600;"></div>
                                <div class="visual-canvas-wrapper" style="display:none">
                                    <canvas></canvas>
                                    <div class="visual-overlay"></div>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <span style="color: #94a3b8; font-size: 0.75rem; font-weight: 700; text-transform: uppercase;">Click on PDF to place column markers</span>
                                <div style="display:flex; gap:1rem;">
                                    <button id="clear-btn" class="btn btn-ghost">Clear All</button>
                                    <button id="save-btn" class="btn btn-primary">Done</button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;

    // @ts-ignore
    this.querySelector("#close-btn-top").onclick = () =>
      this.dispatchEvent(new CustomEvent("close"));
    // @ts-ignore
    this.querySelector("#save-btn").onclick = () =>
      this.dispatchEvent(new CustomEvent("close"));
    // @ts-ignore
    this.querySelector("#clear-btn").onclick = () => {
      this.anchors = [];
      this.dispatchEvent(new CustomEvent("update", { detail: [] }));
      this.renderAnchors();
    };
    // @ts-ignore
    this.querySelector(".visual-overlay").onclick = (e) => this.addAnchor(e);
  }
}
customElements.define("visual-alignment-modal", VisualModal);

class ColumnAdjuster extends HTMLElement {
  constructor() {
    super();

    this.trackRef = { current: null };

    /**
     * @type {any[]}
     */
    this.localAnchors = [];
    this.activeIdx = -1;
    this.trackWidthPt = 800;

    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
  }

  connectedCallback() {
    this.localAnchors = this.initialAnchors || [];

    this.render();

    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mouseup", this.onMouseUp);
  }

  disconnectedCallback() {
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mouseup", this.onMouseUp);
  }

  /** Public API – matches original host.getAnchors */
  getAnchors() {
    return [...this.localAnchors].sort((a, b) => a - b);
  }

  /** Allow external updates */
  set initialAnchors(val) {
    // @ts-ignore
    this._initialAnchors = val || [];
    this.localAnchors = [...this._initialAnchors];
    this.render();
  }

  // @ts-ignore
  get initialAnchors() {
    return this._initialAnchors;
  }

  /**
   * @param {MouseEvent} e
   */
  getPt(e) {
    if (!this.trackRef.current) return 0;
    const rect = this.trackRef.current.getBoundingClientRect();
    // @ts-ignore
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const xPct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return xPct * this.trackWidthPt;
  }

  /**
   * @param {MouseEvent} e
   */
  onMouseDown(e) {
    const pt = this.getPt(e);
    const rect = this.trackRef.current.getBoundingClientRect();
    const clientX = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;

    const hitIdx = this.localAnchors.findIndex(
      (a) => Math.abs(((a / this.trackWidthPt) * rect.width) - clientX) < 10,
    );

    if (hitIdx !== -1) {
      if (e.altKey) {
        this.localAnchors = this.localAnchors.filter((_, i) => i !== hitIdx);
        this.activeIdx = -1;
      } else {
        this.activeIdx = hitIdx;
      }
    } else {
      const next = [...this.localAnchors, pt].sort((a, b) => a - b);
      this.localAnchors = next;
      this.activeIdx = next.indexOf(pt);
    }

    this.render();
  }

  /**
   * @param {MouseEvent} e
   */
  onMouseMove(e) {
    if (this.activeIdx === -1) return;

    this.localAnchors = this.localAnchors.map((a, i) =>
      i === this.activeIdx ? this.getPt(e) : a
    );

    this.render();
  }

  onMouseUp() {
    this.activeIdx = -1;
  }

  render() {
    render(
      html`
        <div
          class="settings-card"
          style="margin-top:1rem;border-color:#c7d2fe;background:#f5f3ff;"
        >
          <div
            style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;"
          >
            <span class="label-tiny">Column Editor</span>
            <button
              class="btn btn-ghost"
              style="font-size:0.65rem;color:var(--primary);font-weight:800;"
              @click="${this
                // @ts-ignore
                .onOpenVisual}"
            >
              Launch Visual Aligner
            </button>
          </div>

          <div class="anchor-track" ${ref(
            (el) => (this.trackRef.current = el),
          )} @mousedown="${this.onMouseDown}">
            ${when(
              this.localAnchors.length === 0,
              () =>
                html`
                  <div class="track-hint">Click to place column markers</div>
                `,
            )} ${map(
              this.localAnchors,
              (x, i) =>
                html`
                  <div
                    class="anchor-marker ${this.activeIdx === i
                      ? "active"
                      : ""}"
                    style="left:${(x / this.trackWidthPt) * 100}%"
                  >
                  </div>
                `,
            )}
          </div>
        </div>
      `,
      this,
    );
  }
}

customElements.define("column-adjuster", ColumnAdjuster);

function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [password, setPassword] = useState("");
  const adjusterRef = useRef(null);

  const handleReparse = () => {
    let currentAnchors = state.manualAnchors;
    if (state.showManualSettings && adjusterRef.current?.getAnchors) {
      currentAnchors = adjusterRef.current.getAnchors();
    }
    extractFromPdf(state.lastFile, currentAnchors, password);
  };

  const extractFromPdf = async (
    file,
    providedAnchors = null,
    pdfPassword = "",
  ) => {
    if (!file) return;
    dispatch({ type: "START_PROCESSING", file });
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({
        data: arrayBuffer,
        password: pdfPassword,
      }).promise;

      let anchors = providedAnchors;
      if (!anchors?.length && !state.showManualSettings) {
        const page = await pdf.getPage(1);
        const content = await page.getTextContent();
        const clusters = [];
        content.items.forEach((it) => {
          const x = it.transform[4] + (it.width / 2);
          let c = clusters.find((cl) =>
            Math.abs(cl.avg - x) < state.colLeniency
          );
          if (c) {
            c.pts.push(x);
            c.avg = c.pts.reduce((a, b) => a + b, 0) / c.pts.length;
          } else clusters.push({ avg: x, pts: [x] });
        });
        anchors = clusters.map((c) => c.avg).sort((a, b) => a - b);
      }

      for (let i = 1; i <= pdf.numPages; i++) {
        dispatch({ type: "SET_STEP", step: `Reading Page ${i}...` });
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1.0 });
        const scale = 800 / viewport.width;

        const items = content.items.map((it) => ({
          str: it.str,
          y: it.transform[5],
          centerX: (it.transform[4] + (it.width / 2)) * scale,
        })).filter((it) => it.str.trim());

        const lines = [];
        items.forEach((it) => {
          let l = lines.find((ln) => Math.abs(ln.y - it.y) < state.rowLeniency);
          if (l) l.items.push(it);
          else lines.push({ y: it.y, items: [it] });
        });
        lines.sort((a, b) => b.y - a.y);

        const startIdx = lines.findIndex((ln) =>
          ln.items.some((it) =>
            it.str.toLowerCase().includes(state.triggerWord.toLowerCase())
          )
        );
        const rows = (startIdx === -1 ? lines : lines.slice(startIdx)).map(
          (ln) => {
            const r = new Array(anchors.length).fill("");
            ln.items.forEach((it) => {
              let b = 0, m = Infinity;
              anchors.forEach((a, idx) => {
                const d = Math.abs(a - it.centerX);
                if (d < m) {
                  m = d;
                  b = idx;
                }
              });
              r[b] = r[b] ? r[b] + " " + it.str : it.str;
            });
            return r;
          },
        );
        dispatch({
          type: "APPEND_PAGE_DATA",
          pageData: { page: i, rows },
          anchors,
        });
      }
      dispatch({ type: "FINISH_PROCESSING" });
    } catch (err) {
      if (err instanceof Error) {
        if (err instanceof Error && err.name === "PasswordException") {
          dispatch({ type: "SHOW_PASSWORD_PROMPT" });
        } else dispatch({ type: "SET_ERROR", error: err.message });
      }
    }
  };

  const copyAll = () => {
    const text = state.extractedData.flatMap((p) => p.rows).map((r) =>
      r.join("\t")
    ).join("\n");
    const area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    document.body.removeChild(area);
    dispatch({ type: "SET_COPY_STATUS", status: { all: true } });
    setTimeout(() => dispatch({ type: "SET_COPY_STATUS", status: {} }), 2000);
  };

  return html`
    <div class="container">
      <header>
        <div>
          <h1>Table Extractor</h1>
          <p class="subtitle">Searchable PDF Data Recovery</p>
        </div>
        ${when(state.extractedData.length, () =>
          html`
            <div style="display:flex; gap:1rem;">
              <button class="btn btn-ghost" @click="${() =>
                dispatch({ type: "RESET" })}">Reset</button>
              <button class="btn btn-primary" @click="${copyAll}">${state
                  .copyStatus.all
                ? "✓ Copied"
                : "Copy TSV"}</button>
            </div>
          `)}
      </header>

      <drop-zone
        ?disabled="${state.isProcessing}"
        .fileName="${state.lastFile?.name}"
        @file-selected="${(e) => extractFromPdf(e.detail[0])}"
      ></drop-zone>

      <div class="settings-card">
        <div class="settings-grid">
          <div class="input-group">
            <span class="label-tiny">Row Trigger</span><input
              type="text"
              .value="${state.triggerWord}"
              @input="${(e) =>
                dispatch({
                  type: "SET_CONFIG",
                  key: "triggerWord",
                  value: e.target.value,
                })}"
            />
          </div>
          <div
            class="input-group"
          >
            <div style="display:flex; justify-content: space-between;">
              <span class="label-tiny">Row Leniency</span><span
                class="value-badge"
                }
              >${state.rowLeniency}</span>
            </div><input
              type="range"
              min="1"
              max="30"
              .value="${state.rowLeniency}"
              @input="${(e) =>
                dispatch({
                  type: "SET_CONFIG",
                  key: "rowLeniency",
                  value: e.target.value,
                })}"
            />
          </div>

          <div
            class="input-group"
          >
            <div style="display:flex; justify-content: space-between;">
              <span class="label-tiny">Auto-Col Cluster</span><span
                class="value-badge"
              >${state.colLeniency}</span>
            </div>

            <input
              type="range"
              min="10"
              max="150"
              .value="${state.colLeniency}"
              @input="${(e) =>
                dispatch({
                  type: "SET_CONFIG",
                  key: "colLeniency",
                  value: e.target.value,
                })}"
            />
          </div>
          <div
            style="border-left: 1px solid var(--border); padding-left: 1rem; display: flex; flex-direction: column; gap: 0.5rem;"
          >
            <label
              style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem;"
            ><input type="checkbox" .checked="${state
              .showManualSettings}" @change="${(e) =>
              dispatch({
                type: "SET_CONFIG",
                key: "showManualSettings",
                value: e.target.checked,
              })}" />
              Manual Mode</label>
            <button
              class="btn btn-primary"
              style="padding: 0.4rem; font-size: 0.75rem;"
              @click="${handleReparse}"
              ?disabled="${!state.lastFile || state.isProcessing}"
            >
              Apply & Reparse
            </button>
          </div>
        </div>
        ${when(state.showManualSettings, () =>
          html`
            <column-adjuster
              ${ref((el) => adjusterRef.current = el)}
              .initialAnchors="${state.manualAnchors}"
              .onOpenVisual="${() =>
                dispatch({ type: "TOGGLE_VISUAL_MODAL", value: true })}"
            ></column-adjuster>
          `)}
      </div>

      ${when(state.isProcessing, () =>
        html`
          <div class="status-bar"><span class="dot-loader"></span> ${state
            .processingStep}</div>
        `)} ${when(state.error, () =>
          html`
            <div class="error-msg">${state.error}</div>
          `)} ${when(state.extractedData.length, () =>
          html`
            <div class="toggle-container">
              <h3 style="margin:0; font-size: 0.875rem;">Preview</h3><label
                style="display: flex; align-items: center; gap: 0.5rem;"
              ><span class="label-tiny">Show All Pages</span><input
                type="checkbox"
                .checked="${state.showAllPages}"
                @change="${(e) =>
                  dispatch({
                    type: "SET_CONFIG",
                    key: "showAllPages",
                    value: e.target.checked,
                  })}"
              /></label>
            </div>
            ${map(
              state.showAllPages
                ? state.extractedData
                : state.extractedData.slice(0, 1),
              (page) =>
                html`
                  <div class="page-card">
                    <div class="page-header">
                      <span>Page ${page.page}</span><span>${page.rows
                        .length} Rows</span>
                    </div>
                    <div class="table-container"><table><tbody>${map(
                      page.rows,
                      (r, i) =>
                        html`
                          <tr><td class="row-num">${i + 1}</td>${map(r, (c) =>
                            html`
                              <td>${c}</td>
                            `)}</tr>
                        `,
                    )}</tbody></table></div>
                  </div>
                `,
            )}
          `)} ${when(state.showPasswordModal, () =>
          html`
            <div class="modal-overlay">
              <form class="modal-content" @submit="${(
                /** @type {SubmitEvent} */ e,
              ) => {
                e.preventDefault();
                extractFromPdf(state.lastFile, state.manualAnchors, password);
              }}">
                <h2 style="margin:0">Protected PDF</h2><input
                  type="password"
                  placeholder="Password"
                  .value="${password}"
                  @input="${(/** @type {InputEvent} */ e) =>
                    setPassword(
                      e?.target
                        // @ts-ignore
                        ?.value ?? "",
                    )}"
                  required
                /><div style="display:flex; gap:1rem; justify-content:flex-end;">
                  <button type="button" class="btn btn-ghost" @click="${() =>
                    dispatch({ type: "RESET" })}">
                    Cancel
                  </button>
                  <button type="submit" class="btn btn-primary">Unlock</button>
                </div>
              </form>
            </div>
          `)} ${when(state.showVisualModal, () =>
          html`
            <visual-alignment-modal
              .pdfFile="${state.lastFile}"
              .anchors="${state.manualAnchors || []}"
              @update="${(/** @type {CustomEvent} */ e) =>
                dispatch({ type: "SET_ANCHORS", anchors: e.detail })}"
              @close="${() =>
                dispatch({ type: "TOGGLE_VISUAL_MODAL", value: false })}"
            >
            </visual-alignment-modal>
          `)}
    </div>
  `;
}

// @ts-ignore
customElements.define("main-app", component(App, { useShadowDOM: false }));
render(
  html`
    <main-app></main-app>
  `,
  document.getElementById("app"),
);
