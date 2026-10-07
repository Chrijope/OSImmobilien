/**
 * Fortschritt im Reiter Closing.
 *
 * Der Reiter ist in sechs Schritte gegliedert (Präsentation, Entscheidung,
 * Paket, Adressen, Startfahrplan, Vertrag). Welche Karte gesperrt, offen
 * oder erledigt ist, welcher Schritt als Nächstes ansteht und was noch
 * fehlt, wird hier aus den GESPEICHERTEN Bewerberfeldern abgeleitet, nicht
 * aus den Formularwerten. Sonst klappt eine Karte schon beim Tippen des
 * letzten Zeichens zusammen.
 *
 * Reine Rechnerei ohne Oberfläche, damit sie sich ohne Supabase-Attrappen
 * prüfen lässt.
 *
 * EINE Quelle für beide Anzeigen: Der Balken an der Karte und der Kasten
 * "Fortschritt im Closing" in der Seitenleiste lesen beide aus `schritte`.
 * Vorher hatte jede Seite ihre eigene Herleitung, deshalb konnten sie
 * Unterschiedliches behaupten: der Balken zeigte das gerade angeklickte
 * Paket, die Seitenleiste das gespeicherte, und beim Startfahrplan zeigte
 * der Balken den Verfolgungseintrag (der VOR dem Mailversand entsteht),
 * die Seitenleiste das Feld am Bewerber (das erst NACH erfolgreichem
 * Versand gesetzt wird). Maßgeblich ist hier durchgehend der gespeicherte
 * Stand, beim Startfahrplan also `paketUebersichtSentAt`.
 */
import type { Bewerber } from "./bewerbungStore";
import { istClosingDirektKomplett } from "./closingDirektSkript";
import { istTeil1Abgeschlossen } from "./erstgespraechStand";
import { getLizenzPaket, formatPreis, type LizenzPaket } from "./lizenzPakete";
import { erinnerungLabel } from "./bewerberErinnerungen";
import { closingGespraechTermin, type BewerberBuchungStand } from "./bewerberTermine";
import { formatDatum } from "./utils";

export type ClosingSchrittNr = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * gesperrt: Voraussetzung fehlt (z. B. Entscheidung noch nicht Ja).
 * offen: bearbeitbar, aber noch nicht erledigt.
 * erledigt: Ergebnis liegt gespeichert vor, Karte darf einklappen.
 */
export type SchrittZustand = "gesperrt" | "offen" | "erledigt";

export type ClosingSchritt = {
  nr: ClosingSchrittNr;
  titel: string;
  zustand: SchrittZustand;
  /**
   * Knappe Ergebnisform für den Balken an der Karte. Ein Satzteil, kein
   * ganzer Satz, damit alle sechs Balken gleich ruhig aussehen.
   */
  kurz: string;
  /**
   * Dieselbe Aussage ausführlich für die Seitenleiste, eine Zeile je
   * Angabe. Leer, solange es nichts zu berichten gibt.
   */
  zeilen: string[];
  /**
   * Der Wert wurde in Teil 2 des Erstgesprächs erfasst und ist hier nur
   * übernommen. Trägt das Zeichen an Karte und Seitenleiste.
   */
  ausGespraech: boolean;
};

export type FehltEintrag = {
  text: string;
  unter?: string;
  /** Braucht Aufmerksamkeit (Ausrufezeichen statt Punkt) */
  dringend?: boolean;
};

export type ClosingFortschritt = {
  praesentationGehalten: boolean;
  /** Teil 1 des Erstgesprächs abgeschlossen (Zeitstempel durchgefuehrtAm, Reiter grün). */
  teil1Abgeschlossen: boolean;
  /** Abschlussdatum von Teil 1, lesbar (dd.mm.yyyy), leer wenn nicht abgeschlossen. */
  teil1AbgeschlossenAm: string;
  teil2Komplett: boolean;
  /**
   * Teil 1 abgeschlossen UND Teil 2 im Gespräch komplett: Erstgespräch und
   * Closing-Gespräch liegen beide hinter dem Bewerber, Karte 1 ist damit
   * komplett erledigt.
   */
  gespraechKomplett: boolean;
  entscheidung: "" | "ja" | "nein" | "bedenkzeit";
  paketErledigt: boolean;
  adressenVollstaendig: boolean;
  startfahrplanVersendet: boolean;
  vertragErzeugt: boolean;
  schritte: ClosingSchritt[];
  /** Nummer des Schritts, der als Nächstes ansteht (0 = nichts mehr offen) */
  aktiverSchritt: ClosingSchrittNr | 0;
  naechsterSchritt: string;
  fehlt: FehltEintrag[];
};

