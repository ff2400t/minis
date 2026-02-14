// Load haunted and its dependencies from CDN
import { classMap, html, styleMap, when } from "/vendor/lit-html.js";
import {
  component,
  useCallback,
  useReducer,
  useRef,
  useState,
} from "/vendor/haunted.js";
import "/components/drop-zone.js";
import "/components/status-message.js";
// Access jsPDF from the global window object
// @ts-ignore
const { jsPDF } = globalThis.jspdf;

// --- GLOBAL UTILITIES ---

/**
 * @typedef {Object} PageData
 * @property {number} pageNum - The 1-based page number.
 * @property {string} status - Current status message for the page.
 * @property {string} text - Extracted text content.
 * @property {Array<Object>} words - Array of word objects with bbox and text.
 * @property {string|null} imgData - Data URL of the page image.
 * @property {number} width - Page width in pixels.
 * @property {number} height - Page height in pixels.
 */

/**
 * @typedef {Object} ProcessProgress
 * @property {number} percent - Completion percentage (0-100).
 * @property {string} text - Current progress description.
 */

/**
 * Parses a string like "1, 3-5, 8" into a sorted array of unique page numbers.
 * @param {string} rangeStr - The input string (e.g., "1, 3-5").
 * @param {number} maxPage - The maximum valid page number.
 * @returns {number[]|null} Sorted array of unique page numbers, or null if invalid.
 */

/**
 * @typedef {import('vendor/lit-html.d.ts').TemplateResult} TemplateResult The rendered header.
 */

/**
 * Parses a string like "1, 3-5, 8" into a sorted array of unique page numbers.
 * @param {string} rangeStr - The input string (e.g., "1, 3-5").
 * @param {number} maxPage - The maximum valid page number.
 * @returns {number[]|null} Sorted array of unique page numbers, or null if invalid.
 */
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
        return null; // Invalid range or bounds
      }

      for (let i = start; i <= end; i++) {
        pages.add(i);
      }
    } else {
      const pageNum = parseInt(part, 10);
      if (isNaN(pageNum) || pageNum < 1 || pageNum > maxPage) {
        return null; // Invalid single page number
      }
      pages.add(pageNum);
    }
  }
  return Array.from(pages).sort((a, b) => a - b);
}

// --- REDUCER & STATE MANAGEMENT ---

/**
 * @typedef {Object} AppState
 * @property {'IDLE'|'LOADED'|'PROCESSING'|'COMPLETED'} appMode - Current application state.
 * @property {PageData[]} processedPagesData - Array of data for processed pages.
 * @property {ProcessProgress} progress - Current progress status.
 * @property {'NONE'|'PDF'|'IMAGES'} inputType - Type of input source.
 * @property {number} maxPage - Total number of pages available.
 * @property {boolean} pageRangeError - Flag indicating invalid page range input.
 */

/**
 * @typedef {Object} Action
 * @property {string} type - Action type identifier.
 * @property {any} [payload] - Optional data payload for the action.
 */

/** @type {AppState} */
const initialState = {
  appMode: "IDLE", // 'IDLE', 'LOADED', 'PROCESSING', 'COMPLETED'
  processedPagesData: [],
  progress: {
    percent: 0,
    text: "Ready to upload file.",
  },
  inputType: "NONE", // 'NONE', 'PDF', 'IMAGES'
  maxPage: 0,
  pageRangeError: false,
};

/**
 * Reducer function for managing application state.
 * @param {AppState} state - Current state.
 * @param {Action} action - Dispatched action.
 * @returns {AppState} New state.
 */
