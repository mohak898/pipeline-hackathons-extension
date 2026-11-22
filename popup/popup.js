/**
 * Popup — v1.0
 * Tabs: Pipeline (workspace or local list) · This page (capture any site) ·
 * Settings (pair with a workspace).
 */
import { extractHackathon } from '../utils/shared/extract.js';
import { collectPagePrimitives } from '../utils/page-collect.js';

const $ = (sel) => document.querySelector(sel);
const send = (type, payload) => chrome.runtime.sendMessage({ type, payload });

const STAGE_LABEL = {
  discovered: 'Inbox', shortlisted: 'Shortlisted', registered: 'Registered',
  building: 'Building', submitted: 'Submitted', done: 'Done',
};
const STAGE_ORDER = ['building', 'registered', 'shortlisted', 'discovered', 'submitted', 'done'];
const DEADLINES = [
  ['registrationDeadline', 'Reg closes'],
  ['startTime', 'Starts'],
  ['submissionDeadline', 'Submit by'],
  ['endTime', 'Ends'],
];

let state = null;

/* ── helpers ─────────────────────────────────────────────────────── */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('is-on');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('is-on'), ms);
}
function nextDeadline(h, now = Date.now()) {
  let best = null;
  for (const [f, label] of DEADLINES) {
    const t = h[f] ? new Date(h[f]).getTime() : NaN;
    if (!Number.isNaN(t) && t > now && (!best || t < best.t)) best = { t, label };
  }
  return best;
}
function fmtLeft(ms) {
  const d = Math.floor(ms / 864e5); const h = Math.floor((ms % 864e5) / 36e5); const m = Math.floor((ms % 36e5) / 6e4);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function isoToLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function localInputToIso(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/* ── tabs ────────────────────────────────────────────────────────── */
function showTab(name) {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === name));
  for (const id of ['pipeline', 'page', 'settings']) $(`#tab-${id}`).hidden = id !== name;
  if (name === 'page') loadPage();
}
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

/* ── pipeline ────────────────────────────────────────────────────── */
async function loadState() {
  state = await send('GET_STATE');
  renderHeader();
  renderPipeline();
  renderSettings();
}

function renderHeader() {
  const c = state.connection;
  $('#ws-label').textContent = c ? `${c.workspace?.name || 'Workspace'} · ${c.member?.name || ''}` : 'Local only — not connected';
  const dash = $('#open-dashboard');
  dash.hidden = !c?.dashboardUrl;
  if (c?.dashboardUrl) dash.href = c.dashboardUrl;
  $('#stage-field').hidden = !c;
}

function renderPipeline() {
  const c = state.connection;
  const banner = $('#banner');
  banner.hidden = true;
  banner.className = 'banner';
  if (!c) {
    banner.hidden = false;
    banner.innerHTML = 'Captures are only on this laptop. <b>Connect your team workspace</b> so everyone sees them on the dashboard.<br><button class="btn btn--ghost btn--sm" id="go-settings">Connect</button>';
    $('#go-settings').addEventListener('click', () => showTab('settings'));
  } else if (c.error) {
    banner.hidden = false;
    banner.classList.add('banner--warn');
    banner.textContent = `Sync problem: ${c.error}`;
  }

  const remote = c ? state.remote?.hackathons : null;
  const items = (remote || state.local || []).filter((h) => !h.archived);
  const now = Date.now();
  items.sort((a, b) => {
    const sa = STAGE_ORDER.indexOf(a.stage); const sb = STAGE_ORDER.indexOf(b.stage);
    if (remote && sa !== sb) return sa - sb;
    return (nextDeadline(a, now)?.t ?? Infinity) - (nextDeadline(b, now)?.t ?? Infinity);
  });

  const list = $('#list');
  $('#empty').hidden = items.length > 0;
  list.innerHTML = items.slice(0, 40).map((h) => {
    const nd = nextDeadline(h, now);
    const left = nd ? nd.t - now : null;
    const cls = left == null ? '' : left < 864e5 ? 'due--critical' : left < 3 * 864e5 ? 'due--soon' : '';
    const stage = remote ? `<span class="pill pill--${esc(h.stage)}">${esc(STAGE_LABEL[h.stage] || h.stage)}</span>` : '';
    const reg = !remote && h.registered ? '<span class="pill pill--ok">Registered</span>' : '';
    const href = remote && c.dashboardUrl ? `${c.dashboardUrl}/hackathons/${encodeURIComponent(h.id)}` : h.url;
    const remove = remote ? '' : `<button class="item__x" title="Remove" data-key="${esc(h.key)}">×</button>`;
    return `<li class="item" data-href="${esc(href)}">
      <div class="item__row"><span class="item__name">${esc(h.name)}</span>${remove}</div>
      <div class="item__meta">${stage}${reg}<span>${esc(h.platform || '')}</span>
        <span class="item__due ${cls}">${nd ? `${esc(nd.label)} in ${fmtLeft(left)}` : 'No upcoming dates'}</span></div>
    </li>`;
  }).join('');
  list.querySelectorAll('.item').forEach((el) => el.addEventListener('click', (e) => {
    if (e.target.closest('.item__x')) return;
    chrome.tabs.create({ url: el.dataset.href });
  }));
  list.querySelectorAll('.item__x').forEach((b) => b.addEventListener('click', async () => {
    await send('REMOVE_LOCAL', { key: b.dataset.key });
    loadState();
  }));

  const sync = $('#sync-status');
  if (c) {
    const when = state.remote?.fetchedAt ? new Date(state.remote.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'never';
    sync.textContent = `${state.outboxCount ? `${state.outboxCount} waiting to sync · ` : ''}Synced ${when}`;
  } else {
    sync.textContent = `${items.length} saved locally`;
  }
}

$('#btn-refresh').addEventListener('click', async () => {
  const b = $('#btn-refresh');
  b.disabled = true;
  const r = await send('REFRESH');
  b.disabled = false;
  if (r?.error && r.error !== 'not connected') toast(`Sync failed: ${r.error}`);
  await loadState();
});

/* ── this page ───────────────────────────────────────────────────── */
let pageLoaded = false;
async function loadPage() {
  if (pageLoaded) return;
  pageLoaded = true;
  const status = $('#page-status');
  const form = $('#page-form');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:/.test(tab.url || '')) {
      status.textContent = 'Open a hackathon website in this tab, then click the extension again.';
      return;
    }
    let draft;
    try {
      const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: collectPagePrimitives });
      draft = extractHackathon(result);
    } catch {
      draft = extractHackathon({ url: tab.url, title: tab.title });
    }
    draft.name = draft.name || tab.title || '';
    fillForm(draft);
    status.hidden = true;
    form.hidden = false;
    const found = ['registrationDeadline', 'startTime', 'submissionDeadline', 'endTime'].filter((k) => draft[k]).length;
    $('#page-hint').textContent = found
      ? `Found ${found} date${found > 1 ? 's' : ''} on the page — double-check them before saving.`
      : (draft.looksLikeHackathon ? 'No dates found automatically — add the important ones.' : 'This doesn\'t look like a hackathon page, but you can still save it.');
  } catch (e) {
    status.textContent = `Couldn't read this page (${e.message}).`;
  }
}

