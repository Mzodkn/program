// Date, time and urgency helpers for Phase 3.
// All formatters follow the current UI language, so Arabic pages show
// Arabic dates and English pages show English dates.
import { getLang, t, tf } from './i18n.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const CACHE = new Map();

function locale() {
  return getLang() === 'ar' ? 'ar' : 'en-GB';
}

function formatter(options) {
  const key = getLang() + '|' + JSON.stringify(options);
  if (!CACHE.has(key)) {
    CACHE.set(key, new Intl.DateTimeFormat(locale(), options));
  }
  return CACHE.get(key);
}

function relativeFormatter() {
  const key = 'relative|' + getLang();
  if (!CACHE.has(key)) {
    CACHE.set(key, new Intl.RelativeTimeFormat(locale(), { numeric: 'auto', style: 'long' }));
  }
  return CACHE.get(key);
}

export function toDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value == null || value === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function dateKey(value) {
  const date = toDate(value);
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDateKey(key) {
  const match = String(key || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function startOfDay(value) {
  const date = toDate(value);
  if (!date) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(value, amount) {
  const date = toDate(value);
  if (!date) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + Number(amount || 0));
}

export function isSameDay(a, b) {
  const first = toDate(a);
  const second = toDate(b);
  if (!first || !second) return false;
  return first.getFullYear() === second.getFullYear()
    && first.getMonth() === second.getMonth()
    && first.getDate() === second.getDate();
}

export function formatDateTime(value) {
  const date = toDate(value);
  if (!date) return t('dateUnknown');
  return formatter({
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatDate(value) {
  const date = toDate(value);
  if (!date) return t('dateUnknown');
  return formatter({ day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

export function formatFullDate(value) {
  const date = toDate(value);
  if (!date) return t('dateUnknown');
  return formatter({
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function formatTime(value) {
  const date = toDate(value);
  if (!date) return t('dateUnknown');
  return formatter({ hour: '2-digit', minute: '2-digit' }).format(date);
}

export function formatMonthYear(value) {
  const date = toDate(value);
  if (!date) return t('dateUnknown');
  return formatter({ month: 'long', year: 'numeric' }).format(date);
}

export function formatMonthShort(value) {
  const date = toDate(value);
  if (!date) return t('dateUnknown');
  return formatter({ month: 'short' }).format(date);
}

export function formatDayNumber(value) {
  const date = toDate(value);
  if (!date) return '';
  return formatter({ day: 'numeric' }).format(date);
}

export function formatWeekdayShort(value) {
  const date = toDate(value);
  if (!date) return '';
  return formatter({ weekday: 'short' }).format(date);
}

export function formatEventRange(event) {
  const start = toDate(event?.starts_at);
  if (!start) return t('dateUnknown');

  const end = event?.ends_at ? toDate(event.ends_at) : null;
  if (!end) return formatDateTime(start);

  if (dateKey(start) === dateKey(end)) {
    return `${formatDate(start)} · ${formatTime(start)} – ${formatTime(end)}`;
  }
  return `${formatDateTime(start)} – ${formatDateTime(end)}`;
}

// Countdown shown in event details. Open-ended events stay live after their
// start time until an admin gives them an end time.
export function formatEventCountdown(event, now = new Date()) {
  const start = toDate(event?.starts_at);
  if (!start) return '';

  const current = toDate(now) || new Date();
  const end = event?.ends_at ? toDate(event.ends_at) : null;

  if (current < start) {
    return tf('eventStartsIn', { time: formatRelative(start, current) });
  }
  if (end && current >= end) return t('eventEnded');
  return t('eventLive');
}

// Relative time: used for the urgency line on cards and the item page.
export function formatRelative(value, now = new Date()) {
  const date = toDate(value);
  if (!date) return t('dateUnknown');

  const diff = date.getTime() - new Date(now).getTime();
  const absolute = Math.abs(diff);

  if (absolute < MINUTE) return t('now');

  let unit = 'minute';
  let unitMs = MINUTE;

  if (absolute >= 365 * DAY) {
    unit = 'year';
    unitMs = 365 * DAY;
  } else if (absolute >= 60 * DAY) {
    unit = 'month';
    unitMs = 30 * DAY;
  } else if (absolute >= 2 * DAY) {
    unit = 'day';
    unitMs = DAY;
  } else if (absolute >= HOUR) {
    unit = 'hour';
    unitMs = HOUR;
  }

  const amount = Math.round(diff / unitMs);
  if (amount === 0) return t('now');
  return relativeFormatter().format(amount, unit);
}

// red < 48h, amber < 7 days, gray after the deadline, sky otherwise
export function getItemUrgency(value, now = new Date()) {
  const due = toDate(value?.due_at ?? value);
  if (!due) return 'normal';

  const diff = due.getTime() - new Date(now).getTime();
  if (diff <= 0) return 'past';
  if (diff < 48 * HOUR) return 'critical';
  if (diff < WEEK) return 'soon';
  return 'normal';
}

export function eventEnd(event) {
  return toDate(event?.ends_at) || toDate(event?.starts_at);
}

// Does an event occupy this local calendar day? Multi-day events are shown
// on every day between starts_at and ends_at (inclusive).
export function eventOccursOn(event, key) {
  const start = startOfDay(event?.starts_at);
  const end = startOfDay(event?.ends_at) || start;
  const day = parseDateKey(key);
  if (!start || !end || !day) return false;

  const cursor = day.getTime();
  return cursor >= start.getTime() && cursor <= end.getTime();
}
