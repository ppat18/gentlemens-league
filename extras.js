// Gentlemen's League – Spieltags-Bericht, Glück-o-Meter, Teamwert-Ranking, Tabellenverlauf
// (nutzt $, av, esc, leaders aus app.js)

// --- Tabellenverlauf (Platz je Gameweek) ---
function renderRankChart(ms) {
  const gws = [...new Set(ms.flatMap(m => m.gws.map(g => g.gw)))].sort((a, b) => a - b);
  if (gws.length < 2) { $('chart-title').remove(); $('chart').remove(); return; }
  const n = ms.length, rowH = 48, top = 34, left = 78, right = 150, W = 900;
  const H = top + (n - 1) * rowH + 40;
  const x = i => left + i * (W - left - right) / (gws.length - 1);
  const y = r => top + (r - 1) * rowH;
  const first = ms[0], last = ms[n - 1];
  const line = m => gws.map((gw, i) => ({ gw, i, g: m.gws.find(g => g.gw === gw) })).filter(p => p.g);

  const grid = gws.map((gw, i) => `
    <line x1="${x(i)}" y1="${top - 14}" x2="${x(i)}" y2="${y(n) + 14}" class="rc-grid"/>
    <text x="${x(i)}" y="${y(n) + 32}" class="rc-gw">GW ${gw}</text>`).join('');

  const series = ms.map(m => {
    const pts = line(m);
    const cls = m === first ? 'gold' : m === last ? 'red' : '';
    const d = pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i)},${y(p.g.leagueRank)}`).join(' ');
    const start = pts[0], end = pts[pts.length - 1];
    const id = 'c' + m.id;
    return `<g class="rc-s ${cls}" data-id="${m.id}" tabindex="0">
      <path d="${d}" class="rc-line"/>
      <path d="${d}" class="rc-hit"/>
      ${pts.map(p => `<circle cx="${x(p.i)}" cy="${y(p.g.leagueRank)}" r="5" class="rc-dot"><title>${esc(m.nick)} · GW ${p.gw}: Platz ${p.g.leagueRank} (${p.g.total} Punkte)</title></circle>`).join('')}
      <clipPath id="${id}"><circle cx="${left - 40}" cy="${y(start.g.leagueRank)}" r="18"/></clipPath>
      <circle cx="${left - 40}" cy="${y(start.g.leagueRank)}" r="20" class="rc-ring"/>
      <image href="${av(m)}" x="${left - 58}" y="${y(start.g.leagueRank) - 18}" width="36" height="36" preserveAspectRatio="xMidYMin slice" clip-path="url(#${id})"/>
      <text x="${x(end.i) + 14}" y="${y(end.g.leagueRank) + 5}" class="rc-name">${end.g.leagueRank}. ${esc(m.nick)}${m === first ? ' 👑' : m === last ? ' 🏮' : ''}</text>
    </g>`;
  }).join('');

  $('chart').innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="rc" role="img" aria-label="Tabellenplatz aller Manager je Gameweek">
      ${grid}${series}
    </svg>
    <p class="lnote">Links: Platz nach Gameweek ${gws[0]}. Rechts: aktueller Platz. Mit der Maus über ein Gesicht oder eine Linie fahren (oder antippen) hebt den Verlauf hervor.</p>`;

  const svg = $('chart').querySelector('svg');
  svg.querySelectorAll('.rc-s').forEach(g => {
    const on = () => { svg.classList.add('focus'); svg.querySelectorAll('.rc-s').forEach(s => s.classList.toggle('hl', s === g)); g.parentNode.appendChild(g); };
    g.addEventListener('mouseenter', on);
    g.addEventListener('focus', on);
    g.addEventListener('click', on);
  });
  svg.addEventListener('mouseleave', () => { svg.classList.remove('focus'); svg.querySelectorAll('.hl').forEach(s => s.classList.remove('hl')); });
}

