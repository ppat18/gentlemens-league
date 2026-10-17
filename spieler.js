// Gentlemen's League – Spielerseite (#spieler/<FPL-Spieler-ID>), aufgebaut wie die Spielerseite von FPL:
// Preis, Form, Besitz, xG/xA, nächste Gegner mit Schwierigkeit, Punkte je Runde, alle Spiele der Saison, frühere Saisons.
// Dazu Liga-Extras: wer ihn hat / als Kapitän, wie viele Punkte er der Liga gebracht hat.
// Daten: yourminileague.com/api/player/<id> (holt FPL-Daten serverseitig, FPL selbst erlaubt keine Browser-Abrufe).
// (nutzt av, esc aus app.js; Liga-Daten aus window.LEAGUE)

(function () {
  const API = 'https://yourminileague.com/api/player/';
  const css = `
  .pl-hero{display:flex;align-items:center;gap:16px;padding:18px 16px;background:linear-gradient(135deg,var(--navy-2),var(--navy));color:#fff}
  .pl-hero img{width:72px;height:72px;object-fit:contain;flex:none;filter:drop-shadow(0 3px 6px rgba(0,0,0,.4))}
  .pl-hero .pos{display:inline-block;background:var(--lime);color:var(--navy);font:700 12px Oswald;letter-spacing:1px;text-transform:uppercase;padding:2px 9px;border-radius:999px}
  .pl-hero .fn{font-size:14px;opacity:.85;margin-top:6px}
  .pl-hero .nm{font:700 34px/1 Oswald;text-transform:uppercase;margin-top:2px}
  .pl-hero .tm{font-size:14px;color:var(--lime-2);font-weight:600;margin-top:4px}
  .pl-hero .price{margin-left:auto;text-align:right;flex:none}
  .pl-hero .price b{display:block;font:700 34px/1 Oswald;color:var(--gold)}
  .pl-hero .price small{font-size:12px;opacity:.85}
  .pl-news{padding:9px 14px;font-size:14px;font-weight:600}
  .pl-news.d{background:#ffe08a;color:#5a4300}.pl-news.i,.pl-news.s,.pl-news.u,.pl-news.n{background:var(--red);color:#fff}
  .pl-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));background:#fff}
  .pl-tiles div{padding:10px 8px;text-align:center;box-shadow:inset -1px -1px 0 #e6e8ee}
  .pl-tiles b{display:block;font:700 22px/1.1 Oswald;color:var(--navy);font-variant-numeric:tabular-nums}
  .pl-tiles span{font-size:11px;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:.3px}
  .pl-tiles em{display:block;font-style:normal;font-size:11px;color:#888;margin-top:1px}
  .pl-fx{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px}
  .pl-fx div{border-radius:12px;padding:8px 6px;text-align:center;font-size:12px;line-height:1.3}
  .pl-fx b{display:block;font:700 18px Oswald}
  .pl-fx img{width:26px;height:26px;object-fit:contain;display:block;margin:0 auto 2px}
  .fdr1{background:#375523;color:#fff}.fdr2{background:#01fc7a;color:#15143a}.fdr3{background:#e7e7e7;color:#15143a}.fdr4{background:#ff1751;color:#fff}.fdr5{background:#80072d;color:#fff}
  .pl-chart{width:100%;height:auto;display:block}
  .pl-chart text{font:600 10px Inter;fill:#666}
  .pl-chart .v{font:700 11px Oswald;fill:var(--navy)}
  .pl-tbl{width:100%;border-collapse:collapse;font-size:13px;white-space:nowrap}
  .pl-tbl td{padding:6px 7px;border-bottom:1px solid #eceef3;font-variant-numeric:tabular-nums}
  .pl-tbl .num{text-align:right}
  .pl-tbl tr.live td{background:rgba(224,49,47,.08)}
  .pl-tbl .opp{display:flex;align-items:center;gap:6px}
  .pl-tbl .opp img{width:18px;height:18px;object-fit:contain}
  .pl-x{overflow-x:auto}
  .pl-own{display:flex;flex-wrap:wrap;gap:10px}
  .pl-own div{display:flex;align-items:center;gap:7px;background:#f3f5f9;border-radius:999px;padding:4px 12px 4px 4px;font-size:13px;font-weight:600}
  .pl-own .av{width:34px;height:34px}
  .pl-own .c{background:var(--gold);color:var(--ink);font:700 10px Oswald;padding:1px 6px;border-radius:999px}
  .pl-muted{color:#777;font-size:13px}
  .pl-load{color:#fff;padding:30px 0;text-align:center;font-weight:600}
  @media (max-width:520px){.pl-hero{flex-wrap:wrap}.pl-hero .price{margin-left:0;text-align:left;width:100%;display:flex;align-items:baseline;gap:10px}.pl-hero .nm{font-size:28px}}
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  const POS = { GKP: 'Tor', DEF: 'Abwehr', MID: 'Mittelfeld', FWD: 'Sturm' };
  const STATUS = { d: 'Fraglich', i: 'Verletzt', s: 'Gesperrt', u: 'Nicht verfügbar', n: 'Nicht spielberechtigt' };
  const tz = { timeZone: 'Europe/Vienna' };
  const page = () => document.getElementById('page-spieler');
  const cache = {};
  const sign = v => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(1);
  const fmt = v => (v == null ? '–' : v);

  async function load(id) {
    if (cache[id] && Date.now() - cache[id].at < 60_000) return cache[id].d;
    const r = await fetch(API + id);
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Fehler');
    cache[id] = { at: Date.now(), d };
    return d;
  }

  // Liga-Extras: aktuelle Besitzer, Kapitäne, Punkte für die Liga (aus den Kaderdaten aller Runden)
  function leagueInfo(id) {
    const L = window.LEAGUE;
    const owners = [], gave = [];
    for (const m of L.managers) {
      const sq = m.squads || [];
      const last = sq[sq.length - 1];
      const p = last && last.picks.find(x => x[0] === id);
      if (p) owners.push({ m, cap: p[3] === 1, vice: p[3] === 2, bench: p[1] > 11, tc: p[3] === 1 && p[2] === 3 });
      // Punkte, die er diesem Manager gebracht hat: Punkte × Faktor (Bank = 0, Kapitän = 2, Triple Captain = 3)
      const pts = sq.reduce((a, s) => { const q = s.picks.find(x => x[0] === id); return a + (q ? (q[4] || 0) * (q[2] || 0) : 0); }, 0);
      if (pts) gave.push({ m, pts });
    }
    gave.sort((a, b) => b.pts - a.pts);
    return { owners, gave, total: gave.reduce((a, x) => a + x.pts, 0), managers: L.managers.length };
  }

  function chart(hist) {
    if (!hist.length) return '<p class="pl-muted">Noch keine Spiele.</p>';
    // je Runde zusammenfassen (Doppelspieltage addieren)
    const by = {};
    for (const h of hist) by[h[0]] = (by[h[0]] || 0) + h[7];
    const gws = Object.keys(by).map(Number).sort((a, b) => a - b);
    const max = Math.max(4, ...gws.map(g => by[g])), min = Math.min(0, ...gws.map(g => by[g]));
    const W = Math.max(320, gws.length * 34), H = 170, top = 18, base = H - 22, span = max - min;
    const y = v => top + (max - v) / span * (base - top);
    const bw = Math.min(24, (W - 20) / gws.length - 6);
    const bars = gws.map((g, i) => {
      const x = 10 + i * ((W - 20) / gws.length) + ((W - 20) / gws.length - bw) / 2, v = by[g];
      const y0 = y(Math.max(v, 0)), y1 = y(Math.min(v, 0));
      const col = v >= 10 ? '#8dc63f' : v <= 1 ? '#e0312f' : '#2a2870';
      return `<rect x="${x}" y="${y0}" width="${bw}" height="${Math.max(1.5, y1 - y0)}" rx="3" fill="${col}"/>
        <text class="v" x="${x + bw / 2}" y="${y0 - 4}" text-anchor="middle">${v}</text>
        <text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${g}</text>`;
    }).join('');
    return `<div class="pl-x"><svg class="pl-chart" viewBox="0 0 ${W} ${H}" style="min-width:${Math.min(W, 640)}px" role="img" aria-label="Punkte je Gameweek">
      <line x1="6" x2="${W - 6}" y1="${y(0)}" y2="${y(0)}" stroke="#cfd3dc"/>${bars}</svg></div>`;
  }

  async function render(id) {
    const el = page();
    if (!el) return;
    id = Number(id);
    const P = (window.LEAGUE.players || {})[id];
    el.innerHTML = `<a class="mp-back" href="#start" data-back>‹ Zurück</a><div class="pl-load">${P ? esc(P[0]) + ' – ' : ''}Lade Spielerdaten von FPL …</div>`;
    let d;
    try { d = await load(id); }
    catch (e) { el.innerHTML = `<a class="mp-back" href="#start" data-back>‹ Zurück</a><div class="pl-load">Die Spielerdaten konnten gerade nicht geladen werden (${esc(e.message)}). Bitte gleich noch einmal versuchen.</div>`; return; }
    if (page().dataset.id !== String(id)) return; // inzwischen woanders hin navigiert
    const p = d.player, T = d.teams;
    const team = tid => T[tid] || ['?', '?', 0];
    const badge = code => `assets/badges/${code}.png`;
    const L = leagueInfo(id);
    const isGK = p.position === 'GKP', isDef = p.position === 'DEF' || isGK;

    // Kacheln wie bei FPL
    const tiles = [
      ['Form', fmt(p.form), 'Ø der letzten 30 Tage'], ['Punkte/Spiel', fmt(p.ppg)], ['Gesamtpunkte', p.total],
      ['Gekauft von', `${p.selected}%`, 'aller FPL-Manager'], ['ICT-Index', fmt(p.ict), p.ictRank ? `Platz ${p.ictRank} (${POS[p.position]})` : ''],
      ['xG', fmt(p.xg), 'erwartete Tore'], ['xA', fmt(p.xa), 'erwartete Vorlagen'], ['xGI/90', fmt(p.xgi90)],
      ['Minuten', p.minutes, `${p.starts} Startelf`], ['Tore', p.goals], ['Vorlagen', p.assists], ['Zu-null', p.cs],
      ['Bonus', p.bonus, `BPS ${p.bps}`], ['Karten', `${p.yellow}🟨 ${p.red}🟥`],
      ...(isGK ? [['Paraden', p.saves], ['Elfer gehalten', p.penSaved]] : []),
      ...(p.dc != null && !isGK ? [['Defensiv-Beitrag', p.dc]] : []),
      ['Transfers GW', `+${(p.transfersInEvent / 1000).toFixed(0)}k`, `−${(p.transfersOutEvent / 1000).toFixed(0)}k verkauft`],
      ...(p.epNext != null ? [['Prognose nächste GW', p.epNext, 'FPL-Erwartung']] : []),
    ];

    // Nächste Spiele mit Schwierigkeit (FPL-Farben)
    const fx = d.fixtures.slice(0, 8).map(f => {
      const t = team(f[1]);
      return `<div class="fdr${f[4]}"><img src="${badge(t[2])}" alt="" onerror="this.style.display='none'"><b>${esc(t[1])} (${f[2] ? 'H' : 'A'})</b>GW ${f[0] ?? '?'}<br>${f[3] ? new Date(f[3]).toLocaleDateString('de-AT', { ...tz, weekday: 'short', day: 'numeric', month: 'numeric' }) : 'offen'}</div>`;
    }).join('');
    const nextAvg = d.fixtures.slice(0, 5).reduce((a, f) => a + f[4], 0) / Math.max(1, Math.min(5, d.fixtures.length));

    // Alle Spiele dieser Saison (neueste oben)
    const now = Date.now();
    const rows = [...d.history].reverse().map(h => {
      const t = team(h[1]), live = h[3] && new Date(h[3]).getTime() <= now && new Date(h[3]).getTime() > now - 3 * 3600_000;
      const res = h[4] == null ? '–' : `${h[4]}:${h[5]} ${h[4] > h[5] ? 'S' : h[4] < h[5] ? 'N' : 'U'}`;
      return `<tr class="${live ? 'live' : ''}"><td>${h[0]}</td><td><span class="opp"><img src="${badge(t[2])}" alt="" onerror="this.style.visibility='hidden'">${esc(t[1])} (${h[2] ? 'H' : 'A'})</span></td>
        <td>${res}</td><td class="num">${h[6]}</td><td class="num"><b>${h[7]}</b></td><td class="num">${h[8]}</td><td class="num">${h[9]}</td>
        ${isDef ? `<td class="num">${h[10]}</td><td class="num">${h[11]}</td>` : ''}${isGK ? `<td class="num">${h[22]}</td>` : ''}
        <td class="num">${h[12]}</td><td class="num">${h[13]}</td><td class="num">${h[14] ?? '–'}</td><td class="num">${h[15] ?? '–'}</td>
        <td class="num">£${h[17].toFixed(1)}</td><td class="num">${(h[18] / 1000).toFixed(0)}k</td></tr>`;
    }).join('');

    const past = [...d.past].reverse().map(s => `<tr><td>${esc(s[0])}</td><td class="num"><b>${s[1]}</b></td><td class="num">${s[2]}</td><td class="num">${s[3]}</td><td class="num">${s[4]}</td><td class="num">${s[5]}</td><td class="num">${s[6]}</td><td class="num">£${s[7].toFixed(1)} → £${s[8].toFixed(1)}</td></tr>`).join('');

    // Liga-Extras
    const own = L.owners.length
      ? `<div class="pl-own">${L.owners.map(o => `<div><img class="av" src="${av(o.m)}" alt="">${esc(o.m.nick)}${o.tc ? ' <span class="c">3×</span>' : o.cap ? ' <span class="c">C</span>' : o.vice ? ' <span class="c" style="background:#ddd">V</span>' : ''}${o.bench ? ' <small class="pl-muted">(Bank)</small>' : ''}</div>`).join('')}</div>`
      : '<p class="pl-muted">Aktuell hat ihn niemand aus der Liga.</p>';
    const gave = L.gave.length
      ? `<p style="font-size:14px;margin:10px 0 6px">Hat der Liga diese Saison <b>${L.total} Punkte</b> gebracht${L.gave[0] ? ` – am meisten <b>${esc(L.gave[0].m.nick)}</b> (${L.gave[0].pts})` : ''}.</p>
         <p class="pl-muted">${L.gave.slice(1, 6).map(x => `${esc(x.m.nick)} ${x.pts}`).join(' · ')}</p>`
      : '<p class="pl-muted" style="margin-top:8px">Hat noch für niemanden aus der Liga gepunktet.</p>';

    const news = p.news ? `<div class="pl-news ${p.status}">${STATUS[p.status] ? STATUS[p.status] + ': ' : ''}${esc(p.news)}${p.chance != null ? ` · Einsatzchance ${p.chance}%` : ''}</div>` : '';
    el.innerHTML = `
      <a class="mp-back" href="#start" data-back>‹ Zurück</a>
      <div class="mp-card">
        <div class="pl-hero">
          <img src="${badge(p.teamCode)}" alt="" onerror="this.style.visibility='hidden'">
          <div style="min-width:0"><span class="pos">${POS[p.position] || p.position}</span><div class="fn">${esc(p.first)}</div><div class="nm">${esc(p.second)}</div><div class="tm">${esc(p.teamName)}${p.penOrder === 1 ? ' · Elfmeterschütze' : ''}</div></div>
          <div class="price"><b>£${p.cost.toFixed(1)}</b><small>${sign(p.cost - p.costStart)} seit Saisonstart · ${sign(p.costEvent)} diese Runde</small></div>
        </div>
        ${news}
        <div class="pl-tiles">${tiles.map(([k, v, s]) => `<div><b>${v}</b><span>${k}</span>${s ? `<em>${s}</em>` : ''}</div>`).join('')}</div>
      </div>
      <div class="mp-grid">
        <div style="display:grid;gap:16px;min-width:0">
          <div class="mp-card mp-sec"><h3>Nächste Spiele</h3><div class="pl-fx">${fx || '<p class="pl-muted">Keine Spiele angesetzt.</p>'}</div>
            ${d.fixtures.length ? `<p class="pl-muted" style="margin-top:8px">Schwierigkeit der nächsten ${Math.min(5, d.fixtures.length)} Spiele: Ø ${nextAvg.toFixed(1)} von 5 (1 = leicht, 5 = sehr schwer)</p>` : ''}</div>
          <div class="mp-card mp-sec"><h3>Punkte je Gameweek</h3>${chart(d.history)}</div>
        </div>
        <div class="mp-card mp-sec"><h3>In unserer Liga</h3>
          <p class="pl-muted" style="margin-bottom:8px">${L.owners.length} von ${L.managers} Managern haben ihn${L.owners.some(o => o.cap) ? `, ${L.owners.filter(o => o.cap).length}× Kapitän` : ''} (aktuelle Gameweek)</p>
          ${own}${gave}</div>
      </div>
      <div class="mp-card" style="margin-top:16px"><div class="mp-sec" style="padding-bottom:4px"><h3>Spiele dieser Saison</h3></div>
        <div class="pl-x"><table class="pl-tbl"><thead><tr><th>GW</th><th>Gegner</th><th>Ergebnis</th><th class="num">Min.</th><th class="num">Pkt.</th><th class="num">T</th><th class="num">V</th>
          ${isDef ? '<th class="num">Zu-0</th><th class="num">GT</th>' : ''}${isGK ? '<th class="num">Par.</th>' : ''}<th class="num">Bonus</th><th class="num">BPS</th><th class="num">xG</th><th class="num">xA</th><th class="num">Preis</th><th class="num">Besitz</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="14">Noch keine Spiele.</td></tr>'}</tbody></table></div>
        <p class="pl-muted" style="padding:6px 14px 12px">T = Tore · V = Vorlagen · GT = Gegentore · Besitz = Anzahl FPL-Manager · Rot hinterlegt = läuft gerade</p>
      </div>
      ${past ? `<div class="mp-card" style="margin-top:16px"><div class="mp-sec" style="padding-bottom:4px"><h3>Frühere Saisons</h3></div>
        <div class="pl-x"><table class="pl-tbl"><thead><tr><th>Saison</th><th class="num">Pkt.</th><th class="num">Min.</th><th class="num">T</th><th class="num">V</th><th class="num">Zu-0</th><th class="num">Bonus</th><th class="num">Preis</th></tr></thead><tbody>${past}</tbody></table></div></div>` : ''}
      <p class="pl-muted" style="color:rgba(255,255,255,.75);margin-top:10px">Daten: offizielle Fantasy-Premier-League-Daten · Stand ${new Date(d.updated).toLocaleTimeString('de-AT', { ...tz, hour: '2-digit', minute: '2-digit' })} Uhr</p>`;
  }

  document.addEventListener('click', e => {
    const el = page();
    if (!el || el.hidden || !el.contains(e.target)) return;
    if (e.target.closest('[data-back]')) window.glBack && window.glBack(e);
  });
  const whenData = fn => { if (window.LEAGUE) fn(); else { const t = setInterval(() => { if (window.LEAGUE) { clearInterval(t); fn(); } }, 150); } };
  document.addEventListener('route', e => {
    if (e.detail.page !== 'spieler') return;
    page().dataset.id = String(Number(e.detail.arg));
    whenData(() => render(e.detail.arg));
  });
})();
