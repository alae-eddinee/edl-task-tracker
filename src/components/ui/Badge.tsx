'use client';

type BadgeVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'info';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

// Tinted fills with a hairline ring read calmer than solid saturated pills
const variantStyles: Record<BadgeVariant, string> = {
  primary: 'bg-[var(--background-accent)] text-[var(--primary)] ring-[var(--primary)]/20',
  secondary: 'bg-[var(--background-tertiary)] text-[var(--foreground-secondary)] ring-[var(--border-hover)]/60',
  success: 'bg-[#e7f2eb] text-[var(--success)] ring-[var(--success)]/20',
  danger: 'bg-[#fbe9e5] text-[var(--danger)] ring-[var(--danger)]/20',
  warning: 'bg-[#fbf1df] text-[var(--warning)] ring-[var(--warning)]/25',
  info: 'bg-[#e5eff5] text-[var(--info)] ring-[var(--info)]/20',
};

export function Badge({ children, variant = 'primary', className = '' }: BadgeProps) {
  return (
    <span className={`
      inline-flex items-center px-2 py-0.5
      text-xs font-medium rounded-md ring-1 ring-inset
      ${variantStyles[variant]}
      ${className}
    `}>
      {children}
    </span>
  );
}
