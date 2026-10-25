# Ideas / roadmap

Things to improve later. Roughly ordered by value.

## Features
- [ ] **Daily totals per user**: store each estimate (Cloudflare KV or D1, both free tier) and add a "today" command that sums kcal and macros.
- [ ] **Flex message cards** (LINE) instead of plain text: nicer layout, a macro bar, a "log this" button.
- [ ] **Better portion accuracy**: when confidence is `low`, ask a follow-up ("what size plate?", "how many spoons of rice?") and re-estimate.
- [ ] **Calorie / macro goals**: let the user set a daily target and show remaining.
- [ ] **Correct the estimate**: "actually it was 2 eggs" edits the last entry.
- [ ] **Weekly summary** message.

## Platforms
- [ ] **Discord version**: see below. Share `estimate()` / `formatReply()` between platforms by moving them into `src/core.js`.

### Discord notes
- Slash command `/calories image:<attachment> [note:<text>]` works on Cloudflare Workers via the HTTP Interactions endpoint (no always-on server).
  - Verify the Ed25519 signature (`X-Signature-Ed25519`, `X-Signature-Timestamp`) on every request.
  - Must answer within 3 s, so reply with a deferred response (type 5), then PATCH the follow-up via the interaction webhook (valid 15 min).
  - Attachment URL is in `data.resolved.attachments`.
- Message context-menu command ("Apps > Estimate calories") on an existing message with a photo also works over HTTP.
- Auto-reacting to every photo posted in a channel needs the Gateway websocket and the Message Content intent, which means an always-on host (not Workers).

## Quality / ops
- [ ] Tests that mock Gemini and LINE end to end.
- [ ] Rate-limit per user so the free Gemini quota isn't burned by one person.
- [ ] Log estimate vs. user correction to see where the model is off.
- [ ] Re-check the default `GEMINI_MODEL` and free-tier limits now and then.
