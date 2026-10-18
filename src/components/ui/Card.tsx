'use client';

import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddingStyles = {
  none: '',
  sm: 'p-2 sm:p-3',
  md: 'p-3 sm:p-4',
  lg: 'p-4 sm:p-6',
};

export function Card({ children, className = '', padding = 'md' }: CardProps) {
  return (
    <div className={`
      bg-white border border-[var(--border)] rounded-lg
      shadow-[0_1px_2px_rgba(27,26,23,0.04)]
      ${paddingStyles[padding]}
      ${className}
    `}>
      {children}
    </div>
  );
}
