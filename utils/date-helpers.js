/**
 * Date Helpers
 * ------------
 * ISO-8601 parsing, countdown formatting, and status computation.
 */

/**
 * Compute the status of a hackathon event.
 * @param {string} startTime — ISO-8601
 * @param {string} endTime   — ISO-8601
 * @returns {'upcoming'|'live'|'ended'}
 */
export function getEventStatus(startTime, endTime) {
  const now = Date.now();
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();

  if (now < start) return 'upcoming';
  if (now >= start && now <= end) return 'live';
  return 'ended';
}

/**
 * Format a countdown string from now until a target date.
 * @param {string} isoDate — ISO-8601 target date
 * @returns {string} e.g. "2d 5h 30m" or "Ended"
 */
export function formatCountdown(isoDate) {
  const diff = new Date(isoDate).getTime() - Date.now();
  if (diff <= 0) return 'Ended';

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${mins}m`);

  return parts.join(' ');
}

/**
 * Format an ISO date to a short human-readable string.
 * @param {string} isoDate
 * @returns {string} e.g. "Apr 15, 2026 · 3:00 PM"
 */
export function formatDate(isoDate) {
  if (!isoDate) return '—';
  return new Date(isoDate).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Check if a deadline is within the next N hours.
 * @param {string} isoDate
 * @param {number} hours
 * @returns {boolean}
 */
export function isWithinHours(isoDate, hours) {
  const diff = new Date(isoDate).getTime() - Date.now();
  return diff > 0 && diff <= hours * 60 * 60 * 1000;
}
