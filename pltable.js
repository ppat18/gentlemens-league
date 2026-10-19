// Premier-League-Tabelle als eigene Seite (#premier-league), geöffnet über den Knopf im Spielkalender (Patrick, 19.10.2026).
// Berechnet aus data/fixtures.json (alle Saisonspiele mit Ergebnis): fertige Spiele + laufende Spiele als Live-Stand.
// Spalten: Platz, Verein, Sp., S/U/N, Tore, Diff., Pkt. + Form der letzten 5. Zonen: CL (1–4), Europa (5), Abstieg (18–20).
// Sprache aus <html lang> (de/en) – dieselbe Datei läuft auch auf der Business-Seite (dort Wappen als .svg).
(function () {
  const BADGE_EXT = 'png';
  const de = (document.documentElement.lang || 'de').startsWith('de');
  const T = de ? {
    btn: '🏆 Premier-League-Tabelle', title: '🏆 Premier-League-Tabelle', back: '‹ Zurück', pos: '#', team: 'Verein', p: 'Sp.', w: 'S', d: 'U', l: 'N',
    goals: 'Tore', gd: 'Diff.', pts: 'Pkt.', form: 'Form', live: 'Live-Stand: laufende Spiele sind schon eingerechnet', after: 'Stand nach Gameweek',
    note: 'S = Sieg · U = Unentschieden · N = Niederlage · Form = letzte 5 Spiele (neueste rechts). 🟦 Champions League · 🟧 Europa League · 🟥 Abstieg. Berechnet aus den offiziellen Spieldaten.',
    win: 'Sieg', draw: 'Remis', loss: 'Niederlage', loading: 'Tabelle wird geladen …', locale: 'de-AT',
  } : {
    btn: '🏆 Premier League table', title: '🏆 Premier League table', back: '‹ Back', pos: '#', team: 'Club', p: 'P', w: 'W', d: 'D', l: 'L',
    goals: 'Goals', gd: 'GD', pts: 'Pts', form: 'Form', live: 'Live table: matches in progress are included', after: 'Standings after gameweek',
    note: 'W = win · D = draw · L = loss · Form = last 5 matches (latest on the right). 🟦 Champions League · 🟧 Europa League · 🟥 relegation. Calculated from the official match data.',
    win: 'Win', draw: 'Draw', loss: 'Loss', loading: 'Loading the table …', locale: 'en-GB',
  };
  const css = `
  .cal-table{display:flex;justify-content:center;margin:10px 0 2px}
  .cal-table a{display:inline-flex;align-items:center;gap:6px;background:var(--navy);color:#fff;text-decoration:none;font:700 15px Oswald;text-transform:uppercase;letter-spacing:.6px;padding:9px 18px;border-radius:999px;box-shadow:0 4px 12px rgba(0,0,0,.25);border:2px solid rgba(255,255,255,.25)}
  .cal-table a:hover{background:var(--navy-2)}
  .plt-live{background:var(--red);color:#fff;border-radius:12px;padding:7px 12px;font-size:13px;font-weight:600;margin-bottom:10px}
  .plt td,.plt th{padding:8px 6px;font-variant-numeric:tabular-nums}
  .plt th{text-align:center}.plt th.tl{text-align:left}
  .plt td{text-align:center;border-bottom:1px solid #eceef3;color:var(--ink)}
  .plt td.club{text-align:left}
  .plt .club div{display:flex;align-items:center;gap:8px;font-weight:600;white-space:nowrap}
  .plt .club img{width:24px;height:24px;object-fit:contain;flex:none}
  .plt .club .short{display:none}
  .plt td.pts{font:700 18px Oswald;color:var(--navy)}
  .plt td.pos{font:700 16px Oswald;border-left:5px solid transparent}
  .plt tr.cl td.pos{border-left-color:#2a6fdb}.plt tr.el td.pos{border-left-color:#f08a24}.plt tr.rel td.pos{border-left-color:var(--red)}
  .plt tr.rel td{background:rgba(224,49,47,.05)}
  .plt tr.live td{background:rgba(224,49,47,.08)}
  .plt .form{display:inline-flex;gap:3px}
  .plt .form i{width:18px;height:18px;border-radius:5px;font:700 11px/18px Inter;font-style:normal;color:#fff}
  .plt .form i.W{background:#1e9e3a}.plt .form i.D{background:#9aa0ad}.plt .form i.L{background:var(--red)}.plt .form i.live{outline:2px solid var(--red);outline-offset:1px}
  .plt-wrap{overflow-x:auto}
  .plt-note{color:#fff;opacity:.85;font-size:12px;margin-top:8px}
  @media (max-width:600px){.plt .club .full{display:none}.plt .club .short{display:inline}.plt .hide-s{display:none}.plt td,.plt th{padding:7px 4px}}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const page = () => document.getElementById('page-premier-league');
  const LIVE_MIN = 120;
  const ko = f => (f.ko ? new Date(f.ko).getTime() : 0);
  const isLive = f => f.hs != null && !f.done && Date.now() >= ko(f) && Date.now() <= ko(f) + LIVE_MIN * 60000;

  function table(F) {
    const rows = {};
    for (const [id, t] of Object.entries(F.teams)) rows[id] = { id, t, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, res: [], live: false };
    const played = F.fixtures.filter(f => f.hs != null && (f.done || isLive(f))).sort((a, b) => ko(a) - ko(b));
    for (const f of played) {
      const h = rows[f.h], a = rows[f.a];
      if (!h || !a) continue;
      const live = !f.done;
      for (const [me, gf, ga] of [[h, f.hs, f.as], [a, f.as, f.hs]]) {
        me.p++; me.gf += gf; me.ga += ga;
        const r = gf > ga ? 'W' : gf < ga ? 'L' : 'D';
        if (r === 'W') { me.w++; me.pts += 3; } else if (r === 'D') { me.d++; me.pts++; } else me.l++;
        me.res.push({ r, live });
        if (live) me.live = true;
      }
    }
    return Object.values(rows).sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || x.t.name.localeCompare(y.t.name));
  }

  async function render() {
    const el = page();
    if (!el) return;
    el.innerHTML = `<a class="mp-back" href="#start" data-back>${T.back}</a><h2>${T.title}</h2><p class="plt-note">${T.loading}</p>`;
    let F;
    try { F = await (await fetch('data/fixtures.json', { cache: 'no-cache' })).json(); } catch { return; }
    const rows = table(F);
    const anyLive = rows.some(r => r.live);
    const lastDone = Math.max(0, ...F.fixtures.filter(f => f.done).map(f => f.gw));
    const res = { W: T.win, D: T.draw, L: T.loss };
    el.innerHTML = `<a class="mp-back" href="#start" data-back>${T.back}</a>
      <h2>${T.title}</h2>
      ${anyLive ? `<div class="plt-live"><span class="live-tag">LIVE</span> ${T.live}</div>` : ''}
      <section class="table plt-wrap"><table class="plt">
        <thead><tr><th>${T.pos}</th><th class="tl">${T.team}</th><th>${T.p}</th><th class="hide-s">${T.w}</th><th class="hide-s">${T.d}</th><th class="hide-s">${T.l}</th><th>${T.goals}</th><th>${T.gd}</th><th>${T.pts}</th><th class="hide-s">${T.form}</th></tr></thead>
        <tbody>${rows.map((r, i) => {
          const zone = i < 4 ? 'cl' : i === 4 ? 'el' : i >= rows.length - 3 ? 'rel' : '';
          const gd = r.gf - r.ga;
          return `<tr class="${zone} ${r.live ? 'live' : ''}"><td class="pos">${i + 1}</td>
            <td class="club"><div><img src="assets/badges/${r.t.code}.${BADGE_EXT}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><span class="full">${esc(r.t.name)}</span><span class="short">${esc(r.t.short)}</span>${r.live ? ' <span class="live-tag">LIVE</span>' : ''}</div></td>
            <td>${r.p}</td><td class="hide-s">${r.w}</td><td class="hide-s">${r.d}</td><td class="hide-s">${r.l}</td>
            <td>${r.gf}:${r.ga}</td><td>${gd > 0 ? '+' : ''}${gd}</td><td class="pts">${r.pts}</td>
            <td class="hide-s"><span class="form">${r.res.slice(-5).map(x => `<i class="${x.r}${x.live ? ' live' : ''}" title="${res[x.r]}">${T[x.r.toLowerCase()]}</i>`).join('')}</span></td></tr>`;
        }).join('')}</tbody></table></section>
      <p class="plt-note">${lastDone ? `${T.after} ${lastDone}${anyLive ? ' + live' : ''} · ` : ''}${T.note}</p>`;
  }

  // Knopf im Spielkalender (calendar.js zeichnet #next neu → Knopf danach einfügen)
  const addButton = () => {
    const next = document.getElementById('next');
    if (!next || next.querySelector('.cal-table')) return;
    const nav = next.querySelector('.cal-nav');
    if (!nav) return;
    const d = document.createElement('div'); d.className = 'cal-table';
    d.innerHTML = `<a href="#premier-league">${T.btn}</a>`;
    nav.after(d);
  };
  new MutationObserver(addButton).observe(document.documentElement, { childList: true, subtree: true });

  // Seite öffnen: #premier-league (Zurück-Knopf wie auf Manager-/Spielerseite)
  const check = () => { if (location.hash === '#premier-league') render(); };
  addEventListener('hashchange', check);
  document.addEventListener('DOMContentLoaded', check);
  document.addEventListener('click', e => {
    const el = page();
    if (el && !el.hidden && el.contains(e.target) && e.target.closest('[data-back]')) {
      const fn = window.glBack || window.ymlBack; if (fn) fn(e);
    }
  });
})();
