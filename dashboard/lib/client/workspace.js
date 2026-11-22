'use client';

/**
 * Workspace state for the dashboard. One snapshot of the whole workspace is
 * polled (cheap: the server answers `unchanged` when the revision matches)
 * and every mutation goes through `api()` which refreshes afterwards.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { computeActions } from '@/lib/shared/model';

const Ctx = createContext(null);
const POLL_MS = 8000;

export function rememberWorkspace(id, name) {
  try {
    const list = JSON.parse(localStorage.getItem('hpt_workspaces') || '[]').filter((w) => w.id !== id);
    list.unshift({ id, name, at: Date.now() });
    localStorage.setItem('hpt_workspaces', JSON.stringify(list.slice(0, 12)));
  } catch { /* storage unavailable */ }
}
export function forgetWorkspace(id) {
  try {
    const list = JSON.parse(localStorage.getItem('hpt_workspaces') || '[]').filter((w) => w.id !== id);
    localStorage.setItem('hpt_workspaces', JSON.stringify(list));
  } catch { /* ignore */ }
}
export function rememberedWorkspaces() {
  try { return JSON.parse(localStorage.getItem('hpt_workspaces') || '[]'); } catch { return []; }
}

export function WorkspaceProvider({ wsId, children }) {
  const [snap, setSnap] = useState(null);
  const [error, setError] = useState(null);
  const [toasts, setToasts] = useState([]);
  const revRef = useRef(null);

  const load = useCallback(async (force = false) => {
    try {
      const qs = !force && revRef.current ? `?since=${encodeURIComponent(revRef.current)}` : '';
      const res = await fetch(`/api/w/${wsId}/snapshot${qs}`, { cache: 'no-store' });
      if (res.status === 401) { setError('auth'); return; }
      if (res.status === 404) { setError('missing'); return; }
      if (!res.ok) throw new Error('bad');
      const data = await res.json();
      if (data.unchanged) return;
      revRef.current = data.rev;
      setSnap(data);
      setError(null);
      rememberWorkspace(data.workspace.id, data.workspace.name);
    } catch {
      setError((e) => e || 'offline');
    }
  }, [wsId]);

  useEffect(() => {
    load(true);
    const tick = () => { if (document.visibilityState === 'visible') load(); };
    const id = setInterval(tick, POLL_MS);
    window.addEventListener('focus', tick);
    return () => { clearInterval(id); window.removeEventListener('focus', tick); };
  }, [load]);

  const toast = useCallback((text, kind = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const api = useCallback(async (method, path, body) => {
    const res = await fetch(`/api/w/${wsId}/${path}`, {
      method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch { /* empty */ }
    if (!res.ok) {
      const msg = data.error || 'Request failed';
      toast(msg, 'error');
      throw new Error(msg);
    }
    await load(true);
    return data;
  }, [wsId, load, toast]);

  const value = useMemo(() => {
    if (!snap) return { wsId, snap: null, error, api, toast, reload: load, toasts };
    const memberById = Object.fromEntries(snap.members.map((m) => [m.id, m]));
    const hackById = Object.fromEntries(snap.hackathons.map((h) => [h.id, h]));
    const projectById = Object.fromEntries(snap.projects.map((p) => [p.id, p]));
    const isLead = snap.me.role === 'leader' || snap.me.role === 'admin';
    return {
      wsId, snap, error, api, toast, reload: load, toasts, me: snap.me, isLead,
      memberById, hackById, projectById, actions: computeActions(snap, snap.me.id),
    };
  }, [snap, error, api, toast, load, toasts, wsId]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace() {
  return useContext(Ctx);
}