function appReducer(state, action) {
  switch (action.type) {
    case "RESET":
      return { ...initialState, appMode: "PROCESSING" }; // Temporarily processing during reset/load
    case "SET_IDLE":
      return { ...state, appMode: "IDLE" };
    case "LOAD_START":
      return {
        ...state,
        appMode: "PROCESSING", // Show loading state
        inputType: action.payload.inputType,
        progress: { percent: 0, text: action.payload.text },
        processedPagesData: [],
        pageRangeError: false,
        maxPage: 0,
      };
    case "LOAD_SUCCESS":
      return {
        ...state,
        appMode: "LOADED",
        maxPage: action.payload.maxPage,
        processedPagesData: action.payload.initialData || [],
        progress: { percent: 0, text: action.payload.text },
      };
    case "LOAD_ERROR":
      return {
        ...state,
        appMode: "IDLE",
        progress: { percent: 0, text: action.payload.error },
      };
    case "START_PROCESSING":
      return {
        ...state,
        appMode: "PROCESSING",
        processedPagesData: action.payload.initialData,
        pageRangeError: false,
        progress: { percent: 0, text: "Preparing processing job..." },
      };
    case "UPDATE_PAGE_STATUS": {
      // payload: { pageNum, updates: { status, text, words, imgData, width, height } }
      const { pageNum, updates } = action.payload;
      const newData = state.processedPagesData.map((p) =>
        p.pageNum === pageNum ? { ...p, ...updates } : p
      );
      return { ...state, processedPagesData: newData };
    }
    case "UPDATE_PROGRESS":
      return {
        ...state,
        progress: {
          percent: action.payload.percent,
          text: action.payload.text,
        },
      };
    case "PROCESSING_COMPLETE":
      return {
        ...state,
        appMode: "COMPLETED",
        progress: { percent: 100, text: action.payload.text },
      };
    case "PROCESSING_ERROR":
      return {
        ...state,
        appMode: "LOADED",
        pageRangeError: action.payload.isRangeError || false,
        progress: { percent: 0, text: action.payload.error },
      };
    case "SET_PAGE_RANGE_ERROR":
      return { ...state, pageRangeError: action.payload };
    default:
      return state;
  }
}

// --- HOOK: useAppState for centralized logic ---

/**
 * Custom hook for managing the OCR application state and logic.
 * @returns {Object} The application state and handler functions.
 */
