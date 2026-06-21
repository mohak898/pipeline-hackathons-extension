'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { resolveShareLink } from '@/lib/firestore';
import Timeline from '@/components/Timeline';

export default function SharePage() {
  const params = useParams();
  const token = params.token;

  const [state, setState] = useState('loading');
  const [events, setEvents] = useState([]);

  useEffect(() => {
    if (!token) { setState('error'); return; }
    resolveShareLink(token)
      .then((r) => {
        if (!r) { setState('expired'); return; }
        setEvents(r.events);
        setState(r.events.length > 0 ? 'ready' : 'expired');
      })
      .catch(() => setState('error'));
  }, [token]);

  useEffect(() => {
    if (state !== 'ready') return;
    const id = setInterval(() => {
      resolveShareLink(token).then((r) => { if (r?.events) setEvents(r.events); });
    }, 60_000);
    return () => clearInterval(id);
  }, [state, token]);

  return (
    <main className="min-h-screen flex flex-col relative">
      {/* ── HEADER (CENTRALIZED) ─────────────────────────── */}
      <header className="max-w-4xl mx-auto px-8 pt-24 pb-16 text-center">
        <img 
          src="/icons/icon-128.png" 
          alt="HPT Logo" 
          className="w-16 h-16 mx-auto mb-6 rounded-2xl object-cover shadow-2xl border border-white/[0.06]"
        />
        <h1 className="text-4xl font-bold tracking-tight text-[#f0f0f0] mb-3">
          Hackathon Pipeline Dashboard
        </h1>
        <p className="text-sm font-medium tracking-[0.12em] uppercase text-[#666]">
          Shared Timeline
        </p>
      </header>

      {/* ── CONTENT ────────────────────────────────────────── */}
      <div className="flex-1 max-w-4xl w-full mx-auto px-8 pb-32">
        {state === 'loading' && (
          <div className="flex flex-col items-center justify-center py-32">
            <div className="spinner mb-6" />
            <p className="text-[#444] text-sm">Loading timeline…</p>
          </div>
        )}

        {state === 'error' && (
          <div className="text-center py-32 glass-card">
            <p className="text-5xl mb-6 opacity-20">✕</p>
            <h2 className="text-xl font-semibold mb-3 text-[#e5e5e5]">Invalid Link</h2>
            <p className="text-[#444] text-sm max-w-sm mx-auto">This share link doesn&apos;t exist or has been corrupted.</p>
          </div>
        )}

        {state === 'expired' && (
          <div className="text-center py-32 glass-card">
            <p className="text-5xl mb-6 opacity-20">⏱</p>
            <h2 className="text-xl font-semibold mb-3 text-[#e5e5e5]">Link Expired</h2>
            <p className="text-[#444] text-sm max-w-sm mx-auto">Events are removed 48 hours after ending.</p>
          </div>
        )}

        {state === 'ready' && (
          <Timeline events={events} />
        )}
      </div>

      {/* ── FOOTER ─────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.03]">
        <div className="max-w-4xl mx-auto px-8 py-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/icons/icon-128.png" alt="HPT" className="w-6 h-6 rounded-md" />
            <span className="text-[11px] text-[#333]">Pipeline Tracker</span>
          </div>
          <p className="text-[10px] text-[#222]">Read-only shared view</p>
        </div>
      </footer>
    </main>
  );
}
