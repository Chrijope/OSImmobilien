import { useMemo, useState } from "react";
import { KundenprofilKennzahlen } from "@/components/kunden/profil/KundenprofilKennzahlen";
import "@/components/kunden/profil/kundenprofil.css";
import { baueGeplanteAktionen } from "@/lib/kundenNaechsteAktion";
import type { Aufgabe } from "@/lib/aufgabenStore";
import type { FollowUp } from "@/lib/followUpStore";

/*
 * Lokale Vorschau der Kachel "Nächste Aktionen" (15.10.2026). Nur im
 * Entwicklungsmodus erreichbar (siehe vorschauRouten.ts), ohne Anmeldung und
 * ohne Datenbank. Die Einträge sind erfunden, kein echter Kunde; der Haken
 * meldet nur, was er täte.
 */
function tag(versatz: number): string {
  const d = new Date();
  d.setDate(d.getDate() + versatz);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const aufgabe = (teil: Partial<Aufgabe> & { id: string; titel: string }): Aufgabe =>
  ({ benutzerId: "u", kontaktId: "k", typ: "aufgabe", prioritaet: "mittel", status: "offen", ...teil }) as Aufgabe;

export default function VorschauNaechsteAktionen() {
  const [offen, setOffen] = useState(true);
  const [meldung, setMeldung] = useState("");
  const aktionen = useMemo(() => baueGeplanteAktionen({
    aufgaben: [
      aufgabe({ id: "1", titel: "Kunde nicht erschienen: anrufen und neuen Termin vereinbaren", typ: "anruf", prioritaet: "hoch", faelligAm: tag(-2), uhrzeit: "09:00" }),
      aufgabe({ id: "2", titel: "Nach dem Erstgespräch: Kunden anrufen und Fragen klären", typ: "anruf", prioritaet: "hoch", faelligAm: tag(-1), uhrzeit: "09:00" }),
      aufgabe({ id: "3", titel: "Beratungsgespräch", typ: "meeting", prioritaet: "hoch", faelligAm: tag(2), uhrzeit: "14:00" }),
      aufgabe({ id: "4", titel: "Nicht erreicht: morgen erneut anrufen", prioritaet: "hoch", faelligAm: tag(1), ausloeserSchluessel: "nicht_erreicht:k" }),
      aufgabe({ id: "5", titel: "Unterlagen sortieren", prioritaet: "niedrig" }),
    ],
    followUps: [
      { id: "f1", kundeId: "k", kundeName: "", berater: "", pipelineStufe: "", typ: "anruf", titel: "Einen Monat nach dem Notar: Zufriedenheit abfragen", beschreibung: "", faelligAm: tag(9), erstelltAm: tag(-20), status: "offen", prioritaet: "mittel", automatisch: true } as FollowUp,
    ],
    unterschriften: [{ investmentId: "i1", bezeichnung: "Reservierungsvereinbarung", versendetMs: Date.now() - 3 * 86_400_000 }],
  }, new Date(), { alleOffenen: true }), []);

  return (
    // "kundenprofil": derselbe Container wie im Profil, sonst greifen die schmalen Ansichten nicht.
    <div className="kundenprofil mx-auto w-full max-w-5xl p-4 sm:p-8 space-y-3">
      <p className="text-xs text-muted-foreground">Vorschau Kundenprofil, Kachel Nächste Aktionen. Erfundene Einträge.</p>
      <KundenprofilKennzahlen
        schritt={{ titel: "Beratungsgespräch führen" }}
        investmentNummer={1}
        letzter={{ artLabel: "Anruf", datum: new Date().toISOString() }}
        onUebersicht={() => {}}
        onVerlauf={() => {}}
        aktionen={aktionen}
        ampel={{ ton: "orange", titel: "Überfällig", kurztext: "Schritt überfällig" }}
        aktionenOffen={offen}
        onAktionenUmschalten={() => setOffen((o) => !o)}
        onAktionSpringen={(a) => setMeldung(`Sprung zu: ${a.titel}`)}
        onAktionAbschliessen={(a) => setMeldung(`Abschließen: ${a.titel}`)}
        onAlleAufgabenErledigen={() => setMeldung("Alle überfälligen Aufgaben erledigen")}
        onAktionErstellen={(art) => setMeldung(`Aktion erstellen: ${art}`)}
        aktionArten={[{ art: "aufgabe", label: "Aufgabe erstellen" }, { art: "meeting", label: "Meeting erstellen" }]}
        onAktionenVerlauf={() => setMeldung("Alle im Verlauf ansehen")}
      />
      {meldung && <p role="status" className="text-sm">{meldung}</p>}
    </div>
  );
}
