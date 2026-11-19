/**
 * Date parsing & formatting utilities.
 * Always parses YYYY-MM-DD in local time to prevent UTC timezone day-shift bugs.
 */

export const MONTHS_SHORT = {
  uk: ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

export const MONTHS_FULL = {
  uk: [
    'Січень',
    'Лютий',
    'Березень',
    'Квітень',
    'Травень',
    'Червень',
    'Липень',
    'Серпень',
    'Вересень',
    'Жовтень',
    'Листопад',
    'Грудень',
  ],
  en: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ],
};

// Monday-first weekday headers
export const WEEKDAYS_SHORT = {
  uk: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'],
  en: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
};

/**
 * Parses a "YYYY-MM-DD" string into a local-midnight Date object without UTC offset shifts.
 */
export function parseLocalDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const datePart = dateStr.trim().split(' ')[0];
  const parts = datePart.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [y, m, d] = parts;
  if (y < 1970 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return new Date(y, m - 1, d);
}

/**
 * Formats a Date object as local "YYYY-MM-DD".
 */
export function toDateStr(dateObj) {
  if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())}`;
}

/**
 * Returns today's local date as "YYYY-MM-DD".
 */
export function getTodayLocalDate() {
  return toDateStr(new Date());
}

/**
 * Formats "YYYY-MM-DD" (or "YYYY-MM-DD HH:mm:ss") as "19 лис 2026" (uk) or "19 Nov 2026" (en).
 */
export function formatDateHuman(dateStr, lang = 'uk') {
  const parsed = parseLocalDate(dateStr);
  if (!parsed) return dateStr || '—';
  const months = MONTHS_SHORT[lang === 'en' ? 'en' : 'uk'];
  const day = parsed.getDate();
  const month = months[parsed.getMonth()];
  const year = parsed.getFullYear();
  return `${day} ${month} ${year}`;
}

/**
 * Formats "YYYY-MM-DD" as "19 лис" (uk) or "19 Nov" (en) for compact chart axes.
 */
export function formatShortDateHuman(dateStr, lang = 'uk') {
  const parsed = parseLocalDate(dateStr);
  if (!parsed) return dateStr || '';
  const months = MONTHS_SHORT[lang === 'en' ? 'en' : 'uk'];
  return `${parsed.getDate()} ${months[parsed.getMonth()]}`;
}

/**
 * Formats "YYYY-MM-DD HH:mm:ss" into "19 лис 2026, 14:05:49" (uk) or "19 Nov 2026, 14:05:49" (en).
 * Returns time-only strings untouched.
 */
export function formatDateTimeHuman(dateTimeStr, lang = 'uk') {
  if (!dateTimeStr || typeof dateTimeStr !== 'string') return '—';
  const trimmed = dateTimeStr.trim();
  const spaceIdx = trimmed.indexOf(' ');
  if (spaceIdx === -1) {
    const parsed = parseLocalDate(trimmed);
    return parsed ? formatDateHuman(trimmed, lang) : trimmed;
  }
  const datePart = trimmed.slice(0, spaceIdx);
  const timePart = trimmed.slice(spaceIdx + 1).trim();
  const parsed = parseLocalDate(datePart);
  if (!parsed) return trimmed;
  return `${formatDateHuman(datePart, lang)}, ${timePart}`;
}
