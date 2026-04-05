// Load haunted and its dependencies from CDN
import { classMap, html, styleMap, when } from "/vendor/lit-html.js";
import {
  component,
  useCallback,
  useReducer,
  useRef,
  useState,
  useEffect,
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
  workerCount: 2,
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
        resultBlob: null,
        error: "",
        pagesData: []
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
      if (updates.status === 'PROCESSING' || updates.status === 'COMPLETED') {
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

async function processFile(jobId, jobsRef, scheduler, renderCanvas, config, updateJobState) {
  const job = jobsRef.current.find(j => j.id === jobId);
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
      // Fallback to all if invalid for this specific file in batch
      for (let i = 1; i <= numPages; i++) selectedPages.push(i);
    }
  }

  const results = [];
  const pagesData = [];

  for (let i = 0; i < selectedPages.length; i++) {
    const pageNum = selectedPages[i];
    
    // Check latest status
    const currentJob = jobsRef.current.find(j => j.id === jobId);
    if (!currentJob || currentJob.status === "CANCELLED") throw new Error("CANCELLED");

    const progress = Math.round((i / selectedPages.length) * 100);
    updateJobState({ progress, pagesData: [...pagesData] });

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
      status: "Completed"
    };
    
    results.push(pageResult);
    pagesData.push(pageResult);
    
    updateJobState({ 
      progress: Math.round(((i + 1) / selectedPages.length) * 100), 
      pagesData: [...pagesData] 
    });
  }

  // Create PDF
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
    pdf.internal.write("3 Tr"); // Invisible text
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
    pagesData
  };
}

