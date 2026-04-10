import { html, render, when, classMap } from "/vendor/lit-html.js";
import {
  component,
  useCallback,
  useMemo,
  useReducer,
  useRef,
  useState,
  useEffect,
} from "/vendor/haunted.js";
import "/components/drop-zone.js";
import "/components/app-layout.js";
import { adwCard, adwGroup, adwRow } from "/components/ui.js";

/**
 * @typedef {Object} FormField
 * @property {string} id
 * @property {string} type - 'text' | 'checkbox' | 'radio'
 * @property {string} label
 * @property {boolean} [isRequired]
 * @property {string[]} [options]
 * @property {string} [condition]
 * @property {any} [originalValue]
 */

/**
 * @typedef {Object} FormSection
 * @property {string} id
 * @property {string} title
 * @property {number} level
 * @property {FormField[]} fields
 * @property {boolean} isNA
 * @property {boolean} hasNAToggle
 */

/**
 * @typedef {Object} AppState
 * @property {string} rawText
 * @property {Object} formData
 * @property {number} currentStep
 * @property {Object} errors
 */

const DEFAULT_MARKDOWN = `# Setup -
Project Name*:
Category: Design / Dev / Marketing

# Details -
[Design Only] Moodboard URL:
[Dev Only] Repo URL:
Comments:

# Confirmation
- [ ] I agree to terms`;

const initialState = {
  rawText: localStorage.getItem("md_engine_text") || DEFAULT_MARKDOWN,
  formData: JSON.parse(localStorage.getItem("md_engine_data") || "{}"),
  currentStep: 0,
  errors: {},
};

function appReducer(state, action) {
  switch (action.type) {
    case "SET_RAW_TEXT":
      return { ...state, rawText: action.payload, currentStep: 0, errors: {} };
    case "UPDATE_FIELD":
      return {
        ...state,
        formData: { ...state.formData, [action.payload.id]: action.payload.value },
        errors: { ...state.errors, [action.payload.id]: false },
      };
    case "SET_STEP":
      return { ...state, currentStep: action.payload, errors: {} };
    case "SET_SECTION_NA":
      return {
        ...state,
        formData: { ...state.formData, [action.payload.id]: action.payload.value },
      };
    case "SET_ERRORS":
      return { ...state, errors: action.payload };
    case "RESET":
      return { ...initialState, rawText: DEFAULT_MARKDOWN, formData: {}, currentStep: 0 };
    default:
      return state;
  }
}

/**
 * Parses Markdown into a Form Schema
 * @param {string} rawText 
 * @returns {FormSection[]}
 */
function parseMarkdown(rawText) {
  const lines = rawText.split("\n");
  const schema = [];
  let currentSection = null;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    if (trimmed.startsWith("#")) {
      const level = (trimmed.match(/^#+/) || ["#"])[0].length;
      const hasDashSuffix = trimmed.endsWith("-") || trimmed.match(/- \[([ xX])\]$/);
      const naMatch = trimmed.match(/- \[([ xX])\]$/);
      const isNA = naMatch ? naMatch[1].toLowerCase() === "x" : false;
      
      const title = trimmed
        .replace(/^#+\s*/, "")
        .replace(/\s*- \[([ xX])\]$/, "")
        .replace(/\s*-$/, "");

      currentSection = {
        id: `sec-${index}`,
        title,
        level,
        fields: [],
        isNA,
        hasNAToggle: !!hasDashSuffix,
      };
      schema.push(currentSection);
      return;
    }

    const target = currentSection ? currentSection.fields : null;
    if (!target) return;

    if (trimmed.match(/^[-*]\s*\[([ xX])\]/)) {
      const label = trimmed.replace(/^[-*]\s*\[([ xX])\]\s*/, "");
      target.push({
        type: "checkbox",
        label,
        id: `field-${index}`,
        originalValue: trimmed.toLowerCase().includes("[x]"),
      });
    } else if (trimmed.includes(":")) {
      let [label, optPart] = trimmed.split(":").map((s) => s.trim());
      const isRequired = label.endsWith("*");
      const conditionMatch = label.match(/^\[(.*?)\]/);
      const condition = conditionMatch ? conditionMatch[1] : null;
      label = label.replace(/^\[.*?\]\s*/, "").replace(/\*$/, "");

      if (!optPart) {
        target.push({
          type: "text",
          label,
          id: `field-${index}`,
          isRequired,
          condition,
        });
      } else if (optPart.includes("/")) {
        target.push({
          type: "radio",
          label,
          options: optPart.split("/").map((s) => s.trim()),
          id: `field-${index}`,
          isRequired,
          condition,
        });
      }
    }
  });
  return schema;
}

function FormField({ field, value, error, onUpdate }) {
  if (field.type === "checkbox") {
    return adwRow(field.label, null, html`
      <input
        type="checkbox"
        class="nd-switch"
        .checked="${value ?? field.originalValue}"
        @change="${(e) => onUpdate(field.id, e.target.checked)}"
      >
    `);
  }

  if (field.type === "text") {
    return html`
      <div class="p-3 space-y-2">
        <label class="block text-sm font-bold text-slate-700">
          ${field.label} ${field.isRequired ? html`<span class="text-red-500">*</span>` : ""}
        </label>
        <input
          type="text"
          class="w-full ${classMap({ 'border-red-500 ring-1 ring-red-500': error })}"
          placeholder="Enter ${field.label.toLowerCase()}..."
          .value="${value || ""}"
          @input="${(e) => onUpdate(field.id, e.target.value)}"
        >
        ${error ? html`<p class="text-xs text-red-500 font-bold">This field is required</p>` : ""}
      </div>
    `;
  }

  if (field.type === "radio") {
    return html`
      <div class="p-3 space-y-2">
        <label class="block text-sm font-bold text-slate-700">${field.label}</label>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          ${field.options.map(opt => html`
            <label class="flex items-center gap-3 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors ${classMap({ 
              'bg-blue-50 border-blue-200 ring-1 ring-blue-200': value === opt
            })}">
              <input
                type="radio"
                name="${field.id}"
                class="w-4 h-4 text-blue-600"
                .checked="${value === opt}"
                @change="${() => onUpdate(field.id, opt)}"
              >
              <span class="text-sm font-medium text-slate-700">${opt}</span>
            </label>
          `)}
        </div>
      </div>
    `;
  }
  return html``;
}

