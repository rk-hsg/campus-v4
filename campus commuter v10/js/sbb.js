// ---------------------------------------------------------------------------
// Campus Commuters · sbb.js
// Live-Fahrplandaten der Schweiz über transport.opendata.ch (gratis, ohne Key,
// CORS-fähig). Daraus werden Zugpositionen fahrplan- und verspätungsbasiert
// interpoliert – gleiches Prinzip wie die SBB-«Zugkarte».
// ---------------------------------------------------------------------------
import { clock, apiDateTime, bearing, haversineKm } from './util.js';

const API = 'https://transport.opendata.ch/v1';
const TRAIN_CATS = new Set(['IC', 'ICE', 'ICN', 'IR', 'IRE', 'RE', 'EC', 'EN', 'NJ', 'RJ', 'RJX', 'TGV', 'S', 'SN', 'R', 'PE', 'EXT', 'D', 'RB', 'TER']);
const LONG_CATS = new Set(['IC', 'ICE', 'ICN', 'IR', 'IRE', 'EC', 'EN', 'NJ', 'RJ', 'RJX', 'TGV', 'PE', 'EXT', 'D']);

/** Bahnhöfe, deren Abfahrtstafeln das Live-Netz aufspannen (HSG-Einzugsgebiet zuerst). */
export const HUBS_CORE = ['8506302', '8503000', '8506000', 'Wil SG', 'Gossau SG', 'Rorschach', 'Herisau', 'Romanshorn', 'Zürich Flughafen'];
export const HUBS_EXTRA = ['Sargans', 'Chur', 'Frauenfeld', 'Weinfelden', 'Buchs SG', 'Rapperswil SG', 'Bern', 'Luzern', 'Basel SBB', 'Olten', 'Zug', 'Konstanz', 'Schaffhausen', 'Aarau', 'Baden'];
// Grosse Knoten haben so viele Abfahrten, dass 40 Einträge nur ~15 Min. abdecken → mehrere Zeitfenster
const BUSY = new Set(['8503000', '8506000', 'Zürich Flughafen', 'Bern', 'Basel SBB', 'Luzern', 'Olten']);
const WINDOWS_BUSY = [-62, -44, -26, -9, 6];
const WINDOWS = [-62, -22];

export const HSG_STATION = { id: '8506302', name: 'St. Gallen', lat: 47.423177, lon: 9.369896 };
export const QUICK_STATIONS = [
  { id: '8503000', name: 'Zürich HB', lat: 47.378177, lon: 8.540212 },
  { id: '8506302', name: 'St. Gallen', lat: 47.423177, lon: 9.369896 },
  { id: '8506000', name: 'Winterthur', lat: 47.500331, lon: 8.723822 },
  { id: '8503016', name: 'Zürich Flughafen', lat: 47.450381, lon: 8.562382 },
  { id: '8507000', name: 'Bern', lat: 46.948832, lon: 7.439131 },
  { id: '8505000', name: 'Luzern', lat: 47.050168, lon: 8.310229 },
];

const cache = new Map();
async function getJSON(path, ttl = 30000) {
  const url = `${API}${path}`;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.t < ttl) return hit.p;
  const p = fetch(url, { headers: { Accept: 'application/json' } }).then((r) => {
    if (!r.ok) throw new Error(`SBB-API ${r.status}`);
    return r.json();
  });
  cache.set(url, { t: Date.now(), p });
  p.catch(() => cache.delete(url));
  return p;
}

