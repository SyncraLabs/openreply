import { describe, it, expect, vi } from "vitest";

vi.mock("../lib/queue/client", () => ({ getRedisConnection: vi.fn() }));

import { isOwnEcho, renderSetterMessages } from "../lib/queue/setter";
import { parseEchoEvents } from "../lib/meta/webhook";

const config = {
  links: { agenda: "https://aioperator.test/agendar?utm_source=instagram", skool: "https://aioperator.test/comunidad" },
  audios: { presentacion: { url: "https://media.test/a1", cuando: "al principio" } },
};
const text = (t: string) => ({ type: "text", text: t });

describe("renderSetterMessages", () => {
  it("fills in link markers and drops empty messages", () => {
    expect(renderSetterMessages(["top", "aquí: {agenda}", "  "], config)).toEqual([
      text("top"),
      text("aquí: https://aioperator.test/agendar?utm_source=instagram"),
    ]);
  });

  it("refuses a marker or a URL that isn't configured", () => {
    expect(renderSetterMessages(["mira {curso}"], config)).toBeNull();
    expect(renderSetterMessages(["mira https://otra.web/x"], config)).toBeNull();
    expect(renderSetterMessages(["{audio:despedida}"], config)).toBeNull();
  });

  it("accepts a configured URL written out, even with trailing punctuation", () => {
    expect(renderSetterMessages(["entra en https://aioperator.test/comunidad."], config)).toEqual([
      text("entra en https://aioperator.test/comunidad."),
    ]);
  });

  it("turns a message that is only an audio marker into that voice note", () => {
    expect(renderSetterMessages(["te mando un audio", "{audio:presentacion}"], config)).toEqual([
      text("te mando un audio"),
      { type: "audio", key: "presentacion", url: "https://media.test/a1" },
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
