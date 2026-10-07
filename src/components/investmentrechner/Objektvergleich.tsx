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
  type Vergleichsobjekt,
} from "@/lib/investmentrechner/objektvergleich";
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
function kartenwerte(objekt: Vergleichsobjekt): { label: string; wert: string }[] {
  const erstesJahr = objekt.ergebnis.years[0];
  const letztesJahr = objekt.ergebnis.years[objekt.ergebnis.years.length - 1];
  return [
    { label: "Bruttorendite", wert: formatProzent(objekt.ergebnis.grossYield) },
    { label: "CF n. St. p. M.", wert: erstesJahr ? formatEuroCent(erstesJahr.cashflowAfterTax / 12) : "-" },
    {
      label: `Vermögen ${letztesJahr ? letztesJahr.year : ""}`.trim(),
      wert: letztesJahr ? formatEuro(letztesJahr.totalWealth) : "-",
    },
  ];
}

interface VergleichsansichtProps {
  a: Vergleichsobjekt;
  b: Vergleichsobjekt;
}

/** Dritte Ansicht des rechten Panels: beide Objekte direkt nebeneinander. */
export function Vergleichsansicht({ a, b }: VergleichsansichtProps) {
  const zeilen = vergleicheObjekte(a, b);
  const satz = einordnung(a, b);
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
          adresse={a.eingabe.address || "Adresse ergänzen"}
          preis={formatEuro(a.eingabe.purchasePrice)}
          seite="a"
          werte={kartenwerte(a)}
        />
        <Objektkarte
          marke={objektMarke(1)}
          titel={titelB}
          adresse={b.eingabe.address || "Adresse ergänzen"}
          preis={formatEuro(b.eingabe.purchasePrice)}
          seite="b"
          werte={kartenwerte(b)}
        />
      </div>

      <article className="content-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Gegenüberstellung</span>
            <h3>Kennzahlen im direkten Vergleich</h3>
          </div>
          <span className="period-pill">{jahreAkkusativ(laufzeit)}</span>
        </div>
        <div className="compare-verdict">
          <small>Einordnung</small>
          <p>{satz}</p>
        </div>
        <div className="table-scroll compare-table">
          <table>
            <thead>
              <tr>
                <th>Kennzahl</th>
                <th className="side-a">A · {titelA}</th>
                <th className="side-b">B · {titelB}</th>
                <th>Unterschied</th>
              </tr>
            </thead>
            <tbody>
              {zeilen.map((zeile, index) => (
                <Fragment key={zeile.bezeichnung}>
                  {gruppen[index] && (
                    <tr className="compare-group">
                      <td colSpan={4}>{zeile.gruppe}</td>
                    </tr>
                  )}
                  <tr>
                    <td className="compare-label">
                      {zeile.bezeichnung}
                      {zeile.hinweis && <small>{zeile.hinweis}</small>}
                    </td>
                    <td>
                      {formatVergleichswert(zeile.wertA, zeile.einheit)}
                      {zeile.besser === "a" && <span className="compare-better">besser</span>}
                    </td>
                    <td>
                      {formatVergleichswert(zeile.wertB, zeile.einheit)}
                      {zeile.besser === "b" && <span className="compare-better">besser</span>}
                    </td>
                    <td
                      className={
                        zeile.besser === "b" ? "positive" : zeile.besser === "a" ? "negative" : undefined
                      }
                    >
                      {formatUnterschied(zeile.unterschied, zeile.einheit)}
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <p className="compare-fineprint">
          Beide Objekte sind mit derselben Steuerbasis und derselben Laufzeit gerechnet. Die Spalte Unterschied zeigt
          Objekt B im Verhältnis zu Objekt A.
        </p>
      </article>

      <article className="content-card chart-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Prognose</span>
            <h3>Vermögensentwicklung beider Objekte</h3>
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