function fillForm(d) {
  const f = $('#page-form');
  f.elements.name.value = d.name || '';
  f.url.value = d.url || '';
  for (const k of ['registrationDeadline', 'startTime', 'submissionDeadline', 'endTime']) f[k].value = isoToLocalInput(d[k]);
  f.mode.value = d.mode || '';
  f.dataset.extra = JSON.stringify({ platform: d.platform, location: d.location, description: d.description, image: d.image });
}

$('#page-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  const btn = f.querySelector('button[type=submit]');
  const extra = JSON.parse(f.dataset.extra || '{}');
  const draft = {
    ...extra,
    name: f.elements.name.value.trim(),
    url: f.url.value.trim(),
    mode: f.mode.value || null,
    registrationDeadline: localInputToIso(f.registrationDeadline.value),
    startTime: localInputToIso(f.startTime.value),
    submissionDeadline: localInputToIso(f.submissionDeadline.value),
    endTime: localInputToIso(f.endTime.value),
  };
  btn.disabled = true;
  const r = await send('CAPTURE_MANUAL', { draft, registered: f.registered.checked, stage: state?.connection ? f.stage.value : undefined });
  btn.disabled = false;
  if (!r?.ok) { toast(r?.error || 'Could not save'); return; }
  const where = state?.connection ? (r.synced?.error ? 'saved — will sync when online' : `synced to ${state.connection.workspace?.name}`) : 'saved locally';
  toast(r.created ? `Added · ${where}` : `Already tracked — merged · ${where}`);
  await loadState();
  showTab('pipeline');
});

/* ── settings ────────────────────────────────────────────────────── */
function renderSettings() {
  const c = state.connection;
  $('#conn-on').hidden = !c;
  $('#conn-form').hidden = !!c;
  if (c) {
    $('#conn-ws').textContent = c.workspace?.name || 'Workspace';
    $('#conn-who').textContent = `as ${c.member?.name || '?'} (${c.member?.role || 'member'}) · ${c.apiBase} · token ${c.tokenHint}`;
    $('#conn-err').hidden = !c.error;
    $('#conn-err').textContent = c.error || '';
  }
}

$('#conn-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  const msg = $('#conn-msg');
  const btn = f.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Connecting…';
  const r = await send('CONNECT', { input: f.pairing.value });
  btn.disabled = false;
  btn.textContent = 'Connect workspace';
  msg.hidden = false;
  msg.className = r?.ok ? 'small' : 'small error';
  msg.textContent = r?.ok ? `Connected to ${r.workspace?.name} as ${r.member?.name}` : (r?.error || 'Could not connect');
  if (r?.ok) { f.reset(); await loadState(); toast('Connected — local captures uploaded'); }
});

$('#btn-disconnect').addEventListener('click', async () => {
  if (!confirm('Disconnect this browser from the workspace? Local captures stay on this laptop.')) return;
  await send('DISCONNECT');
  await loadState();
});

$('#btn-clear').addEventListener('click', async () => {
  if (!confirm('Delete everything captured locally on this laptop? (The team workspace is not affected.)')) return;
  await send('CLEAR_LOCAL');
  await loadState();
  toast('Local captures cleared');
});

loadState();
