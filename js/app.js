// ---------------------------------------------------------------------------
// Campus Commuters · app.js – UI, Routing, Zustand
// ---------------------------------------------------------------------------
import { clock, bus, $, $$, esc, hm, dayLabel, relMin, minutesUntil, initials, firstLetter, colorFor, ls, toast, throttle, INTENTS, PROGRAMS, zurichParts, haversineKm } from './util.js';
import * as sbb from './sbb.js';
import { createStore } from './store.js';
import { demoOnBoard, demoPassengers, DEMO_ROUTE_BASE } from './sim.js';
import { createMap, bubblesHTML } from './map.js';
import { THEORY, CHAPTERS } from './theory.js';
import { SETTINGS } from './config.js';

// ------------------------------- Zustand ----------------------------------
const S = {
  store: null,
  members: {},          // uid → member (alle, persistent)
  trains: new Map(),    // Live-Netz
  netAt: 0, netLoading: false, netError: null, netProgress: 0,
  people: new Map(),    // trainKey → [personen an bord]
  route: '',
  demo: ls.get('cc_demo', true),
  theory: ls.get('cc_theory', false),
  waitlist: ls.get('cc_waitlist', []),
  gam: ls.get('cc_gam', true),
  rail: ls.get('cc_rail', true),
  blocked: ls.get('cc_blocked', []),
  onlyPpl: false,
  sel: null, follow: null,
  j: null,              // Join-/Einsteige-Assistent
  chats: {}, rsvp: {}, feed: [],
  deps: { id: null, list: [], at: 0, loading: false },
  ref: new URLSearchParams(location.search).get('ref'),
};
const meId = () => S.store?.uid;
const me = () => S.members[meId()] || null;
const clean = (o) => JSON.parse(JSON.stringify(o));
window.CC = S; // Debug in der Konsole

// ------------------------------- Start ------------------------------------
async function boot() {
  renderSplash('Verbinde …');
  S.store = await createStore();
  $('#mode-badge').innerHTML = S.store.mode === 'firebase'
    ? '<span class="dot ok"></span>Live · alle Geräte synchron'
    : '<span class="dot warn"></span>Lokaler Demo-Modus';

  let firstMembers;
  const membersReady = new Promise((res) => { firstMembers = res; setTimeout(res, 6000); });
  S.store.on('members', (v) => {
    const before = S.members;
    S.members = Object.fromEntries(Object.entries(v || {}).filter(([, m]) => m && m.name));
    for (const [uid, m] of Object.entries(S.members)) {
      if (m?.board?.t) sbb.mergeTrain(S.trains, m.board.t);
      if (!before[uid] && S.membersLoaded && uid !== meId() && S.route === 'beamer') announce(m);
    }
    S.membersLoaded = true; firstMembers();
    recompute(); rerender();
  });
  S.store.onLast('feed', 14, (v) => { S.feed = Object.entries(v || {}).map(([id, f]) => ({ id, ...f })).sort((a, b) => b.ts - a.ts); if (S.route === 'beamer') renderFeed(); });
  S.store.on('rsvp', (v) => { S.rsvp = v || {}; rerender(); });
  if (S.store.mode === 'firebase') {
    S.store.on('net', (v) => {
      if (!v || !v.trains || !clock.isLive) return;
      if (v.at > S.netAt && v.by !== meId()) { ingestNetwork(Object.values(v.trains), v.at); }
    });
  }

  // Präsenz
  await membersReady;
  const ping = () => {
    if (!me()) return;
    S.store.update(`members/${meId()}`, { lastSeen: Date.now(), online: true });
    if (!S.dcSet) { S.dcSet = true; S.store.onDisconnectUpdate(`members/${meId()}`, { online: false }); }
  };
  ping(); setInterval(ping, 60000);

  window.addEventListener('hashchange', route);
  document.addEventListener('click', onClick);
  document.addEventListener('input', onInput);
  document.addEventListener('keydown', onKey);
  bus.on('clock', () => { S.netAt = 0; S.trains = new Map(); refreshNetwork(true); rerender(); });

  setInterval(() => { recompute(); tickLive(); }, 1000);
  setInterval(() => refreshNetwork(), 15000);
  refreshNetwork(true);
  route();
}

// ------------------------- Live-Netz (SBB) --------------------------------
function ingestNetwork(list, at) {
  const m = new Map();
  for (const t of list) {
    if (!t || !t.s || t.s.length < 2) continue;
    for (const s of t.s) { if (s.ra == null && s.a != null) s.ra = s.a; if (s.rd == null && s.d != null) s.rd = s.d; }
    m.set(t.k, t);
  }
  for (const mem of Object.values(S.members)) if (mem?.board?.t) sbb.mergeTrain(m, mem.board.t);
  S.trains = m; S.netAt = at; S.netError = null;
  recompute(); rerender();
}

async function refreshNetwork(force = false) {
  if (S.netLoading) return;
  const age = Date.now() - S.netAt;
  const isBeamer = S.route === 'beamer';
  const shared = S.store?.mode === 'firebase' && clock.isLive;
  // Im Firebase-Modus holt nur der Beamer (oder jemand, wenn die Daten veraltet sind) die Fahrpläne
  // und verteilt sie an alle – so bleibt die SBB-API auch bei 100 Handys im Hörsaal entspannt.
  const limit = shared ? (isBeamer ? 150000 : 300000) : 120000;
  if (!force && age < limit) return;
  if (force && shared && !isBeamer && S.netAt && age < 240000) return;
  if (shared && !isBeamer && !force) {
    const net = await S.store.once('net/at').catch(() => 0);
    if (net && Date.now() - net < 240000) return;
  }
  // Offline-Cache für die ersten Sekunden
  if (!S.trains.size && clock.isLive) {
    const c = ls.get('cc_net_cache');
    if (c && Date.now() - c.at < 3 * 3600e3) ingestNetwork(c.trains, 1);
  }
  S.netLoading = true; S.netProgress = 0; rerenderMapStatus();
  try {
    const hubs = isBeamer || !shared ? [...sbb.HUBS_CORE, ...sbb.HUBS_EXTRA] : sbb.HUBS_CORE;
    const got = await sbb.fetchNetwork(hubs, (p) => { S.netProgress = p; rerenderMapStatus(); });
    if (!got.size) throw new Error('Keine Fahrplandaten erhalten');
    const now = clock.now();
    const list = [...got.values()].filter((t) => sbb.trainEnd(t) > now - 60000 && sbb.trainStart(t) < now + 90 * 60000);
    ingestNetwork(list, Date.now());
    if (clock.isLive) {
      ls.set('cc_net_cache', { at: Date.now(), trains: list.filter((t) => sbb.touchesStGallen(t) || sbb.isLong(t)).slice(0, 220) });
      if (shared) S.store.set('net', clean({ at: Date.now(), by: meId(), trains: Object.fromEntries(list.filter((t) => sbb.trainStart(t) < now + 25 * 60000).map((t) => [t.k, slimNet(t)])) })).catch((e) => console.warn('net publish', e));
    }
  } catch (e) {
    console.warn(e); S.netError = e.message;
  } finally { S.netLoading = false; rerenderMapStatus(); }
}
const r5 = (x) => (x == null ? null : Math.round(x * 1e5) / 1e5);
function slim(t) { return { ...t, s: t.s.map((s) => ({ ...s, lat: r5(s.lat), lon: r5(s.lon) })) }; }
// Kompakt fürs Verteilen an alle Handys (ohne Gleis/Betreiber)
function slimNet(t) { return { k: t.k, cat: t.cat, num: t.num, to: t.to, s: t.s.map((s) => ({ id: s.id, n: s.n, lat: r5(s.lat), lon: r5(s.lon), a: s.a, d: s.d, ra: s.ra !== s.a ? s.ra : undefined, rd: s.rd !== s.d ? s.rd : undefined })) }; }
const trainFor = (k) => S.trains.get(k) || Object.values(S.members).find((m) => m?.board?.k === k)?.board?.t || null;

// --------------------- Wer sitzt in welchem Zug? --------------------------
function realOnTrain(k) {
  const out = [];
  for (const [uid, m] of Object.entries(S.members)) {
    if (!m?.board || m.board.k !== k || S.blocked.includes(uid)) continue;
    out.push({ id: uid, name: m.name, intent: m.intent, program: m.program, sem: m.sem, wagon: m.board.wagon, boardName: m.board.from?.n, boardId: m.board.from?.id, role: m.role, me: uid === meId() });
  }
  return out;
}
function recompute() {
  const now = clock.now();
  const map = new Map();
  for (const t of S.trains.values()) {
    if (!sbb.isActive(t, now)) continue;
    const real = realOnTrain(t.k);
    const demo = S.demo ? demoOnBoard(t, now) : [];
    if (real.length || demo.length) map.set(t.k, [...real, ...demo]);
  }
  S.people = map;
  mapCtl?.setState({ trains: S.trains, people: map, mine: me()?.board?.k || null, onlyWithPeople: S.onlyPpl, selected: S.sel });
  if (S.follow && mapCtl && S.route === 'beamer') { const t = S.trains.get(S.follow); if (t && sbb.isActive(t, now) && Date.now() % 4000 < 1000) { const p = sbb.positionOf(t, now); mapCtl.map.panTo([p.lat, p.lon], { animate: true, duration: 1 }); } }
}
const pplOn = (k) => {
  if (S.people.has(k)) return S.people.get(k);
  // Zug noch nicht unterwegs → geplante Besetzung (wer hat sich schon angemeldet?)
  const t = trainFor(k); if (!t) return [];
  if (sbb.trainEnd(t) < clock.now()) return [];
  return [...realOnTrain(k), ...(S.demo ? demoPassengers(t) : [])];
};
function miniStack(list, withCount = true) {
  if (!list.length) return '';
  const vis = list.slice(0, 3).map((p) => (p.intent === 'ride' ? '<i class="ms anon"></i>' : `<i class="ms" style="--c:${colorFor(p.name)};--r:${INTENTS[p.intent].color}">${esc(firstLetter(p.name))}</i>`)).join('');
  return `<span class="mstack">${vis}${list.length > 3 ? `<i class="ms more">+${list.length - 3}</i>` : ''}</span>${withCount ? `<small>${list.length} an Bord</small>` : ''}`;
}

