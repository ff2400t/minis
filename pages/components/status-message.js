import { html, render } from "/vendor/lit-html.js";

export class StatusMessage extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._type = "info";
    this._message = "";
  }

  static get observedAttributes() {
    return ["type", "message"];
  }

  get type() {
    return this._type;
  }

  set type(val) {
    this._type = val;
    this.update();
  }

  get message() {
    return this._message;
  }

  set message(val) {
    this._message = val;
    this.update();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === "type") this._type = newValue;
    if (name === "message") this._message = newValue;
    this.update();
  }

  connectedCallback() {
    this.update();
  }

  update() {
    const type = this._type || "info";
    const message = this._message;

    if (!message) {
      render(html``, this.shadowRoot);
      return;
    }

    const styles = {
      error: { bg: "#fef2f2", text: "#991b1b", border: "#fecaca" },
      success: { bg: "#f0fdf4", text: "#166534", border: "#bbf7d0" },
      info: { bg: "#eff6ff", text: "#1e40af", border: "#bfdbfe" }
    };

    const s = styles[type] || styles.info;

    render(html`
      <style>
        .alert {
          padding: 1rem;
          border-radius: 0.5rem;
          margin-bottom: 1.5rem;
          font-size: 0.875rem;
          border: 1px solid ${s.border};
          background-color: ${s.bg};
          color: ${s.text};
          display: flex;
          align-items: center;
          gap: 0.75rem;
          animation: slideIn 0.2s ease-out;
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .icon {
          flex-shrink: 0;
          width: 1.25rem;
          height: 1.25rem;
        }
        .content {
          flex-grow: 1;
        }
      </style>
      <div class="alert" role="alert">
        <svg class="icon" viewBox="0 0 20 20" fill="currentColor">
          ${type === "error" ? html`
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
          ` : type === "success" ? html`
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
          ` : html`
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
          `}
        </svg>
        <div class="content">${message}</div>
      </div>
    `, this.shadowRoot);
  }
}
customElements.define("status-message", StatusMessage);
