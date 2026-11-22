'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { WorkspaceProvider, useWorkspace, forgetWorkspace } from '@/lib/client/workspace';
import { Avatar, Icon, Spinner, Toasts } from '@/components/ui';

const NAV = [
  ['', 'Home', 'home'],
  ['/hackathons', 'Hackathons', 'trophy'],
  ['/projects', 'Projects', 'folder'],
  ['/ideas', 'Ideas', 'bulb'],
  ['/chat', 'Chat', 'chat'],
  ['/team', 'Team', 'users'],
  ['/settings', 'Settings', 'settings'],
];

export default function Shell({ wsId, children }) {
  return (
    <WorkspaceProvider wsId={wsId}>
      <Frame>{children}</Frame>
    </WorkspaceProvider>
  );
}

function Frame({ children }) {
  const ctx = useWorkspace();
  const { snap, error, wsId, toasts } = ctx;
  const path = usePathname();
  useDesktopNotifications(ctx);

  if (error === 'auth' || error === 'missing') {
    if (error === 'missing') forgetWorkspace(wsId);
    return (
      <main className="min-h-dvh flex items-center justify-center p-4">
        <div className="card max-w-md w-full p-6 text-center">
          <p className="font-semibold text-lg">{error === 'missing' ? 'Workspace not found' : 'You’re not signed in here'}</p>
          <p className="text-muted mt-2 text-[13.5px]">
            {error === 'missing' ? 'It may have been deleted by its leader.' : 'Open the invite link from your team lead, or a personal sign-in link from a device where you’re already signed in (Team → Sign in on another device).'}
          </p>
          <Link href="/" className="btn mt-5">Go home</Link>
        </div>
      </main>
    );
  }
  if (!snap) return <Spinner label="Loading workspace…" />;

  const base = `/w/${wsId}`;
  const isActive = (href) => (href === '' ? path === base : path.startsWith(base + href));
  const urgent = ctx.actions.filter((a) => a.urgency === 'critical' || a.urgency === 'overdue').length;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="hidden lg:flex flex-col gap-1 border-r border-line p-3 sticky top-0 h-dvh">
        <Link href="/" className="flex items-center gap-2.5 px-2 py-2 mb-2 rounded-lg hover:bg-surface-2" title="All workspaces">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-48.png" alt="" width={28} height={28} className="rounded-md" />
          <span className="min-w-0">
            <span className="block font-semibold truncate leading-tight">{snap.workspace.name}</span>
            <span className="block text-[11.5px] text-faint">{snap.members.length} member{snap.members.length === 1 ? '' : 's'}</span>
          </span>
        </Link>
        {NAV.map(([href, label, icon]) => (
          <Link key={label} href={base + href} className="nav-link" aria-current={isActive(href) ? 'page' : undefined}>
            <Icon name={icon} />{label}
            {href === '' && urgent > 0 && <span className="ml-auto badge badge-red">{urgent}</span>}
          </Link>
        ))}
        <div className="mt-auto flex items-center gap-2.5 px-2 py-2 rounded-lg">
          <Avatar member={snap.me} size={28} />
          <span className="min-w-0">
            <span className="block text-[13px] font-medium truncate">{snap.me.name}</span>
            <span className="block text-[11.5px] text-faint capitalize">{snap.me.role === 'leader' ? 'Team lead' : snap.me.role}</span>
          </span>
        </div>
      </aside>

      <div className="min-w-0 pb-20 lg:pb-0">
        <header className="lg:hidden sticky top-0 z-30 bg-bg/90 backdrop-blur border-b border-line h-12 px-4 flex items-center justify-between">
          <Link href="/" className="font-semibold truncate">{snap.workspace.name}</Link>
          <Link href={`${base}/settings`} aria-label="Settings" className="flex items-center gap-2 text-muted"><Icon name="settings" size={18} /><Avatar member={snap.me} size={26} /></Link>
        </header>
        <main className="max-w-6xl mx-auto px-4 sm:px-6 py-5 sm:py-8">{children}</main>
      </div>

      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-surface/95 backdrop-blur border-t border-line grid grid-cols-6 h-16 pb-[env(safe-area-inset-bottom)]">
        {NAV.filter(([, l]) => l !== 'Settings').map(([href, label, icon]) => (
          <Link key={label} href={base + href} aria-current={isActive(href) ? 'page' : undefined}
            className={`flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium ${isActive(href) ? 'text-accent' : 'text-muted'}`}>
            <span className="relative"><Icon name={icon} size={19} />{href === '' && urgent > 0 && <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-danger" />}</span>
            {label}
          </Link>
        ))}
      </nav>
      <Toasts toasts={toasts} />
    </div>
  );
}

/** Fire a browser notification once per urgent action (when the tab is open). */
function useDesktopNotifications({ actions, wsId }) {
  const first = useRef(true);
  useEffect(() => {
    if (!actions || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    let seen = {};
    try { seen = JSON.parse(localStorage.getItem(`hpt_notified_${wsId}`) || '{}'); } catch { /* ignore */ }
    let changed = false;
    for (const a of actions) {
      if (a.urgency !== 'critical' && a.urgency !== 'overdue' && a.kind !== 'announcement') continue;
      const key = `${a.id}:${a.urgency}`;
      if (seen[key]) continue;
      seen[key] = Date.now(); changed = true;
      if (!first.current || a.urgency === 'critical') {
        try {
          const n = new Notification(a.title, { body: a.detail, icon: '/icon-192.png', tag: key });
          n.onclick = () => { window.focus(); window.location.href = a.href; };
        } catch { /* some mobile browsers only allow SW notifications */ }
      }
    }
    first.current = false;
    if (changed) { try { localStorage.setItem(`hpt_notified_${wsId}`, JSON.stringify(seen)); } catch { /* ignore */ } }
  }, [actions, wsId]);
}