function useAppState() {
  // 1. Complex State (Reducer)
  const [state, dispatch] = useReducer(appReducer, initialState);

  // 2. Mutable Context (Ref) - Things that don't need to trigger re-renders directly
  /**
   * @typedef {Object} ProcessingContext
   * @property {Object|null} pdfDoc - The loaded PDF.js document.
   * @property {string[]} sourceImages - Array of image data URLs.
   * @property {Object|null} scheduler - Tesseract scheduler instance.
   * @property {number} currentWorkerCount - Number of active workers.
   * @property {number} processedJobCount - Counter for completed jobs.
   */
  /** @type {import('vendor/haunted.d.ts').Ref<ProcessingContext>} */
  const contextRef = useRef({
    pdfDoc: null,
    sourceImages: [],
    scheduler: null,
    currentWorkerCount: 0,
    processedJobCount: 0,
  });

  // 3. Independent UI State (useState)
  // Kept separate as they are simple UI toggles/inputs often modified independently
  const [workerCount, setWorkerCount] = useState(4);
  const [showResults, setShowResults] = useState(true);
  const [pageRangeInput, setPageRangeInput] = useState("");
  const [pageSelection, setPageSelection] = useState("all");

  const {
    appMode,
    processedPagesData,
    progress,
    inputType,
    maxPage,
    pageRangeError,
  } = state;

  // Single shared canvas for rendering PDF pages to avoid memory leaks
  const renderCanvasRef = useRef(
    document.createElement("canvas"),
  );

  const isProcessing = appMode === "PROCESSING";

  // --- Handlers ---

  /**
   * Handles file selection from the drop zone.
   * @param {FileList} fileList - The list of selected files.
   */
  const handleFileSelect = useCallback(
    async (/** @type {Array<File>} */ fileList) => {
      console.log(fileList);
      if (!fileList || fileList.length === 0 || isProcessing) {
        return;
      }

      const files = Array.from(fileList);
      const firstFile = files[0];

      // --- PDF HANDLING (Single File) ---
      if (firstFile.type === "application/pdf") {
        if (files.length > 1) {
          alert("For PDFs, please select only one file at a time.");
          return;
        }

        dispatch({
          type: "LOAD_START",
          payload: { inputType: "PDF", text: "Loading PDF file..." },
        });

        // Reset Context
        contextRef.current.sourceImages = [];
        contextRef.current.pdfDoc = null;

        try {
          const arrayBuffer = await firstFile.arrayBuffer();
          const doc = await pdfjsLib.getDocument(arrayBuffer).promise;
          const numPages = doc.numPages;

          contextRef.current.pdfDoc = doc;

          dispatch({
            type: "LOAD_SUCCESS",
            payload: {
              maxPage: numPages,
              text: `PDF loaded. ${numPages} page(s) available.`,
              initialData: [],
            },
          });
        } catch (err) {
          if (err instanceof Error) {
            console.error("Error loading PDF:", err);
            dispatch({
              type: "LOAD_ERROR",
              payload: { error: `Error loading file: ${err.message}` },
            });
          }
        }
      } // --- IMAGE HANDLING (Multiple Files) ---
      else if (firstFile.type.startsWith("image/")) {
        dispatch({
          type: "LOAD_START",
          payload: {
            inputType: "IMAGES",
            text: `Loading ${files.length} image(s)...`,
          },
        });

        // Reset Context
        contextRef.current.sourceImages = [];
        contextRef.current.pdfDoc = null;

        try {
          // Filter for images only
          const imageFiles = files.filter((f) => f.type.startsWith("image/"));
          if (imageFiles.length === 0) {
            throw new Error("No valid images selected.");
          }

          // Sort by name
          imageFiles.sort((a, b) =>
            a.name.localeCompare(b.name, undefined, {
              numeric: true,
              sensitivity: "base",
            })
          );

          const imagePromises = imageFiles.map((file) => {
            return new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () =>
                resolve({
                  name: file.name,
                  data: reader.result,
                });
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
          });

          const loadedImages = await Promise.all(imagePromises);
          const imageDataArray = loadedImages.map((img) => img.data);

          contextRef.current.sourceImages = imageDataArray;

          // Pre-populate processedPagesData
          const initialData = imageDataArray.map((
            imgData,
            index,
          ) => ({
            pageNum: index + 1,
            imgData: imgData, // We can keep imgData in state for initial preview
            status: "Image loaded. Ready for OCR.",
            text: "",
            width: 0,
            height: 0,
          }));

          dispatch({
            type: "LOAD_SUCCESS",
            payload: {
              maxPage: imageDataArray.length,
              text:
                `${imageDataArray.length} image(s) loaded. Ready to join and process.`,
              initialData: initialData,
            },
          });
        } catch (err) {
          console.error("Error loading images:", err);
          dispatch({
            type: "LOAD_ERROR",
            // @ts-ignore
            payload: { error: `Error loading images: ${err.message}` },
          });
        }
      } else {
        dispatch({
          type: "LOAD_ERROR",
          payload: {
            error: "Unsupported file type. Please upload PDF or Images.",
          },
        });
      }
    },
    [isProcessing],
  );

  /**
   * Starts the OCR processing job.
   */
  const startProcessing = useCallback(async () => {
    if (appMode !== "LOADED") return;

    try {
      // 1. Determine Pages/Images to Process
      /**
       * @type {number[]}
       */
      let selectedPages = [];

      if (inputType === "IMAGES") {
        if (pageSelection === "all") {
          for (let i = 1; i <= maxPage; i++) {
            selectedPages.push(i);
          }
        } else {
          const parsedPages = parsePageRange(pageRangeInput, maxPage);
          if (!parsedPages || parsedPages.length === 0) {
            throw new Error("Invalid selection.");
          }
          selectedPages = parsedPages;
        }
      } else if (inputType === "PDF") {
        if (pageSelection === "all") {
          for (let i = 1; i <= maxPage; i++) {
            selectedPages.push(i);
          }
        } else {
          const parsedPages = parsePageRange(pageRangeInput, maxPage);
          if (!parsedPages || parsedPages.length === 0) {
            throw new Error("Invalid selection.");
          }
          selectedPages = parsedPages;
        }
      }

      const totalJobs = selectedPages.length;
      contextRef.current.processedJobCount = 0;

      // 2. Initialize Status
      // Re-initialize based on selected pages
      const initialData = selectedPages.map((pageNum) => {
        // If images, try to preserve existing data if present in state (though often we want fresh status)
        // For simplicity, we restart status for selected pages.
        let imgData = null;
        if (inputType === "IMAGES") {
          // sourceImages is 0-indexed
          imgData = contextRef.current.sourceImages[pageNum - 1];
        }

        return {
          pageNum,
          status: "Pending...",
          text: "",
          words: [],
          imgData: imgData,
          width: 0,
          height: 0,
        };
      });

      dispatch({ type: "START_PROCESSING", payload: { initialData } });

      // 3. Scheduler Setup
      let schedulerInstance = contextRef.current.scheduler;
      const requestedWorkerCount = workerCount;

      if (
        !schedulerInstance ||
        contextRef.current.currentWorkerCount !== requestedWorkerCount
      ) {
        if (schedulerInstance) {
          dispatch({
            type: "UPDATE_PROGRESS",
            payload: { percent: 0, text: "Terminating old workers..." },
          });
          await schedulerInstance.terminate();
          schedulerInstance = null;
        }

        dispatch({
          type: "UPDATE_PROGRESS",
          payload: {
            percent: 0,
            text: `Initializing ${requestedWorkerCount} OCR workers...`,
          },
        });

        schedulerInstance = Tesseract.createScheduler();
        const workerPromises = [];
        for (let i = 0; i < requestedWorkerCount; i++) {
          workerPromises.push(Tesseract.createWorker("eng"));
        }

        const workers = await Promise.all(workerPromises);
        workers.forEach((worker) => schedulerInstance.addWorker(worker));

        contextRef.current.scheduler = schedulerInstance;
        contextRef.current.currentWorkerCount = requestedWorkerCount;
      }

      // 4. Sequential Rendering & Parallel OCR
      const ocrPromises = [];
      const canvas = renderCanvasRef.current;
      const { pdfDoc, sourceImages } = contextRef.current;

      for (const pageNum of selectedPages) {
        let pageImgData, width, height;

        // A. Update Status to Rendering
        dispatch({
          type: "UPDATE_PAGE_STATUS",
          payload: { pageNum, updates: { status: "Rendering..." } },
        });

        // B. Render / Prepare Image
        if (inputType === "PDF") {
          const page = await pdfDoc.getPage(pageNum);
          const viewport = page.getViewport({ scale: 2.0 });

          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          await page.render({ canvasContext: ctx, viewport })
            .promise;
          pageImgData = canvas.toDataURL("image/jpeg", 0.8);
          width = viewport.width;
          height = viewport.height;
        } else {
          // IMAGES mode
          pageImgData = sourceImages[pageNum - 1];
          const img = new Image();
          await new Promise((r) => {
            img.onload = r;
            img.src = pageImgData;
          });
          width = img.width;
          height = img.height;
        }

        // C. Update State with Image Data
        dispatch({
          type: "UPDATE_PAGE_STATUS",
          payload: {
            pageNum,
            updates: {
              imgData: pageImgData,
              width,
              height,
              status: "OCR Processing...",
            },
          },
        });

        // D. Schedule OCR Job
        const job = schedulerInstance.addJob(
          "recognize",
          pageImgData,
        )
          .then((result) => {
            const { text, words } = result.data;

            dispatch({
              type: "UPDATE_PAGE_STATUS",
              payload: {
                pageNum,
                updates: { text, words, status: "Completed" },
              },
            });

            contextRef.current.processedJobCount++;
            const newCount = contextRef.current.processedJobCount;

            dispatch({
              type: "UPDATE_PROGRESS",
              payload: {
                percent: Math.round((newCount / totalJobs) * 100),
                text:
                  `OCR processed page ${pageNum} (${newCount} of ${totalJobs}).`,
              },
            });
          });

        ocrPromises.push(job);
        // E. Small delay to unblock UI
        await new Promise((r) => setTimeout(r, 20));
      }

      // 5. Wait for all OCR
      await Promise.all(ocrPromises);

      dispatch({
        type: "PROCESSING_COMPLETE",
        payload: { text: `Done! Processed ${totalJobs} page(s)/image(s).` },
      });
    } catch (err) {
      console.error("OCR Process Error:", err);
      // Determine if it was a range error or generic error
      if (err instanceof Error) {
        const isRangeError = err.message === "Invalid selection.";
        dispatch({
          type: "PROCESSING_ERROR",
          payload: { error: `Error: ${err.message}`, isRangeError },
        });
      }
    }
  }, [
    appMode,
    pageSelection,
    maxPage,
    pageRangeInput,
    workerCount,
    inputType,
  ]);

  // --- PDF OUTPUT FUNCTION ---

  /**
   * Generates and downloads the searchable PDF.
   */
  const generateFinalPDF = useCallback(async () => {
    if (
      appMode !== "COMPLETED" || processedPagesData.length === 0
    ) return;

    // Sort data by page number
    const sortedData = [...processedPagesData].sort((a, b) =>
      a.pageNum - b.pageNum
    );

    dispatch({
      type: "UPDATE_PROGRESS",
      payload: { percent: 100, text: "Generating Searchable PDF file..." },
    });

    try {
      const firstPage = sortedData[0];
      const firstPageOrientation = firstPage.width > firstPage.height
        ? "landscape"
        : "portrait";

      const doc = new jsPDF({
        orientation: firstPageOrientation,
        unit: "px",
        format: [firstPage.width, firstPage.height],
      });

      sortedData.forEach((pageData, index) => {
        const width = pageData.width;
        const height = pageData.height;
        const orientation = width > height ? "landscape" : "portrait";

        if (index > 0) {
          doc.addPage([width, height], orientation);
        }

        // 1. Add the original image as background
        if (
          pageData.imgData &&
          typeof pageData.imgData === "string" &&
          pageData.imgData.startsWith("data:")
        ) {
          doc.addImage(
            pageData.imgData,
            "JPEG",
            0,
            0,
            width,
            height,
          );
        }

        // 2. Add invisible text overlay
        doc.setFontSize(12);
        doc.setTextColor(255, 255, 255); // White text
        doc.internal.write("3 Tr"); // Text Rendering Mode 3 (Invisible)

        if (pageData.words) {
          pageData.words.forEach((word) => {
            const { text, bbox } = word;
            const h = bbox.y1 - bbox.y0;
            const fontSize = h * 0.9;
            doc.setFontSize(fontSize);
            doc.text(text, bbox.x0, bbox.y1, {
              baseline: "bottom",
            });
          });
        }
      });

      const fileName = inputType === "IMAGES"
        ? "ocr-joined-images.pdf"
        : "ocr-searchable-pdf.pdf";
      doc.save(fileName);

      dispatch({
        type: "UPDATE_PROGRESS",
        payload: { percent: 100, text: "PDF downloaded successfully!" },
      });
    } catch (err) {
      console.error(err);
      dispatch({
        type: "UPDATE_PROGRESS",
        payload: { percent: 100, text: "Error creating PDF." },
      });
    }
  }, [appMode, processedPagesData, inputType]);

  const setPageRangeError = (isError) =>
    dispatch({ type: "SET_PAGE_RANGE_ERROR", payload: isError });

  return {
    appMode,
    processedPagesData,
    progress,
    isProcessing,
    inputType,
    maxPage,
    workerCount,
    setWorkerCount,
    showResults,
    setShowResults,
    pageRangeInput,
    setPageRangeInput,
    pageSelection,
    setPageSelection,
    pageRangeError,
    setPageRangeError,
    handleFileSelect,
    startProcessing,
    generateFinalPDF,
  };
}