/** "2026-11-23T21:50:00+0100" → ms (Safari-sicher) */
function parseTs(s, fallbackDateMs) {
  if (!s) return null;
  if (/^\d\d:\d\d(:\d\d)?$/.test(s) && fallbackDateMs) { // nur Uhrzeit
    const d = new Date(fallbackDateMs);
    const [H, M, S] = s.split(':').map(Number);
    const base = fallbackDateMs - ((d.getHours() * 60 + d.getMinutes()) * 60 + d.getSeconds()) * 1000;
    let t = base + ((H * 60 + M) * 60 + (S || 0)) * 1000;
    if (t < fallbackDateMs - 12 * 3600e3) t += 24 * 3600e3;
    return t;
  }
  const iso = s.replace(/([+-]\d\d)(\d\d)$/, '$1:$2');
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

const okCoord = (c) => c && c.x != null && c.y != null && c.x > 45 && c.x < 48.5 && c.y > 5 && c.y < 11.5;

export function lineLabel(t) { return `${t.cat}${t.num && t.num !== '0' ? ' ' + t.num : ''}`; }
export const isLong = (t) => LONG_CATS.has(t.cat);

/** Rohdaten einer Fahrt → kompaktes Zugobjekt */
export function normJourney(j) {
  const cat = (j.category || '').trim();
  if (!TRAIN_CATS.has(cat)) return null;
  const stops = [];
  for (const p of j.passList || []) {
    const st = p.station || {};
    if (!okCoord(st.coordinate)) continue;
    const arr = p.arrivalTimestamp ? p.arrivalTimestamp * 1000 : null;
    const dep = p.departureTimestamp ? p.departureTimestamp * 1000 : null;
    const delay = Number(p.delay) || 0;
    const pr = p.prognosis || {};
    const rArr = parseTs(pr.arrival, arr) ?? (arr != null ? arr + delay * 60000 : null);
    const rDep = parseTs(pr.departure, dep) ?? (dep != null ? dep + delay * 60000 : null);
    stops.push({ id: String(st.id || st.name), n: st.name, lat: st.coordinate.x, lon: st.coordinate.y, a: arr, d: dep, ra: rArr, rd: rDep, dl: delay, pl: p.platform || (pr.platform || '') });
  }
  if (stops.length < 2) return null;
  const last = stops[stops.length - 1];
  const dayKey = new Date((last.a || last.ra || Date.now())).toISOString().slice(0, 10);
  const key = `${cat}${j.number || ''}_${j.name || ''}_${dayKey}`.replace(/[.#$\[\]/\s]/g, '');
  return { k: key, cat, num: String(j.number || ''), to: j.to || last.n, op: j.operator || '', s: stops };
}

/** Bahnhöfe suchen (Autovervollständigung) */
export async function searchStations(q) {
  if (!q || q.length < 2) return [];
  const data = await getJSON(`/locations?query=${encodeURIComponent(q)}&type=station`, 60000);
  return (data.stations || []).filter((s) => s.id && okCoord(s.coordinate))
    .map((s) => ({ id: String(s.id), name: s.name, lat: s.coordinate.x, lon: s.coordinate.y, icon: s.icon }))
    .sort((a, b) => (a.icon === 'train' ? -1 : 0) - (b.icon === 'train' ? -1 : 0))
    .slice(0, 8);
}

/** Nächstgelegene Bahnhöfe zu einem GPS-Punkt */
export async function nearbyStations(lat, lon) {
  const data = await getJSON(`/locations?x=${lat}&y=${lon}&type=station`, 60000);
  const list = (data.stations || []).filter((s) => s.id && okCoord(s.coordinate))
    .map((s) => ({ id: String(s.id), name: s.name, lat: s.coordinate.x, lon: s.coordinate.y, icon: s.icon, dist: s.distance ?? Math.round(haversineKm({ lat, lon }, { lat: s.coordinate.x, lon: s.coordinate.y }) * 1000) }));
  list.sort((a, b) => ((b.icon === 'train') - (a.icon === 'train')) || (a.dist - b.dist));
  return list.slice(0, 6);
}

/** Abfahrten eines Bahnhofs (nur Züge) */
export async function departures(stationId, { limit = 20, from = clock.now() - 2 * 60000 } = {}) {
  const dt = encodeURIComponent(apiDateTime(from));
  const data = await getJSON(`/stationboard?station=${encodeURIComponent(stationId)}&limit=${limit}&datetime=${dt}`, 25000);
  const out = [];
  for (const j of data.stationboard || []) {
    const t = normJourney(j);
    if (t) out.push(t);
  }
  return out;
}

/** Netz aus mehreren Abfahrtstafeln aufspannen → Map key→Zug */
export async function fetchNetwork(hubs, onProgress) {
  // Züge, die schon unterwegs sind, über mehrere Zeitfenster mitnehmen
  const now = clock.now();
  const trains = new Map();
  const queue = [];
  for (const h of hubs) for (const w of (BUSY.has(h) ? WINDOWS_BUSY : WINDOWS)) queue.push([h, now + w * 60000]);
  const total = queue.length;
  let done = 0, ok = 0;
  const worker = async () => {
    while (queue.length) {
      const [h, from] = queue.shift();
      try {
        const list = await departures(h, { limit: 40, from });
        for (const t of list) mergeTrain(trains, t);
        ok++;
      } catch (e) { console.warn('Hub', h, e.message); }
      done++; onProgress?.(done / total);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker(), worker()]);
  return trains;
}

export function mergeTrain(map, t) {
  const old = map.get(t.k);
  if (!old) { map.set(t.k, t); return; }
  // längere Laufstrecke (früherer Start) gewinnt, Echtzeit vom neueren übernehmen
  if ((t.s[0].rd || t.s[0].d) < (old.s[0].rd || old.s[0].d) || t.s.length > old.s.length) map.set(t.k, t);
}

const tA = (s) => s.ra ?? s.rd ?? s.a ?? s.d;
const tD = (s) => s.rd ?? s.ra ?? s.d ?? s.a;
export const trainStart = (t) => tD(t.s[0]);
export const trainEnd = (t) => tA(t.s[t.s.length - 1]);
export const isActive = (t, now = clock.now()) => now >= trainStart(t) - 7 * 60000 && now <= trainEnd(t) + 60000;

const ease = (f) => (f < 0.5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2) * 0.85 + f * 0.15; // anfahren/bremsen

/** Position eines Zugs zum Zeitpunkt now */
export function positionOf(t, now = clock.now()) {
  const s = t.s;
  if (now <= tD(s[0])) return { lat: s[0].lat, lon: s[0].lon, brg: bearing(s[0], s[1]), idx: 0, atStation: s[0], next: s[1], f: 0, state: 'waiting' };
  for (let i = 0; i < s.length - 1; i++) {
    const a = s[i], b = s[i + 1];
    const dep = tD(a), arr = tA(b);
    if (now >= tA(a) && now < dep) return { lat: a.lat, lon: a.lon, brg: bearing(a, b), idx: i, atStation: a, next: b, f: 0, state: 'station' };
    if (now >= dep && now < arr) {
      const f = ease(Math.min(1, Math.max(0, (now - dep) / Math.max(1, arr - dep))));
      return { lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f, brg: bearing(a, b), idx: i, next: b, prev: a, f, state: 'moving' };
    }
  }
  const z = s[s.length - 1];
  return { lat: z.lat, lon: z.lon, brg: bearing(s[s.length - 2], z), idx: s.length - 1, atStation: z, f: 1, state: 'arrived' };
}

/** Fortschritt 0..1 über die ganze Fahrt (nach Distanz) */
export function progressOf(t, now = clock.now()) {
  const p = positionOf(t, now);
  let total = 0, done = 0;
  for (let i = 0; i < t.s.length - 1; i++) {
    const d = haversineKm(t.s[i], t.s[i + 1]);
    total += d;
    if (i < p.idx) done += d; else if (i === p.idx) done += d * (p.f || 0);
  }
  return total ? done / total : 0;
}

export function routeKm(t, fromId, toId) {
  let i0 = fromId ? t.s.findIndex((x) => x.id === fromId) : 0;
  let i1 = toId ? t.s.findIndex((x) => x.id === toId) : t.s.length - 1;
  if (i0 < 0) i0 = 0; if (i1 < 0) i1 = t.s.length - 1;
  let km = 0;
  for (let i = i0; i < i1; i++) km += haversineKm(t.s[i], t.s[i + 1]);
  return km * 1.15; // Gleise sind nicht schnurgerade
}

export function stopTimes(stop) { return { arr: tA(stop), dep: tD(stop) }; }
export function touchesStGallen(t) { return t.s.some((x) => x.id === HSG_STATION.id || /^St\. ?Gallen$/.test(x.n)); }
