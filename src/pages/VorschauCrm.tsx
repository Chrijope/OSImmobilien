import "@/styles/crm-vergleich.css";
import { useEffect, useState } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import { UserContext, useUser } from "@/contexts/UserContext";
import { ALLE_CACHE_TABELLEN, cacheGet, cacheSet, isTableLoaded, resetCache } from "@/lib/dataCache";
import { beispielkundeZeilen, BEISPIEL_KONTAKT_ID } from "@/lib/beispielkunde";
import { supabase } from "@/integrations/supabase/client";
import { schreibenSperren } from "./VorschauKundeKomplett";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { HeaderBar } from "@/components/HeaderBar";
import { TastenkuerzelEmpfaenger } from "@/components/TastenkuerzelEmpfaenger";
import { Kopfbereich } from "@/components/Kopfbereich";
import { CrmTutorialProvider } from "@/components/tutorial/CrmTutorial";
import Index from "./Index";
import KundenDetail from "./KundenDetail";
import Objekte from "./Objekte";
import Inbox from "./Inbox";
import { heuteAlsString } from "@/lib/faelligkeit";

/* DEV-only: Originalansichten, eigener Beispieldatensatz, kein Schreibzugriff.
 * Keine Änderung an AppShell, Anmeldung, Rollenrechten oder Produktiv-Routen.
 * Angemeldete Sitzungen werden nicht überlagert. Die Originalnavigation bleibt
 * sichtbar; außerhalb dieser drei Ansichten führt sie ins reguläre CRM.
 */
