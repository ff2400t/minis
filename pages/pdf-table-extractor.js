import { html, map, ref, render, when } from "/vendor/lit-html.js";
import { component, useReducer, useRef, useState } from "/vendor/haunted.js";
import "/components/drop-zone.js";

// @ts-ignore
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const initialState = {
  isProcessing: false,
  processingStep: "",
  extractedData: [],
  error: null,
  /** @type {File | null} */
  lastFile: null,
  triggerWord: "Date",
  rowLeniency: 8,
  colLeniency: 45,
  copyStatus: {},
  showManualSettings: false,
  manualAnchors: [],
  showAllPages: false,
  showPasswordModal: false,
  showVisualModal: false,
};

/**
 * @type {import("vendor/haunted.d.ts").Reducer<typeof initialState, {type: string, payload: any}>}
 */
function reducer(state, action) {
  const { type, payload } = action;
  switch (type) {
    case "SET_CONFIG":
      return { ...state, [payload.key]: payload.value };
    case "START_PROCESSING":
      return {
        ...state,
        isProcessing: true,
        processingStep: "Initializing...",
        error: null,
        lastFile: payload?.file || state.lastFile,
        showPasswordModal: false,
      };
    case "SET_STEP":
      return { ...state, processingStep: payload.step };
    case "APPEND_PAGE_DATA":
      if (payload.pageData.page === 1) {
        return {
          ...state,
          extractedData: [payload.pageData],
          manualAnchors: payload.anchors !== undefined
            ? payload.anchors
            : state.manualAnchors,
        };
      }
      return {
        ...state,
        extractedData: [...state.extractedData, payload.pageData],
      };
    case "FINISH_PROCESSING":
      return { ...state, isProcessing: false, processingStep: "" };
    case "SET_ERROR":
      return { ...state, isProcessing: false, error: payload.error };
    case "SHOW_PASSWORD_PROMPT":
      return { ...state, isProcessing: false, showPasswordModal: true };
    case "RESET":
      return { ...initialState };
    case "SET_ANCHORS":
      return { ...state, manualAnchors: payload.anchors };
    case "SET_COPY_STATUS":
      return {
        ...state,
        copyStatus: { ...state.copyStatus, ...payload.status },
      };
    case "TOGGLE_VISUAL_MODAL":
      return { ...state, showVisualModal: payload.value };
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
        this.anchors = this.anchors.filter((_, idx) => idx !== i);
        this.dispatchEvent(new CustomEvent("update", { detail: this.anchors }));
        this.renderAnchors();
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
                                <span style="color: #94a3b8; font-size: 0.75rem; font-weight: 700; text-transform: uppercase;">Click on PDF to place column markers • Click marker to remove</span>
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
    this.localAnchors = [];
    this.activeIdx = -1;
    this.trackWidthPt = 800;
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
  }

  connectedCallback() {
    this.render();
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mouseup", this.onMouseUp);
  }

  disconnectedCallback() {
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mouseup", this.onMouseUp);
  }

  getAnchors() {
    return [...this.localAnchors].sort((a, b) => a - b);
  }

  set anchors(val) {
    this.localAnchors = val || [];
    this.render();
  }

  getPt(e) {
    if (!this.trackRef.current) return 0;
    const rect = this.trackRef.current.getBoundingClientRect();
    // @ts-ignore
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const xPct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return xPct * this.trackWidthPt;
  }

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
        this.dispatchEvent(
          new CustomEvent("update", { detail: this.localAnchors }),
        );
        this.activeIdx = -1;
      } else {
        this.activeIdx = hitIdx;
      }
    } else {
      const next = [...this.localAnchors, pt].sort((a, b) => a - b);
      this.localAnchors = next;
      this.activeIdx = next.indexOf(pt);
      this.dispatchEvent(
        new CustomEvent("update", { detail: this.localAnchors }),
      );
    }
    this.render();
  }

  onMouseMove(e) {
    if (this.activeIdx === -1) return;
    this.localAnchors = this.localAnchors.map((a, i) =>
      i === this.activeIdx ? this.getPt(e) : a
    );
    this.dispatchEvent(
      new CustomEvent("update", { detail: this.localAnchors }),
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
              @click="${this.onOpenVisual}"
            >
              Launch Visual Aligner
            </button>
          </div>

          <div class="anchor-track" ${ref((
            el,
          ) => (this.trackRef.current = el))} @mousedown="${this.onMouseDown}">
            ${when(this.localAnchors.length === 0, () =>
              html`
                <div class="track-hint">Click to place column markers</div>
              `)} ${map(this.localAnchors, (x, i) =>
                html`
                  <div class="anchor-marker ${this.activeIdx === i
                    ? "active"
                    : ""}" style="left:${(x / this.trackWidthPt) * 100}%"></div>
                `)}
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

  const extractFromPdf = async (
    /** @type {File} */ file,
    providedAnchors = null,
    pdfPassword = "",
  ) => {
    if (!file) return;

    // Use provided anchors, or existing manual anchors if in manual mode
    let anchorsToUse = providedAnchors;
    if (anchorsToUse === null && state.showManualSettings) {
      anchorsToUse = state.manualAnchors;
    }

    dispatch({ type: "START_PROCESSING", payload: { file } });
    try {
      const arrayBuffer = await file.arrayBuffer();
      // @ts-ignore
      const pdf = await pdfjsLib.getDocument({
        data: arrayBuffer,
        password: pdfPassword,
      }).promise;

      let anchors = anchorsToUse;
      if (!anchors?.length && !state.showManualSettings) {
        dispatch({
          type: "SET_STEP",
          payload: { step: "Auto-detecting columns..." },
        });
        const page = await pdf.getPage(1);
        const content = await page.getTextContent();
        const clusters = [];
        content.items.forEach((it) => {
          // @ts-ignore
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
        dispatch({
          type: "SET_STEP",
          payload: { step: `Reading Page ${i}/${pdf.numPages}...` },
        });
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1.0 });
        const scale = 800 / viewport.width;

        const items = content.items.map((it) => ({
          // @ts-ignore
          str: it.str,
          // @ts-ignore
          y: it.transform[5],
          // @ts-ignore
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

        const safeAnchors = anchors || [];
        const rows = (startIdx === -1 ? lines : lines.slice(startIdx)).map(
          (ln) => {
            const r = new Array(safeAnchors.length).fill("");
            ln.items.forEach((it) => {
              let b = 0, m = Infinity;
              safeAnchors.forEach((a, idx) => {
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
          payload: {
            pageData: { page: i, rows },
            anchors: i === 1 ? anchors : undefined,
          },
        });
      }
      dispatch({
        type: "FINISH_PROCESSING",
        payload: undefined,
      });
    } catch (err) {
      console.error(err);
      if (err instanceof Error) {
        if (err.name === "PasswordException") {
          dispatch({
            type: "SHOW_PASSWORD_PROMPT",
            payload: undefined,
          });
        } else {
          dispatch({ type: "SET_ERROR", payload: { error: err.message } });
        }
      }
    }
  };

  const handleReparse = () => {
    extractFromPdf(state.lastFile, state.manualAnchors, password);
  };

  const copyTSV = () => {
    const text = state.extractedData.flatMap((p) => p.rows).map((r) =>
      r.join("\t")
    ).join("\n");
    navigator.clipboard.writeText(text).then(() => {
      dispatch({ type: "SET_COPY_STATUS", payload: { status: { all: true } } });
      setTimeout(
        () =>
          dispatch({
            type: "SET_COPY_STATUS",
            payload: { status: { all: false } },
          }),
        2000,
      );
    });
  };

  const copyMarkers = () => {
    const text = JSON.stringify(state.manualAnchors);
    navigator.clipboard.writeText(text).then(() => {
      dispatch({
        type: "SET_COPY_STATUS",
        payload: { status: { markers: true } },
      });
      setTimeout(
        () =>
          dispatch({
            type: "SET_COPY_STATUS",
            payload: { status: { markers: false } },
          }),
        2000,
      );
    });
  };

  const pasteMarkers = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const anchors = JSON.parse(text);
      if (Array.isArray(anchors)) {
        dispatch({ type: "SET_ANCHORS", payload: { anchors } });
      }
    } catch (e) {
      alert("Invalid marker data in clipboard.");
    }
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
                dispatch({
                  type: "RESET",
                  payload: undefined,
                })}">Reset</button>
              <button class="btn btn-primary" @click="${copyTSV}">
                ${state.copyStatus.all ? "✓ Copied" : "Copy TSV"}
              </button>
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
            <span class="label-tiny">Row Trigger</span>
            <input type="text" .value="${state.triggerWord}" @input="${(e) =>
              dispatch({
                type: "SET_CONFIG",
                payload: { key: "triggerWord", value: e.target.value },
              })}" />
          </div>
          <div class="input-group">
            <div style="display:flex; justify-content: space-between;">
              <span class="label-tiny">Row Leniency</span>
              <span class="value-badge">${state.rowLeniency}</span>
            </div>
            <input
              type="range"
              min="1"
              max="30"
              .value="${state.rowLeniency}"
              @input="${(e) =>
                dispatch({
                  type: "SET_CONFIG",
                  payload: { key: "rowLeniency", value: e.target.value },
                })}"
            />
          </div>
          <div class="input-group">
            <div style="display:flex; justify-content: space-between;">
              <span class="label-tiny">Auto-Col Cluster</span>
              <span class="value-badge">${state.colLeniency}</span>
            </div>
            <input
              type="range"
              min="10"
              max="150"
              .value="${state.colLeniency}"
              @input="${(e) =>
                dispatch({
                  type: "SET_CONFIG",
                  payload: { key: "colLeniency", value: e.target.value },
                })}"
            />
          </div>
          <div
            style="border-left: 1px solid var(--border); padding-left: 1rem; display: flex; flex-direction: column; gap: 0.5rem;"
          >
            <label
              style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem;"
            >
              <input type="checkbox" .checked="${state
                .showManualSettings}" @change="${(e) =>
                dispatch({
                  type: "SET_CONFIG",
                  payload: {
                    key: "showManualSettings",
                    value: e.target.checked,
                  },
                })}" />
              Manual Mode
            </label>
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
            <div
              style="margin-top: 1rem; display: flex; gap: 0.5rem; justify-content: flex-end;"
            >
              <button
                class="btn btn-ghost"
                style="font-size: 0.65rem;"
                @click="${copyMarkers}"
              >
                ${state.copyStatus.markers ? "✓ Copied" : "Copy Markers"}
              </button>
              <button
                class="btn btn-ghost"
                style="font-size: 0.65rem;"
                @click="${pasteMarkers}"
              >
                Paste Markers
              </button>
              <button
                class="btn btn-ghost"
                style="font-size: 0.65rem; color: #ef4444;"
                @click="${() =>
                  dispatch({ type: "SET_ANCHORS", payload: { anchors: [] } })}"
              >
                Clear All
              </button>
            </div>
            <column-adjuster
              ${ref(adjusterRef)}
              .anchors="${state.manualAnchors}"
              .onOpenVisual="${() =>
                dispatch({
                  type: "TOGGLE_VISUAL_MODAL",
                  payload: { value: true },
                })}"
              @update="${(e) =>
                dispatch({
                  type: "SET_ANCHORS",
                  payload: { anchors: e.detail },
                })}"
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
              <h3 style="margin:0; font-size: 0.875rem;">Preview</h3>
              <label style="display: flex; align-items: center; gap: 0.5rem;">
                <span class="label-tiny">Show All Pages</span>
                <input type="checkbox" .checked="${state
                  .showAllPages}" @change="${(e) =>
                  dispatch({
                    type: "SET_CONFIG",
                    payload: { key: "showAllPages", value: e.target.checked },
                  })}" />
              </label>
            </div>
            ${map(
              state.showAllPages
                ? state.extractedData
                : state.extractedData.slice(0, 1),
              (page) =>
                html`
                  <div class="page-card">
                    <div class="page-header">
                      <span>Page ${page.page}</span>
                      <span>${page.rows.length} Rows</span>
                    </div>
                    <div class="table-container">
                      <table>
                        <tbody>
                          ${map(page.rows, (r, i) =>
                            html`
                              <tr>
                                <td class="row-num">${i + 1}</td>
                                ${map(r, (c) =>
                                  html`
                                    <td>${c}</td>
                                  `)}
                              </tr>
                            `)}
                        </tbody>
                      </table>
                    </div>
                  </div>
                `,
            )}
          `)} ${when(state.showPasswordModal, () =>
          html`
            <div class="modal-overlay">
              <form
                class="modal-content"
                style="background: white; padding: 2rem; border-radius: 1rem; display: flex; flex-direction: column; gap: 1rem;"
                @submit="${(e) => {
                  e.preventDefault();
                  extractFromPdf(state.lastFile, state.manualAnchors, password);
                }}"
              >
                <h2 style="margin:0">Protected PDF</h2>
                <input
                  type="password"
                  placeholder="Password"
                  .value="${password}"
                  @input="${(e) => setPassword(e.target.value)}"
                  required
                />
                <div style="display:flex; gap:1rem; justify-content:flex-end;">
                  <button type="button" class="btn btn-ghost" @click="${() =>
                    dispatch({
                      type: "SET_CONFIG",
                      payload: { key: "showPasswordModal", value: false },
                    })}">
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
              .anchors="${state.manualAnchors}"
              @update="${(e) =>
                dispatch({
                  type: "SET_ANCHORS",
                  payload: { anchors: e.detail },
                })}"
              @close="${() =>
                dispatch({
                  type: "TOGGLE_VISUAL_MODAL",
                  payload: { value: false },
                })}"
            ></visual-alignment-modal>
          `)}
    </div>
  `;
}

customElements.define("main-app", component(App, { useShadowDOM: false }));
render(
  html`
    <main-app></main-app>
  `,
  document.getElementById("app"),
);
