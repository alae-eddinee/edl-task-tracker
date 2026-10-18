'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { OnlineUser } from '@/types';

interface OnlineUsersProps {
  currentUserId: string;
}

export function OnlineUsers({ currentUserId }: OnlineUsersProps) {
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);

  useEffect(() => {
    const ENABLE_REALTIME_PRESENCE = false;
    if (!ENABLE_REALTIME_PRESENCE) {
      setOnlineUsers([]);
      return;
    }

    const channel = supabase.channel('online-users', {
      config: {
        presence: {
          key: currentUserId,
        },
      },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const users: OnlineUser[] = [];
        
        Object.entries(state).forEach(([userId, presences]) => {
          const presence = presences[0] as unknown as { user_id: string; user_name: string; online_at: string };
          if (presence && userId !== currentUserId) {
            users.push({
              user_id: presence.user_id,
              user_name: presence.user_name,
              online_at: presence.online_at,
            });
          }
        });
        
        setOnlineUsers(users);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', currentUserId)
            .single();
          
          await channel.track({
            user_id: currentUserId,
            user_name: profile?.full_name || 'Unknown',
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [currentUserId]);

  if (onlineUsers.length === 0) return null;

  return (
    <div className="fixed right-2 sm:right-4 bottom-2 sm:bottom-4 bg-white border border-[var(--border)] rounded-lg shadow-lg p-2 sm:p-3 w-40 sm:w-48 z-30">
      <h3 className="text-xs font-semibold text-[var(--foreground-tertiary)] uppercase mb-2">
        Online Now
      </h3>
      <ul className="space-y-2">
        {onlineUsers.map((user) => (
          <li key={user.user_id} className="flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-xs sm:text-sm text-[var(--foreground)] truncate">{user.user_name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
