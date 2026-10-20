// Waitlist signup confirmation (transactional only): glitched notice style, email-safe (tables + inline CSS, black background, one small optional image).
// Placeholders: {{X_URL}} (the $LOGOUT X account) and {{UNSUB}} (remove-me line). Plain JS so Deno and the Node test share it.
export const DEFAULT_X_URL = 'https://x.com/LogOutDisabled';
export const DEFAULT_UNSUB = 'Reply REMOVE to be erased from the tower\u2019s records.';
export const TOWER_IMG = 'https://logouttower.github.io/logout-game/landing/img/mail-tower.png';
// Strictly a transactional signup confirmation: no promotion, offers, coin or token language.
export const SUBJECTS = ['SYSTEM N0TICE: waitlist signup confirmed'];
export const PREHEADER = 'Your $LOGOUT waitlist signup is confirmed.';

export const HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>$LOGOUT</title>
<style>:root{color-scheme:dark;supported-color-schemes:dark}body{margin:0;padding:0;background:#000000}a{color:#5ef2ff}@media (max-width:520px){.wrap{width:100%!important}.pad{padding:28px 20px!important}}</style></head>
<body bgcolor="#000000" style="margin:0;padding:0;background:#000000;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#000000;font-size:1px;line-height:1px;">{{PREHEADER}}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#000000" style="background:#000000;">
<tr><td align="center" bgcolor="#000000" style="background:#000000;padding:24px 8px;">
<table role="presentation" class="wrap" width="480" cellpadding="0" cellspacing="0" border="0" bgcolor="#000000" style="width:480px;max-width:480px;background:#000000;border:1px solid #1c1830;">
<tr><td class="pad" align="center" bgcolor="#000000" style="padding:36px 32px;background:#000000;font-family:'Courier New',Courier,ui-monospace,Menlo,monospace;">
<img src="{{TOWER_IMG}}" width="45" height="96" alt="" style="display:block;width:45px;height:96px;border:0;margin:0 auto 26px;image-rendering:pixelated;">
<p style="margin:0 0 4px;font-size:11px;letter-spacing:4px;color:#7a6cc0;">&#9671; SYSTEM N0TICE &#9671;</p>
<p style="margin:0 0 22px;font-size:20px;line-height:1.3;letter-spacing:3px;font-weight:bold;color:#5ef2ff;text-shadow:2px 0 #b46cff,-1px 0 #2a7f8a;">WELC0ME T0 THE T0WER</p>
<p style="margin:0;font-size:13px;line-height:1.9;color:#b8b0d8;text-align:left;">// signup confirmed<br>// this address is registered on the $LOGOUT waitlist<br>// no action is needed<span style="color:#b46cff;">_</span></p>
</td></tr></table>
<p style="margin:16px 0 0;max-width:480px;font-family:'Courier New',Courier,monospace;font-size:11px;line-height:1.6;color:#5f596c;">You are receiving this one-time confirmation because this address was entered at the $LOGOUT waitlist. {{UNSUB}} &middot; <a href="{{X_URL}}" style="color:#5f596c;">x.com/LogOutDisabled</a></p>
</td></tr></table></body></html>`;

export const TEXT = `SYSTEM N0TICE: WELC0ME T0 THE T0WER

// signup confirmed
// this address is registered on the $LOGOUT waitlist
// no action is needed

--
You are receiving this one-time confirmation because this address was entered at the $LOGOUT waitlist. {{UNSUB}}
{{X_URL}}
`;

const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const safeUrl = u => (/^https:\/\/[^\s"'<>]+$/.test(u || '') ? u : DEFAULT_X_URL);
export function render({ xUrl = DEFAULT_X_URL, unsub = DEFAULT_UNSUB, img = TOWER_IMG, subject = SUBJECTS[0] } = {}) {
  const x = safeUrl(xUrl), fill = (t, html) => t.replaceAll('{{X_URL}}', html ? esc(x) : x).replaceAll('{{UNSUB}}', html ? esc(unsub) : unsub).replaceAll('{{TOWER_IMG}}', esc(safeUrl(img) === DEFAULT_X_URL ? TOWER_IMG : img)).replaceAll('{{PREHEADER}}', esc(PREHEADER));
  return { subject, html: fill(HTML, true), text: fill(TEXT, false) };
}
