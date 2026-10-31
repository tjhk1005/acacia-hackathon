'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { planningRequest, SESSION_STORAGE, type Session } from '@/lib/planning-api';
import type { ControllerState } from '@/lib/controller';
import { unreadReplies } from '@/lib/progress';

export function ProgressNotice({ className }: { className?: string }) {
  const [count, setCount] = useState(0);
  const [available, setAvailable] = useState(false);
  const [replies, setReplies] = useState(0);
  useEffect(() => {
    let active = true; let fetching = false;
    async function refresh() {
      if (document.visibilityState !== 'visible' || fetching) return;
      fetching = true;
      try {
        const saved = sessionStorage.getItem(SESSION_STORAGE);
        if (!saved) { if (active) setAvailable(false); return; }
        const session: Session = JSON.parse(saved);
        if (typeof session.id !== 'string' || typeof session.token !== 'string') return;
        const state = await planningRequest<ControllerState>(`/api/weddings/${session.id}/controller`, session);
        if (active) {
          setCount(state.counts.needs_you ?? 0); setAvailable(true);
          try { setReplies(unreadReplies(state,localStorage)); } catch { setReplies(0); }
        }
      } catch { if (active) setAvailable(false); }
      finally { fetching = false; }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30000);
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  return <Link href="/controller" className={className} aria-label={available && (count || replies) ? `Planning progress: ${count} tasks need you, ${replies} new vendor replies` : 'Planning progress'}>
    <Bell size={16} />Planning progress{available && count > 0 && <span className="progress-count">{count} need you</span>}{available && replies>0&&<span className="progress-count">{replies} new</span>}
  </Link>;
}
