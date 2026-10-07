/**
 * Wer im Exposé als „Dein Ansprechpartner“ steht.
 *
 * Unten im Abschnitt Kontakt und, im Exposé für einen Kunden, ganz oben über
 * den Bildern steht dieselbe Person: der Vertriebspartner. Der Objektpartner
 * erscheint seit dem 23.09.2026 nicht mehr (Christians Vorgabe).
 *
 * Mit Kunde ist das der Partner, der für den Kunden zuständig ist
 * (`kontakte.zustaendig_id`), denn mit ihm spricht der Kunde. Erstellt ein
 * Admin das Exposé für den Kunden eines anderen Partners, steht trotzdem der
 * zuständige Partner darin. Ohne Kunde, ohne Zuständigkeit oder ohne Profil
 * des Zuständigen steht der angemeldete Nutzer da, so wie bisher.
 *
 * Dieselbe Reihenfolge nutzt `get-expose` für den Kundenlink.
 */
import { berufsbezeichnung } from "@/lib/berufsbezeichnung";
import type { Person } from "@/lib/exposeInhalt";

export interface ProfilZeile {
  id: string;
  name?: string | null;
  email?: string | null;
  telefon?: string | null;
  buchungslink?: string | null;
  avatar_url?: string | null;
}

export interface RollenZeile {
  user_id: string;
  role: string;
}

/** Anfangsbuchstaben für das runde Feld, wenn kein Bild hinterlegt ist. */
export function initialen(name: string): string {
  return name.split(/\s+/).filter(Boolean).map((t) => t[0]).slice(0, 2).join("").toUpperCase() || "M";
}

/** Ein Profil als Person für das Exposé; leere Felder bleiben weg. */
export function profilZuPerson(p: ProfilZeile | undefined, rolle: string): Person | undefined {
  if (!p || !p.name?.trim()) return undefined;
  return {
    name: p.name.trim(),
    rolle,
    email: p.email?.trim() || undefined,
    telefon: p.telefon?.trim() || undefined,
    buchungslink: p.buchungslink?.trim() || undefined,
    avatarUrl: p.avatar_url?.trim() || undefined,
  };
}

export interface AnsprechpartnerEingabe {
  /** Zuständiger Partner des Kunden, falls ein Kunde gewählt ist. */
  kundeZustaendigId?: string | null;
  /** Kennung des angemeldeten Nutzers. */
  eigeneId?: string | null;
  /** Der angemeldete Nutzer als Person, der Rückfall. */
  eigenePerson: Person;
  profile: ProfilZeile[];
  rollen: RollenZeile[];
}

export function vertriebspartnerFuerExpose(e: AnsprechpartnerEingabe): Person {
  const id = e.kundeZustaendigId;
  if (!id || id === e.eigeneId) return e.eigenePerson;
  const rollen = e.rollen.filter((r) => r.user_id === id).map((r) => r.role);
  const person = profilZuPerson(e.profile.find((p) => p.id === id), berufsbezeichnung(rollen) || "Dein Ansprechpartner");
  return person ?? e.eigenePerson;
}
