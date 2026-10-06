// Spielkalender: alle PL-Spiele der Saison mit Ergebnis, Ereignissen und (live berechneten) Bonuspunkten
// -> data/fixtures.json (wird von calendar.js angezeigt)
const fs = require('fs');
const path = require('path');

// FPL-Bonus aus BPS: Top-Wert 3, dann 2, dann 1 – bei Gleichstand bekommen alle gleich viel,
// die nächsten rücken entsprechend nach (z. B. 3,3,1 oder 3,2,2)
function bonusFromBps(bps) {
  const sorted = [...bps].sort((a, b) => b.value - a.value);
  const out = [];
  let pos = 0;
  for (let i = 0; i < sorted.length;) {
    const pts = 3 - pos;
    if (pts <= 0) break;
    const group = sorted.filter(x => x.value === sorted[i].value);
    group.forEach(x => out.push([x.element, pts]));
    pos += group.length; i += group.length;
  }
  return out;
}

function buildFixtures(boot, all) {
  const used = new Set();
  const stat = (f, key) => f.stats.find(s => s.identifier === key) || { h: [], a: [] };
  // Ereignisse je Seite: [[Spieler-ID, Anzahl], …]
  const side = (f, key, s) => stat(f, key)[s].map(x => (used.add(x.element), [x.element, x.value]));

  const fixtures = all.filter(f => f.event).map(f => {
    const o = {
      id: f.id, gw: f.event, ko: f.kickoff_time, h: f.team_h, a: f.team_a,
      hd: f.team_h_difficulty, ad: f.team_a_difficulty,
    };
    if (!f.started) return o;
    Object.assign(o, {
      hs: f.team_h_score, as: f.team_a_score, min: f.minutes,
      done: !!(f.finished || f.finished_provisional),
    });
    const ev = {};
    for (const [key, k] of [['goals_scored', 'g'], ['assists', 'as'], ['own_goals', 'og'], ['yellow_cards', 'yc'],
      ['red_cards', 'rc'], ['penalties_saved', 'ps'], ['penalties_missed', 'pm']]) {
      const h = side(f, key, 'h'), a = side(f, key, 'a');
      if (h.length || a.length) ev[k] = { h, a };
    }
    o.ev = ev;
    // Bonus: offiziell, sobald vergeben – sonst live aus dem BPS (vorläufig)
    const official = [...stat(f, 'bonus').h, ...stat(f, 'bonus').a];
    const bps = [...stat(f, 'bps').h, ...stat(f, 'bps').a];
    o.bonus = official.length ? official.map(x => [x.element, x.value]).sort((x, y) => y[1] - x[1]) : bonusFromBps(bps);
    o.bonusLive = !official.length;
    o.bonus.forEach(([el]) => used.add(el));
    return o;
  });

  const players = {};
  for (const e of boot.elements) if (used.has(e.id)) players[e.id] = [e.web_name, e.team];
  const teams = Object.fromEntries(boot.teams.map(t => [t.id, { name: t.name, short: t.short_name, code: t.code }]));
  const events = Object.fromEntries(boot.events.map(e => [e.id, { deadline: e.deadline_time, current: e.is_current, next: e.is_next }]));
  return { updated: new Date().toISOString(), teams, players, events, fixtures };
}

async function writeFixtures(boot, get) {
  const data = buildFixtures(boot, await get('/fixtures/'));
  const file = path.join(__dirname, '..', 'data', 'fixtures.json');
  fs.writeFileSync(file, JSON.stringify(data));
  return data.fixtures.length;
}

module.exports = { writeFixtures, bonusFromBps };
