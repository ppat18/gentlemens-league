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
    // Defensiv-Beiträge (Patrick 31.10.2026): 2 Punkte ab 10 CBIT als Verteidiger / 12 CBIRT als Mittelfeld oder Sturm
    // (nie für Torhüter) → wer es geschafft hat, steht als 🛡️-Ereignis da; Top 5 je Seite plus Paraden und BPS unter „mehr“
    const typ = {};
    for (const e of boot.elements) typ[e.id] = e.element_type;
    const dcHit = (id, v) => typ[id] === 2 ? v >= 10 : typ[id] >= 3 ? v >= 12 : false;
    const top = (key, s, n) => [...stat(f, key)[s]].sort((p, q) => q.value - p.value).slice(0, n);
    const hits = s => stat(f, 'defensive_contribution')[s].filter(x => dcHit(x.element, x.value)).map(x => (used.add(x.element), [x.element, 1]));
    const dh = hits('h'), da = hits('a');
    if (dh.length || da.length) ev.dc = { h: dh, a: da };
    const more = {};
    for (const [key, k, n] of [['saves', 'sv', 3], ['defensive_contribution', 'dc', 5], ['bps', 'bps', 3]]) {
      const pick = s => top(key, s, n).filter(x => x.value > 0).map(x => (used.add(x.element), k === 'dc' ? [x.element, x.value, dcHit(x.element, x.value) ? 1 : 0] : [x.element, x.value]));
      const h = pick('h'), a = pick('a');
      if (h.length || a.length) more[k] = { h, a };
    }
    if (Object.keys(more).length) o.more = more;
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
  // Minuten der Ereignisse (PL-Schnittstelle) – darf den Kalender nie blockieren
  try { console.log('Minuten:', await require('./matchmins').addMatchMins(data, boot), 'Spiele neu geholt'); }
  catch (err) { console.warn('Minuten nicht verfügbar:', err.message); }
  const file = path.join(__dirname, '..', 'data', 'fixtures.json');
  fs.writeFileSync(file, JSON.stringify(data));
  return data.fixtures.length;
}

module.exports = { writeFixtures, bonusFromBps };
