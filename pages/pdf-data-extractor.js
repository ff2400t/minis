// Load haunted and its dependencies from CDN
import { html, when } from "/vendor/lit-html@3.3.2.js";
import {
  component,
  useCallback,
  useMemo,
  useReducer,
  useRef,
  useState as u1,
} from "/vendor/haunted@6.1.0.js";
import "/drop-zone.js";
import { BUILT_IN_PARSERS, generalDocumentParser } from "/data-extractor.js";
// --- CONSTANTS & GLOBALS ---
const LOCAL_STORAGE_KEY = "dataExtractorCustomParsers";

/** @type {ParserState} */
const initialParserState = {
  customParsers: [],
  isParserFormVisible: false,
  isParserListModalVisible: false,
  expandedParsers: {},
  isTemplatesModalVisible: false,
  templatesText: "",
  parsers: [],
  selectedParser: "auto",
};

/**
 * @template T
 * A simplified type alias for `useState`.
 *
 * @type {<T>(initialState: T) => [T, (e: T | ((e: T) => T)) => void]}
 */
let useState = u1;

/**
 * @typedef {import("./data-extractor.js").StringMap} StringMap
 * @typedef {import('data-extractor.js').Parser} Parser
 * @typedef {{
    fileName:string,
    docType: string,
    metadata: StringMap,
    headers: string[] ,
    rows: string[][]
    text: string,
    rawText: string,
    status: string,
 }} Docs
 * @typedef {{ title: string, headers: string[] , rows: string[][] }} ConsolidatedTable
 * @typedef {{ fileName: string, docType: string, fields: StringMap}} DocMetadata
 * @typedef {{
     parsers: Array<Parser>;
     isParserFormVisible: any;
     isParserListModalVisible: any;
     expandedParsers: { [x: string]: any; };
     isTemplatesModalVisible: any;
     customParsers: Array<Parser>;
     templatesText: string;
     selectedParser: string;
}} ParserState
 */

/** @typedef {object} FileProcessingContext
 * @property {File[]} fileList
 * @property {number} currentIndex
 * @property {Docs[]} tempDocuments
 * @property {DocMetadata[]} tempMetadata
 * @property {number} successCount
 */

const parserInit = (/** @type {object} */ state) => {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (stored) {
      const parsers = JSON.parse(stored);
      if (Array.isArray(parsers)) {
        return { ...state, customParsers: parsers };
      }
    }
  } catch (e) {
    console.error("Could not load custom parsers from localStorage:", e);
  }
  return state;
};

/**
 * @param {ParserState} state
 * @param {{ type: string; payload: any | undefined}} action
 */
function parserReducer(state, action) {
  switch (action.type) {
    case "UPDATE_PARSERS":
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(action.payload));
      return { ...state, customParsers: action.payload };
    case "SET_SELECTED_PARSER":
      return { ...state, selectedParser: action.payload };
    case "TOGGLE_FORM":
      return { ...state, isParserFormVisible: !state.isParserFormVisible };
    case "CLOSE_FORM":
      return { ...state, isParserFormVisible: false };
    case "TOGGLE_LIST_MODAL":
      return {
        ...state,
        isParserListModalVisible: action.payload ??
          !state.isParserListModalVisible,
      };
    case "TOGGLE_EXPAND_PARSER":
      return {
        ...state,
        expandedParsers: {
          ...state.expandedParsers,
          [action.payload]: !state.expandedParsers[action.payload],
        },
      };
    case "TOGGLE_TEMPLATES_MODAL":
      return {
        ...state,
        isTemplatesModalVisible: action.payload ??
          !state.isTemplatesModalVisible,
      };
    case "SET_TEMPLATES_TEXT":
      return { ...state, templatesText: action.payload };
    default:
      return state;
  }
}

/** @typedef {object} PasswordModalState
 * @property {boolean} isOpen
 * @property {string} fileName
 * @property {string} passwordInput
 * @property {boolean} useForSubsequent
 * @property {File | null} fileToProcess
 */

/** @type{PasswordModalState} */
const INITIAL_MODAL_STATE = {
  isOpen: false,
  fileName: "",
  passwordInput: "",
  useForSubsequent: false,
  fileToProcess: null,
};

// --- Utility Functions ---

/**
 * @param {string} text
 */
function parseConfigBlock(text) {
  const baseObj = {
    name: "",
    matches: "",
    metadata: undefined,
    table: undefined,
  };

  const parsed = text.split(";;\n")
    .map((str) => {
      const indx = str.search(":");
      return [str.slice(0, indx), str.slice(indx + 1)];
    });
  return Object.assign(baseObj, Object.fromEntries(parsed));
}

// TODO: find the metadataList
/**
 * @param {any[]} metadataList
 */
function generateConsolidatedTables(metadataList) {
  /** @type {Object.<string, any>} */
  const groups = {};
  metadataList.forEach((item) => {
    if (!groups[item.docType]) groups[item.docType] = [];
    groups[item.docType].push(item);
  });

  return Object.keys(groups).map((type) => {
    const items = groups[type];
    const keys = new Set();
    items.forEach((/** @type {{ fields: {}; }} */ i) =>
      Object.keys(i.fields).forEach((k) => keys.add(k))
    );
    const header = Array.from(keys);

    const rows = items.map(
      (
        /** @type {{ fileName: any; fields: { [x: string]: any; }; }} */ item,
      ) => {
        const rowData = [item.fileName];
        header.forEach((h) => {
          rowData.push(item.fields[h] || "");
        });
        return rowData;
      },
    );

    return {
      title: type,
      headers: ["Source File", ...header],
      rows: rows,
    };
  });
}

