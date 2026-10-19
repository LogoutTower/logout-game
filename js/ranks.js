// Leaderboard ranking helpers. Pure. Staff rows are never ranked: players keep their real rank numbers,
// and a staff row only gets an informational wouldRank (the rank its damage would hold among players).
export function rankRows(rows) {
  const players = rows.filter(r => !r.staff).sort((a, b) => b.damage - a.damage).map((r, i) => ({ ...r, rank: i + 1 }));
  const staff = rows.filter(r => r.staff).map(r => ({ ...r, rank: 0, wouldRank: 1 + players.filter(p => p.damage > r.damage).length }));
  return { players, staff };
}
/** Staff rows first (rank 0 + wouldRank), then the top `n` players, plus `me` if outside it. */
export function boardWithStaff(rows, me = null, n = 10) {
  const { players, staff } = rankRows(rows), top = players.slice(0, n);
  if (me && !staff.some(s => s.name === me) && !top.some(r => r.name === me)) top.push(players.find(r => r.name === me) || { name: me, damage: 0, rank: players.length + 1 });
  return [...staff, ...top];
}
