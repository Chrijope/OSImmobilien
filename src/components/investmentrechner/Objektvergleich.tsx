import { Fragment } from "react";
import { Plus, X } from "lucide-react";
import { formatEuro, formatEuroCent, formatProzent } from "@/lib/investmentrechner/formatierer";
import {
  einordnung,
  formatUnterschied,
  formatVergleichswert,
  jahreAkkusativ,
  objektMarke,
  vergleicheObjekte,
  vergleichBezeichnung,
  type Vergleichsobjekt,
} from "@/lib/investmentrechner/objektvergleich";
import { useRechnerSprache } from "./RechnerSprache";
import type { FormatSprache } from "@/lib/sprachFormat";
import { ausgewiesenerKaufpreis, mitStellplatz, monateErstesJahr } from "@/lib/investmentrechner/rechenkern";
import { Objektkarte } from "./Felder";
import { Zweireihendiagramm } from "./Diagramme";

/*
 * Oberfläche für den Vergleich zweier Objekte: die Objektleiste über der
 * Bereichsliste im linken Panel und die Vergleichsansicht im rechten Panel.
 * Gerechnet wird nichts, alle Werte kommen aus objektvergleich.ts.
 */

interface ObjektleisteProps {
  /** Bezeichnungen der Objekte in ihrer Reihenfolge. */
  titel: string[];
  aktivIndex: number;
  onWaehlen: (index: number) => void;
  onEntfernen: (index: number) => void;
}

/** Reiter der angelegten Objekte. Erscheint erst ab dem zweiten Objekt. */
export function Objektleiste({ titel, aktivIndex, onWaehlen, onEntfernen }: ObjektleisteProps) {
  return (
    <div className="object-bar">
      <span className="eyebrow">Objekte im Vergleich</span>
      <div className="object-tabs" role="tablist" aria-label="Objekt wählen">
        {titel.map((name, index) => (
          <span key={objektMarke(index)} className={`object-tab ${index === aktivIndex ? "active" : ""}`}>
            <button
              type="button"
              role="tab"
              aria-selected={index === aktivIndex}
              onClick={() => onWaehlen(index)}
              title={name || objektMarke(index)}
            >
              <i>{String.fromCharCode(65 + index)}</i>
              <span>{name || objektMarke(index)}</span>
            </button>
            <button
              type="button"
              className="object-tab-remove"
              aria-label={`${objektMarke(index)} entfernen`}
              onClick={() => onEntfernen(index)}
            >
              <X size={13} />
            </button>
          </span>
        ))}
      </div>
      <small>Bereich 01 gilt für beide Objekte, die Bereiche 02 bis 07 nur für das gewählte.</small>
    </div>
  );
}

/** Dezenter Knopf, mit dem ein zweites Objekt aus dem aktuellen kopiert wird. */
export function ObjektHinzufuegen({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="object-add" onClick={onClick}>
      <Plus size={15} /> Objekt zum Vergleich
    </button>
  );
}

/** Die drei Kennzahlen, die in der Vergleichsansicht auf der Objektkarte stehen. */
function kartenwerte(objekt: Vergleichsobjekt, sprache: FormatSprache = "de"): { label: string; wert: string }[] {
  const en = sprache === "en";
  const erstesJahr = objekt.ergebnis.years[0];
  const letztesJahr = objekt.ergebnis.years[objekt.ergebnis.years.length - 1];
  return [
    {
      label: mitStellplatz(objekt.ergebnis) ? (en ? "Gross yield total" : "Bruttorendite gesamt") : en ? "Gross yield" : "Bruttorendite",
      wert: formatProzent(objekt.ergebnis.grossYield, sprache),
    },
    { label: en ? "CF after tax p.m." : "CF n. St. p. M.", wert: erstesJahr ? formatEuroCent(erstesJahr.cashflowAfterTax / monateErstesJahr(objekt.ergebnis), sprache) : "-" },
    {
      label: `${en ? "Wealth" : "Vermögen"} ${letztesJahr ? letztesJahr.year : ""}`.trim(),
      wert: letztesJahr ? formatEuro(letztesJahr.totalWealth, sprache) : "-",
    },
  ];
}

interface VergleichsansichtProps {
  a: Vergleichsobjekt;
  b: Vergleichsobjekt;
}

