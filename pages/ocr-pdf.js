// Load haunted and its dependencies from CDN
import { classMap, html, styleMap, when } from "/vendor/lit-html.js";
import {
  component,
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "/vendor/haunted.js";
import "/components/drop-zone.js";
import "/components/status-message.js";
import "/components/batch-processor.js";

// Access libraries from the global window object
// @ts-ignore
const { jsPDF } = globalThis.jspdf;
// @ts-ignore
const JSZip = globalThis.JSZip;

/**
 * @typedef {Object} PageData
 * @property {number} pageNum
 * @property {string} status
 * @property {string} text
 * @property {Array<Object>} words
 * @property {string|null} imgData
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {Object} FileJob
 * @property {string} id - Unique identifier.
 * @property {File} file - The file to process.
 * @property {'PENDING'|'PROCESSING'|'COMPLETED'|'CANCELLED'|'ERROR'} status - Current status.
 * @property {number} progress - 0-100 completion for this file.
 * @property {string} secondaryStatus - e.g. "Page 1/5"
 * @property {Blob|null} resultBlob - The generated searchable PDF blob.
 * @property {string} error - Error message if any.
 * @property {PageData[]} pagesData - Data for each processed page for preview.
 */

/**
 * @typedef {Object} AppState
 * @property {FileJob[]} jobs - Array of file processing jobs.
 * @property {boolean} isProcessingQueue - Whether the queue is currently active.
 * @property {number} workerCount - Number of Tesseract workers.
 * @property {string} pageSelection - 'all' or 'select'.
 * @property {string} pageRangeInput - e.g. "1, 3-5".
 * @property {boolean} pageRangeError - Flag for invalid range.
 * @property {string|null} activeJobId - ID of the job to show in preview.
 */

const initialState = {
  jobs: [],
  isProcessingQueue: false,
  workerCount: 4,
  pageSelection: "all",
  pageRangeInput: "",
  pageRangeError: false,
  activeJobId: null,
};

function parsePageRange(rangeStr, maxPage) {
  const pages = new Set();
  const parts = rangeStr.split(",").map((s) => s.trim()).filter(
    (s) => s.length > 0,
  );

  for (const part of parts) {
    if (part.includes("-")) {
      const [startStr, endStr] = part.split("-").map((s) => s.trim());
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);

      if (
        isNaN(start) || isNaN(end) || start < 1 ||
        end > maxPage || start > end
      ) {
        return null;
      }

      for (let i = start; i <= end; i++) {
        pages.add(i);
      }
    } else {
      const pageNum = parseInt(part, 10);
      if (isNaN(pageNum) || pageNum < 1 || pageNum > maxPage) {
        return null;
      }
      pages.add(pageNum);
    }
  }
  return Array.from(pages).sort((a, b) => a - b);
}

