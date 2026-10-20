/*
 * Einstieg der eigenständigen Fassung (vite.artefakt.config.ts):
 * Beratungspräsentation und Selbstauskunft aus dem CRM, dieselben
 * Komponenten, ohne Anmeldung und ohne Server.
 *
 *   #/praesentation     Fassung A (Start)
 *   #/praesentation-b   Vergleichsfassung B
 *   #/selbstauskunft    Formular, am Ende „Als PDF speichern“
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
import BeratungspraesentationHV, { BERATUNG_ROUTE, type BeratungVariante, type BeratungVorschau } from "@/pages/BeratungspraesentationHV";
import SelbstauskunftArtefakt from "./SelbstauskunftArtefakt";

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

function Praesentation({ variante }: { variante: BeratungVariante }) {
  const navigate = useNavigate();
  return (
    <BeratungspraesentationHV
      key={variante}
      variante={variante}
      vorschau={OHNE_KUNDE}
      weiterZurSelbstauskunft={(adresse) => {
        navigate(adresse);
        window.scrollTo(0, 0);
      }}
    />
  );
}

/** Umschalter A/B und Hell/Dunkel, unten links, nur auf der Präsentation. */
function Bedienleiste({ dunkel, setDunkel }: { dunkel: boolean; setDunkel: (v: boolean) => void }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
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
  const knopf = "h-9 rounded-full px-3 text-xs font-semibold transition-colors";
  return (
    <div
      data-pdf-exclude
      className="fixed bottom-5 left-4 z-[70] flex items-center gap-1 rounded-full border bg-background/90 p-1 shadow-lg backdrop-blur"
    >
      {(["a", "b"] as const).map((v) => {
          const aktiv = (pathname === "/praesentation-b") === (v === "b");
          return (
            <button
              key={v}
              type="button"
              aria-pressed={aktiv}
              onClick={() => navigate(v === "b" ? "/praesentation-b" : "/praesentation")}
              className={`${knopf} ${aktiv ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Fassung {v.toUpperCase()}
            </button>
          );
        })}
      <button
        type="button"
        aria-label={dunkel ? "Helle Ansicht" : "Dunkle Ansicht"}
        onClick={() => setDunkel(!dunkel)}
        className={`${knopf} text-muted-foreground hover:text-foreground`}
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
            <Route path="/praesentation" element={<Praesentation variante="a" />} />
            <Route path="/praesentation-b" element={<Praesentation variante="b" />} />
            {/* Das Logo der Präsentation verlinkt auf die CRM-Adressen. */}
            <Route path={BERATUNG_ROUTE.a} element={<Navigate to="/praesentation" replace />} />
            <Route path={BERATUNG_ROUTE.b} element={<Navigate to="/praesentation-b" replace />} />
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