export default function VorschauCrm() {
  const echt = useUser();
  const location = useLocation();
  const [bereit, setBereit] = useState(false);
  const [studio, setStudio] = useState(document.documentElement.dataset.crmDesign === "studio");
  useEffect(() => {
    if (echt.loading || echt.authUser) return;
    const client = supabase as any;
    const tabellen = [...new Set([...ALLE_CACHE_TABELLEN, "profiles", "user_roles", "app_config", "user_settings", "notizen"])];
    const vorher = new Map(tabellen.filter(isTableLoaded).map(t => [t, cacheGet(t)]));
    resetCache();
    const entsperren = schreibenSperren();
    const from = client.from;
    const rpc = client.rpc;
    const channel = client.channel;
    // Eine Offline-Vorschau braucht keine echten Realtime-Verbindungen.
    client.channel = (topic: string) => {
      const kanal = {topic, on: () => kanal, subscribe: () => kanal, unsubscribe: async () => "ok"};
      return kanal;
    };
    // Auch direkte Lesefallbacks lesen ausschließlich denselben Beispieldatensatz.
    client.from = (tabelle: string) => {
      let einzeln = false;
      let gesperrt = false;
      let start = 0;
      let ende = Infinity;
      const filter: Array<(row: any) => boolean> = [];
      let sortierung: {feld: string; auf: boolean} | null = null;
      const result = () => {
        let rows = cacheGet(tabelle).filter(row => filter.every(fn => fn(row)));
        if (sortierung) {
          const {feld, auf} = sortierung;
          rows = [...rows].sort((a, b) => String(a[feld] ?? "").localeCompare(String(b[feld] ?? "")) * (auf ? 1 : -1));
        }
        const count = rows.length;
        rows = rows.slice(start, ende);
        return Promise.resolve({ data: gesperrt ? null : einzeln ? rows[0] ?? null : rows, error: gesperrt ? {message:"Designvorschau: Speichern ist gesperrt."} : null, count });
      };
      const chain: any = new Proxy({}, { get: (_, key) => {
        if (key === "then") { const p = result(); return p.then.bind(p); }
        if (key === "catch") { const p = result(); return p.catch.bind(p); }
        if (["insert", "update", "upsert", "delete"].includes(String(key))) return () => { gesperrt = true; return chain; };
        if (key === "single" || key === "maybeSingle") return () => { einzeln = true; return chain; };
        if (key === "eq" || key === "is") return (feld: string, wert: any) => { filter.push(row => row[feld] === wert); return chain; };
        if (key === "neq") return (feld: string, wert: any) => { filter.push(row => row[feld] !== wert); return chain; };
        if (key === "in") return (feld: string, werte: any[]) => { filter.push(row => werte.includes(row[feld])); return chain; };
        if (key === "order") return (feld: string, opts?: {ascending?: boolean}) => { sortierung = {feld, auf: opts?.ascending !== false}; return chain; };
        if (key === "limit") return (n: number) => { ende = n; return chain; };
        if (key === "range") return (a: number, b: number) => { start = a; ende = b + 1; return chain; };
        return () => chain;
      }});
      return chain;
    };
    client.rpc = async () => ({data:null,error:{message:"Designvorschau: Serveraktionen gesperrt."}});
    const daten: Record<string, any[]> = beispielkundeZeilen("studio-user");
    daten.objekte = [{id:"studio-objekt",titel:"Beispielobjekt · Berlin",adresse:"Musterstraße 12",plz:"10317",ort:"Berlin",bild_url:"/images/mikroseite/hauff-fassade.jpg",status:"freigegeben",sichtbar:true,erstellt_am:"2026-09-01",baujahr:1998}];
    daten.wohnungen = [{id:"studio-wohnung",objekt_id:"studio-objekt",einheit_nr:"12",groesse:58,zimmer:2,vk_gesamt:249000,kaltmiete:790,status:"verfuegbar",sichtbar:true}];
    const heute = new Date();
    const gestern = new Date(heute); gestern.setDate(heute.getDate()-1);
    daten.aufgaben = ["Finanzierungsunterlagen prüfen", "Rückruf zur Reservierung", "Objektbesprechung vorbereiten", "Notartermin abstimmen", "Unterlagen vervollständigen", "Übergabe vorbereiten"].map((titel,index) => ({
      id:`studio-aufgabe-${index}`,kontakt_id:BEISPIEL_KONTAKT_ID,titel,typ:index===1?"anruf":"aufgabe",status:"offen",prioritaet:"mittel",faellig_am:heuteAlsString(index===0?gestern:heute),uhrzeit:index===0?"15:00":`${String(10+index).padStart(2,"0")}:30`,benutzer_id:"studio-user",zugewiesen_an:"studio-user",
    }));
    for (const t of tabellen) cacheSet(t, daten[t] || []);
    setBereit(true);
    return () => {
      resetCache();
      client.from = from; client.rpc = rpc; client.channel = channel; entsperren();
      for (const [t, zeilen] of vorher) cacheSet(t, zeilen);
    };
  }, [echt.loading, echt.authUser]);

  if (echt.authUser) return <div className="p-8"><h1 className="text-2xl font-semibold">Du bist bereits angemeldet.</h1><p className="my-4">Nutze das reguläre CRM mit der neuen Gestaltung. Die Beispieldaten werden nicht mit deiner Sitzung vermischt.</p><a href="/?design=liquid&oberflaeche=studio">Zum echten Dashboard →</a></div>;
  if (!bereit) return <p className="p-8">Originalansichten mit Beispieldaten werden vorbereitet …</p>;
  const wechseln = () => {
    const neu = !studio;
    if (neu) document.documentElement.dataset.crmDesign = "studio";
    else delete document.documentElement.dataset.crmDesign;
    sessionStorage.setItem("osimmobilien.studio-vorschau", neu ? "studio" : "bestand");
    setStudio(neu);
  };
  const wert = {...echt, authUser:{id:"studio-user"} as NonNullable<typeof echt.authUser>, isLoggedIn:true,loading:false,user:{...echt.user,name:"Christian · Vorschau",role:"admin" as const}};
  const basis = "/vorschau/crm";
  return <UserContext.Provider value={wert}><div className="studio-vorschau">
    <div className="studio-vergleich">
      <span><strong>Original-CRM · Designvergleich</strong><small>Erfundene Daten · Speichern gesperrt · Weitere Menüs führen zum regulären Login</small></span>
      <nav aria-label="Ansichten im Designvergleich">
        <Link aria-current={location.pathname===basis?"page":undefined} to={basis}>Dashboard</Link>
        <Link aria-current={location.pathname.includes("/kunden/")?"page":undefined} to={`${basis}/kunden/${BEISPIEL_KONTAKT_ID}?tab=investments&investment=beispiel-investment-1`}>Kundenprofil & Investment</Link>
        <Link aria-current={location.pathname.endsWith("/objekte")?"page":undefined} to={`${basis}/objekte`}>Objekte</Link>
      </nav>
      <button onClick={wechseln} aria-pressed={studio}>{studio ? "Studio aktiv · Bestand ansehen" : "Bestand aktiv · Studio ansehen"}</button>
    </div>
    <SidebarProvider><CrmTutorialProvider>
      <div className="flex w-full min-h-0 flex-1">
        <AppSidebar />
        <div data-lg="spalte" className="relative flex-1 min-w-0 flex flex-col">
          <Kopfbereich><HeaderBar /></Kopfbereich>
          <main className="flex-1 px-3 py-6 max-md:pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
            <Routes>
              <Route index element={<Index />} />
              <Route path="kunden/:id" element={<KundenDetail />} />
              <Route path="objekte" element={<Objekte />} />
              <Route path="inbox" element={<Inbox />} />
            </Routes>
          </main>
          {/* Wie im echten Rahmen (DashboardLayout): Tastenkürzel (A8). */}
          <TastenkuerzelEmpfaenger />
        </div>
      </div>
    </CrmTutorialProvider></SidebarProvider>
  </div></UserContext.Provider>;
}