// --- MAIN APP COMPONENT ---

function App() {
  const {
    appMode,
    processedPagesData,
    progress,
    isProcessing,
    inputType,
    maxPage,
    workerCount,
    setWorkerCount,
    showResults,
    setShowResults,
    pageRangeInput,
    setPageRangeInput,
    pageSelection,
    setPageSelection,
    pageRangeError,
    setPageRangeError,
    handleFileSelect,
    startProcessing,
    generateFinalPDF,
  } = useAppState();

  return html`
    ${Header()}
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <drop-zone
        subtitle="Select or Drop PDF files"
        accepted="application/pdf"
        .disabled="${isProcessing}"
        @file-selected="${(e) => handleFileSelect(e.detail)}"
      ></drop-zone>

      ${OptionsPanel({
        appMode,
        isProcessing,
        maxPage,
        workerCount,
        setWorkerCount,
        showResults,
        setShowResults,
        pageRangeInput,
        setPageRangeInput,
        pageSelection,
        setPageSelection,
        pageRangeError,
        setPageRangeError,
        inputType,
      })} ${MainActionButton({
        appMode,
        startProcessing,
        generateFinalPDF,
        inputType,
      })} ${ProgressBar({ appMode, progress })} ${ResultsArea({
        processedPagesData,
        showResults,
        appMode,
      })}
    </main>
  `;
}

