import assert from "node:assert/strict";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import express from "express";
import type { IncomingMessage } from "../src/menu";
import { MessageDeduplicator, createWebhookRouter, extractMessages, isValidSignature } from "../src/webhook";

const SECRET = "app-secret-de-prueba";

function sign(body: string | Buffer, secret = SECRET): string {
  return `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("isValidSignature", () => {
  const body = Buffer.from(JSON.stringify({ object: "whatsapp_business_account", entry: [] }));

  it("acepta una firma válida", () => {
    assert.equal(isValidSignature(body, sign(body), SECRET), true);
  });

  it("rechaza una firma inválida", () => {
    assert.equal(isValidSignature(body, sign(body, "otro-secreto"), SECRET), false);
    assert.equal(isValidSignature(Buffer.from("{}"), sign(body), SECRET), false);
    assert.equal(isValidSignature(body, "sha256=abcd", SECRET), false);
    assert.equal(isValidSignature(body, sign(body).replace("sha256=", "sha1="), SECRET), false);
  });

  it("rechaza una firma ausente", () => {
    assert.equal(isValidSignature(body, undefined, SECRET), false);
    assert.equal(isValidSignature(body, "", SECRET), false);
  });
});

describe("POST /webhook", () => {
  const received: IncomingMessage[] = [];
  let baseUrl = "";
  let close: () => void;

  before(async () => {
    const app = express();
    app.use(
      createWebhookRouter({
        verifyToken: "verify-de-prueba",
        appSecret: SECRET,
        onMessage: async (m) => {
          received.push(m);
        },
      }),
    );
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => server.close();
  });

  after(() => close());

  const payload = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                { id: "wamid.1", from: "573001234567", type: "text", text: { body: "Hola" } },
                {
                  id: "wamid.2",
                  from: "573001234567",
                  type: "interactive",
                  interactive: { type: "list_reply", list_reply: { id: "holter_mapa", title: "Holter y MAPA" } },
                },
              ],
              statuses: [{ id: "wamid.x", status: "delivered" }],
            },
          },
        ],
      },
    ],
  });

  function post(body: string, signature?: string) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (signature !== undefined) headers["X-Hub-Signature-256"] = signature;
    return fetch(`${baseUrl}/webhook`, { method: "POST", headers, body });
  }

  it("responde 401 sin firma", async () => {
    assert.equal((await post(payload)).status, 401);
  });

  it("responde 401 con firma inválida", async () => {
    assert.equal((await post(payload, sign(payload, "otro"))).status, 401);
  });

  it("responde 200 con firma válida, procesa los mensajes y deduplica", async () => {
    assert.equal((await post(payload, sign(payload))).status, 200);
    assert.equal((await post(payload, sign(payload))).status, 200); // reintento de Meta
    await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(
      received.map((m) => [m.id, m.selectionKind, m.selectedId]),
      [
        ["wamid.1", undefined, undefined],
        ["wamid.2", "list_reply", "holter_mapa"],
      ],
    );
  });

  it("no se cae con un JSON inesperado", async () => {
    for (const body of ['{"entry":"x"}', "[1,2]", '{"entry":[{"changes":[{"value":{"messages":[null,{}]}}]}]}']) {
      assert.equal((await post(body, sign(body))).status, 200);
    }
    const bad = "no-es-json";
    assert.equal((await post(bad, sign(bad))).status, 200);
  });

  it("GET /webhook verifica el token", async () => {
    const ok = await fetch(`${baseUrl}/webhook?hub.mode=subscribe&hub.verify_token=verify-de-prueba&hub.challenge=123`);
    assert.equal(ok.status, 200);
    assert.equal(await ok.text(), "123");
    const bad = await fetch(`${baseUrl}/webhook?hub.mode=subscribe&hub.verify_token=malo&hub.challenge=123`);
    assert.equal(bad.status, 403);
  });
});

describe("extractMessages y deduplicación", () => {
  it("ignora statuses", () => {
    assert.deepEqual(extractMessages({ entry: [{ changes: [{ value: { statuses: [{ id: "x" }] } }] }] }), []);
  });

  it("acepta mensajes sin número usando from_user_id (usuarios con nombre de usuario)", () => {
    const payload = {
      entry: [{ changes: [{ value: { messages: [{ id: "wamid.1", from_user_id: "CO.1234567890", type: "text" }] } }] }],
    };
    assert.deepEqual(extractMessages(payload), [{ id: "wamid.1", from: "CO.1234567890", type: "text" }]);
  });

  it("elimina los ids más antiguos al superar el límite", () => {
    const dedup = new MessageDeduplicator(3);
    for (const id of ["a", "b", "c", "d"]) assert.equal(dedup.isNew(id), true);
    assert.equal(dedup.isNew("d"), false);
    assert.equal(dedup.isNew("a"), true); // "a" fue descartado
  });
});
