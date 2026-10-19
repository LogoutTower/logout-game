// Browser tests never touch the live backend: config.js is served with FEATURES.online = 'off' (the game boots in local mode
// and never loads the Supabase client) and any request to supabase.co is aborted as a backstop. Opt in to live with E2E_LIVE=1.
export async function offline(ctx) {
  const hits = []; if (process.env.E2E_LIVE === '1') return hits;
  await ctx.route(/supabase\.co/, r => { hits.push(r.request().url()); r.abort(); });
  await ctx.route(/\/config\.js(\?|$)/, async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace(/online:\s*'[a-z]+'/, "online: 'off'") }); });
  return hits; // tests assert this stays empty
}
