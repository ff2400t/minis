import { html, render } from "/vendor/lit-html.js";

export class AppLayout extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.utilityOpen = this.hasAttribute("utility-open");
  }

  static get observedAttributes() {
    return ["title", "utility-open"];
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (name === "utility-open") {
      this.utilityOpen = newVal !== null;
    }
    this.update();
  }

  connectedCallback() {
    this.update();
  }

  toggleUtility() {
    this.utilityOpen = !this.utilityOpen;
    if (this.utilityOpen) {
      this.setAttribute("utility-open", "");
    } else {
      this.removeAttribute("utility-open");
    }
    this.dispatchEvent(new CustomEvent("utility-toggled", { detail: { open: this.utilityOpen } }));
    this.update();
  }

  update() {
    const title = this.getAttribute("title") || "Mini Tool";
    render(html`
      <style>
        @import url("/unified-theme.css");
        
        :host {
          display: flex;
          flex-direction: column;
          height: 100vh;
          background-color: var(--adw-window-bg);
          color: var(--adw-window-fg);
          font-family: Inter, system-ui, -apple-system, sans-serif;
          overflow: hidden;
        }
        
        header {
          background-color: var(--adw-header-bg);
          border-bottom: 1px solid var(--adw-card-border);
          min-height: 46px;
          display: flex;
          align-items: center;
          padding: 0 12px;
          flex-shrink: 0;
          z-index: 100;
        }
        
        .header-content {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }
        
        .back-button {
          position: absolute;
          left: 0;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          text-decoration: none;
          color: var(--adw-window-fg);
          font-size: 0.85rem;
          font-weight: 600;
          padding: 6px 10px;
          border-radius: 6px;
          transition: background-color 0.2s;
        }
        
        .back-button:hover {
          background-color: rgba(0, 0, 0, 0.05);
        }
        
        .utility-toggle {
          position: absolute;
          right: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: none;
          border: none;
          color: var(--adw-window-fg);
          padding: 6px;
          border-radius: 6px;
          cursor: pointer;
          transition: background-color 0.2s, color 0.2s;
        }
        
        .utility-toggle:hover {
          background-color: rgba(0, 0, 0, 0.05);
        }
        
        .utility-toggle.active {
          background-color: var(--adw-accent-bg);
          color: var(--adw-accent-fg);
        }
        
        .logo-icon {
          width: 1.25rem;
          height: 1.25rem;
          color: inherit;
        }
        
        .back-button .logo-icon {
          color: var(--adw-accent-bg);
        }
        
        h1 {
          font-size: 0.95rem;
          font-weight: 700;
          margin: 0;
          color: var(--adw-window-fg);
        }
        
        .layout-body {
          display: flex;
          flex-direction: row;
          flex: 1;
          overflow: hidden;
          position: relative;
        }

        .main-view {
          flex: 1;
          overflow-y: auto;
          background-color: var(--adw-view-bg);
          display: flex;
          flex-direction: column;
          align-items: center;
          position: relative;
          z-index: 10;
        }

        main {
          width: 100%;
          max-width: 48rem; /* AdwClamp equivalent */
          padding: 2rem 1rem;
        }

        .utility-pane {
          width: 320px;
          background-color: var(--adw-window-bg);
          border-left: 1px solid var(--adw-card-border);
          overflow-y: auto;
          display: none;
          flex-shrink: 0;
          z-index: 20;
          padding: 1rem;
        }

        :host([utility-open]) .utility-pane {
          display: block;
        }

        @media (max-width: 1024px) {
          .utility-pane {
            position: absolute;
            top: 0;
            right: 0;
            bottom: 0;
            width: 85%;
            max-width: 400px;
            box-shadow: -4px 0 12px rgba(0, 0, 0, 0.1);
            border-left: none;
          }
          
          :host([utility-open]) .main-view {
            filter: brightness(0.9);
            pointer-events: none;
          }
        }

        @media (max-width: 768px) {
          main {
            max-width: 100%;
          }
        }
        
        /* Custom scrollbar for GNOME look */
        .main-view::-webkit-scrollbar,
        .utility-pane::-webkit-scrollbar {
          width: 8px;
        }
        
        .main-view::-webkit-scrollbar-thumb,
        .utility-pane::-webkit-scrollbar-thumb {
          background-color: rgba(0, 0, 0, 0.1);
          border-radius: 4px;
        }
        
        .main-view::-webkit-scrollbar-thumb:hover,
        .utility-pane::-webkit-scrollbar-thumb:hover {
          background-color: rgba(0, 0, 0, 0.2);
        }
      </style>
      <header>
        <div class="header-content">
          <a href="index.html" class="back-button">
            <svg class="logo-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
            <span>Apps</span>
          </a>
          <h1>${title}</h1>
          <button class="utility-toggle ${this.utilityOpen ? "active" : ""}" @click="${() => this.toggleUtility()}" title="Toggle Utility Pane">
            <svg class="logo-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </button>
        </div>
      </header>
      <div class="layout-body">
        <div class="main-view">
          <main>
            <slot></slot>
          </main>
        </div>
        <aside class="utility-pane">
          <slot name="utility"></slot>
        </aside>
      </div>
    `, this.shadowRoot);
  }
}
customElements.define("app-layout", AppLayout);
