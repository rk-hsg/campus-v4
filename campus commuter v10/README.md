# Campus Commuters 🚆

**«Aus Pendelzeit wird gemeinsame Zeit.»**
Gruppe 8 · Community Management HS26 · Universität St. Gallen

Sieh, wer aus der HSG in deinem Zug sitzt – und ob die Person **lernen**, **reden** oder einfach **mitfahren** will.

## Was die App kann

| Bereich | Funktion |
|---|---|
| **Beitreten** | QR scannen → Vorname, Studiengang, Absicht → Standort (oder Bahnhof von Hand) → Live-Abfahrten → Wagen → einsteigen. Keine Registrierung, kein Passwort. |
| **Live-Fahrplan** | Echte SBB-Daten über [transport.opendata.ch](https://transport.opendata.ch): Abfahrten, Gleis, Verspätung, alle Halte. |
| **Live-Karte** | Alle Züge im Einzugsgebiet fahren animiert über die Karte (Position aus Fahrplan + Echtzeit-Verspätung berechnet, wie die SBB-Zugkarte). Mitglieder an Bord als Initialen-Bubbles; ab 5 Personen ein Zähler-Kreis mit Absichts-Ring (grün lernen · orange reden · grau mitfahren). |
| **Heute** | Mein Zug mit Live-Fortschritt, nächster Halt, wer an Bord ist (inkl. «steigt in Winterthur ein»), «Zum Lernen dazusetzen · Wagen 7», Zug-Chat. |
| **Strecke** | Kritische-Masse-Meter, Lernzug-Ritual (Di 07:07, Wagen 7), Stammtisch-RSVP, Netiquette, Streckenchat mit Melden & Blockieren. |
| **Profil** | Pendelprofil, Membership Life Cycle (Beobachter → Mitpendler → Stammgast → Host), Badges & Streaks (abschaltbar), Daten löschen. |
| **Theorie-Ebene** | Bei jeder Funktion ein 🎓-Chip: «Warum so?» mit dem Kurskonzept dahinter. Übersicht unter `#/theorie`, gegliedert nach der 6-teiligen Abgabestruktur. |
| **Beamer-Modus** | `#/beamer` – Vollbild-Karte (dunkel), grosser QR-Code, Live-Zähler, Beitritts-Animationen, Absichts-Verteilung, Feed. |
| **Szenario «Lea»** | Taste **S** im Beamer: Zeitreise zu Dienstag 06:58, Zeitraffer ×20 – der Lernzug mit 11 Mitgliedern fährt live von Zürich nach St. Gallen. |

Simulierte **Demo-Pendler** (klar als «Demo» markiert) zeigen, wie die Community bei kritischer Masse aussieht. Ein-/ausschaltbar (Taste **D** im Beamer, Schalter im Profil).

## Online stellen (GitHub Pages, gratis)

1. Neues **öffentliches** Repository auf GitHub erstellen, z. B. `campus-commuters`.
2. Den **Inhalt dieses Ordners** hineinpushen (die `index.html` muss im Hauptverzeichnis liegen).
3. Auf GitHub: **Settings → Pages → Build and deployment → Source: «Deploy from a branch» → Branch: `main` / `/ (root)` → Save**.
4. Nach 1–2 Minuten erreichbar unter `https://DEINNAME.github.io/campus-commuters/`.
5. **Firebase einrichten** (für Live-Sync zwischen allen Geräten): siehe [`FIREBASE_SETUP.md`](FIREBASE_SETUP.md).

Lokal testen: `python3 -m http.server 8080` im Ordner, dann `http://localhost:8080` (direkt per Doppelklick auf die HTML-Datei geht nicht, weil die App JavaScript-Module nutzt).

## Ablauf in der Präsentation

1. **Vorher (Laptop am Beamer):** `https://DEINNAME.github.io/campus-commuters/#/beamer` öffnen → **F** für Vollbild.
2. Publikum scannt den QR-Code → tritt bei → erscheint sofort gross auf der Leinwand, ihr Zug pulsiert auf der Karte.
3. Optional **S** drücken: Szenario «Lea, Dienstag 07:07» – der Lernzug fährt im Zeitraffer.
4. **D** schaltet die Demo-Pendler aus → nur noch die echten Leute aus dem Raum → kritische Masse live erklärt.
5. Am Handy zeigen: 🎓-Chips → Theorie hinter jeder Funktion.

Tasten im Beamer: **D** Demo · **S** Szenario · **F** Vollbild · **C** Übersicht · **Z** Pilotstrecke · **Esc** zurück.

## Technik

- Reines HTML/CSS/JavaScript, kein Build-Schritt, keine Abhängigkeit von CDNs (Leaflet, Firebase, QR-Code und Schrift liegen in `vendor/`).
- **Daten:** Firebase Realtime Database (anonyme Anmeldung, Sicherheitsregeln in `database.rules.json`) – oder automatisch lokaler Modus ohne Konfiguration.
- **Fahrplan-Schonung:** Im Firebase-Modus holt nur der Beamer die Fahrpläne und verteilt sie an alle Handys. So bleibt die SBB-API auch bei 100 Geräten im selben WLAN entspannt.
- **Karte:** reduzierter Schweiz-Umriss mit Seen (BFS/swisstopo, `assets/ch.geo.json`), grosse Städte, BAV-Schienennetz (swisstopo) in HSG-Grün – frei nutzbar, kein API-Key. **Fahrplan:** opendata.ch.
- **Datenschutz:** Kein GPS wird gespeichert (der Standort dient nur der Bahnhofsuche im Browser). Sichtbar ist nur «welcher Zug», und nur während der Fahrt. «Nur mitfahren» = anonym gezählt.

## Ordnerstruktur

```
index.html            App-Einstieg
css/app.css           Design
js/app.js             Oberfläche, Ablauf, Beamer-Modus
js/sbb.js             SBB-Live-Daten & Zugpositionen
js/map.js             Animierte Karte
js/store.js           Firebase / lokaler Speicher
js/sim.js             Demo-Pendler (deterministisch, gekennzeichnet)
js/theory.js          Kurskonzepte («Warum so?»)
js/config.js          ← hier die Firebase-Konfiguration einfügen
database.rules.json   Firebase-Sicherheitsregeln
FIREBASE_SETUP.md     Schritt-für-Schritt-Anleitung
```
