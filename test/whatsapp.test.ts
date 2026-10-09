import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { decideReply } from "../src/menu";
import { DeliveryTracker, createWhatsAppClient } from "../src/whatsapp";
import { extractStatuses } from "../src/webhook";

const CONFIG = { accessToken: "token", phoneNumberId: "123", apiVersion: "v23.0" };
const TO = "573001234567";
const realFetch = globalThis.fetch;

/** Registra cada envío ("image", "text", "list"…) y responde con un id wamid.N. */
function mockFetch(log: string[], failImage = false) {
  let n = 0;
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    const kind: string = body.type === "interactive" ? body.interactive.type : body.type;
    if (failImage && kind === "image") {
      return new Response(JSON.stringify({ error: { code: 131053, message: "x" } }), { status: 400 });
    }
    n += 1;
    log.push(`${kind}:wamid.${n}`);
    return new Response(JSON.stringify({ messages: [{ id: `wamid.${n}` }] }), { status: 200 });
  }) as typeof fetch;
}

const welcome = () => decideReply({ id: "in", from: TO, type: "text" }, { welcomeImageUrl: "https://x/logo.png" });
const tick = () => new Promise((r) => setTimeout(r, 20));

describe("orden de entrega", () => {
  let log: string[];
  beforeEach(() => {
    log = [];
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("no envía el menú hasta que Meta confirma la entrega de la bienvenida", async () => {
    mockFetch(log);
    const tracker = new DeliveryTracker();
    const done = createWhatsAppClient(CONFIG, tracker, 5_000).sendAll(TO, welcome());

    await tick();
    assert.deepEqual(log, ["image:wamid.1"]);
    tracker.notify("wamid.1", "sent"); // "sent" no basta
    await tick();
    assert.deepEqual(log, ["image:wamid.1"]);

    tracker.notify("wamid.1", "delivered");
    await done;
    assert.deepEqual(log, ["image:wamid.1", "list:wamid.2"]);
  });

  it("si la imagen falla después de aceptarse, envía el texto y luego el menú", async () => {
    mockFetch(log);
    const tracker = new DeliveryTracker();
    const done = createWhatsAppClient(CONFIG, tracker, 5_000).sendAll(TO, welcome());

    await tick();
    tracker.notify("wamid.1", "failed");
    await tick();
    assert.deepEqual(log, ["image:wamid.1", "text:wamid.2"]);
    tracker.notify("wamid.2", "delivered");
    await done;
    assert.deepEqual(log, ["image:wamid.1", "text:wamid.2", "list:wamid.3"]);
  });

  it("si Meta rechaza la imagen al enviarla, envía el texto como respaldo", async () => {
    mockFetch(log, true);
    const tracker = new DeliveryTracker();
    tracker.notify("wamid.1", "delivered"); // el texto ya entregado (llegó antes de esperarlo)
    await createWhatsAppClient(CONFIG, tracker, 5_000).sendAll(TO, welcome());
    assert.deepEqual(log, ["text:wamid.1", "list:wamid.2"]);
  });

  it("si no llega confirmación, envía el menú al cumplirse el tiempo máximo", async () => {
    mockFetch(log);
    await createWhatsAppClient(CONFIG, new DeliveryTracker(), 50).sendAll(TO, welcome());
    assert.deepEqual(log, ["image:wamid.1", "list:wamid.2"]);
  });

  it("envía a un número con \"to\" y a un identificador de usuario con \"recipient\"", async () => {
    const bodies: Record<string, unknown>[] = [];
    globalThis.fetch = (async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ messages: [{ id: "wamid.x" }] }), { status: 200 });
    }) as typeof fetch;
    const client = createWhatsAppClient(CONFIG, new DeliveryTracker(), 50);
    await client.sendAll(TO, [{ kind: "text", body: "a", previewUrl: false }]);
    await client.sendAll("CO.1234567890", [{ kind: "text", body: "b", previewUrl: false }]);
    assert.equal(bodies[0].to, TO);
    assert.equal(bodies[0].recipient, undefined);
    assert.equal(bodies[1].recipient, "CO.1234567890");
    assert.equal(bodies[1].to, undefined);
  });

  it("extrae los estados del webhook", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  { id: "wamid.1", status: "delivered", recipient_id: TO },
                  { id: "wamid.2", status: "failed", errors: [{ code: 131053, title: "Media upload error" }] },
                  { status: "read" },
                ],
              },
            },
          ],
        },
      ],
    };
    assert.deepEqual(extractStatuses(payload), [
      { id: "wamid.1", status: "delivered" },
      { id: "wamid.2", status: "failed", errorCode: 131053, errorTitle: "Media upload error" },
    ]);
  });
});
