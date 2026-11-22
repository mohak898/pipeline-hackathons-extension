'use client';

import { useEffect, useRef, useState } from 'react';
import { useWorkspace } from '@/lib/client/workspace';
import { Avatar, Icon, RichText, TimeAgo } from '@/components/ui';

/** Discussion thread. threadType: general | hackathon | project | idea */
export default function Thread({ threadType = 'general', threadId = 'general', tall = false, placeholder = 'Write a message…' }) {
  const { snap, api, memberById, me, isLead } = useWorkspace();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  const msgs = snap.messages.filter((m) => m.threadType === threadType && m.threadId === threadId);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [msgs.length]);

  async function send(e) {
    e?.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try { await api('POST', 'messages', { threadType, threadId, body: text }); setText(''); } catch { /* toast */ }
    setBusy(false);
  }

  return (
    <div className="card flex flex-col">
      <div className={`overflow-y-auto px-4 py-3 flex flex-col gap-3 ${tall ? 'h-[calc(100dvh-280px)] min-h-[320px]' : 'max-h-[380px]'}`}>
        {msgs.length === 0 && <p className="text-muted text-[13px] py-6 text-center">No messages yet — start the conversation.</p>}
        {msgs.map((m, i) => {
          const who = memberById[m.authorId];
          const grouped = i > 0 && msgs[i - 1].authorId === m.authorId && new Date(m.createdAt) - new Date(msgs[i - 1].createdAt) < 5 * 60000;
          return (
            <div key={m.id} className={`group flex gap-2.5 ${grouped ? '-mt-2' : ''}`}>
              <div className="w-7 shrink-0">{!grouped && <Avatar member={who} size={28} />}</div>
              <div className="min-w-0 flex-1">
                {!grouped && <p className="text-[12.5px]"><span className="font-semibold">{who?.name || 'Former member'}</span> <span className="text-faint"><TimeAgo at={m.createdAt} /></span></p>}
                <RichText text={m.body} className="text-[13.5px]" />
              </div>
              {(m.authorId === me.id || isLead) && (
                <button className="btn btn-ghost btn-sm btn-icon opacity-0 group-hover:opacity-100 focus:opacity-100" title="Delete" onClick={() => api('DELETE', `messages/${m.id}`)}><Icon name="trash" size={13} /></button>
              )}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form onSubmit={send} className="border-t border-line p-2.5 flex gap-2 items-end">
        <textarea className="input min-h-[38px] h-[38px] max-h-40" rows={1} value={text} placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <button className="btn btn-primary btn-icon h-[38px] w-[38px]" disabled={busy || !text.trim()} aria-label="Send"><Icon name="send" size={15} /></button>
      </form>
    </div>
  );
}
