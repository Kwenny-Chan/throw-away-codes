// LINE calorie bot: send a food photo (or describe a meal), get calories + macros back.
// Runs on Cloudflare Workers (free tier). Vision/estimation by Gemini (free tier).

const LINE_REPLY_URL = "https://api.line.me/v2/bot/message/reply";
const LINE_CONTENT_URL = (id) => `https://api-data.line.me/v2/bot/message/${id}/content`;
const GEMINI_URL = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

const NUM = { type: "NUMBER" };
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    is_food: { type: "BOOLEAN" },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          portion: { type: "STRING" },
          calories: NUM,
          protein_g: NUM,
          carbs_g: NUM,
          fat_g: NUM,
        },
        required: ["name", "portion", "calories", "protein_g", "carbs_g", "fat_g"],
      },
    },
    confidence: { type: "STRING", enum: ["low", "medium", "high"] },
    note: { type: "STRING" },
  },
  required: ["is_food", "items", "confidence", "note"],
};

const buildPrompt = (lang, userText) =>
  [
    "You are a nutrition estimator. Identify every food and drink in the input and estimate",
    "portion size, calories (kcal) and macros (grams) for each item.",
    "Use typical serving sizes for the cuisine shown (Thai dishes included).",
    "If the input is not food, set is_food to false and items to [].",
    "In `note`, mention the biggest uncertainty (portion, hidden oil/sugar, etc.) in one short sentence.",
    `Write names, portions and note in ${lang}.`,
    userText ? `The user says: "${userText}"` : "",
  ]
    .filter(Boolean)
    .join(" ");

export async function verifySignature(body, signature, secret) {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export async function estimate(env, { imageBase64, mimeType, text }) {
  const parts = [{ text: buildPrompt(env.REPLY_LANG || "Thai", text) }];
  if (imageBase64) parts.push({ inline_data: { mime_type: mimeType, data: imageBase64 } });

  const res = await fetch(GEMINI_URL(env.GEMINI_MODEL || "gemini-2.5-flash"), {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.2,
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw new Error("Gemini returned no content");
  return JSON.parse(raw);
}

const round = (n) => Math.round(Number(n) || 0);

export function formatReply(result) {
  if (!result.is_food || !result.items.length) {
    return "🍽️ I couldn't find any food in that. Try a clearer photo, or describe the meal in text.";
  }
  const lines = result.items.map(
    (i) =>
      `• ${i.name} (${i.portion})\n  ${round(i.calories)} kcal | P ${round(i.protein_g)}g · C ${round(i.carbs_g)}g · F ${round(i.fat_g)}g`,
  );
  const sum = (k) => result.items.reduce((s, i) => s + (Number(i[k]) || 0), 0);
  const total =
    `🔥 Total: ${round(sum("calories"))} kcal\n` +
    `Protein ${round(sum("protein_g"))}g · Carbs ${round(sum("carbs_g"))}g · Fat ${round(sum("fat_g"))}g`;
  const tail = `Confidence: ${result.confidence}${result.note ? `\n⚠️ ${result.note}` : ""}`;
  return [lines.join("\n"), total, tail].join("\n\n");
}

const HELP =
  "Send me a photo of your meal 📷 or describe it in text (e.g. \"pad thai 1 plate\") and I'll estimate calories and macros.\nEstimates are rough, not medical advice.";

async function lineReply(env, replyToken, text) {
  const res = await fetch(LINE_REPLY_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    // LINE text messages max out at 5000 chars.
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text: text.slice(0, 5000) }] }),
  });
  if (!res.ok) console.error("LINE reply failed", res.status, await res.text());
}

async function handleEvent(env, event) {
  if (event.type === "follow") return lineReply(env, event.replyToken, HELP);
  if (event.type !== "message") return;

  const msg = event.message;
  try {
    let input;
    if (msg.type === "image") {
      const img = await fetch(LINE_CONTENT_URL(msg.id), {
        headers: { authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` },
      });
      if (!img.ok) throw new Error(`LINE content ${img.status}`);
      input = {
        imageBase64: toBase64(await img.arrayBuffer()),
        mimeType: img.headers.get("content-type") || "image/jpeg",
      };
    } else if (msg.type === "text") {
      if (msg.text.trim().length < 3) return lineReply(env, event.replyToken, HELP);
      input = { text: msg.text.trim() };
    } else {
      return lineReply(env, event.replyToken, HELP);
    }
    await lineReply(env, event.replyToken, formatReply(await estimate(env, input)));
  } catch (err) {
    console.error(err);
    await lineReply(env, event.replyToken, "😵 Something went wrong estimating that. Please try again in a moment.");
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") return new Response("calorie-bot is running");
    const body = await request.text();
    if (!(await verifySignature(body, request.headers.get("x-line-signature"), env.LINE_CHANNEL_SECRET))) {
      return new Response("bad signature", { status: 401 });
    }
    const { events = [] } = JSON.parse(body);
    // Ack LINE right away; do the slow vision call in the background.
    ctx.waitUntil(Promise.all(events.map((e) => handleEvent(env, e))));
    return new Response("ok");
  },
};
