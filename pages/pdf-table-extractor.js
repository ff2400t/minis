import { html, map, ref, render, when } from "/vendor/lit-html.js";
import { component, useReducer, useRef, useState, useEffect, useCallback } from "/vendor/haunted.js";
import "/components/drop-zone.js";
import "/components/status-message.js";
import "/components/batch-processor.js";
import { adwBadge, adwCard, adwGroup, adwRow, adwSegmentedControl } from "/components/ui.js";

// @ts-ignore
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

// @ts-ignore
const JSZip = globalThis.JSZip;

const initialState = {
  isProcessing: false,
  processingStep: "",
  extractedData: [], // Preview data for the LAST processed file
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
  
  // Batch State
  jobs: [],
  isProcessingQueue: false,
};

/**
 * @type {import("vendor/haunted.d.ts").Reducer<typeof initialState, {type: string, payload: any}>}
 */
function reducer(state, action) {
  const { type, payload } = action;
  switch (type) {
    case "SET_CONFIG":
      return { ...state, [payload.key]: payload.value };
    case "ADD_FILES": {
      const newJobs = payload.map((file) => ({
        id: crypto.randomUUID(),
        file,
        status: "PENDING",
        progress: 0,
        resultBlob: null,
        error: "",
        extractedData: []
      }));
      return { ...state, jobs: [...state.jobs, ...newJobs] };
    }
    case "UPDATE_JOB": {
      const { id, updates } = payload;
      const newState = {
        ...state,
        jobs: state.jobs.map((job) =>
          job.id === id ? { ...job, ...updates } : job
        ),
      };
      // If we just completed a job, update the global preview to this one
      if (updates.status === 'COMPLETED' && updates.extractedData) {
        newState.extractedData = updates.extractedData;
        const job = state.jobs.find(j => j.id === id);
        newState.lastFile = job ? job.file : state.lastFile;
      }
      return newState;
    }
    case "SET_PROCESSING_QUEUE":
      return { ...state, isProcessingQueue: payload };
    case "CANCEL_JOB":
      return {
        ...state,
        jobs: state.jobs.map((job) =>
          job.id === payload ? { ...job, status: "CANCELLED" } : job
        ),
      };
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
    const pt = this.getPt(e);
    this.localAnchors = this.localAnchors.map((a, i) =>
      i === this.activeIdx ? pt : a
    );
    this.dispatchEvent(
      new CustomEvent("update", { detail: this.localAnchors }),
    );
    this.render();
  }

  onMouseUp() {
    if (this.activeIdx !== -1) {
      this.localAnchors = [...this.localAnchors].sort((a, b) => a - b);
      this.dispatchEvent(
        new CustomEvent("update", { detail: this.localAnchors }),
      );
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
              <div style="display: flex; align-items: center; gap: 1rem;">
                <h2
                  style="margin:0; font-size:0.95rem; font-weight:700; color:var(--adw-window-fg);"
                >
                  Visual Aligner
                </h2>
                <div class="segmented-control" style="width: 160px;">
                  <button
                    class="segmented-button"
                    ?disabled="${this.currentPage <= 1}"
                    @click="${() => this.renderPage(this.currentPage - 1)}"
                  >
                    ←
                  </button>
                  <span
                    style="display:flex; align-items:center; justify-content:center; flex:1; font-size: 0.75rem; font-family: var(--font-mono); font-weight:700;"
                  >${this.currentPage} / ${this.totalPages}</span>
                  <button
                    class="segmented-button"
                    ?disabled="${this.currentPage >= this.totalPages}"
                    @click="${() => this.renderPage(this.currentPage + 1)}"
                  >
                    →
                  </button>
                </div>
              </div>
              <button class="btn btn-flat btn-sm" @click="${() =>
                this.dispatchEvent(new CustomEvent("close"))}">✕</button>
            </div>

            <div class="modal-body">
              ${when(this.status, () =>
                html`
                  <div style="color: var(--text-muted); font-weight: 600;">${this
                    .status}</div>
                `)}
              <div class="visual-canvas-wrapper" style="${this.status
                ? "display:none"
                : ""}">
                <canvas ${ref(this.canvasRef)}></canvas>
                <div class="visual-overlay" ${ref(
                  this.overlayRef,
                )} @mousedown="${this.onMouseDown}">
                  ${map(this.localAnchors, (x, i) =>
                    html`
                      <div
                        class="anchor-marker ${this.activeIdx === i
                          ? "active"
                          : ""}"
                        style="left: ${x * this.scale}px; height: 100%; top: 0;"
                      >
                        <span
                          style="position: absolute; top: -24px; left: 50%; transform: translateX(-50%); background: ${this
                              .activeIdx === i
                            ? "var(--adw-destructive-bg)"
                            : "var(--adw-accent-bg)"}; color: white; font-size: 10px; font-weight: 800; padding: 2px 6px; border-radius: 4px; pointer-events: none; white-space: nowrap; box-shadow: 0 2px 4px rgba(0,0,0,0.1);"
                        >
                          ${i + 1}
                        </span>
                      </div>
                    `)}
                </div>
              </div>
            </div>

            <div class="modal-footer">
              <div style="display: flex; flex-direction: column; gap: 2px;">
                <span
                  style="color: var(--text-muted); font-size: 0.7rem; font-weight: 700; text-transform: uppercase;"
                >
                  Click to add • Drag to move • Alt+Click to remove
                </span>
                <span style="color: var(--text-muted); font-size: 0.65rem;">
                  Align markers with PDF columns for better extraction
                </span>
              </div>
              <div style="display:flex; gap:12px;">
                <button class="btn btn-secondary" @click="${() => {
                  this.localAnchors = [];
                  this.dispatchEvent(new CustomEvent("update", { detail: [] }));
                  this.render();
                }}">
                  Clear All
                </button>
                <button class="btn btn-primary" @click="${() =>
                  this.dispatchEvent(new CustomEvent("close"))}">Done</button>
              </div>
            </div>
          </div>
        </div>
      `,
      this,
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
      this.dispatchEvent(
        new CustomEvent("update", { detail: this.localAnchors }),
      );
    }
    this.activeIdx = -1;
    this.render();
  }

  render() {
    render(
      html`
        <div class="adw-row">
          <div class="adw-row-content">
            <div class="adw-row-title">Column Markers</div>
            <div class="adw-row-subtitle">Manual column boundaries for extraction.</div>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <span class="value-badge">${this.localAnchors.length}</span>
            <button
              class="btn btn-secondary"
              @click="${this.onOpenVisual}"
            >
              Launch Aligner
            </button>
          </div>
        </div>

        <div class="p-4 bg-black/[0.01]">
          <div
            class="anchor-track"
            ${ref((el) => (this.trackRef.current = el))}
            @mousedown="${this.onMouseDown}"
            style="height: 40px; margin: 0.5rem 0;"
          >
            ${when(this.localAnchors.length === 0, () =>
              html`
                <div class="track-hint">Click here to place markers manually</div>
              `)} ${map(this.localAnchors, (x, i) =>
                html`
                  <div class="anchor-marker ${this.activeIdx === i
                    ? "active"
                    : ""}" style="left:${(x / this.trackWidthPt) * 100}%">
                    <span
                      style="position: absolute; top: -22px; left: 50%; transform: translateX(-50%); font-size: 10px; font-weight: 800; color: ${this
                          .activeIdx === i
                        ? "var(--adw-destructive-bg)"
                        : "var(--adw-accent-bg)"}; pointer-events: none;"
                    >${i + 1}</span>
                  </div>
                `)}
          </div>
          <div class="mt-2 flex justify-between">
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
  const jobsRef = useRef(state.jobs);

  useEffect(() => {
    jobsRef.current = state.jobs;
  }, [state.jobs]);

  const processJob = async (jobId, config) => {
    const job = jobsRef.current.find(j => j.id === jobId);
    if (!job) return;

    const { file } = job;
    const arrayBuffer = await file.arrayBuffer();
    // @ts-ignore
    const pdf = await pdfjsLib.getDocument({
      data: arrayBuffer,
      password: "", // Batch currently doesn't support individual passwords easily
    }).promise;

    let anchors = config.showManualSettings ? config.manualAnchors : null;
    if (!anchors?.length && !config.showManualSettings) {
      const page = await pdf.getPage(1);
      const content = await page.getTextContent();
      const clusters = [];
      content.items.forEach((it) => {
        // @ts-ignore
        const x = it.transform[4] + (it.width / 2);
        let c = clusters.find((cl) =>
          Math.abs(cl.avg - x) < config.colLeniency
        );
        if (c) {
          c.pts.push(x);
          c.avg = c.pts.reduce((a, b) => a + b, 0) / c.pts.length;
        } else clusters.push({ avg: x, pts: [x] });
      });
      anchors = clusters.map((c) => c.avg).sort((a, b) => a - b);
    }

    const allPageData = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      // Check cancellation
      const currentJob = jobsRef.current.find(j => j.id === jobId);
      if (!currentJob || currentJob.status === 'CANCELLED') throw new Error('CANCELLED');

      dispatch({ type: 'UPDATE_JOB', payload: { id: jobId, updates: { progress: Math.round((i / pdf.numPages) * 100) } } });

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
        let l = lines.find((ln) => Math.abs(ln.y - it.y) < config.rowLeniency);
        if (l) l.items.push(it);
        else lines.push({ y: it.y, items: [it] });
      });
      lines.sort((a, b) => b.y - a.y);

      const startIdx = lines.findIndex((ln) =>
        ln.items.some((it) =>
          it.str.toLowerCase().includes(config.triggerWord.toLowerCase())
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
      allPageData.push({ page: i, rows });
    }

    const tsv = allPageData.flatMap((p) => p.rows).map((r) => r.join("\t")).join("\n");
    return {
      resultBlob: new Blob([tsv], { type: 'text/tab-separated-values' }),
      extractedData: allPageData
    };
  };

  const startQueue = useCallback(async () => {
    if (state.isProcessingQueue) return;
    dispatch({ type: 'SET_PROCESSING_QUEUE', payload: true });

    const config = {
      showManualSettings: state.showManualSettings,
      manualAnchors: state.manualAnchors,
      colLeniency: state.colLeniency,
      rowLeniency: state.rowLeniency,
      triggerWord: state.triggerWord
    };

    try {
      const pendingIds = state.jobs.filter(j => j.status === 'PENDING').map(j => j.id);
      for (const id of pendingIds) {
        const currentJob = jobsRef.current.find(j => j.id === id);
        if (!currentJob || currentJob.status !== 'PENDING') continue;

        dispatch({ type: 'UPDATE_JOB', payload: { id, updates: { status: 'PROCESSING' } } });
        try {
          const result = await processJob(id, config);
          dispatch({ type: 'UPDATE_JOB', payload: { id, updates: { status: 'COMPLETED', ...result, progress: 100 } } });
        } catch (err) {
          if (err.message !== 'CANCELLED') {
            dispatch({ type: 'UPDATE_JOB', payload: { id, updates: { status: 'ERROR', error: err.message } } });
          }
        }
      }
    } finally {
      dispatch({ type: 'SET_PROCESSING_QUEUE', payload: false });
    }
  }, [state.jobs, state.isProcessingQueue, state.showManualSettings, state.manualAnchors, state.colLeniency, state.rowLeniency, state.triggerWord]);

  const downloadZip = useCallback(async () => {
    const zip = new JSZip();
    state.jobs.forEach(job => {
      if (job.status === 'COMPLETED' && job.resultBlob) {
        zip.file(job.file.name.replace(/\.pdf$/i, '') + '.tsv', job.resultBlob);
      }
    });
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'extracted-tables.zip';
    a.click();
    URL.revokeObjectURL(url);
  }, [state.jobs]);

  const downloadJob = useCallback((id) => {
    const job = state.jobs.find(j => j.id === id);
    if (job && job.resultBlob) {
      const url = URL.createObjectURL(job.resultBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = job.file.name.replace(/\.pdf$/i, '') + '.tsv';
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [state.jobs]);

  const handleFileSelect = (files) => {
    dispatch({ type: 'ADD_FILES', payload: Array.from(files) });
  };

  const uiJobs = state.jobs.map(j => ({
    id: j.id,
    name: j.file.name,
    status: j.status,
    progress: j.progress,
    error: j.error
  }));

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
      ${adwGroup("Document", adwCard(html`
        ${adwRow("Source PDF", "Searchable PDF Data Recovery", when(state.extractedData.length, () => html`
          <div class="flex gap-2">
            <button class="btn btn-secondary" @click="${() => dispatch({ type: "RESET" })}">Reset</button>
            <button class="btn btn-primary" @click="${copyTSV}">
              ${state.copyStatus.all ? "✓ Copied" : "Copy TSV"}
            </button>
          </div>
        `))}
        <div class="p-4">
          <drop-zone
            ?disabled="${state.isProcessingQueue}"
            @file-selected="${(e) => handleFileSelect(e.detail)}"
          ></drop-zone>
        </div>
      `))}

      <batch-processor
        .jobs="${uiJobs}"
        .isProcessing="${state.isProcessingQueue}"
        title="Batch Extraction"
        @start-requested="${startQueue}"
        @zip-requested="${downloadZip}"
        @cancel-job="${(e) => dispatch({ type: 'CANCEL_JOB', payload: e.detail })}"
        @download-job="${(e) => downloadJob(e.detail)}"
      ></batch-processor>

      ${adwGroup("Configuration", adwCard(html`
        ${adwRow("Extraction Mode", "Choose between automatic detection or manual markers", adwSegmentedControl([
          { label: "Auto", active: !state.showManualSettings, onClick: () => dispatch({ type: "SET_CONFIG", payload: { key: "showManualSettings", value: false } }) },
          { label: "Man", active: state.showManualSettings, onClick: () => dispatch({ type: "SET_CONFIG", payload: { key: "showManualSettings", value: true } }) }
        ]))}

        ${when(state.showManualSettings, () => html`
          <div class="p-4 border-t border-[var(--adw-card-border)] bg-black/[0.01]">
            <div class="flex gap-2 justify-end mb-2">
              <button class="btn btn-secondary btn-sm" @click="${copyMarkers}" title="Copy Markers">
                ${state.copyStatus.markers ? "✓" : html`<svg style="width:14px;height:14px" viewBox="0 0 24 24"><path fill="currentColor" d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z"/></svg>`}
              </button>
              <button class="btn btn-secondary btn-sm" @click="${pasteMarkers}" title="Paste Markers">
                <svg style="width:14px;height:14px" viewBox="0 0 24 24"><path fill="currentColor" d="M19,20H5V4H7V7H17V4H19M12,2A3,3 0 0,1 15,5V6H9V5A3,3 0 0,1 12,2M19,2H14.82C14.4,0.84 13.3,0 12,0C10.7,0 9.6,0.84 9.18,2H5A2,2 0 0,0 3,4V20A2,2 0 0,0 5,22H19A2,2 0 0,0 21,20V4A2,2 0 0,0 19,2Z"/></svg>
              </button>
              <button class="btn btn-flat btn-sm text-red-600" @click="${() => dispatch({ type: "SET_ANCHORS", payload: { anchors: [] } })}">Clear</button>
            </div>
            <column-adjuster
              ${ref(adjusterRef)}
              .anchors="${state.manualAnchors}"
              .onOpenVisual="${() => dispatch({ type: "TOGGLE_VISUAL_MODAL", payload: { value: true } })}"
              @update="${(e) => dispatch({ type: "SET_ANCHORS", payload: { anchors: e.detail } })}"
            ></column-adjuster>
          </div>
        `)}

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-[var(--adw-card-border)] p-4">
          <div class="space-y-4">
            ${adwRow("Row Trigger", "Table start keyword", html`
              <input
                type="text"
                style="width: 120px;"
                .value="${state.triggerWord}"
                @input="${(e) => dispatch({ type: "SET_CONFIG", payload: { key: "triggerWord", value: e.target.value } })}"
              />
            `)}
            ${adwRow("Row Leniency", undefined, html`
              <div style="display:flex; align-items:center; gap:8px;">
                ${adwBadge(state.rowLeniency)}
                <input
                  type="range" min="1" max="30" style="width: 80px;"
                  .value="${state.rowLeniency}"
                  @input="${(e) => dispatch({ type: "SET_CONFIG", payload: { key: "rowLeniency", value: e.target.value } })}"
                />
              </div>
            `)}
          </div>
          <div class="space-y-4">
            ${adwRow("Col Clustering", undefined, html`
              <div style="display:flex; align-items:center; gap:8px;">
                ${adwBadge(state.colLeniency)}
                <input
                  type="range" min="10" max="150" style="width: 80px;"
                  .value="${state.colLeniency}"
                  @input="${(e) => dispatch({ type: "SET_CONFIG", payload: { key: "colLeniency", value: e.target.value } })}"
                />
              </div>
            `)}
            ${adwRow("Show All Pages", undefined, html`
              <input
                type="checkbox"
                class="nd-switch"
                ?checked="${state.showAllPages}"
                @change="${(e) => dispatch({ type: "SET_CONFIG", payload: { key: "showAllPages", value: e.target.checked } })}"
              />
            `)}
          </div>
        </div>
      `))}

      ${when(state.extractedData.length, () => adwGroup("Data Preview", html`
        <div class="mt-4 space-y-6">
          ${map(
            state.showAllPages ? state.extractedData : state.extractedData.slice(0, 1),
            (page) => html`
              <div class="page-card">
                <div class="page-header">
                  <span>Page ${page.page}</span>
                  <span>${page.rows.length} Rows</span>
                </div>
                <div class="table-container">
                  <table>
                    <tbody>
                      ${map(page.rows, (r, i) => html`
                        <tr>
                          <td class="row-num">${i + 1}</td>
                          ${map(r, (c) => html`<td>${c}</td>`)}
                        </tr>
                      `)}
                    </tbody>
                  </table>
                </div>
              </div>
            `
          )}
        </div>
      `))}

      <!-- Modals -->
      ${when(state.showVisualModal, () => html`
        <visual-alignment-modal
          .pdfFile="${state.lastFile}"
          .anchors="${state.manualAnchors}"
          @update="${(e) => dispatch({ type: "SET_ANCHORS", payload: { anchors: e.detail } })}"
          @close="${() => dispatch({ type: "TOGGLE_VISUAL_MODAL", payload: { value: false } })}"
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
