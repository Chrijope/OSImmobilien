import { rollenLabel } from "@/lib/rollenLabel";

/**
 * „Sichtbar für“ an einer Karte aus „Neu im CRM“. Nur bei aktiver Rolle Admin,
 * damit dort nachvollziehbar ist, wer einen Eintrag sieht. Maßgeblich ist die
 * gewählte Rolle, nicht die Person.
 */
export function NotizZielrollen({ zielrollen, aktiveRolle }: { zielrollen: string[]; aktiveRolle: string }) {
  if (aktiveRolle !== "admin") return null;
  const text = zielrollen.includes("alle")
    ? "Alle Rollen"
    : zielrollen.map((r) => rollenLabel(r)).join(", ");
  if (!text) return null;
  return <span data-pruefung="notiz-zielrollen"> · Sichtbar für: {text}</span>;
}
