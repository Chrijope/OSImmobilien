/*
 * Einstieg der eigenständigen Fassung des Investmentrechners
 * (vite.investmentrechner.config.ts, Artefakt „OSImmobilien - Investmentrechner“).
 *
 * Seit dem 22.10.2026 derselbe Code wie im CRM: `InvestmentrechnerInhalt` mit
 * Rechenkern, Eingabebereichen, Analyse, Berechnung und ausführlicher
 * Berechnung. Vorher war die veröffentlichte Fassung ein eigener, nicht im
 * Repository liegender Stand mit abweichenden Feldnamen (garageMiete,
 * garagePreis), der anders rechnete. Ohne Anmeldung und ohne Server: Die
 * Eingabe bleibt nur im Browser (localStorage). Seit dem 23.10.2026 speichert
 * der Rechner selbst, samt Bildern, und hat oben rechts „Zurücksetzen“
 * (entwurfAblage.ts), genau wie im CRM.
 */

import "../netzwerk";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import jsPDF from "jspdf";
import "@/index.css";
import "@/styles/design-neu.css";
import "@/styles/design-glas.css";
import "@/styles/design-liquid.css";
import "./artefakt.css";
import { wendeDesignAn } from "@/lib/designSchalter";
import { UserContext } from "@/contexts/UserContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { InvestmentrechnerInhalt } from "@/components/investmentrechner/InvestmentrechnerInhalt";
import { berechneInvestment } from "@/lib/investmentrechner/rechenkern";
import { standardKaufnebenkostenauswahl } from "@/lib/investmentrechner/kaufnebenkostenAuswahl";
import { speichereDatei } from "../speichern";
import { eingabeLaden, eingabeLoeschen, BEISPIEL_EINGABE, namenLaden, namenSpeichern } from "./ablage";
import "./laufzeitDateien";

document.documentElement.lang = "de";
document.documentElement.dataset.design = "neu";
if (!document.documentElement.dataset.glas) document.documentElement.dataset.glas = "an";
wendeDesignAn();

/*
 * Jedes PDF des Rechners (jsPDF) geht über die Artefakt-Fähigkeit „downloads“
 * an den Nutzer, sonst über einen normalen Download-Link. So bleiben die
 * Komponenten unverändert und rufen weiter `pdf.save(name)`.
 */
(jsPDF.API as unknown as { save: (this: jsPDF, dateiname: string) => jsPDF }).save = function (this: jsPDF, dateiname: string) {
  void speichereDatei(dateiname, this.output("blob"));
  return this;
};

// Für die Prüfung im Browser: derselbe Rechenkern wie im CRM.
(window as unknown as { __rechenkern?: unknown }).__rechenkern = { berechneInvestment };

const NUTZER = {
  user: { name: "", role: "vertriebspartner" as const, osImmoId: "" },
  setRole: async () => ({ status: "ok" as const }),
  darkMode: false,
  toggleDarkMode: () => {},
  isLoggedIn: false,
  login: async () => ({ error: "Ohne Anmeldung" }),
  logout: async () => {},
  demoMode: false,
  loading: false,
  authUser: null,
};

function App() {
  /*
    Beim ersten Öffnen die Beispielzahlen, oder ein Stand der früheren Ablage
    (bis 23.10.2026). Er wird einmal übernommen und dann gelöscht; danach
    speichert der Rechner seinen Entwurf selbst.
  */
  const [start] = useState(() => {
    const frueher = eingabeLaden();
    if (frueher) eingabeLoeschen();
    return frueher ?? BEISPIEL_EINGABE;
  });
  const [name, setName] = useState(() => namenLaden());
  /*
    Seit dem 29.10.2026 nur die Rechnung im Einhauser-Aufbau: Analyse und
    ausführliche Berechnung (PDF), wie im CRM. Der persönliche
    Objektvergleich (Objektvergleich.tsx) ist ausgeblendet. Die Angaben zum
    Kunden für „Ihre Ausgangslage“ stehen hier von Hand unter „Kunde & Einkommen“.
  */
  return (
    <div className="min-h-screen bg-background rechner-artefakt">
      <div className="artefakt-leiste">
        <p>Beim ersten Öffnen sind Beispielzahlen vorbelegt. Deine Eingaben und Bilder bleiben in diesem Browser gespeichert.</p>
        <div className="artefakt-knoepfe">
          <label htmlFor="artefakt-partner">Name auf der Berechnung</label>
          <input
            id="artefakt-partner"
            type="text"
            placeholder="optional, z. B. dein Name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              namenSpeichern(e.target.value);
            }}
          />
        </div>
      </div>
      <InvestmentrechnerInhalt
        vorbelegung={{ eingabe: start, knk: standardKaufnebenkostenauswahl }}
        vorschau={{}}
        leerZuruecksetzen
        erstelltVon={name}
        kundeVonHand
      />
      <Toaster />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <UserContext.Provider value={NUTZER}>
    <TooltipProvider>
      <App />
    </TooltipProvider>
  </UserContext.Provider>,
);
