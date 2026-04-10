# Project Architectural Conventions (AGENTS.md)

This document outlines the core patterns and standards for developing tools within this project. Adhering to these ensures consistency, maintainability, and a unified Libadwaita-inspired user experience.

## 1. Core Technologies
- **Framework**: [Haunted](https://github.com/matthewp/haunted) (React-like hooks for Web Components).
- **Templating**: [lit-html](https://lit.dev/docs/templates/overview/).
- **Styling**: Tailwind CSS + Custom Libadwaita theme (`unified-theme.css`, `utils.css`).
- **Icons**: Standard SVG icons (embedded in templates).

## 2. Component Structure
Each tool is typically a single Web Component (e.g., `<app-root>`, `<ocr-app>`) that leverages shared components.

### Shared Components
- `<app-layout title="...">`: Provides the standard header, sidebar, and main content area.
- `<drop-zone>`: Standardized file upload area.
- `<status-message>`: Displays info/success/error banners.
- `<batch-processor>`: Handles multi-file processing queues with progress bars.
- `ui.js`: Functional UI helpers (`adwCard`, `adwGroup`, `adwRow`, `adwSegmentedControl`).

## 3. State Management
- **Complex State**: Use `useReducer` for application-wide state. Define an `initialState` and a `reducer` function.
- **Side Effects**: Use `useEffect` for syncing state to `localStorage` or initializing external libraries.
- **Refs**: Use `useRef` for tracking mutable values that don't trigger re-renders or for persisting class instances (like processors).

## 4. Processing Patterns
- **Sequential Processing**: Avoid `Promise.all` for heavy tasks (OCR, PDF extraction) to maintain UI responsiveness and prevent worker exhaustion.
- **Processor Classes**: For complex async flows (e.g., password retries, batching), encapsulate logic in a vanilla JS class that takes `dispatch` as a dependency.
- **Batching**: Use the `batch-processor.js` component for consistent multi-file feedback.

## 5. UI/UX Standards (Libadwaita/GNOME)
- **Groups**: Wrap related controls in `adwGroup` with an `adwCard`.
- **Rows**: Use `adwRow` for individual settings (label + control).
- **Switches**: Use `<input type="checkbox" class="nd-switch">` for toggles.
- **Buttons**:
  - `btn-primary`: Suggested actions.
  - `btn-secondary`: Standard actions.
  - `btn-flat`: Subtle/header actions.
  - `btn-circle`: Icon-only actions (Libadwaita style).

## 6. Project Layout
- `/vendor`: Local library copies (Haunted, lit-html).
- `/components`: Shared Web Components.
- `/vendor/*.d.ts`: Type definitions for better IDE support.
- `index.html`: Central navigation portal.
