'use client';

import { useCallback, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { TaskStatus } from '@/types';
import { FloatingPanel } from './FloatingPanel';
import { MenuList } from './MenuList';

// Notion's status palette: grey / blue / green
const STATUS: Record<TaskStatus, { label: string; dot: string; pill: string }> = {
  todo: { label: 'To Do', dot: 'bg-[#a3a7af]', pill: 'bg-[#f1f1ef] text-[#5f5e5b]' },
  in_progress: { label: 'In Progress', dot: 'bg-[#337ea9]', pill: 'bg-[#e7f3f8] text-[#28456c]' },
  done: { label: 'Done', dot: 'bg-[#448361]', pill: 'bg-[#edf3ec] text-[#1c3829]' },
};

const ORDER: TaskStatus[] = ['todo', 'in_progress', 'done'];

const Dot = ({ status, className = '' }: { status: TaskStatus; className?: string }) => (
  <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS[status].dot} ${className}`} />
);

/** Read-only status pill, matching the StatusSelect trigger */
export function StatusPill({ status, compact }: { status: TaskStatus; compact?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap ${STATUS[status].pill}
      ${compact ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-0.5 text-xs'}`}>
      <Dot status={status} />
      {STATUS[status].label}
    </span>
  );
}

interface StatusSelectProps {
  value: TaskStatus;
  onChange: (status: TaskStatus) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  /** White-on-colour styling for rows with a strong background (e.g. BOMBE) */
  inverse?: boolean;
}

export function StatusSelect({ value, onChange, disabled, size = 'md', inverse }: StatusSelectProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  const select = (next: string) => {
    setOpen(false);
    if (next !== value) onChange(next as TaskStatus);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={(e) => {
          // Rows/cards can be clickable; the pill shouldn't also trigger them
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={`inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap transition-colors
          disabled:opacity-60 disabled:cursor-wait
          ${size === 'sm' ? 'pl-2 pr-1.5 py-0.5 text-xs' : 'pl-2.5 pr-2 py-1 text-sm'}
          ${inverse
            ? 'bg-white/20 text-white ring-1 ring-inset ring-white/40 hover:bg-white/30'
            : `${STATUS[value].pill} hover:brightness-[0.97]`}`}
      >
        <Dot status={value} className={inverse ? 'ring-1 ring-white/70' : ''} />
        {STATUS[value].label}
        <ChevronDown className={`${size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} opacity-60 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <FloatingPanel anchorRef={triggerRef} open={open} onClose={close} width={180} estimatedHeight={118} ariaLabel="Change status">
        <MenuList
          value={value}
          onSelect={select}
          options={ORDER.map((s) => ({ value: s, label: STATUS[s].label, leading: <Dot status={s} /> }))}
        />
      </FloatingPanel>
    </>
  );
}
