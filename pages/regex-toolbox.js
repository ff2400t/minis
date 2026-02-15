import { html, render, nothing } from "/vendor/lit-html.js";
import {
  component,
  useState,
  useMemo,
  useEffect,
} from "/vendor/haunted.js";

const STORAGE_KEY = "regex_toolbox_state_v2";

const SAMPLES = [
  { 
    label: "Date (YYYY-MM-DD)", 
    regex: "(\\d{4})-(\\d{2})-(\\d{2})", 
    flags: "g", 
    substitution: "$3/$2/$1",
    testCases: [
        { text: "Today is 2026-02-15", expected: true },
        { text: "Invalid date 26-02-15", expected: false },
        { text: "2025-12-31", expected: true }
    ]
  },
  { 
    label: "Email Address", 
    regex: "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}", 
    flags: "g", 
    substitution: "",
    testCases: [
        { text: "support@example.com", expected: true },
        { text: "invalid-email", expected: false },
        { text: "user.name+tag@company.org", expected: true }
    ]
  },
  { 
    label: "Lookbehind (Modern)", 
    regex: "(?<=\\$)\\d+", 
    flags: "g", 
    substitution: "PRICE",
    testCases: [
        { text: "The total is $100", expected: true },
        { text: "I have 100 apples", expected: false }
    ]
  },
  { 
    label: "Named Groups", 
    regex: "(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})", 
    flags: "g", 
    substitution: "$<day>/$<month>/$<year>",
    testCases: [
        { text: "2026-02-15", expected: true }
    ]
  }
];

const REGEX_TOKENS = [
  { name: 'escape', re: /\\./g, color: 'text-orange-500 font-bold' },
  { name: 'class', re: /\[(?:\\.|[^\]])*\]/g, color: 'text-emerald-600' },
  { name: 'group', re: /\((?:\?[:=!<>]+)?|\)/g, color: 'text-blue-500 font-bold' },
  { name: 'quantifier', re: /[\*\+\?](?:\?)?|\{\d+(?:,\d*)?\}\??/g, color: 'text-purple-500 font-bold' },
  { name: 'anchor', re: /\^|\$|\\b|\\B/g, color: 'text-red-500 font-bold' },
  { name: 'alternation', re: /\|/g, color: 'text-pink-500 font-bold' },
];