// ---------------------------- Routing -------------------------------------
let mapCtl = null;
const PHONE_BOUNDS = [[47.22, 8.35], [47.58, 9.48]];
const PILOT_BOUNDS = [[47.31, 8.48], [47.54, 9.45]];
const CH_VIEW_BOUNDS = [[45.82, 5.95], [47.82, 10.5]];
function fitPilotBeamer() {
  const w = $('.b-panel')?.offsetWidth || 0;
  mapCtl?.fitBounds(PILOT_BOUNDS, { paddingTopLeft: [w + 40, 30], paddingBottomRight: [30, 30] });
}
function fitChBeamer() {
  const w = $('.b-panel')?.offsetWidth || 0;
  mapCtl?.fitBounds(CH_VIEW_BOUNDS, { paddingTopLeft: [w + 40, 30], paddingBottomRight: [30, 30] });
}
function route() {
  const r = (location.hash.replace(/^#\/?/, '') || '').split('?')[0];
  const known = ['heute', 'karte', 'strecke', 'profil', 'beamer', 'theorie', 'join', 'einsteigen'];
  let next = known.includes(r) ? r : (me() ? 'heute' : 'join');
  if (!me() && !['join', 'beamer', 'theorie', 'karte'].includes(next)) next = 'join';
  if (next === 'join' && !S.j) S.j = { step: 0, intent: 'learn', program: PROGRAMS[0], sem: 3 };
  if (next === 'einsteigen' && (!S.j || S.j.mode !== 'board')) {
    const h = me()?.home;
    S.j = { mode: 'board', step: 3, stations: h ? [{ id: h.id, name: h.n }] : [] };
  }
  S.route = next;
  document.body.dataset.route = next;
  if (next !== 'beamer') $('#b-pop')?.remove();
  $$('.sheet,.sheet-bg').forEach((e) => e.remove());
  const showMap = next === 'karte' || next === 'beamer';
  $('#map-layer').hidden = !showMap;
  if (showMap) {
    if (!mapCtl) {
      mapCtl = createMap($('#map'), { dark: next === 'beamer', onTrainClick: openTrain, rail: S.rail, bounds: next === 'beamer' ? PILOT_BOUNDS : PHONE_BOUNDS });
      window.CCmap = mapCtl; // Debug
      recompute();
    }
    mapCtl.setDark(next === 'beamer');
    mapCtl.start();
    if (next === 'beamer') { refreshNetwork(true); setTimeout(() => fitPilotBeamer(), 120); }
  } else mapCtl?.stop();
  if (next === 'join' && S.j?.step === 4 && S.j.station) loadDeps(S.j.station);
  render(true);
  window.scrollTo(0, 0);
}

// ---------------------------- Rendering -----------------------------------
const rerender = throttle(() => render(false), 700);
function render(full) {
  if (!S.route) return;
  const view = $('#view');
  const ae = document.activeElement;
  const keep = ae && ae.id && view.contains(ae) ? { id: ae.id, v: ae.value, s: ae.selectionStart, e: ae.selectionEnd } : null;
  if (!full && keep && (S.route === 'join' || S.route === 'einsteigen')) return; // beim Tippen im Assistenten nicht stören
  const scrollers = $$('[data-keep-scroll]', view).map((el) => [el.dataset.keepScroll, el.scrollTop, el.scrollHeight - el.scrollTop - el.clientHeight < 30]);
  const html = ({ join: vJoin, einsteigen: vJoin, heute: vHeute, karte: vKarte, strecke: vStrecke, profil: vProfil, beamer: vBeamer, theorie: vTheorie })[S.route]?.() || '';
  view.innerHTML = html;
  $('#nav').hidden = ['join', 'beamer', 'einsteigen'].includes(S.route) || !me();
  $$('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.r === S.route));
  for (const [k, top, atBottom] of scrollers) { const el = $(`[data-keep-scroll="${k}"]`, view); if (el) el.scrollTop = atBottom ? el.scrollHeight : top; }
  $$('[data-keep-scroll]', view).forEach((el) => { if (!scrollers.find((s) => s[0] === el.dataset.keepScroll)) el.scrollTop = el.scrollHeight; });
  if (keep) { const el = document.getElementById(keep.id); if (el) { el.value = keep.v; el.focus(); try { el.setSelectionRange(keep.s, keep.e); } catch { /* */ } } }
  if (S.route === 'beamer') { renderQR(); renderFeed(); }
  tickLive();
}
function renderSplash(msg) {
  $('#view').innerHTML = `<div class="splash"><img src="assets/logo.svg" alt="" class="splash-logo"><h1>Campus Commuters</h1><p class="slogan">«Aus Pendelzeit wird gemeinsame Zeit.»</p><p class="muted">${esc(msg)}</p></div>`;
}

/** Sekündliche Live-Aktualisierung ohne Neuaufbau */
function tickLive() {
  const now = clock.now();
  $$('[data-rel]').forEach((el) => { el.textContent = relMin(+el.dataset.rel, now); });
  $$('[data-clock]').forEach((el) => { el.textContent = hm(now) + (clock.isLive ? '' : ' ⏩'); });
  $$('[data-prog]').forEach((el) => {
    const t = trainFor(el.dataset.prog); if (!t) return;
    const p = sbb.progressOf(t, now);
    el.style.setProperty('--p', `${(p * 100).toFixed(2)}%`);
  });
  $$('[data-nextstop]').forEach((el) => {
    const t = trainFor(el.dataset.nextstop); if (!t) return;
    const pos = sbb.positionOf(t, now);
    if (pos.state === 'waiting') el.innerHTML = `Abfahrt ${relMin(sbb.trainStart(t), now)} · Gleis ${esc(t.s[0].pl || '–')}`;
    else if (pos.state === 'arrived') el.textContent = 'Angekommen';
    else if (pos.state === 'station') el.innerHTML = `Halt in <b>${esc(pos.atStation.n)}</b> · weiter ${relMin(sbb.stopTimes(pos.atStation).dep, now)}`;
    else el.innerHTML = `Nächster Halt <b>${esc(pos.next.n)}</b> ${relMin(sbb.stopTimes(pos.next).arr, now)}`;
  });
  if (S.route === 'beamer') beamerStats();
}

// ------------------------------- Bausteine --------------------------------
const th = (id) => (S.theory && THEORY[id] ? `<button class="th" data-act="theory" data-id="${id}" title="Warum so? – Kurstheorie">🎓 ${esc(THEORY[id].title.split(':')[0].split('(')[0].trim())}</button>` : '');
const avatar = (m, size = '') => (m.intent === 'ride' && !m.me
  ? `<span class="av av-anon ${size}">•</span>`
  : `<span class="av ${size}${m.demo ? ' av-demo' : ''}" style="--c:${colorFor(m.name)}">${esc(initials(m.name))}</span>`);
const chip = (intent, n) => `<span class="chip chip-${intent}">${n != null ? n + ' ' : ''}${INTENTS[intent].verb}</span>`;
const delayTag = (s) => { const d = Math.round(((s.rd ?? s.ra) - (s.d ?? s.a)) / 60000) || s.dl || 0; return d > 0 ? `<span class="late">+${d}'</span>` : '<span class="ontime">pünktlich</span>'; };
const lineBadge = (t) => `<span class="line line-${sbb.isLong(t) ? 'long' : 'reg'}">${esc(sbb.lineLabel(t))}</span>`;
const demoTag = '<span class="demo-tag" title="Simulierte Person zur Veranschaulichung (Transparenz analog Art. 50 KI-VO)">Demo</span>';

function stopOf(t, id) { return t.s.find((s) => s.id === id) || t.s[0]; }

function peopleList(list, t) {
  const vis = list.filter((p) => p.intent !== 'ride' || p.me);
  const anon = list.length - vis.length;
  const pos = t ? sbb.positionOf(t) : null;
  return `<ul class="ppl">${vis.map((p) => {
    const bi = t ? t.s.findIndex((s) => s.id === p.boardId) : -1;
    const notYet = pos && bi > pos.idx + (pos.state === 'moving' ? 1 : 0) - 1 && bi > 0 && bi > pos.idx;
    return `<li>${avatar(p)}<div class="grow"><b>${esc(p.name)}${p.me ? ' <span class="you">du</span>' : ''}${p.role === 'host' ? ' <span class="host">Host</span>' : ''}${p.demo ? ' ' + demoTag : ''}</b><small>${esc(INTENTS[p.intent].label)} · ${esc(p.course || p.program || '')}${p.sem ? ` · ${p.sem}. Sem.` : ''}</small></div><small class="r ${notYet ? 'green' : ''}">${notYet ? `steigt ${esc(p.boardName)} ein` : esc(p.boardName || '')}${p.wagon ? `<br>Wagen ${p.wagon}` : ''}</small></li>`;
  }).join('')}${anon ? `<li>${avatar({ intent: 'ride' })}<div class="grow"><b>${anon} Mitglied${anon > 1 ? 'er' : ''}</b><small>Nur mitfahren · nicht sichtbar</small></div></li>` : ''}</ul>`;
}

function countIntents(list) { const c = { learn: 0, talk: 0, ride: 0 }; list.forEach((p) => c[p.intent]++); return c; }

// =============================== JOIN =====================================
function vJoin() {
  const j = S.j; const boarding = j.mode === 'board';
  const steps = boarding ? 3 : 6;
  const cur = boarding ? j.step - 2 : j.step;
  const bar = j.step > 0 ? `<div class="steps">${Array.from({ length: steps - (boarding ? 0 : 1) }, (_, i) => `<i class="${i < cur ? 'on' : ''}"></i>`).join('')}</div>` : '';
  const back = j.step > (boarding ? 3 : 0) ? '<button class="back" data-act="j-back" aria-label="Zurück">‹</button>' : (boarding ? '<a class="back" href="#/heute">‹</a>' : '');
  let body = '';
  if (j.step === 0) {
    const n = Object.keys(S.members).length;
    body = `<div class="hero">
      <div class="hero-bg"></div>
      <img src="assets/logo.svg" class="hero-logo" alt="Campus Commuters Logo">
      <h1>Campus Commuters</h1>
      <p class="slogan">«Aus Pendelzeit wird gemeinsame Zeit.»</p>
      <p class="lead">Sieh, wer aus der HSG in deinem Zug sitzt – und ob die Person <b>lernen</b>, <b>reden</b> oder einfach <b>mitfahren</b> will.</p>
      <div class="hero-stats"><div><b>${n}</b><small>Mitglieder</small></div><div><b>${countActiveTrains()}</b><small>Züge mit HSG an Bord</small></div><div><b data-clock></b><small>${clock.isLive ? 'live' : 'Szenario'}</small></div></div>
      <button class="btn big" data-act="j-next">Jetzt einsteigen</button>
      <a class="link" href="#/karte">Erst mal die Live-Karte ansehen →</a>
      <p class="fine">Demo-Version für die Abschlusspräsentation: Die HSG-Verifizierung (@student.unisg.ch) ist übersprungen.</p>
    </div>`;
  } else if (j.step === 1) {
    body = `<h2>Wer bist du?</h2><p class="muted">Nur Vorname und Studiengang sind für andere sichtbar.</p>
      <label class="fld"><span>Vorname</span><input id="j-name" maxlength="24" autocomplete="given-name" placeholder="z. B. Lea" value="${esc(j.name || '')}"></label>
      <label class="fld"><span>Initiale Nachname <small>(optional)</small></span><input id="j-last" maxlength="2" placeholder="B" value="${esc(j.last || '')}"></label>
      <div class="row2"><label class="fld"><span>Studiengang</span><select id="j-prog">${PROGRAMS.map((p) => `<option ${p === j.program ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></label>
      <label class="fld"><span>Semester</span><select id="j-sem">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => `<option ${s === +j.sem ? 'selected' : ''}>${s}</option>`).join('')}</select></label></div>
      <button class="btn big" data-act="j-next" id="j-go1" ${j.name ? '' : 'disabled'}>Weiter</button>
      ${th('socialgraph')}`;
  } else if (j.step === 2) {
    body = `<h2>Was machst du im Zug?</h2><p class="muted">Deine Absicht ist der wichtigste Filter – niemand wird gestört, der seine Ruhe will.</p>
      <div class="intents">${Object.entries(INTENTS).map(([k, v]) => `<button class="intent ${j.intent === k ? 'on' : ''}" data-act="j-intent" data-v="${k}"><span class="ic">${v.icon}</span><span><b>${v.label}</b><small>${v.desc}</small></span><i class="radio"></i></button>`).join('')}</div>
      <button class="btn big" data-act="j-next">Weiter</button>
      ${th('participation')}${th('personas')}`;
  } else if (j.step === 3) {
    const st = j.stations || [];
    body = `<h2>${boarding ? 'Wo steigst du ein?' : 'Wo bist du gerade?'}</h2><p class="muted">Wir brauchen nur den Bahnhof – kein Live-Standort wird gespeichert.</p>
      <button class="btn ghost geo" data-act="j-geo">${j.geo === 'loading' ? '<span class="spin"></span> Standort wird ermittelt …' : '📍 Nächsten Bahnhof per Standort finden'}</button>
      ${j.geo === 'denied' ? '<p class="note">Kein Standort verfügbar – gib den Bahnhof einfach von Hand ein.</p>' : ''}
      <label class="fld"><span>Bahnhof suchen</span><input id="j-q" placeholder="z. B. Winterthur" autocomplete="off" value="${esc(j.q || '')}"></label>
      <div class="list" id="j-results">${st.map((s) => `<button class="li" data-act="j-station" data-id="${esc(s.id)}"><span>🚉</span><span class="grow"><b>${esc(s.name)}</b>${s.dist != null ? `<small>${s.dist < 1000 ? s.dist + ' m' : (s.dist / 1000).toFixed(1) + ' km'} entfernt</small>` : ''}</span><span>›</span></button>`).join('')}</div>
      <p class="muted small">Schnellwahl</p>
      <div class="chips">${sbb.QUICK_STATIONS.map((s) => `<button class="qchip" data-act="j-quick" data-id="${s.id}">${esc(s.name)}</button>`).join('')}</div>
      ${!boarding ? '<button class="link" data-act="j-skip">Gerade nicht unterwegs – nur der Community beitreten</button>' : ''}
      ${th('governance')}`;
  } else if (j.step === 4) {
    const d = S.deps;
    const list = d.id === j.station?.id ? d.list : [];
    body = `<h2>Welcher Zug?</h2><p class="muted">Abfahrten ab <b>${esc(j.station?.name || '')}</b> · live von der SBB</p>
      ${d.loading && !list.length ? '<div class="loading"><span class="spin"></span> Lade Live-Abfahrten …</div>' : ''}
      ${d.error ? `<p class="note">Fahrplan gerade nicht erreichbar (${esc(d.error)}). <button class="link" data-act="j-reload">Nochmals versuchen</button></p>` : ''}
      <div class="list deps">${list.map((t) => {
        const s = stopOf(t, j.station.id); const p = pplOn(t.k); const hsg = sbb.touchesStGallen(t);
        return `<button class="li dep ${hsg ? 'hsg' : ''}" data-act="j-train" data-k="${esc(t.k)}">
          <span class="time"><b>${hm(s.d)}</b>${delayTag(s)}</span>
          <span class="grow">${lineBadge(t)} <b>${esc(t.to)}</b><small>Gleis ${esc(s.pl || '–')}${hsg ? ' · <span class="hsg-tag">HSG-Strecke</span>' : ''}</small></span>
          <span class="mini-ppl">${miniStack(p)}</span></button>`;
      }).join('')}</div>
      ${!list.length && !d.loading && !d.error ? '<p class="note">Keine Zugabfahrten gefunden. Ist das ein Bus-/Tramhalt? Wähle einen Bahnhof.</p>' : ''}
      ${th('bki')}`;
  } else if (j.step === 5) {
    const t = trainFor(j.train); const s = t ? stopOf(t, j.station.id) : null;
    const p = t ? pplOn(t.k) : [];
    const c = countIntents(p);
    const learnW = p.filter((x) => x.intent === 'learn' && x.wagon).map((x) => x.wagon);
    const popular = learnW.length ? +Object.entries(learnW.reduce((a, w) => ((a[w] = (a[w] || 0) + 1), a), {})).sort((a, b) => b[1] - a[1])[0][0] : null;
    body = `<h2>Fast drin!</h2>
      ${t ? `<div class="card trainhead">${lineBadge(t)} <b>${hm(s.d)} ${esc(j.station.name)} → ${esc(t.to)}</b><small>Gleis ${esc(s.pl || '–')} · ${delayTag(s)} · Ankunft ${hm(sbb.trainEnd(t))}</small></div>` : ''}
      ${p.length ? `<div class="card"><b>${p.length} Mitglied${p.length > 1 ? 'er' : ''} an Bord</b><div class="chips">${c.learn ? chip('learn', c.learn) : ''}${c.talk ? chip('talk', c.talk) : ''}${c.ride ? chip('ride', c.ride) : ''}</div>${popular ? `<p class="muted small">Die meisten Lernenden sitzen in Wagen ${popular}.</p>` : ''}</div>` : '<div class="card"><b>Du bist die erste Person aus der Community in diesem Zug.</b><p class="muted small">Pionierarbeit! Andere sehen dich ab jetzt.</p></div>'}
      <h3>In welchem Wagen sitzt du? <small class="muted">(optional)</small></h3>
      <div class="wagons">${Array.from({ length: 12 }, (_, i) => i + 1).map((w) => `<button class="wg ${j.wagon === w ? 'on' : ''} ${w === popular ? 'pop' : ''}" data-act="j-wagon" data-v="${w}">${w}</button>`).join('')}<button class="wg wide ${j.wagon === 0 ? 'on' : ''}" data-act="j-wagon" data-v="0">weiss nicht</button></div>
      ${!boarding ? `<label class="check"><input type="checkbox" id="j-rules" ${j.rules ? 'checked' : ''}><span>Ich halte mich an die <button class="link inline" data-act="netiquette">Netiquette</button>: respektvoll im Chat <i>und</i> im Zug.</span></label>` : ''}
      <button class="btn big board" data-act="j-finish" ${!boarding && !j.rules ? 'disabled' : ''}>🚆 Einsteigen</button>`;
  }
  return `<section class="join step-${j.step}">${back}${bar}<div class="join-body">${body}</div></section>`;
}

async function loadDeps(station) {
  if (S.deps.loading && S.deps.id === station.id) return;
  S.deps = { id: station.id, list: S.deps.id === station.id ? S.deps.list : [], loading: true, error: null };
  rerender();
  try {
    const list = await sbb.departures(station.id, { limit: 24 });
    const now = clock.now();
    const upcoming = list.filter((t) => (stopOf(t, station.id).rd || 0) > now - 3 * 60000);
    S.deps.list = [
      ...upcoming.filter((t) => sbb.touchesStGallen(t)),
      ...upcoming.filter((t) => !sbb.touchesStGallen(t)),
    ].slice(0, 14);
    list.forEach((t) => sbb.mergeTrain(S.trains, t));
    recompute();
  } catch (e) { S.deps.error = e.message; }
  S.deps.loading = false; S.deps.at = Date.now();
  render(true);
}

const searchStations = throttle(async (q) => {
  try { S.j.stations = await sbb.searchStations(q); } catch { S.j.stations = []; }
  if (S.route === 'join' || S.route === 'einsteigen') {
    const box = $('#j-results');
    if (box) box.innerHTML = S.j.stations.map((s) => `<button class="li" data-act="j-station" data-id="${esc(s.id)}"><span>🚉</span><span class="grow"><b>${esc(s.name)}</b></span><span>›</span></button>`).join('');
  }
}, 350);

function useGeo() {
  if (!('geolocation' in navigator)) { S.j.geo = 'denied'; render(true); return; }
  S.j.geo = 'loading'; render(true);
  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      S.j.stations = await sbb.nearbyStations(pos.coords.latitude, pos.coords.longitude);
      S.j.geo = 'ok';
      if (!S.j.stations.length) S.j.geo = 'denied';
    } catch { S.j.geo = 'denied'; }
    render(true);
  }, () => { S.j.geo = 'denied'; render(true); setTimeout(() => $('#j-q')?.focus(), 50); }, { enableHighAccuracy: false, timeout: 9000, maximumAge: 120000 });
}

function chooseStation(st) {
  S.j.station = { id: st.id, name: st.name, lat: st.lat, lon: st.lon };
  S.j.step = 4; render(true); loadDeps(S.j.station);
}

async function finishJoin(withTrain = true) {
  const j = S.j;
  const existing = me();
  const name = existing ? existing.name : `${(j.name || 'Gast').trim()}${j.last ? ' ' + j.last.trim().toUpperCase().slice(0, 1) + '.' : ''}`;
  const base = existing || {
    name, program: j.program, sem: +j.sem, intent: j.intent, joinedAt: Date.now(), role: 'member',
    home: j.station ? { id: j.station.id, n: j.station.name } : null,
    days: [1, 2, 4], times: { hin: '07:07', zur: '16:53' },
    stats: { rides: 0, km: 0, streak: 0, msgs: 0 }, ref: S.ref || null, gam: true,
  };
  let board = null;
  const t = withTrain && j.train ? trainFor(j.train) : null;
  if (t) {
    const from = stopOf(t, j.station.id);
    board = { k: t.k, t: slim(t), from: { id: from.id, n: from.n }, wagon: j.wagon || null, at: Date.now() };
    const st = { ...(base.stats || {}) };
    const day = new Date(clock.now()).toISOString().slice(0, 10);
    if (st.lastDay !== day) {
      const gap = st.lastDay ? (Date.parse(day) - Date.parse(st.lastDay)) / 864e5 : 99;
      st.streak = gap <= 3 ? (st.streak || 0) + 1 : 1; // Wochenende zählt nicht als Unterbruch
      st.lastDay = day;
    }
    st.rides = (st.rides || 0) + 1;
    const others = pplOn(t.k).filter((p) => !p.me).length;
    const km = sbb.routeKm(t, from.id, t.s.some((x) => x.id === sbb.HSG_STATION.id && t.s.indexOf(x) > t.s.indexOf(from)) ? sbb.HSG_STATION.id : null);
    if (others) st.km = Math.round(((st.km || 0) + km) * 10) / 10;
    st.together = (st.together || 0) + (others ? 1 : 0);
    if (zurichParts(sbb.stopTimes(from).dep).h < 8) st.early = (st.early || 0) + 1;
    if (j.wagon === 7) st.w7 = (st.w7 || 0) + 1;
    base.stats = st;
  }
  const rec = clean({ ...base, board, lastSeen: Date.now(), online: true });
  await S.store.set(`members/${meId()}`, rec);
  S.members[meId()] = rec;
  if (!existing) S.store.push('feed', { type: 'join', name: rec.name, intent: rec.intent, uid: meId(), ts: Date.now() });
  if (board) S.store.push('feed', { type: 'board', name: rec.name, intent: rec.intent, uid: meId(), line: sbb.lineLabel(t), to: t.to, k: t.k, ts: Date.now() });
  S.j = null;
  confetti();
  toast(board ? `🚆 Eingestiegen in ${esc(sbb.lineLabel(t))} → ${esc(t.to)}` : '👋 Willkommen in der Community!', 'ok');
  location.hash = '#/heute';
}

// =============================== HEUTE ====================================
function vHeute() {
  const m = me(); if (!m) return '';
  const now = clock.now();
  const t = m.board ? trainFor(m.board.k) : null;
  const onTrain = t && sbb.trainEnd(t) > now - 60000;
  let head;
  if (onTrain) {
    const from = stopOf(t, m.board.from.id);
    head = `<header class="today">
      <div class="today-top"><span>${esc(dayLabel(now))} · <b data-clock></b></span><button class="pill-btn" data-act="alight">Aussteigen</button></div>
      <h1>${hm(from.d)} ${esc(from.n)} → ${esc(t.to)}</h1>
      <p>${lineBadge(t)} Gleis ${esc(from.pl || '–')} · ${delayTag(from)} · Ankunft ${hm(sbb.trainEnd(t))}${m.board.wagon ? ` · Wagen ${m.board.wagon}` : ''}</p>
      <div class="prog" data-prog="${esc(t.k)}"><div class="prog-track">${t.s.map((s, i) => `<i style="left:${(stopFrac(t, i) * 100).toFixed(2)}%" title="${esc(s.n)}"></i>`).join('')}<span class="prog-fill"></span><span class="prog-train">🚆</span></div>
        <div class="prog-ends"><small>${esc(t.s[0].n)}</small><small>${esc(t.s[t.s.length - 1].n)}</small></div></div>
      <p class="nextstop" data-nextstop="${esc(t.k)}"></p>
      <a class="today-map" href="#/karte" data-act="show-mine">Auf der Karte zeigen →</a>
    </header>`;
  } else {
    head = `<header class="today idle">
      <div class="today-top"><span>${esc(dayLabel(now))} · <b data-clock></b></span><span class="hi">Hoi ${esc(m.name.split(' ')[0])} 👋</span></div>
      <h1>Wohin fährst du heute?</h1>
      <p>Sag der Community, in welchem Zug du sitzt – 3 Taps.</p>
      <a class="btn light big" href="#/einsteigen">🚆 Einsteigen</a>
    </header>`;
  }
  let aboard = '';
  if (onTrain) {
    const p = pplOn(t.k).filter((x) => !S.blocked.includes(x.id));
    const c = countIntents(p);
    const learners = p.filter((x) => x.intent === 'learn' && !x.me && x.wagon);
    const lw = learners.length ? +Object.entries(learners.reduce((a, x) => ((a[x.wagon] = (a[x.wagon] || 0) + 1), a), {})).sort((a, b) => b[1] - a[1])[0][0] : null;
    const others = p.filter((x) => !x.me).length;
    aboard = `<section class="card">
      <div class="card-h"><h3>${p.length} Mitglied${p.length === 1 ? '' : 'er'} an Bord</h3>${lw ? `<small>Lernende in Wagen ${lw}</small>` : ''}</div>
      <div class="chips">${c.learn ? chip('learn', c.learn) : ''}${c.talk ? chip('talk', c.talk) : ''}${c.ride ? chip('ride', c.ride) : ''}</div>
      ${peopleList(p, t)}
      ${!others ? '<p class="muted small">Noch niemand sonst – du bist sichtbar für alle, die zusteigen. Teile den Link mit Mitpendelnden!</p>' : ''}
      ${lw && m.intent === 'learn' && m.board.wagon !== lw ? `<button class="btn big" data-act="sit-learn" data-w="${lw}">Zum Lernen dazusetzen · Wagen ${lw}</button>` : ''}
      ${others && m.intent === 'talk' ? '<button class="btn big" data-act="focus-chat">👋 Hallo sagen</button>' : ''}
      ${th('bki')}${th('network')}
    </section>
    ${chatBox(`train-${t.k}`, `Zug-Chat · ${sbb.lineLabel(t)} → ${t.to}`, 'Nur für Mitglieder in diesem Zug · verschwindet nach der Fahrt', 'comm')}`;
  }
  const ritualN = Object.keys(S.rsvp[SETTINGS.ritual.id] || {}).length + (S.demo ? DEMO_ROUTE_BASE.ritual : 0);
  const trig = nextCommuteTrigger(m);
  const home = m.home;
  if (home && (S.deps.id !== home.id || Date.now() - S.deps.at > 60000) && !S.deps.loading) setTimeout(() => loadDeps(home), 10);
  const deps = home && S.deps.id === home.id ? S.deps.list.slice(0, 5) : [];
  return `${head}<div class="pad">
    ${aboard}
    ${trig ? `<section class="card trigger"><div class="card-h"><h3>🔔 ${esc(trig.title)}</h3></div><p>${trig.text}</p>
      <div class="row"><button class="btn small" data-act="notify">Erinnerung 10 Min. vorher</button><a class="btn small ghost" href="#/strecke">Zur Strecke</a></div>${th('hooked')}</section>` : ''}
    <a class="card ritual-mini" href="#/strecke"><span class="cal">📅</span><span class="grow"><b>Fester Lernzug · jeden Dienstag 07:07</b><small>Strecke ${esc(SETTINGS.pilotRoute.name)} · ${ritualN} Mitglieder</small></span><span>›</span></a>
    ${home ? `<section class="card"><div class="card-h"><h3>Nächste Abfahrten ab ${esc(home.n)}</h3>${S.deps.loading ? '<span class="spin"></span>' : ''}</div>
      <div class="list deps compact">${deps.map((d) => { const s = stopOf(d, home.id); const p = pplOn(d.k); return `<button class="li dep ${sbb.touchesStGallen(d) ? 'hsg' : ''}" data-act="quick-board" data-k="${esc(d.k)}"><span class="time"><b>${hm(s.d)}</b>${delayTag(s)}</span><span class="grow">${lineBadge(d)} ${esc(d.to)}<small>Gleis ${esc(s.pl || '–')} · <span data-rel="${s.rd || s.d}"></span></small></span><span class="mini-ppl">${miniStack(p, false)}</span></button>`; }).join('') || '<p class="muted small">Lade …</p>'}</div></section>` : ''}
    ${gamCard(m, true)}
  </div>`;
}
function stopFrac(t, i) {
  let total = 0; const cum = [0];
  for (let k = 0; k < t.s.length - 1; k++) { total += haversineKm(t.s[k], t.s[k + 1]); cum.push(total); }
  return total ? cum[i] / total : 0;
}
function nextCommuteTrigger(m) {
  const now = clock.now(); const z = zurichParts(now);
  const days = m.days || [];
  const routeN = Object.values(S.members).filter((x) => x && x !== m).length + (S.demo ? DEMO_ROUTE_BASE.members : 0);
  if (z.wd === 1 || z.wd === 2) {
    const ritualN = Object.keys(S.rsvp[SETTINGS.ritual.id] || {}).length + (S.demo ? DEMO_ROUTE_BASE.ritual : 0);
    return { title: z.wd === 1 ? 'Morgen ist Lernzug' : 'Heute ist Lernzug', text: `Dienstag 07:07 ab Zürich HB · Wagen 7 · <b>${ritualN} dabei</b>. Host: ${esc(SETTINGS.ritual.host)}.` };
  }
  if (days.length) return { title: 'Deine nächste Fahrt', text: `Hin ${esc(m.times?.hin || '')} · zurück ${esc(m.times?.zur || '')} – <b>${routeN} Pendelnde</b> auf deiner Strecke. Wer fährt mit dir?` };
  return null;
}

function gamCard(m, compact) {
  if (!S.gam || m.gam === false) return compact ? '' : `<section class="card"><h3>Fortschritt</h3><p class="muted small">Gamification ist ausgeschaltet. Deine Fahrten zählen trotzdem für die Community.</p><button class="btn small ghost" data-act="toggle-gam">Wieder einschalten</button></section>`;
  const st = m.stats || {};
  const badges = badgesOf(m);
  const stage = stageOf(m);
  return `<section class="card gam">
    <div class="card-h"><h3>Deine gemeinsame Zeit</h3>${compact ? '<a href="#/profil" class="small">alle Badges ›</a>' : ''}</div>
    <div class="stats3"><div><b>${st.streak || 0}🔥</b><small>Pendeltage in Folge</small></div><div><b>${Math.round(st.km || 0)}</b><small>km gemeinsam</small></div><div><b>${st.rides || 0}</b><small>Fahrten</small></div></div>
    ${compact ? '' : `<div class="lifecycle">${['Beobachter', 'Mitpendler', 'Stammgast', 'Streckenhost'].map((s, i) => `<div class="lc ${i <= stage ? 'on' : ''}"><i></i><small>${s}</small></div>`).join('')}</div>
      ${stage === 2 && m.role !== 'host' ? '<button class="btn small" data-act="become-host">Streckenhost werden</button>' : ''}${th('roles')}`}
    <div class="badges">${badges.slice(0, compact ? 4 : 99).map((b) => `<span class="badge ${b.on ? 'on' : ''}" title="${esc(b.desc)}"><i>${b.icon}</i><small>${esc(b.name)}</small></span>`).join('')}</div>
    ${compact ? '' : th('nudging')}
  </section>`;
}
function stageOf(m) {
  const st = m.stats || {};
  if (m.role === 'host') return 3;
  if ((st.rides || 0) >= 5 || ((st.rides || 0) >= 3 && (st.msgs || 0) >= 3)) return 2;
  if ((st.rides || 0) >= 1 || (st.msgs || 0) >= 1) return 1;
  return 0;
}
function badgesOf(m) {
  const st = m.stats || {};
  const refs = Object.values(S.members).filter((x) => x?.ref === meId()).length;
  const rsvp = Object.values(S.rsvp).some((e) => e && e[meId()]);
  return [
    { icon: '🎟️', name: 'Erste Fahrt', desc: 'Zum ersten Mal eingestiegen', on: (st.rides || 0) >= 1 },
    { icon: '🤝', name: 'Gemeinsam', desc: 'Mit anderen Mitgliedern im selben Zug', on: (st.together || 0) >= 1 },
    { icon: '7️⃣', name: 'Wagen-7-Stammgast', desc: 'In Wagen 7 eingestiegen (Lernzug)', on: (st.w7 || 0) >= 1 },
    { icon: '🌅', name: 'Frühaufsteher', desc: 'Vor 8 Uhr unterwegs', on: (st.early || 0) >= 1 },
    { icon: '💬', name: 'Stimme der Strecke', desc: 'Erste Nachricht geschrieben', on: (st.msgs || 0) >= 1 },
    { icon: '☕', name: 'Stammtisch', desc: 'Zum Stammtisch zugesagt', on: rsvp },
    { icon: '🌉', name: 'Brückenbauer', desc: 'Jemand ist über deinen Link beigetreten', on: refs >= 1 },
    { icon: '🔥', name: '5er-Streak', desc: '5 Pendeltage in Folge', on: (st.streak || 0) >= 5 },
    { icon: '🧭', name: 'Streckenhost', desc: 'Kümmert sich um die Strecke', on: m.role === 'host' },
  ].sort((a, b) => b.on - a.on);
}

// ---------------------------- Chat ----------------------------------------
const chatSubs = new Map();
function ensureChat(ch) {
  if (chatSubs.has(ch)) return;
  chatSubs.set(ch, S.store.onLast(`chat/${ch}`, 40, (v) => { S.chats[ch] = Object.entries(v || {}).map(([id, x]) => ({ id, ...x })).sort((a, b) => a.ts - b.ts); rerender(); }));
}
function chatBox(ch, title, sub, theoryId) {
  ensureChat(ch);
  const msgs = (S.chats[ch] || []).filter((x) => !S.blocked.includes(x.uid));
  const inputId = `chat-in-${ch.replace(/[^a-z0-9]/gi, '').slice(0, 30)}`;
  return `<section class="card chat" id="chat-${esc(ch)}">
    <div class="card-h"><h3>${esc(title)}</h3></div>${sub ? `<p class="muted small">${esc(sub)}</p>` : ''}
    <div class="msgs" data-keep-scroll="${esc(ch)}">${msgs.map((x) => `<div class="msg ${x.uid === meId() ? 'mine' : ''}">${x.uid === meId() ? '' : `<span class="av sm" style="--c:${colorFor(x.name)}">${esc(initials(x.name))}</span>`}<div><small>${esc(x.name)}${x.host ? ' · Host' : ''} · ${hm(x.ts)}</small><p>${esc(x.text)}</p></div>${x.uid !== meId() ? `<button class="flag" data-act="report" data-ch="${esc(ch)}" data-id="${esc(x.id)}" data-uid="${esc(x.uid)}" title="Melden / blockieren">⚑</button>` : ''}</div>`).join('') || '<p class="muted small empty">Noch keine Nachrichten. Sag Hoi! 👋</p>'}</div>
    <form class="chat-in" data-act="send" data-ch="${esc(ch)}"><input id="${inputId}" maxlength="500" placeholder="Nachricht an ${ch.startsWith('train') ? 'den Zug' : 'die Strecke'} …" autocomplete="off"><button class="send" aria-label="Senden">›</button></form>
    ${theoryId ? th(theoryId) : ''}${th('ai')}
  </section>`;
}
async function sendChat(ch, input) {
  const text = input.value.trim();
  if (!text || !me()) return;
  input.value = '';
  const m = me();
  S.store.push(`chat/${ch}`, clean({ uid: meId(), name: m.name, text: text.slice(0, 500), ts: Date.now(), host: m.role === 'host' || undefined }));
  const st = { ...(m.stats || {}) }; st.msgs = (st.msgs || 0) + 1;
  S.store.update(`members/${meId()}`, { stats: st });
  if (ch.startsWith('route')) S.store.push('feed', { type: 'msg', name: m.name, uid: meId(), ts: Date.now() });
}

// =============================== KARTE ====================================
function countActiveTrains() { return [...S.people.values()].filter((l) => l.length).length; }
function vKarte() {
  const ppl = [...S.people.values()].reduce((a, l) => a + l.length, 0);
  return `<div class="map-ui">
    <div class="map-top">
      <div class="glass stat"><b data-clock></b><small>${clock.isLive ? 'Live' : esc(clock.scenario.label)}</small></div>
      <div class="glass stat"><b>${countActiveTrains()}</b><small>Züge mit Mitgliedern</small></div>
      <div class="glass stat"><b>${ppl}</b><small>an Bord</small></div>
      <div id="map-status" class="glass status">${mapStatusHTML()}</div>
    </div>
    <div class="map-tools">
      <button class="glass tool ${S.onlyPpl ? 'on' : ''}" data-act="only-ppl" title="Nur Züge mit Mitgliedern">👥</button>
      <button class="glass tool ${S.demo ? 'on' : ''}" data-act="toggle-demo" title="Demo-Pendler ein/aus">🧪</button>
      <button class="glass tool ${S.rail ? 'on' : ''}" data-act="toggle-rail" title="Schienennetz">🛤️</button>
      ${me()?.board ? '<button class="glass tool" data-act="show-mine" title="Mein Zug">📍</button>' : ''}
      <button class="glass tool" data-act="fit-home" title="Pilotstrecke ZH–SG">🎯</button>
      <button class="glass tool" data-act="fit-ch" title="Ganze Schweiz">🇨🇭</button>
    </div>
    <div class="legend glass"><span><i class="lg lg-long"></i>Fernverkehr</span><span><i class="lg lg-reg"></i>Regional/S-Bahn</span><span><i class="lg lg-learn"></i>lernen</span><span><i class="lg lg-talk"></i>reden</span><span><i class="lg lg-ride"></i>mitfahren</span>${S.demo ? '<span class="demo-tag">Demo-Pendler an</span>' : ''}</div>
    ${!me() ? '<a class="btn big map-cta" href="#/join">Jetzt beitreten</a>' : ''}
  </div>`;
}
function mapStatusHTML() {
  if (S.netLoading) return `<span class="spin"></span> Fahrplan ${Math.round(S.netProgress * 100)} %`;
  if (S.netError && !S.trains.size) return `⚠️ ${esc(S.netError)} <button class="link" data-act="net-retry">neu laden</button>`;
  const n = [...S.trains.values()].filter((t) => sbb.isActive(t)).length;
  return `<span class="dot ok"></span>${n} Züge live`;
}
function rerenderMapStatus() { const el = $('#map-status'); if (el) el.innerHTML = mapStatusHTML(); const b = $('#b-net'); if (b) b.innerHTML = mapStatusHTML(); }

function openTrain(k) {
  S.sel = k; recompute();
  const t = trainFor(k); if (!t) return;
  const p = pplOn(k);
  const pos = sbb.positionOf(t);
  const nextIdx = pos.state === 'moving' ? pos.idx + 1 : pos.idx;
  const canBoard = me() && pos.state !== 'arrived';
  const c = countIntents(p);
  sheet(`<div class="sheet-h">${lineBadge(t)}<h3>→ ${esc(t.to)}</h3><button class="x" data-act="close-sheet">×</button></div>
    <p class="muted" data-nextstop="${esc(t.k)}"></p>
    <div class="prog small" data-prog="${esc(t.k)}"><div class="prog-track">${t.s.map((s, i) => `<i style="left:${(stopFrac(t, i) * 100).toFixed(2)}%"></i>`).join('')}<span class="prog-fill"></span><span class="prog-train">🚆</span></div><div class="prog-ends"><small>${esc(t.s[0].n)}</small><small>${esc(t.s[t.s.length - 1].n)}</small></div></div>
    ${p.length ? `<div class="chips">${c.learn ? chip('learn', c.learn) : ''}${c.talk ? chip('talk', c.talk) : ''}${c.ride ? chip('ride', c.ride) : ''}</div>${peopleList(p, t)}` : '<p class="muted">Noch keine Mitglieder in diesem Zug.</p>'}
    <details class="stops"><summary>Alle Halte (${t.s.length})</summary><ol>${t.s.map((s, i) => `<li class="${i < nextIdx ? 'past' : ''}"><b>${hm(s.a || s.d)}</b> ${esc(s.n)} ${i ? '' : ''}${(s.dl || 0) > 0 ? `<span class="late">+${s.dl}'</span>` : ''}</li>`).join('')}</ol></details>
    ${canBoard ? `<button class="btn big" data-act="board-here" data-k="${esc(k)}" data-i="${Math.min(nextIdx, t.s.length - 2)}">Ich sitze in diesem Zug</button>` : ''}
    ${th('info')}`);
  tickLive();
}

// =============================== STRECKE ==================================
const WAITLIST_ROUTES = [
  { id: 'vae', line: 'VAE', name: 'Luzern – Rapperswil – St. Gallen', base: 19, goal: 25 },
  { id: 'rheintal', line: 'IR 13', name: 'Chur – Buchs – St. Gallen', base: 14, goal: 25 },
  { id: 'bodensee', line: 'RE / S1', name: 'Konstanz – Kreuzlingen – St. Gallen', base: 11, goal: 25 },
];
function vStrecke() {
  const real = Object.values(S.members).filter(Boolean);
  const members = real.length + (S.demo ? DEMO_ROUTE_BASE.members : 0);
  const hosts = real.filter((m) => m.role === 'host').length + (S.demo ? DEMO_ROUTE_BASE.hosts : 0);
  const ritual = S.rsvp[SETTINGS.ritual.id] || {};
  const ritualN = Object.keys(ritual).length + (S.demo ? DEMO_ROUTE_BASE.ritual : 0);
  const inRitual = !!ritual[meId()];
  const stt = S.rsvp[SETTINGS.stammtisch.id] || {};
  const yes = Object.values(stt).filter((v) => v === 'yes').length + (S.demo ? 6 : 0);
  const maybe = Object.values(stt).filter((v) => v === 'maybe').length + (S.demo ? 4 : 0);
  const my = stt[meId()];
  const now = clock.now();
  const moving = [...S.people.entries()].filter(([k]) => { const t = S.trains.get(k); return t && sbb.touchesStGallen(t) && sbb.isActive(t, now); }).reduce((a, [, l]) => a + l.length, 0);
  const active = real.filter((m) => Date.now() - (m.lastSeen || 0) < 14 * 864e5).length + (S.demo ? DEMO_ROUTE_BASE.members - 9 : 0);
  const goal = SETTINGS.criticalMassGoal;
  const pct = Math.min(100, Math.round((active / goal) * 100));
  return `<header class="route-h"><small>STRECKENGRUPPE · PILOT</small><h1>${esc(SETTINGS.pilotRoute.name)}</h1>
    <div class="route-stats"><span><b>${members}</b> Mitglieder</span><span><b>${ritualN}</b> im Lernzug</span><span><b>${hosts}</b> Hosts</span><span><b>${moving}</b> jetzt unterwegs</span></div></header>
  <div class="pad">
    <section class="card cm"><div class="card-h"><h3>Kritische Masse</h3><small>${active} / ${goal} aktive Pendelnde</small></div>
      <div class="meter"><span style="width:${pct}%"></span><i style="left:100%"></i></div>
      <p class="muted small">${pct >= 100 ? 'Ziel erreicht – die Strecke trägt sich selbst. Zeit für die nächste Strecke!' : `Noch ${goal - active} bis die Strecke sich selbst trägt. Jede Person mehr macht jede Fahrt wertvoller.`}</p>
      <button class="btn small ghost" data-act="invite">🌉 Mitpendelnde einladen</button>${th('criticalmass')}${th('viral')}</section>
    <section class="card">
      <div class="card-h"><h3>Weitere HSG-Achsen · Phase 2</h3><small>Warteliste</small></div>
      <p class="muted small">Neue Strecken starten erst ab 25 Interessierten (lokale kritische Masse).</p>
      <div class="wl">${WAITLIST_ROUTES.map((r) => {
        const on = S.waitlist.includes(r.id);
        const n = r.base + (on ? 1 : 0);
        return `<div class="wl-item">
          <div class="grow"><b><span class="line line-reg">${esc(r.line)}</span> ${esc(r.name)}</b>
          <div class="meter wl-m"><span style="width:${Math.min(100, Math.round((n / r.goal) * 100))}%"></span></div>
          <small class="muted">${n} / ${r.goal} für Streckenstart</small></div>
          <button class="btn small ${on ? '' : 'ghost'}" data-act="waitlist" data-id="${r.id}">${on ? '✓ Vorgemerkt' : 'Vormerken'}</button>
        </div>`;
      }).join('')}</div>
    </section>
    <section class="card ritual"><div class="card-h"><small class="eyebrow">RITUAL</small><span class="pill">jede Woche</span></div>
      <h3>${esc(SETTINGS.ritual.title)}</h3><p class="muted small">Host: ${esc(SETTINGS.ritual.host)} · ${esc(SETTINGS.ritual.note)}</p>
      <div class="stack">${['Mara K.', 'Jonas S.', 'Amira H.', ...Object.keys(ritual).map((u) => S.members[u]?.name || '?')].slice(0, 6).map((n) => `<span class="av sm" style="--c:${colorFor(n)}">${esc(initials(n))}</span>`).join('')}<small>${inRitual ? 'Du und ' + (ritualN - 1) : ritualN} dabei</small></div>
      <button class="btn ${inRitual ? 'ghost' : ''}" data-act="ritual">${inRitual ? '✓ Ich bin dabei' : 'Beim Lernzug mitmachen'}</button>${th('coldstart')}</section>
    <section class="card"><small class="eyebrow">NÄCHSTER STAMMTISCH</small><h3>${esc(SETTINGS.stammtisch.when)} · ${esc(SETTINGS.stammtisch.where)}</h3>
      <p class="muted small">${esc(SETTINGS.stammtisch.note)}</p>
      <div class="row"><button class="btn ${my === 'yes' ? '' : 'ghost'}" data-act="rsvp" data-v="yes">${my === 'yes' ? '✓ ' : ''}Ich komme</button><button class="btn ${my === 'maybe' ? '' : 'ghost'}" data-act="rsvp" data-v="maybe">Vielleicht</button></div>
      <p class="muted small">${yes} kommen · ${maybe} vielleicht</p>${th('network')}</section>
    <section class="card rules"><h3>📜 Netiquette der Strecke</h3><ol><li>Respekt im Chat <b>und</b> im Zug.</li><li>«Nur mitfahren» heisst: in Ruhe lassen.</li><li>Kein Live-Standort, nur «welcher Zug».</li><li>Probleme melden: an Hosts <b>und</b> an die zentrale Stelle.</li><li>Nur eigene oder frei lizenzierte Unterlagen teilen.</li></ol>${th('governance')}${th('empowerment')}</section>
    ${chatBox(`route-${SETTINGS.pilotRoute.id}`, 'Gruppe', 'Asynchron planen: Wer kommt morgen? Wo hat\'s Platz?', 'comm')}
  </div>`;
}

// =============================== PROFIL ===================================
function vProfil() {
  const m = me(); if (!m) return '';
  const d = m.days || [];
  return `<header class="prof-h"><span class="av xl" style="--c:${colorFor(m.name)}">${esc(initials(m.name))}</span><div><h1>${esc(m.name)}</h1><p>${esc(m.program)} · ${m.sem}. Semester${m.role === 'host' ? ' · <span class="host">Streckenhost</span>' : ''}</p><small class="ver">✓ Demo-Login (HSG-Verifizierung im Pilot per @student.unisg.ch)</small></div></header>
  <div class="pad">
    <section class="card"><h3>Mein Pendelprofil</h3>
      <div class="kv"><span>Heimatbahnhof</span><b>${esc(m.home?.n || '–')}</b></div>
      <p class="muted small">MEINE TAGE</p>
      <div class="days">${['Mo', 'Di', 'Mi', 'Do', 'Fr'].map((x, i) => `<button class="day ${d.includes(i + 1) ? 'on' : ''}" data-act="day" data-v="${i + 1}">${x}</button>`).join('')}</div>
      <div class="row2"><label class="fld"><span>Hin</span><input id="p-hin" type="time" value="${esc(m.times?.hin || '07:07')}"></label><label class="fld"><span>Zurück</span><input id="p-zur" type="time" value="${esc(m.times?.zur || '16:53')}"></label></div>
      <p class="muted small">MEINE ABSICHT IM ZUG</p>
      <div class="intents">${Object.entries(INTENTS).map(([k, v]) => `<button class="intent ${m.intent === k ? 'on' : ''}" data-act="p-intent" data-v="${k}"><span class="ic">${v.icon}</span><span><b>${v.label}</b><small>${v.desc}</small></span><i class="radio"></i></button>`).join('')}</div>
      <button class="btn" data-act="p-save">Speichern</button>${th('socialgraph')}
    </section>
    ${gamCard(m, false)}
    <section class="card"><h3>Einstellungen</h3>
      ${toggleRow('toggle-theory', S.theory, 'Theorie-Ebene «Warum so?»', 'Zeigt bei jeder Funktion das Kurskonzept dahinter')}
      ${toggleRow('toggle-demo', S.demo, 'Demo-Pendler anzeigen', 'Simulierte, klar markierte Personen auf echten Zügen')}
      ${toggleRow('toggle-gam', S.gam && m.gam !== false, 'Gamification', 'Streaks & Badges – jederzeit abschaltbar')}
      <div class="row wrap"><a class="btn small ghost" href="#/theorie">🎓 Alle Konzepte</a><a class="btn small ghost" href="#/beamer">📽️ Beamer-Modus</a><button class="btn small ghost" data-act="scenario">${clock.isLive ? '⏩ Szenario «Lea, Di 07:07»' : '⏹ Szenario beenden'}</button><button class="btn small ghost" data-act="invite">🌉 Einladen</button></div>
    </section>
    <section class="card"><h3>Datenschutz</h3><p class="muted small">Gespeichert: Vorname, Initiale, Studiengang, Semester, Absicht, Heimatbahnhof, aktueller Zug & Wagen. <b>Nicht</b> gespeichert: GPS-Position, Kontakte, Telefonnummer. Speicherort: ${S.store.mode === 'firebase' ? 'Firebase (EU-Rechenzentrum)' : 'nur dieses Gerät'}.</p>
      <button class="btn small danger" data-act="delete-me">Mein Konto & alle Daten löschen</button>${th('governance')}</section>
    <p class="foot">Campus Commuters · Gruppe 8 · Community Management HS26 · <span id="mode-badge2">${S.store.mode === 'firebase' ? 'Live-Backend' : 'Lokaler Modus'}</span></p>
  </div>`;
}
const toggleRow = (act, on, title, desc) => `<button class="toggle-row" data-act="${act}"><span class="grow"><b>${title}</b><small>${desc}</small></span><i class="sw ${on ? 'on' : ''}"></i></button>`;

// =============================== THEORIE ==================================
function vTheorie() {
  const by = {};
  for (const [id, c] of Object.entries(THEORY)) (by[c.chapter] ||= []).push([id, c]);
  return `<header class="route-h"><small>«WARUM SO?»</small><h1>Theorie hinter der App</h1><p>Jede Funktion ist auf ein Konzept aus dem Kurs Community Management zurückgeführt – gegliedert nach der 6-teiligen Struktur der Abgabe.</p></header>
  <div class="pad">${Object.entries(by).map(([ch, list]) => `<h2 class="ch-h"><span>${ch}</span>${esc(CHAPTERS[ch])}</h2>${list.map(([id, c]) => theoryCard(id, c)).join('')}`).join('')}
  ${me() ? '' : '<a class="btn big" href="#/join">Jetzt beitreten</a>'}</div>`;
}
const theoryCard = (id, c) => `<article class="card theory" id="t-${id}"><small class="eyebrow">${esc(c.src)}</small><h3>${esc(c.title)}</h3><p>${esc(c.theory)}</p><div class="here"><b>So in der App:</b> ${esc(c.here)}</div></article>`;

// =============================== BEAMER ===================================
function vBeamer() {
  return `<div class="beamer">
    <aside class="b-panel glass-dark">
      <div class="b-brand"><img src="assets/logo.svg" alt=""><div><h1>Campus Commuters</h1><p>«Aus Pendelzeit wird gemeinsame Zeit.»</p></div></div>
      <div class="b-qr-wrap"><div id="b-qr" class="b-qr"></div><div class="b-qr-txt"><b>Scannen & einsteigen</b><small id="b-url"></small></div></div>
      <div class="b-counter"><b id="b-count">0</b><span>live beigetreten</span></div>
      <div class="b-grid"><div><b id="b-trains">0</b><small>Züge mit Mitgliedern</small></div><div><b id="b-board">0</b><small>gerade an Bord</small></div></div>
      <div class="b-intents" id="b-intents"></div>
      <div class="b-cm"><div class="card-h"><small>Kritische Masse Pilotstrecke</small><small id="b-cm-txt"></small></div><div class="meter"><span id="b-cm" style="width:0"></span></div></div>
      <div class="b-feed" id="b-feed"></div>
      <div class="b-foot"><span data-clock></span> · ${S.store.mode === 'firebase' ? '<span><span class="dot ok"></span>Live-Sync</span> · ' : '<span><span class="dot warn"></span>Lokal</span> · '}<span id="b-net">${mapStatusHTML()}</span>${S.demo ? ' · <span class="demo-tag">Demo-Pendler an</span>' : ''}${clock.isLive ? '' : ` · <b>${esc(clock.scenario.label)}</b>`}</div>
    </aside>
    <div class="b-keys glass-dark"><b>D</b> Demo · <b>S</b> Szenario Di 07:07 · <b>F</b> Vollbild · <b>C</b> Schweiz · <b>Z</b> Pilotstrecke · <b>Esc</b> zurück</div>
  </div>`;
}
function joinUrl() { return location.origin + location.pathname.replace(/index\.html$/, ''); }
function renderQR() {
  const el = $('#b-qr'); if (!el || !window.qrcode) return;
  const url = joinUrl();
  const q = window.qrcode(0, 'M'); q.addData(url); q.make();
  el.innerHTML = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  $('#b-url').textContent = url.replace(/^https?:\/\//, '');
}
function beamerStats() {
  const real = Object.keys(S.members).length;
  const el = $('#b-count'); if (!el) return;
  if (+el.dataset.v !== real) { el.dataset.v = real; el.textContent = real; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  const lists = [...S.people.values()];
  $('#b-trains').textContent = lists.filter((l) => l.length).length;
  const all = lists.flat();
  $('#b-board').textContent = all.length;
  const c = countIntents(all); const n = all.length || 1;
  $('#b-intents').innerHTML = ['learn', 'talk', 'ride'].map((k) => `<div class="bi"><span style="width:${(c[k] / n) * 100}%;background:${INTENTS[k].color}"></span><small>${INTENTS[k].icon} ${c[k]} ${INTENTS[k].verb}</small></div>`).join('');
  const active = real + (S.demo ? DEMO_ROUTE_BASE.members - 9 : 0);
  $('#b-cm').style.width = `${Math.min(100, (active / SETTINGS.criticalMassGoal) * 100)}%`;
  $('#b-cm-txt').textContent = `${active} / ${SETTINGS.criticalMassGoal}`;
}
function renderFeed() {
  const el = $('#b-feed'); if (!el) return;
  const txt = (f) => ({ join: `👋 <b>${esc(f.name)}</b> ist beigetreten`, board: `🚆 <b>${esc(f.name)}</b> sitzt in ${esc(f.line)} → ${esc(f.to)}`, rsvp: `☕ <b>${esc(f.name)}</b> kommt zum Stammtisch`, msg: `💬 <b>${esc(f.name)}</b> schreibt im Streckenchat`, ritual: `📅 <b>${esc(f.name)}</b> macht beim Lernzug mit` }[f.type] || '');
  el.innerHTML = S.feed.slice(0, 7).map((f) => `<div class="fi ${Date.now() - f.ts < 8000 ? 'new' : ''}"><span>${txt(f)}</span><small>${hm(f.ts)}</small></div>`).join('') || '<p class="muted small">Noch niemand – scanne den QR-Code und sei die erste Person!</p>';
}
function announce(m) {
  let pop = $('#b-pop');
  if (!pop) { pop = document.createElement('div'); pop.id = 'b-pop'; pop.className = 'b-pop'; document.body.appendChild(pop); }
  while (pop.children.length >= 3) pop.firstChild.remove();
  const el = document.createElement('div');
  el.className = 'pop';
  el.innerHTML = `<span class="av xl" style="--c:${colorFor(m.name)}">${esc(firstLetter(m.name))}</span><div><b>${esc(m.name)} ${m.board ? 'ist eingestiegen' : 'ist dabei'}</b><small>${esc(m.program || '')} · will ${esc(INTENTS[m.intent]?.verb || '')}${m.board?.t ? ` · ${esc(sbb.lineLabel(m.board.t))} → ${esc(m.board.t.to)}` : ''}</small></div>`;
  pop.appendChild(el);
  setTimeout(() => el.classList.add('out'), 4200); setTimeout(() => el.remove(), 5000);
  if (m.board?.k && mapCtl) { mapCtl.flash(m.board.k); }
}

// ---------------------------- Sheets & Effekte ----------------------------
function sheet(html) {
  closeSheet();
  const bg = document.createElement('div'); bg.className = 'sheet-bg'; bg.dataset.act = 'close-sheet';
  const sh = document.createElement('div'); sh.className = 'sheet'; sh.innerHTML = `<div class="grab"></div>${html}`;
  document.body.append(bg, sh);
  requestAnimationFrame(() => { bg.classList.add('in'); sh.classList.add('in'); });
}
function closeSheet() { $$('.sheet,.sheet-bg').forEach((e) => e.remove()); if (S.sel) { S.sel = null; recompute(); } }
function theorySheet(id) {
  const c = THEORY[id]; if (!c) return;
  sheet(`<div class="sheet-h"><span class="eyebrow">Kapitel ${c.chapter} · ${esc(CHAPTERS[c.chapter])}</span><button class="x" data-act="close-sheet">×</button></div>${theoryCard(id, c)}<a class="link" href="#/theorie" data-act="close-sheet">Alle Konzepte ansehen →</a>`);
}
function confetti() {
  const host = document.createElement('div'); host.className = 'confetti';
  const colors = ['#0f5c32', '#1d7a45', '#e3d9c6', '#7ba7b3', '#c0622b', '#f2c14e'];
  for (let i = 0; i < 70; i++) {
    const p = document.createElement('i');
    p.style.cssText = `left:${Math.random() * 100}%;background:${colors[i % colors.length]};animation-delay:${Math.random() * 0.4}s;--x:${(Math.random() - 0.5) * 200}px;--r:${Math.random() * 720}deg`;
    host.appendChild(p);
  }
  document.body.appendChild(host); setTimeout(() => host.remove(), 2600);
}

// ------------------------------- Szenario ---------------------------------
function zurichMs(y, mo, d, h, mi) {
  let guess = Date.UTC(y, mo - 1, d, h, mi) - 3600e3;
  for (let k = 0; k < 2; k++) { const p = zurichParts(guess); guess += ((h - p.h) * 60 + (mi - p.m)) * 60000; }
  return guess;
}
function startScenario() {
  if (!clock.isLive) { clock.stop(); S.follow = null; toast('Zurück im Live-Modus'); return; }
  let t = Date.now();
  for (let i = 0; i < 8; i++) { if (zurichParts(t).wd === 2 && (i > 0 || zurichParts(t).h < 7)) break; t += 864e5; }
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(new Date(t)).split('-').map(Number);
  clock.start('Szenario «Lea» · Di 07:07 · Zeitraffer ×20', zurichMs(ymd[0], ymd[1], ymd[2], 6, 58), 20);
  S.demo = true;
  toast('⏩ Szenario: Dienstag 06:58, Zürich HB – der Lernzug fährt gleich ab');
  let tries = 0;
  const seek = () => {
    if (clock.isLive) return;
    const rt = [...S.trains.values()].find((x) => demoPassengers(x).length >= 10);
    if (rt) {
      S.follow = rt.k; S.sel = rt.k; recompute();
      mapCtl?.focusTrain(rt.k, 10.5); mapCtl?.flash(rt.k, 20000);
      toast('📖 Lernzug gefunden: IC ab Zürich HB · Wagen 7 · 11 Mitglieder', 'ok');
    } else if (++tries < 20) setTimeout(seek, 1500);
  };
  setTimeout(seek, 2500);
}

// ------------------------------- Events -----------------------------------
function onInput(e) {
  const t = e.target;
  if (!S.j) return;
  if (t.id === 'j-name') { S.j.name = t.value; const b = $('#j-go1'); if (b) b.disabled = !t.value.trim(); }
  if (t.id === 'j-last') S.j.last = t.value;
  if (t.id === 'j-prog') S.j.program = t.value;
  if (t.id === 'j-sem') S.j.sem = t.value;
  if (t.id === 'j-q') { S.j.q = t.value; searchStations(t.value); }
  if (t.id === 'j-rules') { S.j.rules = t.checked; const b = $('[data-act="j-finish"]'); if (b) b.disabled = !t.checked; }
}
function onKey(e) {
  if (e.target.tagName === 'INPUT' && e.key === 'Enter' && e.target.closest('.chat-in')) { e.preventDefault(); sendChat(e.target.closest('.chat-in').dataset.ch, e.target); return; }
  if (e.key === 'Enter' && e.target.id === 'j-name' && S.j.name?.trim()) { S.j.step = 2; render(true); return; }
  if (S.route !== 'beamer' || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === 'd') { S.demo = !S.demo; ls.set('cc_demo', S.demo); recompute(); render(true); }
  if (k === 's') startScenario();
  if (k === 'f') { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); }
  if (k === 'c') { S.follow = null; fitChBeamer(); }
  if (k === 'z') { S.follow = null; fitPilotBeamer(); }
  if (k === 'escape') location.hash = me() ? '#/heute' : '#/join';
}
document.addEventListener('submit', (e) => { const f = e.target.closest('.chat-in'); if (f) { e.preventDefault(); sendChat(f.dataset.ch, f.querySelector('input')); } });

async function onClick(e) {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act; const j = S.j;
  if (el.tagName === 'BUTTON' || a === 'close-sheet') e.preventDefault();
  switch (a) {
    case 'j-next':
      if (j.step === 1 && !j.name?.trim()) return;
      j.step++; render(true); if (j.step === 1) setTimeout(() => $('#j-name')?.focus(), 60); break;
    case 'j-back': j.step = Math.max(0, j.step - 1); render(true); break;
    case 'j-intent': j.intent = el.dataset.v; render(true); break;
    case 'j-geo': useGeo(); break;
    case 'j-quick': chooseStation(sbb.QUICK_STATIONS.find((s) => s.id === el.dataset.id)); break;
    case 'j-station': chooseStation((j.stations || []).find((s) => s.id === el.dataset.id)); break;
    case 'j-reload': loadDeps(j.station); break;
    case 'j-train': j.train = el.dataset.k; j.step = 5; render(true); break;
    case 'j-wagon': j.wagon = +el.dataset.v; render(true); break;
    case 'j-skip': j.station = null; j.train = null; j.step = 5.5; finishJoinNoTrain(); break;
    case 'j-finish': if (j.mode !== 'board' && !j.rules) return; await finishJoin(true); break;
    case 'netiquette': sheet(`<div class="sheet-h"><h3>Netiquette</h3><button class="x" data-act="close-sheet">×</button></div><ol class="rules-ol"><li>Respektvoll im Chat <b>und</b> im Zug.</li><li>Wer «nur mitfahren» angibt, wird nicht angesprochen.</li><li>Kein Live-Standort – nur der Zug ist sichtbar, und nur während der Fahrt.</li><li>Probleme melden: an Streckenhosts und an die zentrale Admin-Stelle (auch wenn ein Host beteiligt ist).</li><li>Nur eigene oder frei lizenzierte Lernunterlagen teilen (Urheberrecht).</li><li>Keine KI-Bots im Chat: Hier schreiben Menschen.</li></ol>`); break;
    case 'theory': theorySheet(el.dataset.id); break;
    case 'close-sheet': closeSheet(); break;
    case 'alight': await S.store.update(`members/${meId()}`, { board: null }); toast('Ausgestiegen – bis zur nächsten Fahrt!'); break;
    case 'sit-learn': {
      const b = { ...me().board, wagon: +el.dataset.w };
      await S.store.update(`members/${meId()}`, { board: b });
      toast(`Wagen ${el.dataset.w} – die anderen sehen jetzt, dass du dazukommst 📖`, 'ok'); break;
    }
    case 'focus-chat': $('.chat-in input')?.focus(); break;
    case 'quick-board': {
      const m = me(); S.j = { mode: 'board', step: 5, station: { id: m.home.id, name: m.home.n }, train: el.dataset.k };
      location.hash = '#/einsteigen'; render(true); break;
    }
    case 'board-here': {
      const t = trainFor(el.dataset.k); const s = t.s[+el.dataset.i];
      closeSheet();
      S.j = { mode: 'board', step: 5, station: { id: s.id, name: s.n }, train: t.k };
      location.hash = '#/einsteigen'; break;
    }
    case 'show-mine': { const k = me()?.board?.k; if (!k) break; if (S.route !== 'karte') { location.hash = '#/karte'; setTimeout(() => mapCtl?.focusTrain(k, 10), 400); } else mapCtl?.focusTrain(k, 10); break; }
    case 'fit-ch': S.follow = null; mapCtl?.fitCH(); break;
    case 'fit-home': mapCtl?.fitBounds(PHONE_BOUNDS); break;
    case 'only-ppl': S.onlyPpl = !S.onlyPpl; recompute(); render(true); break;
    case 'toggle-demo': S.demo = !S.demo; ls.set('cc_demo', S.demo); recompute(); render(true); toast(S.demo ? '🧪 Demo-Pendler sichtbar (klar markiert)' : 'Nur echte Mitglieder'); break;
    case 'toggle-rail': S.rail = !S.rail; ls.set('cc_rail', S.rail); mapCtl?.toggleRail(S.rail); render(true); break;
    case 'toggle-theory': S.theory = !S.theory; ls.set('cc_theory', S.theory); render(true); break;
    case 'toggle-gam': S.gam = !(S.gam && me()?.gam !== false); ls.set('cc_gam', S.gam); await S.store.update(`members/${meId()}`, { gam: S.gam }); break;
    case 'net-retry': refreshNetwork(true); break;
    case 'ritual': {
      const on = !(S.rsvp[SETTINGS.ritual.id] || {})[meId()];
      await S.store.set(`rsvp/${SETTINGS.ritual.id}/${meId()}`, on ? 'yes' : null);
      if (on) { S.store.push('feed', { type: 'ritual', name: me().name, uid: meId(), ts: Date.now() }); toast('📅 Du bist beim Lernzug dabei – Dienstag 07:07, Wagen 7', 'ok'); }
      break;
    }
    case 'waitlist': {
      const id = el.dataset.id;
      const set = new Set(S.waitlist);
      const added = !set.has(id);
      added ? set.add(id) : set.delete(id);
      S.waitlist = [...set];
      ls.set('cc_waitlist', S.waitlist);
      render(true);
      toast(added ? '✓ Vorgemerkt – die Strecke startet ab 25 Pendelnden' : 'Vormerkung entfernt');
      break;
    }
    case 'rsvp': {
      const cur = (S.rsvp[SETTINGS.stammtisch.id] || {})[meId()];
      const v = cur === el.dataset.v ? null : el.dataset.v;
      await S.store.set(`rsvp/${SETTINGS.stammtisch.id}/${meId()}`, v);
      if (v === 'yes') S.store.push('feed', { type: 'rsvp', name: me().name, uid: meId(), ts: Date.now() });
      break;
    }
    case 'report': {
      sheet(`<div class="sheet-h"><h3>Nachricht melden</h3><button class="x" data-act="close-sheet">×</button></div><p class="muted">Die Meldung geht an die Streckenhosts <b>und</b> an die zentrale Admin-Stelle – auch falls ein Host selbst beteiligt ist.</p>
        <div class="list">${['Respektlos / beleidigend', 'Spam / Werbung', 'Unangenehme Situation im Zug', 'Urheberrecht'].map((r) => `<button class="li" data-act="report-send" data-r="${esc(r)}" data-ch="${esc(el.dataset.ch)}" data-id="${esc(el.dataset.id)}"><span class="grow">${esc(r)}</span>›</button>`).join('')}</div>
        <button class="btn ghost danger" data-act="block" data-uid="${esc(el.dataset.uid)}">Person blockieren</button>`);
      break;
    }
    case 'report-send': S.store.push('reports', { ch: el.dataset.ch, msg: el.dataset.id, reason: el.dataset.r, by: meId(), ts: Date.now() }); closeSheet(); toast('Danke – Meldung ist bei Hosts & Admin-Stelle'); break;
    case 'block': S.blocked = [...new Set([...S.blocked, el.dataset.uid])]; ls.set('cc_blocked', S.blocked); closeSheet(); recompute(); render(true); toast('Blockiert – du siehst diese Person nicht mehr'); break;
    case 'notify': {
      const m = me(); const k = m.board?.k; const t = k && trainFor(k);
      if (!('Notification' in window)) { toast('Dein Browser unterstützt keine Benachrichtigungen'); break; }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { toast('Benachrichtigungen nicht erlaubt'); break; }
      const dep = t ? sbb.stopTimes(stopOf(t, m.board.from.id)).dep : null;
      const wait = dep ? dep - clock.now() - 10 * 60000 : 4000;
      setTimeout(() => new Notification('Campus Commuters', { body: t ? `In 10 Min: ${sbb.lineLabel(t)} → ${t.to}. ${pplOn(k).length} Mitglieder an Bord.` : 'Lernzug Dienstag 07:07 · Wagen 7 – bist du dabei?', icon: 'assets/icon-192.png' }), Math.max(3000, wait));
      toast(dep && wait > 4000 ? `🔔 Erinnerung kommt ${relMin(dep - 10 * 60000)}` : '🔔 Test-Erinnerung in 3 Sekunden'); break;
    }
    case 'invite': {
      const url = `${joinUrl()}?ref=${meId()}`;
      const data = { title: 'Campus Commuters', text: 'Wer aus der HSG sitzt in deinem Zug? Aus Pendelzeit wird gemeinsame Zeit.', url };
      if (navigator.share) { try { await navigator.share(data); } catch { /* abgebrochen */ } } else { await navigator.clipboard?.writeText(url); toast('🔗 Einladungslink kopiert'); }
      break;
    }
    case 'scenario': startScenario(); if (!clock.isLive) location.hash = '#/karte'; break;
    case 'day': {
      const d = new Set(me().days || []); const v = +el.dataset.v; d.has(v) ? d.delete(v) : d.add(v);
      await S.store.update(`members/${meId()}`, { days: [...d].sort() }); break;
    }
    case 'p-intent': await S.store.update(`members/${meId()}`, { intent: el.dataset.v }); toast(`Absicht: ${INTENTS[el.dataset.v].label}`); break;
    case 'p-save': await S.store.update(`members/${meId()}`, { times: { hin: $('#p-hin').value, zur: $('#p-zur').value } }); toast('Gespeichert ✓', 'ok'); break;
    case 'become-host': await S.store.update(`members/${meId()}`, { role: 'host' }); confetti(); toast('🧭 Du bist jetzt Streckenhost – danke!', 'ok'); break;
    case 'delete-me':
      if (!confirm('Konto und alle deine Daten wirklich löschen?')) break;
      await S.store.remove(`members/${meId()}`);
      for (const ev of Object.keys(S.rsvp)) S.store.remove(`rsvp/${ev}/${meId()}`);
      ['cc_gam', 'cc_blocked', 'cc_waitlist'].forEach(ls.del);
      toast('Gelöscht. Danke fürs Mitfahren!'); S.j = null; location.hash = '#/join'; break;
    default: break;
  }
}
async function finishJoinNoTrain() {
  if (!S.j.rules) {
    S.j.step = 5; S.j.noTrain = true;
    sheet(`<div class="sheet-h"><h3>Netiquette</h3><button class="x" data-act="close-sheet">×</button></div><p>Respektvoll im Chat und im Zug · «Nur mitfahren» heisst in Ruhe lassen · kein Live-Standort · Probleme melden.</p><button class="btn big" data-act="j-accept-notrain">Einverstanden & beitreten</button>`);
    document.addEventListener('click', function once(ev) {
      if (ev.target.closest('[data-act="j-accept-notrain"]')) { document.removeEventListener('click', once); closeSheet(); S.j.rules = true; finishJoin(false); }
    });
    return;
  }
  finishJoin(false);
}

boot().catch((e) => { console.error(e); renderSplash('Fehler beim Start: ' + e.message); });
