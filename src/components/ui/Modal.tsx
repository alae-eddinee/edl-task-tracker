'use client';

import { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeStyles = {
  sm: 'max-w-sm mx-4',
  md: 'max-w-md mx-4',
  lg: 'max-w-lg sm:max-w-xl lg:max-w-2xl mx-3 sm:mx-4',
  xl: 'max-w-xl sm:max-w-2xl lg:max-w-4xl mx-3 sm:mx-4',
};

export function Modal({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="absolute inset-0 bg-[#1b1a17]/45 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className={`relative w-full ${sizeStyles[size]} mx-4 bg-white rounded-lg border border-[var(--border)] shadow-[0_24px_48px_-12px_rgba(27,26,23,0.25)]`}>
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold tracking-tight text-[var(--foreground)]">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-[var(--background-tertiary)] transition-colors"
          >
            <X className="w-5 h-5 text-[var(--foreground-tertiary)]" />
          </button>
        </div>
        <div className="p-4 max-h-[80vh] overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
