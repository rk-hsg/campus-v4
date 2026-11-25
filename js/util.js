// ---------------------------------------------------------------------------
// Campus Commuters · util.js
// Kleine Helfer: virtuelle Uhr, Formatierung, Zufall, Geometrie, Events.
// ---------------------------------------------------------------------------

/** Virtuelle Uhr – erlaubt den «Szenario-Modus» (z. B. Di 07:07 im Zeitraffer). */
export const clock = {
  scenario: null, // { label, virtStart, realStart, speed }
  now() {
    if (!this.scenario) return Date.now();
    const s = this.scenario;
    return s.virtStart + (Date.now() - s.realStart) * s.speed;
  },
  start(label, virtStart, speed = 20) {
    this.scenario = { label, virtStart, realStart: Date.now(), speed };
    bus.emit('clock');
  },
  stop() {
    this.scenario = null;
    bus.emit('clock');
  },
  get isLive() { return !this.scenario; },
};

/** Mini-Eventbus */
export const bus = {
  m: new Map(),
  on(ev, fn) { (this.m.get(ev) || this.m.set(ev, new Set()).get(ev)).add(fn); return () => this.m.get(ev).delete(fn); },
  emit(ev, data) { (this.m.get(ev) || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } }); },
};

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const TZ = 'Europe/Zurich';
const fmtHM = new Intl.DateTimeFormat('de-CH', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const fmtDay = new Intl.DateTimeFormat('de-CH', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
const fmtWd = new Intl.DateTimeFormat('de-CH', { weekday: 'short', timeZone: TZ });
export const hm = (ms) => (ms ? fmtHM.format(new Date(ms)) : '–');
export const dayLabel = (ms) => fmtDay.format(new Date(ms));
export const weekdayShort = (ms) => fmtWd.format(new Date(ms)).replace('.', '');

/** "YYYY-MM-DD HH:mm" in Zürcher Lokalzeit (für transport.opendata.ch) */
export function apiDateTime(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** Lokale Wochentag-Nummer 0=So..6=Sa und Stunde/Minute in Zürich */
export function zurichParts(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { wd, h: +p.hour, m: +p.minute };
}

export function minutesUntil(ms, now = clock.now()) { return Math.round((ms - now) / 60000); }

export function relMin(ms, now = clock.now()) {
  const m = minutesUntil(ms, now);
  if (m <= 0) return 'jetzt';
  if (m < 60) return `in ${m}'`;
  return `in ${Math.floor(m / 60)} h ${m % 60}'`;
}

export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const a = parts[0][0] || '?';
  const b = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (a + b).toUpperCase();
}
export const firstLetter = (name) => (String(name || '?').trim()[0] || '?').toUpperCase();

export function hash(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

const AVATAR_COLORS = ['#0f5c32', '#1d7a45', '#2f6f5e', '#b8692e', '#7b5ea7', '#2d6a8f', '#a0483d', '#56772a', '#8a6d1f', '#3b5b8c'];
export const colorFor = (s) => AVATAR_COLORS[hash(String(s)) % AVATAR_COLORS.length];

export function haversineKm(a, b) {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLon = (b.lon - a.lon) * toR;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
export function bearing(a, b) {
  const toR = Math.PI / 180;
  const y = Math.sin((b.lon - a.lon) * toR) * Math.cos(b.lat * toR);
  const x = Math.cos(a.lat * toR) * Math.sin(b.lat * toR) - Math.sin(a.lat * toR) * Math.cos(b.lat * toR) * Math.cos((b.lon - a.lon) * toR);
  return (Math.atan2(y, x) / toR + 360) % 360;
}

export function throttle(fn, ms) {
  let t = 0, timer = null;
  return (...a) => {
    const now = Date.now();
    if (now - t >= ms) { t = now; fn(...a); } else if (!timer) {
      timer = setTimeout(() => { timer = null; t = Date.now(); fn(...a); }, ms - (now - t));
    }
  };
}

export function toast(msg, kind = '') {
  let host = document.getElementById('toasts');
  if (!host) { host = document.createElement('div'); host.id = 'toasts'; document.body.appendChild(host); }
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = msg;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 400); }, 3200);
}

export const ls = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* voll / privat */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* */ } },
};

export const INTENTS = {
  learn: { label: 'Lernen', verb: 'lernen', desc: 'Ruhig, mit Unterlagen, gern zu zweit', icon: '📖', color: '#1d7a45' },
  talk: { label: 'Reden', verb: 'reden', desc: 'Leute kennenlernen, Austausch', icon: '💬', color: '#c0622b' },
  ride: { label: 'Nur mitfahren', verb: 'nur mitfahren', desc: 'Ich bin da, aber für mich – nicht sichtbar', icon: '🎧', color: '#8c8c8c' },
};

export const PROGRAMS = ['BWL', 'VWL', 'IA (Internationale Beziehungen)', 'Rechtswissenschaft', 'Computer Science', 'BLE (Law & Economics)', 'MBF', 'MACFin', 'MiM (CEMS)', 'SIM', 'MUG', 'Doktorat', 'Weiterbildung'];
