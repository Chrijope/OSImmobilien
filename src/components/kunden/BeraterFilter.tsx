import { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { loadAllUsers } from "@/lib/loadAllUsers";
import { resolveKontaktBerater } from "@/lib/kontaktOwnership";
import type { KundeData } from "@/lib/kundenStore";
import { tarnName } from "@/lib/vorfuehrmodus";

interface Props {
  value: string;
  onChange: (v: string) => void;
  kontakte: KundeData[];
  liveVersion?: number;
  className?: string;
}

/**
 * Admin-only Vertriebspartner filter (Select).
 * Werte: "-" (alle), "__none__" (ohne VP), oder konkreter VP-Name.
 * Liste vereint VP-Namen aus den übergebenen Kontakten mit allen aktiven VP-Profilen.
 */
export function BeraterFilter({ value, onChange, kontakte, liveVersion, className }: Props) {
  const allUsers = useMemo(() => {
    try {
      return loadAllUsers().filter(u => u.name && u.name.trim()).sort((a, b) => a.name.localeCompare(b.name));
    } catch { return []; }
  }, [liveVersion]);

  const beraterListe = useMemo(() => {
    const set = new Set<string>();
    for (const k of kontakte) {
      const name = resolveKontaktBerater(k, allUsers);
      if (name) set.add(name);
    }
    for (const u of allUsers) {
      const rollen = u.rollen || (u.rolle ? [u.rolle] : []);
      if (rollen.some(r => ["vertriebspartner", "vertriebsleiter", "juniorpartner"].includes(r))) {
        if (u.name?.trim()) set.add(u.name.trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [kontakte, allUsers]);

  return (
    <div className={`flex items-center gap-2 ${className || ""}`}>
      <span className="text-sm text-muted-foreground">Vertriebspartner:</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-48 h-8"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="-">Alle Vertriebspartner</SelectItem>
          <SelectItem value="__none__">Ohne Vertriebspartner</SelectItem>
          {beraterListe.map(b => (
            <SelectItem key={b} value={b}>{tarnName(b, "partner")}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Filter-Helper. Gibt true zurück, wenn der Kontakt zum gewählten VP passt.
 */
export function matchesBeraterFilter(k: KundeData, value: string): boolean {
  if (value === "-") return true;
  const name = resolveKontaktBerater(k);
  if (value === "__none__") return !name;
  return name === value;
}