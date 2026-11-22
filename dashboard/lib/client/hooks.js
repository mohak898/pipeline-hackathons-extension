'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

const noop = () => () => {};

/** window.location.origin on the client, '' during SSR (no hydration mismatch). */
export function useOrigin() {
  return useSyncExternalStore(noop, () => window.location.origin, () => '');
}

/** Current time, refreshed every `ms`. */
export function useNow(ms = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** Notification permission ('unsupported' on SSR / old browsers). */
export function useNotificationPermission() {
  const [bump, setBump] = useState(0);
  const perm = useSyncExternalStore(noop,
    () => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission),
    () => 'unsupported');
  return [perm, async () => { await Notification.requestPermission(); setBump(bump + 1); }];
}
