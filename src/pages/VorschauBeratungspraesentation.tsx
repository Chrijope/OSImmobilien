import { Link, useSearchParams } from "react-router-dom";
import BeratungspraesentationHV, { type BeratungVorschau } from "./BeratungspraesentationHV";

/*
 * Lokale Vorschau der neuen Beratungspräsentation (Entwurf 15.10.2026).
 * Nur im Entwicklungsmodus erreichbar (siehe vorschauRouten.ts), ohne
 * Anmeldung und ohne Datenbank. Erfundene Beispielkunden, kein echter Kunde.
 *
 * ?beispiel=zusatzrente | steuer | leer | lang | erstgespraech
 *   erstgespraech: der Stand aus /vorschau/erstgespraech (Knopf „In der
 *   Präsentation ansehen“), über sessionStorage weitergereicht.
 */

export const VORSCHAU_ERSTGESPRAECH_SCHLUESSEL = "vorschau-erstgespraech-stand";

const BEISPIELE: Record<string, Omit<BeratungVorschau, "schluessel">> = {
  zusatzrente: {
    kundenName: "Anna Muster",
    kontakt: { anrede: "Frau", vorname: "Anna", nachname: "Muster", qualEinkommen: "3.980", qualEigenkapital: "20.000" },
    skript: {
      anrede: "du",
      ziele: ["Altersvorsorge", "Vermögensaufbau"],
      antworten: {
        motivWoertlich: "Ich merke, dass meine Rente später nicht reicht, und ich möchte jetzt anfangen, statt in zehn Jahren.",
        schwerpunkt: "zusatzrente",
        investitionMonat: "400",
        reserve: "15.000",
        grenzeStress: "500",
        mitentscheider: "Partner",
        wunschNetto: "3.000",
        renteErwartet: "1.800",
        ruhestandAb: "67",
        erfahrung: "Eigentumswohnung selbst genutzt, noch nichts vermietet",
        sorgen: "Was ist, wenn der Mieter nicht zahlt?",
        offeneFragen: "Was passiert, wenn die Zinsen steigen?",
      },
    },
  },
  steuer: {
    kundenName: "Jonas Beispiel",
    kontakt: { anrede: "Herr", vorname: "Jonas", nachname: "Beispiel", qualEinkommen: "5.200", qualEigenkapital: "40.000" },
    skript: {
      anrede: "du",
      ziele: ["Steuern sparen", "Vermögensaufbau"],
      antworten: {
        motivWoertlich: "Ich zahle zu viel Steuern und habe nichts davon.",
        schwerpunkt: "steuer",
        investitionMonat: "200",
        reserve: "25.000",
        grenzeStress: "600",
        mitentscheider: "",
        wunschNetto: "",
        renteErwartet: "",
        erfahrung: "keine",
        sorgen: "Dass die AfA nicht anerkannt wird.",
        offeneFragen: "",
      },
    },
  },
  // Kein Erstgespräch: Alles muss leer sauber aussehen.
  leer: {
    kundenName: "",
    kontakt: {},
    skript: null,
  },
  // Lange und ungewöhnliche Werte, um Umbrüche zu prüfen.
  lang: {
    kundenName: "Maximiliane Alexandra von Musterhausen-Beispielstedt",
    kontakt: { anrede: "Frau", vorname: "Maximiliane", nachname: "von Musterhausen-Beispielstedt", qualEinkommen: "3.000-3.500 €", qualEigenkapital: "ca. 30.000 bis 50.000, teilweise im Depot gebunden" },
    skript: {
      anrede: "du",
      ziele: ["Altersvorsorge", "Familie absichern", "Vererben", "Inflationsschutz"],
      antworten: {
        motivWoertlich:
          "Meine Eltern hatten im Alter zu wenig, mein Bruder hat schon zwei Wohnungen, und ich habe das Gefühl, dass ich jetzt endlich etwas tun muss, bevor die Kinder aus dem Haus sind und die Rente vor der Tür steht, ehrlich gesagt mache ich mir da seit Jahren Gedanken.",
        schwerpunkt: "beides",
        investitionMonat: "300-500 €",
        reserve: "mindestens 3 Netto-Gehälter",
        grenzeStress: "~700",
        mitentscheider: "Ehemann Bernd, Steuerberaterin Frau Dr. Beispiel-Langname und eventuell die Schwiegermutter",
        wunschNetto: "3.500",
        renteErwartet: "1.450,50",
        ruhestandAb: "63 oder 65",
        erfahrung: "Geerbtes Mehrfamilienhaus-Anteil (1/6) in Süddeutschland, vermietet, Verwaltung durch den Bruder; außerdem eine selbst genutzte Wohnung",
        sorgen: "Leerstand, Mietnomaden, Sonderumlagen, steigende Zinsen nach der Zinsbindung und dass ich das alles nicht überblicke",
        offeneFragen: "Kann ich die Wohnung später an meine Tochter übertragen, ohne dass Steuern anfallen, und was kostet das beim Notar?",
      },
    },
  },
};

