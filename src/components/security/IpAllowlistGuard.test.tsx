import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const holeListe = vi.fn();
const holeIp = vi.fn();
let rolle = "admin";

vi.mock("@/lib/ipAllowlist", async (original) => {
  const echt = await original<typeof import("@/lib/ipAllowlist")>();
  return { ...echt, loadIpAllowlist: () => holeListe(), fetchClientIp: () => holeIp() };
});
vi.mock("@/contexts/UserContext", () => ({ useUser: () => ({ user: { role: rolle } }) }));
vi.mock("@/lib/auditLog", () => ({ logAudit: vi.fn() }));

import IpAllowlistGuard from "./IpAllowlistGuard";
import { brauchtClientIp } from "@/lib/ipAllowlist";

describe("IP-Freigabeliste und die Abfrage bei api.ipify.org (Datenschutz, Punkt 13)", () => {
  beforeEach(() => {
    holeListe.mockReset();
    holeIp.mockReset();
    rolle = "admin";
  });

  it("braucht die eigene IP nur bei eingeschalteter Liste mit Einträgen", () => {
    expect(brauchtClientIp({ enabled: false, ips: ["1.2.3.4"] })).toBe(false);
    expect(brauchtClientIp({ enabled: true, ips: [] })).toBe(false);
    expect(brauchtClientIp({ enabled: true, ips: ["  "] })).toBe(false);
    expect(brauchtClientIp({ enabled: true, ips: ["1.2.3.*"] })).toBe(true);
  });

  it("fragt die IP bei ausgeschalteter Liste gar nicht ab und lässt durch", async () => {
    holeListe.mockResolvedValue({ enabled: false, ips: ["1.2.3.4"], notes: "" });
    render(<IpAllowlistGuard><p>Inhalt</p></IpAllowlistGuard>);
    expect(await screen.findByText("Inhalt")).toBeInTheDocument();
    expect(holeIp).not.toHaveBeenCalled();
  });

  it("fragt bei eingeschalteter Liste ab und sperrt eine fremde IP", async () => {
    holeListe.mockResolvedValue({ enabled: true, ips: ["1.2.3.4"], notes: "" });
    holeIp.mockResolvedValue("9.9.9.9");
    render(<IpAllowlistGuard><p>Inhalt</p></IpAllowlistGuard>);
    expect(await screen.findByText("Zugriff blockiert")).toBeInTheDocument();
    expect(holeIp).toHaveBeenCalledTimes(1);
  });

  it("fragt für Inhaber nie ab, sie kommen immer durch", async () => {
    rolle = "inhaber";
    holeListe.mockResolvedValue({ enabled: true, ips: ["1.2.3.4"], notes: "" });
    render(<IpAllowlistGuard><p>Inhalt</p></IpAllowlistGuard>);
    expect(await screen.findByText("Inhalt")).toBeInTheDocument();
    expect(holeIp).not.toHaveBeenCalled();
  });
});
