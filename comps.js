// Gentlemen's League – interne Wettbewerbe: Champions League (Gruppen + K.o.) und FPL Cup (K.o.)
// Tore = FPL-Punkte der Gameweek vor Abzug der Transfer-Minuspunkte (gross).
// (nutzt $, av, esc aus app.js)

function renderComps(d, comp, hist) {
  if (!comp) return;
  const byAv = Object.fromEntries(d.managers.map(m => [m.avatar, m]));
  // Tore = Punkte vor Transfer-Abzug. Minuspunkte bis zur Freigrenze (Standard 8 = 2 Zusatzwechsel) zählen nicht;
  // liegt man darüber (ab 3 Zusatzwechseln = −12), werden ALLE Minuspunkte abgezogen.
  const free = comp.freeHitPoints ?? 8;
  const gwOf = (a, gw) => byAv[a]?.gws.find(g => g.gw === gw);
  const penalty = (a, gw) => { const g = gwOf(a, gw); const h = g?.hits || 0; return h > free ? h : 0; };
  const goals = (a, gw) => { const g = gwOf(a, gw); return g ? g.gross - penalty(a, gw) : null; };
  const played = gw => gw <= d.lastGW;
  const code = { Achtelfinale: 'AF', Viertelfinale: 'VF', Halbfinale: 'HF', Finale: 'F' };
  const ctx = {}; // Platzhalter -> Avatar-Name (A1, VF2, …)
  const hint = {}; // Platzhalter -> vorläufiger Name (z. B. aktueller Gruppenplatz)

  const nameOf = x => byAv[x]?.nick || x;
  const person = (x, right) => {
    const m = byAv[x];
    if (m) return `<span class="mt ${right ? 'r' : ''}"><img class="av" src="${av(m)}" alt=""><b>${esc(m.nick)}</b></span>`;
    const label = x.replace(/^A(\d)$/, 'Gruppe A · $1.').replace(/^B(\d)$/, 'Gruppe B · $1.').replace(/^(VF|HF|AF)(\d)$/, 'Sieger $1 $2');
    return `<span class="mt tbd ${right ? 'r' : ''}"><img class="av" src="assets/avatars/unknown.svg" alt=""><b>${esc(label)}</b>${hint[x] ? `<small>aktuell: ${esc(nameOf(hint[x]))}</small>` : ''}</span>`;
  };
  const resolve = x => byAv[x] ? x : (ctx[x] || x);

  // Ein Spiel (ein Spieltag)
  const game = (h, a, gw) => {
    h = resolve(h); a = resolve(a);
    const ready = byAv[h] && byAv[a] && played(gw);
    const hs = ready ? goals(h, gw) : null, as = ready ? goals(a, gw) : null;
    const pens = ready ? [[h, penalty(h, gw)], [a, penalty(a, gw)]].filter(p => p[1] > 0) : [];
    return { h, a, gw, hs, as, pens, done: hs != null && as != null };
  };
  // Hinweis, wenn jemand mehr als 3 Zusatzwechsel gemacht hat
  const penNote = gs => {
    const all = gs.flatMap(g => g.pens.map(([who, p]) => `${esc(nameOf(who))} −${p} (GW ${g.gw})`));
    return all.length ? `<div class="pen-note">⚠️ 3+ Zusatzwechsel – alle Minuspunkte zählen:${all.join(', ')}</div>` : '';
  };
  const matchRow = g => {
    const cls = s => !g.done ? '' : s === 'h' ? (g.hs > g.as ? 'win' : g.hs < g.as ? 'lose' : 'draw') : (g.as > g.hs ? 'win' : g.as < g.hs ? 'lose' : 'draw');
    return `<div class="match ${g.done ? 'done' : ''}">
      <div class="${cls('h')}">${person(g.h)}</div>
      <div class="sc">${g.done ? `${g.hs}<i>:</i>${g.as}` : `<small>GW ${g.gw}</small>`}</div>
      <div class="${cls('a')}">${person(g.a, true)}</div>
    </div>${g.done ? '' : oddsBar(g.h, g.a, chance(g.h, g.a))}${penNote([g])}`;
  };

  // K.o.-Duell (Hin- und Rückspiel oder ein Spiel)
  const tie = (t, gws) => {
    const legs = gws.length === 2 ? [game(t[0], t[1], gws[0]), game(t[1], t[0], gws[1])] : [game(t[0], t[1], gws[0])];
    const A = resolve(t[0]), B = resolve(t[1]);
    const sum = who => legs.reduce((s, g) => s + (g.done ? (g.h === who ? g.hs : g.as) : 0), 0);
    const done = legs.every(g => g.done);
    const sa = sum(A), sb = sum(B);
    const winner = done ? (sa > sb ? A : sb > sa ? B : null) : null;
    return { A, B, legs, sa, sb, done, winner, any: legs.some(g => g.done) };
  };
  // --- Siegchance ---
  // Stärke = erwartete Punkte pro Spieltag (Patrick 20.11.2026: aktuelle Form + Kader zählen mehr, Vergangenheit weniger):
  //   30 % Kader-Prognose für die nächste Runde (FPL „expected points“ der Startelf, Kapitän doppelt)
  //   35 % Form (Ø letzte 3 GWs) + 20 % Ø aktuelle Saison + 15 % Ø pro GW der letzten 2 Saisonen (neuere doppelt)
  //   fehlt ein Teil (z. B. keine Vorsaison), zählen die übrigen anteilig mehr
  //   + 1 je Sieg, − 1 je Niederlage in den letzten 3 CL-/Cup-Spielen (Remis zählen nicht)
  // Chance = Normalverteilung der Punktedifferenz (Streuung 20 Punkte je Spiel), bei 2 Spielen inkl. Zwischenstand.
  const SIGMA = 20;
  const prevSeasons = (() => { const y = +String(comp.season || '').slice(0, 4); return y ? [1, 2].map(k => `${y - k}/${String(y - k + 1).slice(2)}`) : []; })();
  const seasonPts = (a, s) => {
    const row = (hist?.seasons?.[s] || []).find(r => r.who === a);
    if (row?.points) return row.points;
    return byAv[a]?.past?.find(p => p.season === s)?.points ?? null;
  };
  let record = null;
  const compRecord = () => { // je Manager die CL-/Cup-Ergebnisse: [Spieltag, +1 Sieg / −1 Niederlage]
    if (record) return record;
    record = {};
    const count = g => {
      if (!g.done || !byAv[g.h] || !byAv[g.a] || g.hs === g.as) return;
      const [w, l] = g.hs > g.as ? [g.h, g.a] : [g.a, g.h];
      (record[w] ||= []).push([g.gw, 1]); (record[l] ||= []).push([g.gw, -1]);
    };
    comp.cl.rounds.forEach(r => r.matches.forEach(([h, a]) => count(game(h, a, r.gw))));
    [...comp.cl.knockout, ...comp.cup.rounds].forEach(r => r.ties.filter(t => byAv[t[0]] && byAv[t[1]]).forEach(t => tie(t, r.gws).legs.forEach(count)));
    return record;
  };
  // Kader-Prognose: FPL-Erwartungspunkte (d.ep[id] = [diese Runde, nächste Runde]) der Startelf, Kapitän doppelt.
  // Läuft gerade eine Runde, zählt deren echte Aufstellung; sonst die letzte bekannte (die neue sieht man erst nach der Deadline).
  const squadForecast = a => {
    const sq = (byAv[a]?.squads || []).at(-1);
    if (!d.ep || !sq?.picks?.length) return null;
    const k = sq.finished === false ? 0 : 1;
    let s = 0, any = false;
    for (const p of sq.picks) {
      if (p[1] > 11) continue;
      const ep = d.ep[p[0]];
      if (!ep?.[k]) continue;
      any = true; s += (ep[k] || 0) * (p[3] === 1 ? 2 : 1);
    }
    return any ? s : null;
  };
  const strengthCache = {}, parts = {};
  const strength = a => {
    if (strengthCache[a] != null) return strengthCache[a];
    const m = byAv[a];
    const gws = m.gws.filter(g => g.gw <= d.lastGW).sort((x, y) => x.gw - y.gw);
    const avg = l => l.length ? l.reduce((s, g) => s + g.gross, 0) / l.length : 50;
    const form = avg(gws.slice(-3)), season = avg(gws);
    const past = prevSeasons.map((s, i) => [seasonPts(a, s), i ? 1 : 2]).filter(x => x[0]);
    const pastAvg = past.length ? past.reduce((s, [p, w]) => s + p / 38 * w, 0) / past.reduce((s, [, w]) => s + w, 0) : null;
    const squad = squadForecast(a);
    const mix = [[squad, 0.30], [form, 0.35], [season, 0.20], [pastAvg, 0.15]].filter(x => x[0] != null);
    const base = mix.reduce((s, [v, w]) => s + v * w, 0) / mix.reduce((s, [, w]) => s + w, 0);
    const last3 = [...(compRecord()[a] || [])].sort((x, y) => y[0] - x[0]).slice(0, 3);
    const r = last3.length ? { w: last3.filter(x => x[1] > 0).length, l: last3.filter(x => x[1] < 0).length } : null;
    const recB = r ? r.w - r.l : 0;
    const e = base + recB;
    parts[a] = { squad, form, season, pastAvg, base, r, recB, e };
    return (strengthCache[a] = e);
  };
  const phi = z => { // Standardnormalverteilung
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const p = 1 - 0.3989423 * Math.exp(-z * z / 2) * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return z >= 0 ? p : 1 - p;
  };
  // Chance von A gegen B; lead = aktueller Vorsprung von A, n = verbleibende Spiele
  const chance = (A, B, lead = 0, n = 1) => {
    if (!byAv[A] || !byAv[B] || n < 1) return null;
    const p = phi((lead + (strength(A) - strength(B)) * n) / (SIGMA * Math.sqrt(n)));
    return Math.max(0.02, Math.min(0.98, p));
  };
  // „So wird gerechnet“ – erscheint beim Drüberfahren mit der Maus bzw. Antippen (Patrick 20.11.2026)
  const n1 = x => x.toFixed(1).replace('.', ',');
  const sgn = x => (x >= 0 ? '+' : '−') + n1(Math.abs(x));
  const why = (A, B, p, lead = 0, n = 1) => {
    if (p == null) return '';
    strength(A); strength(B);
    const line = a => { const q = parts[a];
      return `${nameOf(a)}: ${q.squad != null ? `Kader ${n1(q.squad)} · ` : ''}Form ${n1(q.form)} · Saison ${n1(q.season)}${q.pastAvg != null ? ` · Vorsaisonen ${n1(q.pastAvg)}` : ''} → ${n1(q.base)}` +
        (q.r ? ` · CL/Cup zuletzt ${q.r.w}–${q.r.l}: ${sgn(q.recB)}` : '') + ` = ${n1(q.e)} Pkt/GW`; };
    const diff = strength(A) - strength(B), fav = diff >= 0 ? A : B;
    const pa = Math.round(p * 100);
    return [`📊 So wird gerechnet (erwartete Punkte pro GW):`, line(A), line(B),
      `Unterschied: ${n1(Math.abs(diff))} Pkt/GW für ${nameOf(fav)}${n > 1 ? ` × ${n} Spiele` : ''}${lead ? ` · Zwischenstand ${lead > 0 ? '+' : '−'}${Math.abs(lead)} für ${nameOf(lead > 0 ? A : B)}` : ''}`,
      `Zufall: ± 20 Punkte je Spieltag → ${nameOf(A)} ${pa} % : ${100 - pa} % ${nameOf(B)}`,
      `(Kader = FPL-Prognose der Startelf für die Runde, Kapitän doppelt ×30 %; Form = Ø letzte 3 GWs ×35 %; Saison-Ø ×20 %; Vorsaisonen ×15 %; ±1 je Sieg/Niederlage in den letzten 3 CL-/Cup-Spielen)`].join('\n');
  };
  const whyAttr = (A, B, p, lead, n) => { const w = why(A, B, p, lead, n); return w ? ` title="${esc(w)}" data-why="${esc(w)}" tabindex="0"` : ''; };
  const oddsBar = (A, B, p, lead = 0, n = 1) => {
    if (p == null) return '';
    const a = Math.round(p * 100), b = 100 - a;
    return `<div class="odds"${whyAttr(A, B, p, lead, n)}>
      <span class="${a >= b ? 'fav' : ''}">${a} %</span>
      <div class="odds-bar"><i class="${a >= b ? 'fav' : ''}" style="width:${a}%"></i><i class="${b > a ? 'fav' : ''}" style="width:${b}%"></i></div>
      <span class="${b > a ? 'fav' : ''}">${b} %</span>
    </div>`;
  };
  const oddsNote = `<p class="gnote odds-note">📊 <b>Siegchance:</b> erwartete Punkte pro Spieltag aus der FPL-Prognose für die Startelf der Runde (30 %, Kapitän doppelt), der Form (Ø letzte 3 GWs, 35 %), der aktuellen Saison (20 %) und den letzten 2 Saisonen (15 %). Dazu +1 je Sieg und −1 je Niederlage in den letzten 3 CL-/Cup-Spielen. Bei Hin- und Rückspiel zählt der Zwischenstand mit. Mit der Maus über die Prozente fahren (am Handy antippen) zeigt die Rechnung. Reine Spielerei – FPL bleibt Glückssache.</p>`;

  // Siegchance direkt in der Zeile des Managers (Mini-Balken + Prozent)
  const rowChance = (x, who) => {
    if (x.done) return '';
    const p = chance(x.A, x.B, x.sa - x.sb, x.legs.filter(g => !g.done).length);
    if (p == null) return '';
    const pa = Math.round(p * 100), v = who === x.A ? pa : 100 - pa, fav = v > 50 || (v === 50 && who === x.A);
    return `<span class="tchance ${fav ? 'fav' : ''}"${whyAttr(x.A, x.B, p, x.sa - x.sb, x.legs.filter(g => !g.done).length)}><span class="tbar"><i style="width:${v}%"></i></span><b>${v}\u00a0%</b></span>`;
  };
  const tieCard = (x, round) => `
    <div class="tie ${x.done ? 'done' : ''}">
      ${[['A', x.A, x.sa], ['B', x.B, x.sb]].map(([k, who, s]) => `
        <div class="tie-row ${x.winner === who ? 'win' : x.done && x.winner ? 'lose' : ''}">
          ${person(who)}
          ${rowChance(x, who) || '<span></span>'}
          <span class="legs">${x.legs.map(g => `<i>${g.done ? (g.h === who ? g.hs : g.as) : '–'}</i>`).join('')}</span>
          <span class="agg">${x.any ? s : ''}</span>
        </div>`).join('')}
      <div class="tie-foot">${x.legs.map((g, i) => `${x.legs.length > 1 ? (i ? 'Rück' : 'Hin') : round} GW ${g.gw}`).join(' · ')}${x.done && !x.winner ? ' · <b>Gleichstand!</b>' : ''}</div>
      ${penNote(x.legs)}
    </div>`;
  const koRound = (r, pre) => {
    const ties = r.ties.map(t => tie(t, r.gws));
    ties.forEach((x, i) => { if (x.winner) ctx[(code[r.name] || pre) + (i + 1)] = x.winner; });
    return `<div class="ko-round"><h3>${esc(r.name)}</h3>${ties.map(x => tieCard(x, r.name)).join('')}</div>`;
  };

  // --- Champions League: Gruppentabellen ---
  const cl = comp.cl;
  const allGames = cl.rounds.flatMap(r => r.matches.map(([h, a]) => game(h, a, r.gw)));
  const table = (teams, games) => {
    const s = Object.fromEntries(teams.map(t => [t, { t, S: 0, U: 0, N: 0, gf: 0, ga: 0, P: 0 }]));
    for (const g of games) {
      if (!g.done || !s[g.h] || !s[g.a]) continue;
      const H = s[g.h], A = s[g.a];
      H.gf += g.hs; H.ga += g.as; A.gf += g.as; A.ga += g.hs;
      if (g.hs > g.as) { H.S++; A.N++; H.P += 3; } else if (g.hs < g.as) { A.S++; H.N++; A.P += 3; } else { H.U++; A.U++; H.P++; A.P++; }
    }
    return Object.values(s);
  };
  // Sortierung: Punkte, dann Tordifferenz, dann geschossene Tore, erst danach der direkte Vergleich
  const sortGroup = (rows, games) => {
    const cmpBasic = (a, b) => (b.P - a.P) || ((b.gf - b.ga) - (a.gf - a.ga)) || (b.gf - a.gf);
    rows.sort(cmpBasic);
    const out = [];
    for (let i = 0; i < rows.length;) {
      let j = i; while (j < rows.length && cmpBasic(rows[j], rows[i]) === 0) j++;
      const tied = rows.slice(i, j);
      if (tied.length > 1) {
        const ids = tied.map(r => r.t);
        const h2h = Object.fromEntries(table(ids, games.filter(g => ids.includes(g.h) && ids.includes(g.a))).map(r => [r.t, r]));
        tied.sort((a, b) => (h2h[b.t].P - h2h[a.t].P) || ((h2h[b.t].gf - h2h[b.t].ga) - (h2h[a.t].gf - h2h[a.t].ga)) || (h2h[b.t].gf - h2h[a.t].gf));
      }
      out.push(...tied); i = j;
    }
    return out;
  };
  const groupsDone = cl.rounds.every(r => played(r.gw));
  const groupHtml = Object.entries(cl.groups).map(([name, teams]) => {
    const games = allGames.filter(g => teams.includes(g.h));
    const rows = sortGroup(table(teams, games), games);
    rows.forEach((r, i) => { (groupsDone ? ctx : hint)[name + (i + 1)] = r.t; });
    return `<div class="group">
      <h3>Gruppe ${name}</h3>
      <table><thead><tr><th>#</th><th>Manager</th><th class="num">S</th><th class="num">U</th><th class="num">N</th><th class="num hide-m">Tore</th><th class="num">Diff</th><th class="num">Pkt</th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr class="${i < 4 ? '' : 'out'}">
        <td class="rank">${i + 1}</td>
        <td><div class="who"><img class="av" src="${av(byAv[r.t])}" alt=""><div>${esc(nameOf(r.t))}</div></div></td>
        <td class="num">${r.S}</td><td class="num">${r.U}</td><td class="num">${r.N}</td>
        <td class="num hide-m">${r.gf}:${r.ga}</td>
        <td class="num">${r.gf - r.ga > 0 ? '+' : ''}${r.gf - r.ga}</td>
        <td class="num total">${r.P}</td></tr>`).join('')}</tbody></table>
      <p class="gnote">Platz 1–4 im Viertelfinale · Platz 5 scheidet aus</p>
    </div>`;
  }).join('');

  // Runden: zuletzt gespielte & nächste zuerst
  const clFinal = cl.knockout.find(r => r.name === 'Finale');
  const nextRound = cl.rounds.find(r => !played(r.gw));
  const lastRound = [...cl.rounds].reverse().find(r => played(r.gw));
  const roundBox = r => `<div class="round"><h3>${esc(r.name)} <small>GW ${r.gw}</small></h3>${r.matches.map(([h, a]) => matchRow(game(h, a, r.gw))).join('')}</div>`;

  $('cl').innerHTML = `
    <div class="groups">${groupHtml}</div>
    <h2>Spieltage</h2>
    <div class="rounds">${[lastRound, nextRound].filter(Boolean).map(roundBox).join('')}</div>
    <details class="all-rounds"><summary>Alle Gruppenspiele anzeigen</summary><div class="rounds">${cl.rounds.map(roundBox).join('')}</div></details>
    <h2>K.o.-Phase</h2>
    <div class="ko ko-cl">${(() => {
      // Spalte 1: Viertelfinale · Spalte 2: Halbfinale + Finale (unten bündig)
      const [vf, ...rest] = cl.knockout.filter(r => r.name !== 'Finale').map(r => koRound(r, 'KO'));
      return `${vf}<div class="ko-col">${rest.join('')}${clFinal ? finalGold(clFinal, 'Champions-League-Sieger', true) : ''}</div>`;
    })()}</div>
    ${oddsNote}`;

  // --- Cup ---
  for (const k of Object.keys(ctx)) if (/^(VF|HF|AF|F)\d$/.test(k)) delete ctx[k];
  const sc = comp.supercup;
  const sg = sc && game(sc.home, sc.away, sc.gw);
  const cupRounds = comp.cup.rounds.filter(r => r.name !== 'Finale');
  const cupFinal = comp.cup.rounds.find(r => r.name === 'Finale');
  const cupHtml = cupRounds.map(r => koRound(r, 'R')).join('');
  $('cup').innerHTML = `
    ${sg ? `<div class="supercup"><h3>🛡️ Supercup <small>${esc(sc.note || '')} · GW ${sc.gw}</small></h3>${matchRow(sg)}
      ${sg.done && sg.hs !== sg.as ? `<p class="sc-win">Supercup-Sieger: <b>${esc(nameOf(sg.hs > sg.as ? sg.h : sg.a))}</b></p>` : ''}</div>` : ''}
    <h2>${esc(comp.cup.name)}</h2>
    <div class="ko">${cupHtml}</div>
    ${cupFinal ? finalGold(cupFinal, 'Cupsieger') : ''}
    ${oddsNote}`;

  // Goldenes Finale mit Pokal
  function finalGold(r, winnerLabel, compact) {
    const x = tie(r.ties[0], r.gws);
    if (x.winner) {
      ctx.F1 = x.winner;
      // Sieger der laufenden Saison für die Hall of Fame merken
      window.COMP_WINNERS = window.COMP_WINNERS || { season: comp.season };
      window.COMP_WINNERS[winnerLabel === 'Cupsieger' ? 'cup' : 'cl'] = x.winner;
    }
    const g = x.legs[0];
    const side = (who, s) => `<div class="fg-side ${x.winner === who ? 'win' : x.winner ? 'lose' : ''}">
      ${byAv[who] ? `<img class="av" src="${av(byAv[who])}" alt="">` : `<img class="av" src="assets/avatars/unknown.svg" alt="">`}
      <b>${esc(byAv[who] ? byAv[who].nick : who.replace(/^HF(\d)$/, 'Sieger HF $1'))}</b>
      <span class="fg-score">${g.done ? s : ''}</span>
    </div>`;
    return `<div class="final-gold ${compact ? 'compact' : ''}">
      <div class="trophy">${TROPHY_SVG}</div>
      <div class="fg-body">
        <div class="fg-title">🏆 ${esc(r.name)} <small>GW ${r.gws.join(' + ')}</small></div>
        <div class="fg-match">${side(x.A, x.sa)}<span class="fg-vs">${g.done ? ':' : 'vs'}</span>${side(x.B, x.sb)}</div>
        ${x.done ? '' : oddsBar(x.A, x.B, chance(x.A, x.B, x.sa - x.sb, x.legs.filter(g => !g.done).length), x.sa - x.sb, x.legs.filter(g => !g.done).length)}
        ${x.winner ? `<div class="fg-winner">${winnerLabel} ${esc(byAv[x.winner].nick)}</div>` : `<div class="fg-when">Anpfiff in Gameweek ${r.gws[0]}</div>`}
      </div>
    </div>`;
  }
}

// Pokal-Grafik (eigene Zeichnung, Gold-Verlauf)
const TROPHY_SVG = `<svg viewBox="0 0 120 160" aria-hidden="true">
  <defs>
    <linearGradient id="tg" x1="0" x2="1"><stop offset="0" stop-color="#b8860b"/><stop offset=".35" stop-color="#ffe27a"/><stop offset=".6" stop-color="#f2c230"/><stop offset="1" stop-color="#a87400"/></linearGradient>
    <linearGradient id="tb" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#2a2870"/><stop offset="1" stop-color="#15143a"/></linearGradient>
  </defs>
  <path d="M28 18 C8 18 6 52 34 60" fill="none" stroke="url(#tg)" stroke-width="7" stroke-linecap="round"/>
  <path d="M92 18 C112 18 114 52 86 60" fill="none" stroke="url(#tg)" stroke-width="7" stroke-linecap="round"/>
  <path d="M26 10 H94 V34 C94 64 78 80 60 82 C42 80 26 64 26 34 Z" fill="url(#tg)"/>
  <path d="M34 14 V34 C34 56 44 70 52 74" fill="none" stroke="#fff6c8" stroke-width="4" stroke-linecap="round" opacity=".7"/>
  <path d="M60 30 l4.5 9 10 1.4 -7.2 7 1.7 10 -9-4.7 -9 4.7 1.7-10 -7.2-7 10-1.4z" fill="#fff6c8" opacity=".9"/>
  <rect x="52" y="82" width="16" height="18" fill="url(#tg)"/>
  <path d="M40 100 H80 L84 112 H36 Z" fill="url(#tg)"/>
  <rect x="30" y="112" width="60" height="30" rx="4" fill="url(#tb)"/>
  <rect x="40" y="120" width="40" height="14" rx="2" fill="url(#tg)"/>
</svg>`;

// Siegchance-Erklärung zum Antippen (Handy hat kein Drüberfahren)
document.addEventListener('click', e => {
  const el = e.target.closest('[data-why]');
  document.querySelectorAll('.why-pop').forEach(p => { if (!el || p.previousElementSibling !== el) p.remove(); });
  if (!el) return;
  if (el.nextElementSibling?.classList.contains('why-pop')) { el.nextElementSibling.remove(); return; }
  const p = document.createElement('div'); p.className = 'why-pop'; p.textContent = el.dataset.why; el.after(p);
});