function useAppState() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const contextRef = useRef({ scheduler: null, renderCanvas: document.createElement("canvas") });
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
      workerCount: state.workerCount
    };

    try {
      if (!contextRef.current.scheduler || state.workerCount !== contextRef.current.currentWorkerCount) {
        if (contextRef.current.scheduler) await contextRef.current.scheduler.terminate();
        contextRef.current.scheduler = Tesseract.createScheduler();
        for (let i = 0; i < state.workerCount; i++) {
          const worker = await Tesseract.createWorker("eng");
          contextRef.current.scheduler.addWorker(worker);
        }
        contextRef.current.currentWorkerCount = state.workerCount;
      }

      const jobIds = state.jobs.filter(j => j.status === 'PENDING').map(j => j.id);

      for (const id of jobIds) {
        const currentJob = jobsRef.current.find(j => j.id === id);
        if (!currentJob || currentJob.status !== "PENDING") continue;

        dispatch({ type: "UPDATE_JOB", payload: { id, updates: { status: "PROCESSING" } } });

        try {
          const result = await processFile(
            id,
            jobsRef,
            contextRef.current.scheduler,
            contextRef.current.renderCanvas,
            config,
            (updates) => dispatch({ type: "UPDATE_JOB", payload: { id, updates } })
          );

          dispatch({
            type: "UPDATE_JOB",
            payload: { id, updates: { status: "COMPLETED", ...result, progress: 100 } },
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
  }, [state.jobs, state.isProcessingQueue, state.workerCount, state.pageSelection, state.pageRangeInput]);

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
    const job = state.jobs.find(j => j.id === id);
    if (job && job.resultBlob) {
      const url = URL.createObjectURL(job.resultBlob);
      const a = document.createElement('a');
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
  const { state, dispatch, startQueue, downloadZip, downloadJob } = useAppState();
  const [showResults, setShowResults] = useState(true);

  const handleFileSelect = (files) => {
    const pdfs = Array.from(files).filter(f => f.type === 'application/pdf');
    if (pdfs.length > 0) {
      dispatch({ type: 'ADD_FILES', payload: pdfs });
    }
  };

  const uiJobs = state.jobs.map(j => ({
    id: j.id,
    name: j.file.name,
    status: j.status,
    progress: j.progress,
    error: j.error
  }));

  const activeJob = state.jobs.find(j => j.id === state.activeJobId);

  return html`
    <header class="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div class="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h1 class="text-xl font-bold text-slate-900">Batch PDF OCR</h1>
        </div>
      </div>
    </header>

    <main class="max-w-5xl mx-auto px-4 py-8">
      <drop-zone
        subtitle="Select or Drop PDF files for Batch OCR"
        accepted="application/pdf"
        @file-selected="${(e) => handleFileSelect(e.detail)}"
      ></drop-zone>

      <!-- Options Panel -->
      <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-200 my-8">
        <h2 class="text-lg font-semibold text-slate-700 mb-4">Processing Options</h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <!-- 1. Page Selection -->
          <div class="block">
            <label class="block text-sm font-medium text-slate-700 mb-2">Pages to OCR</label>
            <div class="flex items-center gap-4">
              <label class="flex items-center text-sm text-slate-900">
                <input type="radio" name="pageSelection" class="h-4 w-4 text-blue-600 mr-2"
                  .checked="${state.pageSelection === 'all'}"
                  @change="${() => dispatch({ type: 'SET_CONFIG', payload: { key: 'pageSelection', value: 'all' } })}"
                  ?disabled="${state.isProcessingQueue}">
                All Pages
              </label>
              <label class="flex items-center text-sm text-slate-900">
                <input type="radio" name="pageSelection" class="h-4 w-4 text-blue-600 mr-2"
                  .checked="${state.pageSelection === 'select'}"
                  @change="${() => dispatch({ type: 'SET_CONFIG', payload: { key: 'pageSelection', value: 'select' } })}"
                  ?disabled="${state.isProcessingQueue}">
                Range
              </label>
            </div>
            <input type="text" class="mt-2 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm p-2"
              placeholder="e.g., 1, 3-5, 8"
              .value="${state.pageRangeInput}"
              ?disabled="${state.pageSelection === 'all' || state.isProcessingQueue}"
              @input="${(e) => dispatch({ type: 'SET_CONFIG', payload: { key: 'pageRangeInput', value: e.target.value } })}">
          </div>

          <!-- 2. Worker Count -->
          <div class="pl-6 border-l border-slate-100">
            <label class="block text-sm font-medium text-slate-700 mb-2">OCR Workers (Threads)</label>
            <input type="number" min="1" max="8" class="block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm p-2"
              .value="${state.workerCount}"
              ?disabled="${state.isProcessingQueue}"
              @change="${(e) => dispatch({ type: 'SET_CONFIG', payload: { key: 'workerCount', value: parseInt(e.target.value, 10) } })}">
            <p class="text-xs text-slate-400 mt-1">Recommended: 2-4 workers.</p>
          </div>

          <!-- 3. Show Results Toggle -->
          <div class="pl-6 border-l border-slate-100 flex flex-col justify-center">
            <label class="flex items-center cursor-pointer">
              <input type="checkbox" class="nd-switch mr-2"
                .checked="${showResults}"
                @change="${(e) => setShowResults(e.target.checked)}">
              <span class="text-sm font-medium text-slate-700">Show Results Preview</span>
            </label>
            <p class="text-xs text-slate-400 mt-1">Hide to save memory on large batches.</p>
          </div>
        </div>
      </div>

      <batch-processor
        .jobs="${uiJobs}"
        .isProcessing="${state.isProcessingQueue}"
        @start-requested="${startQueue}"
        @zip-requested="${downloadZip}"
        @cancel-job="${(e) => dispatch({ type: 'CANCEL_JOB', payload: e.detail })}"
        @download-job="${(e) => downloadJob(e.detail)}"
      ></batch-processor>

      <!-- Results Preview Area -->
      ${when(showResults && activeJob && activeJob.pagesData.length > 0, () => html`
        <div class="mt-12 space-y-8">
          <h2 class="text-xl font-bold text-slate-800 border-b pb-2">Preview: ${activeJob.file.name}</h2>
          ${activeJob.pagesData.map(page => html`
            <div class="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
              <div class="bg-slate-50 px-4 py-2 border-b flex justify-between items-center">
                <span class="font-semibold text-slate-700">Page ${page.pageNum}</span>
                <button class="text-xs text-blue-600 font-medium" 
                  @click="${() => {
                    navigator.clipboard.writeText(page.text);
                    const btn = event.target;
                    const old = btn.textContent;
                    btn.textContent = "Copied!";
                    setTimeout(() => btn.textContent = old, 2000);
                  }}">Copy Text</button>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 divide-x divide-slate-100">
                <div class="p-4 flex items-center justify-center bg-slate-50/50">
                  <img src="${page.imgData}" class="max-w-full h-auto shadow-sm">
                </div>
                <div class="p-4 flex flex-col h-[400px]">
                  <textarea class="flex-1 w-full p-3 text-xs font-mono border rounded-lg resize-none outline-none bg-white" readonly>${page.text}</textarea>
                </div>
              </div>
            </div>
          `)}
        </div>
      `)}
    </main>
  `;
}

customElements.define("ocr-app", component(App, { useShadowDOM: false }));
