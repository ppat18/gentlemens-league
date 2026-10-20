// Trägt ausgelesene Bowling-Anzeigetafeln in data/bowling.json ein (benutzt von der geplanten Claude-Aufgabe).
// Aufruf: node scripts/bowling-add.js <eingabe.json> [--force]
// Eingabe: { "date": "2026-10-20", "uploader": "kai", "place": "Kino Bowling",
//            "boards": [ { "lane": 4, "timer": "1:27", "players": [ { "name": "Kai", "frames": ["-/", …10], "score": 113 } ] } ] }
// Frames: X Strike, / Spare, - 0, Ziffern; "s" vorne = Split beim ersten Wurf (z. B. "s81"); 10. Frame bis 3 Zeichen.
// Prüft jede Summe nach Bowlingregeln. Stimmt eine nicht → Exit-Code 2 und Liste der Abweichungen (nichts gespeichert),
// außer mit --force (dann als "unsure" markiert, die Endpunkte der Tafel zählen).
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'bowling.json');
const ALIASES = {
  kai: 'kai', alex: 'alex', thomas: 'thomas', christian: 'christian', max: 'max', markus: 'max',
  sascha: 'favo', favo: 'favo', hauthi: 'andi', haupti: 'andi', hautpi: 'andi', andi: 'andi', andreas: 'andi',
  roli: 'roli', roland: 'roli', amti: 'amti', amtmann: 'amti', patrick: 'patrick', pilko: 'patrick',
};
const toWho = n => ALIASES[String(n).toLowerCase().replace(/[^a-zäöüß]/g, '')] || 'gast:' + String(n).trim();
const clean = f => String(f).toUpperCase().replace(/S/g, 's').replace(/0/g, '-').replace(/[^X/\-1-9s]/g, '');

function rolls(frames) {
  const r = [];
  for (const f of frames) { let prev = 0; for (const c of f.replace(/^s/, '')) { const v = c === 'X' ? 10 : c === '-' ? 0 : c === '/' ? 10 - prev : +c; r.push(v); prev = c === 'X' || c === '/' ? 0 : v; } }
  return r;
}
function scoreOf(frames) {
  const r = rolls(frames); let s = 0, i = 0;
  for (let f = 0; f < 10; f++) {
    if (r[i] === 10) { s += 10 + (r[i + 1] || 0) + (r[i + 2] || 0); i++; }
    else if (r[i] + r[i + 1] === 10) { s += 10 + (r[i + 2] || 0); i += 2; }
    else { s += (r[i] || 0) + (r[i + 1] || 0); i += 2; }
  }
  return s;
}
const secs = t => { const m = /^(\d+):(\d{2})$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };

const [, , input, flag] = process.argv;
if (!input) { console.error('Aufruf: node scripts/bowling-add.js <eingabe.json> [--force]'); process.exit(1); }
const inp = JSON.parse(fs.readFileSync(input, 'utf8'));
if (!/^\d{4}-\d{2}-\d{2}$/.test(inp.date || '')) { console.error('Datum fehlt/ungültig'); process.exit(1); }

const problems = [];
const boards = (inp.boards || []).map((b, bi) => ({
  lane: b.lane ?? null, timer: b.timer ?? null, bi,
  players: b.players.map(p => {
    const frames = p.frames.map(clean), calc = frames.length === 10 ? scoreOf(frames) : null;
    if (calc !== p.score) problems.push(`Tafel ${bi + 1} (Bahn ${b.lane ?? '?'}), ${p.name}: Frames ergeben ${calc ?? 'keine 10 Frames'}, Tafel zeigt ${p.score}`);
    return { who: toWho(p.name), frames, score: p.score, ...(calc === p.score ? {} : { unsure: true }) };
  }),
}));
if (problems.length && flag !== '--force') { console.log('ABWEICHUNGEN – bitte Fotos nochmal prüfen:\n' + problems.join('\n')); process.exit(2); }

const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
let ev = data.evenings.find(e => e.date === inp.date);
if (!ev) { ev = { date: inp.date, place: inp.place || '', uploadedBy: inp.uploader || null, games: [] }; data.evenings.push(ev); }
if (!ev.place && inp.place) ev.place = inp.place;
const sig = g => g.lane + '|' + g.players.map(p => p.who + ':' + p.frames.join(',')).sort().join(';');
const have = new Set(ev.games.map(sig));
// Reihenfolge je Bahn: die Tafel zählt die Restzeit herunter → größere Zeit = früheres Spiel
const fresh = boards.filter(b => !have.has(sig(b)))
  .sort((a, b) => (a.lane ?? 0) - (b.lane ?? 0) || (secs(b.timer) ?? -b.bi) - (secs(a.timer) ?? -a.bi));
for (const b of fresh) {
  const round = Math.max(0, ...ev.games.filter(g => g.lane === b.lane).map(g => g.round)) + 1;
  ev.games.push({ round, lane: b.lane, players: b.players });
}
data.evenings.sort((a, b) => a.date.localeCompare(b.date));
fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
const guests = [...new Set(fresh.flatMap(b => b.players.map(p => p.who)).filter(w => w.startsWith('gast:')))];
console.log(`OK – ${fresh.length} neue Spiele am ${inp.date} (${boards.length - fresh.length} schon vorhanden)` +
  (problems.length ? `, ${problems.length} unsicher` : '') + (guests.length ? `, Gäste: ${guests.join(', ')}` : ''));
