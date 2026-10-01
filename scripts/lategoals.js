// Tore ab der 90. Minute (inkl. Nachspielzeit) aus der offiziellen Premier-League-Schnittstelle holen
// und FPL-Spielern/Teams zuordnen. Ergebnis wird in data/latemin.json zwischengespeichert,
// damit jedes Spiel nur einmal abgefragt wird.
//
// Rückgabe: { [gw]: [ { fixture, label, type, scorer, assist, scoringTeam, concedingTeam, firstConceded } ] }
//   type: 'G' Tor, 'P' Elfmeter, 'O' Eigentor · scorer/assist = FPL-Element-ID (oder null)
//   firstConceded = true, wenn das das erste Gegentor des kassierenden Teams im Spiel war (→ Zu-null verloren)
const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const PLH = { 'User-Agent': UA, Origin: 'https://www.premierleague.com', Referer: 'https://www.premierleague.com/' };
const API = 'https://footballapi.pulselive.com/football';
const LATE_SECS = 90 * 60; // ab 90:00
const CACHE = path.join(__dirname, '..', 'data', 'latemin.json');

const N = s => (s || '').normalize('NFD').replace(/\p{Mn}/gu, '').replace(/[^a-zA-Z ]/g, '').toLowerCase().trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJ(u) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(u, { headers: PLH }); if (r.ok) return r.json(); } catch (e) { /* nochmal */ }
    await sleep(1500 * (i + 1));
  }
  throw new Error('PL-Schnittstelle nicht erreichbar: ' + u);
}

// Spieler aus der PL-Aufstellung einem FPL-Element des passenden Teams zuordnen
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

async function lateGoals(boot, fplFixtures) {
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { /* neu */ }

  const teamByName = {};
  boot.teams.forEach(t => { teamByName[N(t.name)] = t.id; teamByName[N(t.short_name)] = t.id; });
  const fplTeamOf = t => teamByName[N(t?.name)] || teamByName[N(t?.shortName)] || teamByName[N(t?.club?.name)] || null;
  // FPL-Gameweek über die Team-Paarung finden
  const gwOfPair = {};
  for (const f of fplFixtures) if (f.event) gwOfPair[`${f.team_h}-${f.team_a}`] = f.event;

  // Beendete Spiele der laufenden Saison, neueste zuerst – abbrechen, sobald nur noch Bekanntes kommt
  const first = (await getJ(`${API}/fixtures?comps=1&pageSize=20&page=0&statuses=C&sort=desc`)).content || [];
  const seasonId = first[0]?.gameweek?.compSeason?.id;
  let page = 0, list = first;
  while (list.length) {
    let fresh = 0;
    for (const f of list) {
      if (f.gameweek?.compSeason?.id !== seasonId) continue;
      if (cache[f.id]) continue;
      fresh++;
      const home = fplTeamOf(f.teams?.[0]?.team), away = fplTeamOf(f.teams?.[1]?.team);
      const gw = gwOfPair[`${home}-${away}`] || null;
      const late = (f.goals || []).filter(g => g.clock?.secs >= LATE_SECS);
      const entry = { gw, goals: [] };
      if (late.length) {
        // Details (Aufstellungen) nur für Spiele mit spätem Tor laden
        const det = await getJ(`${API}/fixtures/${f.id}`);
        const people = {};
        for (const tl of det.teamLists || []) for (const p of [...(tl.lineup || []), ...(tl.substitutes || [])]) people[p.id] = { ...p, teamId: tl.teamId };
        const plTeamToFpl = Object.fromEntries((det.teams || f.teams || []).map(t => [t.team.id, fplTeamOf(t.team)]));
        const otherTeam = id => (id === home ? away : home);
        const goalsSorted = [...(f.goals || [])].sort((a, b) => a.clock.secs - b.clock.secs);
        const conceded = {}; // Anzahl Gegentore je FPL-Team bis zum jeweiligen Tor
        for (const g of goalsSorted) {
          const sp = people[g.personId];
          const ownTeam = sp ? plTeamToFpl[sp.teamId] : null;
          const scoringTeam = g.type === 'O' ? otherTeam(ownTeam) : ownTeam;
          const concedingTeam = scoringTeam ? otherTeam(scoringTeam) : null;
          const firstConceded = concedingTeam ? !conceded[concedingTeam] : false;
          if (concedingTeam) conceded[concedingTeam] = (conceded[concedingTeam] || 0) + 1;
          if (g.clock.secs < LATE_SECS) continue;
          const ap = g.assistId ? people[g.assistId] : null;
          entry.goals.push({
            label: (g.clock.label || '').replace(/'00$/, "'"), secs: g.clock.secs, type: g.type,
            scorer: g.type === 'O' ? null : matchPlayer(sp, ownTeam, boot),
            assist: ap ? matchPlayer(ap, plTeamToFpl[ap.teamId], boot) : null,
            scoringTeam, concedingTeam, firstConceded,
          });
        }
        await sleep(400);
      }
      cache[f.id] = entry;
    }
    if (!fresh && page > 0) break; // ältere Seiten sind schon bekannt
    page++;
    if (page > 25) break;
    list = ((await getJ(`${API}/fixtures?comps=1&pageSize=20&page=${page}&statuses=C&sort=desc`)).content || [])
      .filter(f => f.gameweek?.compSeason?.id === seasonId);
  }
  fs.writeFileSync(CACHE, JSON.stringify(cache));

  const byGw = {};
  for (const [id, e] of Object.entries(cache)) {
    if (!e.gw) continue;
    for (const g of e.goals) (byGw[e.gw] ||= []).push({ fixture: Number(id), ...g });
  }
  return byGw;
}

module.exports = { lateGoals };
