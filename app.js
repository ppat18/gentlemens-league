// Gentlemen's League – rendert Startseite aus data/data.json
const $ = id => document.getElementById(id);
const av = m => m.avatar ? `assets/avatars/${m.avatar}.webp` : 'assets/avatars/unknown.svg';
const esc = s => String(s).replace(/�/g, '').trim().replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const names = list => list.map(x => x.m.nick).join(' & ');

// Alle mit dem Maximalwert (Gleichstand = mehrere Gewinner)
function leaders(list, fn, dir = 1) {
  const vals = list.map(x => ({ ...x, v: fn(x) })).filter(x => x.v !== null);
  if (!vals.length) return [];
  const best = dir > 0 ? Math.max(...vals.map(x => x.v)) : Math.min(...vals.map(x => x.v));
  return vals.filter(x => x.v === best);
}

// --- Archiv-Einstellungen ---
// Erste Saison, die im Archiv / in der Hall of Fame zählt
const FIRST_SEASON = '2016/17';
// Manuelle Korrekturen, falls die berechnete Tabelle nicht der echten entspricht,
// z. B. { '2021/22': { champion: 'kai', last: 'favo' } }  (Avatar-Namen)
const HISTORY_OVERRIDES = {};
// FPL-Spieler weltweit je Saison (Endstand, Quelle: allaboutfpl.com) – für "Top X %"
const SEASON_PLAYERS = {
  '2010/11': 2.35e6, '2011/12': 2.78e6, '2012/13': 2.61e6, '2013/14': 3.22e6, '2014/15': 3.5e6,
  '2015/16': 3.73e6, '2016/17': 4.5e6, '2017/18': 5.19e6, '2018/19': 6.32e6, '2019/20': 7.63e6,
  '2020/21': 8.15e6, '2021/22': 9.17e6, '2022/23': 11.45e6, '2023/24': 10.91e6, '2024/25': 11.5e6,
  '2025/26': 13.1e6,
};
// Weltrang als "Top X %" (nur wenn Rang bekannt)
function topPct(rank, season) {
  const total = SEASON_PLAYERS[season];
  if (!rank || !total) return '';
  const p = rank / total * 100;
  const s = p < 1 ? p.toLocaleString('de-AT', { maximumFractionDigits: 2 })
    : p < 10 ? p.toLocaleString('de-AT', { maximumFractionDigits: 1 }) : Math.round(p);
  return `Top ${s} %`;
}

// --- Reiter ---
function showPage() {
  const page = (location.hash || '#start').slice(1);
  const exists = document.getElementById('page-' + page) ? page : 'start';
  document.querySelectorAll('.page').forEach(p => p.hidden = p.id !== 'page-' + exists);
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.page === exists));
  window.scrollTo(0, 0);
}
addEventListener('hashchange', showPage);
showPage();

