import { glossar } from "@/lib/investmentrechner/kennzahlErklaerungen";
import { useRechnerTexte } from "./RechnerSprache";

/**
 * Das Glossar „So entstehen die Zahlen“: jede Kennzahl mit einem Satz zur
 * Bedeutung und der Formel, dazu der Hinweis zur Rundung und „Keine
 * Steuerberatung“.
 *
 * Dieselbe Komponente steht einklappbar in der Analyse und als eigene Seite
 * am Ende der Berechnung. Der Inhalt kommt aus kennzahlErklaerungen.ts, aus
 * derselben Quelle wie die Rechenwege unter den Zahlen.
 */
export function Glossar({ kompakt = false, allInclusive = false }: { kompakt?: boolean; allInclusive?: boolean }) {
  const inhalt = glossar(useRechnerTexte().kennzahl, { allInclusive });
  return (
    <div className={`glossar ${kompakt ? "kompakt" : ""}`}>
      <p className="glossar-einleitung">{inhalt.einleitung}</p>
      <div className="glossar-gruppen">
        {inhalt.gruppen.map((gruppe) => (
          <section key={gruppe.schluessel} className="glossar-gruppe">
            <h4>{gruppe.titel}</h4>
            <dl>
              {gruppe.eintraege.map((eintrag) => (
                <div key={eintrag.schluessel} className="glossar-eintrag" data-glossar={eintrag.schluessel}>
                  <dt>{eintrag.titel}</dt>
                  <dd>{eintrag.bedeutung}</dd>
                  <dd className="glossar-formel">{eintrag.formel}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <p className="glossar-hinweis">{inhalt.rundung}</p>
      <p className="glossar-hinweis glossar-steuerberatung">{inhalt.keineSteuerberatung}</p>
    </div>
  );
}
