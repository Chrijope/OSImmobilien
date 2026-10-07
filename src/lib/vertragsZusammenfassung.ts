// Kompakte Vertragszusammenfassung: die wichtigsten Rahmenparameter eines
// Vertriebspartner-Vertrags als Zeilenliste, ohne das PDF zu öffnen.
//
// Einzige Quelle für die Karte "Vertrag auf einen Blick" im Bewerberprofil
// (VertragsTab) und im Nutzerprofil der Nutzerverwaltung. Abgeleitet wird
// ausschließlich aus dem Konditionen-Objekt (konditionenAus), aus dem auch
// der Vertragstext und das Konditionenblatt gespeist werden. Kein zweites
// Regelwerk: Ändert sich der Vertragstext dort, ändert sich diese Anzeige mit.

import { GESTELLT_ZUSATZ_KURZ, UNENTGELTLICH_KURZ, formatPreis, getLizenzPaket } from "./lizenzPakete";
import { konditionenAus, leadpaketKonditionText } from "./vertragKonditionen";
import { VERTRAG_STATUS_LABELS, type Bewerber } from "./bewerbungStore";
import { formatDatumZeitFlexibel } from "./datumsformate";

export interface VertragsZeile {
  label: string;
  wert: string;
  /** Weicht vom Standard ab (individuell vereinbart)? Für die dezente Markierung. */
  individuell?: boolean;
}

/**
 * Stempel der vertragsrelevanten Konditionen eines Bewerbers.
 *
 * Beim Erzeugen eines Vertrags-PDFs wird der Stempel am Bewerber gespeichert
 * (vertragKonditionenStand). Ändert sich danach etwas an Paket, Sätzen,
 * Schaltern, Fassung oder Leadpaket, weicht der aktuelle Stempel ab und der
 * Vertrags-Tab warnt, dass das hinterlegte PDF veraltet ist. So kann keine
 * alte Fassung mehr unbemerkt angesehen oder versendet werden.
 *
 * Die Feldnamen und Werte sind seit der ersten Fassung unverändert, damit
 * bereits gespeicherte Stempel gültig bleiben. Gelesen wird aus dem
 * Konditionen-Objekt; ohne bekanntes Paket aus den Rohfeldern.
 *
 * Einzige Ergänzung: Beim Tippgeber gehört die vereinbarte Vergütung dazu,
 * denn sie steht in der Tippgebervereinbarung. Der Schlüssel wird nur bei
 * diesem Paket geschrieben, damit die Stempel aller anderen Verträge
 * unverändert gültig bleiben.
 */
export function vertragsKonditionenStempel(bewerber: Bewerber): string {
  const k = konditionenAus(bewerber);
  const satz = (v: unknown) => String(v ?? "").trim();
  const tippgeber = (k?.istTippgeber ?? bewerber.paketwahl === "tippgeber")
    ? { tippgeber: [satz(bewerber.tippgeberProvisionsModell), satz(bewerber.tippgeberProvisionsBetrag)] }
    : {};
  return JSON.stringify({
    paket: bewerber.paketwahl || "",
    zahlungsweise: bewerber.zahlungsweise || "",
    saetze: k ? k.saetzeRoh : [
      satz(bewerber.satzIndividuell),
      satz(bewerber.satzLead),
      satz(bewerber.satzEigen),
      satz(bewerber.satzBestand),
      satz(bewerber.satzNeubau),
    ],
    ohneCrmGebuehr: !!bewerber.ohneCrmGebuehr,
    // Die im Vertrag tatsächlich geltende Laufzeit: "ohne CRM-Gebühr" bedeutet
    // auch "ohne Mindestlaufzeit". Ein altes PDF, das noch 12 Monate nennt,
    // gilt damit als veraltet und wird neu erzeugt.
    laufzeitOffen: k ? k.laufzeitOffen : false,
    individuelleFassung: !!bewerber.individuelleVertragsFassung,
    andereVertriebe: bewerber.individuelleVertragsFassung ? (bewerber.andereVertriebe || "").trim() : "",
    leadPaket: bewerber.leadPaket ? [bewerber.leadPaket.betrag, bewerber.leadPaket.anzahl] : null,
    // Die Closing-Auswahl "Leads einzeln" gehört in den Stempel: Ohne sie
    // gölte ein Vertrag, der noch das Regelmodell nennt, fälschlich als
    // aktuell. k.leadEinzelkauf statt des Rohfelds, damit die Sperre gegen
    // ein gebuchtes Leadpaket mitwirkt.
    leadEinzelkauf: k ? k.leadEinzelkauf : false,
    ...tippgeber,
  });
}

