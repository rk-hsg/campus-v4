// ===========================================================================
//  Campus Commuters · KONFIGURATION
//  ---------------------------------------------------------------------------
//  1) Firebase einrichten (siehe FIREBASE_SETUP.md, ca. 5 Minuten)
//  2) Den Block «firebaseConfig» aus der Firebase-Konsole hier einfügen
//     (alles zwischen den geschweiften Klammern ersetzen)
//  Ohne Firebase läuft die App im «Lokalen Demo-Modus» (Daten nur im
//  eigenen Browser) – sie funktioniert also immer, auch offline vom Backend.
// ===========================================================================

export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  databaseURL: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

// Einstellungen für die Community (dürfen angepasst werden)
export const SETTINGS = {
  pilotRoute: { id: 'zh-sg', name: 'Zürich – St. Gallen', from: 'Zürich HB', to: 'St. Gallen' },
  criticalMassGoal: 40,        // Ziel aktive Pendelnde auf der Pilotstrecke (Kritische Masse)
  stammtisch: { id: 'stammtisch-dez', title: 'Stammtisch am Gleis', when: 'Do, 10. Dez · 17:15', where: 'Bahnhof St. Gallen, Gleis 3', note: 'Kaffee vor dem 17:38er. Offen für alle auf der Strecke – auch wer sonst «nur mitfährt».' },
  ritual: { id: 'lernzug-di-0707', title: 'Lernzug · Dienstag 07:07 · Wagen 7', host: 'Mara K.', note: 'Ruhig lernen, 10 Min. Pause in Wil. Einsteigen in Zürich HB oder Winterthur.' },
};
