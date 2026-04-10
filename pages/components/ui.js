import { html, when, nothing } from "/vendor/lit-html.js";
import { classMap } from "/vendor/lit-html.js";

/**
 * Libadwaita Card Container
 */
export const adwCard = (content) => html`
  <div class="adw-card">
    ${content}
  </div>
`;

/**
 * Libadwaita Preferences Group
 */
export const adwGroup = (title, content) => html`
  <div class="adw-group">
    <div class="adw-group-title">${title}</div>
    ${content}
  </div>
`;

/**
 * Libadwaita Action Row
 */
export const adwRow = (title, subtitle, action) => html`
  <div class="adw-row">
    <div class="adw-row-content">
      <div class="adw-row-title">${title}</div>
      ${when(subtitle, () => html`<div class="adw-row-subtitle">${subtitle}</div>`)}
    </div>
    ${action || nothing}
  </div>
`;

/**
 * Libadwaita Expander Row
 */
export const adwExpanderRow = (title, subtitle, expanded, onToggle, content) => html`
  <div class="adw-expander-row ${classMap({ expanded })}">
    <div class="adw-row cursor-pointer" @click="${onToggle}">
      <div class="adw-row-content">
        <div class="adw-row-title">${title}</div>
        ${when(subtitle, () => html`<div class="adw-row-subtitle">${subtitle}</div>`)}
      </div>
      <div class="transition-transform duration-200 ${classMap({ 'rotate-180': expanded })}">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 opacity-50" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
        </svg>
      </div>
    </div>
    ${when(expanded, () => html`
      <div class="adw-expander-content border-t border-[var(--adw-card-border)] bg-black/[0.01]">
        ${content}
      </div>
    `)}
  </div>
`;

/**
 * Libadwaita Entry Row (Label + Input)
 */
export const adwEntryRow = (title, value, onInput, placeholder = "", maxWidth = "200px") => html`
  <div class="adw-row">
    <div class="adw-row-content">
      <div class="adw-row-title">${title}</div>
    </div>
    <input 
      type="text" 
      class="border-none bg-black/[0.05] rounded-lg px-3 py-1.5 text-sm font-medium focus:bg-white text-right"
      style="max-width: ${maxWidth}"
      .value="${value}"
      @input="${onInput}"
      placeholder="${placeholder}"
    >
  </div>
`;

/**
 * Libadwaita Status Page
 */
export const adwStatusPage = (icon, title, description, action = null) => html`
  <div class="flex flex-col items-center justify-center py-16 px-6 text-center animate-in fade-in duration-500">
    <div class="text-6xl mb-6 opacity-80">${icon}</div>
    <h2 class="text-2xl font-black text-slate-900 tracking-tight mb-3">${title}</h2>
    <p class="text-slate-500 font-medium max-w-sm leading-relaxed mb-8">${description}</p>
    ${action || nothing}
  </div>
`;

/**
 * Libadwaita Banner
 */
export const adwBanner = (message, type = 'info', onClose = null) => {
  const dynamicClasses = {
    'bg-blue-600': type === 'info',
    'bg-green-600': type === 'success',
    'bg-red-600': type === 'error'
  };

  return html`
    <div class="px-6 py-3 flex items-center justify-between shadow-lg animate-in slide-in-from-top duration-300 text-white ${classMap(dynamicClasses)}">
      <span class="text-sm font-bold tracking-tight">${message}</span>
      ${when(onClose, () => html`
        <button @click="${onClose}" class="opacity-80 hover:opacity-100 transition-opacity">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
        </button>
      `)}
    </div>
  `;
};

/**
 * Libadwaita Segmented Control
 */
export const adwSegmentedControl = (options, width = "120px") => html`
  <div class="segmented-control" style="width: ${width}">
    ${options.map(opt => html`
      <button
        class="segmented-button ${classMap({ active: opt.active })}"
        @click="${opt.onClick}"
      >${opt.label}</button>
    `)}
  </div>
`;

/**
 * Status Badge
 */
export const adwBadge = (value) => html`
  <span class="value-badge">${value}</span>
`;
