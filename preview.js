// Gentlemen's League – Vorschau-Bericht auf die nächste Gameweek (automatisch generierter Roast)
// (nutzt $, esc, leaders aus app.js)

function renderPreview(d, hist, comp) {
  const box = $('preview-report');
  const n = d.next;
  if (!box || !n) { if (box) box.remove(); return; }
  const GW = n.gw, last = d.lastGW;
  const ms = [...d.managers].sort((a, b) => a.rank - b.rank);
  const byAv = Object.fromEntries(ms.map(m => [m.avatar, m]));
  const b = s => `<b>${esc(s)}</b>`;

  // Zufall, aber pro Gameweek immer gleich
  let seed = GW * 104729 + 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const pick = arr => arr[Math.floor(rnd() * arr.length)];

  // --- Kennzahlen ---
  const gwPts = (m, gw) => m.gws.find(g => g.gw === gw)?.points;
  const form = m => [last - 2, last - 1, last].filter(g => g >= 1).reduce((a, g) => a + (gwPts(m, g) || 0), 0);
  const winStreak = m => { let k = 0; for (let g = last; g >= 1; g--) { const mx = Math.max(...ms.map(x => gwPts(x, g) ?? -1)); if (gwPts(m, g) === mx) k++; else break; } return k; };
  const rankAt = (m, g) => m.gws.find(x => x.gw === g)?.leagueRank;
  const F = ms[0], S = ms[1], Z = ms[ms.length - 1], Z1 = ms[ms.length - 2];
  const hot = leaders(ms.map(m => ({ m })), x => form(x.m))[0].m;
  const cold = leaders(ms.map(m => ({ m })), x => form(x.m), -1)[0].m;
  const climb = leaders(ms.map(m => ({ m })), x => (rankAt(x.m, Math.max(1, last - 2)) ?? x.m.rank) - x.m.rank)[0];
  const fall = leaders(ms.map(m => ({ m })), x => (rankAt(x.m, Math.max(1, last - 2)) ?? x.m.rank) - x.m.rank, -1)[0];

  // Liga-Historie: Titel & Laternen (echte Tabellen, sonst aus FPL-Punkten berechnet)
  const titles = {}, lanterns = {};
  const manual = hist?.seasons || {};
  const seasons = [...new Set([...ms.flatMap(m => m.past.map(p => p.season)), ...Object.keys(manual)])].filter(s => s >= '2016/17');
  for (const s of seasons) {
    let first, lastOne;
    if (manual[s]) { first = manual[s][0].who; lastOne = manual[s][manual[s].length - 1].who; }
    else {
      const rows = ms.map(m => ({ m, p: m.past.find(p => p.season === s) })).filter(x => x.p).sort((a, c) => c.p.points - a.p.points);
      if (!rows.length) continue;
      first = rows[0].m.avatar; lastOne = rows[rows.length - 1].m.avatar;
    }
    if (first) titles[first] = (titles[first] || 0) + 1;
    if (lastOne) lanterns[lastOne] = (lanterns[lastOne] || 0) + 1;
  }
  const T = m => titles[m.avatar] || 0, L = m => lanterns[m.avatar] || 0;

  // Spitznamen aus den Daten
  const nick = m => {
    const opts = [];
    if (m === F) opts.push('der Tabellen-Pate', 'Seine Majestät an der Spitze');
    if (m === Z) opts.push('das Kellerkind', 'der Laternenwärter vom Dienst');
    if (T(m) >= 3) opts.push('der Rekordmeister im Ruhestand', 'der alte König');
    if (L(m) >= 3) opts.push(`der Laternen-Dauerabonnent (${L(m)}×)`, 'der Stammkunde im Keller');
    if (m === hot) opts.push('der Mann mit dem Lauf');
    if (m === cold) opts.push('der Formkrisen-Beauftragte');
    return opts.length ? pick(opts) : null;
  };
  const who = m => { const k = nick(m); return k ? `${b(m.nick)}, ${k},` : b(m.nick); };

  // --- Absätze ---
  const gapTop = F.total - S.total, gapBottom = Z1.total - Z.total;
  const head = pick([
    `Vorschau GW ${GW}: Wer stoppt ${F.nick}?`,
    `GW ${GW}: ${Z.nick} gegen den Abgrund`,
    `Letzte Ausfahrt vor Gameweek ${GW}`,
    `GW ${GW}: Hochmut kommt vor dem Fall – oder?`,
  ]);

  const streak = winStreak(F);
  const top = [
    `${who(F)} geht mit ${gapTop} Punkten Vorsprung in die Runde${streak >= 2 ? ` und hat die letzten ${streak} Runden alle gewonnen – langsam wird das unheimlich` : ''}.`,
    gapTop <= 15
      ? pick([`${b(S.nick)} sitzt nur ${gapTop} Punkte dahinter und schärft schon das Messer.`, `${b(S.nick)} (${gapTop} dahinter) hat jetzt die Chance auf den Königsmord – oder auf die nächste Enttäuschung.`])
      : pick([`Dahinter hechelt ${b(S.nick)} mit ${gapTop} Punkten Rückstand hinterher. Aufholjagd oder Kapitulation? Wir tippen auf Kapitulation.`, `${b(S.nick)} liegt ${gapTop} Punkte zurück – das ist in FPL-Sprache „theoretisch noch möglich“, in Wahrheit aber „vergiss es“.`]),
    hot !== F ? `Achtung vor ${b(hot.nick)}: ${form(hot)} Punkte in den letzten 3 Runden – der hat einen Lauf und das Selbstvertrauen eines Mannes, der noch nie eine Wildcard verbockt hat.` : '',
    hot === F && climb.v > 0 && climb.m !== F ? `${b(climb.m.nick)} ist in den letzten Runden ${climb.v} Plätze geklettert – mal sehen, wie lange die Höhenluft hält.` : '',
  ].filter(Boolean).slice(0, 2).join(' ');

  const bottom = [
    pick([
      `Ganz unten hält ${who(Z)} die rote Laterne – ${gapBottom} Punkte hinter ${b(Z1.nick)}.`,
      `Im Keller brennt weiter das Licht bei ${who(Z)}. Abstand nach oben: ${gapBottom} Punkte. Abstand zur Würde: unmessbar.`,
    ]),
    L(Z) >= 2 ? `Überraschend ist das nicht: ${Z.nick} kennt die Laterne schon aus ${L(Z)} früheren Saisonen. Die Frage ist nicht ob, sondern wie lange noch.`
      : pick([`Kann ${Z.nick} den Spieß umdrehen? Die Statistik sagt Nein, der Stolz sagt vielleicht, die Aufstellung sagt wieder Nein.`, `Wird ${Z.nick} diese Runde die Wende schaffen? Wir haben Wetten angenommen. Niemand hat auf Ja gesetzt.`]),
    cold !== Z ? `Und dann wäre da noch ${b(cold.nick)} mit mageren ${form(cold)} Punkten aus den letzten 3 Runden – wer so weitermacht, bekommt die Laterne bald per Post zugestellt.` : '',
    fall.v < 0 && fall.m !== cold && fall.m !== Z ? `${b(fall.m.nick)} ist zuletzt ${-fall.v} Plätze abgerutscht. Freier Fall mit Aussicht.` : '',
    L(Z1) >= 3 && Z1 !== cold ? `${b(Z1.nick)} schaut übrigens auch schon wieder nervös nach unten – alte Gewohnheit (${L(Z1)}× Laterne).` : '',
  ].filter(Boolean).slice(0, 2).join(' ');

  // Duelle der Runde in CL & Cup
  const duels = [];
  if (comp) {
    const r = comp.cl?.rounds?.find(x => x.gw === GW);
    if (r) r.matches.forEach(([h, a]) => byAv[h] && byAv[a] && duels.push(['CL', byAv[h], byAv[a]]));
    for (const cr of comp.cup?.rounds || []) {
      const leg = cr.gws.indexOf(GW);
      if (leg >= 0) cr.ties.forEach(([h, a]) => byAv[h] && byAv[a] && duels.push([`Cup-${cr.name}`, leg ? byAv[a] : byAv[h], leg ? byAv[h] : byAv[a]]));
    }
  }
  const duelTxt = duels.length ? duels.slice(0, 1).map(([k, h, a]) => {
    const fav = form(h) >= form(a) ? h : a, dog = fav === h ? a : h;
    return pick([
      `${k}: ${b(h.nick)} gegen ${b(a.nick)} – auf dem Papier klarer Vorteil ${fav.nick}, aber Papier hat auch noch nie ein FPL-Team aufgestellt.`,
      `${k}: ${b(h.nick)} vs. ${b(a.nick)}. ${dog.nick} braucht ein Wunder, ${fav.nick} nur einen Kapitän, der nicht auf der Bank sitzt.`,
      `${k}: ${b(h.nick)} empfängt ${b(a.nick)}. Wer verliert, zahlt die nächste Runde – moralisch zumindest.`,
    ]);
  }).join(' ') : '';

  // Topspiel der Premier League + wie viele von uns Spieler dort haben
  // Topspiel = beide Teams stark (höchste Mindest-Schwierigkeit, dann Summe)
  const fx = [...(n.fixtures || [])].sort((x, y) =>
    (Math.min(y.homeDiff, y.awayDiff) - Math.min(x.homeDiff, x.awayDiff)) || ((y.homeDiff + y.awayDiff) - (x.homeDiff + x.awayDiff)))[0];
  let fxTxt = '';
  if (fx) {
    const P = d.players || {};
    const owners = ms.filter(m => {
      const s = (m.squads || [])[(m.squads || []).length - 1];
      return s && s.picks.some(([id, pos]) => pos <= 11 && [fx.home.code, fx.away.code].includes(P[id]?.[3]));
    }).length;
    fxTxt = `Topspiel: ${b(fx.home.name)} – ${b(fx.away.name)}, ${owners} von ${ms.length} zittern mit.`;
  }
  const dl = new Date(n.deadline).toLocaleString('de-AT', { timeZone: 'Europe/Vienna', weekday: 'long', hour: '2-digit', minute: '2-digit' });

  box.innerHTML = `
    <div class="kicker">🔮 Vorschau · Gameweek ${GW}</div>
    <h3>${esc(head)}</h3>
    <p>${top}</p>
    <p style="margin-top:8px">${bottom}</p>
    ${duelTxt || fxTxt ? `<p style="margin-top:8px">${[duelTxt, fxTxt].filter(Boolean).join(' ')} ⏰ Deadline: ${esc(dl)} Uhr.</p>` : `<p style="margin-top:8px">⏰ Deadline: ${esc(dl)} Uhr.</p>`}
    <div class="by">– Der Gentleman-Reporter. Mit Glaskugel, ohne Gewissen.</div>`.replace(/,\s*([.!?])/g, '$1');
}