const JS_TOKENS = [
  { name: 'comment', re: /\/\/.*/g, color: 'text-slate-400 italic' },
  { name: 'string', re: /`[^`]*`|'[^']*'|"[^"]*"/g, color: 'text-emerald-600' },
  { name: 'keyword', re: /\b(const|let|var|if|else|while|for|return|new|function|console)\b/g, color: 'text-blue-600 font-bold' },
  { name: 'regex', re: /\/.*\/[gimuy]*/g, color: 'text-orange-600' },
  { name: 'number', re: /\b\d+\b/g, color: 'text-amber-600' },
  { name: 'method', re: /\.\w+\(/g, color: 'text-indigo-600' },
];

function highlight(text, tokens) {
  if (!text) return "";
  let matches = [];
  tokens.forEach(token => {
    let m;
    token.re.lastIndex = 0;
    while ((m = token.re.exec(text)) !== null) {
      if (m[0].length === 0) { token.re.lastIndex++; continue; }
      matches.push({ start: m.index, end: m.index + m[0].length, color: token.color, text: m[0] });
    }
  });
  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  let filtered = [];
  let lastEnd = 0;
  for (let m of matches) {
    if (m.start >= lastEnd) {
      filtered.push(m);
      lastEnd = m.end;
    }
  }
  let result = [];
  lastEnd = 0;
  for (let m of filtered) {
    if (m.start > lastEnd) result.push(text.slice(lastEnd, m.start));
    result.push(html`<span class="${m.color}">${m.text}</span>`);
    lastEnd = m.end;
  }
  if (lastEnd < text.length) result.push(text.slice(lastEnd));
  return result;
}

function RegexToolbox() {
  const [regexStr, setRegexStr] = useState("(\\d{4})-(\\d{2})-(\\d{2})");
  const [flags, setFlags] = useState("g");
  const [testCases, setTestCases] = useState([
    { id: Date.now(), text: "Today is 2026-02-15", expected: true }
  ]);
  const [activeId, setActiveId] = useState(null);
  const [substitution, setSubstitution] = useState("$3/$2/$1");
  const [error, setError] = useState(null);
  const [copyStatus, setCopyStatus] = useState(null);
  const [showSnippet, setShowSnippet] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [autoRun, setAutoRun] = useState(true);
  const [debouncedState, setDebouncedState] = useState({ r: regexStr, f: flags, tcs: testCases });

  // Load state
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const { r, f, tcs, s, ar } = JSON.parse(saved);
        if (r !== undefined) setRegexStr(r);
        if (f !== undefined) setFlags(f);
        if (tcs !== undefined) setTestCases(tcs);
        if (s !== undefined) setSubstitution(s);
        if (ar !== undefined) setAutoRun(ar);
      } catch (e) {}
    }
  }, []);

  // Save state
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ r: regexStr, f: flags, tcs: testCases, s: substitution, ar: autoRun }));
  }, [regexStr, flags, testCases, substitution, autoRun]);

  // Throttling
  useEffect(() => {
    if (!autoRun) return;
    const timer = setTimeout(() => {
        setDebouncedState({ r: regexStr, f: flags, tcs: testCases });
    }, 300);
    return () => clearTimeout(timer);
  }, [regexStr, flags, testCases, autoRun]);

  const testResults = useMemo(() => {
    const { r, f, tcs } = autoRun ? debouncedState : { r: regexStr, f: flags, tcs: testCases };
    if (!r) return [];
    try {
        const re = new RegExp(r, f);
        setError(null);
        return tcs.map(tc => {
            const matches = [];
            let match;
            const reClone = new RegExp(r, f);
            if (f.includes('g')) {
                let lastLastIndex = -1;
                while ((match = reClone.exec(tc.text)) !== null) {
                    matches.push(match);
                    if (reClone.lastIndex === lastLastIndex) reClone.lastIndex++;
                    lastLastIndex = reClone.lastIndex;
                }
            } else {
                match = reClone.exec(tc.text);
                if (match) matches.push(match);
            }
            return { id: tc.id, matches, passed: (matches.length > 0) === tc.expected };
        });
    } catch (e) {
        setError(e.message);
        return tcs.map(tc => ({ id: tc.id, matches: [], passed: false }));
    }
  }, [debouncedState, regexStr, flags, testCases, autoRun]);

  const activeTestCase = useMemo(() => {
    const currentId = activeId || (testCases.length > 0 ? testCases[0].id : null);
    return testCases.find(tc => tc.id === currentId);
  }, [activeId, testCases]);

  const activeResult = useMemo(() => {
    return testResults.find(tr => tr.id === (activeTestCase ? activeTestCase.id : null));
  }, [testResults, activeTestCase]);

  const highlightedActive = useMemo(() => {
    if (!activeTestCase || !activeResult || error || !regexStr || activeResult.matches.length === 0) 
        return activeTestCase ? activeTestCase.text : "";
    let output = [];
    let lastIndex = 0;
    activeResult.matches.forEach((match, i) => {
      output.push(activeTestCase.text.slice(lastIndex, match.index));
      output.push(html`<span class="match-highlight" title="Match ${i + 1}">${match[0]}</span>`);
      lastIndex = match.index + match[0].length;
    });
    output.push(activeTestCase.text.slice(lastIndex));
    return output;
  }, [activeTestCase, activeResult, error, regexStr]);

  const replacedActive = useMemo(() => {
    if (!activeTestCase || error || !regexStr) return activeTestCase ? activeTestCase.text : "";
    try {
      const re = new RegExp(regexStr, flags);
      return activeTestCase.text.replace(re, substitution);
    } catch (e) {
      return activeTestCase ? activeTestCase.text : "";
    }
  }, [activeTestCase, regexStr, flags, substitution, error]);

  const snippet = useMemo(() => {
    const r = regexStr;
    const f = flags;
    const t = activeTestCase ? activeTestCase.text : "";
    if (!r) return "";
    return `const regex = /${r}/${f};
const str = \`${t.replace(/`/g, '\\`').replace(/\${/g, '\\${')}\`;
let m;

while ((m = regex.exec(str)) !== null) {
    if (m.index === regex.lastIndex) regex.lastIndex++;
    m.forEach((match, groupIndex) => {
        console.log(\`Found match, group \${groupIndex}: \${match}\`);
    });
}`;
  }, [regexStr, flags, activeTestCase]);

  const handleSampleChange = (e) => {
    const sample = SAMPLES.find(s => s.label === e.target.value);
    if (sample) {
      setRegexStr(sample.regex);
      setFlags(sample.flags);
      setSubstitution(sample.substitution || "");
      setTestCases(sample.testCases.map(tc => ({ ...tc, id: Math.random() + Date.now() })));
    }
  };

  const addTestCase = () => {
    const newTc = { id: Date.now(), text: "", expected: true };
    setTestCases([...testCases, newTc]);
    setActiveId(newTc.id);
  };

  const updateTestCase = (id, updates) => {
    setTestCases(testCases.map(tc => tc.id === id ? { ...tc, ...updates } : tc));
  };

  const removeTestCase = (id) => {
    setTestCases(testCases.filter(tc => tc.id !== id));
    if (activeId === id) setActiveId(null);
  };

  const copyToClipboard = (text, type) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopyStatus(type);
      setTimeout(() => setCopyStatus(null), 2000);
    });
  };

  const colors = [
    'bg-blue-100 text-blue-800 border-blue-200',
    'bg-green-100 text-green-800 border-green-200',
    'bg-pink-100 text-pink-800 border-pink-200',
    'bg-purple-100 text-purple-800 border-purple-200',
    'bg-orange-100 text-orange-800 border-orange-200',
  ];

  return html`
    <div class="max-w-screen-2xl mx-auto p-2 space-y-3 pb-4">
      <!-- HEADER & INPUTS -->
      <div class="card p-3 space-y-3 shadow-sm border-slate-200">
        <div class="flex justify-between items-center border-b border-slate-100 pb-2">
            <div class="flex items-center gap-4">
                <h2 class="text-md font-bold text-slate-800">RegEx Toolbox <span class="text-xs font-normal text-slate-400">Unit Test Mode</span></h2>
                <div class="flex items-center gap-2 bg-slate-100 px-2 py-1 rounded-md">
                    <label class="text-[10px] font-bold text-slate-500 uppercase cursor-pointer select-none flex items-center gap-1">
                        <input type="checkbox" .checked=${autoRun} @change=${(e) => setAutoRun(e.target.checked)} class="w-3 h-3">
                        Auto-run
                    </label>
                    ${!autoRun ? html`
                        <button @click=${() => setDebouncedState({ r: regexStr, f: flags, tcs: testCases })} class="btn btn-primary btn-sm py-0 px-2 text-[10px] h-5">Run</button>
                    ` : nothing}
                </div>
            </div>
            <div class="flex gap-2">
                <button @click=${() => setShowHelp(true)} class="btn btn-secondary btn-sm h-7 py-0 px-2 text-xs">Info</button>
                <button @click=${() => { setRegexStr(""); setFlags("g"); setTestCases([{id:Date.now(), text:"", expected:true}]); setSubstitution(""); setError(null); }} class="btn btn-secondary btn-sm h-7 py-0 px-2 text-xs text-red-600">Clear</button>
                <button @click=${() => setShowReplace(!showReplace)} class="btn btn-sm h-7 py-0 px-2 text-xs ${showReplace ? 'btn-primary' : 'btn-secondary'}">Replace</button>
                <button @click=${() => setShowSnippet(!showSnippet)} class="btn btn-sm h-7 py-0 px-2 text-xs ${showSnippet ? 'btn-primary' : 'btn-secondary'}">Snippet</button>
                <select @change=${handleSampleChange} class="btn btn-secondary btn-sm w-auto h-7 py-0 px-2 text-xs">
                    <option value="">Samples...</option>
                    ${SAMPLES.map(s => html`<option value="${s.label}">${s.label}</option>`)}
                </select>
            </div>
        </div>
        
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <!-- LEFT: PATTERN EDITOR -->
          <div class="${showReplace ? 'lg:col-span-5' : 'lg:col-span-4'} space-y-2">
            <div class="space-y-1">
              <label class="text-[10px] font-bold text-slate-500 uppercase">Pattern</label>
              <div class="flex items-center gap-1 w-full">
                <div class="relative flex-1 min-w-0">
                  <span class="absolute left-2.5 top-2 text-slate-400 font-mono text-xs">/</span>
                  <input 
                    type="text" .value=${regexStr} @input=${(e) => setRegexStr(e.target.value)}
                    class="w-full font-mono pl-5 pr-8 border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 rounded py-1.5 text-xs text-slate-900"
                    placeholder="regex pattern..." spellcheck="false"
                  >
                  <button @click=${() => copyToClipboard(regexStr, 'regex')} class="absolute right-1 top-1.5 p-1 text-slate-400 hover:text-blue-600 z-20">
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">${copyStatus === 'regex' ? html`<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />` : html`<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />`}</svg>
                  </button>
                  <span class="absolute right-6 top-2 text-slate-400 font-mono text-xs">/</span>
                </div>
                <div style="width: 60px; flex-shrink: 0;">
                  <input type="text" .value=${flags} @input=${(e) => setFlags(e.target.value)} class="w-full font-mono text-center border-slate-200 rounded py-1.5 text-xs" placeholder="flags" spellcheck="false">
                </div>
              </div>
              <div class="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded font-mono text-[10px] flex items-center overflow-hidden whitespace-nowrap shadow-inner">
                  <span class="text-slate-400 mr-1">/</span>
                  <div class="flex-1 overflow-x-auto custom-scrollbar-h pb-0.5">${highlight(regexStr, REGEX_TOKENS)}</div>
                  <span class="text-slate-400 ml-1">/${flags}</span>
              </div>
              ${error ? html`<p class="mt-1 text-[10px] text-red-600 font-medium bg-red-50 p-1.5 rounded border border-red-100 flex items-center gap-1 leading-tight"><svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>${error}</p>` : nothing}
            </div>

            ${showReplace ? html`
            <div class="card bg-blue-50/20 border-blue-100 p-2 space-y-2 animate-in slide-in-from-top-2 duration-200">
                <div class="flex justify-between items-center"><label class="text-[10px] font-bold text-slate-500 uppercase">Substitution</label></div>
                <input type="text" .value=${substitution} @input=${(e) => setSubstitution(e.target.value)} class="w-full font-mono border-blue-100 py-1 px-2 rounded text-xs bg-white" placeholder="Replacement string (e.g. $1, $2)">
                <div class="p-2 bg-white rounded border border-blue-100 font-mono text-[10px] leading-relaxed relative group min-h-[40px] max-h-[80px] overflow-y-auto custom-scrollbar shadow-inner">
                  <button @click=${() => copyToClipboard(replacedActive, 'replaced')} class="absolute right-1 top-1 opacity-0 group-hover:opacity-100 transition-opacity btn btn-secondary btn-sm p-0.5 shadow-sm"><svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">${copyStatus === 'replaced' ? html`<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />` : html`<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />`}</svg></button>
                  ${replacedActive}
                </div>
            </div>
            ` : nothing}
          </div>

          <!-- RIGHT: UNIT TEST LIST -->
          <div class="${showReplace ? 'lg:col-span-7' : 'lg:col-span-8'} flex flex-col min-h-0">
             <div class="flex justify-between items-center mb-1">
                <label class="text-[10px] font-bold text-slate-500 uppercase">Test Cases</label>
                <button @click=${addTestCase} class="text-[9px] font-bold uppercase bg-blue-50 text-blue-600 px-2 py-0.5 rounded hover:bg-blue-100 transition-colors">+ Add Case</button>
             </div>
             <div class="flex-1 overflow-y-auto max-h-[180px] lg:max-h-[220px] pr-1 custom-scrollbar space-y-1">
                ${testCases.map((tc, i) => {
                    const result = testResults.find(r => r.id === tc.id);
                    const isActive = (activeTestCase && activeTestCase.id === tc.id) || (!activeId && i === 0);
                    return html`
                        <div class="flex items-center gap-2 p-1.5 rounded border ${isActive ? 'bg-blue-50/50 border-blue-200' : 'bg-white border-slate-100'} group/item transition-all shadow-sm hover:shadow-md">
                            <div class="flex-shrink-0 cursor-pointer" @click=${() => updateTestCase(tc.id, { expected: !tc.expected })} title="Expected to ${tc.expected ? 'match' : 'not match'}">
                                <span class="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter ${tc.expected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                                    ${tc.expected ? 'Match' : 'NoM'}
                                </span>
                            </div>
                            <input type="text" .value=${tc.text} @input=${(e) => updateTestCase(tc.id, { text: e.target.value })} @focus=${() => setActiveId(tc.id)}
                                class="flex-1 bg-transparent border-none focus:ring-0 text-xs font-mono p-0" placeholder="Enter test string...">
                            
                            <div class="flex items-center gap-2 flex-shrink-0">
                                ${result ? html`
                                    <span class="text-xs ${result.passed ? 'text-green-500' : 'text-red-500'}" title="${result.passed ? 'Test Passed' : 'Test Failed'}">
                                        ${result.passed ? '✓' : '✕'}
                                    </span>
                                ` : nothing}
                                <button @click=${() => setActiveId(tc.id)} class="text-[9px] text-slate-400 hover:text-blue-600 opacity-0 group-hover/item:opacity-100 transition-opacity">Select</button>
                                <button @click=${() => removeTestCase(tc.id)} class="text-slate-300 hover:text-red-500 text-sm leading-none">&times;</button>
                            </div>
                        </div>
                    `;
                })}
             </div>
          </div>
        </div>

        ${showSnippet ? html`
          <div class="mt-2 animate-in slide-in-from-top duration-300">
             <div class="flex justify-between items-center bg-slate-800 px-3 py-1 rounded-t-lg"><span class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">JavaScript Snippet</span><button @click=${() => copyToClipboard(snippet, 'snippet')} class="text-slate-400 hover:text-white transition-colors"><svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">${copyStatus === 'snippet' ? html`<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />` : html`<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />`}</svg></button></div>
             <pre class="bg-slate-900 text-slate-300 p-2 rounded-b-lg font-mono text-[11px] overflow-x-auto border border-slate-800 max-h-[120px] custom-scrollbar shadow-inner">${highlight(snippet, JS_TOKENS)}</pre>
          </div>
        ` : nothing}
      </div>

      <!-- RESULTS PANEL -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-3 h-[calc(100vh-380px)] min-h-[250px]">
        <div class="card flex flex-col h-full shadow-sm border-slate-200 p-2">
            <h2 class="text-[10px] font-bold mb-1.5 text-slate-500 uppercase tracking-wider flex justify-between items-center border-b border-slate-50 pb-1">
                Active Match: ${activeTestCase ? activeTestCase.text.slice(0, 30) + (activeTestCase.text.length > 30 ? '...' : '') : 'None'}
                <span class="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full text-[9px]">${activeResult ? activeResult.matches.length : 0} found</span>
            </h2>
            <div class="p-3 bg-slate-50 rounded-lg border border-slate-200 font-mono text-xs whitespace-pre-wrap break-all flex-1 overflow-y-auto custom-scrollbar leading-relaxed shadow-inner">
              ${highlightedActive}
            </div>
        </div>

        <div class="card flex flex-col h-full shadow-sm border-slate-200 p-2">
          <h2 class="text-[10px] font-bold mb-1.5 text-slate-500 uppercase tracking-wider border-b border-slate-50 pb-1">Match Details</h2>
          <div class="flex-1 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
            ${!activeResult || activeResult.matches.length === 0 
              ? html`<div class="text-slate-400 italic py-10 text-center bg-slate-50 rounded-lg border border-dashed border-slate-200 text-xs">No matches in active case.</div>`
              : activeResult.matches.map((match, i) => html`
                <div class="bg-white rounded border border-slate-200 overflow-hidden hover:border-blue-200 transition-colors shadow-sm">
                  <div class="bg-slate-50 px-2 py-1 text-[9px] font-bold text-slate-500 border-b border-slate-200 flex justify-between items-center">
                    <span class="bg-blue-600 text-white px-1.5 rounded-sm">MATCH ${i + 1}</span>
                    <span class="font-mono text-slate-400">IDX ${match.index}:${match.index + match[0].length}</span>
                  </div>
                  <div class="p-2 space-y-1.5">
                    <div class="flex gap-2 items-start">
                      <span class="text-[9px] uppercase font-bold text-slate-400 mt-1 w-8 flex-shrink-0 text-right">Full</span>
                      <code class="flex-1 bg-yellow-50 text-yellow-900 px-1.5 py-0.5 rounded-sm border border-yellow-100 break-all text-[11px] shadow-sm">${match[0]}</code>
                    </div>
                    ${match.slice(1).map((group, gi) => html`
                      <div class="flex gap-2 items-start pl-2 border-l-2 border-slate-100">
                        <span class="text-[9px] uppercase font-bold text-slate-400 mt-1 w-8 flex-shrink-0 text-right">Grp ${gi + 1}</span>
                        <code class="flex-1 ${colors[gi % colors.length]} px-1.5 py-0.5 rounded-sm border break-all text-[11px] shadow-sm">
                          ${group === undefined ? html`<span class="opacity-40 italic">undef</span>` : group === "" ? html`<span class="opacity-40 italic">empty</span>` : group}
                        </code>
                      </div>
                    `)}
                    ${match.groups ? Object.entries(match.groups).map(([name, value], ni) => html`
                       <div class="flex gap-2 items-start pl-2 border-l-2 border-blue-200">
                        <span class="text-[9px] uppercase font-bold text-blue-500 mt-1 w-8 flex-shrink-0 text-right truncate">#${name}</span>
                        <code class="flex-1 bg-blue-50 text-blue-900 px-1.5 py-0.5 rounded-sm border border-blue-100 break-all text-[11px] shadow-sm">
                          ${value || html`<span class="opacity-40 italic">empty</span>`}
                        </code>
                      </div>
                    `) : nothing}
                  </div>
                </div>
              `)}
          </div>
        </div>
      </div>

      <!-- MODAL HELP -->
      ${showHelp ? html`
      <div class="modal-backdrop z-[100] animate-in fade-in duration-200">
        <div class="card w-full max-w-4xl max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200 shadow-2xl p-0 overflow-hidden">
          <div class="bg-slate-800 text-white p-5 flex justify-between items-center sticky top-0 z-10">
            <div>
                <h2 class="text-xl font-bold">Regex Mastery <span class="text-xs font-normal opacity-50 uppercase tracking-widest ml-2">Modern JS Guide</span></h2>
            </div>
            <button @click=${() => setShowHelp(false)} class="text-slate-400 hover:text-white transition-colors p-2">&times;</button>
          </div>
          
          <div class="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div class="space-y-2">
              <h3 class="font-bold text-blue-600 border-b pb-1 text-[10px] uppercase tracking-widest">Modern Features (ES2018+)</h3>
              <ul class="space-y-2 text-xs">
                <li><code class="font-bold text-slate-700">(?&lt;name&gt;...)</code><br><span class="text-slate-500">Named Capture Group</span></li>
                <li><code class="font-bold text-slate-700">\\k&lt;name&gt;</code><br><span class="text-slate-500">Backreference to named group</span></li>
                <li><code class="font-bold text-slate-700">(?&lt;=...)</code> / <code class="font-bold text-slate-700">(?&lt;!...)</code><br><span class="text-slate-500">Positive / Negative Lookbehind</span></li>
                <li><code class="font-bold text-slate-700">\\p{...}</code> / <code class="font-bold text-slate-700">\\P{...}</code><br><span class="text-slate-500">Unicode Property Escape (e.g. {Script=Greek}, {L})</span></li>
                <li><code class="font-bold text-slate-700">s</code> flag<br><span class="text-slate-500">DotAll (dot matches newlines)</span></li>
              </ul>
            </div>
            <div class="space-y-2">
              <h3 class="font-bold text-slate-800 border-b pb-1 text-[10px] uppercase tracking-widest">Lookahead & Groups</h3>
              <ul class="space-y-2 text-xs">
                <li><code class="font-bold text-slate-700">(?=...)</code><br><span class="text-slate-500">Positive Lookahead</span></li>
                <li><code class="font-bold text-slate-700">(?!...)</code><br><span class="text-slate-500">Negative Lookahead</span></li>
                <li><code class="font-bold text-slate-700">(?:...)</code><br><span class="text-slate-500">Non-capturing group</span></li>
                <li><code class="font-bold text-slate-700">(...)</code><br><span class="text-slate-500">Capturing group</span></li>
                <li><code class="font-bold text-slate-700">|</code><br><span class="text-slate-500">Alternation (OR)</span></li>
              </ul>
            </div>
            <div class="space-y-2">
              <h3 class="font-bold text-slate-800 border-b pb-1 text-[10px] uppercase tracking-widest">Quantifiers & Anchors</h3>
              <ul class="space-y-2 text-xs">
                <li><code class="font-bold text-slate-700">*?</code> / <code class="font-bold text-slate-700">+?</code><br><span class="text-slate-500">Lazy/Non-greedy matching</span></li>
                <li><code class="font-bold text-slate-700">{n,m}</code><br><span class="text-slate-500">Matches n to m times</span></li>
                <li><code class="font-bold text-slate-700">\\b</code> / <code class="font-bold text-slate-700">\\B</code><br><span class="text-slate-500">Word / Non-word boundary</span></li>
                <li><code class="font-bold text-slate-700">^</code> / <code class="font-bold text-slate-700">$</code><br><span class="text-slate-500">Start / End of string (or line in m)</span></li>
              </ul>
            </div>
          </div>
          
          <div class="bg-slate-50 p-4 flex justify-end border-t border-slate-100">
            <button @click=${() => setShowHelp(false)} class="btn btn-primary px-8 btn-sm">Close</button>
          </div>
        </div>
      </div>
      ` : nothing}
    </div>
    
    <style>
      .match-highlight {
        background-color: rgba(254, 240, 138, 0.85);
        border-bottom: 2px solid #eab308;
        border-radius: 2px;
        padding: 0 1px;
      }
      .custom-scrollbar::-webkit-scrollbar { width: 6px; }
      .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
      .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
      .custom-scrollbar-h::-webkit-scrollbar { height: 3px; }
      .custom-scrollbar-h::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 2px; }
      
      input, textarea, select {
        width: 100%;
        padding: 0.4rem 0.6rem;
        border-radius: 0.375rem;
        border: 1px solid #e2e8f0;
        background-color: white;
        transition: all 0.2s;
        font-size: 0.75rem;
      }
      input:focus, textarea:focus, select:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
      }
    </style>
  `;
}

customElements.define("app-root", component(RegexToolbox, { useShadowDOM: false }));
