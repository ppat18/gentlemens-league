// Gentlemen's League – Bier-Bingo: 9 Schande-Felder je Manager (laufende Saison).
// Die drei mit den meisten Feldern zahlen bei der Abschlussfeier je eine Runde.
// (nutzt $, av, esc aus app.js)

const BINGO_FIELDS = [
  { key: 'last',   icon: '🥄', name: 'Rundenletzter',        desc: 'Die wenigsten Punkte einer Gameweek in der Liga.' },
  { key: 'red',    icon: '🟥', name: 'Rote Karte',           desc: 'Ein Spieler der Startelf sieht Rot.' },
  { key: 'og',     icon: '🙈', name: 'Eigentor',             desc: 'Ein Spieler der Startelf trifft ins eigene Tor.' },
  { key: 'late',   icon: '⏱️', name: 'Gegentor ab 90\'',     desc: 'Eigener Tormann/Verteidiger kassiert ab der 90. Minute.' },
  { key: 'cap',    icon: '©️', name: 'Kapitäns-Nullnummer',  desc: 'Der Kapitän holt 2 Punkte oder weniger.' },
  { key: 'hit',    icon: '🔪', name: 'Hit −8 oder mehr',     desc: 'Mindestens zwei Zusatzwechsel in einer Runde.' },
  { key: 'bench',  icon: '🪑', name: '15+ auf der Bank',     desc: 'Mindestens 15 Punkte verrotten auf der Bank.' },
  { key: 'flop',   icon: '💸', name: 'Transfer-Flop',        desc: 'Neuzugang holt 5+ Punkte weniger als der verkaufte Spieler.' },
  { key: 'sleep',  icon: '😴', name: 'Schlafmütze',          desc: 'Startelf-Spieler mit 0 Minuten, der nicht ersetzt wurde.' },
];
const BINGO_ROUNDS = [1, 1, 1]; // je eine Getränkerunde für die drei mit den meisten Feldern

