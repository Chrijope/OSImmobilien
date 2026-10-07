import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, X } from "lucide-react";
import { loadAllUsers } from "@/lib/loadAllUsers";
import { rollenLabel } from "@/lib/rollenLabel";

interface BeraterSearchSelectProps {
  value: string;
  /**
   * Gibt neben dem Namen die Kennung des gewaehlten Nutzers mit. Zwei Nutzer
   * koennen gleich heissen, zugeordnet wird deshalb ueber die Kennung.
   */
  onChange: (value: string, id?: string) => void;
  /** If set, only show users with this role (no role filter chips shown) */
  filterByRole?: string;
}

export function BeraterSearchSelect({ value, onChange, filterByRole }: BeraterSearchSelectProps) {
  const allUsers = useMemo(() => {
    const users = loadAllUsers();
    if (!filterByRole) return users;
    return users.filter(u => {
      const rollen = u.rollen && u.rollen.length > 0 ? u.rollen : (u.rolle ? [u.rolle] : []);
      return rollen.includes(filterByRole);
    });
  }, [filterByRole]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string | null>(null);

  // Get unique roles
  const availableRoles = useMemo(() => {
    const roles = new Set(allUsers.map(u => u.rolle).filter(Boolean));
    return Array.from(roles).sort();
  }, [allUsers]);

  const filtered = useMemo(() => {
    let list = allUsers;
    if (roleFilter) {
      list = list.filter(u => u.rolle === roleFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(u => u.name.toLowerCase().includes(q));
    }
    return list;
  }, [allUsers, search, roleFilter]);

  return (
    <div className="space-y-2">
      {/* Selected value */}
      {value && (
        <div className="flex items-center gap-2 p-2 bg-primary/5 rounded-lg border border-primary/20">
          <span className="text-sm font-medium flex-1">{value}</span>
          <button onClick={() => onChange("")} className="text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          className="h-8 pl-8 text-sm"
          placeholder="Nutzer suchen..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Role filter chips */}
      {!filterByRole && availableRoles.length > 1 && (
        <div className="flex flex-wrap gap-1">
          <Badge
            variant={roleFilter === null ? "default" : "outline"}
            className="text-[10px] cursor-pointer"
            onClick={() => setRoleFilter(null)}
          >
            Alle
          </Badge>
          {availableRoles.map(role => (
            <Badge
              key={role}
              variant={roleFilter === role ? "default" : "outline"}
              className="text-[10px] cursor-pointer"
              onClick={() => setRoleFilter(roleFilter === role ? null : role)}
            >
              {rollenLabel(role || "")}
            </Badge>
          ))}
        </div>
      )}

      {/* User list */}
      <div className="max-h-48 overflow-y-auto border rounded-lg divide-y">
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground p-3 text-center">Keine Nutzer gefunden</p>
        )}
        {filtered.map(u => {
          const rollen = u.rollen && u.rollen.length > 0 ? u.rollen : (u.rolle ? [u.rolle] : []);
          const priority = ["inhaber", "admin", "vertriebspartner", "setter", "objektpartner", "versicherungsexperte", "tippgeber", "kunde"];
          const displayRole = priority.find(r => rollen.includes(r)) || u.rolle;
          return (
          <button
            key={u.id}
            type="button"
            className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors flex items-center justify-between ${value === u.name ? "bg-primary/10 font-medium" : ""}`}
            onClick={() => onChange(u.name, u.id)}
          >
            <span>{u.name}</span>
            {displayRole && (
              <span className="text-[10px] text-muted-foreground">{rollenLabel(displayRole, u.rollenVariante)}</span>
            )}
          </button>
          );
        })}
      </div>
    </div>
  );
}
