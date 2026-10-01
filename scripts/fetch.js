// Holt alle Liga-Daten aus der FPL-API und schreibt data/data.json
// Aufruf: node scripts/fetch.js
const fs = require('fs');
const path = require('path');

const LEAGUE_ID = 243508;
const API = 'https://fantasy.premierleague.com/api';

// FPL-Team-ID -> Spitzname + Avatar
const MANAGERS = {
  4797326: { nick: 'Kai', avatar: 'kai' },
  5944301: { nick: 'Patrick', avatar: 'patrick' },
  3730212: { nick: 'Thomas', avatar: 'thomas' },
  2634875: { nick: 'Roli', avatar: 'roli' },
  434292: { nick: 'Christian', avatar: 'christian' },
  2776955: { nick: 'Max', avatar: 'max' },
  5717008: { nick: 'Favo', avatar: 'favo' },
  1279976: { nick: 'Alex', avatar: 'alex' },
  6335161: { nick: 'Amti', avatar: 'amti' },
  2889833: { nick: 'Andi', avatar: 'andi' },
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url) {
  for (let i = 0; i < 4; i++) {
    const res = await fetch(API + url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (res.ok) return res.json();
    await sleep(1500 * (i + 1));
  }
  throw new Error('FPL-API nicht erreichbar: ' + url);
}

(async () => {
  const boot = await get('/bootstrap-static/');
  const players = Object.fromEntries(boot.elements.map(e => [e.id, e.web_name]));
  const finished = boot.events.filter(e => e.finished && e.data_checked).map(e => e.id);
  const lastGW = Math.max(0, ...finished);

  const league = await get(`/leagues-classic/${LEAGUE_ID}/standings/`);
  const entries = league.standings.results;

  // Live-Daten je Spieltag (Punkte & Karten jedes PL-Spielers)
  const live = {};
  for (const gw of finished) {
    const l = await get(`/event/${gw}/live/`);
    live[gw] = Object.fromEntries(l.elements.map(e => [e.id, e.stats]));
  }

  // Aktuellster Kader: letzte Gameweek, deren Deadline vorbei ist (vorher sind fremde Kader nicht sichtbar)
  const squadGW = Math.max(0, ...boot.events.filter(e => new Date(e.deadline_time) < new Date()).map(e => e.id));
  if (squadGW && !live[squadGW]) {
    const l = await get(`/event/${squadGW}/live/`);
    live[squadGW] = Object.fromEntries(l.elements.map(e => [e.id, e.stats]));
  }
  const elements = Object.fromEntries(boot.elements.map(e => [e.id, e]));
  const teamById = Object.fromEntries(boot.teams.map(t => [t.id, t]));
  // Kader platzsparend: Spieler-Stammdaten einmal in "players", je Gameweek nur die Aufstellung
  const squadPlayers = {}; // id -> [Name, Typ (1 TW, 2 VT, 3 MF, 4 ST), Verein kurz, Vereinscode]
  const buildSquad = (p, gw) => {
    const stats = live[gw] || {};
    return {
      gw,
      finished: finished.includes(gw),
      chip: p.active_chip,
      points: p.entry_history?.points ?? null,
      hits: p.entry_history?.event_transfers_cost ?? 0,
      subs: p.automatic_subs.map(s => [s.element_in, s.element_out]),
      // [Spieler-ID, Position 1–15, Multiplikator, 1 = Kapitän / 2 = Vize, Punkte, Minuten]
      picks: p.picks.map(x => {
        const el = elements[x.element], t = teamById[el.team];
        squadPlayers[x.element] = [el.web_name, el.element_type, t.short_name, t.code];
        return [x.element, x.position, x.multiplier, x.is_captain ? 1 : x.is_vice_captain ? 2 : 0,
          stats[x.element]?.total_points ?? 0, stats[x.element]?.minutes ?? 0];
      }),
    };
  };

  // Tore ab der 90. Minute (für Last-Minute-Glück/-Pech im Glück-o-Meter) – darf nie den Rest blockieren
  let late = {};
  try {
    const { lateGoals } = require('./lategoals');
    late = await lateGoals(boot, await get('/fixtures/'));
    console.log('Last-Minute-Tore:', Object.values(late).flat().length);
  } catch (err) { console.warn('Last-Minute-Daten nicht verfügbar:', err.message); }
  const GOAL_PTS = { 1: 10, 2: 6, 3: 5, 4: 4 }, ASSIST_PTS = 3, CS_PTS = { 1: 4, 2: 4, 3: 1, 4: 0 };

  const managers = [];
  for (const e of entries) {
    const meta = MANAGERS[e.entry] || { nick: e.player_name.split(' ')[0], avatar: null };
    const hist = await get(`/entry/${e.entry}/history/`);
    const transfers = await get(`/entry/${e.entry}/transfers/`);
    const gws = [];
    const squads = [];
    for (const h of hist.current.filter(h => finished.includes(h.event))) {
      const picks = await get(`/entry/${e.entry}/event/${h.event}/picks/`);
      squads.push(buildSquad(picks, h.event));
      const stats = live[h.event];
      // Startelf nach Auto-Wechseln
      const xi = new Set(picks.picks.filter(p => p.multiplier > 0).map(p => p.element));
      for (const s of picks.automatic_subs) { xi.delete(s.element_out); xi.add(s.element_in); }
      let red = 0, yellow = 0, goals = 0, assists = 0, ownGoals = 0, penMiss = 0, bonus = 0, cleanSheets = 0;
      let best = null;
      for (const id of xi) {
        const s = stats[id] || {};
        bonus += s.bonus || 0;
        // Zu-null nur bei Tormann/Verteidiger (bringt 4 Punkte)
        if ((s.clean_sheets || 0) && elements[id]?.element_type <= 2) cleanSheets += 1;
        if (!best || (s.total_points || 0) > best.pts) best = { name: players[id], pts: s.total_points || 0 };
        red += s.red_cards || 0; yellow += s.yellow_cards || 0;
        goals += s.goals_scored || 0; assists += s.assists || 0;
        ownGoals += s.own_goals || 0; penMiss += s.penalties_missed || 0;
      }
      // Glücksfaktor: Punkte durch automatische Einwechslungen
      const autoSubPts = picks.automatic_subs.reduce((a, x) => a + (stats[x.element_in]?.total_points || 0), 0);
      // Last-Minute: Tore/Vorlagen eigener Startelf-Spieler ab 90' (+) und spät verlorenes Zu-null (−)
      const multOf = id => Math.max(1, picks.picks.find(p => p.element === id)?.multiplier || 1);
      let lateGain = 0, lateLoss = 0, lateFor = 0, lateAgainst = 0; const lateInfo = [];
      for (const g of late[h.event] || []) {
        if (g.scorer && xi.has(g.scorer)) lateFor++;
        // Gegentor ab 90' gegen ein Team, dessen Tormann/Verteidiger in der Startelf auf dem Platz stand
        if (g.concedingTeam && [...xi].some(id => elements[id].team === g.concedingTeam && elements[id].element_type <= 2 && (stats[id]?.minutes || 0) >= 89)) lateAgainst++;
        if (g.scorer && xi.has(g.scorer)) {
          const pts = (GOAL_PTS[elements[g.scorer].element_type] || 4) * multOf(g.scorer);
          lateGain += pts; lateInfo.push(`+${pts} ${players[g.scorer]} ⚽ ${g.label}`);
        }
        if (g.assist && xi.has(g.assist)) {
          const pts = ASSIST_PTS * multOf(g.assist);
          lateGain += pts; lateInfo.push(`+${pts} ${players[g.assist]} 🅰️ ${g.label}`);
        }
        if (g.firstConceded && g.concedingTeam) {
          for (const id of xi) {
            const el = elements[id], st = stats[id] || {};
            if (el.team !== g.concedingTeam || !CS_PTS[el.element_type]) continue;
            if ((st.minutes || 0) < 89 || st.clean_sheets) continue; // war beim Gegentor auf dem Platz, Zu-null weg
            const pts = CS_PTS[el.element_type] * multOf(id);
            lateLoss += pts; lateInfo.push(`−${pts} ${players[id]} 🧤 ${g.label}`);
          }
        }
      }
      const cap = picks.picks.find(p => p.is_captain);
      const capPts = (stats[cap.element]?.total_points || 0);
      // Punkte der 4 Bankspieler (Positionen 12–15) – für den Bench-Boost-Ertrag
      const benchPlayersPts = picks.picks.filter(p => p.position > 11)
        .reduce((a, p) => a + (stats[p.element]?.total_points || 0), 0);
      // Transfers dieses Spieltags: Punkte der Neuzugänge
      const tIn = transfers.filter(t => t.event === h.event).map(t => ({
        in: players[t.element_in], out: players[t.element_out],
        inPts: stats[t.element_in]?.total_points || 0,
        outPts: stats[t.element_out]?.total_points || 0,
      }));
      gws.push({
        gw: h.event,
        points: h.points - h.event_transfers_cost, // Netto nach Minuspunkten
        gross: h.points,
        total: h.total_points,
        bench: picks.active_chip === 'bboost' ? 0 : h.points_on_bench, // beim Bench Boost zählt die Bank → nichts verschenkt
        transfers: h.event_transfers,
        hits: h.event_transfers_cost,
        value: h.value / 10,
        bank: h.bank / 10,
        chip: picks.active_chip,
        captain: players[cap.element],
        captainPts: capPts * cap.multiplier,
        captainBase: capPts,
        benchPlayersPts,
        red, yellow, goals, assists, ownGoals, penMiss, bonus, cleanSheets,
        autoSubs: picks.automatic_subs.length, autoSubPts, best,
        lateGain, lateLoss, lateInfo, lateFor, lateAgainst,
        transfersIn: tIn,
      });
    }
    // Laufende Gameweek (Deadline vorbei, noch nicht fertig) zusätzlich anhängen
    if (squadGW && !squads.some(s => s.gw === squadGW)) {
      squads.push(buildSquad(await get(`/entry/${e.entry}/event/${squadGW}/picks/`), squadGW));
    }
    managers.push({
      id: e.entry, nick: meta.nick, avatar: meta.avatar,
      name: e.player_name, team: e.entry_name,
      rank: e.rank, lastRank: e.last_rank, total: e.total,
      chips: hist.chips, gws,
      past: hist.past.map(p => ({ season: p.season_name, points: p.total_points, overallRank: p.rank })),
      squads,
    });
  }

  // Liga-Rang je Spieltag berechnen (für Verlauf)
  for (const gw of finished) {
    const sorted = managers
      .map(m => ({ m, g: m.gws.find(x => x.gw === gw) }))
      .filter(x => x.g)
      .sort((a, b) => b.g.total - a.g.total);
    sorted.forEach((x, i) => { x.g.leagueRank = i + 1; });
  }

  // Vorschau: nächste Gameweek mit allen Partien
  let next = null;
  const nextEv = boot.events.find(e => e.id === lastGW + 1);
  if (nextEv) {
    const teams = Object.fromEntries(boot.teams.map(t => [t.id, t]));
    const team = id => ({ name: teams[id].name, short: teams[id].short_name, code: teams[id].code });
    // Vereinswappen einmalig lokal speichern
    const badgeDir = path.join(__dirname, '..', 'assets', 'badges');
    fs.mkdirSync(badgeDir, { recursive: true });
    for (const t of boot.teams) {
      const file = path.join(badgeDir, `${t.code}.png`);
      if (fs.existsSync(file)) continue;
      const res = await fetch(`https://resources.premierleague.com/premierleague/badges/70/t${t.code}.png`);
      if (res.ok) fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    }
    const fx = await get(`/fixtures/?event=${nextEv.id}`);
    next = {
      gw: nextEv.id,
      deadline: nextEv.deadline_time,
      fixtures: fx
        .sort((a, b) => (a.kickoff_time || '').localeCompare(b.kickoff_time || ''))
        .map(f => ({
          kickoff: f.kickoff_time,
          home: team(f.team_h), away: team(f.team_a),
          homeDiff: f.team_h_difficulty, awayDiff: f.team_a_difficulty,
        })),
    };
  }

  const out = {
    updated: new Date().toISOString(),
    league: { id: LEAGUE_ID, name: league.league.name },
    lastGW,
    next,
    managers,
    players: squadPlayers,
  };
  const file = path.join(__dirname, '..', 'data', 'data.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out, null, 1));
  console.log(`OK – ${managers.length} Manager, bis GW ${lastGW} -> data/data.json`);
})().catch(e => { console.error(e); process.exit(1); });
