// Floor-chat and guild-name filter. MIRRORED in supabase/schema-addendum-guilds-chat.sql (public.chat_clean):
// the server is the authority, this copy gives instant feedback and drives the local backend. Keep both in sync;
// test/guilds.test.mjs runs the same cases through both.
export const CHAT_MAX = 200, CHAT_SLOW_MS = 10000, CHAT_KEEP = 100;
// Starter list; the server copy lives in public.chat_banned_words so moderators can extend it without a deploy.
export const BANNED = ['fuck', 'shit', 'cunt', 'bitch', 'asshole', 'bastard', 'dick', 'pussy', 'whore', 'slut', 'nigger', 'nigga', 'faggot', 'fag', 'retard', 'rape', 'kys', 'nazi'];
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', 9: 'g', '@': 'a', $: 's', '!': 'i' };
export const normWord = w => [...w.toLowerCase()].map(c => LEET[c] ?? c).join('').replace(/[^a-z]/g, '');
const LINK = [
  /(https?|ftp|wss?):\/\//i, /\bwww\./i, /discord\s*\.?\s*(gg|com\/invite)/i, /\bt\.me\b/i,
  /\b[a-z0-9-]{2,}(\.|\s*[([]dot[)\]]\s*)[a-z]{2,}\b/i, // anything domain-like: "name.tld", "name(dot)tld", "name [dot] tld"
  /\b[a-z0-9-]{2,}\s+dot\s+(com|net|org|io|gg|xyz|app|me|co|ru|sol|eth|link|site|fun|xxx|info|biz|dev|tv|to|cc)\b/i, // "site dot com"
];
const WALLET = [/\b[1-9A-HJ-NP-Za-km-z]{26,}\b/, /\b0x[0-9a-fA-F]{20,}/, /\bbc1[a-z0-9]{20,}/i, /\b(?=[A-Za-z]*[0-9])[A-Za-z0-9]{20,}\b/];
/** { ok, text, reason }: links and wallet-like strings are refused outright; banned words are masked. */
export function cleanChat(raw, max = CHAT_MAX) {
  const t = String(raw ?? '').replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, '').replace(/\s+/g, ' ').trim();
  if (!t) return { ok: false, reason: 'empty' };
  if (t.length > max) return { ok: false, reason: 'too long' };
  if (LINK.some(r => r.test(t))) return { ok: false, reason: 'links are not allowed' };
  if (WALLET.some(r => r.test(t))) return { ok: false, reason: 'addresses and codes are not allowed' };
  const text = t.split(' ').map(w => { const n = normWord(w); return n && BANNED.some(b => n.startsWith(b)) ? '*'.repeat(w.length) : w; }).join(' ');
  return { ok: true, text };
}
