import { html, map, ref, render, when } from "/vendor/lit-html.js";
import { component, useReducer, useRef, useState } from "/vendor/haunted.js";
import "/components/drop-zone.js";
import "/components/status-message.js";

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
    this.pdfFile = null;
    this.localAnchors = [];
    this.pdfDoc = null;
    this.currentPage = 1;
    this.totalPages = 0;
    this.scale = 1;
    this.activeIdx = -1;
    this.canvasRef = { current: null };
    this.overlayRef = { current: null };
    this.trackWidthPt = 800; // Consistent with auto-detection scale
    this.status = "";

    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
  }

  set anchors(val) {
    this.localAnchors = [...(val || [])];
    this.render();
  }

  connectedCallback() {
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mouseup", this.onMouseUp);
    this.loadPdf();
  }

  disconnectedCallback() {
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mouseup", this.onMouseUp);
  }

  async loadPdf() {
    if (!this.pdfFile) return;
    try {
      this.status = "Loading Document...";
      this.render();
      const arrayBuffer = await this.pdfFile.arrayBuffer();
      // @ts-ignore
      this.pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      this.totalPages = this.pdfDoc.numPages;
      this.status = "";
      await this.renderPage(1);
    } catch (e) {
      console.error(e);
      this.status = "Error loading PDF.";
      this.render();
    }
  }

  async renderPage(num) {
    if (!this.pdfDoc) return;
    this.currentPage = num;
    this.render();

    try {
      const page = await this.pdfDoc.getPage(num);
      const viewport = page.getViewport({ scale: 1.5 });

      const canvas = this.canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext("2d");
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      this.scale = viewport.width / this.trackWidthPt;

      await page.render({ canvasContext: context, viewport: viewport }).promise;
      this.render();
    } catch (e) {
      console.error(e);
    }
  }

  getPt(e) {
    if (!this.overlayRef.current) return 0;
    const rect = this.overlayRef.current.getBoundingClientRect();
    const clientX = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    return clientX / this.scale;
  }

  onMouseDown(e) {
    if (!this.overlayRef.current) return;
    const pt = this.getPt(e);
    const rect = this.overlayRef.current.getBoundingClientRect();
    const clientX = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;

    const hitIdx = this.localAnchors.findIndex(
      (a) => Math.abs((a * this.scale) - clientX) < 12,
    );

    if (hitIdx !== -1) {
      if (e.altKey) {
        this.localAnchors = this.localAnchors.filter((_, i) => i !== hitIdx);
        this.dispatchEvent(new CustomEvent("update", { detail: this.localAnchors }));
        this.activeIdx = -1;
      } else {
        this.activeIdx = hitIdx;
      }
    } else {
      const next = [...this.localAnchors, pt].sort((a, b) => a - b);
      this.localAnchors = next;
      this.activeIdx = next.indexOf(pt);
      this.dispatchEvent(new CustomEvent("update", { detail: this.localAnchors }));
    }
    this.render();
  }

  onMouseMove(e) {
    if (this.activeIdx === -1) return;
    const pt = this.getPt(e);
    this.localAnchors = this.localAnchors.map((a, i) =>
      i === this.activeIdx ? pt : a
    );
    this.dispatchEvent(new CustomEvent("update", { detail: this.localAnchors }));
    this.render();
  }

  onMouseUp() {
    if (this.activeIdx !== -1) {
      this.localAnchors = [...this.localAnchors].sort((a, b) => a - b);
      this.dispatchEvent(new CustomEvent("update", { detail: this.localAnchors }));
    }
    this.activeIdx = -1;
    this.render();
  }

  render() {
    render(
      html`
        <div class="modal-overlay">
          <div class="modal-container">
            <div class="modal-header">
              <div style="display: flex; align-items: center; gap: 2rem;">
                <h2 style="margin:0; font-size:1.1rem; color:white;">Visual Aligner</h2>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                  <button class="btn btn-ghost" 
                    ?disabled="${this.currentPage <= 1}" 
                    style="color:white"
                    @click="${() => this.renderPage(this.currentPage - 1)}">←</button>
                  <span style="color:white; font-size: 0.875rem; font-family: monospace;">Page ${this.currentPage} / ${this.totalPages}</span>
                  <button class="btn btn-ghost" 
                    ?disabled="${this.currentPage >= this.totalPages}" 
                    style="color:white"
                    @click="${() => this.renderPage(this.currentPage + 1)}">→</button>
                </div>
              </div>
              <button class="btn btn-ghost" style="color:white;" @click="${() => this.dispatchEvent(new CustomEvent("close"))}">✕</button>
            </div>
            
            <div class="modal-body">
              ${when(this.status, () => html`<div style="color: #94a3b8; font-weight: 600;">${this.status}</div>`)}
              <div class="visual-canvas-wrapper" style="${this.status ? "display:none" : ""}">
                <canvas ${ref(this.canvasRef)}></canvas>
                <div class="visual-overlay" 
                  ${ref(this.overlayRef)} 
                  @mousedown="${this.onMouseDown}">
                  ${map(this.localAnchors, (x, i) => html`
                    <div class="anchor-marker ${this.activeIdx === i ? "active" : ""}" 
                      style="left: ${x * this.scale}px; height: 100%; top: 0;">
                      <span style="position: absolute; top: -24px; left: 50%; transform: translateX(-50%); background: ${this.activeIdx === i ? "#ef4444" : "var(--primary)"}; color: white; font-size: 10px; font-weight: 800; padding: 2px 6px; border-radius: 4px; pointer-events: none; white-space: nowrap; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
                        ${i + 1}
                      </span>
                    </div>
                  `)}
                </div>
              </div>
            </div>

            <div class="modal-footer">
              <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                <span style="color: #94a3b8; font-size: 0.75rem; font-weight: 700; text-transform: uppercase;">
                  Click to add • Drag to move • Alt+Click to remove
                </span>
                <span style="color: #64748b; font-size: 0.65rem;">
                  Align markers with PDF columns for better extraction
                </span>
              </div>
              <div style="display:flex; gap:1rem;">
                <button class="btn btn-ghost" @click="${() => {
                  this.localAnchors = [];
                  this.dispatchEvent(new CustomEvent("update", { detail: [] }));
                  this.render();
                }}">Clear All</button>
                <button class="btn btn-primary" @click="${() => this.dispatchEvent(new CustomEvent("close"))}">Done</button>
              </div>
            </div>
          </div>
        </div>
      `,
      this
    );
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
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mouseup", this.onMouseUp);
    this.render();
  }

  disconnectedCallback() {
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mouseup", this.onMouseUp);
  }

  getAnchors() {
    return [...this.localAnchors].sort((a, b) => a - b);
  }

  set anchors(val) {
    this.localAnchors = [...(val || [])];
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
    if (!this.trackRef.current) return;
    const pt = this.getPt(e);
    const rect = this.trackRef.current.getBoundingClientRect();
    const clientX = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;

    const hitIdx = this.localAnchors.findIndex(
      (a) => Math.abs(((a / this.trackWidthPt) * rect.width) - clientX) < 12,
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
    if (this.activeIdx !== -1) {
      this.localAnchors = [...this.localAnchors].sort((a, b) => a - b);
      this.dispatchEvent(new CustomEvent("update", { detail: this.localAnchors }));
    }
    this.activeIdx = -1;
    this.render();
  }

  render() {
    render(
      html`
        <div
          class="settings-card"
          style="margin-top:1rem; border-color: #e2e8f0; background: #ffffff; padding: 1rem;"
        >
          <div
            style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;"
          >
            <div style="display: flex; align-items: center; gap: 0.5rem;">
               <span class="label-tiny">Column Markers</span>
               <span class="value-badge" style="background: #f1f5f9; color: #64748b;">${this.localAnchors.length}</span>
            </div>
            <button
              class="btn btn-primary"
              style="padding: 0.4rem 0.8rem; font-size: 0.7rem;"
              @click="${this.onOpenVisual}"
            >
              Launch Visual Aligner
            </button>
          </div>

          <div class="anchor-track" 
            ${ref((el) => (this.trackRef.current = el))} 
            @mousedown="${this.onMouseDown}"
            style="height: 40px; background: #f8fafc; border-style: dashed;"
          >
            ${when(this.localAnchors.length === 0, () =>
              html`
                <div class="track-hint">Click here to place markers manually</div>
              `)} 
            ${map(this.localAnchors, (x, i) =>
                html`
                  <div class="anchor-marker ${this.activeIdx === i ? "active" : ""}" 
                    style="left:${(x / this.trackWidthPt) * 100}%">
                    <span style="position: absolute; top: -22px; left: 50%; transform: translateX(-50%); font-size: 10px; font-weight: 800; color: ${this.activeIdx === i ? "#ef4444" : "var(--primary)"}; pointer-events: none;">${i + 1}</span>
                  </div>
                `)}
          </div>
          <div style="margin-top: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 0.65rem; color: var(--text-muted);">
              Alt + Click to remove • Drag to adjust
            </span>
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
    <app-layout title="PDF Table Extractor">
      <div class="space-y-6">
        <header class="flex justify-between items-end gap-4">
          <div>
            <p class="text-gray-500">Searchable PDF Data Recovery</p>
          </div>
          ${when(state.extractedData.length, () =>
            html`
              <div class="flex gap-4">
                <button class="btn btn-secondary" @click="${() =>
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

        <div class="card">
          <div class="grid grid-cols-1 md:grid-cols-4 gap-6 items-center">
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
              class="flex flex-col gap-2 pt-4 md:pt-0"
            >
              <label
                class="flex items-center gap-2 text-xs font-bold text-gray-600 uppercase"
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
                class="btn btn-primary py-2 text-xs"
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
                  class="btn btn-secondary text-xs py-1"
                  @click="${copyMarkers}"
                >
                  ${state.copyStatus.markers ? "✓ Copied" : "Copy Markers"}
                </button>
                <button
                  class="btn btn-secondary text-xs py-1"
                  @click="${pasteMarkers}"
                >
                  Paste Markers
                </button>
                <button
                  class="btn btn-secondary text-xs py-1 text-red-500 hover:text-red-700"
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
            <status-message type="info" .message="${state.processingStep}"></status-message>
          `)} ${when(state.error, () =>
            html`
              <status-message type="error" .message="${state.error}"></status-message>
            `)} ${when(state.extractedData.length, () =>
            html`
              <div class="toggle-container">
                <h3 style="margin:0; font-size: 0.875rem; font-weight:700;">Data Preview</h3>
                <label class="flex items-center gap-2">
                  <span class="label-tiny">Show All Pages</span>
                  <input type="checkbox" class="nd-switch" .checked="${state
                    .showAllPages}" @change="${(e) =>
                    dispatch({
                      type: "SET_CONFIG",
                      payload: { key: "showAllPages", value: e.target.checked },
                    })}" />
                </label>
              </div>
              <div class="space-y-6">
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
              </div>
            `)}
      </div>

      <!-- Modals -->
      ${when(state.showPasswordModal, () =>
        html`
          <div class="modal-backdrop">
            <form
              class="card w-full max-w-md flex flex-col gap-4"
              @submit="${(e) => {
                e.preventDefault();
                extractFromPdf(state.lastFile, state.manualAnchors, password);
              }}"
            >
              <h2 class="text-xl font-bold">Protected PDF</h2>
              <p class="text-sm text-gray-500">This document is encrypted. Please enter the password to unlock it.</p>
              <input
                type="password"
                placeholder="Password"
                .value="${password}"
                @input="${(e) => setPassword(e.target.value)}"
                required
              />
              <div class="flex gap-3 justify-end mt-2">
                <button type="button" class="btn btn-secondary" @click="${() =>
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
    </app-layout>
  `;
}

customElements.define("main-app", component(App, { useShadowDOM: false }));
render(
  html`
    <main-app></main-app>
  `,
  // @ts-ignore
  document.getElementById("app"),
);
