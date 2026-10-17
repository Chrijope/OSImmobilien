import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { cacheGet, cacheSet } from "@/lib/dataCache";
import { UserContext, useUser } from "@/contexts/UserContext";
import { BEISPIEL_INVESTMENT_ID, BEISPIEL_KONTAKT_ID, beispielkundeZeilen } from "@/lib/beispielkunde";
import KundenDetail from "./KundenDetail";

/*
 * Lokale Vorschau „Beispielkunde mit komplett befülltem Investment“
 * (16.10.2026): /vorschau/kunde-komplett. Nur im Entwicklungsmodus (siehe
 * vorschauRouten.ts).
 *
 * Zeigt das echte Kundenprofil mit erfundenen Daten. Nichts davon geht in die
 * Datenbank:
 *   - Die Zeilen liegen nur im Arbeitsspeicher dieses Tabs (cacheSet).
 *   - Ihre Kennungen haben kein UUID-Format, jede Datenbankabfrage damit
 *     scheitert sofort.
 *   - Solange die Seite offen ist, sind alle Schreibwege des Supabase-Clients
 *     gesperrt (insert, update, upsert, delete, Edge Functions, Speicher). Das
 *     gilt auch, wenn im selben Browser jemand angemeldet ist.
 * Neu laden oder Seite verlassen, und der Beispielkunde ist wieder weg.
 */

const GESPERRT = { data: null, error: { message: "Vorschau: Schreiben in die Datenbank ist gesperrt." } };

/** Sperrt die Schreibwege des Clients und gibt eine Funktion zum Aufheben zurück. */
export function schreibenSperren(): () => void {
  const client = supabase as any;
  const altFrom = client.from.bind(client);
  const altInvoke = client.functions.invoke.bind(client.functions);
  const altStorageFrom = client.storage.from.bind(client.storage);
  const abgelehnt = () => {
    console.warn("[Vorschau] Schreibzugriff abgefangen");
    const p: any = Promise.resolve(GESPERRT);
    // Verkettungen wie .eq().select().single() laufen ins Leere.
    return new Proxy(p, { get: (ziel, name) => (name in ziel ? (ziel as any)[name].bind(ziel) : () => abgelehnt()) });
  };
  client.from = (tabelle: string) => {
    const q = altFrom(tabelle);
    for (const art of ["insert", "update", "upsert", "delete"]) q[art] = abgelehnt;
    return q;
  };
  client.functions.invoke = async () => GESPERRT;
  client.storage.from = (eimer: string) => {
    const s = altStorageFrom(eimer);
    for (const art of ["upload", "update", "remove", "move", "copy"]) s[art] = async () => GESPERRT;
    return s;
  };
  return () => {
    client.from = altFrom;
    client.functions.invoke = altInvoke;
    client.storage.from = altStorageFrom;
  };
}

/** Die Zeilen in den Zwischenspeicher legen, vorhandene Zeilen bleiben stehen. */
export function beispielEinspielen(nutzerId: string) {
  for (const [tabelle, zeilen] of Object.entries(beispielkundeZeilen(nutzerId))) {
    const ids = new Set(zeilen.map((z: { id: string }) => z.id));
    cacheSet(tabelle, [...cacheGet(tabelle).filter((z: { id: string }) => !ids.has(z.id)), ...zeilen]);
  }
}

export default function VorschauKundeKomplett() {
  const { id } = useParams();
  const echt = useUser();
  // Ohne Anmeldung ein fester Admin, damit alle Abschnitte sichtbar sind.
  // Rechte gibt das keine: Gelesen wird nur der Zwischenspeicher, geschrieben gar nicht.
  const nutzerId = echt.authUser?.id || "beispiel-vorschau-admin";
  const [bereit, setBereit] = useState(false);

  useEffect(() => {
    const aufheben = schreibenSperren();
    beispielEinspielen(nutzerId);
    setBereit(true);
    return aufheben;
  }, [nutzerId]);

  if (!id) return <Navigate to={`/vorschau/kunde-komplett/${BEISPIEL_KONTAKT_ID}?tab=inv-${BEISPIEL_INVESTMENT_ID}`} replace />;
  if (!bereit) return null;

  const wert = echt.authUser
    ? echt
    : { ...echt, isLoggedIn: true, loading: false, user: { ...echt.user, name: "Vorschau (Admin)", role: "admin" as const } };

  return (
    <UserContext.Provider value={wert}>
      <div className="bg-amber-100 text-amber-900 text-xs px-4 py-2 text-center">
        Vorschau mit erfundenen Daten. Max Mustermann ist kein echter Kunde, nichts wird gespeichert.
      </div>
      <KundenDetail />
    </UserContext.Provider>
  );
}
