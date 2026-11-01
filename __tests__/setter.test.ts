import { describe, it, expect, vi } from "vitest";

vi.mock("../lib/queue/client", () => ({ getRedisConnection: vi.fn() }));

import { isOwnEcho, renderSetterMessages } from "../lib/queue/setter";
import { parseEchoEvents } from "../lib/meta/webhook";

const links = { agenda: "https://aioperator.test/agendar?utm_source=instagram", skool: "https://aioperator.test/comunidad" };

describe("renderSetterMessages", () => {
  it("fills in link markers and drops empty messages", () => {
    expect(renderSetterMessages(["top", "aquí: {agenda}", "  "], links)).toEqual([
      "top",
      "aquí: https://aioperator.test/agendar?utm_source=instagram",
    ]);
  });

  it("refuses a marker or a URL that isn't configured", () => {
    expect(renderSetterMessages(["mira {curso}"], links)).toBeNull();
    expect(renderSetterMessages(["mira https://otra.web/x"], links)).toBeNull();
  });

  it("accepts a configured URL written out, even with trailing punctuation", () => {
    expect(renderSetterMessages(["entra en https://aioperator.test/comunidad."], links)).toEqual([
      "entra en https://aioperator.test/comunidad.",
    ]);
  });
});

describe("isOwnEcho", () => {
  const turns = [{ from: "tu" as const, text: "vale te entiendo\n\ny tú a qué te dedicas??", at: 1 }];
  it("matches what we sent, ignoring spacing and case", () => {
    expect(isOwnEcho(turns, "Vale te entiendo y tú a qué te dedicas??")).toBe(true);
  });
  it("doesn't match something the owner typed", () => {
    expect(isOwnEcho(turns, "oye te mando un audio")).toBe(false);
  });
});

describe("parseEchoEvents", () => {
  it("reads the account's own messages, with the person as recipient", () => {
    const events = parseEchoEvents({
      object: "instagram",
      entry: [
        {
          id: "acct",
          messaging: [
            { sender: { id: "acct" }, recipient: { id: "u1" }, message: { mid: "m1", text: " hola ", is_echo: true } },
            { sender: { id: "u1" }, recipient: { id: "acct" }, message: { mid: "m2", text: "sii" } },
          ],
        },
      ],
    } as Parameters<typeof parseEchoEvents>[0]);
    expect(events).toEqual([{ instagramAccountId: "acct", userId: "u1", text: "hola" }]);
  });
});
