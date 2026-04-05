import { html } from "/vendor/lit-html.js";
import { component } from "/vendor/haunted.js";

/**
 * @typedef {Object} BatchJob
 * @property {string} id
 * @property {string} name
 * @property {'PENDING'|'PROCESSING'|'COMPLETED'|'CANCELLED'|'ERROR'} status
 * @property {number} progress
 * @property {string} [error]
 */

function BatchProcessor({ 
  jobs = [], 
  isProcessing = false,
  title = "File List"
}) {
  const totalJobs = jobs.length;
  const completedJobs = jobs.filter(j => ['COMPLETED', 'CANCELLED', 'ERROR'].includes(j.status)).length;
  const overallProgress = totalJobs > 0 ? Math.round((completedJobs / totalJobs) * 100) : 0;
  
  const allDone = totalJobs > 0 && completedJobs === totalJobs;
  const hasPending = jobs.some(j => j.status === 'PENDING');
  const hasCompleted = jobs.some(j => j.status === 'COMPLETED');

  const onStart = () => {
    this.dispatchEvent(new CustomEvent('start-requested'));
  };

  const onDownloadZip = () => {
    this.dispatchEvent(new CustomEvent('zip-requested'));
  };

  const onCancelJob = (id) => {
    this.dispatchEvent(new CustomEvent('cancel-job', { detail: id }));
  };

  const onDownloadJob = (id) => {
    this.dispatchEvent(new CustomEvent('download-job', { detail: id }));
  };

  if (jobs.length === 0) return html``;

  return html`
    <style>
      .batch-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
      }
      
      .batch-container {
        background: var(--adw-card-bg, #ffffff);
        border-radius: var(--radius-lg, 12px);
        border: 1px solid var(--adw-card-border, #e2e8f0);
        box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        overflow: hidden;
      }

      .global-status-bar {
        background: var(--adw-header-bg, #f8fafc);
        padding: 0.75rem 1rem;
        border-bottom: 1px solid var(--adw-card-border, #e2e8f0);
        position: relative;
      }
      .global-status-info {
        display: flex;
        justify-content: space-between;
        font-size: 0.75rem;
        font-weight: 800;
        color: var(--text-muted, #64748b);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 0.5rem;
      }
      .global-progress-line {
        position: absolute;
        bottom: -1px;
        left: 0;
        height: 2px;
        background: var(--adw-accent-bg, #3b82f6);
        transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 0 8px rgba(59, 130, 246, 0.5);
      }

      .job-row {
        position: relative;
        padding: 0.75rem 1rem;
        display: flex;
        align-items: center;
        gap: 1rem;
        transition: background-color 0.2s;
      }
      .job-row:not(:last-child) {
        border-bottom: 1px solid var(--adw-card-border, #f1f5f9);
      }
      .job-row.processing {
        background-color: var(--adw-view-bg, #f8fafc);
      }
      
      /* Libadwaita Style Circular Buttons */
      .btn-circle {
        width: 30px;
        height: 30px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
        border: 1px solid transparent;
        cursor: pointer;
        padding: 0;
        background: transparent;
        color: var(--adw-window-fg, #1e293b);
      }
      .btn-circle:hover {
        background: rgba(0,0,0,0.05);
      }
      .btn-circle svg {
        width: 16px;
        height: 16px;
      }
      .btn-circle.destructive {
        color: var(--adw-destructive-bg, #ef4444);
      }
      .btn-circle.destructive:hover {
        background: #fee2e2;
        border-color: #fecaca;
      }
      .btn-circle.suggested {
        color: var(--adw-accent-bg, #3b82f6);
      }
      .btn-circle.suggested:hover {
        background: #dbeafe;
        border-color: #bfdbfe;
      }
      
      .status-icon {
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      
      .spinner {
        animation: rotate 2s linear infinite;
        width: 18px;
        height: 18px;
      }
      .spinner circle {
        stroke: var(--adw-accent-bg, #3b82f6);
        stroke-linecap: round;
        animation: dash 1.5s ease-in-out infinite;
      }
      @keyframes rotate {
        100% { transform: rotate(360deg); }
      }
      @keyframes dash {
        0% { stroke-dasharray: 1, 150; stroke-dashoffset: 0; }
        50% { stroke-dasharray: 90, 150; stroke-dashoffset: -35; }
        100% { stroke-dasharray: 90, 150; stroke-dashoffset: -124; }
      }

      .item-progress-bar {
        position: absolute;
        bottom: 0;
        left: 0;
        height: 2px;
        background: var(--adw-accent-bg, #3b82f6);
        transition: width 0.3s ease;
      }

      .text-success { color: #22c55e; }
      .text-error { color: #ef4444; }
      .text-muted { color: #94a3b8; }
      
      .job-info {
        flex: 1;
        min-width: 0;
      }
      .job-name {
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--adw-window-fg, #1e293b);
        display: block;
      }
      .job-status-text {
        font-size: 0.75rem;
        color: var(--text-muted, #64748b);
      }
    </style>

    <div class="mt-8">
      <div class="batch-header">
        <h2 class="text-lg font-semibold text-slate-700">${title}</h2>
        <div class="flex gap-2">
           ${!isProcessing && hasPending ? html`
             <button @click="${onStart}" class="btn btn-primary">
               Start Processing
             </button>
           ` : ""}
           ${allDone && hasCompleted ? html`
             <button @click="${onDownloadZip}" class="btn btn-secondary">
               Download All (ZIP)
             </button>
           ` : ""}
        </div>
      </div>

      <div class="batch-container">
        <!-- Integrated Global Progress -->
        <div class="global-status-bar">
          <div class="global-status-info">
            <span>Progress</span>
            <span>${completedJobs} / ${totalJobs} (${overallProgress}%)</span>
          </div>
          <div class="global-progress-line" style="width: ${overallProgress}%"></div>
        </div>

        <div class="divide-y divide-slate-100">
          ${jobs.map(job => html`
            <div class="job-row ${job.status === 'PROCESSING' ? 'processing' : ''}">
              <!-- Status Icon -->
              <div class="status-icon">
                ${job.status === 'COMPLETED' ? html`
                  <svg class="text-success" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                  </svg>
                ` : (job.status === 'PROCESSING' ? html`
                  <svg class="spinner" viewBox="0 0 50 50">
                    <circle cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle>
                  </svg>
                ` : (job.status === 'PENDING' ? html`
                  <svg class="text-muted" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd" />
                  </svg>
                ` : (job.status === 'CANCELLED' ? html`
                  <svg class="text-muted" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                  </svg>
                ` : html`
                  <svg class="text-error" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                  </svg>
                `)))}
              </div>

              <!-- Job Details -->
              <div class="job-info">
                <span class="job-name truncate" title="${job.name}">${job.name}</span>
                <span class="job-status-text">${job.status}${job.status === 'PROCESSING' ? ` • ${job.progress}%` : ''}</span>
                ${job.error ? html`<div class="text-xs text-error mt-0.5 truncate">${job.error}</div>` : ""}
              </div>
              
              <!-- Action Buttons -->
              <div class="flex items-center gap-1">
                ${job.status === 'COMPLETED' ? html`
                  <button @click="${() => onDownloadJob(job.id)}" class="btn-circle suggested" title="Download">
                    <svg viewBox="0 0 20 20" fill="currentColor">
                      <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd" />
                    </svg>
                  </button>
                ` : (job.status === 'PENDING' || job.status === 'PROCESSING' ? html`
                  <button @click="${() => onCancelJob(job.id)}" 
                          class="btn-circle destructive" title="Cancel">
                    <svg viewBox="0 0 20 20" fill="currentColor">
                      <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                    </svg>
                  </button>
                ` : "")}
              </div>

              <!-- Item-specific Status Line (Active when processing) -->
              ${job.status === 'PROCESSING' ? html`
                <div class="item-progress-bar" style="width: ${job.progress}%"></div>
              ` : ""}
            </div>
          `)}
        </div>
      </div>
    </div>
  `;
}

customElements.define("batch-processor", component(BatchProcessor, { useShadowDOM: false }));
