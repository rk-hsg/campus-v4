// ---------------------------------------------------------------------------
// Campus Commuters · theory.js
// «Warum so?» – jede Funktion ist mit einem Konzept aus dem Kurs
// Community Management (HS26, Prof. Dr. V. Lenz-Kesekamp) verknüpft.
// ---------------------------------------------------------------------------
export const THEORY = {
  purpose: {
    title: 'Purpose & kollektive Identität', src: 'VL01 · Strategisches Design', chapter: 1,
    theory: 'Eine Community braucht einen klaren Zweck, mit dem sich Mitglieder identifizieren, und ein verbindendes Element, das sie von anderen unterscheidet.',
    here: '«Aus Pendelzeit wird gemeinsame Zeit.» Verbindendes Element: gleiche Strecke, gleiches Zeitfenster, gleiche Lücke im Campusleben. Der Mehrwert kostet keine Extra-Zeit.',
  },
  bki: {
    title: 'Bedürfnis-Kommunikation-Information-Matrix', src: 'VL01/VL02 · BKI-Matrix', chapter: 3,
    theory: 'Aus den Bedürfnissen der Zielgruppe werden Kommunikations- und Informationsanforderungen abgeleitet und dann in Funktionen übersetzt.',
    here: 'Verbindung → «Heute in meinem Zug» · Entwicklung → Lernzug & Streckenchat · Aktualität → Live-Fahrplan, Verspätung, Wagen-Angabe. Jede Funktion dieser App ist auf eine Zeile der Matrix zurückführbar.',
  },
  relation: {
    title: 'Beziehungsart: communal statt exchange', src: 'VL01 · Zielgruppenanalyse', chapter: 2,
    theory: 'Exchange-Beziehungen beruhen auf direkter Gegenleistung, communal-Beziehungen auf Fürsorge und Zugehörigkeit.',
    here: 'Campus Commuters ist bewusst communal: Niemand «bezahlt» für Hilfe, man teilt Zeit, Plätze und Tipps. Deshalb gibt es keine Punkte-Ökonomie und keine Rankings gegeneinander.',
  },
  personas: {
    title: 'Drei Personas nach Aktivität', src: 'VL01 · Personas', chapter: 2,
    theory: 'Personas machen Zielgruppen greifbar; sie sollten das Aktivitätsspektrum (sehr aktiv, gelegentlich aktiv, Lurker) abdecken.',
    here: 'Mara (Host, sehr aktiv) · Lea (pendelt 3×/Woche, ab und zu aktiv) · Jonas (liest mit, «nur mitfahren»). Die App unterstützt alle drei: Host-Werkzeuge, 1-Tap-Einstieg, anonymes Mitfahren.',
  },
  participation: {
    title: 'Partizipation 90-9-1 (Nielsen) vs. 70-20-10 (Schneider)', src: 'VL01 · Partizipationsregeln', chapter: 2,
    theory: 'In Online-Communitys beteiligt sich nur eine Minderheit aktiv. Nielsen: 90 % Lurker, 9 % gelegentlich, 1 % Kern. Schneider: in engagierten Communitys eher 70-20-10.',
    here: 'Weil die Begegnung offline im Zug passiert, erwarten wir eine Verteilung näher an 70-20-10: Schon «einsteigen» ist eine Handlung, die anderen nützt (Sichtbarkeit), ohne schreiben zu müssen.',
  },
  criticalmass: {
    title: 'Kritische Masse', src: 'VL01 · Social Design', chapter: 2,
    theory: 'Eine Community entfaltet ihren Nutzen erst, wenn genug Mitglieder aktiv sind; darunter wirkt sie leer und verliert Mitglieder.',
    here: 'Kritische Masse wird hier lokal gemessen: pro Zugverbindung, nicht pro App. Darum starten wir auf EINER Strecke (Zürich – St. Gallen) und zeigen den Fortschritt transparent an.',
  },
  network: {
    title: 'Direkte & indirekte Netzwerkeffekte', src: 'VL01 · Netzwerkeffekte', chapter: 2,
    theory: 'Direkt: jedes neue Mitglied erhöht den Nutzen für alle anderen. Indirekt: mehr Mitglieder ziehen ergänzende Angebote an (z. B. Rituale, Events).',
    here: 'Direkt: jede Person mehr im IC 1 erhöht die Chance auf Lernpartner. Indirekt: ab genug Mitgliedern entstehen Lernzüge, Stammtische und Streckenhosts.',
  },
  socialgraph: {
    title: 'Profilebenen & Social Graph', src: 'VL01 · Profile, Social Graph', chapter: 2,
    theory: 'Freundschaftsgraph (gegenseitig) vs. Audience-Graph (einseitig folgen). Profilebenen steuern, was wer sieht.',
    here: 'Wir nutzen einen Gruppen-/Kontextgraph: Man ist über Strecke und Zug verbunden, nicht über Freundschaftsanfragen. Drei Profilebenen: öffentlich (Vorname, Studiengang), im Zug (Wagen, Absicht), privat (Zeiten, Heimatbahnhof).',
  },
  roles: {
    title: 'Rollen & Membership Life Cycle', src: 'VL02 · Rollen, Membership Life Cycle', chapter: 2,
    theory: 'Mitglieder durchlaufen Phasen vom Besucher über Neuling und Stammgast bis zur Führungsrolle. Formale und informelle Rollen geben Orientierung.',
    here: 'Beobachter → Mitpendler → Stammgast → Streckenhost. Der Fortschritt ist im Profil sichtbar; Hosts sind formale Rollen, «Wagen-7-Stammgast» eine informelle.',
  },
  governance: {
    title: 'Governance: Netiquette, Datenschutz, Urheberrecht', src: 'VL02 · Governance-Bausteine', chapter: 2,
    theory: 'Regeln, Nutzungsbedingungen und Datenschutz schaffen Vertrauen und Sicherheit.',
    here: 'Netiquette vor dem ersten Beitritt · kein GPS-Tracking (nur «welcher Zug», auf Zugebene) · Melden an Hosts UND zentrale Stelle · Blockieren · Daten jederzeit löschen (revDSG). Lernunterlagen nur eigene oder frei lizenzierte teilen.',
  },
  empowerment: {
    title: 'Empowerment-Moderation', src: 'VL02 · Ziegele & Heinbach (2021)', chapter: 3,
    theory: 'Bestärkende Moderation: Strukturgeber, Vorbild und offenes Ohr statt reinem Löschen.',
    here: 'Streckenhosts legen Lernzüge an, begrüssen Neue im Chat und sammeln Feedback. Die App schlägt Hosts Begrüssungen vor, statt automatisch zu moderieren.',
  },
  comm: {
    title: 'Kommunikationsdesign: synchron & asynchron', src: 'VL02 · Kommunikationsdesign', chapter: 3,
    theory: 'Synchrone (gleichzeitige) und asynchrone Kommunikation erfüllen unterschiedliche Bedürfnisse.',
    here: 'Asynchron: Streckenchat & Ritual-Planung vorab. Synchron: Zug-Chat während der Fahrt und – das Ziel – das Gespräch im Zug selbst. Die App ist Brücke, nicht Ersatz.',
  },
  watzlawick: {
    title: 'Watzlawick & Lasswell: Inhalt vs. Beziehung', src: 'VL02 · Kommunikationsmodelle; Gastvortrag Jansen', chapter: 3,
    theory: 'Jede Kommunikation hat einen Inhalts- und einen Beziehungsaspekt (Watzlawick). Lasswell: Wer sagt was über welchen Kanal zu wem mit welcher Wirkung?',
    here: 'Die App trägt den Inhalt (Zug, Wagen, Absicht), die Beziehung entsteht offline im Zug. Darum: keine KI-Antworten im Chat – Menschen sprechen mit Menschen.',
  },
  info: {
    title: 'Informationsdesign', src: 'VL02 · Informationsdesign', chapter: 4,
    theory: 'Welche Informationen braucht wer, wann, in welcher Form – und wie fliessen sie?',
    here: 'Statisch (Profil, Studiengang) · dynamisch (Verspätung, Gleis, Position, wer ist an Bord) · sozial (Rituale, Stammtische). Fluss: SBB-Echtzeit → App → Push/Heute-Karte → Gespräch im Zug.',
  },
  visual: {
    title: 'Visuelles Design & Look-and-Feel', src: 'VL01 · Strukturvorgaben', chapter: 5,
    theory: 'Bildwelt, Farben und Tonalität transportieren die Identität der Community.',
    here: 'HSG-nahes Grün (Zugehörigkeit), warmes Sand (Gemeinschaft), Logo: zwei Wege werden zu einem. Tonalität: du-Form, ruhig, keine Alarm-Rottöne ausser bei Verspätungen.',
  },
  coldstart: {
    title: 'Cold Start', src: 'VL03 · Community Management', chapter: 6,
    theory: 'Leere Communitys schrecken ab. Der Start braucht einen engen Fokus und aktive Gründer.',
    here: 'Eine Strecke, ein Ritual (Di 07:07, Wagen 7), Gründer als erste Hosts. Demo-Pendler zeigen in der Präsentation, wie es bei kritischer Masse aussieht – klar gekennzeichnet.',
  },
  viral: {
    title: 'Virale Effekte', src: 'VL03 · Online-Marketing, Earned/Shared Media', chapter: 6,
    theory: 'Mitglieder bringen Mitglieder: Shared & Earned Media wirken glaubwürdiger als Paid Media.',
    here: '«Bring-a-Friend»-Link teilen, QR-Code im Zug & in der Startwoche, Badge «Brückenbauer» wenn jemand über dich beitritt. Sichtbarkeit im physischen Raum ist unser stärkster Kanal.',
  },
  hooked: {
    title: 'Hooked-Modell (Eyal) & Fogg-Trigger', src: 'VL03 · Addictive Design', chapter: 6,
    theory: 'Trigger → Action → Variable Reward → Investment. Fogg: Verhalten = Motivation × Fähigkeit × Trigger.',
    here: 'Externer Trigger: Erinnerung vor Abfahrt · Action: 1 Tap «Einsteigen» · Variable Belohnung: Wer sitzt heute in meinem Zug? · Investment: Profil, Ritual, Streak. Interner Trigger mit der Zeit: Einsteigen = App öffnen.',
  },
  nudging: {
    title: 'Digital Nudging statt Addictive Design', src: 'VL03 · Behavioral Economics, Captology', chapter: 6,
    theory: 'Nudges lenken sanft und transparent im Sinne der Nutzenden; Persuasive Technology kann in manipulatives Addictive Design kippen.',
    here: 'Keine Endlos-Feeds, keine roten Badges, keine Streak-Verlust-Drohungen. Gamification ist abschaltbar. Die App will dich in den Zug bringen – nicht auf den Bildschirm.',
  },
  ai: {
    title: 'KI-Transparenz (Art. 50 EU-KI-VO)', src: 'Gastvortrag K. Jansen · Brücke oder Ersatz?', chapter: 3,
    theory: 'Sprachmodelle können in Communitys Brücke oder Ersatz sein. Art. 50 KI-Verordnung verlangt Kennzeichnung von KI-Interaktion.',
    here: 'Bewusste Haltung: Im Chat gibt es keine KI-Teilnehmer. Simulierte Demo-Pendler sind sichtbar als «Demo» markiert – Transparenz analog zu Art. 50.',
  },
};

export const CHAPTERS = {
  1: 'Einführung / Motivation', 2: 'Zielgruppe', 3: 'Kommunikationsdesign', 4: 'Informationsdesign', 5: 'Visuelles Design', 6: 'Community Management',
};
