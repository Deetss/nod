import type { ReactNode } from 'react';
import type { FieldErrors } from './form';

/** The red circle with an exclamation mark. 12px beside a message, 16px beside a footer line. */
export function ErrorIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className="settings-alert-icon">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4.6v4M8 10.6v.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** The line under the fields for an invalid one: icon, then the message. */
export function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <p className="field-error" id={id} role="alert">
      <ErrorIcon />
      <span>{message}</span>
    </p>
  );
}

export const errorId = (path: string) => `settings-err-${path.replace(/\./g, '-')}`;

interface TextFieldProps {
  /** Schema path, such as `bot.command`. Keys the error and the element id. */
  path: string;
  label: string;
  value: string;
  errors: FieldErrors;
  onChange: (value: string) => void;
  onEnter?: () => void;
  placeholder?: string;
  className?: string;
  /** The label stays for screen readers; a visible heading above the field names it. */
  hideLabel?: boolean;
  /** Replaces the plain input, as the colour field does. */
  children?: (input: ReactNode) => ReactNode;
}

const fieldId = (path: string) => `settings-${path.replace(/\./g, '-')}`;

/** A labelled text input that marks itself invalid when `errors` holds its path. */
export function TextField(p: TextFieldProps) {
  const id = fieldId(p.path);
  const error = p.errors[p.path];
  const input = (
    <input
      type="text"
      id={id}
      value={p.value}
      placeholder={p.placeholder}
      className={error ? 'is-invalid' : undefined}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId(p.path) : undefined}
      autoComplete="off"
      spellCheck={false}
      onChange={(e) => p.onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && p.onEnter) {
          e.preventDefault();
          p.onEnter();
        }
      }}
    />
  );
  return (
    <div className={`settings-field${p.className ? ` ${p.className}` : ''}`}>
      <label className={p.hideLabel ? 'field-label sr-only' : 'field-label'} htmlFor={id}>
        {p.label}
      </label>
      {p.children ? p.children(input) : input}
    </div>
  );
}

interface SwitchProps {
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
}

/** The On/Off toggle. The word beside the knob carries the state, not the colour. */
export function Switch({ label, on, onChange }: SwitchProps) {
  return (
    <div className="settings-switch-row">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby="settings-switch-label"
        className="settings-switch"
        onClick={() => onChange(!on)}
      >
        <span className="settings-switch-knob" />
      </button>
      <span id="settings-switch-label" className="settings-switch-label">
        {label}
      </span>
      <span className="settings-switch-state">{on ? 'On' : 'Off'}</span>
    </div>
  );
}

/** The messages for the invalid fields under one schema key, in schema order. */
export function PaneErrors({ errors, roots }: { errors: FieldErrors; roots: readonly string[] }) {
  const shown = Object.keys(errors).filter((p) => roots.some((r) => p === r || p.startsWith(`${r}.`)));
  if (shown.length === 0) return null;
  return (
    <div className="settings-errors">
      {shown.map((p) => (
        <FieldError key={p} id={errorId(p)} message={errors[p] ?? ''} />
      ))}
    </div>
  );
}