function ausErstgespraech(): Omit<BeratungVorschau, "schluessel"> {
  try {
    const roh = sessionStorage.getItem(VORSCHAU_ERSTGESPRAECH_SCHLUESSEL);
    if (roh) return JSON.parse(roh);
  } catch {
    // ohne Speicher: Beispiel statt Absturz
  }
  return BEISPIELE.zusatzrente;
}

export default function VorschauBeratungspraesentation() {
  const [suche] = useSearchParams();
  const beispiel = suche.get("beispiel") || "zusatzrente";
  const daten = beispiel === "erstgespraech" ? ausErstgespraech() : BEISPIELE[beispiel] ?? BEISPIELE.zusatzrente;
  const schluessel = `vorschau-${beispiel}`;

  const zuruecksetzen = () => {
    try {
      localStorage.removeItem(`beratung-antworten-${schluessel}`);
    } catch {
      // nichts gemerkt, nichts zu löschen
    }
    window.location.reload();
  };

  return (
    <>
      <div
        className="border-b-2 border-dashed border-[#e5007d] bg-[#fdf2f8] px-4 py-3 text-sm text-[#1a1d1a]"
        data-testid="vorschau-banner"
      >
        <strong>Lokale Vorschau, nur auf diesem Rechner.</strong> Ohne Anmeldung und ohne Datenbank, Beispielkunden statt
        echter Kunden. Eingaben merkt sich nur dieser Browser.
        <div className="mt-2 flex flex-wrap gap-2">
          {[
            ["zusatzrente", "Anna Muster, Zusatzrente"],
            ["steuer", "Jonas, Steuerersparnis"],
            ["leer", "ohne Erstgespräch"],
            ["lang", "lange Werte"],
            ["erstgespraech", "aus der Erstgespräch-Vorschau"],
          ].map(([id, label]) => (
            <Link
              key={id}
              to={`/vorschau/beratungspraesentation?beispiel=${id}`}
              reloadDocument
              className={`rounded-full border px-3 py-1 ${beispiel === id ? "bg-[#1b2a22] text-white border-[#1b2a22]" : "border-[#1b2a22]/30 bg-white"}`}
            >
              {label}
            </Link>
          ))}
          <Link to={`/vorschau/beratungspraesentation?beispiel=${beispiel}&trainer=1`} reloadDocument className="rounded-full border border-amber-500 bg-amber-50 px-3 py-1">
            mit Trainer-Modus
          </Link>
          <button type="button" onClick={zuruecksetzen} className="rounded-full border border-[#1b2a22]/30 bg-white px-3 py-1">
            Eingaben zurücksetzen
          </button>
          <Link to="/vorschau/erstgespraech" className="rounded-full border border-[#1b2a22]/30 bg-white px-3 py-1">
            zum Erstgesprächsskript
          </Link>
        </div>
      </div>
      <BeratungspraesentationHV key={schluessel} vorschau={{ ...daten, schluessel }} />
    </>
  );
}
