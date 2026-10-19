# Waitlist welcome email (setup for the operator)

Every new row in `public.waitlist` triggers one short confirmation email ("SYSTEM N0TICE: LOG OUT DISABLED // address registered …")
with a link to the $LOGOUT X account. Nothing here is live until you do the steps below.

Pieces:
- `supabase/waitlist-welcome.sql`: adds `welcomed_at` / `welcome_claimed_at` and two service-role-only functions (claim, mark). Idempotent.
- `supabase/functions/waitlist-welcome/`: the Edge Function (`index.ts` → `handler.js`, email in `template.js`).
- The email image: `landing/img/mail-tower.png` (90×192, ~350 bytes, shown at 45×96), served from GitHub Pages.

The function checks a shared secret header, **claims** the row before sending and **marks** it after Brevo accepts the mail, so a
retried or duplicated webhook never sends twice; a failed send releases the claim. It sends to the address stored in the
database (not the one in the webhook payload) and makes exactly one Brevo call per insert.

## 1. Brevo account and sender
1. Sign up at brevo.com with the project's anonymous address (`logouttower@mail.grokbot.com`). The free plan allows 300 emails/day.
2. **Senders, Domains & IPs → Senders → Add a sender**: name `$LOGOUT`, email `logouttower@mail.grokbot.com`. Open the
   verification email in that inbox and confirm.
3. **SMTP & API → API Keys → Generate a new API key** (name it `waitlist-welcome`). Copy it once; it is the `BREVO_API_KEY`.

**Deliverability note:** without a verified, authenticated domain (SPF/DKIM/DMARC for the sending domain in Brevo), Gmail and
others may show the sender as "**via brevo**" (or sendinblue), and some messages may **land in spam**, especially at first.
Keeping the email short and nearly image-free helps. Adding an authenticated domain later fixes most of it.

## 2. Database
Run `supabase/waitlist-welcome.sql` in the SQL editor (after `waitlist.sql`). It is safe to run more than once.

## 3. Secrets
Generate a long random string for `WEBHOOK_SECRET` (e.g. `openssl rand -hex 32`). Then set the secrets (Dashboard →
Edge Functions → Secrets, or CLI):

```sh
supabase secrets set WEBHOOK_SECRET=<random> BREVO_API_KEY=<brevo key> \
  SENDER_EMAIL=logouttower@mail.grokbot.com SENDER_NAME='$LOGOUT' X_URL=https://x.com/LogOutDisabled
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to Edge Functions automatically. `SENDER_EMAIL`, `SENDER_NAME`
and `X_URL` default to the values above if unset.

## 4. Deploy the function
CLI (from the repo root): `supabase functions deploy waitlist-welcome --no-verify-jwt`
Dashboard: Edge Functions → Deploy a new function → name `waitlist-welcome`, paste `index.ts`, `handler.js` and `template.js`,
and turn **Verify JWT off** (the function checks `x-webhook-secret` itself).

## 5. Database Webhook
Dashboard → Database → Webhooks → **Create a new hook**:
- Table `public.waitlist`, events: **Insert** only.
- Type: HTTP Request, method **POST**, URL `https://<project-ref>.supabase.co/functions/v1/waitlist-welcome`
  (or type "Supabase Edge Functions" and pick `waitlist-welcome`).
- HTTP headers: `Content-Type: application/json` and **`x-webhook-secret: <the same WEBHOOK_SECRET>`**.

## 6. Test with your own address
Sign up on `/landing/` with an address you control (or run `select public.join_waitlist('you@example.com');` in the SQL editor).
Check: the email arrives (look in spam too), Edge Functions → `waitlist-welcome` → Logs shows `{"sent":true}`, and
`select email, welcomed_at from public.waitlist order by id desc limit 5;` shows `welcomed_at` set. Signing up again with the
same address sends nothing (duplicates don't insert a row).

## Remove-me requests
The footer says "Reply REMOVE to be erased from the tower's records." and the mail carries a `List-Unsubscribe` mailto to the
same inbox. To honour one: `delete from public.waitlist where email = lower('<address>');`

## Turning it off
Disable or delete the Database Webhook. Nothing else sends mail.
