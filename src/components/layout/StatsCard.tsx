'use client';

import { ReactNode } from 'react';

interface StatsCardProps {
  title: string;
  value: number;
  icon: ReactNode;
  color: 'blue' | 'orange' | 'green' | 'red';
}

// A small tinted icon instead of a saturated tile
const colorStyles = {
  blue: { icon: 'text-[var(--info)]' },
  orange: { icon: 'text-[var(--warning)]' },
  green: { icon: 'text-[var(--success)]' },
  red: { icon: 'text-[var(--danger)]' },
};

export function StatsCard({ title, value, icon, color }: StatsCardProps) {
  const style = colorStyles[color];
  return (
    <div className="bg-white border border-[var(--border)] rounded-lg p-3 sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs sm:text-sm text-[var(--foreground-tertiary)]">
          {title}
        </p>
        <span className={`${style.icon} opacity-80 [&_svg]:w-4 [&_svg]:h-4`}>{icon}</span>
      </div>
      <p className="mt-1.5 text-2xl sm:text-[28px] leading-none font-semibold tabular-nums tracking-tight text-[var(--foreground)]">
        {value}
      </p>
    </div>
  );
}