function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [showEditor, setShowEditor] = useState(true);

  const formSchema = useMemo(() => parseMarkdown(state.rawText), [state.rawText]);

  useEffect(() => {
    localStorage.setItem("md_engine_text", state.rawText);
    localStorage.setItem("md_engine_data", JSON.stringify(state.formData));
  }, [state.rawText, state.formData]);

  const checkCondition = (condition) => {
    if (!condition) return true;
    return Object.values(state.formData).some((val) => val === condition);
  };

  const validateStep = (stepIdx) => {
    const section = formSchema[stepIdx];
    if (!section || (state.formData[section.id] ?? section.isNA)) return true;
    
    const newErrors = {};
    let hasError = false;
    section.fields.forEach((f) => {
      if (f.isRequired && !state.formData[f.id] && checkCondition(f.condition)) {
        newErrors[f.id] = true;
        hasError = true;
      }
    });
    dispatch({ type: "SET_ERRORS", payload: newErrors });
    return !hasError;
  };

  const handleExport = () => {
    if (!validateStep(state.currentStep)) return;
    
    let md = "";
    formSchema.forEach((item) => {
      const na = state.formData[item.id] ?? item.isNA;
      md += `${"#".repeat(item.level)} ${item.title}${item.hasNAToggle ? ` - [${na ? "x" : " "}]` : ""}\n`;
      if (!na) {
        item.fields.forEach((f) => {
          if (!checkCondition(f.condition)) return;
          const val = state.formData[f.id];
          if (f.type === "checkbox") {
            md += `- [${(val ?? f.originalValue) ? "x" : " "}] ${f.label}\n`;
          } else if (f.type === "text") {
            md += `${f.label}: ${val || ""}\n`;
          } else if (f.type === "radio") {
            md += `${f.label}: ${val || "None"}\n`;
          }
        });
      }
      md += "\n";
    });

    const blob = new Blob([md.trim()], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "form-result.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  const currentSection = formSchema[state.currentStep];

  return html`
    <app-layout title="Markdown Form Engine">
      <div class="flex flex-col lg:flex-row gap-8 items-start">
        
        <!-- Editor Column -->
        ${when(showEditor, () => html`
          <div class="w-full lg:w-1/2 space-y-4">
            ${adwGroup("Markdown Editor", adwCard(html`
              <textarea
                class="w-full h-[600px] p-6 font-mono text-sm border-none bg-transparent outline-none resize-none leading-relaxed"
                .value="${state.rawText}"
                @input="${(e) => dispatch({ type: "SET_RAW_TEXT", payload: e.target.value })}"
                spellcheck="false"
              ></textarea>
              <div class="p-4 border-t bg-slate-50">
                <drop-zone @file-loaded="${(e) => dispatch({ type: "SET_RAW_TEXT", payload: e.detail })}"></drop-zone>
              </div>
            `))}
          </div>
        `)}

        <!-- Form Column -->
        <div class="w-full ${showEditor ? "lg:w-1/2" : "max-w-3xl mx-auto"} space-y-6">
          <div class="flex items-center justify-between px-2">
             <h2 class="text-xs font-bold text-slate-400 uppercase tracking-widest">Live Form</h2>
             <div class="flex items-center gap-2">
                ${formSchema.map((_, i) => html`
                  <div class="w-2 h-2 rounded-full transition-all duration-300 ${classMap({ 
                    'bg-blue-600 scale-125': i === state.currentStep,
                    'bg-slate-300': i !== state.currentStep
                  })}"></div>
                `)}
             </div>
          </div>

          ${when(currentSection, () => html`
            <div class="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              ${adwGroup(`${currentSection.title} (Step ${state.currentStep + 1}/${formSchema.length})`, adwCard(html`
                ${when(currentSection.hasNAToggle, () => adwRow("Section Active", "Toggle to skip this entire section", html`
                  <input
                    type="checkbox"
                    class="nd-switch"
                    .checked="${!(state.formData[currentSection.id] ?? currentSection.isNA)}"
                    @change="${(e) => dispatch({ type: "SET_SECTION_NA", payload: { id: currentSection.id, value: !e.target.checked } })}"
                  >
                `))}

                ${when(!(state.formData[currentSection.id] ?? currentSection.isNA), () => html`
                  <div class="divide-y divide-slate-100 bg-white">
                    ${currentSection.fields.map(f => {
                      if (!checkCondition(f.condition)) return null;
                      return FormField({
                        field: f,
                        value: state.formData[f.id],
                        error: state.errors[f.id],
                        onUpdate: (id, value) => dispatch({ type: "UPDATE_FIELD", payload: { id, value } })
                      });
                    })}
                  </div>
                `, () => html`
                  <div class="p-12 text-center bg-slate-50/50">
                    <p class="text-sm font-medium text-slate-400 italic">This section is currently skipped.</p>
                  </div>
                `)}
              `))}

              <div class="flex justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <button
                  class="btn btn-secondary !rounded-xl px-6"
                  ?disabled="${state.currentStep === 0}"
                  @click="${() => dispatch({ type: "SET_STEP", payload: state.currentStep - 1 })}"
                >Back</button>
                
                <div class="flex gap-2">
                   <button class="btn btn-flat" @click="${() => dispatch({ type: "RESET" })}">Reset</button>
                   ${when(state.currentStep < formSchema.length - 1, () => html`
                     <button
                        class="btn btn-primary !rounded-xl px-10"
                        @click="${() => validateStep(state.currentStep) && dispatch({ type: "SET_STEP", payload: state.currentStep + 1 })}"
                      >Next</button>
                   `, () => html`
                     <button
                        class="btn btn-primary !rounded-xl px-10 !bg-green-600 hover:!bg-green-700"
                        @click="${handleExport}"
                      >Finish & Export</button>
                   `)}
                </div>
              </div>
            </div>
          `, () => html`
            <div class="p-20 text-center adw-card bg-slate-50 border-dashed">
              <p class="text-slate-400 font-medium">Add Markdown headers to start building your form.</p>
            </div>
          `)}
        </div>
      </div>

      <div slot="utility">
        ${adwGroup("Settings", adwCard(html`
          ${adwRow("Show Editor", "Split view for real-time editing.", html`
            <input
              type="checkbox"
              class="nd-switch"
              ?checked="${showEditor}"
              @change="${(e) => setShowEditor(e.target.checked)}"
            >
          `)}
        `))}

        <div class="p-4 bg-blue-50 rounded-2xl border border-blue-100 mt-6">
          <h3 class="text-xs font-bold text-blue-700 uppercase tracking-widest mb-2">Editor Guide</h3>
          <ul class="text-[11px] text-blue-600 space-y-2 leading-relaxed font-medium">
            <li>• <code class="bg-white/50 px-1 rounded"># Section</code> creates a new step</li>
            <li>• <code class="bg-white/50 px-1 rounded">Label:</code> creates a text input</li>
            <li>• <code class="bg-white/50 px-1 rounded">Label*:</code> makes it required</li>
            <li>• <code class="bg-white/50 px-1 rounded">Opt 1 / Opt 2</code> creates radio buttons</li>
            <li>• <code class="bg-white/50 px-1 rounded">- [ ]</code> creates a checkbox</li>
            <li>• <code class="bg-white/50 px-1 rounded">[Value] Label:</code> conditional visibility</li>
          </ul>
        </div>
      </div>
    </app-layout>
  `;
}

customElements.define("md-form-app", component(App, { useShadowDOM: false }));
