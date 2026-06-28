import { css } from "lit";

/** Common control styles shared by components (consumed via CSS custom props). */
export const controls = css`
  /* Shadow roots don't inherit the light-DOM universal box-sizing reset,
     so re-apply it here or inputs with width:100% overflow their container. */
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }
  button {
    font: inherit;
    cursor: pointer;
    border: 1px solid var(--pf-border);
    background: var(--pf-surface);
    color: var(--pf-text);
    border-radius: var(--pf-radius-sm);
    padding: 0.5rem 0.85rem;
    font-weight: 500;
    transition: background 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
  }
  button:hover {
    border-color: var(--pf-primary);
    background: var(--pf-surface-2);
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
  button.primary:hover {
    background: color-mix(in srgb, var(--pf-primary) 88%, #000);
    border-color: color-mix(in srgb, var(--pf-primary) 88%, #000);
  }
  button.danger {
    color: var(--pf-danger);
    border-color: var(--pf-danger);
  }
  button.danger:hover {
    background: color-mix(in srgb, var(--pf-danger) 12%, transparent);
    border-color: var(--pf-danger);
  }
  button.ghost {
    background: transparent;
    border-color: transparent;
  }
  button.ghost:hover {
    background: var(--pf-surface-2);
    border-color: transparent;
  }
  label {
    display: block;
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--pf-text-muted);
    margin-bottom: 0.3rem;
  }
  input,
  select,
  textarea {
    font: inherit;
    width: 100%;
    padding: 0.5rem 0.65rem;
    border: 1px solid var(--pf-border);
    border-radius: var(--pf-radius-sm);
    background: var(--pf-surface);
    color: var(--pf-text);
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  input::placeholder,
  textarea::placeholder {
    color: var(--pf-text-muted);
    opacity: 0.6;
  }
  input:focus,
  select:focus,
  textarea:focus {
    outline: none;
    border-color: var(--pf-primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--pf-primary) 22%, transparent);
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
