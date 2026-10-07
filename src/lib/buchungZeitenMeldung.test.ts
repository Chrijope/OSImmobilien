import { describe, it, expect } from "vitest";
import {
  zeitenFehlerMeldung, endeVorAnfangMeldung, buchungFehlerMeldung,
  leererWochenplanRueckfrage, letzteTerminartRueckfrage, buchungGesperrtHinweis,
} from "@/lib/buchungZeitenMeldung";

/**
 * Der Kern dieser Prüfungen: Die drei Lagen, die verschiedene nächste Schritte
 * verlangen, dürfen nie denselben Satz ergeben. Ein fehlendes Schreibrecht
 * hilft kein zweiter Versuch, bei einem Netzfehler hilft genau der.
 *
 * Der Anlass war die HR-Managerin: Sie sah tagelang „Die Zeiten konnten nicht
 * gespeichert werden", während in Wahrheit die Zeilensicherheit den Schreib-
 * zugriff verweigerte.
 */

describe("Warum die Zeiten nicht gespeichert wurden", () => {
  it("erkennt das fehlende Schreibrecht am Postgres-Code", () => {
    const m = zeitenFehlerMeldung({ code: "42501", message: "permission denied" });
    expect(m.titel).toContain("lässt das Speichern nicht zu");
    expect(m.text).toContain("Rolle HR");
  });

  it("erkennt das fehlende Schreibrecht auch am Wortlaut von PostgREST", () => {
    const m = zeitenFehlerMeldung({
      message: 'new row violates row-level security policy for table "buchung_verfuegbarkeiten"',
    });
    expect(m.titel).toContain("lässt das Speichern nicht zu");
  });

  it("nennt die fehlende Migration, statt zum Wiederholen zu raten", () => {
    const m = zeitenFehlerMeldung({ code: "PGRST202", message: "Could not find the function in the schema cache" });
    expect(m.titel).toContain("Speicherfunktion fehlt");
    expect(m.text).toContain("Wiederholen hilft nicht");
  });

  it("rät beim Netzfehler ausdrücklich zum zweiten Versuch", () => {
    const m = zeitenFehlerMeldung(new TypeError("Failed to fetch"));
    expect(m.titel).toContain("Verbindung");
    expect(m.text).toContain("zweiter Versuch");
  });

  it("schickt die abgelaufene Anmeldung nicht in die Rechte-Erklärung", () => {
    const m = zeitenFehlerMeldung(new Error("Nicht angemeldet"));
    expect(m.titel).toContain("Anmeldung");
  });

  it("gibt eine eigene Meldung der Datenbank im Wortlaut weiter", () => {
    const m = zeitenFehlerMeldung({ code: "P0001", message: "Der Wochenplan muss eine Liste sein" });
    expect(m.titel).toContain("nicht gültig");
    expect(m.text).toContain("Der Wochenplan muss eine Liste sein");
  });

  it("bleibt auch ohne jede Angabe verständlich und beruhigt zum alten Plan", () => {
    const m = zeitenFehlerMeldung(null);
    expect(m.text).toContain("unverändert erhalten");
  });

  it("die vier Lagen ergeben vier verschiedene Titel", () => {
    const titel = [
      zeitenFehlerMeldung({ code: "42501" }).titel,
      zeitenFehlerMeldung({ code: "PGRST202" }).titel,
      zeitenFehlerMeldung(new TypeError("Failed to fetch")).titel,
      endeVorAnfangMeldung("Montag").titel,
    ];
    expect(new Set(titel).size).toBe(4);
  });

  it("benennt beim Tag mit falscher Zeit den Tag", () => {
    expect(endeVorAnfangMeldung("Montag").text).toContain("Montag");
  });
});

/**
 * „Tag sperren" schreibt in dieselbe Tabelle wie der Wochenplan und haengt an
 * derselben Einfuegeregel. Bis zum 14.09.2026 meldete es trotzdem nur „Der Tag
 * konnte nicht gesperrt werden", ohne den Grund. Diese Pruefungen halten fest,
 * dass jetzt jeder Schreibvorgang des Buchungskalenders denselben Grund nennt.
 */