function appReducer(state, action) {
  switch (action.type) {
    case "SET_CONFIG":
      return { ...state, [action.payload.key]: action.payload.value };
    case "ADD_FILES": {
      const newJobs = action.payload.map((file) => ({
        id: crypto.randomUUID(),
        file,
        status: "PENDING",
        progress: 0,
        secondaryStatus: "",
        resultBlob: null,
        error: "",
        pagesData: [],
      }));
      return { ...state, jobs: [...state.jobs, ...newJobs] };
    }
    case "UPDATE_JOB": {
      const { id, updates } = action.payload;
      const newState = {
        ...state,
        jobs: state.jobs.map((job) =>
          job.id === id ? { ...job, ...updates } : job
        ),
      };
      if (updates.status === "PROCESSING" || updates.status === "COMPLETED") {
        newState.activeJobId = id;
      }
      return newState;
    }
    case "SET_PROCESSING_QUEUE":
      return { ...state, isProcessingQueue: action.payload };
    case "CANCEL_JOB":
      return {
        ...state,
        jobs: state.jobs.map((job) =>
          job.id === action.payload ? { ...job, status: "CANCELLED" } : job
        ),
      };
    case "SET_ACTIVE_JOB":
      return { ...state, activeJobId: action.payload };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

// --- OCR UTILITY ---

async function processFile(
  jobId,
  jobsRef,
  scheduler,
  renderCanvas,
  config,
  updateJobState,
) {
  const job = jobsRef.current.find((j) => j.id === jobId);
  if (!job) return;
  const { file } = job;

  const arrayBuffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument(arrayBuffer).promise;
  const numPages = doc.numPages;
  const canvas = renderCanvas;

  let selectedPages = [];
  if (config.pageSelection === "all") {
    for (let i = 1; i <= numPages; i++) selectedPages.push(i);
  } else {
    selectedPages = parsePageRange(config.pageRangeInput, numPages);
    if (!selectedPages || selectedPages.length === 0) {
      for (let i = 1; i <= numPages; i++) selectedPages.push(i);
    }
  }

  const results = [];
  const pagesData = [];

  for (let i = 0; i < selectedPages.length; i++) {
    const pageNum = selectedPages[i];

    const currentJob = jobsRef.current.find((j) => j.id === jobId);
    if (!currentJob || currentJob.status === "CANCELLED") {
      throw new Error("CANCELLED");
    }

    const progress = Math.round((i / selectedPages.length) * 100);
    updateJobState({
      progress,
      secondaryStatus: `Page ${i + 1}/${selectedPages.length}`,
      pagesData: [...pagesData],
    });

    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;

    const imgData = canvas.toDataURL("image/jpeg", 0.8);
    const result = await scheduler.addJob("recognize", imgData);

    const pageResult = {
      pageNum,
      text: result.data.text,
      words: result.data.words,
      imgData,
      width: viewport.width,
      height: viewport.height,
      status: "Completed",
    };

    results.push(pageResult);
    pagesData.push(pageResult);

    updateJobState({
      progress: Math.round(((i + 1) / selectedPages.length) * 100),
      secondaryStatus: `Page ${i + 1}/${selectedPages.length}`,
      pagesData: [...pagesData],
    });
  }

  const firstPage = results[0];
  const pdf = new jsPDF({
    orientation: firstPage.width > firstPage.height ? "landscape" : "portrait",
    unit: "px",
    format: [firstPage.width, firstPage.height],
  });

  results.forEach((pageData, index) => {
    const { width, height, words, imgData } = pageData;
    if (index > 0) {
      pdf.addPage([width, height], width > height ? "landscape" : "portrait");
    }
    pdf.addImage(imgData, "JPEG", 0, 0, width, height);
    pdf.internal.write("3 Tr");
    pdf.setTextColor(255, 255, 255);
    words.forEach((word) => {
      const { text, bbox } = word;
      const h = bbox.y1 - bbox.y0;
      pdf.setFontSize(h * 0.9);
      pdf.text(text, bbox.x0, bbox.y1, { baseline: "bottom" });
    });
  });

  return {
    resultBlob: pdf.output("blob"),
    pagesData,
  };
}

function useAppState() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const contextRef = useRef({
    scheduler: null,
    renderCanvas: document.createElement("canvas"),
  });
  const jobsRef = useRef(state.jobs);

  useEffect(() => {
    jobsRef.current = state.jobs;
  }, [state.jobs]);

  const startQueue = useCallback(async () => {
    if (state.isProcessingQueue) return;
    dispatch({ type: "SET_PROCESSING_QUEUE", payload: true });

    const config = {
      pageSelection: state.pageSelection,
      pageRangeInput: state.pageRangeInput,
      workerCount: state.workerCount,
    };

    try {
      if (
        !contextRef.current.scheduler ||
        state.workerCount !== contextRef.current.currentWorkerCount
      ) {
        if (contextRef.current.scheduler) {
          await contextRef.current.scheduler.terminate();
        }
        contextRef.current.scheduler = Tesseract.createScheduler();
        for (let i = 0; i < state.workerCount; i++) {
          const worker = await Tesseract.createWorker("eng");
          contextRef.current.scheduler.addWorker(worker);
        }
        contextRef.current.currentWorkerCount = state.workerCount;
      }

      const jobIds = state.jobs.filter((j) => j.status === "PENDING").map((j) =>
        j.id
      );

      for (const id of jobIds) {
        const currentJob = jobsRef.current.find((j) => j.id === id);
        if (!currentJob || currentJob.status !== "PENDING") continue;

        dispatch({
          type: "UPDATE_JOB",
          payload: { id, updates: { status: "PROCESSING" } },
        });

        try {
          const result = await processFile(
            id,
            jobsRef,
            contextRef.current.scheduler,
            contextRef.current.renderCanvas,
            config,
            (updates) =>
              dispatch({ type: "UPDATE_JOB", payload: { id, updates } }),
          );

          dispatch({
            type: "UPDATE_JOB",
            payload: {
              id,
              updates: { status: "COMPLETED", ...result, progress: 100 },
            },
          });
        } catch (err) {
          if (err.message !== "CANCELLED") {
            console.error(err);
            dispatch({
              type: "UPDATE_JOB",
              payload: { id, updates: { status: "ERROR", error: err.message } },
            });
          }
        }
      }
    } finally {
      dispatch({ type: "SET_PROCESSING_QUEUE", payload: false });
    }
  }, [
    state.jobs,
    state.isProcessingQueue,
    state.workerCount,
    state.pageSelection,
    state.pageRangeInput,
  ]);

  const downloadZip = useCallback(async () => {
    const zip = new JSZip();
    state.jobs.forEach((job) => {
      if (job.status === "COMPLETED" && job.resultBlob) {
        const name = job.file.name.replace(/\.pdf$/i, "") + "-ocr.pdf";
        zip.file(name, job.resultBlob);
      }
    });
    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ocr-results.zip";
    a.click();
    URL.revokeObjectURL(url);
  }, [state.jobs]);

  const downloadJob = useCallback((id) => {
    const job = state.jobs.find((j) => j.id === id);
    if (job && job.resultBlob) {
      const url = URL.createObjectURL(job.resultBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = job.file.name.replace(/\.pdf$/i, "") + "-ocr.pdf";
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [state.jobs]);

  return {
    state,
    dispatch,
    startQueue,
    downloadZip,
    downloadJob,
  };
}

function App() {
  const { state, dispatch, startQueue, downloadZip, downloadJob } =
    useAppState();
  const [showResults, setShowResults] = useState(true);

  const handleFileSelect = (files) => {
    const pdfs = Array.from(files).filter((f) => f.type === "application/pdf");
    if (pdfs.length > 0) {
      dispatch({ type: "ADD_FILES", payload: pdfs });
    }
  };

  const uiJobs = state.jobs.map((j) => ({
    id: j.id,
    name: j.file.name,
    status: j.status,
    progress: j.progress,
    secondaryStatus: j.secondaryStatus,
    error: j.error,
  }));

  const activeJob = state.jobs.find((j) => j.id === state.activeJobId);

  return html`
    <app-layout title="PDF OCR & Text Overlay">
      <!-- Sidebar Options (Fixed width on desktop, full on mobile) -->
      <aside
        class="w-full lg:w-80 bg-slate-50 border-r border-slate-200 flex flex-col shrink-0 overflow-y-auto"
        slot="utility"
      >
        <div class="p-6 space-y-8">
          <section>
            <h2
              class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 px-1"
            >
              Processing Options
            </h2>
            <div
              class="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden shadow-sm"
            >
              <!-- Item 1: Page Range -->
              <div class="p-4 space-y-3 hover:bg-slate-50/50 transition-colors">
                <div class="flex items-center justify-between">
                  <label class="text-sm font-bold text-slate-700"
                  >Page Selection</label>
                  <span
                    class="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full uppercase"
                  >${state.pageSelection}</span>
                </div>
                <div class="flex flex-col gap-2">
                  <label
                    class="flex items-center gap-3 p-2 rounded-lg hover:bg-white cursor-pointer transition-all border border-transparent hover:border-slate-100"
                  >
                    <input
                      type="radio"
                      name="pageSelection"
                      class="w-4 h-4 text-blue-600"
                      .checked="${state.pageSelection === "all"}"
                      @change="${() =>
                        dispatch({
                          type: "SET_CONFIG",
                          payload: { key: "pageSelection", value: "all" },
                        })}"
                      ?disabled="${state.isProcessingQueue}"
                    >
                    <span class="text-sm text-slate-600 font-medium"
                    >All Pages</span>
                  </label>
                  <label
                    class="flex items-center gap-3 p-2 rounded-lg hover:bg-white cursor-pointer transition-all border border-transparent hover:border-slate-100"
                  >
                    <input
                      type="radio"
                      name="pageSelection"
                      class="w-4 h-4 text-blue-600"
                      .checked="${state.pageSelection === "select"}"
                      @change="${() =>
                        dispatch({
                          type: "SET_CONFIG",
                          payload: { key: "pageSelection", value: "select" },
                        })}"
                      ?disabled="${state.isProcessingQueue}"
                    >
                    <span class="text-sm text-slate-600 font-medium"
                    >Custom Range</span>
                  </label>
                </div>
                <input
                  type="text"
                  class="w-full rounded-lg border-slate-200 bg-slate-50 text-sm p-2.5 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none font-medium placeholder:font-normal"
                  placeholder="e.g. 1, 3-5, 8"
                  .value="${state.pageRangeInput}"
                  ?disabled="${state.pageSelection === "all" ||
                    state.isProcessingQueue}"
                  @input="${(e) =>
                    dispatch({
                      type: "SET_CONFIG",
                      payload: {
                        key: "pageRangeInput",
                        value: e.target.value,
                      },
                    })}"
                >
              </div>

              <!-- Item 2: Worker Count -->
              <div class="p-4 space-y-3 hover:bg-slate-50/50 transition-colors">
                <div class="flex items-center justify-between">
                  <label class="text-sm font-bold text-slate-700"
                  >CPU Workers</label>
                  <input
                    type="number"
                    min="1"
                    max="8"
                    class="w-16 rounded-lg border-slate-200 bg-slate-50 text-sm p-1.5 text-center font-bold focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none"
                    .value="${state.workerCount}"
                    ?disabled="${state.isProcessingQueue}"
                    @change="${(e) =>
                      dispatch({
                        type: "SET_CONFIG",
                        payload: {
                          key: "workerCount",
                          value: parseInt(e.target.value, 10),
                        },
                      })}"
                  >
                </div>
                <p
                  class="text-[10px] text-slate-400 font-medium leading-relaxed px-1"
                >
                  Parallel threads for faster OCR. Recommended: 4.
                </p>
              </div>

              <!-- Item 3: Preview -->
              <div class="p-4 hover:bg-slate-50/50 transition-colors">
                <label
                  class="flex items-center justify-between cursor-pointer group"
                >
                  <span class="text-sm font-bold text-slate-700"
                  >Visual Preview</span>
                  <input
                    type="checkbox"
                    class="nd-switch"
                    .checked="${showResults}"
                    @change="${(e) => setShowResults(e.target.checked)}"
                  >
                </label>
              </div>
            </div>
          </section>
        </div>
      </aside>

      <!-- Main Content Area -->
      <main class="flex-1 bg-white overflow-y-auto">
        <div class="max-w-4xl mx-auto p-6 lg:p-12 space-y-12">
          <div class="space-y-4">
            <h2 class="text-2xl font-black text-slate-900 tracking-tight">
              Convert to Searchable PDF
            </h2>
            <p class="text-slate-500 font-medium">
              Upload one or multiple files to start the batch OCR process.
            </p>
          </div>

          <drop-zone
            subtitle="Upload PDFs for conversion"
            accepted="application/pdf"
            @file-selected="${(e) => handleFileSelect(e.detail)}"
          ></drop-zone>

          <batch-processor
            title="Current Batch"
            .jobs="${uiJobs}"
            .isProcessing="${state.isProcessingQueue}"
            @start-requested="${startQueue}"
            @zip-requested="${downloadZip}"
            @cancel-job="${(e) =>
              dispatch({ type: "CANCEL_JOB", payload: e.detail })}"
            @download-job="${(e) => downloadJob(e.detail)}"
          ></batch-processor>

          <!-- Results Preview Area -->
          ${when(
            showResults && activeJob && activeJob.pagesData.length > 0,
            () =>
              html`
                <div class="pt-12 space-y-8 border-t border-slate-100">
                  <div class="flex items-center justify-between">
                    <h2
                      class="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2"
                    >
                      <span class="w-2 h-8 bg-blue-600 rounded-full"></span>
                      Preview: ${activeJob.file.name}
                    </h2>
                  </div>

                  <div class="space-y-10">
                    ${activeJob.pagesData.map((page) =>
                      html`
                        <div
                          class="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden"
                        >
                          <div
                            class="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center"
                          >
                            <div class="flex items-center gap-3">
                              <span
                                class="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-[10px] font-black text-slate-400"
                              >P${page.pageNum}</span>
                              <span class="text-sm font-bold text-slate-600 uppercase tracking-widest"
                              >Page Data</span>
                            </div>
                            <button
                              class="btn btn-secondary !py-1.5 !px-4 !text-xs !rounded-full !font-bold"
                              @click="${(e) => {
                                navigator.clipboard.writeText(page.text);
                                const btn = e.target;
                                const old = btn.textContent;
                                btn.textContent = "Copied!";
                                setTimeout(() => btn.textContent = old, 2000);
                              }}"
                            >
                              Copy Text
                            </button>
                          </div>
                          <div
                            class="grid grid-cols-1 md:grid-cols-2 divide-x divide-slate-100 h-[450px]"
                          >
                            <div
                              class="p-8 flex items-center justify-center bg-slate-50/30 overflow-hidden"
                            >
                              <img
                                src="${page.imgData}"
                                class="max-w-full max-h-full object-contain shadow-2xl rounded-sm"
                              >
                            </div>
                            <div class="p-8 bg-white">
                              <textarea
                                class="w-full h-full p-6 text-xs font-mono leading-relaxed border-none rounded-2xl resize-none outline-none bg-slate-50/50 text-slate-700 shadow-inner"
                                readonly
                                .value="${page.text}"
                              ></textarea>
                            </div>
                          </div>
                        </div>
                      `
                    )}
                  </div>
                </div>
              `,
          )}
        </div>
      </main>
    </app-layout>
  `;
}

customElements.define("ocr-app", component(App, { useShadowDOM: false }));