// --- Spieltags-Bericht: automatisch generierter Roast ---
function renderReport(ms, GW) {
  // Zufall, aber pro Gameweek immer gleich (damit der Text nicht bei jedem Neuladen wechselt)
  let seed = GW * 7919 + 13;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const shuffle = arr => arr.map(x => [rnd(), x]).sort((a, b) => a[0] - b[0]).map(x => x[1]);

  const gwOf = (m, gw = GW) => m.gws.find(g => g.gw === gw);
  const cur = ms.map(m => ({ m, g: gwOf(m) })).filter(x => x.g);
  if (!cur.length) return;
  const b = s => `<b>${esc(s)}</b>`;
  const W = leaders(cur, x => x.g.points)[0], L = leaders(cur, x => x.g.points, -1)[0];
  const F = ms[0], Z = ms[ms.length - 1];
  const avg = Math.round(cur.reduce((a, x) => a + x.g.points, 0) / cur.length);

  const head = pick([
    `${W.m.nick} glänzt, ${L.m.nick} blamiert sich`,
    `Blamage der Woche: ${L.m.nick}`,
    `${L.m.nick} – ein Totalschaden in ${L.v} Punkten`,
    `${W.m.nick} feiert, ${L.m.nick} weint leise`,
    `Gameweek ${GW}: Wer schämt sich am meisten?`,
  ]);
  const win = pick([
    `${b(W.m.nick)} holt ${W.v} Punkte und fühlt sich jetzt eine Woche lang wie Pep Guardiola – dabei hat ${esc(W.g.best?.name || 'ein einziger Spieler')} die ganze Arbeit gemacht.`,
    `Rundensieg für ${b(W.m.nick)} mit ${W.v} Punkten. Auch eine blinde Henne findet mal ein Korn – diese hier hat gleich das ganze Feld abgeerntet.`,
    `${b(W.m.nick)} gewinnt die Runde (${W.v}). Glückwunsch, das Team hat's gemacht – der Manager hat nur zugeschaut und Chips gegessen.`,
  ]);
  const lose = pick([
    `Ganz unten: ${b(L.m.nick)} mit ${L.v} Punkten. Diese Aufstellung wurde offenbar im Dunkeln per Würfel ermittelt.`,
    `${b(L.m.nick)} kratzt ${L.v} magere Punkte zusammen – ${avg - L.v} unter dem Schnitt. Das Team ist anscheinend schon beim Aufwärmen eingeschlafen.`,
    `${L.v} Punkte für ${b(L.m.nick)}. Andere nennen das eine Katastrophe, ${esc(L.m.nick)} nennt es „Aufbauphase“.`,
  ]);
  const top = pick([
    `An der Spitze thront ${b(F.nick)} mit ${F.total - ms[1].total} Punkten Vorsprung und blickt auf den Rest herab wie ein Gentleman auf verschütteten Tee.`,
    `${b(F.nick)} führt die Tabelle an. Der Rest der Liga hat offiziell den Kampf um Platz 2 eröffnet.`,
  ]);
  const bottom = pick([
    `Die rote Laterne leuchtet weiter bei ${b(Z.nick)} – ${F.total - Z.total} Punkte hinter Platz 1. Jemand sollte da unten ein Nachtlicht aufstellen.`,
    `${b(Z.nick)} hält die rote Laterne so fest, als wäre sie ein Familienerbstück.`,
    `${b(Z.nick)} ist Letzter. Nicht überraschend, aber zuverlässig – die einzige Konstante in diesem Team.`,
  ]);

  const extras = [];
  const bench = leaders(cur, x => x.g.bench)[0];
  if (bench.v >= 10) extras.push(`${b(bench.m.nick)} lässt ${bench.v} Punkte auf der Bank verrotten. Die Ersatzbank spielt besser als die Startelf – vielleicht sollte die nächste Woche aufstellen.`);
  const trans = cur.flatMap(x => x.g.transfersIn.map(t => ({ m: x.m, t, d: t.inPts - t.outPts })));
  if (trans.length) {
    const t = trans.reduce((a, c) => c.d < a.d ? c : a);
    if (t.d <= -5) extras.push(`Transfer-Genie ${b(t.m.nick)} verkauft ${esc(t.t.out)} (${t.t.outPts} Punkte) und holt ${esc(t.t.in)} (${t.t.inPts}). Die Scouting-Abteilung wurde fristlos entlassen.`);
  }
  const hit = leaders(cur, x => x.g.hits)[0];
  if (hit.v > 0) extras.push(`${b(hit.m.nick)} zahlt −${hit.v} für Zusatztransfers. Geld verbrennen ginge auch billiger – und wärmer.`);
  const cards = leaders(cur, x => x.g.red * 3 + x.g.yellow)[0];
  if (cards.v >= 3) extras.push(`${b(cards.m.nick)} stellt mit ${cards.g.red ? cards.g.red + '× Rot und ' : ''}${cards.g.yellow}× Gelb die unfairste Truppe der Liga. Das ist kein Fußball mehr, das ist Wrestling.`);
  if (new Set(cur.map(x => x.g.captain)).size === 1) extras.push(`Alle ${cur.length} hatten ${esc(cur[0].g.captain)} als Kapitän. Mutig wie eine Herde Schafe im Gewitter.`);
  for (const x of cur.filter(x => x.g.chip && x.g.points < avg)) {
    const chip = { wildcard: 'die Wildcard', freehit: 'den Free Hit', bboost: 'den Bench Boost', '3xc': 'den Triple Captain' }[x.g.chip] || x.g.chip;
    extras.push(`${b(x.m.nick)} zündet ${chip} und holt damit sagenhafte ${x.g.points} Punkte – unter dem Schnitt. Feuerwerk mit nassen Streichhölzern.`);
  }
  const prev = m => gwOf(m, GW - 1)?.leagueRank;
  const fall = leaders(cur, x => prev(x.m) ? x.g.leagueRank - prev(x.m) : null)[0];
  if (fall?.v >= 2) extras.push(`${b(fall.m.nick)} rutscht ${fall.v} Plätze ab. Der Fahrstuhl kennt nur eine Richtung.`);

  $('report').innerHTML = `
    <div class="kicker">📰 Spieltags-Bericht · Gameweek ${GW}</div>
    <h3>${esc(head)}</h3>
    <p>${win} ${lose}</p>
    <p style="margin-top:8px">${top} ${bottom} ${shuffle(extras).slice(0, 3).join(' ')}</p>
    <div class="by">– Der Gentleman-Reporter. Unbestechlich, gnadenlos, schlecht bezahlt.</div>`;
}

