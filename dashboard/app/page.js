/* v3.1 — Premium SaaS Landing (Centered & Clean) */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  const [token, setToken] = useState('');

  const handleGo = () => {
    const t = token.trim();
    if (!t) return;
    const match = t.match(/\/share\/([a-zA-Z0-9_-]+)/);
    router.push(`/share/${match ? match[1] : t}`);
  };

  return (
    <main className="min-h-screen flex flex-col">
      {/* ── NAV ────────────────────────────────────────────── */}
      <nav className="glass-nav sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src="/icons/icon-128.png" 
              alt="HPT Logo" 
              className="w-8 h-8 rounded-lg object-cover bg-[#0a0a0a] border border-white/[0.04]" 
            />
            <span className="text-[13px] font-semibold tracking-tight text-[#e5e5e5]">Pipeline Tracker</span>
          </div>
          <div className="flex items-center">
            <a
              href={process.env.NEXT_PUBLIC_EXTENSION_LINK || '#'}
              className="btn-primary px-5 py-2 text-[13px]"
            >
              Download Extension
            </a>
          </div>
        </div>
      </nav>

      {/* ── HERO ───────────────────────────────────────────── */}
      <section className="flex-1 flex flex-col items-center justify-center px-8 py-24 sm:py-32">
        <div className="max-w-2xl text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/[0.06] bg-white/[0.02] text-[11px] text-[#666] font-medium tracking-wider uppercase mb-8">
            <span className="live-dot" />
            Now tracking Devfolio · Devpost · Unstop
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.1] text-[#f0f0f0] mb-6">
            Never Miss a Deadline.<br />
            <span className="text-[#3b82f6]">Pipeline. </span>
            <span className="text-[#22c55e]">Visualized.</span>
          </h1>

          <p className="text-base sm:text-lg text-[#555] leading-relaxed max-w-lg mx-auto mb-12">
            Your entire hackathon pipeline, centralized and visualized. Passively tracks deadlines as you browse — zero config, zero manual entry.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href={process.env.NEXT_PUBLIC_EXTENSION_LINK || '#'}
              className="btn-primary"
            >
              Get Extension
            </a>
          </div>
        </div>

        {/* ── SHARED LINK (INPUT BOX) RIGHT BELOW HERO ───────── */}
        <div id="shared" className="glass-card w-full max-w-xl mx-auto p-10 text-center border-white/[0.08] shadow-2xl relative z-10 hidden sm:block mb-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#22c55e] mb-3">Team Links</p>
          <h2 className="text-xl font-bold tracking-tight text-[#f0f0f0] mb-2">
            Have a team link?
          </h2>
          <p className="text-[#666] text-[13px] mb-6">Paste your shared token directly to access the dashboard timeline.</p>

          <div className="flex gap-3 max-w-md mx-auto">
            <input
              type="text"
              className="share-input flex-1 bg-white/10 placeholder-white/30 text-white border-white/20 focus:border-[#22c55e] focus:bg-white/[0.15] transition-colors"
              placeholder="Paste token or link…"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGo()}
            />
            <button onClick={handleGo} className="btn-primary px-6 shrink-0 shadow-none">
              Go
            </button>
          </div>
        </div>

        {/* Mobile Input Container */}
        <div className="w-full max-w-md mx-auto text-center sm:hidden mb-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#22c55e] mb-2">Team Links</p>
          <div className="flex gap-2">
            <input
              type="text"
              className="share-input flex-1 bg-white/10 placeholder-white/30 text-white border-white/20 focus:border-[#22c55e]"
              placeholder="Paste token…"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGo()}
            />
            <button onClick={handleGo} className="btn-primary px-4 shrink-0 shadow-none">
              Go
            </button>
          </div>
        </div>

      </section>

      {/* ── FEATURES ───────────────────────────────────────── */}
      <section id="features" className="px-8 py-24 border-t border-white/[0.03]">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#444] mb-4">Features</p>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#f0f0f0] mb-16 mx-auto">
            Built for speed. Designed for teams.
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="glass-card p-8 flex flex-col items-center">
              <div className="feature-icon text-xl text-[#e5e5e5] mx-auto">🕵️</div>
              <h3 className="text-[14px] font-semibold text-[#e5e5e5] mb-2 text-center">Stealth Extraction</h3>
              <p className="text-[13px] text-[#555] leading-relaxed text-center">
                Intercepts API responses smoothly.
              </p>
            </div>
            <div className="glass-card p-8 flex flex-col items-center">
              <div className="feature-icon text-xl text-[#3b82f6] mx-auto">☁️</div>
              <h3 className="text-[14px] font-semibold text-[#e5e5e5] mb-2 text-center">Cloud Sync</h3>
              <p className="text-[13px] text-[#555] leading-relaxed text-center">
                Globally synced and up-to-date.
              </p>
            </div>
            <div className="glass-card p-8 flex flex-col items-center">
              <div className="feature-icon text-xl text-[#22c55e] mx-auto">⏱️</div>
              <h3 className="text-[14px] font-semibold text-[#e5e5e5] mb-2 text-center">Live Timers</h3>
              <p className="text-[13px] text-[#555] leading-relaxed text-center">
                Monospace tabular numbers tick smoothly.
              </p>
            </div>
            <div className="glass-card p-8 flex flex-col items-center">
              <div className="feature-icon text-xl text-[#fb923c] mx-auto">🔗</div>
              <h3 className="text-[14px] font-semibold text-[#e5e5e5] mb-2 text-center">Share Links</h3>
              <p className="text-[13px] text-[#555] leading-relaxed text-center">
                One link to sync your whole team.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.03] mt-auto">
        <div className="max-w-4xl mx-auto px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <img 
              src="/icons/icon-128.png" 
              alt="HPT Logo" 
              className="w-6 h-6 rounded-md object-contain bg-[#0a0a0a]" 
            />
            <span className="text-[12px] font-semibold text-[#555]">Hackathon Pipeline Tracker</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#" className="text-[11px] text-[#444] hover:text-[#e5e5e5]">About HPT</a>
            <a href="#" className="text-[11px] text-[#444] hover:text-[#e5e5e5]">Privacy</a>
          </div>
          <p className="text-[11px] text-[#333]">
            © {new Date().getFullYear()} HPT · Built for Hikity
          </p>
        </div>
      </footer>
    </main>
  );
}
