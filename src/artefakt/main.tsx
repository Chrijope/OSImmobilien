/*
 * Einstieg der eigenständigen Fassung (vite.artefakt.config.ts):
 * Beratungspräsentation und Selbstauskunft aus dem CRM, dieselben
 * Komponenten, ohne Anmeldung und ohne Server.
 *
 *   #/praesentation     Beratungspräsentation, Fassung B (Start)
 *   #/selbstauskunft    Formular, am Ende „Als PDF speichern“
 *
 * Nur Fassung B (Entscheidung Christian, 20.10.2026): A entfällt.
 */

import "./netzwerk";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Moon, Sun } from "lucide-react";
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

/** Umschalter Hell/Dunkel, unten links, nur auf der Präsentation. */
function Bedienleiste({ dunkel, setDunkel }: { dunkel: boolean; setDunkel: (v: boolean) => void }) {
  const { pathname } = useLocation();
  const aufPraesentation = pathname.startsWith("/praesentation");
  /*
   * Die Selbstauskunft bleibt immer hell: Ihre Karte (.apple-form in
   * index.css) hat eine feste weiße Fläche, im Dunkelmodus stünde dort helle
   * Schrift auf Weiß.
   */
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dunkel && aufPraesentation);
  }, [dunkel, aufPraesentation]);
  // Auf der Selbstauskunft läge die Leiste über „Zurück“ in der Knopfleiste des Formulars.
  if (!aufPraesentation) return null;
  return (
    <div
      data-pdf-exclude
      className="fixed bottom-5 left-4 z-[70] flex items-center rounded-full border bg-background/90 p-1 shadow-lg backdrop-blur"
    >
      <button
        type="button"
        aria-label={dunkel ? "Helle Ansicht" : "Dunkle Ansicht"}
        onClick={() => setDunkel(!dunkel)}
        className="h-9 w-9 rounded-full inline-flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
      >
        {dunkel ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
    </div>
  );
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
          <Routes>
            <Route path="/praesentation" element={<Praesentation />} />
            {/* Das Logo der Präsentation verlinkt auf die CRM-Adresse. */}
            <Route path={BERATUNG_ROUTE.b} element={<Navigate to="/praesentation" replace />} />
            <Route path="/selbstauskunft" element={<SelbstauskunftArtefakt />} />
            <Route path="*" element={<Navigate to="/praesentation" replace />} />
          </Routes>
          <Bedienleiste dunkel={dunkel} setDunkel={setDunkel} />
        </HashRouter>
      </TooltipProvider>
    </UserContext.Provider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
