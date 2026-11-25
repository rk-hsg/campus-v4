# Firebase einrichten – in 5 Minuten, ohne Programmierkenntnisse

Damit alle Handys im Hörsaal **gleichzeitig** dieselben Mitglieder sehen und alles **dauerhaft gespeichert** bleibt, braucht die App einen kostenlosen Online-Speicher: Firebase (von Google). Ohne Firebase läuft die App trotzdem, aber nur im «Lokalen Demo-Modus» (jedes Gerät sieht nur sich selbst).

> Kosten: **0 CHF.** Der Gratis-Tarif «Spark» reicht für die Präsentation locker. Keine Kreditkarte nötig.

---

## Schritt 1 · Projekt anlegen (1 Min.)

1. Öffne **https://console.firebase.google.com** und melde dich mit einem Google-Konto an.
2. Klicke auf **«Projekt erstellen»** (bzw. «Create a project»).
3. Name: `campus-commuters` → **Weiter**.
4. **Google Analytics: ausschalten** (Schalter auf grau) → **Projekt erstellen**.
5. Warten, bis «Ihr neues Projekt ist bereit» erscheint → **Weiter**.

## Schritt 2 · Anonyme Anmeldung einschalten (1 Min.)

Damit niemand ein Passwort braucht, die Daten aber trotzdem geschützt sind.

1. Links im Menü: **Build → Authentication** (deutsch: «Erstellen → Authentifizierung»).
2. Klicke auf **«Jetzt starten»** / «Get started».
3. Reiter **«Sign-in method»** → in der Liste **«Anonym»** / «Anonymous» anklicken.
4. Schalter auf **Aktivieren** → **Speichern**.

## Schritt 3 · Datenbank anlegen (1 Min.)

1. Links im Menü: **Build → Realtime Database** (⚠️ nicht «Firestore»).
2. **«Datenbank erstellen»** / «Create Database».
3. Standort: **Belgium (europe-west1)** (EU, passt zum Datenschutz) → **Weiter**.
4. **«Im gesperrten Modus starten»** / «Start in locked mode» → **Aktivieren**.

## Schritt 4 · Sicherheitsregeln einfügen (1 Min.)

1. In der Realtime Database oben auf den Reiter **«Regeln»** / «Rules».
2. Den ganzen Text im Editor **löschen**.
3. Den kompletten Inhalt der Datei **`database.rules.json`** (liegt im selben Ordner wie diese Anleitung) hineinkopieren.
4. **«Veröffentlichen»** / «Publish».

Die Regeln sorgen dafür, dass jede Person nur ihr eigenes Profil ändern kann und Chatnachrichten nicht gefälscht werden können.

## Schritt 5 · Web-App registrieren & Konfiguration kopieren (1 Min.)

1. Oben links neben «Projektübersicht» auf das **Zahnrad ⚙️ → Projekteinstellungen**.
2. Ganz unten bei «Meine Apps» auf das Symbol **`</>`** (Web) klicken.
3. App-Spitzname: `campus-commuters-web` → **App registrieren** (Firebase Hosting **nicht** anhaken).
4. Es erscheint ein Code-Block mit `const firebaseConfig = { ... }`. Du brauchst nur den Teil **zwischen den geschweiften Klammern**, z. B.:

```js
apiKey: "AIzaSyD...",
authDomain: "campus-commuters.firebaseapp.com",
databaseURL: "https://campus-commuters-default-rtdb.europe-west1.firebasedatabase.app",
projectId: "campus-commuters",
storageBucket: "campus-commuters.appspot.com",
messagingSenderId: "1234567890",
appId: "1:1234567890:web:abc123"
```

> ⚠️ **Fehlt `databaseURL`?** Dann kopiere sie aus der Realtime Database: Oben steht eine Adresse wie `https://campus-commuters-default-rtdb.europe-west1.firebasedatabase.app` – diese als `databaseURL: "…",` ergänzen.

## Schritt 6 · In die App einfügen (1 Min.)

1. Öffne im Projektordner die Datei **`js/config.js`** (mit jedem Texteditor oder direkt auf GitHub: Datei anklicken → Stift-Symbol ✏️).
2. Ersetze den Block

```js
export const firebaseConfig = {
  apiKey: "",
  ...
};
```

durch deine Werte aus Schritt 5 (Anführungszeichen und Kommas beibehalten).

3. Speichern, committen, pushen. Nach ca. 1 Minute ist GitHub Pages aktualisiert.

## Fertig? So prüfst du es

Öffne die App auf zwei Geräten (z. B. Laptop + Handy).
- Unten im **Profil** steht «Live-Backend», im **Beamer-Modus** unten «● Live-Sync».
- Tritt auf dem Handy bei → auf dem Laptop (Beamer-Modus) erscheint sofort «… ist eingestiegen».

Steht dort «Lokaler Modus», stimmt die Konfiguration noch nicht. Häufigste Ursachen:
- `databaseURL` fehlt oder ist leer.
- In Schritt 2 wurde «Anonym» nicht aktiviert.
- Ein Komma oder Anführungszeichen in `config.js` fehlt (Browser-Konsole zeigt dann einen Fehler).

---

### Ist der API-Key nicht geheim?

Nein. Firebase-Web-Konfigurationen sind **dafür gemacht, öffentlich** im Browser zu stehen (auch in einem öffentlichen GitHub-Repo). Geschützt wird die Datenbank durch die **Sicherheitsregeln** aus Schritt 4 und die anonyme Anmeldung. Optional kannst du unter *Authentication → Settings → Authorized domains* deine Adresse `DEINNAME.github.io` eintragen.

### Nach der Präsentation aufräumen

*Realtime Database → Daten* → beim obersten Eintrag auf «⋮ → Löschen». Oder das ganze Projekt unter *Projekteinstellungen → Projekt löschen*.