/**
 * Ein Name je Schritt für ALLE Anzeigen: Kartenüberschrift, Balken und
 * Seitenleiste. Vorher hieß Schritt 1 an der Karte "Präsentation und
 * Gespräch" und in der Seitenleiste "Präsentation gehalten", das las sich
 * wie zwei verschiedene Dinge.
 */
export const CLOSING_SCHRITT_TITEL: Record<ClosingSchrittNr, string> = {
  1: "Präsentation und Gespräch",
  2: "Entscheidung",
  3: "Paket und Konditionen",
  4: "Adressen und Vertragsdaten",
  5: "Startfahrplan",
  6: "Vertrag erzeugen und senden",
};

function hatText(v: string | undefined | null): boolean {
  return !!(v ?? "").trim();
}

/** "02.09.2026 um 09:14 Uhr", aus einem ISO-Zeitstempel. */
function formatZeitpunkt(iso: string | undefined): string {
  const wert = (iso ?? "").trim();
  if (!wert) return "";
  const d = new Date(wert);
  if (isNaN(d.getTime())) return formatDatum(wert);
  const uhr = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return `${d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })} um ${uhr} Uhr`;
}

/**
 * Preis und Laufzeit des Pakets, wie sie auch der Vertrag verwendet.
 * Gleiche Fallunterscheidung wie in Karte 3, aber aus den GESPEICHERTEN
 * Schaltern, damit Balken und Seitenleiste nie auseinanderlaufen.
 */
function konditionenKurz(paket: LizenzPaket): string {
  if (paket.istTippgeber) return "Vergütung individuell";
  // Nur die Altpakete haben Einmalbetrag und CRM-Systemgebühr; die aktuellen
  // Pakete kosten laufend nichts. Die gespeicherten Altwerte ohneCrmGebuehr
  // und laufzeitOffen am Bewerber ändern daran nichts mehr.
  if (paket.preis > 0) return `${formatPreis(paket.preis)} einmalig + ${formatPreis(paket.monatlich)}/Monat`;
  return `${paket.provisionssatz} % Provision · kein laufendes Entgelt`;
}

/** Straße und Ort aus einer mehrzeiligen Anschrift, ohne den Namen. */
function anschriftKurz(roh: string | undefined): string {
  return (roh || "").split("\n").map((z) => z.trim()).filter(Boolean).slice(1, 3).join(", ");
}

function rueckrufText(b: Bewerber): string {
  const uhrzeit = hatText(b.bedenkzeitRueckrufUhrzeit) ? ` um ${b.bedenkzeitRueckrufUhrzeit} Uhr` : "";
  return `${formatDatum(b.bedenkzeitRueckrufAm)}${uhrzeit}`;
}

