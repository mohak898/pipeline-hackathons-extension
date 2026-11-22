'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useOrigin } from '@/lib/client/hooks';
import { useWorkspace, forgetWorkspace } from '@/lib/client/workspace';
import { CopyButton, Field, Icon, TimeAgo } from '@/components/ui';

export default function SettingsPage() {
  const { snap, isLead, me } = useWorkspace();
  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted text-[13px]">{isLead ? 'Workspace settings and your integrations.' : 'Your integrations. Workspace settings are managed by the team lead.'}</p>
      </div>
      {isLead && <General />}
      <Extension />
      <Calendar />
      {isLead ? <Reminders /> : <section className="card p-5"><p className="font-semibold">Team reminders</p><p className="text-muted text-[13px] mt-1">{snap.workspace.settings?.webhookConfigured ? 'Deadline reminders are posted to the team’s Discord/Slack channel.' : 'Ask your lead to connect a Discord or Slack channel for deadline reminders.'}</p></section>}
      {isLead && <PublicShare />}
      <Danger me={me} />
    </div>
  );
}

function Card({ id, title, desc, children }) {
  return (
    <section id={id} className="card p-5 scroll-mt-6">
      <p className="font-semibold">{title}</p>
      {desc && <p className="text-muted text-[13px] mt-0.5 mb-4">{desc}</p>}
      {children}
    </section>
  );
}

function General() {
  const { snap, api, toast } = useWorkspace();
  const [name, setName] = useState(snap.workspace.name);
  return (
    <Card title="Workspace">
      <form className="flex gap-2 mt-3" onSubmit={async (e) => { e.preventDefault(); await api('PATCH', 'workspace', { name }); toast('Renamed'); }}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        <button className="btn" disabled={name === snap.workspace.name}>Save</button>
      </form>
    </Card>
  );
}

