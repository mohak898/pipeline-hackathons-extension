'use client';

import { useEffect, useState } from 'react';

/**
 * Hero countdown ticker — JetBrains Mono, tabular-nums.
 * Green glow when variant === 'live'.
 */
export default function CountdownTimer({ targetDate, variant = 'live', className = '' }) {
  const [t, setT] = useState(calc(targetDate));

  useEffect(() => {
    const id = setInterval(() => setT(calc(targetDate)), 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  if (t.total <= 0) return <span className="text-sm text-[#333]">—</span>;

  const glow = variant === 'live' ? 'ticker-value-live' : '';

  return (
    <div className={`flex items-end gap-1 ${className}`}>
      {t.days > 0 && (
        <>
          <Digit value={t.days} label="D" glow={glow} />
          <span className="ticker-colon">:</span>
        </>
      )}
      <Digit value={t.hours} label="H" glow={glow} />
      <span className="ticker-colon">:</span>
      <Digit value={t.minutes} label="M" glow={glow} />
      <span className="ticker-colon">:</span>
      <Digit value={t.seconds} label="S" glow={glow} />
    </div>
  );
}

function Digit({ value, label, glow }) {
  return (
    <div className="flex flex-col items-center min-w-[44px] sm:min-w-[56px]">
      <span className={`ticker-value ${glow}`}>{String(value).padStart(2, '0')}</span>
      <span className="ticker-label">{label}</span>
    </div>
  );
}

function calc(target) {
  const total = new Date(target).getTime() - Date.now();
  if (total <= 0) return { total: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
  return {
    total,
    days: Math.floor(total / 86400000),
    hours: Math.floor((total / 3600000) % 24),
    minutes: Math.floor((total / 60000) % 60),
    seconds: Math.floor((total / 1000) % 60),
  };
}
