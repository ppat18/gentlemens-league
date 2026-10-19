// Scout: privates Analyse-Werkzeug für Patricks Team (versteckte Unterseite, nicht verlinkt)
// Punkteprognose je Spieler und Spieltag (eigenes Modell aus FPL-Daten), beste Aufstellung, Kapitän,
// Transfervorschläge inkl. Hits, Team-Bewertung im Liga-Vergleich, Planer, Preise, Chips, Verletzungen.
// Ausgabe: data/scout.json (wird von scout-*/index.html angezeigt). Aufruf: node scripts/scout.js
const fs = require('fs');
const path = require('path');

const MY_ID = 5944301;      // Patricks FPL-Team
const HORIZON = 5;          // Spieltage im Voraus
const WEIGHTS = [1, 0.9, 0.8, 0.7, 0.6]; // nähere Spieltage zählen mehr
const API = 'https://fantasy.premierleague.com/api';
const HIT = 4;

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(u) {
  for (let i = 0; i < 4; i++) {
    const res = await fetch(API + u, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (res.ok) return res.json();
    await sleep(1500 * (i + 1));
  }
  throw new Error('FPL nicht erreichbar: ' + u);
}

// ---------- Prognosemodell ----------
const GOAL = { 1: 10, 2: 6, 3: 5, 4: 4 }, CS = { 1: 4, 2: 4, 3: 1, 4: 0 };
const PRIOR_XG = { 1: 0, 2: 0.05, 3: 0.15, 4: 0.38 }, PRIOR_XA = { 1: 0.01, 2: 0.06, 3: 0.13, 4: 0.1 };
const PRIOR_BONUS = { 1: 0.25, 2: 0.25, 3: 0.3, 4: 0.35 };
const DC_THRESHOLD = { 2: 10, 3: 12, 4: 12 };
// P(X >= k) für Poisson(mu)
const poisAtLeast = (mu, k) => { let p = 0, t = Math.exp(-mu); for (let i = 0; i < k; i++) { p += t; t *= mu / (i + 1); } return Math.max(0, 1 - p); };
const shrink = (total, n90, prior, k = 4) => (total + prior * k) / (n90 + k);

function buildModel(boot, fixtures) {
  const teams = Object.fromEntries(boot.teams.map(t => [t.id, t]));
  const played = {}; // Spiele je Verein (aus beendeten Partien)
  for (const f of fixtures) if (f.finished || f.finished_provisional) { played[f.team_h] = (played[f.team_h] || 0) + 1; played[f.team_a] = (played[f.team_a] || 0) + 1; }
  // Gegentor-Erwartung je Verein: xGC/90 des Tormanns mit den meisten Minuten (geschrumpft Richtung 1,35)
  const teamXGC = {};
  for (const t of boot.teams) {
    const gk = boot.elements.filter(e => e.team === t.id && e.element_type === 1).sort((a, b) => b.minutes - a.minutes)[0];
    const n90 = (gk?.minutes || 0) / 90;
    teamXGC[t.id] = shrink(Number(gk?.expected_goals_conceded || 0), n90, 1.35, 3);
  }
  // Vereinsstärke selbst aus den Daten (FPL-Stärkewerte sind diese Saison leer):
  // Angriff = erwartete Tore je Spiel, Abwehr = erwartete Gegentore je Spiel, beide Richtung Ligaschnitt geschrumpft
  const teamXG = {};
  for (const t of boot.teams) {
    const xg = boot.elements.filter(e => e.team === t.id).reduce((s, e) => s + Number(e.expected_goals || 0), 0);
    teamXG[t.id] = shrink(xg, played[t.id] || 0, 1.35, 3);
  }
  const avgAtt = Object.values(teamXG).reduce((x, y) => x + y, 0) / boot.teams.length;
  const avgDef = Object.values(teamXGC).reduce((x, y) => x + y, 0) / boot.teams.length;
  const HOME = 1.08, AWAY = 0.93;
  const clamp = v => Math.min(1.7, Math.max(0.55, v));
  // Torchancen-Faktor für das eigene Team (eigener Angriff × gegnerische Abwehrschwäche × Heim/Auswärts)
  const attMult = (own, opp, home) => clamp((teamXG[own] / avgAtt) * (teamXGC[opp] / avgDef) * (home ? HOME : AWAY));
  // Gegentor-Faktor (gegnerischer Angriff × Heim/Auswärts) – wird mit der eigenen Gegentor-Erwartung multipliziert
  const defMult = (own, opp, home) => clamp((teamXG[opp] / avgAtt) * (home ? AWAY : HOME));

  // Spiele je Verein und Spieltag
  const fxBy = {};
  for (const f of fixtures) if (f.event && !f.finished && !f.finished_provisional) {
    (fxBy[`${f.event}-${f.team_h}`] ||= []).push({ opp: f.team_a, home: true, fdr: f.team_h_difficulty });
    (fxBy[`${f.event}-${f.team_a}`] ||= []).push({ opp: f.team_h, home: false, fdr: f.team_a_difficulty });
  }

  // Erwartete Punkte eines Spielers in einem Spiel
  const perGame = (e, fx) => {
    const pos = e.element_type, n90 = e.minutes / 90, gp = played[e.team] || 0;
    const blocked = ['i', 's', 'u', 'n'].includes(e.status);
    const chance = e.chance_of_playing_next_round == null ? (blocked ? 0 : 1) : e.chance_of_playing_next_round / 100;
    // Stammplatz-Quote: Startelf-Einsätze je Vereinsspiel (neue Spieler vorsichtig)
    const startRate = gp ? Math.min(1, e.starts / gp) : (e.minutes > 0 ? 0.5 : 0.15);
    const pStart = chance * startRate, pSub = chance * Math.min(0.5, (1 - startRate) * 0.6);
    const minsShare = pStart * 0.86 + pSub * 0.2; // Anteil an 90 Minuten
    const am = attMult(e.team, fx.opp, fx.home), dm = defMult(e.team, fx.opp, fx.home);
    const xg90 = shrink(Number(e.expected_goals), n90, PRIOR_XG[pos], 2);
    const xa90 = shrink(Number(e.expected_assists), n90, PRIOR_XA[pos], 2);
    const bonus90 = shrink(e.bonus, n90, PRIOR_BONUS[pos]);
    const lambda = teamXGC[e.team] * dm; // erwartete Gegentore
    let pts = pStart * 2 + pSub * 1;     // Einsatz
    pts += xg90 * minsShare * am * GOAL[pos] + xa90 * minsShare * am * 3;
    pts += pStart * CS[pos] * Math.exp(-lambda);
    if (pos <= 2) pts -= pStart * lambda / 2;                       // je 2 Gegentore −1
    if (pos === 1) pts += pStart * Number(e.saves_per_90 || 0) / 3; // Paraden
    if (DC_THRESHOLD[pos]) pts += pStart * 2 * poisAtLeast(Number(e.defensive_contribution_per_90 || 0), DC_THRESHOLD[pos]);
    pts += bonus90 * minsShare * Math.sqrt(am);
    pts -= minsShare * shrink(e.yellow_cards, n90, 0.1) * 1;
    return { pts, pStart };
  };

  const xp = {}; // xp[id][gw] = { pts, fx: [...] }
  const gws = [];
  const next = boot.events.find(e => e.is_next);
  if (next) for (let g = next.id; g < next.id + HORIZON && g <= 38; g++) gws.push(g);
  for (const e of boot.elements) {
    xp[e.id] = {};
    for (const gw of gws) {
      const fxs = fxBy[`${gw}-${e.team}`] || [];
      let pts = 0, pStart = 0;
      for (const fx of fxs) { const r = perGame(e, fx); pts += r.pts; pStart = Math.max(pStart, r.pStart); }
      // nächste Runde: 30 % FPLs eigene Erwartung (aktuelle Form, Verletzungsmeldungen) einmischen
      if (gw === gws[0] && fxs.length && e.ep_next != null) pts = 0.7 * pts + 0.3 * Number(e.ep_next);
      xp[e.id][gw] = { pts: Math.round(pts * 10) / 10, pStart, fx: fxs.map(f => ({ opp: teams[f.opp].short_name, home: f.home, fdr: f.fdr })) };
    }
  }
  const xp5 = id => gws.reduce((s, gw, i) => s + (xp[id][gw]?.pts || 0) * WEIGHTS[i], 0);
  return { xp, xp5, gws, teams, played };
}

// ---------- Aufstellung ----------
// beste Startelf aus 15 Spielern für einen Spieltag (1 TW, ≥3 VT, ≥2 MF, ≥1 ST, insgesamt 11)
function bestXI(ids, score, el) {
  const by = t => ids.filter(id => el[id].element_type === t).sort((a, b) => score(b) - score(a));
  const gk = by(1), d = by(2), m = by(3), f = by(4);
  let best = null;
  for (const [nd, nm, nf] of [[3, 4, 3], [3, 5, 2], [4, 4, 2], [4, 3, 3], [4, 5, 1], [5, 4, 1], [5, 3, 2], [5, 2, 3], [3, 4, 3]]) {
    if (d.length < nd || m.length < nm || f.length < nf || !gk.length) continue;
    const xi = [gk[0], ...d.slice(0, nd), ...m.slice(0, nm), ...f.slice(0, nf)];
    const s = xi.reduce((a, id) => a + score(id), 0);
    if (!best || s > best.s) best = { xi, s, formation: `${nd}-${nm}-${nf}` };
  }
  if (!best) return { xi: [], bench: ids, s: 0, cap: null, vice: null, formation: '' };
  const benchOut = ids.filter(id => !best.xi.includes(id));
  const bench = [...benchOut.filter(id => el[id].element_type === 1), ...benchOut.filter(id => el[id].element_type !== 1).sort((a, b) => score(b) - score(a))];
  const capOrder = [...best.xi].sort((a, b) => score(b) - score(a));
  return { ...best, bench, cap: capOrder[0], vice: capOrder[1], total: best.s + score(capOrder[0]) };
}
// Teamwert über den Horizont: je Spieltag beste Elf + Kapitän, gewichtet
function teamScore(ids, M, el) {
  return M.gws.reduce((s, gw, i) => s + bestXI(ids, id => M.xp[id][gw]?.pts || 0, el).total * WEIGHTS[i], 0);
}

(async () => {
  const [boot, fixtures, entry, hist, transfers] = await Promise.all([
    get('/bootstrap-static/'), get('/fixtures/'), get(`/entry/${MY_ID}/`), get(`/entry/${MY_ID}/history/`), get(`/entry/${MY_ID}/transfers/`),
  ]);
  const el = Object.fromEntries(boot.elements.map(e => [e.id, e]));
  const M = buildModel(boot, fixtures);
  const nextGW = M.gws[0];
  const lastDeadlineGW = Math.max(...boot.events.filter(e => new Date(e.deadline_time) < new Date()).map(e => e.id));
  const picks = await get(`/entry/${MY_ID}/event/${lastDeadlineGW}/picks/`);
  const squad = picks.picks.map(p => p.element);
  const bank = (hist.current.find(h => h.event === lastDeadlineGW)?.bank ?? 0);

  // Freie Transfers: +1 je Spieltag, max. 5; Wildcard/Free Hit verbrauchen keine
  const chipBy = Object.fromEntries((hist.chips || []).map(c => [c.event, c.name]));
  let ft = 0;
  for (const h of hist.current) {
    if (h.event === 1) { ft = 0; continue; }
    ft = Math.min(5, ft + 1);
    if (!['wildcard', 'freehit'].includes(chipBy[h.event])) ft = Math.max(0, ft - h.event_transfers);
  }
  ft = Math.min(5, ft + 1); // für den nächsten Spieltag

  // Verkaufspreise: Kaufpreis + Hälfte des Gewinns (abgerundet)
  const bought = {};
  for (const t of [...transfers].sort((a, b) => new Date(a.time) - new Date(b.time))) bought[t.element_in] = t.element_in_cost;
  for (const id of squad) if (bought[id] == null) {
    try { const s = await get(`/element-summary/${id}/`); bought[id] = s.history[0]?.value ?? el[id].now_cost; } catch (e) { bought[id] = el[id].now_cost; }
  }
  const sellPrice = id => { const b = bought[id], n = el[id].now_cost; return n > b ? b + Math.floor((n - b) / 2) : n; };

  // ---------- Aufstellung & Kapitän ----------
  const xi = bestXI(squad, id => M.xp[id][nextGW]?.pts || 0, el);
  const baseScore = teamScore(squad, M, el);

  // ---------- Transfervorschläge ----------
  const clubCount = ids => ids.reduce((c, id) => (c[el[id].team] = (c[el[id].team] || 0) + 1, c), {});
  const pool = {};
  for (const t of [1, 2, 3, 4]) pool[t] = boot.elements.filter(e => e.element_type === t && !squad.includes(e.id) && e.status !== 'u')
    .sort((a, b) => M.xp5(b.id) - M.xp5(a.id)).slice(0, 35).map(e => e.id);
  const singles = [];
  for (const out of squad) {
    const t = el[out].element_type, budget = bank + sellPrice(out);
    for (const inn of pool[t]) {
      if (el[inn].now_cost > budget) continue;
      const ids = squad.map(x => x === out ? inn : x);
      if (Object.values(clubCount(ids)).some(n => n > 3)) continue;
      const gain = teamScore(ids, M, el) - baseScore;
      if (gain > 0.3) singles.push({ out, inn, gain, bankAfter: budget - el[inn].now_cost });
    }
  }
  singles.sort((a, b) => b.gain - a.gain);
  const doubles = [];
  const topSingles = singles.slice(0, 40);
  for (let i = 0; i < topSingles.length; i++) for (let j = i + 1; j < topSingles.length; j++) {
    const a = topSingles[i], b = topSingles[j];
    if (a.out === b.out || a.inn === b.inn) continue;
    const ids = squad.map(x => x === a.out ? a.inn : x === b.out ? b.inn : x);
    const cost = el[a.inn].now_cost + el[b.inn].now_cost, budget = bank + sellPrice(a.out) + sellPrice(b.out);
    if (cost > budget || Object.values(clubCount(ids)).some(n => n > 3)) continue;
    doubles.push({ moves: [a, b].map(x => ({ out: x.out, inn: x.inn })), gain: teamScore(ids, M, el) - baseScore, bankAfter: budget - cost });
  }
  doubles.sort((a, b) => b.gain - a.gain);
  // Empfehlung: Gewinn minus Hits (Hits nur, wenn mehr Transfers als freie)
  const net = (n, gain) => gain - Math.max(0, n - ft) * HIT;
  const options = [{ n: 0, gain: 0, moves: [] }];
  if (singles[0]) options.push({ n: 1, gain: singles[0].gain, moves: [{ out: singles[0].out, inn: singles[0].inn }], bankAfter: singles[0].bankAfter });
  if (doubles[0]) options.push({ n: 2, gain: doubles[0].gain, moves: doubles[0].moves, bankAfter: doubles[0].bankAfter });
  // Hits nur mit Sicherheitsabstand (Prognosen sind unsicher): 2 Punkte Puffer je Option mit Hit
  options.forEach(o => { o.net = net(o.n, o.gain); o.hits = Math.max(0, o.n - ft) * HIT; o.score = o.net - (o.hits ? 2 : 0); });
  // Transfer aufheben lohnt, wenn der beste Einzeltransfer klein ist und noch Platz für Rollover ist
  const best = [...options].sort((a, b) => b.score - a.score)[0];
  const advice = best.n === 0 || (best.n === 1 && best.gain < 1.5 && ft < 5)
    ? { type: 'roll', text: ft < 5 ? 'Transfer aufheben (kein Vorschlag bringt genug) – nächste Woche hast du dann ' + Math.min(5, ft + 1) + ' freie.' : 'Kein Transfer nötig.' }
    : { type: 'move', ...best };

  // ---------- Team-Bewertung im Liga-Vergleich ----------
  let league = [];
  try {
    const d = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'data.json'), 'utf8'));
    league = d.managers.map(m => {
      const sq = (m.squads || []).at(-1);
      const ids = sq ? sq.picks.map(p => p[0]) : [];
      return { nick: m.nick, avatar: m.avatar, me: m.id === MY_ID, ids, score: ids.length === 15 ? teamScore(ids, M, el) : null };
    }).filter(x => x.score != null).sort((a, b) => b.score - a.score);
  } catch (e) { /* Liga-Daten fehlen – ohne Vergleich */ }
  const owners = id => league.filter(x => !x.me && x.ids.includes(id)).map(x => x.nick);
  const myRank = league.findIndex(x => x.me) + 1;
  const grade = !league.length ? null : (() => {
    const s = league.map(x => x.score), me = league.find(x => x.me).score, hi = Math.max(...s), lo = Math.min(...s);
    const p = hi === lo ? 1 : (me - lo) / (hi - lo);
    return p >= 0.9 ? 'A' : p >= 0.7 ? 'B' : p >= 0.45 ? 'C' : p >= 0.2 ? 'D' : 'E';
  })();

  // ---------- Hinweise ----------
  const player = id => {
    const e = el[id];
    return {
      id, name: e.web_name, pos: e.element_type, team: M.teams[e.team].short_name, code: e.team_code, price: e.now_cost / 10,
      sell: squad.includes(id) ? sellPrice(id) / 10 : null, status: e.status, chance: e.chance_of_playing_next_round, news: e.news,
      form: Number(e.form), total: e.total_points, own: Number(e.selected_by_percent), ep: Number(e.ep_next || 0),
      priceProg: e.price_change_percent == null ? null : Number(e.price_change_percent),
      xp: M.gws.map(gw => ({ gw, pts: M.xp[id][gw]?.pts || 0, fx: M.xp[id][gw]?.fx || [] })),
      xp5: Math.round(M.xp5(id) * 10) / 10, owners: owners(id),
    };
  };
  const players = {};
  const need = new Set([...squad, ...singles.slice(0, 12).map(s => s.inn), ...doubles.slice(0, 5).flatMap(d => d.moves.map(m => m.inn))]);
  // Beobachtungsliste: beste Prognose je Position + bestes Preis-Leistungs-Verhältnis
  const watch = {};
  for (const t of [1, 2, 3, 4]) {
    const list = boot.elements.filter(e => e.element_type === t && e.status === 'a' && e.minutes > 0);
    watch[t] = {
      top: list.sort((a, b) => M.xp5(b.id) - M.xp5(a.id)).slice(0, 6).map(e => e.id),
      value: [...list].sort((a, b) => M.xp5(b.id) / b.now_cost - M.xp5(a.id) / a.now_cost).slice(0, 6).map(e => e.id),
    };
    for (const k of ['top', 'value']) watch[t][k].forEach(id => need.add(id));
  }
  for (const id of need) players[id] = player(id);

  // Preise: eigene Spieler mit Tendenz + größte Steiger/Fallen
  const rising = boot.elements.filter(e => Number(e.price_change_percent) >= 70).sort((a, b) => b.price_change_percent - a.price_change_percent).slice(0, 8).map(e => e.id);
  const falling = boot.elements.filter(e => Number(e.price_change_percent) <= -70).sort((a, b) => a.price_change_percent - b.price_change_percent).slice(0, 8).map(e => e.id);
  [...rising, ...falling].forEach(id => { if (!players[id]) players[id] = player(id); });

  // Chips: Doppel-/Leerrunden, bester Bench-Boost- und Triple-Captain-Spieltag
  const used = new Set((hist.chips || []).map(c => c.name));
  const chipPlan = M.gws.map(gw => {
    const sc = id => M.xp[id][gw]?.pts || 0;
    const x = bestXI(squad, sc, el);
    const benchPts = x.bench.reduce((a, id) => a + sc(id), 0);
    const doubles = squad.filter(id => (M.xp[id][gw]?.fx || []).length > 1).length;
    const blanks = squad.filter(id => !(M.xp[id][gw]?.fx || []).length).length;
    return { gw, benchPts: Math.round(benchPts * 10) / 10, capPts: Math.round(sc(x.cap) * 10) / 10, cap: x.cap, doubles, blanks };
  });
  chipPlan.forEach(c => { if (!players[c.cap]) players[c.cap] = player(c.cap); });

  // Modell-Check: unsere Prognose vs. FPLs eigene Erwartung für die nächste Runde (eigener Kader)
  const check = squad.map(id => ({ id, our: M.xp[id][nextGW]?.pts || 0, fpl: Number(el[id].ep_next || 0) }));

  const out = {
    updated: new Date().toISOString(), nextGW, gws: M.gws, deadline: boot.events.find(e => e.id === nextGW)?.deadline_time,
    team: { name: entry.name, bank: bank / 10, ft, value: (squad.reduce((s, id) => s + el[id].now_cost, 0) + bank) / 10, rank: entry.summary_overall_rank, points: entry.summary_overall_points, chipsUsed: [...used] },
    squad, xi: { xi: xi.xi, bench: xi.bench, cap: xi.cap, vice: xi.vice, formation: xi.formation, total: Math.round(xi.total * 10) / 10 },
    advice, ft,
    singles: singles.slice(0, 12).map(s => ({ ...s, gain: Math.round(s.gain * 10) / 10, bankAfter: s.bankAfter / 10 })),
    doubles: doubles.slice(0, 5).map(d => ({ ...d, gain: Math.round(d.gain * 10) / 10, net: Math.round(net(2, d.gain) * 10) / 10, bankAfter: d.bankAfter / 10 })),
    rating: { grade, rank: myRank, of: league.length, table: league.map(x => ({ nick: x.nick, avatar: x.avatar, me: x.me, score: Math.round(x.score) })) },
    watch, rising, falling, chipPlan, check, players,
  };
  if (out.advice.bankAfter != null) out.advice.bankAfter /= 10;
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'scout.json'), JSON.stringify(out));
  console.log(`Scout: GW ${nextGW}, ${squad.length} Spieler, ${singles.length} Einzeltransfers, Note ${grade}, Rat: ${advice.type}`);
})().catch(e => { console.error('Scout-Fehler:', e.message); process.exit(0); });
