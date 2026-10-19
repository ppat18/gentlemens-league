// Spielkalender: Minute jedes Ereignisses (Tor, Assist, Eigentor, Karte, Elfer) – Patrick, 19.10.2026.
// FPL liefert nur „wer, wie oft“, die Minuten kommen aus der offiziellen Premier-League-Schnittstelle
// (Spielereignisse mit Uhrzeit) und werden wie bei den Last-Minute-Toren den FPL-Spielern zugeordnet.
// Zwischenspeicher data/matchmins.json: ein Spiel wird nur neu geholt, wenn FPL neue Ereignisse meldet
// oder einmal zum Schluss, wenn es fertig ist.
const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const PLH = { 'User-Agent': UA, Origin: 'https://www.premierleague.com', Referer: 'https://www.premierleague.com/' };
const API = 'https://footballapi.pulselive.com/football';
const CACHE = path.join(__dirname, '..', 'data', 'matchmins.json');
const MAX_PER_RUN = 100;

const N = s => (s || '').normalize('NFD').replace(/\p{Mn}/gu, '').replace(/[^a-zA-Z ]/g, '').toLowerCase().trim();
const label = c => (c?.label || '').replace(/'\d\d$/, "'").replace(/^0(\d)/, '$1');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJ(u) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(u, { headers: PLH }); if (r.ok) return r.json(); } catch (e) { /* nochmal */ }
    await sleep(1500 * (i + 1));
  }
  throw new Error('PL-Schnittstelle nicht erreichbar: ' + u);
}

// gleiche Zuordnung wie bei den Last-Minute-Toren
function matchPlayer(p, fplTeam, boot) {
  if (!p || !fplTeam) return null;
  const cands = boot.elements.filter(e => e.team === fplTeam);
  const full = N(p.name?.display), last = N(p.name?.last), first = N(p.name?.first);
  let m = cands.filter(e => N(`${e.first_name} ${e.second_name}`) === full);
  if (m.length !== 1) m = cands.filter(e => N(e.second_name) === last || N(e.web_name) === last || N(e.web_name) === full);
  if (m.length !== 1) m = cands.filter(e => last && (N(e.second_name).split(' ').includes(last) || N(e.second_name).endsWith(last)));
  if (m.length !== 1) m = cands.filter(e => full && N(`${e.first_name} ${e.second_name}`).includes(last) && N(e.first_name).startsWith(first.slice(0, 3)));
  if (m.length > 1) m = m.filter(e => N(e.first_name).startsWith(first.slice(0, 3)));
  return m.length === 1 ? m[0].id : null;
}

// FPL-Ereigniszahlen eines Spiels – ändern sie sich, gibt es Neues zu holen
const sigOf = f => JSON.stringify(Object.entries(f.ev || {}).map(([k, v]) => [k, ...v.h.map(x => x.slice(0, 2)), ...v.a.map(x => x.slice(0, 2))]));

function eventsOf(det, boot, fplTeamOf) {
  const people = {};
  for (const tl of det.teamLists || []) for (const p of [...(tl.lineup || []), ...(tl.substitutes || [])]) people[p.id] = { ...p, teamId: tl.teamId };
  const plToFpl = Object.fromEntries((det.teams || []).map(t => [t.team.id, fplTeamOf(t.team)]));
  const el = id => { const p = people[id]; return p ? matchPlayer(p, plToFpl[p.teamId], boot) : null; };
  const m = {}, psx = {};
  const add = (k, id, l) => { if (id) ((m[k] ||= {})[id] ||= []).push(l); };
  const evs = [...(det.events || [])].sort((a, b) => (+a.phase || 0) - (+b.phase || 0) || (a.clock?.secs || 0) - (b.clock?.secs || 0));
  for (const e of evs) {
    const l = label(e.clock);
    if (!l || !e.personId) continue;
    if (e.type === 'G' || e.type === 'P') { add('g', el(e.personId), l); if (e.assistId) add('as', el(e.assistId), l); }
    else if (e.type === 'O') add('og', el(e.personId), l);
    else if (e.type === 'B') add(e.description === 'Y' ? 'yc' : 'rc', el(e.personId), l);
    else if (e.type === 'MP') add('pm', el(e.personId), l);   // Elfer verschossen (daneben / Stange)
    else if (e.type === 'SP') {
      // Elfer gehalten: Schütze hat verschossen, der gegnerische Torhüter (aus FPLs ps-Liste) hat gehalten
      add('pm', el(e.personId), l);
      const t = plToFpl[people[e.personId]?.teamId];
      const other = Object.values(plToFpl).find(x => x && x !== t);
      if (other) (psx[other] ||= []).push(l);
    }
  }
  return { m, psx };
}

