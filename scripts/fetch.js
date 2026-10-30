// Holt alle Liga-Daten aus der FPL-API und schreibt data/data.json
// Aufruf: node scripts/fetch.js
const fs = require('fs');
const path = require('path');

// FPL-Regeln für noch nicht abgerechnete Gameweeks (30.10.2026, GW8: Kapitän spielte nicht, Vize wurde nicht verdoppelt):
// Kapitän ohne Minuten → Vize bekommt den Kapitäns-Multiplikator; Starter ohne Minuten → erster Bankspieler, der gespielt
// hat (Torwart nur für Torwart, gültige Formation). Gleiche Logik wie Your Mini League (platform/src/fplrules.js).
const MIN_OF = { 2: 3, 3: 2, 4: 1 }, MAX_OF = { 2: 5, 3: 5, 4: 3 };

function applyFplRules(picks, chip, info) {
  const out = picks.map(p => [...p]);
  const cap = out.find(p => p[3] === 1), vc = out.find(p => p[3] === 2);
  const bench = out.filter(p => p[1] > 11).sort((a, b) => a[1] - b[1]);
  // already processed by FPL: the captain's multiplier was moved or a bench player counts
  if (!cap || cap[2] === 0 || (chip !== 'bboost' && bench.some(p => p[2] > 0))) return { picks: out, subs: [] };
  const dead = p => { const i = info(p[0]); return !!i.done && !(i.min > 0); };
  const subs = [];
  if (chip !== 'bboost') {
    const count = t => out.filter(p => p[2] > 0 && info(p[0]).type === t).length;
    for (const s of out.filter(p => p[1] <= 11 && p[2] > 0 && dead(p))) {
      const t = info(s[0]).type;
      const b = bench.find(b => {
        if (b[2] > 0 || !(info(b[0]).min > 0)) return false;
        const bt = info(b[0]).type;
        if (t === 1 || bt === 1) return t === bt;                 // goalkeeper only for goalkeeper
        return bt === t || (count(t) - 1 >= MIN_OF[t] && count(bt) + 1 <= MAX_OF[bt]);
      });
      if (!b) continue;
      b[2] = 1; s[2] = 0; subs.push([b[0], s[0]]);
    }
  }
  if (dead(cap)) {
    cap[2] = 0;
    if (vc && vc[2] > 0 && info(vc[0]).min > 0) vc[2] = chip === '3xc' ? 3 : 2;
  }
  return { picks: out, subs };
}

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
  // Verletztenliste für das Glück-o-Meter: wer vor der nächsten Deadline verletzt (oder ≤25 % Einsatzchance) gemeldet ist.
  // Wird bis zur Deadline bei jedem Lauf überschrieben – danach bleibt der letzte Stand. FPL speichert keinen Verlauf.
  const injFile = path.join(__dirname, '..', 'data', 'injuries.json');
  const injuries = fs.existsSync(injFile) ? JSON.parse(fs.readFileSync(injFile, 'utf8')) : {};
  const nextDl = boot.events.find(e => new Date(e.deadline_time) > new Date());
  if (nextDl) {
    injuries[nextDl.id] = boot.elements.filter(e => e.status === 'i' || (e.status === 'd' && e.chance_of_playing_next_round != null && e.chance_of_playing_next_round <= 25)).map(e => e.id);
    fs.mkdirSync(path.dirname(injFile), { recursive: true });
    fs.writeFileSync(injFile, JSON.stringify(injuries));
  }

  const league = await get(`/leagues-classic/${LEAGUE_ID}/standings/`);
  const entries = league.standings.results;

  // Laufende GW vorläufig als abgeschlossen werten, sobald alle Spiele vorbei sind und FPL die Rundenpunkte
  // veröffentlicht hat (FPL schließt offiziell oft erst Stunden/einen Tag später ab) → Bericht, Awards usw. kommen sofort.
  let provisionalGW = null;
  const curEv0 = boot.events.find(e => e.is_current);
  if (curEv0 && !finished.includes(curEv0.id) && curEv0.average_entry_score > 0 && entries.length) {
    const fx0 = await get(`/fixtures/?event=${curEv0.id}`);
    const probe = (await get(`/entry/${entries[0].entry}/history/`)).current.find(h => h.event === curEv0.id);
    if (fx0.length && fx0.every(f => f.finished || f.finished_provisional) && probe?.points > 0) {
      finished.push(curEv0.id);
      provisionalGW = curEv0.id;
    }
  }
  const lastGW = Math.max(0, ...finished);

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
  const fxDone = {};
  const rule = async (p, gw) => {
    if (boot.events.find(e => e.id === gw)?.data_checked) return p;   // von FPL endgültig abgerechnet
    if (!fxDone[gw]) { const d = {}; for (const f of await get(`/fixtures/?event=${gw}`)) for (const t of [f.team_h, f.team_a]) d[t] = (d[t] ?? true) && !!(f.finished || f.finished_provisional); fxDone[gw] = d; }
    const stats = live[gw] || {}, done = fxDone[gw];
    const info = el => ({ min: stats[el]?.minutes || 0, type: elements[el]?.element_type || 0, done: done[elements[el]?.team] ?? true });
    const r = applyFplRules(p.picks.map(x => [x.element, x.position, x.multiplier, x.is_captain ? 1 : x.is_vice_captain ? 2 : 0]), p.active_chip, info);
    const mult = Object.fromEntries(r.picks.map(x => [x[0], x[2]]));
    return { ...p, picks: p.picks.map(x => ({ ...x, multiplier: mult[x.element] })), automatic_subs: p.automatic_subs.length ? p.automatic_subs : r.subs.map(([i, o]) => ({ element_in: i, element_out: o })) };
  };
  // Kader platzsparend: Spieler-Stammdaten einmal in "players", je Gameweek nur die Aufstellung
  const squadPlayers = {}; // id -> [Name, Typ (1 TW, 2 VT, 3 MF, 4 ST), Verein kurz, Vereinscode]
  const buildSquad = (p, gw) => {
    const stats = live[gw] || {};
    return {
      gw,
      finished: finished.includes(gw),
      chip: p.active_chip,
      // Laufende GW: FPL aktualisiert entry_history.points erst spät → Live-Punkte selbst aus Spielerpunkte × Multiplikator
      // vorläufig beendete GW (provisionalGW): FPL-Wert hinkt hinterher (25.10.2026: 12 statt 33) → wie laufende GW rechnen
      points: finished.includes(gw) && gw !== provisionalGW
        ? (p.entry_history?.points ?? null)
        : Math.max(p.entry_history?.points ?? 0, p.picks.reduce((s, x) => s + (stats[x.element]?.total_points ?? 0) * x.multiplier, 0)),
      hits: p.entry_history?.event_transfers_cost ?? 0,
      subs: p.automatic_subs.map(s => [s.element_in, s.element_out]),
      // [Spieler-ID, Position 1–15, Multiplikator, 1 = Kapitän / 2 = Vize, Punkte, Minuten]
      // Kapitän hat nicht gespielt → der Vize bekommt die Kapitänspunkte, dann tauschen auch C und V (Patrick 30.10.2026)
      picks: p.picks.map((x, _, all) => {
        const cap = all.find(y => y.is_captain), vc = all.find(y => y.is_vice_captain);
        const swap = cap && vc && vc.multiplier > 1 && cap.multiplier <= 1;
        const el = elements[x.element], t = teamById[el.team];
        squadPlayers[x.element] = [el.web_name, el.element_type, t.short_name, t.code];
        return [x.element, x.position, x.multiplier, x.is_captain ? (swap ? 2 : 1) : x.is_vice_captain ? (swap ? 1 : 2) : 0,
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
    for (let h of hist.current.filter(h => finished.includes(h.event))) {
      const picks = await rule(await get(`/entry/${e.entry}/event/${h.event}/picks/`), h.event);
      squads.push(buildSquad(picks, h.event));
      const stats = live[h.event];
      // vorläufig beendete GW: Punkte und Gesamtstand aus den Live-Punkten, solange FPLs Verlauf noch hinterherhinkt
      if (h.event === provisionalGW) {
        const liveSum = picks.picks.reduce((a, x) => a + (stats?.[x.element]?.total_points ?? 0) * x.multiplier, 0);
        if (liveSum > h.points) h = { ...h, total_points: h.total_points + liveSum - h.points, points: liveSum };
      }
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
      // Glück im engeren Sinn (für das Glück-o-Meter): was die Startelf über/unter der Erwartung bekommen hat
      //  · Abschluss: (Tore − xG) × Torpunkte + (Vorlagen − xA) × 3
      //  · Zu-null: (Zu-null − Wahrscheinlichkeit e^−xGC) × Zu-null-Punkte (ab 60 Minuten)
      //  · Gegentore (TW/VT): −(Gegentore − xGC) / 2      – jeweils × Kapitänsfaktor
      const luckMult = Object.fromEntries(picks.picks.map(p => [p.element, p.multiplier || 1]));
      const luckSubIn = new Set(picks.automatic_subs.map(x => x.element_in));
      let finLuck = 0, csLuck = 0, gcLuck = 0;
      for (const id of xi) {
        const s = stats[id] || {}, pos = elements[id]?.element_type, m = luckSubIn.has(id) ? 1 : (luckMult[id] || 1);
        if (!pos || !s.minutes) continue;
        finLuck += ((s.goals_scored || 0) - Number(s.expected_goals || 0)) * GOAL_PTS[pos] * m + ((s.assists || 0) - Number(s.expected_assists || 0)) * ASSIST_PTS * m;
        if (s.minutes >= 60 && CS_PTS[pos]) csLuck += ((s.clean_sheets ? 1 : 0) - Math.exp(-Number(s.expected_goals_conceded || 0))) * CS_PTS[pos] * m;
        if (pos <= 2) gcLuck -= ((s.goals_conceded || 0) - Number(s.expected_goals_conceded || 0)) / 2 * m;
      }
      const r1l = v => Math.round(v * 10) / 10;
      // Glücksfaktor: Punkte durch automatische Einwechslungen
      const autoSubPts = picks.automatic_subs.reduce((a, x) => a + (stats[x.element_in]?.total_points || 0), 0);
      // "Ohne Transfers": Aufstellung und Kapitän dieser Runde, aber jeder in dieser Runde gekaufte Spieler gegen den
      // verkauften zurückgetauscht (Ketten A→B→C zählen als A→C), keine Minuspunkte. Nur Transfers zählen – nicht
      // Aufstellung, Kapitän oder Bank. null = keine Transfers in dieser Runde.
      let lazyPts = null;
      const trs = transfers.filter(t => t.event === h.event).reverse();   // FPL liefert den neuesten Transfer zuerst
      if (trs.length) {
        const orig = new Map();   // gekaufter Spieler → ursprünglich dafür verkaufter
        for (const t of trs) { const o = orig.has(t.element_out) ? orig.get(t.element_out) : t.element_out; orig.delete(t.element_out); orig.set(t.element_in, o); }
        const counted = id => { const p = picks.picks.find(x => x.element === id); return !p ? 0 : (picks.active_chip === 'bboost' || xi.has(id)) ? Math.max(1, p.multiplier) : 0; };
        lazyPts = h.points;
        for (const [inn, out] of orig) lazyPts += ((stats[out]?.total_points || 0) - (stats[inn]?.total_points || 0)) * counted(inn);
      }
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
      // Verletzungspech: Startelf-Spieler nach höchstens 20 Minuten raus (ohne Rot) – da hilft kein Auto-Wechsel;
      // dazu Kaderspieler, die zur Deadline verletzt gemeldet waren (erst ab Beginn der Aufzeichnung)
      const knocks = [];
      for (const id of xi) {
        const st = stats[id] || {}, min = st.minutes || 0;
        if (st.starts && min >= 1 && min <= 20 && !st.red_cards) knocks.push({ name: players[id], min, pts: st.total_points || 0, mult: multOf(id) });
      }
      const injSet = new Set(injuries[h.event] || []);
      const injured = injuries[h.event] ? picks.picks.filter(p => injSet.has(p.element)).map(p => players[p.element]) : null;
      // tatsächlicher Kapitän: der Vize, wenn der Kapitän nicht gespielt hat (FPL-Regel)
      const cap = picks.picks.find(p => p.multiplier > 1) || picks.picks.find(p => p.is_captain);
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
        captainGoals: stats[cap.element]?.goals_scored || 0,
        captainAssists: stats[cap.element]?.assists || 0,
        benchPlayersPts,
        red, yellow, goals, assists, ownGoals, penMiss, bonus, cleanSheets,
        autoSubs: picks.automatic_subs.length, autoSubPts, best,
        finLuck: r1l(finLuck), csLuck: r1l(csLuck), gcLuck: r1l(gcLuck),
        lateGain, lateLoss, lateInfo, lateFor, lateAgainst, knocks, injured,
        lazyPts, // Punkte ohne die Transfers dieser Runde (null = keine Transfers)
        transfersIn: tIn,
      });
    }
    // Laufende Gameweek (Deadline vorbei, noch nicht fertig) zusätzlich anhängen
    if (squadGW && !squads.some(s => s.gw === squadGW)) {
      squads.push(buildSquad(await rule(await get(`/entry/${e.entry}/event/${squadGW}/picks/`), squadGW), squadGW));
    }
    // Transfers je Gameweek (Transfer-Block der laufenden GW): [rein, raus, Punkte rein, Punkte raus, Min. rein, Min. raus]
    for (const sq of squads) {
      const st = live[sq.gw] || {};
      sq.tr = transfers.filter(t => t.event === sq.gw).reverse().map(t => {
        for (const id of [t.element_in, t.element_out]) {
          const el = elements[id], tm = el && teamById[el.team];
          if (el && !squadPlayers[id]) squadPlayers[id] = [el.web_name, el.element_type, tm.short_name, tm.code];
        }
        return [t.element_in, t.element_out, st[t.element_in]?.total_points ?? 0, st[t.element_out]?.total_points ?? 0,
          st[t.element_in]?.minutes ?? 0, st[t.element_out]?.minutes ?? 0];
      });
    }
    // Aktueller Teamwert wie auf der FPL-Seite: heutige Marktwerte des letzten Kaders + Bank
    // (FPL-History liefert nur den Wert zur letzten Deadline; Preise ändern sich danach täglich)
    let valueNow = null, bankNow = null;
    const lastSq = squads[squads.length - 1];
    const lastH = hist.current.find(h => h.event === lastSq?.gw);
    if (lastSq && lastH) {
      bankNow = lastH.bank / 10;
      valueNow = Math.round(lastSq.picks.reduce((s, p) => s + (elements[p[0]]?.now_cost || 0), 0) + lastH.bank) / 10;
    }
    managers.push({
      id: e.entry, nick: meta.nick, avatar: meta.avatar, valueNow, bankNow,
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

  // Laufende GW: Anstoßzeiten + Status, damit die Seite erkennt, ob gerade wirklich gespielt wird
  let current = null;
  const curEv = boot.events.find(e => e.is_current);
  if (curEv) {
    try {
      const fx = await get(`/fixtures/?event=${curEv.id}`);
      current = {
        gw: curEv.id,
        fixtures: fx.filter(x => x.kickoff_time).map(x => ({
          kickoff: x.kickoff_time, done: !!(x.finished || x.finished_provisional),
          h: boot.teams.find(t => t.id === x.team_h)?.code, a: boot.teams.find(t => t.id === x.team_a)?.code,
        })),
      };
    } catch (err) { console.warn('Spielplan der laufenden GW nicht verfügbar:', err.message); }
  }

  // Spielkalender (alle Spiele mit Ereignissen) – darf nie den Rest blockieren
  try {
    const { writeFixtures } = require('./fixtures');
    console.log('Spielkalender:', await writeFixtures(boot, get), 'Spiele -> data/fixtures.json');
  } catch (err) { console.warn('Spielkalender nicht verfügbar:', err.message); }

  const out = {
    updated: new Date().toISOString(),
    league: { id: LEAGUE_ID, name: league.league.name },
    lastGW,
    provisionalGW,
    next,
    current,
    managers,
    players: squadPlayers,
  };
  const file = path.join(__dirname, '..', 'data', 'data.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out, null, 1));
  console.log(`OK – ${managers.length} Manager, bis GW ${lastGW} -> data/data.json`);
})().catch(e => { console.error(e); process.exit(1); });
