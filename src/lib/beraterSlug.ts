/**
 * Erzeugt aus einem Namen einen URL-tauglichen Slug.
 * Beispiel: "Timo Blum" → "timo-blum"
 */
export function slugifyName(name: string): string {
  return (name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Akzente entfernen
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
