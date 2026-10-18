'use client';

import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-[var(--foreground-secondary)] mb-1.5">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`
            w-full px-3 py-2
            bg-white border border-[var(--border)] rounded-md hover:border-[var(--border-hover)]
            text-[var(--foreground)] placeholder:text-[var(--foreground-muted)]
            focus:outline-none focus:ring-[3px] focus:ring-[var(--primary)]/15 focus:border-[var(--primary)]
            transition-all duration-160
            disabled:bg-[var(--background-secondary)] disabled:cursor-not-allowed
            ${error ? 'border-[var(--danger)]' : ''}
            ${className}
          `}
          {...props}
        />
        {error && (
          <p className="mt-1 text-sm text-[var(--danger)]">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
