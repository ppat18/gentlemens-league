// Scout – Anzeige von data/scout.json (wird von scripts/scout.js bei jedem Datenabgleich erzeugt)
(async function () {
  const app = document.getElementById('app');
  let S;
  try { S = await (await fetch('../data/scout.json?' + Date.now(), { cache: 'no-cache' })).json(); }
  catch (e) { app.innerHTML = '<p class="note">Noch keine Scout-Daten – sie entstehen beim nächsten Datenabgleich.</p>'; return; }

  const P = S.players, TZ = { timeZone: 'Europe/Vienna' };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const n1 = v => (Math.round(v * 10) / 10).toLocaleString('de-AT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const POS = { 1: 'TW', 2: 'VT', 3: 'MF', 4: 'ST' };
  const badge = p => `<img src="../assets/badges/${p.code}.png" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`;
  const flag = p => p.status === 'a' ? '' : `<span class="tag ${p.status === 'd' ? 'd' : 'inj'}" title="${esc(p.news)}">${p.chance != null ? p.chance + ' %' : '!'}</span>`;
  const pl = (id, extra = '') => { const p = P[id]; if (!p) return '?'; return `<div class="pl">${badge(p)}<span class="pos p${p.pos}">${POS[p.pos]}</span><b>${esc(p.name)}</b>${flag(p)}${extra}</div>`; };
  const nextXP = id => P[id]?.xp[0]?.pts ?? 0;
  const fxCell = x => !x.fx.length ? '<span class="fx f0">–<small>0</small></span>'
    : x.fx.map(f => `<span class="fx f${f.fdr}">${esc(f.opp)}${f.home ? '' : ' (a)'}<small>${n1(x.pts / x.fx.length)}</small></span>`).join(' ');
  const dl = S.deadline ? new Date(S.deadline).toLocaleString('de-AT', { ...TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–';

  document.getElementById('sub').textContent = `${S.team.name} · Gameweek ${S.nextGW} · Deadline ${dl}`;
  document.getElementById('pills').innerHTML = [
    `🆓 <b>${S.ft}</b> ${S.ft === 1 ? 'freier Transfer' : 'freie Transfers'}`, `🏦 Bank <b>£${n1(S.team.bank)}</b>`, `💰 Teamwert <b>£${n1(S.team.value)}</b>`,
    `🌍 Rang <b>${(S.team.rank || 0).toLocaleString('de-AT')}</b>`,
  ].map(t => `<span class="pill">${t}</span>`).join('');

  // --- Empfehlung ---
  const a = S.advice;
  const moveHtml = m => `<div class="move"><span class="out">⬇ ${esc(P[m.out]?.name)}</span> → <span class="in">⬆ ${esc(P[m.inn]?.name)}</span></div>`;
  const adviceHtml = a.type === 'roll'
    ? `<div class="big">🧊 Diese Woche: nichts tun</div><div>${esc(a.text)}</div>`
    : `<div class="big">✅ Empfehlung: ${a.n} Transfer${a.n > 1 ? 's' : ''}${a.hits ? ` (−${a.hits})` : ''}</div>
       ${a.moves.map(moveHtml).join('')}
       <div>Bringt über die nächsten ${S.gws.length} Spieltage ca. <span class="gain">+${n1(a.gain)}</span> Punkte${a.hits ? `, nach Hit <span class="gain">${a.net >= 0 ? '+' : ''}${n1(a.net)}</span>` : ''}. Danach £${n1(a.bankAfter)} auf der Bank.</div>`;
  const cap = S.xi.cap, vice = S.xi.vice;
  const capList = [...S.xi.xi].sort((x, y) => nextXP(y) - nextXP(x)).slice(0, 5);

  // --- Aufstellung ---
  const rows = [1, 2, 3, 4].map(t => S.xi.xi.filter(id => P[id].pos === t));
  const xp = id => `<div class="xp">${id === cap ? '<span class="tag c">C</span>' : id === vice ? '<span class="tag v">V</span>' : ''}${badge(P[id])}<div class="n">${esc(P[id].name)}</div><div class="v">${n1(nextXP(id))}</div></div>`;

  // --- Transfers ---
  const singleRows = S.singles.map(s => `<tr><td>${pl(s.out)}</td><td>${pl(s.inn, P[s.inn].owners.length ? ` <span class="tag" title="In der Liga bei: ${esc(P[s.inn].owners.join(', '))}">👥${P[s.inn].owners.length}</span>` : '')}</td>
    <td class="num">£${n1(P[s.inn].price)}</td><td class="num"><span class="gain">+${n1(s.gain)}</span></td></tr>`).join('');
  const doubleRows = S.doubles.map(d => `<tr><td>${d.moves.map(m => `${esc(P[m.out].name)} → <b>${esc(P[m.inn].name)}</b>`).join('<br>')}</td>
    <td class="num"><span class="gain">+${n1(d.gain)}</span></td><td class="num"><span class="gain ${S.ft >= 2 ? '' : d.net < 0 ? 'neg' : ''}">${S.ft >= 2 ? '+' + n1(d.gain) : (d.net >= 0 ? '+' : '') + n1(d.net)}</span></td></tr>`).join('');

  // --- Planer ---
  const sortedSquad = [...S.squad].sort((x, y) => P[x].pos - P[y].pos || P[y].xp5 - P[x].xp5);
  const planRows = sortedSquad.map(id => `<tr><td>${pl(id)}</td>${P[id].xp.map(x => `<td>${fxCell(x)}</td>`).join('')}<td class="num"><b>${n1(P[id].xp5)}</b></td></tr>`).join('');

  // --- Bewertung ---
  const R = S.rating, maxScore = Math.max(...R.table.map(t => t.score), 1), minScore = Math.min(...R.table.map(t => t.score));
  const rateRows = R.table.map((t, i) => `<tr class="${t.me ? 'me' : ''}"><td>${i + 1}</td><td>${esc(t.nick)}</td>
    <td style="width:45%"><div class="bar"><i style="width:${Math.max(4, (t.score - minScore * 0.9) / (maxScore - minScore * 0.9) * 100)}%"></i></div></td><td class="num">${t.score}</td></tr>`).join('');

  // --- Beobachtungsliste ---
  const watchTable = (t, k) => S.watch[t][k].map(id => { const p = P[id]; return `<tr><td>${pl(id)}</td><td class="num">£${n1(p.price)}</td><td class="num">${n1(p.form)}</td><td class="num">${p.own.toLocaleString('de-AT')} %</td><td class="num"><b>${n1(p.xp5)}</b></td></tr>`; }).join('');

  // --- Preise ---
  const priceRow = id => { const p = P[id]; return `<tr><td>${pl(id)}</td><td class="num">£${n1(p.price)}</td><td class="num"><span class="prog ${p.priceProg >= 0 ? 'up' : 'down'}">${p.priceProg >= 0 ? '▲' : '▼'} ${Math.round(Math.abs(p.priceProg))} %</span></td></tr>`; };
  const mine = S.squad.filter(id => P[id].priceProg != null && Math.abs(P[id].priceProg) >= 40).sort((x, y) => Math.abs(P[y].priceProg) - Math.abs(P[x].priceProg));

  // --- Chips ---
  const left = ['wildcard', 'freehit', 'bboost', '3xc'].filter(c => !S.team.chipsUsed.includes(c));
  const chipName = { wildcard: '♻️ Wildcard', freehit: '🎯 Free Hit', bboost: '🪑 Bench Boost', '3xc': '3️⃣ Triple Captain' };
  const bestBB = [...S.chipPlan].sort((x, y) => y.benchPts - x.benchPts)[0], bestTC = [...S.chipPlan].sort((x, y) => y.capPts - x.capPts)[0];
  const injured = S.squad.filter(id => P[id].status !== 'a');

  app.innerHTML = `
  <h2>🎯 Diese Woche <small>Gameweek ${S.nextGW}</small></h2>
  <div class="grid">
    <div class="card gold advice">${adviceHtml}</div>
    <div class="card">
      <div class="advice"><div class="big">©️ Kapitän: ${esc(P[cap].name)}</div></div>
      <table><tr><th>Spieler</th><th class="num">Prognose</th><th class="num">Liga hat ihn</th></tr>
      ${capList.map(id => `<tr><td>${pl(id, id === cap ? ' <span class="tag c">C</span>' : id === vice ? ' <span class="tag v">V</span>' : '')}</td><td class="num"><b>${n1(nextXP(id))}</b></td><td class="num">${P[id].owners.length}/${R.of - 1}</td></tr>`).join('')}</table>
      <p class="muted" style="margin-top:6px">„Liga hat ihn“ = wie viele der anderen Gentlemen ihn im Kader haben. Wenig = Differential, viel = Absicherung.</p>
    </div>
  </div>
  ${injured.length ? `<div class="card red" style="margin-top:12px"><b>🚑 Sorgenkinder:</b> ${injured.map(id => `${esc(P[id].name)} ${flag(P[id])} <span class="muted">${esc(P[id].news)}</span>`).join(' · ')}</div>` : ''}

  <h2>📋 Beste Aufstellung <small>${S.xi.formation} · Prognose ${n1(S.xi.total)} Pkt. inkl. Kapitän</small></h2>
  <div class="card navy"><div class="xi">${rows.map(r => `<div class="xrow">${r.map(xp).join('')}</div>`).join('')}</div>
    <div class="benchrow">${S.xi.bench.map(xp).join('')}</div>
    <p class="muted" style="margin-top:6px">Bank in Einwechsel-Reihenfolge. Zahlen = erwartete Punkte in GW ${S.nextGW} (ohne Kapitänsfaktor).</p></div>

  <h2>🔁 Transfer-Vorschläge <small>Punkte-Plus über ${S.gws.length} Spieltage</small></h2>
  <div class="grid">
    <div class="tbl"><table><tr><th>Raus</th><th>Rein</th><th class="num">Preis</th><th class="num">Plus</th></tr>${singleRows || '<tr><td colspan="4">Kein Transfer bringt merklich mehr.</td></tr>'}</table></div>
    <div class="tbl"><table><tr><th>Doppel-Transfer</th><th class="num">Plus</th><th class="num">${S.ft >= 2 ? 'Gratis' : 'nach −4'}</th></tr>${doubleRows || '<tr><td colspan="3">–</td></tr>'}</table></div>
  </div>
  <p class="note">👥 = so viele Gentlemen haben den Spieler schon. Budget, Verkaufspreise (Kaufpreis + halber Gewinn) und max. 3 Spieler je Verein sind berücksichtigt.</p>

  <h2>🗓️ Planer <small>Gegner, Schwierigkeit & Prognose je Spieltag</small></h2>
  <div class="tbl"><table><tr><th>Spieler</th>${S.gws.map(g => `<th>GW ${g}</th>`).join('')}<th class="num">Σ</th></tr>${planRows}</table></div>
  <p class="note">Farbe = FPL-Schwierigkeit (grün leicht → rot schwer), (a) = auswärts, kleine Zahl = erwartete Punkte. Σ = gewichtete Summe (nähere Spieltage zählen mehr).</p>

  <h2>🏅 Team-Bewertung <small>Kaderstärke der nächsten ${S.gws.length} Spieltage im Liga-Vergleich</small></h2>
  <div class="grid">
    <div class="card"><div class="rate"><div class="grade">${R.grade || '–'}</div><div><b style="font:700 20px Oswald">Platz ${R.rank} von ${R.of}</b><div class="muted">Bewertet wird, was die aktuellen Kader in den nächsten ${S.gws.length} Runden voraussichtlich holen (beste Elf + Kapitän je Runde).</div></div></div></div>
    <div class="tbl"><table><tr><th>#</th><th>Manager</th><th></th><th class="num">Prognose</th></tr>${rateRows}</table></div>
  </div>

  <h2>🔎 Beobachtungsliste</h2>
  <div class="tabs" id="wtabs">${[1, 2, 3, 4].map(t => `<button data-t="${t}" class="${t === 3 ? 'on' : ''}">${{ 1: 'Tor', 2: 'Abwehr', 3: 'Mittelfeld', 4: 'Sturm' }[t]}</button>`).join('')}
    <button data-k="top" class="on" style="margin-left:auto">Top</button><button data-k="value">Preis-Leistung</button></div>
  <div class="tbl"><table><thead><tr><th>Spieler</th><th class="num">Preis</th><th class="num">Form</th><th class="num">Besitz</th><th class="num">Prognose</th></tr></thead><tbody id="wbody"></tbody></table></div>

  <h2>💷 Preise <small>Fortschritt bis zur nächsten Preisänderung (FPL)</small></h2>
  <div class="grid">
    <div class="tbl"><table><tr><th>Dein Kader</th><th class="num">Preis</th><th class="num">Tendenz</th></tr>${mine.map(priceRow).join('') || '<tr><td colspan="3">Keine Preisänderung in Sicht.</td></tr>'}</table></div>
    <div class="tbl"><table><tr><th>Steigt bald</th><th class="num">Preis</th><th class="num">Tendenz</th></tr>${S.rising.map(priceRow).join('')}</table></div>
    <div class="tbl"><table><tr><th>Fällt bald</th><th class="num">Preis</th><th class="num">Tendenz</th></tr>${S.falling.map(priceRow).join('')}</table></div>
  </div>
  <p class="note">100 % = Preisänderung in der kommenden Nacht. Wer steigt, vor der Änderung kaufen; wer fällt, vorher verkaufen.</p>

  <h2>🃏 Chips <small>übrig: ${left.map(c => chipName[c]).join(', ') || 'keine'}</small></h2>
  <div class="grid">
    <div class="tbl"><table><tr><th>GW</th><th class="num">Bank-Punkte</th><th>Bester Kapitän</th><th class="num">Doppel / Leer</th></tr>
      ${S.chipPlan.map(c => `<tr><td>${c.gw}</td><td class="num">${n1(c.benchPts)}</td><td>${esc(P[c.cap]?.name)} (${n1(c.capPts)})</td><td class="num">${c.doubles} / ${c.blanks}</td></tr>`).join('')}</table></div>
    <div class="card"><b>Tipp</b><br>
      ${left.includes('bboost') ? `🪑 <b>Bench Boost</b>: am meisten bringt aktuell GW ${bestBB.gw} (Bank ca. ${n1(bestBB.benchPts)} Pkt.) – lohnt sich erst richtig ab ~12 oder in einer Doppelrunde.<br>` : ''}
      ${left.includes('3xc') ? `3️⃣ <b>Triple Captain</b>: bester Zeitpunkt in Sicht GW ${bestTC.gw} mit ${esc(P[bestTC.cap]?.name)} (ca. ${n1(bestTC.capPts)} Pkt.) – ideal in einer Doppelrunde.<br>` : ''}
      ${S.chipPlan.some(c => c.blanks >= 3) ? `🎯 <b>Free Hit</b> überlegen: in GW ${S.chipPlan.filter(c => c.blanks >= 3).map(c => c.gw).join(', ')} spielen mehrere deiner Spieler nicht.<br>` : ''}
      <span class="muted">Doppel / Leer = Spieler deines Kaders mit zwei Spielen bzw. ohne Spiel in dieser Runde.</span></div>
  </div>

  <h2>🧪 Modell-Check <small>unsere Prognose vs. FPLs eigene Erwartung (GW ${S.nextGW})</small></h2>
  <div class="tbl"><table><tr><th>Spieler</th><th class="num">Scout</th><th class="num">FPL</th></tr>
    ${S.check.sort((x, y) => y.our - x.our).map(c => `<tr><td>${pl(c.id)}</td><td class="num"><b>${n1(c.our)}</b></td><td class="num">${n1(c.fpl)}</td></tr>`).join('')}</table></div>
  <p class="note">So rechnet der Scout: Einsatzwahrscheinlichkeit (Startelf-Quote × Fitness) · erwartete Tore & Vorlagen je 90 Min. (xG/xA, geglättet) × Stärke des Gegners · Zu-null-Chance aus erwarteten Gegentoren · Paraden · Defensivbeiträge · Bonus · Karten. Für die nächste Runde fließt zu 30 % FPLs eigene Erwartung ein. Stand: ${new Date(S.updated).toLocaleString('de-AT', { ...TZ, dateStyle: 'medium', timeStyle: 'short' })} Uhr. Sichtbar ist nur der Kader der letzten Deadline – Transfers, die du seither gemacht hast, kennt FPL öffentlich noch nicht.</p>`;

  // Beobachtungsliste umschalten
  let wt = 3, wk = 'top';
  const drawWatch = () => { document.getElementById('wbody').innerHTML = watchTable(wt, wk); document.querySelectorAll('#wtabs button').forEach(b => b.classList.toggle('on', b.dataset.t ? +b.dataset.t === wt : b.dataset.k === wk)); };
  document.getElementById('wtabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.t) wt = +b.dataset.t; else wk = b.dataset.k; drawWatch(); });
  drawWatch();
})();