// Minuten an die Ereignisse hängen: [id, n] → [id, n, ["14'", "67'"]]
function attachMins(cal, store) {
  for (const f of cal.fixtures) {
    const x = store.fx[f.id];
    if (!x || !f.ev) continue;
    for (const [k, sides] of Object.entries(f.ev)) for (const s of ['h', 'a']) {
      const list = sides[s] || [];
      sides[s] = list.map(([id, n]) => {
        let l = x.m?.[k]?.[id];
        if (!l && k === 'ps' && list.length === 1) l = x.psx?.[s === 'h' ? f.h : f.a];
        // nur wenn alle bekannt sind – FPL zählt auch Assists, die die PL nicht kennt (Elfer herausgeholt, abgefälscht …)
        return l?.length === n ? [id, n, l] : [id, n];
      });
    }
  }
  return cal;
}

async function addMatchMins(cal, boot) {
  let store = { map: {}, fx: {} };
  try { store = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { /* neu */ }
  const todo = cal.fixtures.filter(f => f.hs != null)
    .filter(f => { const x = store.fx[f.id]; return !x || x.sig !== sigOf(f) || (f.done && !x.final); })
    .sort((a, b) => (a.done - b.done) || String(b.ko).localeCompare(String(a.ko)))
    .slice(0, MAX_PER_RUN);
  let n = 0;
  if (todo.length) {
    const teamByName = {};
    boot.teams.forEach(t => { teamByName[N(t.name)] = t.id; teamByName[N(t.short_name)] = t.id; });
    const fplTeamOf = t => teamByName[N(t?.name)] || teamByName[N(t?.shortName)] || teamByName[N(t?.club?.name)] || null;
    try {
      // PL-Spiel-IDs der ganzen Saison, über die Paarung (Heim-Gast ist pro Saison eindeutig)
      if (todo.some(f => !store.map[`${f.h}-${f.a}`]) && Date.now() - (store.mapAt || 0) > 6 * 3600e3) {
        store.mapAt = Date.now();
        const season = ((await getJ(`${API}/fixtures?comps=1&pageSize=1&statuses=C&sort=desc`)).content || [])[0]?.gameweek?.compSeason?.id;
        if (season) {
          if (store.season !== season) Object.assign(store, { season, map: {}, fx: {} });
          for (let page = 0; page < 5; page++) {
            const r = await getJ(`${API}/fixtures?comps=1&compSeasons=${season}&pageSize=100&page=${page}`);
            for (const f of r.content || []) {
              const h = fplTeamOf(f.teams?.[0]?.team), a = fplTeamOf(f.teams?.[1]?.team);
              if (h && a) store.map[`${h}-${a}`] = f.id;
            }
            if (page + 1 >= (r.pageInfo?.numPages || 0)) break;
          }
        }
      }
      for (const f of todo) {
        const pl = store.map[`${f.h}-${f.a}`];
        if (!pl) continue;
        const det = await getJ(`${API}/fixtures/${pl}`);
        store.fx[f.id] = { sig: sigOf(f), final: !!f.done && det.status === 'C', ...eventsOf(det, boot, fplTeamOf) };
        n++;
        await sleep(150);
      }
    } catch (err) { console.warn('Minuten:', err.message); }
    fs.writeFileSync(CACHE, JSON.stringify(store));
  }
  attachMins(cal, store);
  return n;
}

module.exports = { addMatchMins };
