import type { ReactNode } from "react";
import "./kundenprofil.css";

interface Props {
  stammdaten: ReactNode;
  kennzahlen?: ReactNode;
  navigation: ReactNode;
  children: ReactNode;
  aktivitaeten?: ReactNode;
  aktivitaetenOffen?: boolean;
}

/** Die Bereiche erhalten ihre Inhalte vom Profil, damit alle Aktionen dort bleiben. */
export function KundenprofilLayout({ stammdaten, kennzahlen, navigation, children, aktivitaeten, aktivitaetenOffen = true }: Props) {
  return (
    <div className="kundenprofil-layout" data-aktivitaeten={aktivitaeten ? (aktivitaetenOffen ? "offen" : "zu") : "ohne"}>
      <aside className="kundenprofil-stammdaten" aria-label="Kontaktdaten">{stammdaten}</aside>
      <section className="kundenprofil-mitte" aria-label="Arbeitsbereich">
        {kennzahlen}
        <div className="kundenprofil-arbeitskarte">
          {navigation}
          <div className="kundenprofil-inhalt">{children}</div>
        </div>
      </section>
      {aktivitaeten && <aside className="kundenprofil-aktivitaeten" aria-label="Aktivitäten">{aktivitaeten}</aside>}
    </div>
  );
}