// --- Glück-o-Meter ---
function renderLuck(ms) {
  const sum = (m, k) => m.gws.reduce((a, g) => a + (g[k] || 0), 0);
  const rows = ms.map(m => {
    const auto = sum(m, 'autoSubPts'), bonus = sum(m, 'bonus'), bench = sum(m, 'bench');
    const bad = sum(m, 'red') * 3 + sum(m, 'yellow') + sum(m, 'ownGoals') * 2 + sum(m, 'penMiss') * 2;
    return { m, auto, bonus, bench, bad, raw: auto + bonus - bench / 2 - bad };
  });
  const avg = rows.reduce((a, r) => a + r.raw, 0) / rows.length;
  rows.forEach(r => r.luck = Math.round((r.raw - avg) * 10) / 10);
  rows.sort((a, b) => b.luck - a.luck);
  const max = Math.max(5, Math.ceil(Math.max(...rows.map(r => Math.abs(r.luck))) * 1.25 / 5) * 5);
  const fmt = v => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toLocaleString('de-AT');

  const gauge = (r, cls, label) => {
    const ang = Math.max(-90, Math.min(90, r.luck / max * 90));
    const arc = (a1, a2, color) => {
      const p = a => [130 + 110 * Math.cos((a - 90) * Math.PI / 180), 130 + 110 * Math.sin((a - 90) * Math.PI / 180)];
      const [x1, y1] = p(a1), [x2, y2] = p(a2);
      return `<path d="M${x1},${y1} A110,110 0 0 1 ${x2},${y2}" stroke="${color}" stroke-width="22" fill="none"/>`;
    };
    return `<div class="gauge ${cls}">
      <svg viewBox="0 0 260 150" aria-label="${label}: ${fmt(r.luck)}">
        ${arc(-90, -31, '#d9443c')}${arc(-29, 29, '#c9ccd4')}${arc(31, 90, '#3aa845')}
        <text x="22" y="148" font-size="12" font-weight="700" fill="#b3261e">PECH</text>
        <text x="238" y="148" font-size="12" font-weight="700" fill="#23752f" text-anchor="end">GLÜCK</text>
        <g class="needle" data-angle="${ang}" style="transform:rotate(0deg)">
          <path d="M127,130 L130,34 L133,130 Z" fill="#2a2870"/>
        </g>
        <circle cx="130" cy="130" r="9" fill="#2a2870"/>
      </svg>
      <img class="av" src="${av(r.m)}" alt="">
      <div class="lbl">${label}</div>
      <div class="nm">${esc(r.m.nick)}</div>
      <div class="vl">${fmt(r.luck)} Glückspunkte</div>
    </div>`;
  };
  const lucky = rows[0], unlucky = rows[rows.length - 1];

  $('luck').innerHTML = `
    <div class="gauges">${gauge(lucky, 'lucky', '🍀 Glückspilz der Saison')}${gauge(unlucky, 'unlucky', '🌧️ Pechvogel der Saison')}</div>
    <div class="laxis"><div></div><div><span>◀ Pech</span><span>Glück ▶</span></div><div></div></div>
    ${rows.map(r => {
      const w = Math.abs(r.luck) / max * 50;
      return `<div class="lrow" tabindex="0">
        <div class="who"><img class="av" src="${av(r.m)}" alt=""><div>${esc(r.m.nick)}</div></div>
        <div class="ltrack"><div class="lbar ${r.luck >= 0 ? 'pos' : 'neg'}" style="width:max(0px, calc(${w}% - 2px))"></div></div>
        <div class="lval">${fmt(r.luck)}</div>
        <div class="tip"><b>${esc(r.m.nick)}</b><br>
          🔄 Auto-Einwechslungen: +${r.auto}<br>
          ⭐ Bonuspunkte: +${r.bonus}<br>
          🪑 Bankpunkte (halb): −${(r.bench / 2).toLocaleString('de-AT')}<br>
          🟥 Karten, Eigentore, Elfer: −${r.bad}<br>
          <b>= ${fmt(r.luck)} gegenüber dem Liga-Schnitt</b></div>
      </div>`;
    }).join('')}
    <p class="lnote">So wird gerechnet: Punkte durch automatische Einwechslungen + Bonuspunkte − halbe Bankpunkte − Minuspunkte durch Karten, Eigentore und verschossene Elfer. Angezeigt wird der Abstand zum Liga-Schnitt. Mit der Maus über einen Namen fahren (oder antippen) zeigt die Details.</p>`;

  // Nadeln animiert ausschlagen lassen
  setTimeout(() => document.querySelectorAll('.needle').forEach(n => n.style.transform = `rotate(${n.dataset.angle}deg)`), 300);
}

