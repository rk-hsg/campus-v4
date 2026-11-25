// ---------------------------------------------------------------------------
// Campus Commuters · map.js
// Animierte Schweiz-Karte: Züge fahren fahrplan-/verspätungsbasiert, Mitglieder
// an Bord erscheinen als Initialen-Bubbles (ab 5 Personen als Zähler-Kreis mit
// Absichts-Ring: grün = lernen, orange = reden, grau = nur mitfahren).
// ---------------------------------------------------------------------------
/* global L */
import { clock, esc, firstLetter, colorFor, INTENTS } from './util.js';
import { positionOf, isActive, isLong, lineLabel } from './sbb.js';

const CH_BOUNDS = [[45.78, 5.95], [47.83, 10.5]];
// Reduzierte Karte, gratis & ohne API-Key: Schweiz-Umriss + Seen als Vektor (BFS/swisstopo),
// nur grosse Städte, Schienennetz des BAV (swisstopo) – per SVG-Filter in HSG-Grün eingefärbt.
const RAIL_URL = 'https://wmts.geo.admin.ch/1.0.0/ch.bav.schienennetz/default/current/3857/{z}/{x}/{y}.png';
const ATTR = 'Grenzen: BFS/swisstopo · Schienennetz: <a href="https://www.swisstopo.admin.ch/">BAV/swisstopo</a> · Fahrplan: <a href="https://transport.opendata.ch">opendata.ch</a>';
const CITIES = [
  ['Zürich', 47.377, 8.540, true], ['Winterthur', 47.500, 8.724, true], ['St. Gallen', 47.424, 9.377, true],
  ['Genève', 46.204, 6.143], ['Basel', 47.558, 7.588], ['Lausanne', 46.520, 6.633],
  ['Bern', 46.948, 7.447], ['Luzern', 47.050, 8.309], ['Lugano', 46.004, 8.951], ['Chur', 46.850, 9.532],
];
let chGeo = null;
const loadCH = () => (chGeo ||= fetch('assets/ch.geo.json').then((r) => r.json()).catch(() => null));

export function bubblesHTML(members, { max = 4 } = {}) {
  const n = members.length;
  if (!n) return '';
  if (n <= max) {
    return members.map((m) => (m.intent === 'ride'
      ? '<b class="pb pb-anon" title="Mitglied · nur mitfahren"></b>'
      : `<b class="pb${m.demo ? ' pb-demo' : ''}${m.me ? ' pb-me' : ''}" style="--c:${colorFor(m.name)};--r:${INTENTS[m.intent]?.color || '#888'}" title="${esc(m.name)}">${esc(firstLetter(m.name))}</b>`)).join('');
  }
  const c = { learn: 0, talk: 0, ride: 0 };
  members.forEach((m) => { c[m.intent] = (c[m.intent] || 0) + 1; });
  const a = (c.learn / n) * 360, b = a + (c.talk / n) * 360;
  const grad = `conic-gradient(${INTENTS.learn.color} 0 ${a}deg, ${INTENTS.talk.color} ${a}deg ${b}deg, #9a9a9a ${b}deg 360deg)`;
  const me = members.some((m) => m.me);
  return `<b class="pc${me ? ' pc-me' : ''}" style="background:${grad}" title="${n} Mitglieder an Bord"><span>${n >= 10 ? n : n}</span></b>`;
}

