import { html, when } from "/vendor/lit-html.js";

/**
 * Libadwaita Card Container
 * @param {import("/vendor/lit-html.js").TemplateResult} content 
 */
export const adwCard = (content) => html`
  <div class="adw-card">
    ${content}
  </div>
`;

/**
 * Libadwaita Preferences Group
 * @param {string} title 
 * @param {import("/vendor/lit-html.js").TemplateResult} content 
 */
export const adwGroup = (title, content) => html`
  <div class="adw-group">
    <div class="adw-group-title">${title}</div>
    ${content}
  </div>
`;

/**
 * Libadwaita Action Row
 * @param {string} title 
 * @param {string | null | undefined} subtitle 
 * @param {import("/vendor/lit-html.js").TemplateResult | null | undefined} action 
 */
export const adwRow = (title, subtitle, action) => html`
  <div class="adw-row">
    <div class="adw-row-content">
      <div class="adw-row-title">${title}</div>
      ${when(subtitle, () => html`<div class="adw-row-subtitle">${subtitle}</div>`)}
    </div>
    ${action}
  </div>
`;

/**
 * Libadwaita Segmented Control
 * @param {Array<{label: string, value: any, active: boolean, onClick: function}>} options 
 * @param {string} width
 */
export const adwSegmentedControl = (options, width = "120px") => html`
  <div class="segmented-control" style="width: ${width};">
    ${options.map(opt => html`
      <button
        class="segmented-button ${opt.active ? "active" : ""}"
        @click="${opt.onClick}"
      >${opt.label}</button>
    `)}
  </div>
`;

/**
 * Status Badge / Value Badge
 * @param {string | number} value 
 */
export const adwBadge = (value) => html`
  <span class="value-badge">${value}</span>
`;
