import { html, render } from "/vendor/lit-html.js";

export class AppLayout extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  static get observedAttributes() {
    return ["title"];
  }

  attributeChangedCallback() {
    this.update();
  }

  connectedCallback() {
    this.update();
  }

  update() {
    const title = this.getAttribute("title") || "Mini Tool";
    render(html`
      <style>
        @import url("/unified-theme.css");
        
        :host {
          display: block;
          min-height: 100vh;
          background-color: var(--bg-main);
          font-family: system-ui, -apple-system, sans-serif;
        }
        header {
          background-color: white;
          border-bottom: 1px solid var(--border-color);
          padding: 1rem;
          position: sticky;
          top: 0;
          z-index: 50;
        }
        .header-content {
          max-width: 80rem;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .logo-section {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          text-decoration: none;
          color: #1e293b;
        }
        .logo-icon {
          width: 2rem;
          height: 2rem;
          color: #2563eb;
        }
        h1 {
          font-size: 1.25rem;
          font-weight: 700;
          margin: 0;
        }
        main {
          max-width: 80rem;
          margin: 2rem auto;
          padding: 0 1rem;
        }
      </style>
      <header>
        <div class="header-content">
          <a href="index.html" class="logo-section">
            <svg class="logo-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <h1>${title}</h1>
          </a>
        </div>
      </header>
      <main>
        <slot></slot>
      </main>
    `, this.shadowRoot);
  }
}
customElements.define("app-layout", AppLayout);
