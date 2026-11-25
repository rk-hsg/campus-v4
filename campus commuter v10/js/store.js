// ---------------------------------------------------------------------------
// Campus Commuters · store.js
// Ein Daten-Interface, zwei Backends:
//  • Firebase Realtime Database (Echtzeit für alle Geräte, persistent)
//  • Lokal (localStorage + BroadcastChannel; Fallback ohne Konfiguration)
// ---------------------------------------------------------------------------
import { firebaseConfig } from './config.js';
import { ls } from './util.js';

const configured = () => firebaseConfig && firebaseConfig.apiKey && firebaseConfig.databaseURL;

export async function createStore() {
  if (configured()) {
    try { return await firebaseStore(); } catch (e) { console.error('Firebase-Start fehlgeschlagen → lokaler Modus', e); }
  }
  return localStore();
}

// --------------------------- Firebase ------------------------------------
async function firebaseStore() {
  const [{ initializeApp }, A, D] = await Promise.all([
    import('../vendor/firebase/firebase-app.js'),
    import('../vendor/firebase/firebase-auth.js'),
    import('../vendor/firebase/firebase-database.js'),
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  const cred = await Promise.race([
    A.signInAnonymously(auth),
    new Promise((_, rej) => setTimeout(() => rej(new Error('Auth-Timeout')), 9000)),
  ]);
  const db = D.getDatabase(app);
  const uid = cred.user.uid;
  const r = (p) => D.ref(db, p);
  let connected = true;
  D.onValue(r('.info/connected'), (s) => { connected = !!s.val(); });
  return {
    mode: 'firebase',
    uid,
    get connected() { return connected; },
    on(path, cb) { return D.onValue(r(path), (s) => cb(s.val()), (e) => console.warn('read', path, e.message)); },
    onLast(path, n, cb) { return D.onValue(D.query(r(path), D.orderByChild('ts'), D.limitToLast(n)), (s) => cb(s.val())); },
    once: async (path) => (await D.get(r(path))).val(),
    set: (path, v) => D.set(r(path), v),
    update: (path, v) => D.update(r(path), v),
    push: (path, v) => D.push(r(path), v).key,
    remove: (path) => D.remove(r(path)),
    onDisconnectUpdate(path, v) { D.onDisconnect(r(path)).update(v); },
  };
}

// --------------------------- Lokal ---------------------------------------
function localStore() {
  const KEY = 'cc_localdb_v1';
  let uid = ls.get('cc_uid');
  if (!uid) { uid = 'local-' + Math.random().toString(36).slice(2, 10); ls.set('cc_uid', uid); }
  let db = ls.get(KEY, {});
  const listeners = new Set();
  const ch = 'BroadcastChannel' in window ? new BroadcastChannel('cc_local') : null;

  const parts = (p) => p.split('/').filter(Boolean);
  const getAt = (p) => parts(p).reduce((o, k) => (o == null ? undefined : o[k]), db) ?? null;
  const setAt = (p, v) => {
    const ks = parts(p);
    let o = db;
    for (let i = 0; i < ks.length - 1; i++) { if (typeof o[ks[i]] !== 'object' || o[ks[i]] == null) o[ks[i]] = {}; o = o[ks[i]]; }
    if (v === null || v === undefined) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = JSON.parse(JSON.stringify(v));
  };
  const related = (a, b) => a === b || a.startsWith(b + '/') || b.startsWith(a + '/') || a === '' || b === '';
  const save = (changed) => {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* */ }
    ch?.postMessage({ changed });
    notify(changed);
  };
  const notify = (changed) => listeners.forEach((l) => { if (related(l.path, changed)) l.fire(); });
  ch && (ch.onmessage = (e) => { db = ls.get(KEY, {}); notify(e.data.changed); });
  window.addEventListener('storage', (e) => { if (e.key === KEY) { db = ls.get(KEY, {}); notify(''); } });

  const sub = (path, cb, n) => {
    const l = {
      path: parts(path).join('/'),
      fire() {
        let v = getAt(path);
        if (n && v && typeof v === 'object') v = Object.fromEntries(Object.entries(v).sort((a, b) => (a[1].ts || 0) - (b[1].ts || 0)).slice(-n));
        cb(v == null ? null : JSON.parse(JSON.stringify(v)));
      },
    };
    listeners.add(l);
    setTimeout(() => l.fire(), 0);
    return () => listeners.delete(l);
  };

  return {
    mode: 'local',
    uid,
    connected: true,
    on: (path, cb) => sub(path, cb),
    onLast: (path, n, cb) => sub(path, cb, n),
    once: async (path) => getAt(path),
    set: async (path, v) => { setAt(path, v); save(parts(path).join('/')); },
    update: async (path, v) => { for (const [k, val] of Object.entries(v)) setAt(`${path}/${k}`, val); save(parts(path).join('/')); },
    push: (path, v) => { const k = Date.now().toString(36) + Math.random().toString(36).slice(2, 6); setAt(`${path}/${k}`, v); save(parts(path).join('/')); return k; },
    remove: async (path) => { setAt(path, null); save(parts(path).join('/')); },
    onDisconnectUpdate() { /* lokal nicht nötig */ },
  };
}