function Extension() {
  const { snap, api } = useWorkspace();
  const [pair, setPair] = useState(null);
  return (
    <Card id="extension" title="Chrome extension" desc="Install the extension on any laptop (usually the lead’s) and connect it here. Hackathon pages it sees land in the Inbox — deduplicated — for the whole team.">
      <ol className="text-[13px] text-muted list-decimal pl-5 mb-4 flex flex-col gap-1">
        <li>Load the extension (chrome://extensions → Developer mode → Load unpacked → repo folder).</li>
        <li>Click “Create connection code”, then paste it into the extension’s Settings tab.</li>
      </ol>
      <button className="btn btn-primary" onClick={async () => {
        const r = await api('POST', 'devices', { label: navigator.userAgent.includes('Mac') ? 'Mac · Chrome' : 'Chrome extension' });
        setPair(`${r.apiBase}#${r.token}`);
      }}><Icon name="puzzle" size={14} />Create connection code</button>
      {pair && (
        <div className="mt-3 rounded-[10px] bg-surface-2 p-3">
          <p className="text-[12.5px] text-muted mb-2">Shown once. Paste it into the extension → Settings → Connect.</p>
          <div className="flex gap-2"><input readOnly className="input mono text-[11.5px]" value={pair} onFocus={(e) => e.target.select()} /><CopyButton text={pair} /></div>
        </div>
      )}
      {snap.devices.length > 0 && (
        <div className="mt-4">
          <p className="section-title mb-2">Your connected extensions</p>
          {snap.devices.map((d) => (
            <div key={d.id} className="flex items-center gap-3 py-1.5 text-[13px]">
              <Icon name="puzzle" size={14} className="text-muted" />
              <span className="flex-1">{d.label} <span className="text-faint">· last sync {d.lastUsedAt ? <TimeAgo at={d.lastUsedAt} /> : 'never'}</span></span>
              <button className="btn btn-sm btn-danger" onClick={() => api('DELETE', `devices/${d.id}`)}>Disconnect</button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Calendar() {
  const { snap, wsId } = useWorkspace();
  const origin = useOrigin();
  const feed = `${origin}/api/cal/${wsId}/${snap.workspace.calendarKey}.ics`;
  const webcal = feed.replace(/^https?:/, 'webcal:');
  return (
    <Card id="calendar" title="Calendar feed" desc="Subscribe once and every deadline (with 24h + 2h alerts) shows up on your phone’s calendar — works for everyone, no extension needed.">
      <div className="flex flex-wrap gap-2">
        <input readOnly className="input flex-1 min-w-[220px] mono text-[11.5px]" value={feed} onFocus={(e) => e.target.select()} />
        <CopyButton text={feed} label="Copy URL" className="btn" />
        <a className="btn" href={webcal}>Apple / Outlook</a>
        <a className="btn" href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`} target="_blank" rel="noopener noreferrer">Google Calendar</a>
      </div>
      <p className="text-[12px] text-faint mt-2">Only shortlisted and later hackathons are included. Google needs a publicly reachable URL (not localhost).</p>
    </Card>
  );
}

function Reminders() {
  const { snap, api, toast } = useWorkspace();
  const s = snap.workspace.settings || {};
  const [hook, setHook] = useState(s.webhookUrl || '');
  const [offsets, setOffsets] = useState((s.reminderOffsets || [72, 24, 3]).join(', '));
  return (
    <Card id="reminders" title="Team reminders (Discord / Slack)" desc="Posts deadline reminders to your team channel — and names who still hasn’t registered.">
      <form className="flex flex-col gap-3" onSubmit={async (e) => {
        e.preventDefault();
        await api('PATCH', 'workspace', { settings: { webhookUrl: hook.trim() || null, reminderOffsets: offsets.split(',').map((x) => Number(x.trim())).filter(Boolean) } });
        toast('Saved');
      }}>
        <Field label="Incoming webhook URL" hint="Discord: Channel → Edit → Integrations → Webhooks → Copy URL. Slack: an Incoming Webhook app.">
          <input className="input mono text-[12px]" value={hook} onChange={(e) => setHook(e.target.value)} placeholder="https://discord.com/api/webhooks/…" />
        </Field>
        <Field label="Remind this many hours before each deadline"><input className="input" value={offsets} onChange={(e) => setOffsets(e.target.value)} /></Field>
        <div className="flex gap-2">
          <button className="btn btn-primary">Save</button>
          <button type="button" className="btn" disabled={!s.webhookUrl} onClick={async () => { try { await api('POST', 'test-webhook', {}); toast('Test message sent'); } catch { /* toast */ } }}>Send test</button>
        </div>
        <p className="text-[12px] text-faint">Delivery runs from the server’s scheduled job (<span className="kbd">/api/cron/reminders</span>) — see README → Reminders.</p>
      </form>
    </Card>
  );
}

function PublicShare() {
  const { snap, api } = useWorkspace();
  const origin = useOrigin();
  const token = snap.workspace.publicToken;
  return (
    <Card title="Public read-only timeline" desc="A link anyone can open (mentors, friends) showing shortlisted hackathons and deadlines. No chat, ideas or team data.">
      {token ? (
        <div className="flex flex-wrap gap-2">
          <input readOnly className="input flex-1 min-w-[220px] mono text-[11.5px]" value={`${origin}/share/${token}`} />
          <CopyButton text={`${origin}/share/${token}`} className="btn" />
          <button className="btn btn-danger" onClick={() => api('PATCH', 'workspace', { publicShare: false })}>Turn off</button>
        </div>
      ) : <button className="btn" onClick={() => api('PATCH', 'workspace', { publicShare: true })}><Icon name="link" size={14} />Create public link</button>}
    </Card>
  );
}

function Danger({ me }) {
  const { api, wsId, snap } = useWorkspace();
  const router = useRouter();
  return (
    <Card title="Session">
      <div className="flex flex-wrap gap-2 mt-3">
        <button className="btn" onClick={async () => { await fetch(`/api/w/${wsId}/logout`, { method: 'POST' }); forgetWorkspace(wsId); router.push('/'); }}>Sign out on this device</button>
        {me.role === 'leader' && (
          <button className="btn btn-danger" onClick={async () => {
            const typed = prompt(`This permanently deletes “${snap.workspace.name}” for everyone. Type the workspace name to confirm.`);
            if (typed !== snap.workspace.name) return;
            await api('DELETE', 'workspace').catch(() => {}); forgetWorkspace(wsId); router.push('/');
          }}>Delete workspace</button>
        )}
      </div>
    </Card>
  );
}
