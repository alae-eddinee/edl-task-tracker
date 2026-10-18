'use client';

import { useCallback, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { FloatingPanel } from './FloatingPanel';
import { MenuList, MenuOption } from './MenuList';

interface SelectProps {
  label?: string;
  error?: string;
  options: MenuOption[];
  value: string;
  /** Same shape as a native change event so existing `e.target.value` handlers keep working */
  onChange?: (event: { target: { value: string } }) => void;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  placeholder?: string;
  className?: string;
}

export function Select({ label, error, options, value, onChange, disabled, required, name, placeholder, className = '' }: SelectProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const current = options.find((o) => o.value === value);
  const close = useCallback(() => setOpen(false), []);

  const select = (next: string) => {
    onChange?.({ target: { value: next } });
    setOpen(false);
    triggerRef.current?.focus();
  };

  // An empty-value option acts as the placeholder (e.g. "Choose a user...")
  const showPlaceholder = !current || current.value === '';

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-[var(--foreground-secondary)] mb-1.5">{label}</label>
      )}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm bg-white border rounded-md transition-colors
          disabled:bg-[var(--background-secondary)] disabled:cursor-not-allowed
          ${open
            ? 'border-[var(--primary)] ring-[3px] ring-[var(--primary)]/15'
            : error ? 'border-[var(--danger)]' : 'border-[var(--border)] hover:border-[var(--border-hover)]'}
          ${className}`}
      >
        {current?.leading}
        <span className={`flex-1 truncate ${showPlaceholder ? 'text-[var(--foreground-muted)]' : 'text-[var(--foreground)]'}`}>
          {current?.label ?? placeholder ?? 'Select…'}
        </span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-[var(--foreground-tertiary)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {/* Keeps native form validation (required) working */}
      {(required || name) && (
        <input
          tabIndex={-1}
          aria-hidden
          name={name}
          required={required}
          value={value}
          onChange={() => {}}
          className="sr-only"
        />
      )}
      <FloatingPanel anchorRef={triggerRef} open={open} onClose={close} estimatedHeight={Math.min(options.length * 34 + 8, 270)}>
        <MenuList options={options} value={value} onSelect={select} />
      </FloatingPanel>
      {error && <p className="mt-1 text-sm text-[var(--danger)]">{error}</p>}
    </div>
  );
}