/**
 * Header component.
 * @returns {TemplateResult} The rendered header.
 */
const Header = () =>
  html`
    <header class="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div
        class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-center"
      >
        <div class="flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-8 w-8 text-blue-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h1 class="text-xl font-bold text-slate-900">
            OCR Overlay Tool (PDF & Images)
          </h1>
        </div>
      </div>
    </header>
  `;

/**
 * Options panel component.
 * @param {Object} props - Component props.
 * @param {'IDLE'|'LOADED'|'PROCESSING'|'COMPLETED'} props.appMode - Current app mode.
 * @param {boolean} props.isProcessing - Whether a job is currently processing.
 * @param {number} props.maxPage - Maximum pages.
 * @param {number} props.workerCount - Number of workers.
 * @param {function(number):void} props.setWorkerCount - Setter for worker count.
 * @param {boolean} props.showResults - Whether to show results.
 * @param {function(boolean):void} props.setShowResults - Setter for show results.
 * @param {string} props.pageRangeInput - Current page range input value.
 * @param {function(string):void} props.setPageRangeInput - Setter for page range input.
 * @param {string} props.pageSelection - Current page selection mode ('all' or 'select').
 * @param {function(string):void} props.setPageSelection - Setter for page selection.
 * @param {boolean} props.pageRangeError - Error state for page range.
 * @param {function(boolean):void} props.setPageRangeError - Setter for page range error.
 * @param {'NONE'|'PDF'|'IMAGES'} props.inputType - Input type.
 * @returns {TemplateResult|string} The rendered options panel or empty string.
 */
