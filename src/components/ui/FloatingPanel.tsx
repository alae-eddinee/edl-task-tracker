'use client';

import { ReactNode, RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface FloatingPanelProps {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Defaults to the anchor's width */
  width?: number;
  /** Used to decide whether to flip above the anchor */
  estimatedHeight?: number;
  ariaLabel?: string;
  className?: string;
}

/**
 * Notion-style popover rendered in a portal so scrolling modals can't clip it.
 * Flips above the anchor near the bottom of the screen; closes on outside click or Escape
 * (Escape is stopped so it doesn't also close a modal underneath).
 */
export function FloatingPanel({
  anchorRef,
  open,
  onClose,
  children,
  width,
  estimatedHeight = 240,
  ariaLabel,
  className = 'p-1',
}: FloatingPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const w = width ?? rect.width;
      const height = panelRef.current?.offsetHeight || estimatedHeight;
      const below = window.innerHeight - rect.bottom;
      const top = below < height + 8 && rect.top > height + 8 ? rect.top - height - 6 : rect.bottom + 6;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - w - 8));
      setPosition({ top, left, width: w });
    };
    place();
    // Re-place once the panel has rendered and its real height is known
    const frame = requestAnimationFrame(place);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, anchorRef, width, estimatedHeight]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!panelRef.current?.contains(target) && !anchorRef.current?.contains(target)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        anchorRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open, onClose, anchorRef]);

  if (!open || !position) return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={ariaLabel}
      // React events bubble through portals; don't let menu clicks reach a clickable row behind
      onClick={(e) => e.stopPropagation()}
      style={{ top: position.top, left: position.left, width: position.width }}
      className={`fixed z-[200] bg-white rounded-lg shadow-[var(--shadow-popover)] animate-pop-in ${className}`}
    >
      {children}
    </div>,
    document.body
  );
}
