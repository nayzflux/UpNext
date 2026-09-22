import { describe, expect, it, vi } from "vitest";
import { normalizeSourceUrl, pinnedLookup, publicAddress } from "./calendar-sources";

describe("URLs des calendriers ICS", () => {
  it("accepte seulement des URL HTTPS publiques sans identifiants", () => {
    expect(normalizeSourceUrl("https://calendar.example.org/events.ics#fragment"))
      .toBe("https://calendar.example.org/events.ics");
    for (const url of [
      "http://calendar.example.org/events.ics",
      "https://user:password@calendar.example.org/events.ics",
      "https://localhost/events.ics",
      "https://127.0.0.1/events.ics",
      "https://[::1]/events.ics",
      "https://calendar.example.org:8443/events.ics",
    ]) expect(() => normalizeSourceUrl(url)).toThrow();
  });

  it("bloque les plages privées, réservées et les adresses IPv4 mappées", () => {
    for (const address of ["10.2.3.4", "169.254.169.254", "172.16.0.1", "192.168.1.1", "127.0.0.1", "::1", "fe80::1", "fc00::1", "::ffff:127.0.0.1"]) {
      expect(publicAddress(address)).toBe(false);
    }
    expect(publicAddress("8.8.8.8")).toBe(true);
    expect(publicAddress("2606:4700:4700::1111")).toBe(true);
  });

  it("renvoie l'adresse épinglée au format demandé par Node", () => {
    const address = { address: "8.8.8.8", family: 4 };
    const lookup = pinnedLookup(address);
    const callback = vi.fn();
    lookup("calendar.example.org", { all: true }, callback);
    expect(callback).toHaveBeenLastCalledWith(null, [address]);
    lookup("calendar.example.org", { all: false }, callback);
    expect(callback).toHaveBeenLastCalledWith(null, address.address, address.family);
  });
});