/** Dritte Ansicht des rechten Panels: beide Objekte direkt nebeneinander. */
export function Vergleichsansicht({ a, b }: VergleichsansichtProps) {
  // Seit dem 22.10.2026 in der Sprache der rechten Seite.
  const sprache = useRechnerSprache();
  const en = sprache === "en";
  const t = (de: string, englisch: string) => (en ? englisch : de);
  const zeilen = vergleicheObjekte(a, b);
  const satz = einordnung(a, b, sprache);
  const laufzeit = Math.min(a.ergebnis.years.length, b.ergebnis.years.length);
  const jahre = a.ergebnis.years.slice(0, laufzeit).map((jahr) => jahr.year);
  const titelA = a.eingabe.propertyTitle || objektMarke(0);
  const titelB = b.eingabe.propertyTitle || objektMarke(1);
  // Gruppenüberschriften nur beim ersten Auftreten setzen.
  const gruppen = zeilen.map((zeile, index) => (index === 0 || zeilen[index - 1].gruppe !== zeile.gruppe ? zeile.gruppe : null));

  return (
    <div className="analysis-content">
      <div className="compare-cards">
        <Objektkarte
          marke={objektMarke(0)}
          titel={titelA}
          adresse={a.eingabe.address || t("Adresse ergänzen", "Address missing")}
          preis={formatEuro(ausgewiesenerKaufpreis(a.eingabe, a.ergebnis), sprache)}
          seite="a"
          werte={kartenwerte(a, sprache)}
        />
        <Objektkarte
          marke={objektMarke(1)}
          titel={titelB}
          adresse={b.eingabe.address || t("Adresse ergänzen", "Address missing")}
          preis={formatEuro(ausgewiesenerKaufpreis(b.eingabe, b.ergebnis), sprache)}
          seite="b"
          werte={kartenwerte(b, sprache)}
        />
      </div>

      <article className="content-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">{t("Gegenüberstellung", "Side by side")}</span>
            <h3>{t("Kennzahlen im direkten Vergleich", "Key figures compared directly")}</h3>
          </div>
          <span className="period-pill">{en ? `${laufzeit} years` : jahreAkkusativ(laufzeit)}</span>
        </div>
        <div className="compare-verdict">
          <small>{t("Einordnung", "Assessment")}</small>
          <p>{satz}</p>
        </div>
        <div className="table-scroll compare-table">
          <table>
            <thead>
              <tr>
                <th>{t("Kennzahl", "Key figure")}</th>
                <th className="side-a">A · {titelA}</th>
                <th className="side-b">B · {titelB}</th>
                <th>{t("Unterschied", "Difference")}</th>
              </tr>
            </thead>
            <tbody>
              {zeilen.map((zeile, index) => (
                <Fragment key={zeile.bezeichnung}>
                  {gruppen[index] && (
                    <tr className="compare-group">
                      <td colSpan={4}>{vergleichBezeichnung(zeile.gruppe, sprache)}</td>
                    </tr>
                  )}
                  <tr>
                    <td className="compare-label">
                      {vergleichBezeichnung(zeile.bezeichnung, sprache)}
                      {zeile.hinweis && <small>{vergleichBezeichnung(zeile.hinweis, sprache)}</small>}
                    </td>
                    <td>
                      {formatVergleichswert(zeile.wertA, zeile.einheit, sprache)}
                      {zeile.besser === "a" && <span className="compare-better">{t("besser", "better")}</span>}
                    </td>
                    <td>
                      {formatVergleichswert(zeile.wertB, zeile.einheit, sprache)}
                      {zeile.besser === "b" && <span className="compare-better">{t("besser", "better")}</span>}
                    </td>
                    <td
                      className={
                        zeile.besser === "b" ? "positive" : zeile.besser === "a" ? "negative" : undefined
                      }
                    >
                      {formatUnterschied(zeile.unterschied, zeile.einheit, sprache)}
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <p className="compare-fineprint">
          {t(
            "Beide Objekte sind mit derselben Steuerbasis und derselben Laufzeit gerechnet. Die Spalte Unterschied zeigt Objekt B im Verhältnis zu Objekt A.",
            "Both properties are calculated with the same tax basis and the same period. The Difference column shows property B relative to property A.",
          )}
        </p>
      </article>

      <article className="content-card chart-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">{t("Prognose", "Forecast")}</span>
            <h3>{t("Vermögensentwicklung beider Objekte", "Wealth development of both properties")}</h3>
          </div>
        </div>
        <Zweireihendiagramm
          jahre={jahre}
          reiheA={a.ergebnis.years.slice(0, laufzeit).map((jahr) => jahr.totalWealth)}
          reiheB={b.ergebnis.years.slice(0, laufzeit).map((jahr) => jahr.totalWealth)}
          labelA={`A · ${titelA}`}
          labelB={`B · ${titelB}`}
          groesse="breit"
        />
      </article>
    </div>
  );
}