describe("Jeder Schreibvorgang nennt den Grund", () => {
  it("sagt beim Tag sperren, dass das Recht fehlt, und nicht nur dass es nicht ging", () => {
    const m = buchungFehlerMeldung(
      { code: "42501", message: 'new row violates row-level security policy for table "buchung_verfuegbarkeiten"' },
      "tagSperren",
    );
    expect(m.titel).toContain("lässt das Speichern nicht zu");
    expect(m.text).toContain("Rolle HR");
    expect(m.text).not.toContain("Der Tag konnte nicht gesperrt werden");
  });

  it("deutet fehlendes Recht bei Zeiten und Tag sperren gleich", () => {
    const fehler = { code: "42501" };
    expect(buchungFehlerMeldung(fehler, "tagSperren").titel)
      .toBe(buchungFehlerMeldung(fehler, "zeiten").titel);
  });

  it("nennt beim Anlegen einer Terminart die zustaendige Migration", () => {
    const m = buchungFehlerMeldung({ code: "42501" }, "terminartAnlegen");
    expect(m.text).toContain("20260910143000");
  });

  it("gibt die eigene Meldung der Absage-Funktion im Wortlaut weiter", () => {
    const m = buchungFehlerMeldung(
      { code: "P0001", message: "Keine Berechtigung fuer diese Buchung" },
      "buchungStatus",
    );
    expect(m.text).toContain("Keine Berechtigung fuer diese Buchung");
  });

  it("beruhigt je Vorgang mit dem passenden Satz", () => {
    expect(buchungFehlerMeldung(null, "zeiten").text).toContain("Plan ist unverändert");
    expect(buchungFehlerMeldung(null, "tagSperren").text).toContain("Zeiten hat sich nichts geändert");
    expect(buchungFehlerMeldung(null, "terminartLoeschen").text).toContain("unverändert vorhanden");
  });

  it("faellt ohne Angabe auf den Satz des jeweiligen Vorgangs zurueck", () => {
    expect(buchungFehlerMeldung(null, "tagSperren").titel).toBe("Der Tag konnte nicht gesperrt werden");
    expect(buchungFehlerMeldung(null, "linkEinstellungen").titel).toContain("Buchungslink");
  });

  it("erkennt die fehlende Spalte als fehlende Migration, nicht als Raetsel", () => {
    const m = buchungFehlerMeldung({ code: "PGRST204", message: "column not found" }, "tagSperren");
    expect(m.titel).toContain("Migration");
    expect(m.text).toContain("Wiederholen hilft nicht");
  });

  it("erklaert auch beim persoenlichen Buchungslink das fehlende Recht", () => {
    // Seit dem 27.09.2026 haengt der Link an der Migration, die Terminseite
    // und Videocall trennt, nicht mehr an der Freigabe fuer HR.
    const m = buchungFehlerMeldung({ code: "42501" }, "linkAnlegen");
    expect(m.text).toContain("20260927120000");
    expect(buchungFehlerMeldung(null, "linkAnlegen").text).toContain("der Kunde hat nichts bekommen");
  });

  it("zeitenFehlerMeldung bleibt der Wochenplan", () => {
    expect(zeitenFehlerMeldung({ code: "42501" })).toEqual(buchungFehlerMeldung({ code: "42501" }, "zeiten"));
  });
});

/**
 * Der stille Schaden: Wer alle Wochentage abwaehlt und speichert, loescht
 * seine Erreichbarkeit und liest „Zeiten gespeichert.". Die Rueckfrage muss
 * die FOLGE benennen, nicht nur „sicher?" fragen.
 */
describe("Bevor niemand mehr buchen kann", () => {
  it("benennt in der Rueckfrage die Folge, nicht nur die Handlung", () => {
    const r = leererWochenplanRueckfrage({ istBewerberGastgeber: false });
    expect(r.title).toContain("niemand mehr einen Termin");
    expect(r.description).toContain("niemand kann bei dir einen Termin buchen");
  });

  it("nennt der HR-Gastgeberin zusaetzlich den Bewerberprozess", () => {
    const r = leererWochenplanRueckfrage({ istBewerberGastgeber: true });
    expect(r.description).toContain("Bewerber");
  });

  it("beschriftet die Knoepfe mit dem, was sie tun", () => {
    const r = leererWochenplanRueckfrage({ istBewerberGastgeber: false });
    expect(r.confirmText).not.toMatch(/^OK$/);
    expect(r.cancelText).not.toMatch(/^Abbrechen$/);
    expect(r.confirmText).toContain("löschen");
  });

  it("warnt genauso beim Ausschalten der letzten aktiven Terminart", () => {
    const r = letzteTerminartRueckfrage({
      bezeichnung: "Erstgespräch", art: "ausschalten", istBewerberGastgeber: false,
    });
    expect(r.description).toContain("letzte aktive Terminart");
    expect(r.description).toContain("niemand kann bei dir einen Termin buchen");
    expect(r.cancelText).toBe("Aktiv lassen");
  });

  it("haengt beim Loeschen die Warnung zu den verschickten Links an", () => {
    const r = letzteTerminartRueckfrage({
      bezeichnung: "Erstgespräch", art: "loeschen", istBewerberGastgeber: false,
      zusatz: "Achtung: Ein bereits verschickter persönlicher Link gilt für genau diese Terminart.",
    });
    expect(r.description).toContain("verschickter persönlicher Link");
    expect(r.confirmText).toContain("löschen");
  });
});

/**
 * Der Dauerhinweis. Ein geleerter Wochenplan sieht genauso aus wie ein nie
 * gepflegter, deshalb muss der Zustand auf der Seite stehen und nicht nur im
 * Augenblick des Speicherns aufblitzen.
 */
describe("Dauerhinweis auf der Seite", () => {
  it("schweigt, wenn Zeiten und Terminart da sind", () => {
    expect(buchungGesperrtHinweis({
      buchbareTage: 5, aktiveTerminarten: 1, istBewerberGastgeber: false,
    })).toBeNull();
  });

  it("meldet den leeren Wochenplan und sagt, was zu tun ist", () => {
    const h = buchungGesperrtHinweis({
      buchbareTage: 0, aktiveTerminarten: 2, istBewerberGastgeber: false,
    });
    expect(h?.titel).toContain("niemand einen Termin bei dir buchen");
    expect(h?.text).toContain("kein einziger Wochentag");
    expect(h?.text).toContain("Deine Zeiten");
  });

  it("meldet auch die fehlende aktive Terminart", () => {
    const h = buchungGesperrtHinweis({
      buchbareTage: 5, aktiveTerminarten: 0, istBewerberGastgeber: false,
    });
    expect(h?.text).toContain("keine aktive Terminart");
  });

  it("fasst beides in einem Satz zusammen, statt zweimal zu mahnen", () => {
    const h = buchungGesperrtHinweis({
      buchbareTage: 0, aktiveTerminarten: 0, istBewerberGastgeber: true,
    });
    expect(h?.text).toContain("kein Wochentag buchbar");
    expect(h?.text).toContain("keine aktive Terminart");
    expect(h?.text).toContain("Bewerber");
  });
});