export function createMap(el, opts = {}) {
  const map = L.map(el, {
    zoomControl: !opts.minimal, attributionControl: true, preferCanvas: false,
    zoomSnap: 0.25, wheelPxPerZoomLevel: 90, minZoom: 7, maxZoom: 15,
    maxBounds: [[45.2, 5.0], [48.4, 11.4]],
  });
  map.attributionControl.setPrefix('');
  let dark = !!opts.dark;
  map.attributionControl.addAttribution(ATTR);
  map.createPane('basePane').style.zIndex = 150;
  map.createPane('cityPane').style.zIndex = 450;
  map.getPane('cityPane').style.pointerEvents = 'none';
  loadCH().then((geo) => {
    if (!geo) return;
    L.geoJSON(geo, { pane: 'basePane', interactive: false, style: (f) => ({ className: f.properties.k === 'lake' ? 'ch-lake' : 'ch-land' }) }).addTo(map);
  });
  for (const [n, la, lo, pilot] of CITIES) {
    L.marker([la, lo], {
      pane: 'cityPane', interactive: false, keyboard: false,
      icon: L.divIcon({ className: `city${pilot ? ' city-pilot' : ' city-dim'}`, iconSize: [0, 0], html: `<i></i><span>${n}</span>` }),
    }).addTo(map);
  }
  const rail = L.tileLayer(RAIL_URL, { maxZoom: 18, className: 'rail-tiles', pane: 'overlayPane' });
  const style = () => {
    map.getContainer().classList.toggle('map-dark', dark);
    rail.setOpacity(dark ? 0.75 : 0.6);
  };
  style();
  if (opts.rail !== false) rail.addTo(map);
  map.fitBounds(opts.bounds || CH_BOUNDS, { padding: [10, 10] });

  const markers = new Map(); // key → {m, sig, arrow, brg}
  let state = { trains: new Map(), people: new Map(), mine: null, onlyWithPeople: false, selected: null };
  let routeLayer = null;
  let running = false, lastFrame = 0;
  const flashes = new Map();

  function sigOf(key, ppl) { return (ppl || []).map((p) => p.id + p.intent + (p.me ? 'm' : '')).join(',') + (key === state.mine ? '*' : '') + (flashes.has(key) ? 'f' : '') + (key === state.selected ? 's' : ''); }

  function iconFor(t, ppl) {
    const has = ppl && ppl.length;
    const cls = ['tm', isLong(t) ? 'tm-long' : 'tm-reg', has ? 'tm-has' : '', t.k === state.mine ? 'tm-mine' : '', flashes.has(t.k) ? 'tm-flash' : '', t.k === state.selected ? 'tm-sel' : ''].join(' ');
    const label = has || t.k === state.selected ? `<em class="tm-lbl">${esc(lineLabel(t))}</em>` : '';
    return L.divIcon({ className: 'tm-wrap', iconSize: [0, 0], html: `<div class="${cls}"><i class="tm-arrow"></i>${label}${has ? `<div class="tm-ppl">${bubblesHTML(ppl)}</div>` : ''}</div>` });
  }

  function frame(ts) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (ts - lastFrame < (opts.dark ? 45 : 70)) return; // Beamer ~22 fps, Handy ~14 fps (Akku)
    lastFrame = ts;
    const now = clock.now();
    const seen = new Set();
    for (const t of state.trains.values()) {
      if (!isActive(t, now)) continue;
      const ppl = state.people.get(t.k);
      if (state.onlyWithPeople && !(ppl && ppl.length) && t.k !== state.mine && t.k !== state.selected) continue;
      seen.add(t.k);
      const p = positionOf(t, now);
      let mk = markers.get(t.k);
      const sig = sigOf(t.k, ppl);
      if (!mk) {
        const m = L.marker([p.lat, p.lon], { icon: iconFor(t, ppl), keyboard: false, riseOnHover: true });
        m.on('click', () => opts.onTrainClick?.(t.k));
        m.addTo(map);
        mk = { m, sig, brg: null };
        markers.set(t.k, mk);
      } else {
        mk.m.setLatLng([p.lat, p.lon]);
        if (mk.sig !== sig) { mk.m.setIcon(iconFor(t, ppl)); mk.sig = sig; mk.brg = null; }
      }
      mk.m.setZIndexOffset(t.k === state.mine ? 3000 : t.k === state.selected ? 2500 : ppl?.length ? 1000 + ppl.length * 10 : 0);
      if (mk.brg == null || Math.abs(mk.brg - p.brg) > 1.5) {
        const a = mk.m.getElement()?.querySelector('.tm-arrow');
        if (a) { a.style.transform = `rotate(${p.brg}deg)`; mk.brg = p.brg; }
      }
    }
    for (const [k, mk] of markers) if (!seen.has(k)) { mk.m.remove(); markers.delete(k); }
  }

  function drawRoute(key) {
    routeLayer?.remove(); routeLayer = null;
    const t = key && state.trains.get(key);
    if (!t) return;
    const pts = t.s.map((s) => [s.lat, s.lon]);
    routeLayer = L.layerGroup([
      L.polyline(pts, { color: dark ? '#7fe0a4' : '#0f5c32', weight: 4, opacity: 0.75, lineCap: 'round', dashArray: '1 8' }),
      ...t.s.map((s, i) => L.circleMarker([s.lat, s.lon], { radius: i === 0 || i === t.s.length - 1 ? 5 : 3.5, color: dark ? '#7fe0a4' : '#0f5c32', weight: 2, fillColor: '#fff', fillOpacity: 1 })
        .bindTooltip(esc(s.n), { direction: 'bottom', offset: [0, 6], className: 'st-tip', permanent: i === 0 || i === t.s.length - 1 })),
    ]).addTo(map);
  }

  return {
    map,
    start() { if (!running) { running = true; requestAnimationFrame(frame); } setTimeout(() => map.invalidateSize(), 50); },
    stop() { running = false; },
    setState(patch) {
      const prevSel = state.selected, prevMine = state.mine;
      state = { ...state, ...patch };
      if (state.selected !== prevSel || (patch.trains && state.selected)) drawRoute(state.selected || null);
      if (!state.selected && state.mine !== prevMine) drawRoute(null);
    },
    flash(key, ms = 6000) { flashes.set(key, 1); setTimeout(() => flashes.delete(key), ms); },
    focusTrain(key, zoom = 10) {
      const t = state.trains.get(key);
      if (!t) return;
      const p = positionOf(t);
      map.flyTo([p.lat, p.lon], Math.max(map.getZoom(), zoom), { duration: 1.2 });
    },
    fitCH() { map.flyToBounds(CH_BOUNDS, { duration: 1 }); },
    fitBounds(b, o) { map.fitBounds(b, o); },
    setDark(d) {
      if (d === dark) return; dark = d;
      style();
    },
    toggleRail(on) { if (on) rail.addTo(map); else rail.remove(); },
    markerCount: () => markers.size,
  };
}