const OptionsPanel = ({
  appMode,
  isProcessing,
  maxPage,
  workerCount,
  setWorkerCount,
  showResults,
  setShowResults,
  pageRangeInput,
  setPageRangeInput,
  pageSelection,
  setPageSelection,
  pageRangeError,
  setPageRangeError,
  inputType,
}) => {
  const isVisible = appMode !== "IDLE";
  if (!isVisible) return "";

  return html`
    <div
      class="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-8"
    >
      <h2 class="text-lg font-semibold text-slate-700 mb-4">
        Processing Options
      </h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <!-- 1. Page/Image Selection -->
        <div class="block">
          <label class="block text-sm font-medium text-slate-700 mb-2">
            ${inputType === "IMAGES" ? "Images to Process" : "Pages to OCR"}
          </label>
          <div class="flex items-center gap-4">
            <div class="flex items-center">
              <input
                id="allPagesRadio"
                name="pageSelection"
                type="radio"
                .checked="${pageSelection === "all"}"
                @change="${() => {
                  setPageSelection("all");
                  setPageRangeError(false);
                }}"
                class="h-4 w-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                value="all"
                ?disabled="${isProcessing}"
              >
              <label
                for="allPagesRadio"
                class="ml-2 block text-sm text-slate-900"
              >
                All (${maxPage})
              </label>
            </div>
            <div class="flex items-center">
              <input
                id="selectPagesRadio"
                name="pageSelection"
                type="radio"
                .checked="${pageSelection === "select"}"
                @change="${() => {
                  setPageSelection("select");
                  setPageRangeError(false);
                }}"
                class="h-4 w-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                value="select"
                ?disabled="${isProcessing}"
              >
              <label
                for="selectPagesRadio"
                class="ml-2 block text-sm text-slate-900"
              >Select Range</label>
            </div>
          </div>
          <input
            id="pageRangeInput"
            type="text"
            .disabled="${pageSelection === "all" || isProcessing}"
            .value="${pageRangeInput}"
            @input="${(e) => {
              setPageRangeInput(e.target.value);
              setPageRangeError(false);
            }}"
            placeholder="e.g., 1, 3-5, 8 (Max: ${maxPage})"
            class="
              mt-2 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400 text-sm p-2
              ${classMap({
                "border-red-500": pageRangeError,
                "ring-red-500": pageRangeError,
              })}
            "
          >
          ${when(pageRangeError, () =>
            html`
              <p class="mt-1 text-xs text-red-600">
                Invalid selection range.
              </p>
            `, () => "")}
        </div>

        <!-- 2. Worker Count -->
        <div class="pl-6 border-slate-100 ${inputType !== "NONE"
          ? "border-l"
          : ""}">
          <label
            for="workerCountInput"
            class="block text-sm font-medium text-slate-700 mb-2"
          >OCR Workers (Threads)</label>
          <input
            id="workerCountInput"
            type="number"
            .value="${workerCount}"
            @change="${(e) => setWorkerCount(parseInt(e.target.value, 10))}"
            min="1"
            max="8"
            class="block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm p-2"
            title="The number of parallel workers Tesseract will use for OCR. Recommended: 2-4"
            ?disabled="${isProcessing}"
          >
          <p class="text-xs text-slate-400 mt-1">
            More workers = faster processing, higher memory use.
          </p>
        </div>

        <!-- 3. Show Results Toggle -->
        <div
          class="cursor-pointer mb-2 pl-6 border-l border-slate-100"
        >
          <div class="gap-2 relative inline-flex items-center">
            <input
              type="checkbox"
              id="showResultsToggle"
              class="nd-switch"
              .checked="${showResults}"
              @change="${(e) => setShowResults(e.target.checked)}"
              class="sr-only peer"
            />
            <label for="showResultsToggle"> Show Page Results </label>
          </div>
          <p class="text-xs text-slate-400 mt-1">
            Hide to speed up processing on very large documents.
          </p>
        </div>
      </div>
    </div>
  `;
};

