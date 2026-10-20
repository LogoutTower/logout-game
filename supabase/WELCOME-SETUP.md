# Waitlist welcome email (setup for the operator)

Every new row in `public.waitlist` triggers one short, **strictly transactional signup confirmation**
("SYSTEM N0TICE: WELC0ME T0 THE T0WER // signup confirmed …") with a plain-text part and one small footer link to
https://x.com/LogOutDisabled. No promotion, offers, coin or token language: that keeps it a transactional message rather
than a commercial one, which is why no postal address is required in the footer. Keep it that way if you edit `template.js`
(the unit test rejects promo/coin words). Nothing here is live until you do the steps below.

Pieces:
- `supabase/waitlist-welcome.sql`: adds `welcomed_at` / `welcome_claimed_at` and two service-role-only functions (claim, mark). Idempotent.
- `supabase/functions/waitlist-welcome/`: the Edge Function (`index.ts` → `handler.js`, email in `template.js`).
- The email image: `landing/img/mail-tower.png` (90×192, ~350 bytes, shown at 45×96), served from GitHub Pages.

The function checks the `x-webhook-secret` header, **claims** the row before sending and **marks** it after the provider accepts
the mail, so a retried or duplicated webhook never sends twice; a failed send releases the claim. It sends to the address stored
in the database (not the one in the webhook payload) and makes exactly one provider call per insert.

Provider is chosen by the `PROVIDER` secret: `mailjet` (default, Send API v3.1), `brevo` (kept, needs `BREVO_API_KEY`), or
`resend` (optional, needs `RESEND_API_KEY` and a verified domain).

## 1. Mailjet account and sender
1. The Mailjet account is on the project address `LogoutTower@proton.me` (free plan: 200 emails/day, 6,000/month).
2. **Account settings → Senders & Domains → Add a sender address**: `LogoutTower@proton.me`, and confirm the link Mailjet sends there.
3. **Account settings → API Key Management**: copy the API key (`MAILJET_API_KEY`) and secret key (`MAILJET_SECRET_KEY`).

**Deliverability note:** without an authenticated domain (SPF/DKIM), some messages may land in spam at first, and a
proton.me From address sent via Mailjet can be flagged by DMARC at strict receivers. Short, nearly image-free mail helps.

## 2. Database
Run `supabase/waitlist-welcome.sql` in the SQL editor (after `waitlist.sql`). It is safe to run more than once.

## 3. Secrets
Generate a long random string for `WEBHOOK_SECRET` (e.g. `openssl rand -hex 32`). Then set the secrets (Dashboard →
Edge Functions → Secrets, or CLI):

```sh
supabase secrets set WEBHOOK_SECRET=<random> PROVIDER=mailjet \
  MAILJET_API_KEY=<api key> MAILJET_SECRET_KEY=<secret key> \
  SENDER_EMAIL=LogoutTower@proton.me SENDER_NAME='$LOGOUT Tower' X_URL=https://x.com/LogOutDisabled
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to Edge Functions automatically. `PROVIDER`, `SENDER_EMAIL`,
`SENDER_NAME` and `X_URL` default to the values above if unset. An old `BREVO_API_KEY` can stay; it is only used with `PROVIDER=brevo`.

## 4. Deploy the function
CLI (from the repo root): `supabase functions deploy waitlist-welcome --no-verify-jwt`
Dashboard: Edge Functions → `waitlist-welcome` (or Deploy a new function with that name), paste `index.ts`, `handler.js` and
`template.js`, and turn **Verify JWT off** (the function checks `x-webhook-secret` itself).

## 5. Database Webhook
Dashboard → Database → Webhooks → **Create a new hook**:
- Table `public.waitlist`, events: **Insert** only.
- Type: HTTP Request, method **POST**, URL `https://<project-ref>.supabase.co/functions/v1/waitlist-welcome`
  (or type "Supabase Edge Functions" and pick `waitlist-welcome`).
- HTTP headers: `Content-Type: application/json` and **`x-webhook-secret: <the same WEBHOOK_SECRET>`**.

## 6. Test only to a +tag project address
Never test with a real person's or personal address. Use a plus-tag of the project inbox, e.g.
`select public.join_waitlist('logouttower+welcome1@proton.me');` in the SQL editor (use a new tag per test, since a
repeated address inserts no row). Check: the email arrives in the project Proton inbox (look in spam too), Edge Functions →
`waitlist-welcome` → Logs shows `{"sent":true}`, and `select email, welcomed_at from public.waitlist order by id desc limit 5;`
shows `welcomed_at` set. Afterwards remove test rows: `delete from public.waitlist where email like 'logouttower+%@proton.me';`

## Remove-me requests
The footer says "Reply REMOVE to be erased from the tower's records." and the mail carries a `List-Unsubscribe` mailto to the
same inbox. To honour one: `delete from public.waitlist where email = lower('<address>');`

## SQL
`supabase/waitlist-welcome.sql` is unchanged by the Mailjet switch (only a comment no longer names Brevo). If it already ran,
there is nothing new to run; if not, run it once (step 2).

## Turning it off
Disable or delete the Database Webhook. Nothing else sends mail.
