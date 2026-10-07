/**
 * Die Texte der Linkseite `/links` auf Deutsch und Englisch (Plan
 * Kundensprache, Etappe 6).
 *
 * Auf Englisch führt der Steuerrechner auf `/steuer?lang=en`, und der
 * Expats-Rechner braucht das Kennzeichen „in English“ nicht mehr: Auf einer
 * englischen Seite ist das selbstverständlich. Auf Deutsch bleibt es, denn
 * dort ist es der einzige Hinweis, dass der Rechner englisch ist.
 */
const de = {
  dokumentTitel: "MOREImmo | Webseite und Rechner",
  titel: "Immobilie als Kapitalanlage",
  untertitel: "Zum Nachrechnen und Nachlesen. Kostenlos und ohne Anmeldung.",
  gruppen: {
    webseite: "Webseite:",
    rechner: "Rechner:",
  },
  ziele: {
    steuerrechner: "Steuerrechner",
    expats: "Expats-Kalkulator",
    // Erscheint nur auf der deutschen Seite, siehe Dateikopf und `LinksPublic`.
    expatsKennzeichen: "in English",
  },
  vorbehalt: "Die Rechner ersetzen keine Beratung und keine steuerliche Auskunft.",
  impressum: "Impressum",
  datenschutz: "Datenschutz",
};

export type LinksTexte = typeof de;

const en: LinksTexte = {
  dokumentTitel: "MOREImmo | Website and calculators",
  titel: "Property as an investment",
  untertitel: "To calculate and read up on. Free of charge and without registration.",
  gruppen: {
    webseite: "Website:",
    rechner: "Calculators:",
  },
  ziele: {
    steuerrechner: "Tax calculator",
    expats: "EXPATS Calculator",
    // Wird auf der englischen Seite nicht angezeigt, steht nur der Form halber hier.
    expatsKennzeichen: "in English",
  },
  vorbehalt: "The calculators do not replace professional advice or tax advice.",
  impressum: "Legal notice",
  datenschutz: "Privacy policy",
};

export const LINKS_TEXTE = { de, en };
