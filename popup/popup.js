/**
 * Popup Script — v0.4 (Firebase Share)
 * --------------------------------------
 * Renders tracked hackathons and handles the Share button
 * via the CREATE_SHARE message to the background.
 */

import { getEventStatus, formatCountdown, formatDate } from '../utils/date-helpers.js';

/* ------------------------------------------------------------------ */
/*  DOM REFERENCES                                                    */
/* ------------------------------------------------------------------ */
const eventListEl = document.getElementById('event-list');
const emptyStateEl = document.getElementById('empty-state');
const btnShare = document.getElementById('btn-share');
const btnClear = document.getElementById('btn-clear');
const toastEl = document.getElementById('toast');

/* ------------------------------------------------------------------ */
/*  RENDER                                                            */
/* ------------------------------------------------------------------ */
async function loadAndRender() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_EVENTS' });
  const events = response?.events || [];

  if (events.length === 0) {
    eventListEl.style.display = 'none';
    emptyStateEl.style.display = 'flex';
    btnShare.disabled = true;
    return;
  }

  emptyStateEl.style.display = 'none';
  eventListEl.style.display = 'block';
  btnShare.disabled = false;

  // Sort: live → upcoming → ended, then by endTime ascending
  const statusOrder = { live: 0, upcoming: 1, ended: 2 };
  events.sort((a, b) => {
    const sa = statusOrder[getEventStatus(a.startTime, a.endTime)] ?? 9;
    const sb = statusOrder[getEventStatus(b.startTime, b.endTime)] ?? 9;
    if (sa !== sb) return sa - sb;
    return new Date(a.endTime) - new Date(b.endTime);
  });

  eventListEl.innerHTML = events.map((evt) => renderCard(evt)).join('');

  // Click → open hackathon URL
  eventListEl.querySelectorAll('.event-card').forEach((card) => {
    card.addEventListener('click', () => {
      chrome.tabs.create({ url: card.dataset.url });
    });
  });
}

function renderCard(evt) {
  const status = getEventStatus(evt.startTime, evt.endTime);
  const countdown = status === 'ended' ? 'Ended' : formatCountdown(evt.endTime);
  const badgeLabel = status.charAt(0).toUpperCase() + status.slice(1);
  const sourceIcon = evt.source === 'cache' ? '☁️ ' : '';

  return `
    <div class="event-card" data-url="${escapeHtml(evt.url)}">
      <div class="event-card__header">
        <span class="event-card__name" title="${escapeHtml(evt.name)}">${sourceIcon}${escapeHtml(evt.name)}</span>
        <span class="event-card__badge event-card__badge--${status}">${badgeLabel}</span>
      </div>
      <div class="event-card__meta">
        <span class="event-card__countdown">${status === 'live' ? '🟢 ' : ''}${countdown}</span>
        <span class="event-card__platform">${escapeHtml(evt.platform || '')}</span>
      </div>
      <div class="event-card__dates">
        <span>Start: ${formatDate(evt.startTime)}</span>
        <span>End: ${formatDate(evt.endTime)}</span>
      </div>
    </div>
  `;
}

/* ------------------------------------------------------------------ */
/*  SHARE BUTTON                                                      */
/* ------------------------------------------------------------------ */
btnShare.addEventListener('click', async () => {
  btnShare.disabled = true;
  btnShare.textContent = '⏳ Creating link…';

  try {
    // Get all tracked events
    const response = await chrome.runtime.sendMessage({ type: 'GET_EVENTS' });
    const events = response?.events || [];

    if (events.length === 0) {
      showToast('❌ No events to share.');
      return;
    }

    // Filter to non-ended events only
    const activeUrls = events
      .filter((e) => getEventStatus(e.startTime, e.endTime) !== 'ended')
      .map((e) => e.url);

    const urlsToShare = activeUrls.length > 0 ? activeUrls : events.map((e) => e.url);

    // Ask background to create share link in Firestore
    const result = await chrome.runtime.sendMessage({
      type: 'CREATE_SHARE',
      payload: { urls: urlsToShare },
    });

    if (result?.success && result.shareUrl) {
      // Copy to clipboard
      await navigator.clipboard.writeText(result.shareUrl);
      showToast('✅ Share link copied to clipboard!');
    } else {
      showToast(`❌ ${result?.error || 'Failed to create share link.'}`);
    }
  } catch (err) {
    showToast('❌ Something went wrong.');
    console.error('[HPT] Share error:', err);
  } finally {
    btnShare.disabled = false;
    btnShare.innerHTML = '<span class="btn__icon">🔗</span> Share Timeline';
  }
});

/* ------------------------------------------------------------------ */
/*  CLEAR BUTTON                                                      */
/* ------------------------------------------------------------------ */
btnClear.addEventListener('click', async () => {
  if (!confirm('Remove all tracked hackathons? This will also clear the dedup cache.')) return;
  await chrome.runtime.sendMessage({ type: 'CLEAR_ALL' });
  loadAndRender();
  showToast('✅ All events cleared — duplicates gone.');
});

/* ------------------------------------------------------------------ */
/*  HELPERS                                                           */
/* ------------------------------------------------------------------ */
function showToast(message, durationMs = 3000) {
  toastEl.textContent = message;
  toastEl.classList.add('toast--visible');
  setTimeout(() => toastEl.classList.remove('toast--visible'), durationMs);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ------------------------------------------------------------------ */
/*  INIT                                                              */
/* ------------------------------------------------------------------ */
loadAndRender();
setInterval(loadAndRender, 30_000);
