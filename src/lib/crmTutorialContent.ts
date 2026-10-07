/**
 * Inhalt für die geführte CRM-Tour ("CRM-Tutorial").
 *
 * Zu jeder Sidebar-URL gibt es einen kurzen Erklärtext + optionale Bullets
 * "Das kannst du hier tun". Der Provider filtert die tatsächlich sichtbaren
 * Sidebar-Einträge des Nutzers gegen diese Map und geht sie in
 * Sidebar-Reihenfolge durch.
 */

export type CrmTutorialStep = {
  url: string;
  titel: string;
  kurz: string;
  erklaerung: string;
  bullets?: string[];
};

export const CRM_TUTORIAL_CONTENT: Record<string, Omit<CrmTutorialStep, "url">> = {
  "/": {
    titel: "Dashboard",
    kurz: "Deine Startzentrale.",
    erklaerung:
      "Auf dem Dashboard siehst du auf einen Blick deine wichtigsten Kennzahlen, aktuelle Aufgaben, Termine und den Puls deines Vertriebs. Von hier aus springst du direkt in alle relevanten Bereiche.",
    bullets: ["Kennzahlen & Ziele einsehen", "Schnellzugriff auf offene Aufgaben", "Weekly-Call & News im Blick"],
  },
  "/inbox": {
    titel: "Inbox",
    kurz: "Alle heute fälligen Aufgaben zentral.",
    erklaerung:
      "Die Inbox bündelt alles, was heute deine Aufmerksamkeit braucht: offene Anrufe, Follow-Ups, Meetings und Deadlines. Mit dem Fokus-Modus arbeitest du sie nacheinander effizient ab.",
    bullets: ["Heute · Morgen · Diese Woche", "Fokus-Modus für Serien-Abarbeitung", "Aufgabe direkt erledigen, verschieben oder neu planen"],
  },
  "/news": {
    titel: "News",
    kurz: "Aktuelles aus dem Unternehmen.",
    erklaerung:
      "Neuigkeiten, System-Updates und wichtige Ankündigungen. Neue Beiträge werden dir im Header per Glocke signalisiert.",
  },
  "/lead-verwaltung": {
    titel: "Lead-Verwaltung",
    kurz: "Neue Leads sichten und zuweisen.",
    erklaerung:
      "Zentrale für frisch eingegangene Leads (aus Landingpage, Analysetool oder manuellen Eintragungen). Hier qualifiziert die Setter-Rolle und verteilt die Leads an Vertriebspartner.",
  },
  "/meine-leads": {
    titel: "Meine Leads",
    kurz: "Alle Kontakte, die dir zugewiesen sind.",
    erklaerung:
      "Deine persönliche Lead-Liste – gefiltert auf alles, wofür du aktiv verantwortlich bist. Statusampeln und Inaktivitäts-Indikatoren zeigen dir, wo du nachfassen musst.",
  },
  "/alle-kontakte": {
    titel: "Alle Kontakte",
    kurz: "Die vollständige Kundendatenbank.",
    erklaerung:
      "Übersicht aller Kontakte im System (Rechte-abhängig). Filter nach Pipeline-Stufe, Zuständigkeit, Quelle und Zeitraum.",
  },
  "/kontakte": {
    titel: "Kontakte",
    kurz: "Kontakt-Datenbank.",
    erklaerung: "Übersicht deiner Kontakte mit Suche, Filtern und Schnellzugriff auf jedes Kundenprofil.",
  },
  "/pipeline": {
    titel: "Pipeline",
    kurz: "Deals visuell nach Stufen.",
    erklaerung:
      "Kanban-Ansicht deiner Deals von 'Neuer Lead' bis 'Abgeschlossen'. Karten zeigen Zuständigkeit, Volumen und Warnungen bei Inaktivität.",
  },
  "/neukunden": {
    titel: "Neukunden",
    kurz: "Frische Deals in den ersten Stufen.",
    erklaerung: "Alle Kontakte in der Frühphase – von Erstgespräch bis Bonitätsunterlagen.",
  },
  "/follow-up": {
    titel: "Follow-Up",
    kurz: "Wiedervorlage-Kontakte.",
    erklaerung: "Alle Kontakte mit einem Follow-Up, das ansteht oder überfällig ist. Rote/orange Ränder zeigen SLA-Verstöße an.",
  },
  "/follow-ups": {
    titel: "Follow-Ups",
    kurz: "Alle geplanten Follow-Ups.",
    erklaerung: "Kompletter Überblick über Follow-Ups – filtern nach heute/morgen/überfällig, direkt abarbeiten oder verschieben.",
  },
  "/abwicklung": {
    titel: "Abwicklung",
    kurz: "Deals in Reservierung, Finanzierung, Notar.",
    erklaerung:
      "Alle Deals, die sich in der Abwicklungsphase befinden – von Reservierung bis Kaufpreisfälligkeit. Perfekt für Backoffice-Koordination.",
  },
  "/reservierung": {
    titel: "Reservierungen",
    kurz: "Aktive Reservierungen.",
    erklaerung: "Übersicht aller laufenden Reservierungen mit Status, Kundenunterschrift und offenen Aktionen.",
  },
  "/bestandskunden": {
    titel: "Bestandskunden",
    kurz: "Deine abgeschlossenen Kunden.",
    erklaerung: "Alle Kunden, deren Kauf abgeschlossen ist. Basis für After-Sales, Empfehlungsprogramm und Zusatzgeschäft.",
  },
  "/bestandskunden-import": {
    titel: "Bestandskunden importieren",
    kurz: "CSV-Import bestehender Kunden.",
    erklaerung: "Importiere deine bestehenden Bestandskunden per CSV-Vorlage.",
  },
  "/verloren": {
    titel: "Verloren",
    kurz: "Nicht erfolgreich abgeschlossene Deals.",
    erklaerung: "Alle Deals mit Status 'verloren' inkl. Grund. Wichtig für Auswertung und Reaktivierung.",
  },
  "/kunden": {
    titel: "Kunden",
    kurz: "Kundenübersicht.",
    erklaerung: "Kundenliste mit allen Details, Filtern und direktem Zugriff auf Profile.",
  },
  "/papierkorb": {
    titel: "Papierkorb",
    kurz: "Soft-gelöschte Kontakte.",
    erklaerung: "Gelöschte Kontakte werden 90 Tage aufbewahrt und können hier wiederhergestellt werden.",
  },
  "/empfehlungen": {
    titel: "Empfehlungen",
    kurz: "Kunden-Empfehlungsprogramm.",
    erklaerung: "Verwalte Empfehlungen deiner Kunden, tracke Provisionen und siehst den Status jedes weitergegebenen Kontakts.",
  },
  "/objekte": {
    titel: "Objekte",
    kurz: "Immobilienbestand.",
    erklaerung: "Alle Immobilien im System mit Exposé, Einheitenspiegel und Verfügbarkeit. Basis für die Objektauswahl mit Kunden.",
  },
  // "/objekt-akquise" bewusst NICHT im Tutorial:
  // öffentliche Einreichungs-Unterseite, kein CRM-Menüpunkt zum Erklären.
  "/objekt-einreichungen": {
    titel: "Objekt-Einreichungen",
    kurz: "Prüfung eingereichter Objekte.",
    erklaerung: "Übersicht aller eingereichten Objekte mit Freigabe-Workflow.",
  },
  "/einheitenspiegel": {
    titel: "Einheitenspiegel",
    kurz: "Alle Einheiten pro Objekt.",
    erklaerung: "Detaillierte Übersicht aller Einheiten mit Belegung, Miete und Verfügbarkeit.",
  },
  "/mieter": { titel: "Mieter", kurz: "Mieterverwaltung.", erklaerung: "Alle Mieter mit Vertragsdaten, Kaution und Kommunikations-Historie." },
  "/eigentuemer": { titel: "Eigentümer", kurz: "Eigentümerverwaltung.", erklaerung: "Übersicht aller Eigentümer und ihrer Objekte." },
  "/dienstleister": { titel: "Dienstleister", kurz: "Handwerker & Partner.", erklaerung: "Verwalte externe Dienstleister mit Kontaktdaten, Gewerken und Bewertungen." },
  "/vermietung": { titel: "Vermietung", kurz: "Vermietungs-Prozess.", erklaerung: "Offene Vermietungen mit Interessentenliste, Terminen und Übergabestatus." },
  "/hv-uebersicht": { titel: "HV-Übersicht", kurz: "Hausverwaltungs-Cockpit.", erklaerung: "Zentrale Übersicht für die Hausverwaltung mit offenen Vorgängen." },
  "/hv-tickets": { titel: "HV-Tickets", kurz: "Mieter-Tickets.", erklaerung: "Alle offenen Tickets aus der Hausverwaltung – Schäden, Anfragen, Beschwerden." },
  "/hv-kommunikation": { titel: "HV-Kommunikation", kurz: "Kommunikations-Historie HV.", erklaerung: "Chronologische Kommunikation mit Mietern und Eigentümern." },
  "/hv-statistiken": { titel: "HV-Statistiken", kurz: "Auswertung Hausverwaltung.", erklaerung: "Kennzahlen zu Vermietung, Fluktuation, Instandhaltung." },
  "/betriebskostenabrechnung": { titel: "Betriebskostenabrechnung", kurz: "Nebenkosten-Abrechnung.", erklaerung: "Erstelle Betriebskostenabrechnungen für deine Mieter." },
  "/kautionen": { titel: "Kautionen", kurz: "Kautionsverwaltung.", erklaerung: "Übersicht aller Mietkautionen inkl. Verzinsung und Rückzahlung." },
  "/zaehlerstaende": { titel: "Zählerstände", kurz: "Zähler-Erfassung.", erklaerung: "Zählerstände für Strom, Wasser, Heizung erfassen und historisieren." },
  "/fristenueberwachung": { titel: "Fristenüberwachung", kurz: "Alle Fristen im Blick.", erklaerung: "Zentrale Fristen-Übersicht für HV – Kündigungen, Prüfungen, Verträge." },
  "/versicherungen": { titel: "Versicherungen", kurz: "Versicherungs-Portfolio.", erklaerung: "Alle Versicherungen deiner Objekte und Kunden." },
  "/auswertungen": {
    titel: "Auswertungen",
    kurz: "Deine Vertriebs-KPIs.",
    erklaerung: "Detaillierte Auswertungen zu Leads, Conversion, Team-Performance und Umsätzen.",
  },
  "/statistiken": { titel: "Statistiken", kurz: "Systemweite Kennzahlen.", erklaerung: "Aggregierte Statistiken zu Leads, Deals, Volumen und Trends." },
  // "/analysetool" bewusst NICHT im Tutorial:
  // eigenständige, öffentlich verlinkte Lead-Gen-Seite.
  "/abrechnungen": { titel: "Abrechnungen", kurz: "Provisions-Abrechnungen.", erklaerung: "Deine Provisionsabrechnungen mit Status, Auszahlungstermin und PDF-Belegen." },
  "/provisionsabrechnung": { titel: "Provisionsabrechnung", kurz: "Erstellung von Abrechnungen.", erklaerung: "Erstelle Provisionsabrechnungen für dein Team (Admin/Backoffice)." },
  "/zielplanung": { titel: "Zielplanung", kurz: "Deine Umsatz- und Aktivitätsziele.", erklaerung: "Persönliche Ziele mit Fortschrittsbalken – vom Admin gesetzt, von dir verfolgt." },
  "/wettbewerb": { titel: "Wettbewerb", kurz: "Team-Ranking.", erklaerung: "Vergleiche deine Zahlen mit dem Team – wer hat die meisten Deals, das höchste Volumen?" },
  "/afa-rechner": { titel: "AfA-Rechner", kurz: "Abschreibungs-Rechner.", erklaerung: "Berechne die Abschreibung einer Immobilie inkl. Sonderabschreibungen." },
  "/bonitaetsrechner": { titel: "Bonitätsrechner", kurz: "Bonitäts-Schnellcheck.", erklaerung: "Prüfe die Finanzierbarkeit eines Kunden anhand seiner Kennzahlen." },
  "/immobilien-lexikon": { titel: "Immobilien-Lexikon", kurz: "Fachbegriffe erklärt.", erklaerung: "Nachschlagewerk für alle wichtigen Fachbegriffe rund um Immobilien." },
  "/praesentation": { titel: "Präsentation", kurz: "Beratungspräsentationen.", erklaerung: "Die zentrale Präsentation für Beratungsgespräche mit Kunden." },
  "/unterlagen": { titel: "Unterlagen", kurz: "Dokumente & Vorlagen.", erklaerung: "Alle Verkaufsunterlagen, Checklisten, E-Mail-Signaturen und Vorlagen zum Download." },
  "/vertriebsakademie": {
    titel: "Vertriebsakademie",
    kurz: "Dein kompletter Fahrplan zum Vertriebsprofi.",
    erklaerung:
      "Die Vertriebsakademie führt dich chronologisch durch alle Prozesse und Abläufe – von 'Lead kommt rein' oder 'Interessent aus eigenem Netzwerk' bis zum Notartermin. Mit Skripten, Einwandbehandlung, Rollenspielen und Übungen. Hier lernst du das WIE zu dem, was du im Tutorial gesehen hast.",
    bullets: ["10 Kapitel für Quereinsteiger", "Skripte für jede Kundensituation", "Übungen mit Antwortfeldern + XP", "Kundenkommunikation von Lead bis Notar"],
  },
  "/marketing": { titel: "Marketing", kurz: "Marketing-Materialien.", erklaerung: "Social-Media-Vorlagen, Flyer, Landingpage-Assets für deine Vermarktung." },
  "/leitfaeden": { titel: "Leitfäden", kurz: "Vertriebs-Leitfäden.", erklaerung: "Praxis-Leitfäden für Kaltakquise, Warmkontakte, Einwandbehandlung." },
  "/aftersales": { titel: "After-Sales", kurz: "Betreuung nach Kauf.", erklaerung: "Prozesse und Materialien für die Betreuung deiner Kunden nach Kaufabschluss." },
  "/bonitaet": { titel: "Bonitäts-Ordner", kurz: "Bonitätsunterlagen-Checkliste.", erklaerung: "Was gehört in die Bonitätsunterlagen? Hier findest du die vollständige Checkliste." },
  "/chat": { titel: "Chat", kurz: "Team-Chat.", erklaerung: "Interner Chat mit deinen Kollegen – pinne bis zu 3 wichtige Chats." },
  "/support-kontaktieren": { titel: "Support", kurz: "Hilfe & Support.", erklaerung: "Direkter Draht zum MOREImmo-Support bei Fragen oder Problemen." },
  "/helpdesk": { titel: "Helpdesk", kurz: "Support-Tickets bearbeiten.", erklaerung: "Backoffice-Ansicht der eingehenden Support-Tickets." },
  "/ansprechpartner": { titel: "Ansprechpartner", kurz: "Team-Kontakte.", erklaerung: "Alle internen Ansprechpartner mit Zuständigkeiten und Kontaktdaten." },
  "/teampartner": { titel: "Teampartner", kurz: "Dein Vertriebsteam.", erklaerung: "Übersicht deiner Teampartner mit Rollen, Karrierestufen und Leistungen." },
  "/karriere": { titel: "Karriere", kurz: "Karrierestufen & Bewerbungen.", erklaerung: "Karrieremodell und Bewerbungs-Pipeline neuer Vertriebspartner." },
  "/bewerberprozess": { titel: "Bewerberprozess", kurz: "Neue Partner onboarden.", erklaerung: "Kompletter Bewerbungs- und Onboarding-Prozess für neue Vertriebspartner." },
  "/nutzerverwaltung": { titel: "Nutzerverwaltung", kurz: "User & Rollen.", erklaerung: "Nutzer anlegen, Rollen zuweisen, Berechtigungen konfigurieren." },
  // "/berater-microseite" bewusst NICHT im Tutorial:
  // öffentliche Landingpage, kein internes CRM-Menü zum Erklären.
  "/vp-bewertungen": { titel: "VP-Bewertungen", kurz: "Kundenbewertungen.", erklaerung: "Bewertungen deiner Kunden über die Beratungsqualität." },
  "/einstellungen": {
    titel: "Einstellungen",
    kurz: "Dein Profil & Systemeinstellungen.",
    erklaerung:
      "Profil, Kalender, Benachrichtigungen, Sicherheit und Tutorial-Optionen. Hier kannst du das CRM-Tutorial jederzeit fortsetzen oder neu starten.",
  },
  "/tippgeber-portal": { titel: "Tippgeber-Portal", kurz: "Dein Tippgeber-Bereich.", erklaerung: "Reiche neue Kontakte ein und verfolge den Status deiner Empfehlungen." },
};
