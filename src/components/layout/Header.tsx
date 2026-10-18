'use client';

import Image from 'next/image';
import { useCallback, useRef, useState } from 'react';
import { Bell, ChevronDown, KeyRound, LogOut } from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import { FloatingPanel } from '@/components/ui/FloatingPanel';
import { ChangePasswordModal } from './ChangePasswordModal';
import { Profile } from '@/types';
import { useAuth } from '@/hooks';

interface HeaderProps {
  user: Profile | null;
  onLogout?: () => void;
  // Shows the inbox bell when provided
  unreadCount?: number;
  onNotificationsClick?: () => void;
}

const roleColors = {
  admin: 'danger',
  manager: 'primary',
  employee: 'secondary',
} as const;

export function Header({ user, onLogout, unreadCount = 0, onNotificationsClick }: HeaderProps) {
  const { signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const accountRef = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const handleLogout = async () => {
    if (onLogout) {
      onLogout();
    } else {
      await signOut();
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <>
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-[var(--border)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-2 h-16">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <Image src="/brand/logo-mark.svg" alt="" width={28} height={28} className="w-6 h-6 sm:w-7 sm:h-7 shrink-0" priority />
            <h1 className="text-base sm:text-xl font-semibold whitespace-nowrap truncate text-[var(--foreground)]">
              EDL &amp; Task Tracker
            </h1>
          </div>

          {user && (
            <div className="flex items-center gap-2 sm:gap-4 shrink-0">
              <div className="flex items-center gap-2 sm:gap-3">
                {/* Account menu */}
                <button
                  ref={accountRef}
                  type="button"
                  onClick={() => setMenuOpen((o) => !o)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  title="Account"
                  className="flex items-center gap-2 sm:gap-3 -ml-1 pl-1 pr-1 sm:pr-2 py-1 rounded-lg text-left hover:bg-[var(--hover)] transition-colors"
                >
                  <span className="w-9 h-9 rounded-full bg-[#454954] flex items-center justify-center text-white font-medium text-sm shrink-0">
                    {getInitials(user.full_name)}
                  </span>
                  <span className="hidden sm:block">
                    <span className="block text-sm font-medium text-[var(--foreground)]">{user.full_name}</span>
                    <span className="block text-xs text-[var(--foreground-tertiary)]">{user.email}</span>
                  </span>
                  <ChevronDown className="hidden sm:block w-3.5 h-3.5 text-[var(--foreground-tertiary)]" />
                </button>
                <FloatingPanel anchorRef={accountRef} open={menuOpen} onClose={closeMenu} width={220} estimatedHeight={110} ariaLabel="Account">
                  <div className="px-2 py-1.5 sm:hidden">
                    <p className="text-sm font-medium text-[var(--foreground)] truncate">{user.full_name}</p>
                    <p className="text-xs text-[var(--foreground-tertiary)] truncate">{user.email}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setMenuOpen(false); setShowChangePassword(true); }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left text-[var(--foreground)] hover:bg-[var(--hover)]"
                  >
                    <KeyRound className="w-4 h-4 text-[var(--foreground-tertiary)]" />
                    Change password
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMenuOpen(false); handleLogout(); }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left text-[var(--danger)] hover:bg-[var(--hover)]"
                  >
                    <LogOut className="w-4 h-4" />
                    Log out
                  </button>
                </FloatingPanel>
                <span className="hidden sm:inline-flex">
                  <Badge variant={roleColors[user.role]}>
                    {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                  </Badge>
                </span>
              </div>
              {onNotificationsClick && (
                <button
                  onClick={onNotificationsClick}
                  title="Notifications"
                  className="relative p-2 rounded-lg hover:bg-[var(--background-tertiary)] transition-colors"
                >
                  <Bell className="w-5 h-5 text-[var(--foreground-secondary)]" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--danger)] text-white text-[10px] font-bold flex items-center justify-center">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </button>
              )}
              <Button variant="danger" size="sm" onClick={handleLogout}>
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
    {/* Outside <header>: its backdrop-blur would otherwise trap the fixed-position modal */}
    {user && (
      <ChangePasswordModal isOpen={showChangePassword} onClose={() => setShowChangePassword(false)} email={user.email} />
    )}
    </>
  );
}
