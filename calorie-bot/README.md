# calorie-bot

LINE chatbot: send a food photo (or type what you ate) and get calories + macros back.
Everything runs on free tiers: LINE Messaging API, Gemini API, Cloudflare Workers.

## Setup

1. **Gemini key** (free): https://aistudio.google.com/apikey
2. **LINE channel**: create a Messaging API channel at https://developers.line.biz/console/
   and note the *Channel secret* and issue a *Channel access token*.
   Turn off "Auto-reply messages" in the LINE Official Account settings.
3. **Deploy**:
   ```
   cd calorie-bot
   npm install
   npx wrangler login
   npx wrangler secret put LINE_CHANNEL_SECRET
   npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
   npx wrangler secret put GEMINI_API_KEY
   npm run deploy
   ```
4. Paste the printed `https://calorie-bot.<you>.workers.dev` URL into the channel's
   **Webhook URL**, enable "Use webhook", and press Verify.

## Config (`wrangler.toml`)

- `REPLY_LANG`: language of the replies (default `Thai`).
- `GEMINI_MODEL`: any Gemini model with image input and free-tier quota.

## Tests

`npm test` (no network needed).

## Notes

- Estimates are rough; portion size is the main source of error.
- Gemini free-tier quotas change and may use your data for model improvement. Check the current terms.