// --- Chip-Tabelle (ohne Wildcard) ---
// Eingetragen werden die Punkte der Runde, in der der Chip gespielt wurde. Jeder Chip 2× pro Saison.
function renderChips(ms) {
  const CHIPS = [
    { key: '3xc', name: 'Triple Captain', icon: '©️' },
    { key: 'bboost', name: 'Bench Boost', icon: '🪑' },
    { key: 'freehit', name: 'Free Hit', icon: '🎯' },
  ];
  const rows = ms.map(m => {
    // Triple Captain: nur die (dreifachen) Punkte des Kapitäns · sonst: Punkte der Runde
    const cells = CHIPS.map(c => ({ c, uses: m.gws.filter(g => g.chip === c.key).map(g => c.key === '3xc'
      ? { gw: g.gw, pts: g.captainPts, label: `${g.captain} · GW ${g.gw}` }
      : c.key === 'bboost'
        ? { gw: g.gw, pts: g.points, label: `(Bank: ${g.benchPlayersPts ?? '?'}) · GW ${g.gw}` }
        : { gw: g.gw, pts: g.points, label: `GW ${g.gw}` }) }));
    const all = cells.flatMap(x => x.uses);
    return { m, cells, total: all.reduce((a, u) => a + u.pts, 0), used: all.length };
  });
  // Bester Wert je Chip-Spalte hervorheben
  const bestOf = CHIPS.map((_, i) => Math.max(0, ...rows.flatMap(r => r.cells[i].uses.map(u => u.pts))));

  $('chips').innerHTML = `
    <table class="stats chips">
      <thead><tr><th>Manager</th>${CHIPS.map(c => `<th class="num">${c.icon} ${c.name}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td><div class="who"><img class="av" src="${av(r.m)}" alt=""><div>${esc(r.m.nick)}</div></div></td>
        ${r.cells.map((x, i) => `<td class="num chip-cell">${x.uses.map(u => `<span class="chip-use ${u.pts === bestOf[i] ? 'pos' : ''}">${u.pts}<small>${esc(u.label)}</small></span>`).join('')}${'<span class="chip-open" title="noch nicht gespielt">○</span>'.repeat(Math.max(0, 2 - x.uses.length))}</td>`).join('')}
      </tr>`).join('')}</tbody>
    </table>`;
}

