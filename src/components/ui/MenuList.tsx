'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';

export interface MenuOption {
  value: string;
  label: string;
  /** Rendered before the label (e.g. a status dot) */
  leading?: ReactNode;
}

interface MenuListProps {
  options: MenuOption[];
  value: string;
  onSelect: (value: string) => void;
}

/** Notion-style option list with a checkmark and arrow-key / Enter navigation */
export function MenuList({ options, value, onSelect }: MenuListProps) {
  const [active, setActive] = useState(() => Math.max(0, options.findIndex((o) => o.value === value)));
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((i) => (i + 1) % options.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => (i - 1 + options.length) % options.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onSelect(options[active].value);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [options, active, onSelect]);

  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return (
    <div ref={listRef} role="listbox" className="max-h-64 overflow-y-auto">
      {options.map((option, i) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="option"
            aria-selected={selected}
            onMouseEnter={() => setActive(i)}
            onClick={() => onSelect(option.value)}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left text-[var(--foreground)] transition-colors
              ${i === active ? 'bg-[var(--hover)]' : ''}`}
          >
            {option.leading}
            <span className="flex-1 truncate">{option.label}</span>
            {selected && <Check className="w-4 h-4 shrink-0 text-[var(--foreground-secondary)]" />}
          </button>
        );
      })}
    </div>
  );
}
