// Gentlemen's League – Bowling-Reiter: Abende, Spiele Wurf für Wurf, Gesamtwertung & Statistik (data/bowling.json)
// (nutzt $, esc, av aus app.js)

// Frames → einzelne Würfe (Pins). Notation: X Strike, / Spare, - 0, s = Split beim ersten Wurf
function bowlRolls(frames) {
  const r = [];
  for (const f of frames) { let prev = 0; for (const c of f.replace(/^s/, '')) { const v = c === 'X' ? 10 : c === '-' ? 0 : c === '/' ? 10 - prev : +c; r.push(v); prev = c === 'X' || c === '/' ? 0 : v; } }
  return r;
}
// laufende Summe je Frame (wie auf der Anzeigetafel)
function bowlRunning(frames) {
  const r = bowlRolls(frames), out = []; let s = 0, i = 0;
  for (let f = 0; f < 10; f++) {
    if (r[i] === 10) { s += 10 + (r[i + 1] || 0) + (r[i + 2] || 0); i++; }
    else if (r[i] + r[i + 1] === 10) { s += 10 + (r[i + 2] || 0); i += 2; }
    else { s += (r[i] || 0) + (r[i + 1] || 0); i += 2; }
    out.push(s);
  }
  return out;
}
// Statistik eines Spiels
function bowlStats(frames) {
  let strikes = 0, spares = 0, misses = 0, splits = 0, spareChances = 0, opens = 0;
  frames.forEach((f, i) => {
    const s = f.replace(/^s/, '');
    if (f.startsWith('s')) splits++;
    strikes += (s.match(/X/g) || []).length;
    spares += (s.match(/\//g) || []).length;
    misses += (s.match(/-/g) || []).length;
    if (i < 9) { if (s[0] !== 'X') { spareChances++; if (s[1] !== '/') opens++; } }
    else if (s[0] !== 'X') spareChances++;
  });
  return { strikes, spares, misses, splits, spareChances, opens };
}

function renderBowling(d) {
  const box = $('bowling');
  if (!box) return;
  fetch('data/bowling.json?' + Date.now(), { cache: 'no-cache' }).then(r => r.json()).then(B => drawBowling(d, B, box))
    .catch(() => { box.innerHTML = '<p class="bw-note">Noch keine Bowling-Daten.</p>'; });
}

function drawBowling(d, B, box) {
  const byAv = Object.fromEntries(d.managers.map(m => [m.avatar, m]));
  const nick = a => byAv[a]?.nick || a;
  const face = a => byAv[a] ? `<img class="av" src="${av(byAv[a])}" alt="">` : '<img class="av" src="assets/avatars/unknown.svg" alt="">';
  const tz = { timeZone: 'Europe/Vienna' };
  const dateTxt = s => new Date(s + 'T12:00:00Z').toLocaleDateString('de-AT', { ...tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const evenings = [...B.evenings].sort((a, b) => b.date.localeCompare(a.date));

  // ---- Gesamtwertung über alle Abende ----
  const tot = {};
  for (const e of evenings) for (const g of e.games) for (const p of g.players) {
    const t = tot[p.who] ||= { who: p.who, games: 0, pins: 0, best: 0, strikes: 0, spares: 0, misses: 0, splits: 0, spareChances: 0, nights: new Set(), wins: 0 };
    const st = bowlStats(p.frames);
    t.games++; t.pins += p.score; t.best = Math.max(t.best, p.score); t.nights.add(e.date);
    for (const k of ['strikes', 'spares', 'misses', 'splits', 'spareChances']) t[k] += st[k];
  }
  // Abendsieger = höchster Schnitt des Abends
  const nightTable = e => {
    const t = {};
    for (const g of e.games) for (const p of g.players) { const x = t[p.who] ||= { who: p.who, games: 0, pins: 0, best: 0, scores: [] }; x.games++; x.pins += p.score; x.best = Math.max(x.best, p.score); x.scores.push(p.score); }
    return Object.values(t).map(x => ({ ...x, avg: x.pins / x.games })).sort((a, b) => b.avg - a.avg);
  };
  for (const e of evenings) { const w = nightTable(e)[0]; if (w && tot[w.who]) tot[w.who].wins++; }
  const rows = Object.values(tot).map(t => ({ ...t, avg: t.pins / t.games, nights: t.nights.size })).sort((a, b) => b.avg - a.avg);
  const f1 = v => v.toLocaleString('de-AT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const pct = (a, b) => b ? Math.round(a / b * 100) + ' %' : '–';

  // ---- Auszeichnungen ----
  const leader = (f, dir = 1) => [...rows].sort((a, b) => dir * (f(b) - f(a)))[0];
  const best1 = evenings.flatMap(e => e.games.flatMap(g => g.players.map(p => ({ ...p, date: e.date })))).sort((a, b) => b.score - a.score)[0];
  const awards = rows.length ? [
    ['👑', 'Bowling-König', leader(r => r.avg), r => `Ø ${f1(r.avg)} Pins`],
    ['🔥', 'Bestes Spiel', { who: best1.who }, () => `${best1.score} Pins`],
    ['💥', 'Strike-Maschine', leader(r => r.strikes / r.games), r => `${r.strikes} Strikes in ${r.games} Spielen`],
    ['🧹', 'Spare-Spezialist', leader(r => r.spareChances ? r.spares / r.spareChances : 0), r => `${pct(r.spares, r.spareChances)} der Chancen genutzt`],
    ['🕳️', 'Rinnen-Ritter', leader(r => r.misses / r.games), r => `${f1(r.misses / r.games)} Fehlwürfe pro Spiel`],
    ['🎳', 'Split-Pechvogel', leader(r => r.splits), r => `${r.splits} Splits`],
  ] : [];

  // ---- Abend-Karten ----
  const evHtml = evenings.map((e, ei) => {
    const nt = nightTable(e);
    const rounds = [...new Set(e.games.map(g => g.round))].sort((a, b) => a - b);
    const scoreOf = (who, r) => e.games.filter(g => g.round === r).flatMap(g => g.players).find(p => p.who === who)?.score;
    const roundBest = r => Math.max(...e.games.filter(g => g.round === r).flatMap(g => g.players.map(p => p.score)));
    const podium = nt.slice(0, 3);
    return `<div class="bw-night">
      <div class="bw-night-head"><div><b>${dateTxt(e.date)}</b><small>${esc(e.place || '')}${e.uploadedBy ? ` · hochgeladen von ${esc(nick(e.uploadedBy))}` : ''}</small></div>
        <span class="bw-chip">${e.games.length} Spiele · ${nt.length} Spieler</span></div>
      <div class="bw-podium">${[1, 0, 2].map(i => podium[i] ? `<div class="bw-pod p${i + 1}">${face(podium[i].who)}<b>${esc(nick(podium[i].who))}</b><span>Ø ${f1(podium[i].avg)}</span><div class="bw-step">${i + 1}</div></div>` : '').join('')}</div>
      <div class="bw-tbl"><table><thead><tr><th>Spieler</th>${rounds.map(r => `<th class="num">Sp. ${r}</th>`).join('')}<th class="num">Ø</th><th class="num">Pins</th></tr></thead><tbody>
        ${nt.map(x => `<tr><td><div class="who">${face(x.who)}<div>${esc(nick(x.who))}</div></div></td>${rounds.map(r => { const s = scoreOf(x.who, r); return `<td class="num ${s != null && s === roundBest(r) ? 'bw-top' : ''}">${s ?? '–'}</td>`; }).join('')}<td class="num"><b>${f1(x.avg)}</b></td><td class="num">${x.pins}</td></tr>`).join('')}
      </tbody></table></div>
      <details class="bw-cards"><summary>🎞️ Alle Spiele Wurf für Wurf</summary>
        ${e.games.slice().sort((a, b) => a.round - b.round || a.lane - b.lane).map(g => `<div class="bw-board"><div class="bw-board-h">Spiel ${g.round} · Bahn ${g.lane}</div>
          <table><tr><th></th>${[...Array(10)].map((_, i) => `<th>${i + 1}</th>`).join('')}<th>Σ</th></tr>
          ${g.players.map(p => { const run = bowlRunning(p.frames); return `<tr><td class="nm">${esc(nick(p.who))}</td>${p.frames.map((f, i) => `<td><span class="rl">${esc(f.replace(/^s/, '')).replace(/X/g, '✕')}${f.startsWith('s') ? '<i title="Split">•</i>' : ''}</span>${run[i]}</td>`).join('')}<td class="sum">${p.score}</td></tr>`; }).join('')}
          </table></div>`).join('')}
      </details>
    </div>`;
  }).join('');

  box.innerHTML = `
    <div class="bw-hero"><div class="bw-lights"></div>
      <button type="button" class="bw-upload">📸 Bowling-Abend hochladen</button>
      <h2>🎳 Gentlemen's Bowling</h2>
      <p>${evenings.length} Abend${evenings.length === 1 ? '' : 'e'} · ${rows.reduce((a, r) => a + r.games, 0)} Einzelspiele · ${rows.reduce((a, r) => a + r.strikes, 0)} Strikes</p>
    </div>
    <h3 class="bw-h">🏅 Auszeichnungen</h3>
    <div class="bw-awards">${awards.map(([ic, t, r, txt]) => r ? `<div class="bw-award"><div class="ic">${ic}</div>${face(r.who)}<div><small>${t}</small><b>${esc(nick(r.who))}</b><span>${txt(r)}</span></div></div>` : '').join('')}</div>
    <h3 class="bw-h">📊 Gesamtwertung</h3>
    <div class="bw-tbl"><table><thead><tr><th>#</th><th>Spieler</th><th class="num">Ø</th><th class="num">Bestes</th><th class="num">Spiele</th><th class="num">💥 Strikes</th><th class="num">🧹 Spares</th><th class="num">Spare-%</th><th class="num">🕳️ Fehl</th><th class="num">🎳 Splits</th><th class="num">🏆 Abende</th></tr></thead><tbody>
      ${rows.map((r, i) => `<tr><td class="rank">${i + 1}</td><td><div class="who">${face(r.who)}<div>${esc(nick(r.who))}</div></div></td><td class="num"><b>${f1(r.avg)}</b></td><td class="num">${r.best}</td><td class="num">${r.games}</td><td class="num">${r.strikes}</td><td class="num">${r.spares}</td><td class="num">${pct(r.spares, r.spareChances)}</td><td class="num">${r.misses}</td><td class="num">${r.splits}</td><td class="num">${r.wins}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="bw-note">Ø = Durchschnitt pro Spiel. Spare-% = verwertete Spare-Chancen (jeder Frame ohne Strike). Fehl = Würfe mit 0 Pins. 🏆 Abende = wie oft jemand den besten Schnitt des Abends hatte.</p>
    <h3 class="bw-h">🗓️ Bowling-Abende</h3>
    ${evHtml}`;
}

// Bowling-Look für die ganze Seite, solange der Reiter offen ist
(function () {
  const mark = () => document.body.classList.toggle('bowling-mode', (location.hash || '').startsWith('#bowling'));
  addEventListener('hashchange', mark); mark();
})();

// ---------- Upload: Fotos der Anzeigetafeln → KI liest aus → erscheint automatisch ----------
const BOWL_API = 'https://gentlemens-liga-wecker.ppat18usa.workers.dev/bowling/upload';
// Foto verkleinern (max. 1600 px, JPEG) – spart Upload-Zeit und KI-Kosten
function bowlShrink(file) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => rej(new Error('Bild nicht lesbar: ' + file.name));
    img.src = url;
  });
}
function bowlUploadDialog() {
  const d = window.LEAGUE; if (!d) return;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date());
  let code = ''; try { code = localStorage.getItem('bowl-code') || ''; } catch (e) { /* egal */ }
  const ov = document.createElement('div');
  ov.className = 'bw-modal';
  ov.innerHTML = `<form class="bw-dialog">
    <button type="button" class="bw-x" aria-label="Schließen">×</button>
    <h3>📸 Bowling-Abend hochladen</h3>
    <p class="bw-hint">Fotos der Anzeigetafeln hochladen – sie werden automatisch ausgelesen (Wurf für Wurf) und spätestens am nächsten Morgen eingetragen.</p>
    <label>Datum<input type="date" name="date" value="${today}" required></label>
    <label>Wer lädt hoch?<select name="uploader" required><option value="">– bitte wählen –</option>
      ${[...d.managers].sort((a, b) => a.nick.localeCompare(b.nick)).map(m => `<option value="${esc(m.avatar)}">${esc(m.nick)}</option>`).join('')}</select></label>
    <label>Bowlingcenter <small>(optional)</small><input name="place" placeholder="z. B. Kino Bowling"></label>
    <label>Fotos<input type="file" name="photos" accept="image/*" multiple required></label>
    <label>Liga-Code<input name="code" value="${esc(code)}" autocomplete="off" required></label>
    <button class="bw-send" type="submit">🎳 Hochladen</button>
    <div class="bw-status" aria-live="polite"></div>
  </form>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('.bw-x')) close(); });
  const form = ov.querySelector('form'), status = ov.querySelector('.bw-status'), btn = ov.querySelector('.bw-send');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(form), files = [...form.photos.files].slice(0, 12);
    btn.disabled = true;
    try {
      status.textContent = `Fotos werden vorbereitet (${files.length}) …`;
      const images = await Promise.all(files.map(bowlShrink));
      status.textContent = `${files.length} Foto${files.length > 1 ? 's werden' : ' wird'} hochgeladen …`;
      const r = await fetch(BOWL_API, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: f.get('code'), date: f.get('date'), uploader: f.get('uploader'), place: f.get('place'), images }) });
      const out = await r.json();
      if (!r.ok) throw new Error(out.error || 'Fehler ' + r.status);
      try { localStorage.setItem('bowl-code', f.get('code')); } catch (e2) { /* egal */ }
      form.querySelectorAll('input, select').forEach(x => x.disabled = true);
      status.innerHTML = `<b>✅ Danke! ${out.queued} Foto${out.queued === 1 ? ' ist' : 's sind'} angekommen.</b><br>Sie werden automatisch ausgelesen und spätestens am nächsten Morgen (österreichische Zeit) hier eingetragen.`;
    } catch (err) {
      status.innerHTML = `<b>❌ ${esc(err.message)}</b>`;
      btn.disabled = false;
    }
  });
}
document.addEventListener('click', e => { if (e.target.closest('.bw-upload')) bowlUploadDialog(); });
