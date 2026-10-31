// Deadline Day (von der Business-Seite übernommen, Patrick 31.10.2026): von der Deadline bis zum Ende der Gameweek –
// wer hat wen in der Liga (Liga-Besitz/EO, Differentials) und „Wenn er trifft…“: wer gewinnt und wer verliert
// gegenüber der Liga, wenn ein Spieler trifft. Texte zweisprachig wie auf der Business-Seite (hier <html lang="de">).
// Nutzt $, av, esc aus app.js.
function renderDeadlineDay(d, ms, gw) {
  const el = $('dday');
  if (!el) return;
  if (!gw) { el.hidden = true; el.innerHTML = ''; return; }
  const de = document.documentElement.lang === 'de', t = (en, g) => de ? g : en;
  const P = id => d.players[id] || ['?', 0, '', 0];   // [name, position 1–4, team short, team code]
  const GOAL = { 1: 10, 2: 6, 3: 5, 4: 4 };            // FPL points for a goal by position
  const n1 = v => (Math.round(v * 10) / 10).toLocaleString(de ? 'de-DE' : 'en-GB', { maximumFractionDigits: 1 });
  const sq = (m, g) => (m.squads || []).find(s => s.gw === g);
  const rows = ms.map(m => ({ m, s: sq(m, gw) })).filter(r => r.s);
  if (!rows.length) { el.hidden = true; return; }
  const N = rows.length;

  // ---------- transfers + chips: this squad vs. the last one before it (a Free Hit week is skipped – the squad comes back)
  const CHIP = { wildcard: t('♻️ Wildcard', '♻️ Wildcard'), freehit: t('🎯 Free Hit', '🎯 Free Hit'), bboost: t('🪑 Bench Boost', '🪑 Bench Boost'), '3xc': t('3️⃣ Triple Captain', '3️⃣ Triple Captain') };
  const moves = rows.map(({ m, s }) => {
    const prev = (m.squads || []).filter(x => x.gw < gw && x.chip !== 'freehit').sort((a, b) => b.gw - a.gw)[0];
    const now = new Set(s.picks.map(p => p[0])), before = new Set(prev ? prev.picks.map(p => p[0]) : []);
    const ins = prev ? [...now].filter(id => !before.has(id)) : [], outs = prev ? [...before].filter(id => !now.has(id)) : [];
    // pair them up by position, the way FPL transfers work
    const pairs = [];
    for (const pos of [1, 2, 3, 4]) {
      const i = ins.filter(id => P(id)[1] === pos), o = outs.filter(id => P(id)[1] === pos);
      for (let k = 0; k < Math.max(i.length, o.length); k++) pairs.push([o[k], i[k]]);
    }
    const g = (m.gws || []).find(x => x.gw === gw);
    return { m, chip: s.chip, pairs, hits: g?.hits || 0, known: !!prev };
  });
  const tally = key => {
    const c = {};
    for (const r of moves) for (const p of r.pairs) if (p[key]) c[p[key]] = (c[p[key]] || 0) + 1;
    return Object.entries(c).filter(([, k]) => k > 1).sort((a, b) => b[1] - a[1]).slice(0, 3);
  };
  const hot = tally(1), sold = tally(0);
  const chips = moves.filter(r => r.chip);
  // the 🔁 transfer block (app.js renderTransfers, rendered just before) already lists transfers, most bought/sold and hits
  const tb = !!$('trans') && !$('trans').hidden;
  const sum = [];
  if (hot.length && !tb) sum.push(`🔥 ${t('Bought most', 'Am meisten gekauft')}: ${hot.map(([id, k]) => `<b>${esc(P(id)[0])}</b> (${k}×)`).join(', ')}`);
  if (sold.length && !tb) sum.push(`👋 ${t('Sold most', 'Am meisten verkauft')}: ${sold.map(([id, k]) => `<b>${esc(P(id)[0])}</b> (${k}×)`).join(', ')}`);
  const rollers = moves.filter(r => r.known && !r.pairs.length && !r.chip).length;
  if (rollers) sum.push(`🧊 ${t(`${rollers} saved their transfer`, `${rollers} ${rollers === 1 ? 'hat' : 'haben'} den Transfer gespart`)}`);
  const hitters = moves.filter(r => r.hits).sort((a, b) => b.hits - a.hits);
  if (hitters.length && !tb) sum.push(`💸 ${t('Took a hit', 'Hit genommen')}: ${hitters.map(r => `<b>${esc(r.m.nick)}</b> (−${r.hits})`).join(', ')}`);
  if (chips.length) sum.push(`🃏 ${chips.map(r => `<b>${esc(r.m.nick)}</b> ${CHIP[r.chip] || esc(r.chip)}`).join(', ')}`);

  const pname = id => id ? esc(P(id)[0]) : '–';
  const moveRows = [...moves].sort((a, b) => (b.chip ? 99 : b.pairs.length) - (a.chip ? 99 : a.pairs.length)).map(r => {
    const what = r.chip === 'wildcard' || r.chip === 'freehit'
      ? `<span class="dd-chip">${CHIP[r.chip]}</span> <span class="dd-mut">${t(`${r.pairs.length} new players`, `${r.pairs.length} neue Spieler`)}</span>`
      : !r.known ? '<span class="dd-mut">–</span>'
      : r.pairs.length ? r.pairs.map(([o, i]) => `<span class="dd-mv"><s>${pname(o)}</s> → <b>${pname(i)}</b></span>`).join('') + (r.chip ? ` <span class="dd-chip">${CHIP[r.chip]}</span>` : '')
      : `<span class="dd-mut">${t('no transfer', 'kein Transfer')}</span>${r.chip ? ` <span class="dd-chip">${CHIP[r.chip]}</span>` : ''}`;
    return `<div class="dd-row"><span class="dd-who"><img class="av" src="${av(r.m)}" alt="">${esc(r.m.nick)}</span><span class="dd-what">${what}${r.hits ? ` <span class="dd-hit">−${r.hits}</span>` : ''}</span></div>`;
  }).join('');

  // ---------- league ownership: multiplier per manager (0 bench, 1 XI, 2 captain, 3 Triple Captain)
  const own = {};
  for (const { m, s } of rows) for (const p of s.picks) {
    const o = own[p[0]] ||= { id: p[0], pts: p[4] || 0, owners: [], mult: {} };
    o.owners.push(m); o.mult[m.id] = p[2];
  }
  const list = Object.values(own).map(o => {
    const eo = rows.reduce((a, r) => a + (o.mult[r.m.id] || 0), 0) / N;
    const starters = o.owners.filter(m => o.mult[m.id] > 0), caps = o.owners.filter(m => o.mult[m.id] >= 2);
    return Object.assign(o, { eo, starters, caps });   // kept on own[id] too (used by "if he scores")
  });
  const top = list.filter(o => o.starters.length).sort((a, b) => b.eo - a.eo || b.pts - a.pts).slice(0, 10);
  const diffs = N > 2 ? list.filter(o => o.starters.length === 1).sort((a, b) => b.pts - a.pts || P(a.id)[1] - P(b.id)[1]).slice(0, 8) : [];
  const badge = id => `<img class="badge" src="assets/badges/${P(id)[3]}.png" alt="" onerror="this.style.visibility='hidden'">`;
  const ownRows = top.map(o => `<tr><td><a href="#spieler/${o.id}" class="dd-pl">${badge(o.id)}<b>${esc(P(o.id)[0])}</b></a></td>
    <td class="num">${o.owners.length}/${N}</td><td class="num">${o.caps.length || '–'}</td>
    <td class="num"><div class="dd-bar"><i style="width:${Math.min(100, o.eo / 2 * 100)}%"></i><span>${Math.round(o.eo * 100)}%</span></div></td>
    <td class="num"><b>${o.pts}</b></td></tr>`).join('');

  // ---------- "if he scores": gain against the league average (own multiplier − league EO) × goal points
  // only players where it makes a difference (not when everyone has him with the same multiplier)
  const pick = [...top, ...diffs].filter((o, i, a) => a.findIndex(x => x.id === o.id) === i && rows.some(r => Math.abs((o.mult[r.m.id] || 0) - o.eo) > 0.05)).slice(0, 12);
  const swing = id => {
    const o = own[id], g = GOAL[P(id)[1]] || 4;
    return rows.map(r => ({ m: r.m, v: ((o.mult[r.m.id] || 0) - o.eo) * g })).sort((a, b) => b.v - a.v);
  };
  const swingHtml = id => {
    const s = swing(id), up = s.filter(x => x.v > 0.05), down = s.filter(x => x.v < -0.05);
    const chip = x => `<span class="${x.v > 0 ? 'up' : 'down'}"><img class="av" src="${av(x.m)}" alt="">${esc(x.m.nick)} <b>${x.v > 0 ? '+' : '−'}${n1(Math.abs(x.v))}</b></span>`;
    return `<p class="dd-mut" style="margin:0 0 8px">${t(`A goal by <b>${esc(P(id)[0])}</b> = ${GOAL[P(id)[1]]} pts. Compared with the league average:`, `Ein Tor von <b>${esc(P(id)[0])}</b> = ${GOAL[P(id)[1]]} Punkte. Im Vergleich zum Liga-Schnitt:`)}</p>
      <div class="dd-sw">${up.map(chip).join('')}</div><div class="dd-sw">${down.map(chip).join('')}</div>`;
  };

  el.innerHTML = `<h2>⏰ ${t(`Deadline Day · Gameweek ${gw}`, `Deadline Day · Gameweek ${gw}`)}</h2>
    ${sum.length ? `<div class="caps-sum">${sum.map(s => `<span>${s}</span>`).join('')}</div>` : ''}
    <div class="dd-grid">
      ${tb ? '' : `<div class="dd-card"><h3>🔁 ${t('Transfers & chips', 'Transfers & Chips')}</h3>${moveRows}</div>`}
      <div class="dd-card"><h3>👥 ${t('Who owns whom', 'Wer hat wen')}</h3>
        <div class="dd-tbl"><table><tr><th>${t('Player', 'Spieler')}</th><th class="num">${t('Owned', 'Im Team')}</th><th class="num">©️</th><th class="num" title="${t('League ownership incl. captaincy', 'Liga-Besitz inkl. Kapitän')}">EO</th><th class="num">${t('Pts', 'Pkt.')}</th></tr>${ownRows}</table></div>
        ${diffs.length ? `<p class="dd-diff">🦄 <b>${t('Differentials', 'Differentials')}</b> – ${t('only one manager has him in the XI', 'nur ein Manager hat ihn in der Startelf')}: ${diffs.map(o => `${esc(P(o.id)[0])} <span class="dd-mut">(${esc(o.starters[0].nick)})</span>`).join(', ')}</p>` : ''}
        <p class="dd-mut" style="margin-top:6px">${t('EO = league ownership: 100% = on average one starting XI per manager, captains count double. Over 100% = the league captained him.', 'EO = Liga-Besitz: 100 % = im Schnitt einmal pro Manager in der Startelf, Kapitäne zählen doppelt. Über 100 % = die Liga hat ihn zum Kapitän gemacht.')}</p></div>
      ${pick.length ? `<div class="dd-card"><h3>⚽ ${t('If he scores…', 'Wenn er trifft…')}</h3>
        <div class="dd-pick">${pick.map((o, i) => `<button type="button" data-p="${o.id}" class="${i ? '' : 'on'}">${esc(P(o.id)[0])}</button>`).join('')}</div>
        <div id="dd-swing">${swingHtml(pick[0].id)}</div></div>` : ''}
    </div>
    <p class="foot">${tb ? t('From the deadline until the gameweek is over.', 'Von der Deadline bis zum Ende der Gameweek.') : t('From the deadline until the gameweek is over. Transfers = squad compared with last gameweek’s (a Free Hit week is skipped).', 'Von der Deadline bis zum Ende der Gameweek. Transfers = Kader im Vergleich zur letzten Gameweek (eine Free-Hit-Woche wird übersprungen).')}</p>`;
  el.querySelectorAll('.dd-pick button').forEach(b => b.onclick = () => {
    el.querySelectorAll('.dd-pick button').forEach(x => x.classList.toggle('on', x === b));
    $('dd-swing').innerHTML = swingHtml(Number(b.dataset.p));
  });
  el.hidden = false;
}
