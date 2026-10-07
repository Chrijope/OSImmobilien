import type { ReactNode } from "react";
import "./bewerberprofil.css";

interface Props {
  /** Links, steht fest: Person, Kontaktdaten, Meta-Fragen, Verwaltung. */
  person: ReactNode;
  /** Mitte, rollt: Stufe, Kacheln, Abschnitte. */
  children: ReactNode;
  /** Rechts, einklappbar: die Aktivitaetenuebersicht. */
  aktivitaeten?: ReactNode;
  aktivitaetenOffen?: boolean;
}

/**
 * Der Rahmen des Bewerberprofils, nach dem Vorbild des Kundenprofils.
 *
 * Er ordnet nur an. Alle Inhalte und alle Aktionen kommen von aussen, genau
 * wie in `KundenprofilLayout`: So bleibt das Wissen darueber, was ein Knopf
 * tut, an einer Stelle, und der Rahmen laesst sich fuer sich pruefen.
 *
 * `data-aktivitaeten` traegt drei Werte, und daran haengt die Spaltenaufteilung
 * in `bewerberprofil.css`: „offen", „zu" und „ohne". Ohne heisst: Es gibt gar
 * keine rechte Spalte, dann ruecken die uebrigen beiden auf.
 */
export function BewerberprofilLayout({ person, children, aktivitaeten, aktivitaetenOffen = true }: Props) {
  return (
    <div className="bewerberprofil">
      <div
        className="bewerberprofil-layout"
        data-aktivitaeten={aktivitaeten ? (aktivitaetenOffen ? "offen" : "zu") : "ohne"}
      >
        <aside className="bewerberprofil-person" aria-label="Bewerberangaben">{person}</aside>
        <section className="bewerberprofil-mitte" aria-label="Arbeitsbereich">{children}</section>
        {aktivitaeten && (
          <aside className="bewerberprofil-aktivitaeten" aria-label="Aktivitäten">{aktivitaeten}</aside>
        )}
      </div>
    </div>
  );
}