/**
 * Liefert die Zusammenfassung als Zeilenliste oder null, wenn beim Bewerber
 * noch kein (bekanntes) Paket hinterlegt ist. Dann gibt es schlicht nichts
 * zusammenzufassen.
 */
export function vertragsZusammenfassung(bewerber: Bewerber): VertragsZeile[] | null {
  if (!getLizenzPaket(bewerber.paketwahl)) return null;
  const k = konditionenAus(bewerber);
  if (!k) return null;
  const { paket } = k;

  const zeilen: VertragsZeile[] = [];

  zeilen.push({
    label: k.partnerHonorar ? "Vertragsmodell" : "Paket",
    wert: k.paketTitel,
  });

  // Seit dem 07.09.2026 zahlt in der kompakten Fassung niemand mehr laufend
  // etwas: CRM, Objektzugänge und Pflichtschulungen sind nach § 86a HGB
  // unentgeltlich, und die sechs Leistungen der früheren Servicevereinbarung
  // werden ebenfalls gestellt. Beides steht hier, damit im Closing sichtbar
  // ist, dass nichts Geld kostet.
  // Bestandspartner der Altfassung haben eine CRM-Systemgebühr unterschrieben.
  // Ihre Zusammenfassung muss das sagen, was in ihrem Vertrag steht, nicht das,
  // was für neue Verträge gilt.
  const altfassung = k.fassung === "alt";
  if (altfassung) {
    zeilen.push({
      label: "CRM-Systemgebühr",
      wert: k.hasCrmGebuehr
        ? `${formatPreis(k.crmGebuehrMonatlich)} brutto/Monat`
        : k.crmGebuehrErlassen
          ? "Keine monatliche CRM-Gebühr (individuell vereinbart)"
          : "Keine monatliche CRM-Gebühr",
      individuell: k.crmGebuehrErlassen,
    });
  } else {
    if (!k.istTippgeber) {
      zeilen.push({
        label: "Leistungen",
        wert: `Unentgeltlich gestellt: ${UNENTGELTLICH_KURZ}, dazu ${GESTELLT_ZUSATZ_KURZ} (§ 3 Absatz 1, § 86a HGB)`,
      });
    }
    zeilen.push({
      label: "Laufendes Entgelt",
      wert: "Keines. Kein Einmalbetrag, keine Monatsgebühr, keine Mindestlaufzeit",
    });
  }

  // Laufzeit: Tippgebervereinbarung § 11 kennt keine Mindestlaufzeit,
  // der Hauptvertrag regelt sie in § 12 (neu) bzw. § 14 (alt).
  if (k.istTippgeber) {
    zeilen.push({
      label: "Laufzeit",
      wert: "Unbefristet, jederzeit mit 14 Tagen zum Monatsende kündbar",
    });
  } else if (altfassung) {
    // Die Altfassung bindet Vertrag und CRM-Nutzung an eine Mindestlaufzeit;
    // "Ohne CRM-Gebühr" bedeutete dort automatisch "ohne Mindestlaufzeit".
    zeilen.push({
      label: "Mindestlaufzeit",
      wert: k.laufzeitOffen
        ? "Keine Mindestlaufzeit, monatlich kündbar"
        : `${k.mindestlaufzeitMonate} Monate, danach monatlich kündbar`,
      individuell: k.laufzeitOffen,
    });
  } else {
    // Der Handelsvertretervertrag hat keine Mindestlaufzeit, sondern die
    // gesetzliche Staffel des § 89 HGB.
    zeilen.push({
      label: "Laufzeit Vertrag",
      wert: "Unbestimmte Zeit, Kündigungsfristen nach § 89 HGB (1 bis 6 Monate je nach Vertragsdauer)",
    });
  }

  // Provision bzw. Vergütung, je nach Vertragsmodell.
  if (k.istTippgeber) {
    const modell = bewerber.tippgeberProvisionsModell;
    const roh = (bewerber.tippgeberProvisionsBetrag || "").trim();
    const betrag = Number(roh.replace(",", "."));
    const hinterlegt = !!modell && Number.isFinite(betrag) && betrag > 0;
    zeilen.push({
      label: "Vergütung",
      wert: hinterlegt
        ? modell === "prozent"
          ? `${roh} % vom Kaufpreis pro vermitteltem Abschluss`
          : `${formatPreis(betrag)} pro vermitteltem Abschluss`
        : "Individuelle Vereinbarung, noch nicht hinterlegt",
    });
  } else if (k.partnerHonorar) {
    zeilen.push({
      label: "Honorar",
      wert: `${k.standardSatz} % auf den notariellen Kaufpreis`,
    });
  } else {
    zeilen.push({
      label: "Provision",
      wert: k.hasOverride ? k.effektiverSatzText : `Einheitlich ${k.standardSatz} %`,
      individuell: k.hasOverride,
    });
  }

  // Leadpaket, Kontakt-Eigentum und Wettbewerbsverbot betreffen nur den
  // Handelsvertretervertrag, nicht die reduzierte Tippgebervereinbarung.
  if (!k.istTippgeber) {
    // Lead-Berater: kein käufliches Leadpaket, stattdessen die
    // Bereitstellungszusage ohne Mengenanspruch.
    zeilen.push(
      k.leadModell === "gestellt"
        ? {
            label: "Leads",
            wert: "Leads werden zur Unterstützung gestellt, keine definierte Stückzahl, kein Anspruch auf eine bestimmte Menge",
          }
        : k.leadPaket
        ? {
            label: "Leadpaket",
            wert: leadpaketKonditionText(k),
            individuell: true,
          }
        : {
            label: "Leadpaket",
            wert: "Kein Leadpaket, optional jederzeit buchbar",
          },
    );

    // Eigentumsregel: Sie gilt in beiden Fassungen gleich und ist das, was
    // nach Vertragsende übrig bleibt. § 9a in der Altfassung, § 7 in der neuen.
    const eigentumsParagraph = k.fassung === "alt" ? "§ 9a" : "§ 7";
    const wettbewerbsParagraph = k.fassung === "alt" ? "§ 10" : "§ 8";
    zeilen.push({
      label: "Kontakte",
      wert: `Eigenkontakte bleiben Eigentum des Partners, auch nach Vertragsende; zugewiesene Leads und Gesellschaftskontakte bleiben Eigentum der Gesellschaft (${eigentumsParagraph})`,
    });

    if (k.wettbewerbsfassung === "individuell") {
      zeilen.push({
        label: "Wettbewerbsverbot",
        wert:
          `Gelockert: Individualfassung ${wettbewerbsParagraph}, kein Wettbewerbsverbot; Eigentums-, Daten- und Geheimnisschutz gilt unverändert` +
          (k.andereVertriebe.length ? ` · Erklärte andere Vertriebe: ${k.andereVertriebe.join(", ")}` : ""),
        individuell: true,
      });
    } else {
      zeilen.push({
        label: "Wettbewerbsverbot",
        wert: `Nur während der Laufzeit (${wettbewerbsParagraph}, exklusive Zusammenarbeit); nach Vertragsende keines, es gelten nur Daten- und Geheimnisschutz`,
      });
    }
  }

  // Einmalbetrag nur bei Bestandspaketen mit Onboardinggebühr.
  if (!k.partnerHonorar && paket.preis > 0) {
    zeilen.push({
      label: "Onboardinggebühr",
      wert: `${formatPreis(paket.preis)} netto · ${k.zahlungsweiseLabel}`,
    });
  }

  // Unterschriftsstatus samt Datum, soweit im Datensatz vorhanden.
  const statusLabel = VERTRAG_STATUS_LABELS[bewerber.vertragStatus] || bewerber.vertragStatus;
  let unterschrift: string = statusLabel;
  if (bewerber.vertragStatus === "unterschrieben" && bewerber.vertragSignedAt) {
    unterschrift = `${statusLabel} am ${new Date(bewerber.vertragSignedAt).toLocaleDateString("de-DE")}`;
  } else if (bewerber.vertragStatus === "gesendet" && bewerber.vertragDatum) {
    // vertragDatum liegt im Bestand deutsch ("31.8.2026") und neu als ISO vor.
    unterschrift = `${statusLabel} am ${formatDatumZeitFlexibel(bewerber.vertragDatum)}`;
  }
  zeilen.push({ label: "Unterschrift", wert: unterschrift });

  return zeilen;
}
