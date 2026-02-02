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
        margin-bottom: 2rem;
      }

      .drop-zone {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 10rem;
        border: 2px dashed #cbd5e1;
        border-radius: 12px;
        background: #ffffff;
        cursor: pointer;
        transition: all 0.15s ease-in-out;
      }

      .drop-zone:hover {
        background: #f8fafc;
      }

      .drop-zone.drag-over {
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.25);
        transform: scale(1.02);
      }

      .drop-zone.disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .content {
        pointer-events: none;
        text-align: center;
      }

      svg {
        width: 32px;
        height: 32px;
        margin-bottom: 0.75rem;
        color: #94a3b8;
      }

      .title {
        font-size: 0.875rem;
        color: #64748b;
      }

      .title strong {
        font-weight: 600;
      }

      .subtitle {
        margin-top: 0.25rem;
        font-size: 0.75rem;
        color: #94a3b8;
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
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 20 16"
              aria-hidden="true"
            >
              <path
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"
              />
            </svg>

            <p class="title">
              <strong>Click to upload PDF or Images</strong> or drag and drop
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
