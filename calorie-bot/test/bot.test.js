import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import bot, { verifySignature, formatReply } from "../src/index.js";

const secret = "shh";
const sign = (body) => createHmac("sha256", secret).update(body).digest("base64");

test("verifySignature accepts a valid signature and rejects others", async () => {
  assert.equal(await verifySignature("{}", sign("{}"), secret), true);
  assert.equal(await verifySignature("{}", sign("{x}"), secret), false);
  assert.equal(await verifySignature("{}", null, secret), false);
});

test("formatReply totals the items", () => {
  const out = formatReply({
    is_food: true,
    confidence: "medium",
    note: "oil unknown",
    items: [
      { name: "Rice", portion: "1 cup", calories: 200, protein_g: 4, carbs_g: 44, fat_g: 0.5 },
      { name: "Egg", portion: "1", calories: 90, protein_g: 6, carbs_g: 1, fat_g: 7 },
    ],
  });
  assert.match(out, /Total: 290 kcal/);
  assert.match(out, /Protein 10g · Carbs 45g · Fat 8g/);
});

test("formatReply handles non-food", () => {
  assert.match(formatReply({ is_food: false, items: [] }), /couldn't find any food/);
});

test("webhook rejects bad signature and acks good one", async () => {
  const env = { LINE_CHANNEL_SECRET: secret };
  const ctx = { waitUntil() {} };
  const body = JSON.stringify({ events: [] });
  const bad = await bot.fetch(new Request("http://x", { method: "POST", body, headers: { "x-line-signature": "nope" } }), env, ctx);
  assert.equal(bad.status, 401);
  const good = await bot.fetch(new Request("http://x", { method: "POST", body, headers: { "x-line-signature": sign(body) } }), env, ctx);
  assert.equal(good.status, 200);
});
