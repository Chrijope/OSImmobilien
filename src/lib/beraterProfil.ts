import { getProfilePic } from "@/lib/chatStore";
import { getUserSetting } from "@/lib/userSettingsCache";
import { ansprechpartnerAdresse, eigeneAdresseAusCache } from "@/lib/ansprechpartnerAdresse";
import { cacheGet } from "@/lib/dataCache";
import { getCurrentUserId } from "@/lib/currentUser";
import { berufsbezeichnung, BERUF_IMMOBILIENBERATER } from "@/lib/berufsbezeichnung";

/** Das Profilbild aus `profiles`, der verlaesslichsten Quelle. */
function avatarAusProfil(): string | null {
  try {
    const id = getCurrentUserId();
    if (!id) return null;
    const zeilen = cacheGet("profiles") as Array<{ id?: string; avatar_url?: string | null }>;
    const eigenes = zeilen.find((z) => z.id === id);
    return eigenes?.avatar_url || null;
  } catch {
    return null;
  }
}

/**
 * Die Berufsbezeichnung des angemeldeten Nutzers.
 *
 * Gelesen wird die Rolle aus dem Zwischenspeicher, nicht der Anzeigename:
 * Das Positionsfeld in den Einstellungen wurde jahrelang maschinell mit der
 * Rollenkennung gefuellt, in gespeicherten Daten steht dort also weiterhin
 * "Admin". Die Zuordnung in `berufsbezeichnung.ts` entscheidet, das
 * Positionsfeld gilt nur, wenn dort wirklich etwas Eigenes steht.
 */
export function eigeneBerufsbezeichnung(position?: string | null): string {
  let rollen: string[] = [];
  try {
    const id = getCurrentUserId();
    if (id) {
      rollen = (cacheGet("user_roles") as Array<{ user_id?: string; role?: string }>)
        .filter((z) => z.user_id === id)
        .map((z) => String(z.role || ""))
        .filter(Boolean);
    }
  } catch {
    // Ohne Rollen entscheidet allein das Positionsfeld.
  }
  return berufsbezeichnung(rollen, position);
}

export interface BeraterProfile {
  name: string;
  position?: string;
  telefon?: string;
  email?: string;
  bild?: string | null;
  buchungslink?: string;
}

/** Fällt auf die Profildaten des eingeloggten Beraters zurück, wenn nichts übergeben wird. */
export function ladeBerater(berater?: BeraterProfile): BeraterProfile {
  if (berater) return berater;
  const profil = getUserSetting<Record<string, string> | null>("profil", null);
  const emailSettings = getUserSetting<Record<string, string> | null>("email", null);
  return {
    name: profil ? `${profil.vorname} ${profil.nachname}` : "Dein Ansprechpartner",
    // Die Berufsbezeichnung, nie die technische Rolle. Der Wert wandert von
    // hier in den Warteraum, auf die Mikroseite und in die Rechner, also
    // ueberall dorthin, wo ein Kunde ihn liest.
    position: eigeneBerufsbezeichnung(profil?.position) || BERUF_IMMOBILIENBERATER,
    telefon: profil?.telefon,
    // Zuerst die Adresse aus den Einstellungen, erst danach die der Signatur.
    email: ansprechpartnerAdresse({
      einstellungen: eigeneAdresseAusCache(),
      signatur: emailSettings?.absenderEmail || profil?.email,
    }),
    // Zuerst das Bild aus der Profiltabelle, erst dann das aus den
    // Einstellungen. Grund: `getProfilePic` greift am Ende auf einen Wert im
    // Browserspeicher zurueck, den es auf einem frisch angemeldeten Geraet
    // noch nicht gibt. Der Kunde saehe im Warteraum dann einen leeren Platz,
    // obwohl ein Foto hinterlegt ist.
    bild: avatarAusProfil() ?? getProfilePic(),
    buchungslink: profil?.buchungslink,
  };
}