// --- Teamwert-Ranking ---
// FPL-Wert "value" enthält die Bank bereits (Start = 100,0 für alle)
function renderValue(ms, GW) {
  const rows = ms.map(m => {
    const g = m.gws.find(x => x.gw === GW) || m.gws[m.gws.length - 1];
    return { m, total: g.value, bank: g.bank, gain: Math.round((g.value - 100) * 10) / 10 };
  }).sort((a, b) => b.total - a.total || a.bank - b.bank);
  const max = Math.max(1, Math.ceil(Math.max(...rows.map(r => Math.abs(r.gain))) * 1.1));
  const mio = v => '£' + v.toLocaleString('de-AT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' Mio';
  const fmt = v => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toLocaleString('de-AT', { minimumFractionDigits: 1 });
  $('value').innerHTML = `
    <div class="laxis"><div></div><div><span>◀ Wertverlust</span><span>Wertgewinn ▶</span></div><div></div></div>
    ${rows.map((r, i) => {
      const w = Math.abs(r.gain) / max * 50;
      return `<div class="vrow" title="Teamwert ${mio(r.total)} (davon ${mio(r.bank)} auf der Bank)">
        <div class="who"><img class="av" src="${av(r.m)}" alt=""><div>${i === 0 ? '💰 ' : ''}${esc(r.m.nick)}</div></div>
        <div class="ltrack"><div class="lbar ${r.gain >= 0 ? 'pos' : 'neg'}" style="width:max(0px, calc(${w}% - 2px))"></div></div>
        <div class="vnum">${mio(r.total)}<small>${fmt(r.gain)} seit Start · Bank ${mio(r.bank)}</small></div>
      </div>`;
    }).join('')}
    <p class="lnote">Teamwert inklusive Geld auf der Bank. Alle starten mit £100,0 Mio – der Balken zeigt, wie viel Wert seitdem durch Preisänderungen dazugekommen (oder verloren gegangen) ist.</p>`;
}