/** durchgefuehrtAm liegt als ISO oder dd.mm.yyyy vor; beides lesbar machen. */
function abschlussDatumKurz(roh: string | undefined): string {
  const wert = (roh ?? "").trim();
  if (!wert) return "";
  const d = new Date(wert);
  return isNaN(d.getTime()) ? wert : d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Angaben, die nicht am Bewerber hängen, sondern aus der Mail-Verfolgung
 * kommen. Sie dürfen den Zustand NICHT bestimmen (der Verfolgungseintrag
 * entsteht vor dem Versand), nur ergänzen.
 */
export type ClosingZusatz = {
  /** Der PDF-Link aus der Startfahrplan-Mail wurde aufgerufen. */
  startfahrplanGeoeffnet?: boolean;
  /**
   * Der Termin aus `buchungen`, so wie ihn `useBewerberBuchungen` liefert.
   *
   * Fehlt er, rechnet diese Datei wie vorher allein mit den Feldern am
   * Bewerber. Sie stürzt also nicht ab, wenn ihn jemand nicht durchreicht,
   * zeigt dann aber unter Umständen einen Termin nicht an, den es gibt.
   */
  buchung?: BewerberBuchungStand | null;
};

export function berechneClosingFortschritt(b: Bewerber, zusatz: ClosingZusatz = {}): ClosingFortschritt {
  const entscheidung = (b.closingEntscheidung || "") as ClosingFortschritt["entscheidung"];
  const skript = b.erstgespraechSkript;
  const teil1Abgeschlossen = istTeil1Abgeschlossen(skript);
  const teil1AbgeschlossenAm = teil1Abgeschlossen ? abschlussDatumKurz(skript?.durchgefuehrtAm) : "";
  const teil2Komplett = istClosingDirektKomplett(skript?.closingDirekt, b.closingEntscheidung, b.paketwahl);
  const gespraechKomplett = teil1Abgeschlossen && teil2Komplett;
  /*
   * Gehalten heißt: Teil 2 ist im Gespräch komplett durchlaufen, es liegt
   * bereits ein Ergebnis vor, oder das persönliche Gespräch des neuen
   * Bewerberprozesses wurde abgeschlossen.
   *
   * Der dritte Fall hat lange gefehlt. Im neuen Ablauf gibt es weder Teil 2
   * noch das alte Zehn-Punkte-Skript; die Entscheidung steht in
   * `erstgespraechSkript.bewerberVideocall.entscheidung`. Ohne diese Zeile
   * blieb Punkt 1 offen und der Kasten „Was noch fehlt" behauptete
   * „Präsentation noch nicht gehalten", obwohl das Gespräch geführt war.
   */
  const videocallEntschieden = !!(skript?.bewerberVideocall?.entscheidung ?? "").trim();
  const praesentationGehalten = teil2Komplett || entscheidung !== "" || videocallEntschieden;

  /*
   * Der Termin des persönlichen Gesprächs, aus genau EINER Herleitung.
   *
   * `closingGespraechTermin` kennt die Rangfolge: die stehende Buchung schlägt
   * den von Hand gepflegten Termin, dieser die abgesagte Buchung, und ganz
   * zuletzt zählt die Kopie in der Akte.
   *
   * Vorher las diese Datei allein `b.erstgespraechDatum`, also die Kopie. Die
   * schreibt `bewerberToDb` bei jedem Speichern aus dem Bewerber im
   * Arbeitsspeicher neu. Wer die Akte offen hatte, bevor der Bewerber buchte,
   * raeumte den Termin mit dem naechsten beliebigen Speichern still weg. Bei
   * Berat Kilapia stand hier deshalb "Termin im Reiter Erstgespräch setzen",
   * obwohl der Termin laengst gebucht war und die Tabellenspalte ihn zeigte.
   *
   * Seitdem lesen Tabellenspalte, Termin-Karte und dieser Fortschritt dieselbe
   * Quelle. Der von Hand gepflegte `closingTerminDatum` steckt als Rang 2 mit
   * darin, deshalb braucht es unten keine zweite Abfrage mehr auf ihn.
   */
  const gespraechsTermin = closingGespraechTermin(b, zusatz.buchung);
  const terminLang = gespraechsTermin.datum
    ? `${formatDatum(gespraechsTermin.datum)}` +
      `${gespraechsTermin.uhrzeit ? ` um ${gespraechsTermin.uhrzeit} Uhr` : ""}`
    : "";
  /** Der volle Satz, wie er in den Zeilen unter einem Schritt steht. */
  const selbstGebuchterTermin = !terminLang
    ? ""
    : gespraechsTermin.abgesagt
      ? `Persönliches Gespräch am ${terminLang} wurde abgesagt, neuen Termin vereinbaren`
      : gespraechsTermin.quelle === "closing"
        ? `Termin ${terminLang}`
        : `Persönliches Gespräch am ${terminLang}, selbst gebucht`;
  const terminHinweis = selbstGebuchterTermin || "Termin im Reiter Erstgespräch setzen";
  /** Die knappe Fassung für die Kopfzeile der Karte, dort ist wenig Platz. */
  const terminKurz = !terminLang
    ? ""
    : `Termin ${formatDatum(gespraechsTermin.datum)}` +
      `${gespraechsTermin.uhrzeit ? `, ${gespraechsTermin.uhrzeit} Uhr` : ""}` +
      `${gespraechsTermin.abgesagt ? ", abgesagt" : ""}`;

  const paket = getLizenzPaket(b.paketwahl);
  const paketErledigt =
    entscheidung === "ja" &&
    !!paket &&
    (paket.istTippgeber ? hatText(b.tippgeberProvisionsBetrag) : true);
  const adressenVollstaendig = hatText(b.vertragsAdresse) && hatText(b.rechnungsAdresse);
  const startfahrplanVersendet = hatText(b.paketUebersichtSentAt);
  const vertragErzeugt = hatText(b.paketBestaetigtAm);

  const ja = entscheidung === "ja";
  const nein = entscheidung === "nein";

  const entscheidungKurz =
    entscheidung === "ja" ? "Ja, will starten"
    : entscheidung === "nein" ? "Nein, möchte nicht starten"
    : entscheidung === "bedenkzeit" ? `Bedenkzeit, Rückruf ${rueckrufText(b)}`
    : "Ja, Bedenkzeit oder Nein";

  // Ein Wortlaut für Kopfzeile, Balken und Seitenleiste. "wartet auf Kurz"
  // bekommt eine eigene Formulierung: Der Bewerber hat dann bereits
  // unterschrieben, es fehlt nur die Gegenzeichnung.
  const version = `v${b.vertragVersion || 1}`;
  const vertragKurz = vertragErzeugt
    ? b.vertragStatus === "unterschrieben" ? `${version} unterschrieben`
      : b.vertragStatus === "wartet_auf_kurz" ? `${version} unterschrieben, wartet auf Gegenzeichnung`
      : b.vertragStatus === "gesendet" ? `${version} versendet, wartet auf Unterschrift`
      : b.vertragStatus === "abgelehnt" ? `${version} vom Bewerber abgelehnt`
      : `${version} erzeugt ${formatDatum(b.paketBestaetigtAm)}`
    : "danach senden im Reiter Vertrag";

  // Startfahrplan: Zustand und Zeitpunkt kommen ausschließlich aus
  // paketUebersichtSentAt, weil das Feld erst nach erfolgreichem Versand
  // gesetzt wird. Die Mail-Verfolgung liefert nur das "geöffnet" dazu.
  const startfahrplanKurz = startfahrplanVersendet
    ? `versendet ${formatDatum(b.paketUebersichtSentAt)}`
    : nein ? "nach einer Absage gegenstandslos" : "optional, noch nicht versendet";

  const schritte: ClosingSchritt[] = [
    {
      nr: 1, titel: CLOSING_SCHRITT_TITEL[1],
      zustand: praesentationGehalten ? "erledigt" : "offen",
      ausGespraech: teil2Komplett,
      kurz: gespraechKomplett
        ? `geführt am ${teil1AbgeschlossenAm}`
        : videocallEntschieden
          ? `Persönliches Gespräch geführt${teil1AbgeschlossenAm ? ` am ${teil1AbgeschlossenAm}` : ""}`
          : terminKurz
            ? terminKurz
            : teil2Komplett ? "Teil 2 im Gespräch komplett" : "Termin und Präsentation",
      zeilen: gespraechKomplett
        ? [`Erstgespräch und Closing-Gespräch geführt am ${teil1AbgeschlossenAm}`]
        : videocallEntschieden
          ? [
              `Persönliches Gespräch abgeschlossen${teil1AbgeschlossenAm ? ` am ${teil1AbgeschlossenAm}` : ""}`,
              selbstGebuchterTermin,
            ].filter(Boolean)
          : [
              terminHinweis,
              teil2Komplett ? "Teil 2 im Gespräch komplett, Erstgespräch noch nicht abgeschlossen" : "",
            ].filter(Boolean),
    },
    {
      nr: 2, titel: CLOSING_SCHRITT_TITEL[2],
      zustand: ja || nein ? "erledigt" : "offen",
      ausGespraech: teil2Komplett && entscheidung !== "",
      kurz: entscheidungKurz,
      zeilen: entscheidung === "bedenkzeit"
        ? ["Bedenkzeit", `Rückruf ${rueckrufText(b)}`]
        : [entscheidungKurz],
    },
    {
      nr: 3, titel: CLOSING_SCHRITT_TITEL[3],
      zustand: !ja ? "gesperrt" : paketErledigt ? "erledigt" : "offen",
      ausGespraech: teil2Komplett && hatText(b.paketwahl),
      kurz: !ja ? "nach Entscheidung Ja"
        : paket ? (paketErledigt ? `${paket.titel}, ${konditionenKurz(paket)}` : `${paket.titel}, Vergütung fehlt`)
        : "Paket wählen",
      zeilen: !ja ? ["nach Entscheidung Ja"]
        : paket
          ? [
              paket.titel,
              konditionenKurz(paket),
              b.leadPaket ? `Lead-Paket ${b.leadPaket.anzahl} Leads` : "",
              b.leadEinzelkauf ? "Leads einzeln gekauft" : "",
              b.individuelleVertragsFassung ? "individuelle Vertragsfassung" : "",
            ].filter(Boolean)
          : ["Paket wählen, Schalter prüfen"],
    },
    {
      nr: 4, titel: CLOSING_SCHRITT_TITEL[4],
      zustand: !ja ? "gesperrt" : adressenVollstaendig ? "erledigt" : "offen",
      ausGespraech: teil2Komplett && adressenVollstaendig,
      kurz: !ja ? "nach Entscheidung Ja" : adressenVollstaendig ? "vollständig" : "Pflicht vor dem Vertrag",
      zeilen: adressenVollstaendig
        ? [
            anschriftKurz(b.vertragsAdresse) || "Vertragsanschrift erfasst",
            `Rechnung: ${(b.rechnungsAdresse || "").split("\n")[0]?.trim() || "erfasst"}`,
          ]
        : ja ? ["Vertragsanschrift und Rechnungsadresse fehlen"] : ["nach Entscheidung Ja"],
    },
    {
      nr: 5, titel: CLOSING_SCHRITT_TITEL[5],
      zustand: nein ? "gesperrt" : startfahrplanVersendet ? "erledigt" : "offen",
      ausGespraech: false,
      kurz: startfahrplanKurz,
      zeilen: startfahrplanVersendet
        ? [
            `versendet ${formatZeitpunkt(b.paketUebersichtSentAt)}`,
            zusatz.startfahrplanGeoeffnet ? "PDF-Link vom Bewerber geöffnet" : "",
          ].filter(Boolean)
        : [startfahrplanKurz],
    },
    {
      nr: 6, titel: CLOSING_SCHRITT_TITEL[6],
      zustand: !(ja && paketErledigt && adressenVollstaendig) ? "gesperrt" : vertragErzeugt ? "erledigt" : "offen",
      ausGespraech: false,
      kurz: vertragKurz,
      zeilen: vertragErzeugt && (b.vertragStatus === "nicht_gesendet" || !b.vertragStatus)
        ? [vertragKurz, "senden im Reiter Vertrag"]
        : [vertragKurz],
    },
  ];

  // Der nächste Pflichtschritt: erste offene Karte außer dem optionalen
  // Startfahrplan. Bei Bedenkzeit und Nein bleibt die Entscheidung der Ort.
  const aktiverSchritt: ClosingSchrittNr | 0 = (() => {
    if (entscheidung === "bedenkzeit") return 2;
    const kandidat = schritte.find((s) => s.nr !== 5 && s.zustand === "offen");
    if (kandidat) return kandidat.nr;
    return 0;
  })();

  const naechsterSchritt = (() => {
    if (nein) return "Bewerbung abgelehnt, keine weiteren Schritte im Closing";
    if (entscheidung === "bedenkzeit") return `Rückruf am ${rueckrufText(b)}, danach Entscheidung erfassen`;
    if (!praesentationGehalten) return "Präsentation starten (Teil 2) und Entscheidung erfassen";
    if (entscheidung === "") return "Entscheidung erfassen";
    if (!paketErledigt) return paket?.istTippgeber
      ? "Tippgeber-Vergütung eintragen, dann Adressen prüfen"
      : "Paket und Konditionen festlegen, dann Adressen prüfen";
    if (!adressenVollstaendig) return "Vertragsanschrift und Rechnungsadresse vervollständigen";
    if (!vertragErzeugt) return "Paket bestätigen und Vertrag erstellen";
    if (b.vertragStatus === "unterschrieben") return "Vertrag unterschrieben, weiter im Reiter Rechnung";
    if (b.vertragStatus === "gesendet" || b.vertragStatus === "wartet_auf_kurz") return "Unterschrift abwarten (Reiter Vertrag)";
    return "Vertrag im Reiter Vertrag senden";
  })();

  const fehlt: FehltEintrag[] = [];
  if (nein) {
    // Nichts mehr offen
  } else {
    if (!praesentationGehalten) {
      fehlt.push({
        text: "Präsentation noch nicht gehalten",
        unter: terminHinweis,
        dringend: true,
      });
    }
    if (entscheidung === "") {
      fehlt.push({ text: "Entscheidung offen", unter: "nach der Präsentation erfassen" });
    }
    if (entscheidung === "bedenkzeit") {
      fehlt.push({
        text: hatText(b.bedenkzeitRueckrufAm) ? `Rückruf am ${rueckrufText(b)}` : "Rückruftermin fehlt",
        unter: hatText(b.bedenkzeitRueckrufAm)
          ? `Erinnerung ${erinnerungLabel(b.bedenkzeitErinnerungTage)} in der Inbox`
          : "Pflicht bei Bedenkzeit",
        dringend: true,
      });
      if (hatText(b.bedenkzeitVorbereitung)) {
        fehlt.push({ text: "Vorbereitung für den Rückruf", unter: (b.bedenkzeitVorbereitung || "").trim() });
      }
    }
    if (ja && !paketErledigt) {
      fehlt.push(paket?.istTippgeber
        ? { text: "Tippgeber-Vergütung fehlt", unter: "Pflicht vor dem Vertrag", dringend: true }
        : { text: "Paket wählen", unter: "Vertriebspartner, Lead-Berater oder Tippgeber" });
    }
    if (ja && !adressenVollstaendig) {
      fehlt.push({ text: "Vertragsanschrift und Rechnungsadresse", unter: "Pflicht vor dem Vertrag" });
    }
    if (ja && hatText(b.andereVertriebe) && !b.individuelleVertragsFassung) {
      fehlt.push({ text: "Andere Vertriebe genannt, § 10 steht auf Standard", unter: "Individuelle Fassung prüfen", dringend: true });
    }
    if (ja && (hatText(b.satzIndividuell) || hatText(b.satzLead) || hatText(b.satzEigen))) {
      const saetze = hatText(b.satzIndividuell)
        ? `${b.satzIndividuell} %`
        : [b.satzLead, b.satzEigen].filter(hatText).map((s) => `${s} %`).join(" / ");
      fehlt.push({ text: `Individuelle Sätze ${saetze}`, unter: "prüfen, ob so vereinbart", dringend: true });
    }
    if (ja && b.leadPaket && !vertragErzeugt) {
      fehlt.push({ text: "Folgegespräch mit Christian Kurz", unter: "nur bei gestellten Leads nötig" });
    }
  }

  return {
    praesentationGehalten,
    teil1Abgeschlossen,
    teil1AbgeschlossenAm,
    teil2Komplett,
    gespraechKomplett,
    entscheidung,
    paketErledigt,
    adressenVollstaendig,
    startfahrplanVersendet,
    vertragErzeugt,
    schritte,
    aktiverSchritt,
    naechsterSchritt,
    fehlt,
  };
}