class PasswordRequiredError extends Error {
  /**
   * @param {string | undefined} message
   */
  constructor(message) {
    super(message);
    this.name = "PasswordException";
  }
}

/**
 * @param {Blob} file
 * @param {string} password
 */
async function extractAllPdfText(file, password = "") {
  const fileReader = new FileReader();
  return new Promise((resolve, reject) => {
    fileReader.onload = async function () {
      // @ts-ignore
      const typedarray = new Uint8Array(this.result);
      try {
        // @ts-ignore
        const pdf = await pdfjsLib.getDocument({
          data: typedarray,
          password: password,
        }).promise;
        let fullText = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          fullText +=
            textContent.items.map((/** @type {{ str: any; }} */ item) =>
              item.str
            ).join(" ") + " ";
        }
        resolve(fullText);
      } catch (error) {
        if (
          error instanceof Error &&
          (
            error.name === "PasswordException" ||
            error.message.includes("password")
          )
        ) {
          reject(new PasswordRequiredError("Password required or incorrect."));
        } else {
          reject(error);
        }
      }
    };
    fileReader.onerror = () => reject(new Error("Error reading file."));
    fileReader.readAsArrayBuffer(file);
  });
}

// --- Templates ---
const renderConsolidatedSummary = (
  /** @type {ConsolidatedTable[]} */ consolidatedTables,
  /** @type {(arg0: string) => any} */ copyTable,
) => {
  return html`
    <div class="mt-8 border-t pt-8">
      <h2 class="text-2xl font-bold text-gray-800 mb-4">
        Consolidated Metadata Summary
      </h2>
      <p class="text-gray-600 mb-4">
        A combined view of metadata across all processed files, grouped by document
        type.
      </p>
      ${consolidatedTables.map((tbl, i) =>
        html`
          <div class="mb-8">
            <div class="flex justify-between items-center mb-3">
              <h3 class="text-lg font-semibold text-blue-700">${tbl.title}</h3>
              <button
                @click="${() => copyTable(`consTable-${i}`)}"
                class="px-3 py-1 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded text-sm font-bold transition"
              >
                Copy Table
              </button>
            </div>
            <div class="overflow-x-auto border rounded-lg shadow-sm">
              <table id="${`consTable-${i}`}" class="data-table">
                <thead class="bg-gray-50">
                  <tr>
                    ${tbl.headers.map((h) =>
                      html`
                        <th class="font-bold text-gray-600">${h}</th>
                      `
                    )}
                  </tr>
                </thead>
                <tbody>
                  ${tbl.rows.map((row) =>
                    html`
                      <tr>
                        ${row.map((cell) =>
                          html`
                            <td>${cell}</td>
                          `
                        )}
                      </tr>
                    `
                  )}
                </tbody>
              </table>
            </div>
          </div>
        `
      )}
    </div>
  `;
};

const renderDetailedTable = (
  /** @type {Docs[]} */ documents,
  /** @type {Set<string>} */ selectedMetaCols,
  /** @type {(arg0: string) => any } */ toggleMetaColumn,
) => {
  // Calculate which extra columns are active (convert Set to Array)
  const activeExtraCols = Array.from(selectedMetaCols);
  const HeaderColSpan = Math.max.apply(null, documents.map((a) => a.headers.length));

  return html`
    <div class="mt-6">
      <h3 class="text-lg font-bold text-gray-700 mb-2">Detailed Extraction</h3>
      <div class="overflow-x-auto border rounded-lg">
        <table id="outputTable" class="data-table">
          <tbody>
            ${documents.map((doc) => {
              // 1. Render Source Header
              const fileRow = html`
                <tr class="file-row">
                  <td colspan="${HeaderColSpan +
                    activeExtraCols.length}">Source: ${doc
                    .fileName} (${doc.docType})</td>
                </tr>
              `;

              // 2. Render Metadata Rows (with checkboxes)
              const metaRows = Object.entries(doc.metadata).map(([key, val]) =>
                html`
                  <tr>
                    <td class="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        class="meta-checkbox rounded text-blue-600 focus:ring-blue-500"
                        .checked="${selectedMetaCols.has(key)}"
                        @change="${() => toggleMetaColumn(key)}"
                        id="${`cb-${doc.fileName}-${key}`}"
                      />
                      <label for="${`cb-${doc.fileName}-${key}`}" class="meta-key-label font-medium text-gray-700">
                        ${key}
                      </label>
                    </td>
                    <td>${val}</td>
                    ${Array.from({ length: 5 + activeExtraCols.length }).map(
                      () =>
                        html`
                          <td></td>
                        `,
                    )}
                  </tr>
                `
              );

              // 3. Render Table Header (Standard Headers + Active Metadata Keys)
              const headers = html`
                <tr class="bg-gray-50 border-b-2 border-gray-200">
                  ${doc.headers.map((h) =>
                    html`
                      <th class="font-bold text-gray-800">${h}</th>
                    `
                  )} ${activeExtraCols.map((colName) =>
                    html`
                      <th class="font-bold meta-col-header text-sm">${colName}</th>
                    `
                  )}
                </tr>
              `;

              // 4. Render Table Rows (Data + Active Metadata Values)
              const rows = doc.rows.map((row) => {
                return html`
                  <tr class="hover:bg-gray-50 transition-colors">
                    ${row.map((cell) =>
                      html`
                        <td>${cell}</td>
                      `
                    )} ${activeExtraCols.map((colKey) => {
                      const val = doc.metadata[colKey] || "";
                      return html`
                        <td class="meta-col-cell">${val}</td>
                      `;
                    })}
                  </tr>
                `;
              });

              return html`
                ${fileRow} ${metaRows} ${headers} ${rows}
              `;
            })}
          </tbody>
        </table>
      </div>
    </div>
  `;
};
// --- Haunted Component (Main Application) ---

