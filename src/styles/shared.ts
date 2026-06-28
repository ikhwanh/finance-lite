import { css } from "lit";

/** Common control styles shared by components (consumed via CSS custom props). */
export const controls = css`
  button {
    font: inherit;
    cursor: pointer;
    border: 1px solid var(--pf-border);
    background: var(--pf-surface);
    color: var(--pf-text);
    border-radius: var(--pf-radius-sm);
    padding: 0.55rem 0.9rem;
    transition: background 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
  }
  button:hover {
    border-color: var(--pf-primary);
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  button.primary {
    background: var(--pf-primary);
    color: var(--pf-primary-text);
    border-color: var(--pf-primary);
  }
  button.danger {
    color: var(--pf-danger);
    border-color: var(--pf-danger);
  }
  button.ghost {
    background: transparent;
    border-color: transparent;
  }
  label {
    display: block;
    font-size: 0.85rem;
    color: var(--pf-text-muted);
    margin-bottom: 0.3rem;
  }
  input,
  select,
  textarea {
    font: inherit;
    width: 100%;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--pf-border);
    border-radius: var(--pf-radius-sm);
    background: var(--pf-surface);
    color: var(--pf-text);
  }
  input:focus,
  select:focus,
  textarea:focus {
    outline: 2px solid var(--pf-primary);
    outline-offset: 1px;
  }
  .field {
    margin-bottom: 0.9rem;
  }
  .row {
    display: flex;
    gap: 0.7rem;
  }
  .row > * {
    flex: 1;
  }
`;
