import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideReply, formatPhone, type IncomingMessage } from "../src/menu";
import { SERVICES, WELCOME_TEXT, validateContent } from "../src/services";

const FROM = "573001234567";

function msg(partial: Partial<IncomingMessage>): IncomingMessage {
  return { id: "wamid.test", from: FROM, type: "text", ...partial };
}

function assertWelcome(replies: ReturnType<typeof decideReply>, withImage = false) {
  assert.equal(replies.length, 2);
  const [first, second] = replies;
  if (withImage) {
    assert.equal(first.kind, "image");
    assert.equal(first.kind === "image" && first.caption, WELCOME_TEXT);
  } else {
    assert.deepEqual(first, { kind: "text", body: WELCOME_TEXT, previewUrl: true });
  }
  assert.equal(second.kind, "list");
  if (second.kind === "list") {
    assert.equal(second.body, "¿Sobre qué servicio deseas información?");
    assert.equal(second.button, "Ver servicios");
    assert.equal(second.sectionTitle, "Servicios");
    assert.deepEqual(
      second.rows,
      SERVICES.map((s) => ({ id: s.id, title: s.title, description: s.description })),
    );
  }
}

describe("menu", () => {
  it('"Hola" → bienvenida en texto', () => {
    assertWelcome(decideReply(msg({ type: "text" })));
  });

  it("con WELCOME_IMAGE_URL la bienvenida es una imagen con el mismo texto", () => {
    const replies = decideReply(msg({ type: "text" }), { welcomeImageUrl: "https://example.com/logo.png" });
    assertWelcome(replies, true);
    assert.equal(replies[0].kind === "image" && replies[0].link, "https://example.com/logo.png");
  });

  for (const service of SERVICES) {
    it(`list_reply "${service.id}" → detalle con el wa.me correcto`, () => {
      const replies = decideReply(
        msg({ type: "interactive", selectionKind: "list_reply", selectedId: service.id }),
      );
      assert.equal(replies.length, 2);
      const [detail, back] = replies;

      assert.equal(detail.kind, "cta_url");
      if (detail.kind === "cta_url") {
        assert.equal(
          detail.url,
          `https://wa.me/${service.phone}?text=${encodeURIComponent(`Hola, quiero información sobre ${service.title}`)}`,
        );
        assert.equal(detail.displayText, "💬 Abrir WhatsApp");
        assert.ok(detail.displayText.length <= 20);
        assert.ok(detail.body.startsWith(`${service.emoji} *${service.title.toLocaleUpperCase("es-CO")}*\n\n`));
        assert.ok(detail.body.includes(service.description));
        assert.ok(detail.body.includes(`Para más información comunícate con:\n📱 ${formatPhone(service.phone)}`));
      }

      assert.deepEqual(back, {
        kind: "buttons",
        body: "¿Deseas consultar otro servicio?",
        buttons: [{ id: "menu", title: "🔙 Volver al menú" }],
      });
    });
  }

  it("formatea el teléfono", () => {
    assert.equal(formatPhone("573234681856"), "+57 323 468 1856");
  });

  it('button_reply "menu" → bienvenida', () => {
    assertWelcome(decideReply(msg({ type: "interactive", selectionKind: "button_reply", selectedId: "menu" })));
  });

  it("id desconocido → bienvenida", () => {
    assertWelcome(decideReply(msg({ type: "interactive", selectionKind: "list_reply", selectedId: "no_existe" })));
    assertWelcome(decideReply(msg({ type: "interactive", selectionKind: "button_reply", selectedId: "otro" })));
  });

  for (const type of ["image", "audio", "sticker", "location", "reaction", "desconocido"]) {
    it(`tipo "${type}" → bienvenida`, () => {
      assertWelcome(decideReply(msg({ type })));
    });
  }
});

describe("validación de services.ts", () => {
  const base = { id: "x", emoji: "✅", title: "Prueba", description: "Desc", phone: "573001234567" };

  it("acepta el contenido actual", () => {
    assert.doesNotThrow(() => validateContent(SERVICES, WELCOME_TEXT));
  });

  it("rechaza títulos largos, ids repetidos o reservados, teléfonos inválidos y más de 10 servicios", () => {
    assert.throws(() => validateContent([{ ...base, title: "x".repeat(25) }], ""), /título/);
    assert.throws(() => validateContent([{ ...base, description: "x".repeat(73) }], ""), /descripción/);
    assert.throws(() => validateContent([base, base], ""), /repetido/);
    assert.throws(() => validateContent([{ ...base, id: "menu" }], ""), /reservado/);
    assert.throws(() => validateContent([{ ...base, phone: "3001234567" }], ""), /teléfono/);
    assert.throws(() => validateContent([{ ...base, phone: "57 300 123 4567" }], ""), /teléfono/);
    const eleven = Array.from({ length: 11 }, (_, i) => ({ ...base, id: `s${i}` }));
    assert.throws(() => validateContent(eleven, ""), /máximo 10/);
    assert.throws(() => validateContent([base], "x".repeat(1025)), /bienvenida/);
  });
});