function renderBingo(d) {
  const box = $('bingo');
  if (!box) return;
  const ms = d.managers;
  const gwList = [...new Set(ms.flatMap(m => m.gws.map(g => g.gw)))];
  const minOf = {}; // Rundenletzter je GW
  for (const gw of gwList) minOf[gw] = Math.min(...ms.map(m => m.gws.find(g => g.gw === gw)?.points ?? Infinity));

  // Treffer je Manager und Feld: Liste der Gameweeks
  const hits = ms.map(m => {
    const f = Object.fromEntries(BINGO_FIELDS.map(x => [x.key, []]));
    for (const g of m.gws) {
      if (g.points === minOf[g.gw]) f.last.push(g.gw);
      for (let i = 0; i < (g.red || 0); i++) f.red.push(g.gw);
      for (let i = 0; i < (g.ownGoals || 0); i++) f.og.push(g.gw);
      for (let i = 0; i < (g.lateAgainst || 0); i++) f.late.push(g.gw);
      if (g.captainBase != null && g.captainBase <= 2) f.cap.push(g.gw);
      if ((g.hits || 0) >= 8) f.hit.push(g.gw);
      if ((g.bench || 0) >= 15) f.bench.push(g.gw);
      if ((g.transfersIn || []).some(t => t.inPts - t.outPts <= -5)) f.flop.push(g.gw);
      // Schlafmütze: Startelf-Spieler mit 0 Minuten, nicht automatisch ersetzt
      const s = (m.squads || []).find(q => q.gw === g.gw && q.finished);
      if (s) {
        const out = new Set(s.subs.map(([, o]) => o));
        if (s.picks.some(([id, pos, , , , min]) => pos <= 11 && min === 0 && !out.has(id))) f.sleep.push(g.gw);
      }
    }
    const marked = BINGO_FIELDS.filter(x => f[x.key].length).length;
    const total = BINGO_FIELDS.reduce((a, x) => a + f[x.key].length, 0);
    // Bingo-Reihen (3×3): Zeilen, Spalten, Diagonalen
    const on = BINGO_FIELDS.map(x => f[x.key].length > 0);
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]].filter(l => l.every(i => on[i])).length;
    return { m, f, marked, total, lines };
  }).sort((a, b) => b.marked - a.marked || b.total - a.total);

  // Zahl-Ranking mit Gleichstand
  let place = 0, prev = null;
  hits.forEach((h, i) => { const key = h.marked + '/' + h.total; if (key !== prev) place = i + 1; prev = key; h.place = place; });
  const roast = h => h.marked >= 7 ? 'Wandelnde Katastrophe – die Brauerei schickt schon Dankeskarten.'
    : h.marked >= 5 ? 'Fleißig am Ankreuzen. Das Portemonnaie wird leichter.'
    : h.marked >= 3 ? 'Solides Mittelmaß im Versagen.'
    : h.marked >= 1 ? 'Noch fast eine weiße Weste. Noch.' : 'Blitzsauber. Verdächtig sauber.';

  const cardHtml = h => `
    <div class="bcard ${h.place <= 3 && h.marked ? 'pay' + h.place : ''}">
      <div class="bhead">
        <img class="av" src="${av(h.m)}" alt="">
        <div><div class="bn">${esc(h.m.nick)}</div><div class="bs">${h.marked}/9 Felder${h.total > h.marked ? ` · ${h.total}× insgesamt` : ''}</div></div>
        ${h.place <= 3 && h.marked ? `<div class="bpay">${'🍺'.repeat(BINGO_ROUNDS[h.place - 1])}</div>` : ''}
      </div>
      <div class="bgrid">${BINGO_FIELDS.map(x => {
        const g = h.f[x.key];
        return `<div class="bf ${g.length ? 'hit' : ''}" title="${esc(x.desc)}">
          <span class="bi">${x.icon}</span><span class="bl">${esc(x.name)}</span>
          ${g.length ? `<span class="bx">${g.length > 1 ? g.length + '×' : '✗'}</span><span class="bg">GW ${[...new Set(g)].slice(0, 3).join(', ')}</span>` : ''}
        </div>`;
      }).join('')}</div>
      ${h.lines ? `<div class="bbingo">🎉 BINGO${h.lines > 1 ? ` ×${h.lines}` : ''}! Volle Reihe – Prost!</div>` : ''}
      <div class="broast">${roast(h)}</div>
    </div>`;

  const payers = hits.filter(h => h.place <= 3 && h.marked);
  box.innerHTML = `
    <div class="bpodium">
      <h3>🍻 Wer zahlt bei der Abschlussfeier? <small>Stand nach GW ${d.lastGW}</small></h3>
      ${payers.map(h => `<div class="bprow"><span class="bpl">${h.place}.</span><img class="av" src="${av(h.m)}" alt="">
        <b>${esc(h.m.nick)}</b><span class="bpf">${h.marked}/9 Felder · ${h.total} Kreuze</span>
        <span class="bpr">${'🍺'.repeat(BINGO_ROUNDS[h.place - 1])} ${BINGO_ROUNDS[h.place - 1]} Runde${BINGO_ROUNDS[h.place - 1] > 1 ? 'n' : ''}</span></div>`).join('')}
      <p class="bnote">Am Saisonende zahlen die drei mit den meisten angekreuzten Feldern je eine Runde. Zuerst zählt, wie viele der 9 Felder voll sind. Bei Gleichstand wird weitergezählt: wer insgesamt öfter angekreuzt wurde (z. B. 3× Rundenletzter), liegt vorne.</p>
    </div>
    <div class="bcards">${hits.map(cardHtml).join('')}</div>
    <div class="blegend"><h3>📜 Legende</h3>${BINGO_FIELDS.map(x => `<div><span>${x.icon}</span><b>${esc(x.name)}</b> – ${esc(x.desc)}</div>`).join('')}
      <p class="bnote">Gezählt wird die ganze laufende Saison, nur die Startelf (inkl. automatischer Einwechslungen). Ein Feld ist abgestempelt, sobald es einmal passiert ist – die Zahl zeigt, wie oft.</p></div>`;
}
