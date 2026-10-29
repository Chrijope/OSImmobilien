/*
 * Einstieg der eigenständigen Fassung (vite.artefakt.config.ts):
 * Beratungspräsentation und Selbstauskunft aus dem CRM, dieselben
 * Komponenten, ohne Anmeldung und ohne Server.
 *
 *   #/praesentation     Beratungspräsentation, Fassung B (Start)
 *   #/selbstauskunft    Formular, am Ende „Als PDF speichern“
 *
 * Nur Fassung B (Entscheidung Christian, 20.10.2026): A entfällt.
 *
 * Mit `__NUR_SELBSTAUSKUNFT__` (Build mit NUR_SELBSTAUSKUNFT=1, eigenes
 * Artefakt „Selbstauskunft“, 29.10.2026) nur die Selbstauskunft: keine
 * Präsentation, kein Pfeil zurück, jede Adresse führt zum Formular.
 */
const NUR_SELBSTAUSKUNFT = typeof __NUR_SELBSTAUSKUNFT__ !== "undefined" && __NUR_SELBSTAUSKUNFT__;

import "./netzwerk";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import "@/index.css";
import "@/styles/design-neu.css";
import "@/styles/design-glas.css";
import "@/styles/design-liquid.css";
import { wendeDesignAn } from "@/lib/designSchalter";
import { UserContext } from "@/contexts/UserContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import BeratungspraesentationHV, { BERATUNG_ROUTE, type BeratungVorschau } from "@/pages/BeratungspraesentationHV";
import SelbstauskunftArtefakt from "./SelbstauskunftArtefakt";
import { speichereDatei } from "./speichern";

// Die Merkmale stehen auch in index.html; hier noch einmal, falls der Host die Seite neu einrahmt.
document.documentElement.lang = "de";
document.documentElement.dataset.design = "neu";
if (!document.documentElement.dataset.glas) document.documentElement.dataset.glas = "an";
wendeDesignAn();

/** Hell oder dunkel: zuerst die Wahl des Nutzers, sonst das Gerät. */
const DUNKEL_SCHLUESSEL = "artefakt.dunkel";
function dunkelAnfang(): boolean {
  try {
    const gemerkt = localStorage.getItem(DUNKEL_SCHLUESSEL);
    if (gemerkt !== null) return gemerkt === "1";
  } catch { /* gesperrt */ }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

/** Kein Kunde, kein Partner, kein Erstgespräch: die Präsentation im Modus ohne Kunde. */
const OHNE_KUNDE: BeratungVorschau = { schluessel: "", kundenName: "", kontakt: {}, skript: null };

function Praesentation() {
  const navigate = useNavigate();
  return (
    <BeratungspraesentationHV
      variante="b"
      vorschau={OHNE_KUNDE}
      ohneProfil
      speichereDatei={speichereDatei}
      weiterZurSelbstauskunft={(adresse) => {
        navigate(adresse);
        window.scrollTo(0, 0);
      }}
    />
  );
}

/*
 * Dunkel gilt nur auf der Präsentation. Den Schalter zeichnet die Präsentation
 * selbst (BeratungspraesentationHV), im CRM wie hier; er ruft toggleDarkMode.
 * Die Selbstauskunft bleibt immer hell: Ihre Karte (.apple-form in index.css)
 * hat eine feste weiße Fläche, im Dunkelmodus stünde dort helle Schrift auf Weiß.
 */
function DunkelNurAufPraesentation({ dunkel }: { dunkel: boolean }) {
  const { pathname } = useLocation();
  const aufPraesentation = pathname.startsWith("/praesentation");
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dunkel && aufPraesentation);
  }, [dunkel, aufPraesentation]);
  return null;
}

function App() {
  const [dunkel, setDunkelRoh] = useState(dunkelAnfang);
  const setDunkel = (v: boolean) => {
    setDunkelRoh(v);
    try { localStorage.setItem(DUNKEL_SCHLUESSEL, v ? "1" : "0"); } catch { /* gesperrt */ }
  };

  // Neutrale Attrappe: Die Komponenten fragen useUser(), in der Vorschau-Fassung zählt davon nichts.
  const nutzer = {
    user: { name: "", role: "vertriebspartner" as const, osImmoId: "" },
    setRole: async () => ({ status: "ok" as const }),
    darkMode: dunkel,
    toggleDarkMode: () => setDunkel(!dunkel),
    isLoggedIn: false,
    login: async () => ({ error: "Ohne Anmeldung" }),
    logout: async () => {},
    demoMode: false,
    loading: false,
    authUser: null,
  };

  return (
    <UserContext.Provider value={nutzer}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <HashRouter>
          {NUR_SELBSTAUSKUNFT ? (
          <Routes>
            <Route path="/selbstauskunft" element={<SelbstauskunftArtefakt ohneZurueck />} />
            <Route path="*" element={<Navigate to="/selbstauskunft" replace />} />
          </Routes>
          ) : (
          <Routes>
            <Route path="/praesentation" element={<Praesentation />} />
            {/* Das Logo der Präsentation verlinkt auf die CRM-Adresse. */}
            <Route path={BERATUNG_ROUTE.b} element={<Navigate to="/praesentation" replace />} />
            <Route path="/selbstauskunft" element={<SelbstauskunftArtefakt />} />
            <Route path="*" element={<Navigate to="/praesentation" replace />} />
          </Routes>
          )}
          <DunkelNurAufPraesentation dunkel={dunkel} />
        </HashRouter>
      </TooltipProvider>
    </UserContext.Provider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