// some useless stuff that will help withtype inference
/** @type {Docs[]} */
const documentsInitial = [];
/** @type {DocMetadata[]} */
const consolidatedMetadataInitial = [];

function App() {
  // --- State Declarations ---
  /** @type {[ParserState, (e: {type: string, payload: any| undefined}) => ParserState ]} */
  const [parserState, dispatchParser] = useReducer(
    parserReducer,
    initialParserState,
    parserInit,
  );
  const {
    customParsers,
    isParserFormVisible,
    isParserListModalVisible,
    expandedParsers,
    isTemplatesModalVisible,
    templatesText,
    selectedParser,
  } = parserState;

  const [status, setStatus] = useState({ message: "", type: "" });

  // Results State
  const [documents, setDocuments] = useState(documentsInitial); // Stores structured
  const [consolidatedMetadata, setConsolidatedMetadata] = useState(
    consolidatedMetadataInitial,
  );
  const [isResultVisible, setIsResultVisible] = useState(false);
  const [isTableVisible, setIsTableVisible] = useState(true);
  const [isRawTextVisible, setIsRawTextVisible] = useState(false);
  const [isConsolidatedVisible, setIsConsolidatedVisible] = useState(false);

  // Dynamic Columns Stat
  const [selectedMetaCols, setSelectedMetaCols] = useState(new Set(""));

  const [passwordModal, setPasswordModal] = useState(INITIAL_MODAL_STATE);
  const [savedPassword, setSavedPassword] = useState("");

  // File Processing Context (Mutable, non-reactive state managed internally)
  /** @type {{current: FileProcessingContext}}*/
  const fileProcessingContext = useRef({
    fileList: [],
    currentIndex: 0,
    tempDocuments: [], // New structured temp storage
    tempMetadata: [],
    successCount: 0,
  });

  /** @type {ConsolidatedTable[]} */
  const consolidatedTables = useMemo(
    () => generateConsolidatedTables(consolidatedMetadata),
    [consolidatedMetadata],
  );

  /** @type {Parser[]} */
  const allParsers = useMemo(() => [
    ...customParsers.map((/** @type {Parser} */ p) => ({
      ...p,
      name: p.name + " (Custom)",
    })),
    ...BUILT_IN_PARSERS,
  ], [customParsers]);

  // --- Handlers (Memoized) ---

  const toggleMetaColumn = (/** @type {string} */ key) => {
    const newSet = new Set(selectedMetaCols);
    if (newSet.has(key)) {
      newSet.delete(key);
    } else {
      newSet.add(key);
    }
    setSelectedMetaCols(newSet);
  };

  const addCustomParser = (/** @type {string} */ configText) => {
    const data = parseConfigBlock(configText);

    const { name, matches, metadata, table } = data;

    if (!name || !matches) {
      setStatus({
        message:
          "Parser Name (name:) and Match Strings (matches:) are required.",
        type: "error",
      });
      return;
    }
    try {
      if (metadata) new RegExp(metadata, "s");
      if (table) new RegExp(table, "g");
    } catch (e) {
      if (e instanceof Error) {
        setStatus({ message: `Invalid Regex: ${e.message}`, type: "error" });
      }
      return;
    }
    /** @type {string} */
    let m = matches;

    const newParser = {
      name,
      matches: m.split(",").map((s) => s.trim()).filter((s) => s.length > 0),
      metadata: metadata,
      table: table,
    };

    if (newParser.matches.length === 0) {
      setStatus({
        message: "The matches: value cannot be empty.",
        type: "error",
      });
      return;
    }

    const currentParsers = [...customParsers];
    const existingIndex = currentParsers.findIndex((p) => p.name === name);

    let newParserList;
    let action;

    if (existingIndex !== -1) {
      currentParsers[existingIndex] = newParser;
      newParserList = currentParsers;
      action = "updated";
    } else {
      newParserList = [...currentParsers, newParser];
      action = "added";
    }

    dispatchParser({ type: "UPDATE_PARSERS", payload: newParserList });
    dispatchParser({ type: "CLOSE_FORM", payload: undefined });
    setStatus({
      message: `Custom parser "${name}" successfully ${action}!`,
      type: "success",
    });
  };

  const removeCustomParser = (/** @type {number} */ index) => {
    const name = customParsers[index].name;
    const current = [...customParsers];
    current.splice(index, 1);
    dispatchParser({ type: "UPDATE_PARSERS", payload: current });
    setStatus({ message: `Custom parser "${name}" removed.`, type: "info" });
  };

  /**
   * @param {string} tableId
   */
  const copyTable = (tableId) => {
    /** @type {HTMLTableElement} */
    // @ts-ignore
    const table = document.getElementById(tableId);
    if (!table) return;

    // Simple version for standard tables
    const rows = Array.from(table.rows).map((row) =>
      Array.from(row.cells).map((cell) => cell.innerText).join("\t")
    ).join("\n");

    // try the new clipboard api before the old one
    navigator?.clipboard.writeText(rows)
      .then(() => {
        setStatus({
          message: "Table content copied to clipboard!",
          type: "success",
        });
      }).catch(() => {
        const tempTextArea = document.createElement("textarea");
        tempTextArea.style.position = "fixed";
        tempTextArea.style.opacity = "0";
        tempTextArea.value = rows;
        document.body.appendChild(tempTextArea);
        tempTextArea.select();
        console.log(tempTextArea.value);
        try {
          document.execCommand("copy");
          setStatus({
            message: "Table content copied to clipboard!",
            type: "success",
          });
        } catch (err) {
          setStatus({ message: "Manual copy required.", type: "error" });
        } finally {
          document.body.removeChild(tempTextArea);
          setTimeout(() => setStatus({ message: "", type: "" }), 3000);
        }
      }).finally(() => {
        setTimeout(() => setStatus({ message: "", type: "" }), 3000);
      });
  };

  // --- File Processing Logic ---

  const finalizeProcessing = () => {
    const { tempDocuments, tempMetadata, successCount, fileList } =
      fileProcessingContext.current;

    setDocuments(tempDocuments);
    setConsolidatedMetadata(tempMetadata);
    setIsResultVisible(true);

    if (tempDocuments.length === 0 && tempMetadata.length === 0) {
      setStatus({
        message: "Processed files but found no recognized data.",
        type: "info",
      });
    } else {
      setStatus({
        message:
          `Successfully processed ${successCount} of ${fileList.length} files!`,
        type: "success",
      });
    }
  };

  const processFileContent = useCallback(
    async (
      /** @type {File} */ file,
      /** @type {string} */ password,
    ) => {
      /** @type {string} */
      let rawText = await extractAllPdfText(file, password);
      rawText = rawText.replace(/   /g, " ");

      /** @type {import("./data-extractor.js").ParserResult} */
      let parsedData = { allRows: [], metadataFields: {} };
      let docType = "Unknown";
      const cleanCheckText = rawText.replace(/\s+/g, " ");

      let parserFound = false;

      for (
        const { name, matches, metadata, table, func = generalDocumentParser }
          of allParsers
      ) {
        let isMatch = false;
        if (selectedParser === "auto") {
          isMatch = matches.every((s) =>
            cleanCheckText.toLowerCase().includes(s.toLowerCase())
          );
        } else {
          isMatch = name === selectedParser;
        }

        if (isMatch) {
          docType = name;
          let effectiveMetaRx = typeof metadata === "string"
            ? new RegExp(metadata, "s")
            : metadata;
          let effectiveTableRx = typeof table === "string"
            ? new RegExp(table, "g")
            : table;

          parsedData = func(rawText, effectiveMetaRx, effectiveTableRx, name);
          console.debug(JSON.stringify(parsedData));
          parserFound = true;
          break;
        }
      }

      if (parserFound) {
        if (
          parsedData.metadataFields &&
          Object.keys(parsedData.metadataFields).length > 0
        ) {
          fileProcessingContext.current.tempMetadata.push({
            fileName: file.name,
            docType: docType,
            fields: parsedData.metadataFields,
          });
        }

        // Separation of concerns: We now split the "allRows" into metadata section, header, and data
        const metaKeys = Object.keys(parsedData.metadataFields);
        const metaCount = metaKeys.length;

        // The standard parser output is: Metadata Rows -> Header -> Data Rows
        // We assume parsedData.allRows[metaCount] is the header based on generalDocumentParser logic
        const headerRow = parsedData.allRows.length > metaCount
          ? parsedData.allRows[metaCount]
          : [];
        const dataRows = parsedData.allRows.length > metaCount + 1
          ? parsedData.allRows.slice(metaCount + 1)
          : [];

        fileProcessingContext.current.tempDocuments.push({
          fileName: file.name,
          docType: docType,
          metadata: parsedData.metadataFields,
          headers: headerRow,
          rows: dataRows,
          text: "",
          rawText,
          status: "success",
        });
      } else {
        fileProcessingContext.current.tempDocuments.push({
          fileName: file.name,
          docType: "FAILED",
          metadata: parsedData.metadataFields,
          headers: [],
          rows: [],
          text: `Error: Document type unknown. Data not extracted.`,
          rawText,
          status: "error",
        });
        throw new Error("Document type unknown. Data not extracted.");
      }
    },
    [customParsers, selectedParser],
  );

  const processNextFile = useCallback(async () => {
    const fpContext = fileProcessingContext.current;
    const { fileList, currentIndex } = fpContext;

    if (currentIndex >= fileList.length) {
      finalizeProcessing();
      return;
    }

    const file = fileList[currentIndex];
    setStatus({
      message: `Processing ${
        currentIndex + 1
      } of ${fileList.length}: ${file.name}...`,
      type: "info",
    });

    try {
      await processFileContent(file, savedPassword);

      fpContext.successCount++;
      fpContext.currentIndex++;
      processNextFile();
    } catch (e) {
      if (e instanceof Error) {
        if (e.name === "PasswordException") {
          // PAUSE: Open modal
          setPasswordModal((prev) => ({
            ...prev,
            isOpen: true,
            fileName: file.name,
            fileToProcess: file,
            passwordInput: "",
          }));
          return;
        }

        // Other Error
        console.error(`Error processing ${file.name}:`, e);

        fpContext.currentIndex++;
        processNextFile();
      }
    }
  }, [
    processFileContent,
    savedPassword,
  ]);

  const processFiles = useCallback((/** @type {FileList} */ fileList) => {
    if (!fileList || fileList.length === 0) {
      setIsResultVisible(false);
      setStatus({ message: "", type: "" });
      return;
    }

    const files = Array.from(fileList).filter((f) =>
      f.type === "application/pdf"
    );

    // Reset UI state
    setIsResultVisible(false);
    setDocuments([]);
    setSelectedMetaCols(new Set()); // Reset selected columns on new upload
    setConsolidatedMetadata([]);
    setSavedPassword("");

    // Reset mutable context
    fileProcessingContext.current = {
      fileList: files,
      currentIndex: 0,
      tempDocuments: [],
      tempMetadata: [],
      successCount: 0,
    };

    processNextFile();
  }, [processNextFile]);

  const handlePasswordSubmit = useCallback(async () => {
    const { fileToProcess, passwordInput, useForSubsequent } = passwordModal;
    const password = passwordInput;
    const useSubsequent = useForSubsequent;

    if (password.length === 0) {
      setStatus({ message: "Please enter a password.", type: "error" });
      return;
    }

    // 1. Close modal and set saved password
    setPasswordModal(INITIAL_MODAL_STATE);
    setSavedPassword(useSubsequent ? password : "");
    setStatus({ message: "", type: "" });

    // 2. Attempt to re-process the file with the new password
    if (fileToProcess) {
      try {
        await processFileContent(fileToProcess, password);

        fileProcessingContext.current.successCount++;
        fileProcessingContext.current.currentIndex++;
        processNextFile();
      } catch (e) {
        if (e instanceof Error) {
          if (e.name === "PasswordException") {
            setStatus({
              message: "Incorrect password. Please try again.",
              type: "error",
            });
            setPasswordModal((prev) => ({
              ...prev,
              isOpen: true,
              fileName: fileToProcess.name,
              fileToProcess: fileToProcess,
              passwordInput: password,
            }));
            return;
          }
        }

        // Other error: log and skip this file, continue the main loop
        console.error("Error after password retry:", e);
        fileProcessingContext.current.currentIndex++;
        processNextFile();
      }
    }
  }, [
    passwordModal,
    processFileContent,
    processNextFile,
  ]);

  const handlePasswordSkip = useCallback(() => {
    setPasswordModal(INITIAL_MODAL_STATE);
    setStatus({ message: "", type: "" });

    if (
      fileProcessingContext.current.fileList.length >
        fileProcessingContext.current.currentIndex
    ) {
      const fileObj = fileProcessingContext.current.tempDocuments.find((a) =>
        a.fileName
      );
      if (fileObj) {
        fileObj.docType = "SKIPPED";
        fileObj.text = "Skipped by user.";
        fileObj.status = "skipped";
      }
    }
    fileProcessingContext.current.currentIndex++;
    processNextFile();
  }, [processNextFile]);

  const handleFileInput = (/** @type {CustomEvent} */ e) => {
    // @ts-ignore we know this will work
    processFiles(e.detail);
  };

  // --- Modal/UI Render Helpers ---

  const renderStatus = () => {
    if (!status.message) {
      return html`

      `;
    }
    const baseClass = status.type === "error"
      ? "bg-red-100 text-red-800"
      : (status.type === "success"
        ? "bg-green-100 text-green-800"
        : "bg-blue-100 text-blue-800");
    return html`
      <div class="p-4 rounded-lg text-sm mb-6 ${baseClass}" role="alert">
        ${status.message}
      </div>
    `;
  };

  const renderParserForm = () => {
    const customParsersHtml = customParsers.length > 0
      ? html`
        <div class="mb-6 p-4 bg-indigo-50 rounded-lg border border-indigo-100">
          <div class="flex justify-between items-center mb-3">
            <h4 class="font-bold text-indigo-800">Active Custom Parsers:</h4>
            <button
              @click="${() => {
                const text = customParsers.map((p) => {
                  return `name: ${p.name}\nmatches: ${
                    p.matches.join(", ")
                  }\nMetadata: ${p.metadata || ""}\nTable: ${p.table || ""}`;
                }).join("\n\n---\n\n");
                dispatchParser({ type: "SET_TEMPLATES_TEXT", payload: text });
                dispatchParser({
                  type: "TOGGLE_TEMPLATES_MODAL",
                  payload: true,
                });
              }}"
              class="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700 transition"
            >
              Edit / Export All
            </button>
          </div>
          <ul class="space-y-2">
            ${customParsers.map((p, i) =>
              html`
                <li class="flex justify-between items-center bg-white p-2 rounded shadow-sm">
                  <div>
                    <span class="font-semibold text-gray-800">${p.name}</span>
                    <span class="text-xs text-gray-500 ml-2">(Match: ${p.matches
                      .join(", ")})</span>
                  </div>
                  <button
                    @click="${() => removeCustomParser(i)}"
                    class="text-red-500 hover:text-red-700 text-sm font-medium px-2"
                  >
                    Remove
                  </button>
                </li>
              `
            )}
          </ul>
        </div>
      `
      : html`

      `;

    const submitForm = (/** @type {SubmitEvent} */ e) => {
      e.preventDefault();
      /** @type {HTMLTextAreaElement | null} */
      const configInput = document.querySelector("#configTextInput");
      if (configInput) {
        addCustomParser(configInput.value);
        configInput.value = ""; // Clear input after submission
      }
    };

    return html`
      <div class="mb-6 border rounded-lg overflow-hidden">
        <button
          class="w-full text-left px-6 py-4 bg-gray-100 font-semibold text-gray-700 hover:bg-gray-200 flex justify-between items-center transition"
          @click="${() =>
            dispatchParser({ type: "TOGGLE_FORM", payload: undefined })}"
        >
          <span>🛠️ Configure Custom Parser (Add/Update/Import)</span>
          <span>${isParserFormVisible ? "▲" : "▼"}</span>
        </button>
        ${when(isParserFormVisible, () =>
          html`
            <div class="p-6 bg-white border-t">
              ${customParsersHtml}

              <form @submit="${submitForm}">
                <div class="mb-6">
                  <label class="block text-sm font-medium text-gray-700 mb-1"
                  >Quick Import (Paste Config Block)</label>
                  <textarea
                    id="configTextInput"
                    class="w-full h-48 rounded-md border-gray-300 shadow-sm border p-2 text-sm font-mono focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Define your parser here using the required keys.&#10;&#10;Name: My Custom Bank Statement&#10;matches: Bank Statement, Account Summary, MyBankCorp&#10;Metadata: /Account Number: (?<AccNo>\\d+).*?Name: (?<Name>.*?)/s&#10;Table: /(?<Date>\\d{2}\\.\\d{2}\\.\\d{4})\\s+.*\\s+(?<Amount>\\d+)/g"
                  ></textarea>
                  <p class="text-xs text-gray-500 mt-1">
                    Define your parser using the keys: <code class="font-semibold"
                    >Name:</code>, <code class="font-semibold">matches:</code>
                    (comma-separated document identifiers), <code class="font-semibold"
                    >Metadata:</code> (single-match regex for key info), and <code
                      class="font-semibold"
                    >Table:</code> (global-match regex for rows).
                  </p>
                </div>

                <button
                  type="submit"
                  class="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition font-medium"
                >
                  Add / Update Parser
                </button>
              </form>
            </div>
          `)}
      </div>
    `;
  };

  const renderPasswordModal = () => {
    const updatePassInput = (/** @type {SubmitEvent} */ e) => {
      /** @type {HTMLInputElement | null} */
      const useForSubsequentElm = document.querySelector("#useForSubsequent");
      if (useForSubsequentElm === null) {
        return;
      }
      const useForSubsequent = useForSubsequentElm.checked;

      /** @type {string} */
      // @ts-ignore
      const passwordInput = e.target.value;
      setPasswordModal((prev) => ({
        ...prev,
        passwordInput,
        useForSubsequent,
      }));
    };

    const updateCheckbox = (/** @type {InputEvent} */ e) => {
      /** @type {string} */
      // @ts-ignore
      const passwordInput = document.querySelector("#passwordInput").value;

      /** @type {boolean} */
      // @ts-ignore
      const useForSubsequent = e.target.checked;
      setPasswordModal((prev) => ({
        ...prev,
        passwordInput,
        useForSubsequent,
      }));
    };

    return html`
      <div class="fixed inset-0 z-50 flex items-center justify-center modal-backdrop">
        <div class="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
          <h3 class="text-xl font-bold text-gray-800 mb-4">Password Required</h3>
          <p class="text-sm text-gray-600 mb-2">
            The file <span class="font-bold text-blue-600">${passwordModal
              .fileName}</span> is
            encrypted.
          </p>

          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-1"
            >Enter Password</label>
            <input
              type="password"
              id="passwordInput"
              class="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Password"
              .value="${passwordModal.passwordInput}"
              @input="${updatePassInput}"
              @keydown="${(/** @type {KeyboardEvent} */ e) => {
                if (e.key === "Enter") handlePasswordSubmit();
              }}"
            />
          </div>

          <div class="flex items-center mb-6">
            <input
              type="checkbox"
              id="useForSubsequent"
              class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              ?checked="${passwordModal.useForSubsequent}"
              @change="${updateCheckbox}"
            />
            <label for="useForSubsequent" class="ml-2 block text-sm text-gray-700">
              Use this password for subsequent files
            </label>
          </div>

          <div class="flex justify-end space-x-3">
            <button
              @click="${handlePasswordSkip}"
              class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium text-sm transition"
            >
              Skip File
            </button>
            <button
              @click="${handlePasswordSubmit}"
              class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm transition"
            >
              Decrypt & Extract
            </button>
          </div>
        </div>
      </div>
    `;
  };

  const renderParserListModal = () => {
    const builtInParsersHtml = BUILT_IN_PARSERS.map((parser, idx) => {
      const id = `builtin-${idx}`;
      const name = parser.name;
      const matches = parser.matches;
      const metaRegex = parser.metadata;
      const table = parser.table;
      const isExpanded = expandedParsers[id];

      return html`
        <li class="border rounded-lg p-3 bg-gray-50">
          <div class="flex justify-between items-center">
            <div>
              <span class="font-bold text-gray-800 block">${name}</span>
              <span class="text-xs text-gray-500">Matches: ${matches.join(
                ", ",
              )}</span>
            </div>
            <button
              @click="${() =>
                dispatchParser({ type: "TOGGLE_EXPAND_PARSER", payload: id })}"
              class="text-blue-600 hover:text-blue-800 text-xs font-semibold px-2 py-1 border border-blue-200 rounded hover:bg-blue-50 transition"
            >
              ${isExpanded ? "Hide Regex" : "Show Regex"}
            </button>
          </div>
          ${isExpanded
            ? html`
              <div
                class="mt-3 text-xs font-mono bg-white p-2 rounded border border-gray-200 regex-scroll overflow-x-auto"
              >
                <div class="mb-2">
                  <strong class="text-purple-700">Metadata Regex:</strong><br />
                  <span class="text-gray-700">${metaRegex
                    ? metaRegex.toString()
                    : "N/A"}</span>
                </div>
                <div>
                  <strong class="text-teal-700">Table Regex:</strong><br />
                  <span class="text-gray-700">${table
                    ? table.toString()
                    : "N/A"}</span>
                </div>
              </div>
            `
            : html`

            `}
        </li>
      `;
    });

    const customParsersHtml = customParsers.length > 0
      ? html`
        <h4 class="text-sm font-bold text-gray-500 uppercase tracking-wide mb-2 mt-6">
          Custom Parsers
        </h4>
        <ul class="space-y-2">
          ${customParsers.map((parser, idx) => {
            const id = `custom-${idx}`;
            const isExpanded = expandedParsers[id];
            console.log(parser);

            return html`
              <li class="border rounded-lg p-3 bg-indigo-50 border-indigo-100">
                <div class="flex justify-between items-center">
                  <div>
                    <span class="font-bold text-indigo-900 block">${parser
                      .name}</span>
                    <span class="text-xs text-indigo-600">Matches: ${parser
                      .matches.join(", ")}</span>
                  </div>
                  <button
                    @click="${() =>
                      dispatchParser({
                        type: "TOGGLE_EXPAND_PARSER",
                        payload: id,
                      })}"
                    class="text-indigo-600 hover:text-indigo-800 text-xs font-semibold px-2 py-1 border border-indigo-200 rounded hover:bg-indigo-100 transition"
                  >
                    ${isExpanded ? "Hide Regex" : "Show Regex"}
                  </button>
                </div>
                ${isExpanded
                  ? html`
                    <div
                      class="mt-3 text-xs font-mono bg-white p-2 rounded border border-gray-200 regex-scroll overflow-x-auto"
                    >
                      <div class="mb-2">
                        <strong class="text-purple-700">Metadata Regex:</strong><br />
                        <span class="text-gray-700">${parser.metadata ||
                          "N/A"}</span>
                      </div>
                      <div>
                        <strong class="text-teal-700">Table Regex:</strong><br />
                        <span class="text-gray-700">${parser.table ||
                          "N/A"}</span>
                      </div>
                    </div>
                  `
                  : html`

                  `}
              </li>
            `;
          })}
        </ul>
      `
      : html`

      `;

    return html`
      <div class="fixed inset-0 z-50 flex items-center justify-center modal-backdrop">
        <div
          class="bg-white rounded-lg shadow-xl p-6 w-full max-w-3xl mx-4 flex flex-col max-h-[90vh]"
        >
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-xl font-bold text-gray-800">Available Parsers</h3>
            <button
              @click="${() =>
                dispatchParser({ type: "TOGGLE_LIST_MODAL", payload: false })}"
              class="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>

          <div class="flex-grow overflow-y-auto pr-2">
            <h4 class="text-sm font-bold text-gray-500 uppercase tracking-wide mb-2">
              Built-in Parsers
            </h4>
            <ul class="space-y-2 mb-6">
              ${builtInParsersHtml}
            </ul>

            ${customParsersHtml}
          </div>

          <div class="mt-4 pt-4 border-t flex justify-end">
            <button
              @click="${() =>
                dispatchParser({ type: "TOGGLE_LIST_MODAL", payload: false })}"
              class="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium text-sm transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    `;
  };

  const renderTemplatesModal = () => {
    const saveTemplates = () => {
      /** @type {string} */
      // @ts-ignore
      const raw = document.querySelector("#templatesTextarea").value;
      let blocks = [];
      if (raw.includes("---")) {
        blocks = raw.split("---");
      } else {
        blocks = raw.split(/\n\s*\n/);
      }

      /** @type {Parser[]}*/
      const newParsers = [];
      for (const block of blocks) {
        const cleanBlock = block.trim();
        if (!cleanBlock) continue;
        const data = parseConfigBlock(cleanBlock);

        if (data.name && data.matches) {
          newParsers.push({
            name: data.name,
            matches: data.matches
              .split(",")
              .map((/** @type {string} */ s) => s.trim())
              .filter((/** @type {string | any[]} */ s) => s.length > 0),
            metadata: data.metadata || "",
            table: data.table || "",
          });
        }
      }

      dispatchParser({ type: "UPDATE_PARSERS", payload: newParsers });
      dispatchParser({ type: "TOGGLE_TEMPLATES_MODAL", payload: false });
      dispatchParser({ type: "SET_TEMPLATES_TEXT", payload: "" });
      setStatus({
        message: `Updated ${newParsers.length} custom parsers.`,
        type: "success",
      });
    };

    return html`
      <div class="fixed inset-0 z-50 flex items-center justify-center modal-backdrop">
        <div
          class="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]"
        >
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-xl font-bold text-gray-800">Manage All Custom Parsers</h3>
            <button
              @click="${() =>
                dispatchParser({
                  type: "TOGGLE_TEMPLATES_MODAL",
                  payload: false,
                })}"
              class="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>
          <p class="text-sm text-gray-600 mb-4">
            Edit all parsers below or paste a list to import multiple. Separate
            parsers with <code class="font-mono">---</code> or two blank lines.
          </p>

          <textarea
            id="templatesTextarea"
            class="flex-grow w-full border border-gray-300 rounded-lg p-3 font-mono text-xs mb-4 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            rows="15"
            .value="${templatesText}"
            @input="${(/** @type {InputEvent} */ e) =>
              dispatchParser({
                type: "SET_TEMPLATES_TEXT",
                // @ts-ignore we know this works
                payload: e.target.value,
              })}"
          ></textarea>

          <div class="flex justify-end space-x-3">
            <button
              @click="${() =>
                dispatchParser({
                  type: "TOGGLE_TEMPLATES_MODAL",
                  payload: false,
                })}"
              class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium text-sm transition"
            >
              Cancel
            </button>
            <button
              @click="${saveTemplates}"
              class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm transition"
            >
              Save All Changes
            </button>
          </div>
        </div>
      </div>
    `;
  };

  // --- Main Render Function (Lit-HTML Template) ---
  return html`
    <div
      class="container mx-auto bg-white shadow-xl rounded-xl p-6 md:p-10 relative"
    >
      <h1 class="text-3xl font-extrabold text-blue-800 mb-2">
        Universal Data Extractor
      </h1>
      <p class="text-gray-600 mb-6">
        Supports <strong>GST</strong>, <strong>Income Tax</strong>, and various
        <strong>Bank Statements</strong>.
        <br>Drag & drop PDFs or define your own <strong>Custom Parser</strong>
        below.
      </p>

      ${renderParserForm()}

      <div class="mb-6 flex flex-col md:flex-row justify-between items-end gap-4">
        <div class="w-full md:w-1/2">
          <label class="block text-sm font-medium text-gray-700 mb-1">
            Processing Mode (Parser Selection)
          </label>
          <select
            class="w-full border border-gray-300 rounded-lg p-2 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            .value="${selectedParser}"
            @change="${(/** @type {Event} */ e) =>
              dispatchParser({
                type: "SET_SELECTED_PARSER",
                // @ts-ignore
                payload: e.target.value,
              })}"
          >
            <option value="auto">Auto-detect (Default)</option>
            ${allParsers.map((p) =>
              html`
                <option value="${p.name}">${p.name}</option>
              `
            )}
          </select>
          <p class="text-xs text-gray-500 mt-1">
            "Auto" checks all parsers. Select a specific one to force it for all
            files.
          </p>
        </div>

        <button
          @click="${() =>
            dispatchParser({ type: "TOGGLE_LIST_MODAL", payload: true })}"
          class="text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-2 px-4 rounded-lg shadow flex items-center transition h-10"
        >
          <span>ℹ️ Show Available Parsers</span>
        </button>
      </div>

      <!-- Drop Zone -->
      <drop-zone @file-selected="${handleFileInput}"></drop-zone>

      <!-- Status Container -->
      ${renderStatus()}

      <!-- Results Display -->
      ${isResultVisible
        ? html`
          <div>
            <h2 class="text-2xl font-semibold text-gray-700 mb-4 border-b pb-2">
              Extracted Data
            </h2>

            <div
              class="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg"
            >
              <p class="text-sm font-medium text-yellow-800 mb-3 md:mb-0">
                <span class="font-bold">Instructions:</span> Toggle metadata checkboxes to
                add columns dynamically.
              </p>
              <div class="flex flex-col flex-wrap gap-2 w-full md:w-auto">
                <div>
                  <input
                    id="isTableVisible"
                    class="nd-switch"
                    type="checkbox"
                    ?checked="${isTableVisible}"
                    @click="${() => setIsTableVisible(!isTableVisible)}"
                  />
                  <label for="isTableVisible">Show Details</label>
                </div>
                <div>
                  <input
                    id="isConsolidatedVisible"
                    class="nd-switch"
                    type="checkbox"
                    ?checked="${isConsolidatedVisible}"
                    @click="${() =>
                      setIsConsolidatedVisible(!isConsolidatedVisible)}"
                  />
                  <label for="isConsolidatedVisible">Show Summary Table</label>
                </div>
                <button
                  @click="${() => copyTable("outputTable")}"
                  class="flex-shrink-0 w-full md:w-auto px-4 py-2 bg-green-500 text-white font-bold rounded-lg shadow hover:bg-green-600 transition"
                >
                  Copy Details
                </button>
              </div>
            </div>

            <!-- Consolidated Summary -->
            ${when(
              isConsolidatedVisible || consolidatedTables.length === 0,
              () => renderConsolidatedSummary(consolidatedTables, copyTable),
            )}

            <!-- Detailed Table -->
            ${when(isTableVisible, () =>
              renderDetailedTable(
                documents,
                selectedMetaCols,
                toggleMetaColumn,
              ), () =>
              html`
                <div class="p-8 text-center text-gray-500 border rounded-lg bg-white mt-6">
                  The extracted data table is currently hidden.
                </div>
              `)}

            <!-- Raw Text Display -->
            <div class="mt-8">
              <div class="flex justify-between items-center mb-2">
                <h3 class="text-xl font-medium text-gray-700">
                  Raw Extracted Text (For Debugging)
                </h3>
                <button
                  @click="${() => setIsRawTextVisible(!isRawTextVisible)}"
                  class="px-3 py-1 text-sm text-white font-bold rounded shadow transition ${isRawTextVisible
                    ? "bg-blue-500 hover:bg-blue-600"
                    : "bg-gray-500 hover:bg-gray-600"}"
                >
                  ${isRawTextVisible ? "Hide Raw Text" : "Show Raw Text"}
                </button>
              </div>

              ${when(isRawTextVisible, () =>
                html`
                  <div class="space-y-4">
                    ${documents.map((item) =>
                      html`
                        <div class="border rounded-lg p-3 bg-gray-50">
                          <div class="flex justify-between items-center mb-2">
                            <span class="font-bold text-sm text-gray-700"
                            >SOURCE: ${item.fileName} (${item.docType})</span>
                            <a
                              href="https://regex101.com/?testString=${encodeURIComponent(
                                item.rawText,
                              )}"
                              target="_blank"
                              class="px-2 py-1 bg-purple-600 text-white text-xs font-bold rounded hover:bg-purple-700 transition"
                            >
                              Test in Regex101
                            </a>
                          </div>
                          <pre
                            class="bg-white p-3 rounded border text-xs overflow-auto max-h-64"
                          >${item.rawText}</pre>
                        </div>
                      `
                    )}
                  </div>
                `, () =>
                html`
                  <div class="p-4 bg-gray-50 border rounded text-xs text-gray-500 italic">
                    Raw text hidden.
                  </div>
                `)}
            </div>
          </div>
        `
        : html`

        `}
    </div>

    <!-- Modals -->
    ${when(
      passwordModal.isOpen,
      () => renderPasswordModal(),
    )}
    <!-- Seperator -->
    ${when(
      isTemplatesModalVisible,
      () => renderTemplatesModal(),
    )}
    <!-- Seperator -->
    ${when(
      isParserListModalVisible,
      () => renderParserListModal(),
    )}
  `;
}

// Register the Web Component
// @ts-ignore
customElements.define("app-root", component(App, { useShadowDOM: false }));
