import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const holeListe = vi.fn();
const holeIp = vi.fn();

vi.mock("@/lib/ipAllowlist", async (original) => {
  const echt = await original<typeof import("@/lib/ipAllowlist")>();
  return { ...echt, loadIpAllowlist: () => holeListe(), fetchClientIp: () => holeIp(), saveIpAllowlist: vi.fn() };
});
vi.mock("@/lib/auditLog", () => ({ logAudit: vi.fn() }));

import IpAllowlistManager from "./IpAllowlistManager";

describe("Einstellungsseite der IP-Freigabe (DS-003)", () => {
  beforeEach(() => {
    holeListe.mockReset();
    holeIp.mockReset();
  });

  it("fragt bei ausgeschalteter Liste keine IP ab und bietet den Knopf an", async () => {
    holeListe.mockResolvedValue({ enabled: false, ips: [], notes: "" });
    render(<IpAllowlistManager />);
    expect(await screen.findByRole("button", { name: /Meine IP ermitteln/ })).toBeInTheDocument();
    expect(holeIp).not.toHaveBeenCalled();
  });

  it("fragt erst auf Klick ab", async () => {
    holeListe.mockResolvedValue({ enabled: false, ips: [], notes: "" });
    holeIp.mockResolvedValue("82.135.12.34");
    render(<IpAllowlistManager />);
    fireEvent.click(await screen.findByRole("button", { name: /Meine IP ermitteln/ }));
    expect(await screen.findByRole("button", { name: "Meine IP: 82.135.12.34" })).toBeInTheDocument();
    expect(holeIp).toHaveBeenCalledTimes(1);
  });

  it("fragt bei eingeschalteter Liste gleich ab", async () => {
    holeListe.mockResolvedValue({ enabled: true, ips: ["82.135.12.*"], notes: "" });
    holeIp.mockResolvedValue("82.135.12.34");
    render(<IpAllowlistManager />);
    expect(await screen.findByRole("button", { name: "Meine IP: 82.135.12.34" })).toBeInTheDocument();
    expect(holeIp).toHaveBeenCalledTimes(1);
  });
});