Promise.all([
  fetch('data/data.json', { cache: 'no-cache' }).then(r => r.json()),
  fetch('data/history.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : { seasons: {} }).catch(() => ({ seasons: {} })),
  fetch('data/competitions.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null),
]).then(([d, hist, comp]) => { window.LEAGUE = d; render(d); renderHistory(d, hist); renderComps(d, comp); renderPreview(d, hist, comp); });

function render(d) {
  const GW = d.lastGW;
  const ms = [...d.managers].sort((a, b) => a.rank - b.rank);
  const gwOf = (m, gw = GW) => m.gws.find(g => g.gw === gw);
  const first = ms[0], last = ms[ms.length - 1];

  $('gw').textContent = `Gameweek ${GW}`;
  $('gw-title').textContent = `Gameweek ${GW} – Auszeichnungen`;
  $('updated').textContent = `Stand nach Gameweek ${GW} · aktualisiert ${new Date(d.updated).toLocaleString('de-AT', { timeZone: 'Europe/Vienna', dateStyle: 'medium', timeStyle: 'short' })} Uhr (österr. Zeit)`;

  // --- Hero ---
  $('hero').innerHTML = `
    <div class="hcard leader">
      <div class="crown">👑</div><br>
      <img class="av" src="${av(first)}" alt="${esc(first.nick)}">
      <span class="tag">Tabellenführer</span>
      <div class="name">${esc(first.nick)}</div>
      <div class="pts">${esc(first.team)} · ${first.total} Punkte · +${first.total - ms[1].total} Vorsprung</div>
    </div>
    <div class="hcard lantern">
      <div class="lamp">🏮</div><br>
      <img class="av" src="${av(last)}" alt="${esc(last.nick)}">
      <span class="tag">Rote Laterne</span>
      <div class="name">${esc(last.nick)}</div>
      <div class="pts">${esc(last.team)} · ${last.total} Punkte · ${first.total - last.total} hinter Platz 1</div>
    </div>`;

  // --- Auszeichnungen der letzten GW ---
  const cur = ms.map(m => ({ m, g: gwOf(m) })).filter(x => x.g);
  const prevRank = m => gwOf(m, GW - 1)?.leagueRank;
  const allT = cur.flatMap(x => x.g.transfersIn.map(t => ({ m: x.m, t, diff: t.inPts - t.outPts })));
  const awards = [];
  const add = (t, list, d, bad) => list.length && awards.push({ t, list, d, bad });

  const win = leaders(cur, x => x.g.points);
  add('🥇 Rundensieger', win, `${win[0]?.v} Punkte`);
  const lose = leaders(cur, x => x.g.points, -1);
  add('🥄 Rundenletzter', lose, `nur ${lose[0]?.v} Punkte`, 1);
  const bench = leaders(cur, x => x.g.bench);
  add('🪑 Pechvogel', bench, `${bench[0]?.v} Punkte auf der Bank`, 1);

  const caps = new Set(cur.map(x => x.g.captain));
  if (caps.size > 1) {
    const cb = leaders(cur, x => x.g.captainPts);
    add('©️ Kapitäns-Genie', cb, `${cb[0].g.captain} (C) · ${cb[0].v} Punkte`);
    const cw = leaders(cur, x => x.g.captainPts, -1);
    add('🤦 Kapitäns-Flop', cw, `${cw[0].g.captain} (C) · ${cw[0].v} Punkte`, 1);
  }
  if (allT.length) {
    const flop = leaders(allT, x => x.diff, -1);
    if (flop[0].v < 0) add('💸 Transfer-Flop', flop,
      `${flop[0].t.out} raus (${flop[0].t.outPts}) → ${flop[0].t.in} rein (${flop[0].t.inPts})`, 1);
    const hit = leaders(allT, x => x.diff);
    if (hit[0].v > 0) add('🎯 Transfer-Volltreffer', hit,
      `${hit[0].t.in} (${hit[0].t.inPts}) statt ${hit[0].t.out} (${hit[0].t.outPts})`);
  }
  const cards = leaders(cur, x => x.g.red * 3 + x.g.yellow);
  if (cards[0]?.v > 0) add('🟥 Treter der Woche', cards,
    `${cards[0].g.red ? cards[0].g.red + '× Rot, ' : ''}${cards[0].g.yellow}× Gelb`, 1);
  const hits = leaders(cur, x => x.g.hits);
  if (hits[0]?.v > 0) add('🔪 Hit-König', hits, `−${hits[0].v} Punkte für Zusatztransfers`, 1);
  const climb = leaders(cur, x => prevRank(x.m) ? prevRank(x.m) - x.g.leagueRank : null);
  if (climb[0]?.v > 0) add('🚀 Aufsteiger', climb, `+${climb[0].v} Plätze in der Tabelle`);
  const fall = leaders(cur, x => prevRank(x.m) ? prevRank(x.m) - x.g.leagueRank : null, -1);
  if (fall[0]?.v < 0) add('📉 Absteiger', fall, `${fall[0].v} Plätze in der Tabelle`, 1);
  // Form der letzten 3 Runden
  const formGWs = [GW - 2, GW - 1, GW].filter(g => g >= 1);
  const form = cur.map(x => ({ ...x, f: formGWs.reduce((a, g) => a + (gwOf(x.m, g)?.points || 0), 0) }));
  const hot = leaders(form, x => x.f);
  add('🔥 In Topform', hot, `${hot[0]?.v} Punkte in den letzten ${formGWs.length} Runden`);
  const cold = leaders(form, x => x.f, -1);
  add('🥶 Formtief', cold, `nur ${cold[0]?.v} Punkte in den letzten ${formGWs.length} Runden`, 1);
  const chips = cur.filter(x => x.g.chip);
  const chipName = { wildcard: 'Wildcard', freehit: 'Free Hit', bboost: 'Bench Boost', '3xc': 'Triple Captain' };
  chips.forEach(x => add('🃏 Chip gespielt', [x], `${chipName[x.g.chip] || x.g.chip} · ${x.g.points} Punkte`));

  $('awards').innerHTML = awards.map(a => {
    const m = a.list[0].m;
    const more = a.list.length > 1 ? ` <small>+${a.list.length - 1}</small>` : '';
    return `<div class="award ${a.bad ? 'bad' : ''}">
      <img class="av" src="${av(m)}" alt="${esc(m.nick)}">
      <div><div class="t">${a.t}</div><div class="n">${esc(names(a.list))}</div><div class="d">${esc(a.d)}</div></div>
    </div>`;
  }).join('');

  // --- Tabelle ---
  $('rows').innerHTML = ms.map(m => {
    const r = m.rank, diff = (m.lastRank || r) - r;
    const mv = diff > 0 ? `<span class="mv up">▲${diff}</span>` : diff < 0 ? `<span class="mv down">▼${-diff}</span>` : `<span class="mv same">–</span>`;
    const cls = r === 1 ? 'first' : r === ms.length ? 'last' : '';
    return `<tr class="${cls}">
      <td class="rank">${r}${mv}</td>
      <td><div class="who"><img class="av" src="${av(m)}" alt=""><div>${esc(m.nick)}${r === 1 ? ' 👑' : ''}${r === ms.length ? ' 🏮' : ''}<small>${esc(m.team)}</small></div></div></td>
      <td class="num hide-m">${gwOf(m)?.points ?? '–'}</td>
      <td class="num total">${m.total}</td>
    </tr>`;
  }).join('');

  // --- Spieltags-Bericht, Glück-o-Meter, Teamwert (extras.js) ---
  renderReport(ms, GW);
  renderRankChart(ms);
  renderLuck(ms);
  renderValue(ms, GW);
  renderChips(ms);

  // --- Saison-Auszeichnungen ---
  renderSeasonAwards(ms, GW);

  // --- Nächste Gameweek ---
  renderNext(d.next);

  // --- Saison-Statistik ---
  const gws = [...new Set(ms.flatMap(m => m.gws.map(g => g.gw)))];
  const winsOf = {}, lastOf = {};
  for (const gw of gws) {
    const row = ms.map(m => ({ m, g: gwOf(m, gw) })).filter(x => x.g);
    leaders(row, x => x.g.points).forEach(x => winsOf[x.m.id] = (winsOf[x.m.id] || 0) + 1);
    leaders(row, x => x.g.points, -1).forEach(x => lastOf[x.m.id] = (lastOf[x.m.id] || 0) + 1);
  }
  const sum = (m, k) => m.gws.reduce((a, g) => a + (g[k] || 0), 0);
  const rows = ms.map(m => ({
    m, cells: [
      winsOf[m.id] || 0, lastOf[m.id] || 0, Math.max(...m.gws.map(g => g.points)),
      sum(m, 'bench'), sum(m, 'captainPts'), sum(m, 'transfers'), sum(m, 'hits'),
      sum(m, 'yellow'), sum(m, 'red'), sum(m, 'goals'),
    ]
  }));
  // Bei welchen Spalten ist "hoch" gut (1) oder schlecht (-1)?
  const good = [1, -1, 1, -1, 1, 0, -1, -1, -1, 1];
  const colMax = good.map((_, i) => Math.max(...rows.map(r => r.cells[i])));
  $('stats').innerHTML = rows.map(r => `<tr>
    <td><div class="who"><img class="av" src="${av(r.m)}" alt=""><div>${esc(r.m.nick)}</div></div></td>
    ${r.cells.map((v, i) => {
      const hl = v > 0 && v === colMax[i] && good[i] ? (good[i] > 0 ? 'best' : 'worst') : '';
      return `<td class="num ${hl}">${i === 6 && v ? '−' + v : v}</td>`;
    }).join('')}
  </tr>`).join('');
}

function renderNext(n) {
  if (!n) { $('next-title').remove(); $('next').remove(); return; }
  $('next-title').textContent = `Vorschau Gameweek ${n.gw}`;
  const tz = { timeZone: 'Europe/Vienna' };
  const dl = new Date(n.deadline);
  const days = Math.ceil((dl - Date.now()) / 864e5);
  const cd = days > 1 ? `noch ${days} Tage` : days === 1 ? 'morgen!' : dl > Date.now() ? 'heute!' : 'läuft';
  const badge = t => `<img src="assets/badges/${t.code}.png" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`;
  const dot = x => `<i class="fdr fdr${x}" title="Schwierigkeit ${x}/5"></i>`;

  const byDay = {};
  for (const f of n.fixtures) {
    const k = f.kickoff ? new Date(f.kickoff).toLocaleDateString('de-AT', { ...tz, weekday: 'long', day: 'numeric', month: 'long' }) : 'Termin offen';
    (byDay[k] ||= []).push(f);
  }
  $('next').innerHTML = `
    <div class="deadline">
      <div>⏰ Transfer-Deadline<br><b>${dl.toLocaleString('de-AT', { ...tz, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} Uhr</b></div>
      <span class="cd">${cd}</span>
    </div>
    ${Object.entries(byDay).map(([day, list]) => `
      <div class="fx-day">${day}</div>
      <div class="fx-list">${list.map(f => `
        <div class="fx">
          <div class="tm">${badge(f.home)}<span class="full">${esc(f.home.name)}</span><span class="short">${esc(f.home.short)}</span>${dot(f.homeDiff)}</div>
          <div class="time">${f.kickoff ? new Date(f.kickoff).toLocaleTimeString('de-AT', { ...tz, hour: '2-digit', minute: '2-digit' }) : '–'}</div>
          <div class="tm a">${dot(f.awayDiff)}<span class="full">${esc(f.away.name)}</span><span class="short">${esc(f.away.short)}</span>${badge(f.away)}</div>
        </div>`).join('')}
      </div>`).join('')}
    <p class="fx-note">Punkte = FPL-Schwierigkeit für die jeweilige Mannschaft: 🟢 leicht · ⚪ mittel · 🟠 schwer · 🔴 sehr schwer. Zeiten in österreichischer Zeit.</p>`;
}

// --- Archiv & Hall of Fame ---
function renderHistory(d, hist) {
  const ms = d.managers;
  const byAvatar = Object.fromEntries(ms.map(m => [m.avatar, m]));
  const manual = hist.seasons || {};
  // Ehemalige Mitglieder (nur in echten Tabellen) – je Name ein Eintrag
  const former = {};
  const who = r => r.who ? byAvatar[r.who] : (former[r.name] ||= { id: 'x-' + r.name, nick: r.name, avatar: null, former: true, past: [] });
  const seasons = [...new Set([...ms.flatMap(m => m.past.map(p => p.season)), ...Object.keys(manual)])]
    .filter(s => s >= FIRST_SEASON).sort().reverse();

  const tables = seasons.map(season => {
    let rows, real = false;
    if (manual[season]) {
      // Echte Tabelle: Reihenfolge wie im Screenshot
      rows = manual[season].map(r => ({ m: who(r), team: r.team, p: { points: r.points } })).filter(x => x.m);
      real = true;
    } else {
      rows = ms.map(m => ({ m, p: m.past.find(p => p.season === season) }))
        .filter(x => x.p).sort((a, b) => b.p.points - a.p.points);
    }
    const o = HISTORY_OVERRIDES[season] || {};
    const champ = byAvatar[o.champion] || rows[0].m;
    const last = byAvatar[o.last] || rows[rows.length - 1].m;
    return { season, rows, champ, last, real };
  });
  const people = [...ms, ...Object.values(former)];
  const pts = v => v == null ? '–' : v.toLocaleString('de-AT');
  const short = s => s.replace(/^20(\d\d)\/(\d\d)$/, '$1/$2');

  // Archiv
  $('archive').innerHTML = tables.map(t => `
    <div class="season">
      <h3>${t.season} <small>${t.rows.length} Manager · ${t.real ? '✔ echte Tabelle' : 'berechnet'}</small></h3>
      <table>${t.rows.map((x, i) => `
        <tr class="${x.m === t.champ ? 'champ' : x.m === t.last ? 'lastp' : ''}">
          <td class="rank">${i + 1}</td>
          <td><div class="who"><img class="av" src="${av(x.m)}" alt=""><div>${esc(x.m.nick)}${x.m === t.champ ? ' 🏆' : ''}${x.m === t.last ? ' 🏮' : ''}${x.team ? `<small>${esc(x.team)}</small>` : ''}</div></div></td>
          <td class="num total">${pts(x.p.points)}${(r => r ? `<small class="pct" title="Weltrang ${r.toLocaleString('de-AT')}">${topPct(r, t.season)}</small>` : '')(x.p.overallRank || x.m.past?.find(p => p.season === t.season)?.overallRank)}</td>
        </tr>`).join('')}
      </table>
    </div>`).join('');

  // Titel & Laternen zählen (heutige + ehemalige Mitglieder)
  const stat = people.map(m => {
    const places = tables.map(t => t.rows.findIndex(x => x.m === m) + 1).filter(Boolean);
    return {
      m,
      titles: tables.filter(t => t.champ === m).map(t => t.season),
      lanterns: tables.filter(t => t.last === m).map(t => t.season),
      avg: places.length ? places.reduce((a, b) => a + b, 0) / places.length : null,
      n: places.length,
    };
  });
  const hof = [...stat].sort((a, b) => b.titles.length - a.titles.length || (a.avg ?? 99) - (b.avg ?? 99));
  const kings = hof.filter(x => x.titles.length && x.titles.length === hof[0].titles.length);

  $('king').innerHTML = kings.map(k => `
    <div class="king">
      <div class="crown">👑</div><br>
      <img class="av" src="${av(k.m)}" alt="${esc(k.m.nick)}">
      <span class="tag">${kings.length > 1 ? 'Rekordmeister (geteilt)' : 'Rekordmeister'}</span>
      <div class="name">${esc(k.m.nick)}</div>
      <div class="cups">${'🏆'.repeat(k.titles.length)}</div>
      <div class="seasons">${k.titles.length} Titel · ${k.titles.map(short).join(', ')}</div>
    </div>`).join('');

  $('hof').innerHTML = hof.map(x => `<tr class="${kings.includes(x) ? 'first' : ''}">
    <td><div class="who"><img class="av" src="${av(x.m)}" alt=""><div>${esc(x.m.nick)}<small>${x.m.former ? 'ehemalig · ' : ''}${x.n} Saison${x.n === 1 ? '' : 'en'} im Archiv</small></div></div></td>
    <td class="num total">${x.titles.length}</td>
    <td class="trophies">${x.titles.length ? x.titles.map(s => `🏆<small style="font-size:12px">${short(s)}</small>`).join(' ') : '–'}</td>
    <td class="num hide-m">${x.avg ? x.avg.toFixed(1) : '–'}</td>
  </tr>`).join('');

  const hos = [...stat].filter(x => x.lanterns.length).sort((a, b) => b.lanterns.length - a.lanterns.length);
  $('hos').innerHTML = hos.map((x, i) => `<tr class="${i === 0 ? 'last' : ''}">
    <td><div class="who"><img class="av" src="${av(x.m)}" alt=""><div>${esc(x.m.nick)}</div></div></td>
    <td class="num total">${x.lanterns.length}</td>
    <td class="trophies">${x.lanterns.map(s => `🏮<small style="font-size:12px">${short(s)}</small>`).join(' ')}</td>
  </tr>`).join('');

  // Rekorde
  const all = tables.flatMap(t => t.rows.map((x, i) => ({ ...x, season: t.season, place: i + 1 }))).filter(x => x.p.points != null);
  const card = (t, x, desc, bad) => `<div class="award ${bad ? 'bad' : ''}">
    <img class="av" src="${av(x.m)}" alt=""><div><div class="t">${t}</div><div class="n">${esc(x.m.nick)}</div><div class="d">${desc}</div></div></div>`;
  const best = all.reduce((a, b) => b.p.points > a.p.points ? b : a);
  const worst = all.reduce((a, b) => b.p.points < a.p.points ? b : a);
  const gaps = tables.filter(t => t.rows.length > 1 && t.rows[0].p.points != null && t.rows[1].p.points != null)
    .map(t => ({ t, gap: t.rows[0].p.points - t.rows[1].p.points }));
  const tight = gaps.reduce((a, b) => b.gap < a.gap ? b : a);
  const wide = gaps.reduce((a, b) => b.gap > a.gap ? b : a);
  const withRank = ms.flatMap(m => m.past.filter(p => p.overallRank).map(p => ({ m, p })));
  const topRank = withRank.reduce((a, b) => b.p.overallRank < a.p.overallRank ? b : a);
  const veteran = ms.reduce((a, b) => b.past.length > a.past.length ? b : a);
  $('records').innerHTML = [
    card('🚀 Beste Saison', best, `${best.p.points.toLocaleString('de-AT')} Punkte · ${best.season}`),
    card('🌍 Bester Weltrang', topRank, `Platz ${topRank.p.overallRank.toLocaleString('de-AT')} weltweit · ${topRank.p.season}`),
    card('📏 Größter Vorsprung', wide.t.rows[0], `+${wide.gap} Punkte vor ${esc(wide.t.rows[1].m.nick)} · ${wide.t.season}`),
    card('😬 Knappster Titel', tight.t.rows[0], `nur ${tight.gap} Punkte vor ${esc(tight.t.rows[1].m.nick)} · ${tight.t.season}`),
    card('🧓 Dienstältester', { m: veteran }, `spielt FPL seit ${veteran.past[0].season} · ${veteran.past.length} Saisonen`),
    card('🥶 Schwächste Saison', worst, `${worst.p.points.toLocaleString('de-AT')} Punkte · ${worst.season}`, 1),
  ].join('');

  const realList = tables.filter(t => t.real).map(t => short(t.season)).reverse().join(', ');
  $('hof-note').textContent = `Gezählt ab Saison ${FIRST_SEASON}. Echte Endtabellen: ${realList || 'keine'}. Alle anderen Saisonen sind aus den Gesamtpunkten der heutigen Mitglieder berechnet – wer damals mit einem anderen Account spielte oder nicht mehr dabei ist, fehlt dort.`;
}

// --- Auszeichnungen über die ganze Saison ---
function renderSeasonAwards(ms, GW) {
  const sum = (m, k) => m.gws.reduce((a, g) => a + (g[k] || 0), 0);
  const all = ms.map(m => ({ m }));
  const gwList = [...new Set(ms.flatMap(m => m.gws.map(g => g.gw)))];
  const count = (m, dir) => gwList.filter(gw => {
    const row = ms.map(x => ({ m: x, g: x.gws.find(g => g.gw === gw) })).filter(x => x.g);
    return leaders(row, x => x.g.points, dir).some(x => x.m === m);
  }).length;
  const awards = [];
  const add = (t, list, d, bad) => list.length && list[0].v !== 0 && awards.push({ t, list, d, bad });
  const n = x => x.toLocaleString('de-AT');

  let l = leaders(all, x => count(x.m, 1));
  add('🥇 Rundensieg-König', l, `${l[0].v}× Rundensieger`);
  l = leaders(all, x => count(x.m, -1));
  add('🥄 Löffel-Sammler', l, `${l[0].v}× Rundenletzter`, 1);

  const games = ms.flatMap(m => m.gws.map(g => ({ m, g })));
  l = leaders(games, x => x.g.points);
  add('🚀 Höhenflug', l, `${l[0].v} Punkte in GW ${l[0].g.gw}`);
  l = leaders(games, x => x.g.points, -1);
  add('🕳️ Tiefpunkt', l, `nur ${l[0].v} Punkte in GW ${l[0].g.gw}`, 1);

  l = leaders(all, x => sum(x.m, 'bench'));
  add('🪑 Bank-Weltmeister', l, `${n(l[0].v)} Punkte auf der Bank verschenkt`, 1);
  l = leaders(all, x => sum(x.m, 'captainPts'));
  add('©️ Kapitäns-Genie', l, `${l[0].v} Kapitänspunkte`);
  l = leaders(all, x => sum(x.m, 'captainPts'), -1);
  add('🤦 Kapitäns-Flop', l, `nur ${l[0].v} Kapitänspunkte`, 1);

  const trans = ms.flatMap(m => m.gws.flatMap(g => g.transfersIn.map(t => ({ m, t, gw: g.gw }))));
  if (trans.length) {
    l = leaders(trans, x => x.t.inPts - x.t.outPts, -1);
    if (l[0].v < 0) add('💸 Transfer-Flop', l, `GW ${l[0].gw}: ${l[0].t.out} raus (${l[0].t.outPts}) → ${l[0].t.in} (${l[0].t.inPts})`, 1);
    l = leaders(trans, x => x.t.inPts - x.t.outPts);
    if (l[0].v > 0) add('🎯 Transfer-Volltreffer', l, `GW ${l[0].gw}: ${l[0].t.in} (${l[0].t.inPts}) statt ${l[0].t.out} (${l[0].t.outPts})`);
  }
  l = leaders(all, x => sum(x.m, 'transfers'));
  add('🔁 Transfer-Junkie', l, `${l[0].v} Transfers`);
  l = leaders(all, x => sum(x.m, 'hits'));
  add('🔪 Hit-König', l, `−${l[0].v} Punkte für Zusatztransfers`, 1);
  l = leaders(all, x => sum(x.m, 'red') * 3 + sum(x.m, 'yellow'));
  add('🟥 Treter der Saison', l, `${sum(l[0].m, 'red')}× Rot, ${sum(l[0].m, 'yellow')}× Gelb`, 1);
  l = leaders(all, x => sum(x.m, 'goals'));
  add('⚽ Torfabrik', l, `${l[0].v} Tore der Startelf`);

  $('season-title').textContent = `Saison-Auszeichnungen (GW 1–${GW})`;
  $('season-awards').innerHTML = awards.map(a => {
    const m = a.list[0].m;
    const more = a.list.length > 1 ? ` <small>(geteilt)</small>` : '';
    return `<div class="award ${a.bad ? 'bad' : ''}">
      <img class="av" src="${av(m)}" alt="${esc(m.nick)}">
      <div><div class="t">${a.t}</div><div class="n">${esc([...new Set(a.list.map(x => x.m.nick))].join(' & '))}${more}</div><div class="d">${esc(a.d)}</div></div>
    </div>`;
  }).join('');
}
