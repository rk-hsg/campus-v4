// ---------------------------------------------------------------------------
// Campus Commuters · sim.js
// Simulierte Demo-Pendler (klar als «Demo» gekennzeichnet). Deterministisch
// pro Zug (Seed = Zug-ID): alle Geräte sehen dieselben Demo-Personen. Sie
// steigen an echten Halten ein/aus – die Zahl an Bord ändert sich live.
// Zweck: Cold-Start-Problem & kritische Masse in der Präsentation sichtbar machen.
// ---------------------------------------------------------------------------
import { hash, rng, pick, zurichParts } from './util.js';
import { touchesStGallen, HSG_STATION, positionOf, stopTimes } from './sbb.js';

const FIRST = ['Lea', 'Mara', 'Jonas', 'Amira', 'Luca', 'Noah', 'Mia', 'Elena', 'Nico', 'Lara', 'Jan', 'Sofia', 'Timo', 'Nina', 'Leon', 'Anna', 'Yannick', 'Selina', 'David', 'Chiara', 'Fabian', 'Laura', 'Marco', 'Julia', 'Sven', 'Alina', 'Robin', 'Tamara', 'Matteo', 'Lena', 'Samuel', 'Jana', 'Gian', 'Aline', 'Joël', 'Valentina', 'Cédric', 'Zoe', 'Florian', 'Hanna', 'Rahel', 'Arian', 'Mehmet', 'Ladina', 'Dario'];
const LAST = 'ABBCDEFGHKKLMMNRSSTWZ';
const PROG = ['BWL', 'BWL', 'VWL', 'IA', 'Law', 'CS', 'BLE', 'MBF', 'MACFin', 'SIM', 'MiM'];
const COURSES = ['Corporate Finance', 'Statistik', 'Makro II', 'Privatrecht', 'Marketing', 'Data Science', 'Accounting', 'Community Management', 'Mikro I', 'Programmieren'];

function person(r, id, extra = {}) {
  const intentRoll = r();
  return {
    id, demo: true,
    name: `${pick(r, FIRST)} ${pick(r, LAST.split(''))}.`,
    program: pick(r, PROG), sem: 1 + Math.floor(r() * 6),
    course: pick(r, COURSES),
    intent: intentRoll < 0.5 ? 'learn' : intentRoll < 0.8 ? 'talk' : 'ride',
    wagon: 1 + Math.floor(r() * 12),
    role: 'member',
    ...extra,
  };
}

function isRitualTrain(t) {
  const z = t.s.findIndex((s) => s.id === '8503000');
  if (z < 0 || !touchesStGallen(t) || !/^(IC|IR)$/.test(t.cat)) return false;
  const sg = t.s.findIndex((s) => s.id === HSG_STATION.id);
  if (sg < z) return false;
  const p = zurichParts(stopTimes(t.s[z]).dep);
  return p.wd === 2 && p.h === 7 && p.m >= 0 && p.m <= 14;
}

const memo = new Map();
/** Alle Demo-Personen, die diesem Zug zugeordnet sind (mit Ein-/Ausstiegsindex). */
export function demoPassengers(t) {
  if (memo.has(t.k)) return memo.get(t.k);
  const r = rng(hash(t.k));
  const n = t.s.length;
  const sgIdx = t.s.findIndex((s) => s.id === HSG_STATION.id);
  const people = [];
  if (isRitualTrain(t)) {
    const z = t.s.findIndex((s) => s.id === '8503000');
    const w = t.s.findIndex((s) => /^Winterthur$/.test(s.n));
    const fixed = [
      { name: 'Mara K.', program: 'BWL', sem: 5, course: 'Corporate Finance', intent: 'learn', role: 'host' },
      { name: 'Jonas S.', program: 'VWL', sem: 3, course: 'Statistik', intent: 'learn', b: w },
      { name: 'Amira H.', program: 'IA', sem: 3, course: 'Makro II', intent: 'talk' },
      { name: 'Anonym', intent: 'ride' },
    ];
    fixed.forEach((f, i) => people.push({ ...person(r, `demo-${t.k}-f${i}`), ...f, wagon: 7, b: f.b > 0 ? f.b : z, x: sgIdx }));
    for (let i = 0; i < 7; i++) people.push(person(r, `demo-${t.k}-r${i}`, { intent: 'learn', wagon: 7, b: r() < 0.7 ? z : (w > 0 ? w : z), x: sgIdx }));
  } else if (sgIdx >= 0) {
    if (r() > 0.18) {
      const cnt = 1 + Math.floor(r() * r() * 9);
      for (let i = 0; i < cnt; i++) {
        let b, x;
        if (sgIdx > 0 && r() < 0.75) { b = Math.floor(r() * sgIdx); x = sgIdx; } // Richtung HSG
        else { b = sgIdx < n - 1 ? sgIdx : 0; x = Math.min(n - 1, b + 1 + Math.floor(r() * (n - 1 - b))); } // ab HSG nach Hause
        if (x <= b) x = n - 1;
        people.push(person(r, `demo-${t.k}-${i}`, { b, x }));
      }
    }
  } else if (r() < 0.1) {
    const cnt = 1 + Math.floor(r() * 2);
    for (let i = 0; i < cnt; i++) {
      const b = Math.floor(r() * (n - 1));
      people.push(person(r, `demo-${t.k}-${i}`, { b, x: n - 1 }));
    }
  }
  // Ein- und Ausstiegsnamen
  for (const p of people) { p.boardName = t.s[p.b]?.n; p.boardId = t.s[p.b]?.id; p.alightName = t.s[p.x]?.n; p.alightId = t.s[p.x]?.id; }
  memo.set(t.k, people);
  if (memo.size > 3000) memo.delete(memo.keys().next().value);
  return people;
}

/** Wer ist JETZT an Bord (abhängig von der aktuellen Zugposition)? */
export function demoOnBoard(t, now) {
  const pos = positionOf(t, now);
  if (pos.state === 'arrived') return [];
  const idx = pos.idx; // Segment idx → idx+1 bzw. am Bahnhof idx
  return demoPassengers(t).filter((p) => idx >= p.b && idx < p.x);
}

/** Demo-Baseline für die Pilotstrecke (für Statistiken) */
export const DEMO_ROUTE_BASE = { members: 37, hosts: 3, ritual: 10 };