/**
 * Main action button component.
 * @param {Object} props - Component props.
 * @param {'IDLE'|'LOADED'|'PROCESSING'|'COMPLETED'} props.appMode - Current app mode.
 * @param {Function} props.startProcessing - Function to start processing.
 * @param {Function} props.generateFinalPDF - Function to generate PDF.
 * @param {'NONE'|'PDF'|'IMAGES'} props.inputType - Input type.
 * @returns {TemplateResult|string} The rendered button or empty string.
 */
const MainActionButton = (
  { appMode, startProcessing, generateFinalPDF },
) => {
  let text = "";
  /* @type {Function} */
  let action = () => {};
  let disabled = true;
  let className = "bg-slate-200 text-slate-400 cursor-not-allowed";

  if (appMode === "LOADED") {
    text = "Start Processing";
    action = startProcessing;
    disabled = false;
    className = "bg-blue-600 text-white hover:bg-blue-700 shadow-lg";
  } else if (appMode === "PROCESSING") {
    text = "Processing...";
    disabled = true;
    className = "bg-slate-400 text-white cursor-wait";
  } else if (appMode === "COMPLETED") {
    text = "Download Searchable PDF";
    action = generateFinalPDF;
    disabled = false;
    className = "bg-green-600 text-white hover:bg-green-700 shadow-lg";
  } else {
    return html`

    `;
  }

  return html`
    <button
      @click="${action}"
      ?disabled="${disabled}"
      class="w-full mb-8 flex justify-center items-center gap-2 px-4 py-3 rounded-xl font-medium transition-colors ${className}"
    >
      ${text}
    </button>
  `;
};

/**
 * Progress bar component.
 * @param {Object} props - Component props.
 * @param {'IDLE'|'LOADED'|'PROCESSING'|'COMPLETED'} props.appMode - Current app mode.
 * @param {ProcessProgress} props.progress - Progress object.
 * @returns {TemplateResult|string} The rendered progress bar or empty string.
 */
