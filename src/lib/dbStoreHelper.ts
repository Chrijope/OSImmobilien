/**
 * Central helper for DB-backed stores.
 * - Normal roles: read/write from Supabase
 * - Testaccount: read/write from localStorage only
 */
import { supabase } from "@/integrations/supabase/client";

function getCurrentRole(): string {
  try {
    return localStorage.getItem("mi_current_role") || "";
  } catch { return ""; }
}

export function isTestAccount(): boolean {
  return getCurrentRole() === "testaccount";
}

/** Generic localStorage fallback for testaccount */
export function localGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

export function localSet<T>(key: string, data: T): void {
  localStorage.setItem(key, JSON.stringify(data));
}

// Use any-typed client to allow dynamic table names
const db = supabase as any;

/**
 * Hard guard: blocks any direct DB write when the active role is "testaccount".
 * Testaccounts must NEVER mutate live data — they use localStorage only.
 */
function blockTestWrite(op: string, table: string): boolean {
  if (!isTestAccount()) return false;
  console.warn(`[Testaccount] ${op} on '${table}' blocked — keine Live-DB-Schreibvorgänge im Testmodus.`);
  return true;
}

/** Supabase query helper - returns data or empty array */
export async function dbSelect<T = any>(table: string, options?: {
  eq?: Record<string, any>;
  order?: { column: string; ascending?: boolean };
}): Promise<T[]> {
  let query = db.from(table).select("*");
  if (options?.eq) {
    Object.entries(options.eq).forEach(([col, val]) => {
      query = query.eq(col, val);
    });
  }
  if (options?.order) {
    query = query.order(options.order.column, { ascending: options.order.ascending ?? true });
  }
  const { data, error } = await query;
  if (error) { console.error(`dbSelect ${table}:`, error); return []; }
  return (data || []) as T[];
}

export async function dbInsert(table: string, row: Record<string, any>) {
  if (blockTestWrite("INSERT", table)) return null;
  const { data, error } = await db.from(table).insert(row).select().single();
  if (error) { console.error(`dbInsert ${table}:`, error); return null; }
  return data;
}

export async function dbUpdate(table: string, id: string, updates: Record<string, any>) {
  if (blockTestWrite("UPDATE", table)) return false;
  const { error } = await db.from(table).update(updates).eq("id", id);
  if (error) { console.error(`dbUpdate ${table}:`, error); return false; }
  return true;
}

export async function dbDelete(table: string, id: string) {
  if (blockTestWrite("DELETE", table)) return false;
  const { error } = await db.from(table).delete().eq("id", id);
  if (error) { console.error(`dbDelete ${table}:`, error); return false; }
  return true;
}

export async function dbUpsert(table: string, row: Record<string, any>) {
  if (blockTestWrite("UPSERT", table)) return null;
  const { data, error } = await db.from(table).upsert(row).select().single();
  if (error) { console.error(`dbUpsert ${table}:`, error); return null; }
  return data;
}
