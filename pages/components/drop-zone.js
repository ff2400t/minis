import { html, render } from "/vendor/lit-html.js";

export class DropZone extends HTMLElement {
  static get observedAttributes() {
    return ["disabled"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    this.disabled = false;

    this.handleFileChange = this.handleFileChange.bind(this);
    this.handleDragOver = this.handleDragOver.bind(this);
    this.handleDragLeave = this.handleDragLeave.bind(this);
    this.handleDrop = this.handleDrop.bind(this);
    this.subtitle = undefined;
    this.acceptedMIMEs = undefined;
  }

  /**
   * @param {string} name
   * @param {any} oldValue
   * @param {null} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (name === "disabled") {
      this.disabled = newValue !== null;
      this.update();
    }
  }

  connectedCallback() {
    this.subtitle = this.getAttribute("subtitle") ??
      "PDF, JPG, PNG files (Multiple images allowed)";
    this.acceptedMIMEs = this.getAttribute("accepted") ??
      "application/pdf,image/jpeg,image/png";
    this.update();
  }

  /**
   * @param {InputEvent} e
   */
  handleFileChange(e) {
    if (this.disabled) return;

    this.dispatchEvent(
      new CustomEvent("file-selected", {
        // @ts-ignore
        detail: e.target.files,
        bubbles: true,
      }),
    );

    // @ts-ignore
    e.target.value = null;
  }

  /**
   * @param {DragEvent} e
   */
  handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!this.disabled) {
      // @ts-ignore
      e.currentTarget.classList.add("drag-over");
    }
  }

  /**
   * @param {DragEvent} e
   */
  handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    // @ts-ignore
    e.currentTarget.classList.remove("drag-over");
  }

  /**
   * @param {DragEvent} e
   */
  handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    this.handleDragLeave(e);

    if (this.disabled) return;

    if (
      e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0
    ) {
      this.dispatchEvent(
        new CustomEvent("file-selected", {
          detail: e.dataTransfer.files,
          bubbles: true,
        }),
      );
    }
  }

  update() {
    render(this.template(), this.shadowRoot);
  }

  template() {
    return html`
      <style>
      :host {
        display: block;
      }

      .upload-section {
        margin-bottom: 24px;
      }

      .drop-zone {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 12rem;
        border: 2px dashed var(--adw-card-border);
        border-radius: var(--radius-lg);
        background: var(--adw-view-bg);
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        padding: 2rem;
        position: relative;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.05);
      }

      .drop-zone:hover {
        background: rgba(0, 0, 0, 0.01);
        border-color: rgba(0, 0, 0, 0.2);
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
      }

      .drop-zone.drag-over {
        border-color: var(--adw-accent-bg);
        background: rgba(53, 132, 228, 0.04);
        box-shadow: 0 0 0 1px var(--adw-accent-bg), 0 10px 15px -3px rgba(53, 132, 228, 0.2);
        transform: scale(1.01);
      }

      .drop-zone.disabled {
        opacity: 0.5;
        cursor: not-allowed;
        filter: grayscale(1);
      }

      .content {
        pointer-events: none;
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.75rem;
      }

      .icon-wrapper {
        width: 48px;
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(53, 132, 228, 0.1);
        color: var(--adw-accent-bg);
        border-radius: 999px;
        margin-bottom: 0.25rem;
        transition: transform 0.2s;
      }

      .drop-zone:hover .icon-wrapper {
        transform: translateY(-2px);
      }

      svg {
        width: 24px;
        height: 24px;
      }

      .title {
        font-size: 0.95rem;
        font-weight: 500;
        color: var(--adw-window-fg);
        margin: 0;
      }

      .title strong {
        font-weight: 700;
        color: var(--adw-accent-bg);
      }

      .subtitle {
        font-size: 0.8rem;
        color: var(--text-muted);
        margin: 0;
        max-width: 300px;
        line-height: 1.4;
      }

      input[type="file"] {
        display: none;
      }
      </style>

      <div class="upload-section">
        <label
          class="drop-zone ${this.disabled ? "disabled" : ""}"
          @dragover="${this.handleDragOver}"
          @dragleave="${this.handleDragLeave}"
          @drop="${this.handleDrop}"
        >
          <div class="content">
            <div class="icon-wrapper">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="2.5"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z"
                />
              </svg>
            </div>

            <p class="title">
              <strong>Select Files</strong> or drag and drop
            </p>
            <p class="subtitle">
              ${this.subtitle}
            </p>
          </div>

          <input
            type="file"
            accept="${this.acceptedMIMEs}"
            multiple
            ?disabled="${this.disabled}"
            @change="${this.handleFileChange}"
          />
        </label>
      </div>
    `;
  }
}

customElements.define("drop-zone", DropZone);
