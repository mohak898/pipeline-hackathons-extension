'use client';

import { useEffect, useRef, useState } from 'react';
import { PLATFORM_META, initials, relTime } from '@/lib/client/format';
import { STAGES } from '@/lib/shared/model';

export function Icon({ name, size = 16, className = '' }) {
  const p = {
    home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
    trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3',
    folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z',
    chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
    users: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8',
    settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
    plus: 'M12 5v14M5 12h14',
    link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
    external: 'M14 3h7v7M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5',
    check: 'M20 6 9 17l-5-5',
    x: 'M18 6 6 18M6 6l12 12',
    clock: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
    bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
    megaphone: 'M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13',
    up: 'M12 19V5M5 12l7-7 7 7',
    trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6',
    edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z',
    calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
    puzzle: 'M19.4 13a1.6 1.6 0 1 0 0-3H18V7a1 1 0 0 0-1-1h-3V4.6a1.6 1.6 0 1 0-3 0V6H8a1 1 0 0 0-1 1v3H5.6a1.6 1.6 0 1 0 0 3H7v4a1 1 0 0 0 1 1h3v-1.4a1.6 1.6 0 1 1 3 0V18h3a1 1 0 0 0 1-1v-4z',
    menu: 'M4 6h16M4 12h16M4 18h16',
    copy: 'M9 9h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
    send: 'M22 2 11 13M22 2l-7 20-4-9-9-4z',
    archive: 'M3 4h18v4H3zM5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4',
    sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
    list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
    board: 'M3 3h7v18H3zM14 3h7v11h-7z',
  }[name];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`} aria-hidden="true">
      <path d={p} />
    </svg>
  );
}

export function Avatar({ member, size = 26 }) {
  if (!member) return null;
  return (
    <span title={member.name} className="inline-flex items-center justify-center rounded-full font-semibold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.4, background: `${member.color}26`, color: member.color, border: `1px solid ${member.color}55` }}>
      {initials(member.name)}
    </span>
  );
}

export function AvatarStack({ members, size = 24, max = 5 }) {
  const shown = members.slice(0, max);
  return (
    <span className="inline-flex items-center">
      {shown.map((m, i) => (
        <span key={m.id} style={{ marginLeft: i ? -6 : 0 }} className="rounded-full ring-2 ring-[var(--surface)]"><Avatar member={m} size={size} /></span>
      ))}
      {members.length > max && <span className="ml-1 text-xs text-muted">+{members.length - max}</span>}
    </span>
  );
}

export function PlatformBadge({ platform, size = 32 }) {
  const meta = PLATFORM_META[platform] || PLATFORM_META.web;
  if (meta.img) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={meta.img} alt={meta.label} width={size} height={size} className="rounded-lg object-contain bg-white shrink-0" style={{ width: size, height: size }} />;
  }
  return (
    <span className="inline-flex items-center justify-center rounded-lg font-bold text-white shrink-0" style={{ width: size, height: size, background: meta.color, fontSize: size * 0.38 }}>
      {meta.label.slice(0, 2)}
    </span>
  );
}

const STAGE_COLORS = { discovered: '', shortlisted: 'badge-violet', registered: 'badge-blue', building: 'badge-amber', submitted: 'badge-green', done: '' };
export function StageBadge({ stage }) {
  const s = STAGES.find((x) => x.id === stage);
  return <span className={`badge ${STAGE_COLORS[stage] || ''}`}>{s?.label || stage}</span>;
}

export function UrgencyBadge({ urgency }) {
  const map = { overdue: ['badge-red', 'Overdue'], critical: ['badge-red', 'Urgent'], soon: ['badge-amber', 'Soon'], info: ['', 'Upcoming'] };
  const [cls, label] = map[urgency] || map.info;
  return <span className={`badge ${cls}`}>{label}</span>;
}

export function Countdown({ at, className = '' }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!at) return null;
  const diff = new Date(at).getTime() - now;
  if (diff <= 0) return <span className={`mono text-faint ${className}`}>passed</span>;
  const d = Math.floor(diff / 864e5);
  const h = Math.floor((diff % 864e5) / 36e5);
  const m = Math.floor((diff % 36e5) / 6e4);
  const s = Math.floor((diff % 6e4) / 1e3);
  const pad = (n) => String(n).padStart(2, '0');
  const tone = diff < 864e5 ? 'text-danger' : diff < 3 * 864e5 ? 'text-warn' : 'text-ink';
  return <span className={`mono font-semibold ${tone} ${className}`}>{d > 0 ? `${d}d ` : ''}{pad(h)}:{pad(m)}:{pad(s)}</span>;
}

export function TimeAgo({ at }) {
  return <span title={at ? new Date(at).toLocaleString() : ''}>{relTime(at)}</span>;
}

export function Modal({ open, onClose, title, children, footer, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    const first = ref.current?.querySelector('input, textarea, select');
    first?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title}
        className={`card w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'} max-h-[92vh] flex flex-col rounded-b-none sm:rounded-b-[14px]`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-line flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="label">{label}</span>}
      {children}
      {hint && <span className="block mt-1 text-xs text-faint">{hint}</span>}
    </label>
  );
}

export function Empty({ icon = 'sparkle', title, children, action }) {
  return (
    <div className="card border-dashed px-6 py-10 text-center flex flex-col items-center">
      <span className="w-10 h-10 rounded-xl bg-surface-3 text-muted inline-flex items-center justify-center mb-3"><Icon name={icon} size={20} /></span>
      <p className="font-semibold">{title}</p>
      {children && <p className="text-muted text-[13px] mt-1 max-w-sm">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ label }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted">
      <div className="spinner" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  );
}

export function CopyButton({ text, label = 'Copy', className = 'btn btn-sm' }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className={className} onClick={async () => {
      try { await navigator.clipboard.writeText(text); } catch {
        const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
      }
      setDone(true); setTimeout(() => setDone(false), 1500);
    }}>
      <Icon name={done ? 'check' : 'copy'} size={14} />{done ? 'Copied' : label}
    </button>
  );
}

/** Plain text with clickable links + preserved line breaks (no HTML injection). */
export function RichText({ text, className = '' }) {
  const parts = String(text || '').split(/(https?:\/\/[^\s]+)/g);
  return (
    <div className={`prose-lite ${className}`}>
      {parts.map((p, i) => (/^https?:\/\//.test(p)
        ? <a key={i} href={p} target="_blank" rel="noopener noreferrer">{p}</a>
        : <span key={i}>{p}</span>))}
    </div>
  );
}

export function Toasts({ toasts }) {
  return (
    <div className="fixed z-[60] bottom-20 lg:bottom-6 right-4 left-4 sm:left-auto flex flex-col gap-2 items-end pointer-events-none" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`card px-4 py-2.5 text-[13px] font-medium pointer-events-auto max-w-sm ${t.kind === 'error' ? 'text-danger' : ''}`}>
          {t.kind === 'error' ? '⚠ ' : '✓ '}{t.text}
        </div>
      ))}
    </div>
  );
}

export function Segmented({ value, onChange, options }) {
  return (
    <div className="inline-flex p-0.5 rounded-[10px] bg-surface-2 border border-line">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={`h-7 px-3 rounded-[8px] text-[12.5px] font-semibold inline-flex items-center gap-1.5 ${value === o.value ? 'bg-surface-3 text-ink' : 'text-muted hover:text-ink'}`}>
          {o.icon && <Icon name={o.icon} size={14} />}{o.label}
        </button>
      ))}
    </div>
  );
}
