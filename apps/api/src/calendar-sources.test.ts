import { describe, expect, it } from "vitest";
import { normalizeSourceUrl, publicAddress } from "./calendar-sources";

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
});