const ProgressBar = ({ appMode, progress }) => {
  const isVisible = appMode === "PROCESSING" ||
    appMode === "COMPLETED";
  if (!isVisible) return "";

  return html`
    <div id="globalProgress" class="mb-8">
      <status-message type="${appMode === "COMPLETED" ? "success" : "info"}" .message="${progress.text}"></status-message>
      <div class="flex justify-between mb-1 px-1">
        <span id="percentageText" class="text-xs font-bold text-blue-700"
        >${progress.percent}%</span>
      </div>
      <div class="w-full bg-slate-200 rounded-full h-2">
        <div
          id="progressBar"
          class="bg-blue-600 h-2 rounded-full transition-all duration-300"
          style="${styleMap({ width: `${progress.percent}%` })}"
        >
        </div>
      </div>
    </div>
  `;
};

/**
 * Single page result component.
 * @param {Object} props - Component props.
 * @param {PageData} props.page - Page data object.
 * @returns {TemplateResult} The rendered page result.
 */
const PageResult = ({ page }) => {
  const pageStatusComplete = page.status === "Completed";

  const copyText = (e) => {
    const textarea = e.target.closest(".p-4.flex.flex-col")
      .querySelector("textarea");
    textarea.select();
    document.execCommand("copy");
    const originalText = e.target.textContent;
    e.target.textContent = "Copied!";
    setTimeout(() => e.target.textContent = originalText, 2000);
  };

  return html`
    <div
      class="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden"
    >
      <div
        class="border-b border-slate-100 bg-slate-50 px-4 py-3 flex justify-between items-center"
      >
        <h3 class="font-semibold text-slate-700">Page ${page
          .pageNum}</h3>
        <div
          class="status-indicator flex items-center gap-2 text-xs font-medium text-slate-500"
        >
          <span class="status-dot w-2 h-2 rounded-full ${classMap(
            {
              "bg-green-500": pageStatusComplete,
              "bg-blue-500": !pageStatusComplete,
              "animate-pulse": !pageStatusComplete,
            },
          )}"></span>
          <span class="status-text ${classMap({
            "text-green-600": pageStatusComplete,
            "text-blue-600": !pageStatusComplete,
          })}">${page
            .status}</span>
        </div>
      </div>
      <div
        class="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100"
      >
        <!-- Image Column -->
        <div
          class="p-4 bg-slate-50/50 flex items-start justify-center overflow-auto max-h-[600px] custom-scrollbar"
        >
          <!-- Show the captured image data -->
          ${page.imgData
            ? html`
              <img src="${page
                .imgData}" class="shadow-lg max-w-full h-auto" />
            `
            : html`
              <div class="text-slate-400 text-sm italic">Image pending...</div>
            `}
        </div>
        <!-- Text Column -->
        <div class="p-4 flex flex-col h-[600px]">
          <div class="flex justify-between items-center mb-2">
            <span
              class="text-xs font-semibold text-slate-400 uppercase tracking-wider"
            >Extracted Text</span>
            <button
              @click="${copyText}"
              class="copy-btn text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Copy Text
            </button>
          </div>
          <textarea
            class="extracted-text w-full flex-1 p-3 text-sm text-slate-700 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none custom-scrollbar font-mono leading-relaxed bg-white"
            readonly
            placeholder="Text will appear here after processing..."
          >${page.text}</textarea>
        </div>
      </div>
    </div>
  `;
};

/**
 * Results area component.
 * @param {Object} props - Component props.
 * @param {PageData[]} props.processedPagesData - Array of page data.
 * @param {boolean} props.showResults - Whether to show results.
 * @param {'IDLE'|'LOADED'|'PROCESSING'|'COMPLETED'} props.appMode - Current app mode.
 * @returns {TemplateResult|string} The rendered results area or empty string.
 */
const ResultsArea = (
  { processedPagesData, showResults, appMode },
) => {
  const isVisible = showResults &&
    (appMode === "PROCESSING" || appMode === "COMPLETED");

  if (!isVisible) return "";

  return html`
    <div id="resultsContainer" class="space-y-12">
      ${processedPagesData.map((page) =>
        html`
          <div class="page-result">${PageResult({ page })}</div>
        `
      )}
    </div>
  `;
};

// Register the main application component
customElements.define(
  "ocr-app",
  component(App, { useShadowDOM: false }),
);
