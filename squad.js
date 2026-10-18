// Gentlemen's League – Manager-Seite (#manager/<FPL-ID>): Kader auf dem Spielfeld je Gameweek, die Runde im Detail
// und der Saisonverlauf. Ersetzt das frühere Kader-Pop-up (Patrick, 17.10.2026). Spieler antippen → Spielerseite (spieler.js).
// (nutzt av, esc aus app.js; Daten aus window.LEAGUE, gesetzt in app.js)

(function () {
  const css = `
  /* bleibt beim Scrollen oben links sichtbar (lange Spielerseiten) */
  .mp-back{position:sticky;top:calc(10px + env(safe-area-inset-top,0px));z-index:30;display:flex;width:max-content;align-items:center;gap:6px;margin:18px 0 10px;background:var(--navy);color:#fff;border:2px solid rgba(255,255,255,.35);border-radius:999px;padding:8px 16px 8px 12px;font:700 15px Oswald;text-transform:uppercase;letter-spacing:.6px;cursor:pointer;text-decoration:none;box-shadow:0 4px 14px rgba(0,0,0,.35)}
  .mp-back:hover{background:var(--navy-2);border-color:#fff}
  .mp-card{background:var(--card);border-radius:20px;overflow:clip;box-shadow:0 6px 18px rgba(0,0,0,.25);color:var(--ink);min-width:0}
  .mp-hero{display:flex;align-items:center;gap:14px;padding:16px;background:linear-gradient(180deg,var(--navy-2),var(--navy));color:#fff}
  .mp-hero .av{width:78px;height:78px;border:3px solid var(--lime);flex:none;cursor:default}
  .mp-hero .nm{font:700 30px/1 Oswald;text-transform:uppercase}
  .mp-hero .tm{font-size:14px;color:var(--lime-2);font-weight:600;margin-top:4px}
  .mp-hero .fn{font-size:12px;opacity:.75;margin-top:2px}
  .mp-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:1px;background:#e6e8ee}
  .mp-kpis div{background:#fff;padding:10px 8px;text-align:center}
  .mp-kpis b{display:block;font:700 22px/1.1 Oswald;color:var(--navy);font-variant-numeric:tabular-nums}
  .mp-kpis span{font-size:11px;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:.4px}
  .mp-grid{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:16px;align-items:start;margin-top:16px}
  @media (max-width:860px){.mp-grid{grid-template-columns:1fr}}
  .mp-sec{padding:12px 14px}
  .mp-sec h3{font:700 16px Oswald;text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px;color:var(--navy)}
  .mp-line{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid #eceef3;font-size:14px}
  .mp-line:last-child{border:0}
  .mp-line b{font-variant-numeric:tabular-nums;text-align:right}
  .mp-tr{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid #eceef3;font-size:14px}
  .mp-tr:last-child{border:0}
  .mp-tr .in{color:#1e7a2f;font-weight:600}.mp-tr .out{color:var(--red);text-align:right;font-weight:600}
  .mp-tr small{font-weight:400;color:#777}
  .mp-hist{width:100%;border-collapse:collapse;font-size:13px}
  .mp-hist th{position:sticky;top:0;z-index:1}
  .mp-hist td{padding:6px 8px;border-bottom:1px solid #eceef3;font-variant-numeric:tabular-nums}
  .mp-hist tr.on td{background:rgba(141,198,63,.25);font-weight:700}
  .mp-hist tbody tr{cursor:pointer}
  .mp-hist .num{text-align:right}
  .mp-scroll{max-height:420px;overflow:auto}
  .sq-nav{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;background:var(--lime);color:var(--navy);font:700 17px Oswald;text-transform:uppercase;letter-spacing:.5px;text-align:center}
  .sq-nav button{width:40px;height:34px;border:0;border-radius:10px;background:var(--navy);color:#fff;font:700 24px/1 Inter;cursor:pointer;flex:none}
  .sq-nav button:disabled{opacity:.25;cursor:default}
  .sq-place{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;padding:7px 10px;background:#f3f5f9;font-size:13px;font-weight:600;color:#444}
  .sq-lazy{text-align:center;font-size:12px;font-weight:600;padding:5px 10px;background:#f3f5f9;border-top:1px solid #e6e8ee}
  .sq-lazy.bad{color:var(--red)}.sq-lazy.good{color:#1e7a2f}.sq-lazy.none{color:#777;font-weight:500}
  .sq-tag{font:700 13px Oswald;letter-spacing:.8px;text-transform:uppercase;padding:3px 10px;border-radius:999px}
  .sq-tag.win{background:var(--gold);color:var(--ink)}
  .sq-tag.last{background:var(--red);color:#fff}
  .sq-pitch{position:relative;overflow:hidden;padding:14px 6px 10px;background:repeating-linear-gradient(180deg,#2f7d32 0 44px,#2a722d 44px 88px)}
  .sq-pitch::before{content:"";position:absolute;left:12%;right:12%;top:0;height:54px;border:2px solid rgba(255,255,255,.35);border-top:0}
  .sq-pitch::after{content:"";position:absolute;left:50%;bottom:-40px;width:110px;height:80px;border:2px solid rgba(255,255,255,.35);border-radius:50%;transform:translateX(-50%)}
  .sq-row{position:relative;z-index:1;display:flex;justify-content:center;gap:4px;margin:6px 0 12px}
  .sq-p{width:19%;max-width:92px;display:flex;flex-direction:column;align-items:center;text-align:center;position:relative;cursor:pointer;border-radius:8px}
  .sq-p:hover .n{background:var(--lime-2)}
  .sq-p:focus-visible{outline:3px solid var(--gold);outline-offset:2px}
  .sq-p img{width:38px;height:38px;object-fit:contain;filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))}
  .sq-p .n{margin-top:3px;width:100%;background:#fff;color:var(--ink);font:600 11px/1.25 Inter;padding:2px 3px;border-radius:5px 5px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .sq-p .pt{width:100%;background:var(--navy);color:#fff;font:700 13px/1.35 Oswald;border-radius:0 0 5px 5px}
  .sq-p .pt.hi{background:var(--lime);color:var(--navy)}
  .sq-p .cv{position:absolute;top:-4px;right:12%;width:20px;height:20px;border-radius:50%;background:var(--ink);color:#fff;font:700 11px/20px Oswald;box-shadow:0 0 0 2px #fff}
  .sq-p .cv.c{background:var(--gold);color:var(--ink)}
  .sq-p .sub{position:absolute;top:-4px;left:12%;width:18px;height:18px;border-radius:50%;font:700 12px/18px Inter;color:#fff;box-shadow:0 0 0 2px #fff}
  .sq-p .sub.in{background:#1e9e3a}.sq-p .sub.out{background:var(--red)}
  .sq-p.dim{opacity:.5}
  /* laufende GW: noch nicht gespielt = grau mit Anstoßzeit, spielt gerade = rot */
  .sq-p.todo .pt{background:#b9bfcc;color:var(--ink);font:700 10.5px/1.75 Inter}
  .sq-p.todo .n{background:#e9ecf2;color:#555}
  .sq-p.todo img{filter:grayscale(.6) drop-shadow(0 2px 3px rgba(0,0,0,.4));opacity:.85}
  .sq-p.playing .pt{background:var(--red);color:#fff}
  .games-live .sq-p.playing .pt{animation:liveblink 1.2s ease-in-out infinite}
  .sq-legend{display:inline-flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:4px}
  .sq-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;vertical-align:-1px;margin-right:3px}
  .sq-bench{background:#e9edf3;padding:10px 6px 12px}
  .sq-bench h4{font:700 12px Oswald;letter-spacing:1.5px;text-transform:uppercase;color:#666;text-align:center;margin-bottom:6px}
  .sq-bench .sq-row{margin:0}
  .sq-foot{font-size:12px;color:#777;padding:8px 14px 14px;text-align:center}
  img.av{cursor:pointer}
  img.av[src$="unknown.svg"]{cursor:default}
  @media (max-width:420px){.sq-p img{width:32px;height:32px}.sq-p .n{font-size:10px}.mp-hero .nm{font-size:24px}.mp-hero .av{width:64px;height:64px}.sq-nav{font-size:15px}}
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  const chipName = { wildcard: 'Wildcard', freehit: 'Free Hit', bboost: 'Bench Boost', '3xc': 'Triple Captain', manager: 'Assistant Manager' };
  const page = () => document.getElementById('page-manager');
  let cur = { id: null, idx: null };

  // Kompakte Kaderdaten (siehe fetch.js) in lesbare Objekte umwandeln
  function expand(s) {
    const P = window.LEAGUE.players || {};
    return {
      ...s,
      subs: s.subs.map(([i, o]) => ({ in: i, out: o })),
      picks: s.picks.map(([id, pos, mult, cv, pts, minutes]) => {
        const [name, type, team, teamCode] = P[id] || ['?', 3, '', 0];
        return { id, pos, mult, cap: cv === 1, vice: cv === 2, pts, minutes, name, type, team, teamCode };
      }),
    };
  }

  // Manager-Seite öffnen (statt Pop-up): eigene Adresse, Zurück-Knopf des Browsers funktioniert
  function open(m) { if (m && m.squads && m.squads.length) location.hash = '#manager/' + m.id; }
  window.openManager = open;

  function render(id, gw) {
    const L = window.LEAGUE, el = page();
    if (!L || !el) return;
    const m = L.managers.find(x => String(x.id) === String(id));
    if (!m || !(m.squads || []).length) { el.innerHTML = '<a class="mp-back" href="#start" data-back>‹ Zurück</a><p style="color:#fff">Manager nicht gefunden.</p>'; return; }
    const list = m.squads;
    if (cur.id !== m.id) cur = { id: m.id, idx: list.length - 1 };
    if (gw) { const i = list.findIndex(s => s.gw === Number(gw)); if (i >= 0) cur.idx = i; }
    const idx = cur.idx;
    const s = expand(list[idx]);
    const g = m.gws.find(x => x.gw === s.gw);
    const subIn = new Set(s.subs.map(x => x.in)), subOut = new Set(s.subs.map(x => x.out));

    // Laufende GW: Spielstatus je Verein (noch nicht gespielt / spielt gerade / fertig)
    const curFx = L.current;
    const fx = !s.finished && curFx && curFx.gw === s.gw ? curFx.fixtures : [];
    const tz = { timeZone: 'Europe/Vienna' };
    const status = code => {
      const own = fx.filter(f => f.h === code || f.a === code);
      if (!own.length) return null;
      const now = Date.now();
      if (own.some(f => !f.done && now >= new Date(f.kickoff).getTime())) return { cls: 'playing' };
      const next = own.filter(f => !f.done && new Date(f.kickoff) > now).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))[0];
      if (next && !own.some(f => f.done)) return { cls: 'todo', ko: new Date(next.kickoff).toLocaleString('de-AT', { ...tz, weekday: 'short', hour: '2-digit', minute: '2-digit' }) };
      return null;
    };
    const card = (p, bench) => {
      const shown = bench && s.chip !== 'bboost' ? p.pts : p.pts * Math.max(p.mult, 1);
      const stt = status(p.teamCode);
      return `<div class="sq-p ${bench && !subIn.has(p.id) && s.chip !== 'bboost' ? 'dim' : ''} ${stt ? stt.cls : ''}" data-player="${p.id}" role="link" tabindex="0" title="${esc(p.name)} (${esc(p.team)}) · ${stt?.ko ? 'Anstoß ' + stt.ko : p.minutes + ' Min.'} – antippen für alle Infos">
        ${p.cap ? `<span class="cv c">${p.mult === 3 ? '3×' : 'C'}</span>` : p.vice ? '<span class="cv">V</span>' : ''}
        ${subIn.has(p.id) ? '<span class="sub in">↑</span>' : subOut.has(p.id) ? '<span class="sub out">↓</span>' : ''}
        <img src="assets/badges/${p.teamCode}.png" alt="${esc(p.team)}" onerror="this.style.visibility='hidden'">
        <div class="n">${esc(p.name)}</div>
        <div class="pt ${shown >= 10 && !stt ? 'hi' : ''}">${stt?.ko ? stt.ko : shown}</div>
      </div>`;
    };
    const xi = s.picks.filter(p => p.pos <= 11), bench = s.picks.filter(p => p.pos > 11);
    const rows = [1, 2, 3, 4].map(t => xi.filter(p => p.type === t)).filter(r => r.length)
      .map(r => `<div class="sq-row">${r.map(p => card(p, false)).join('')}</div>`).join('');
    const net = s.points != null ? s.points - (s.hits || 0) : null;

    // Rundenplatz in der Liga (Netto-Punkte dieser Gameweek aller Manager)
    const netOf = x => { const q = (x.squads || []).find(q => q.gw === s.gw); return q && q.points != null ? q.points - (q.hits || 0) : null; };
    const all = L.managers.map(netOf).filter(v => v != null);
    let placeHtml = '';
    if (net != null && all.length > 1) {
      const place = all.filter(v => v > net).length + 1;
      const tag = net === Math.max(...all) ? '<span class="sq-tag win">🥇 Rundensieger</span>'
        : net === Math.min(...all) ? '<span class="sq-tag last">💩 Stinker der Woche</span>' : '';
      placeHtml = `<div class="sq-place">${tag}<span>Rundenplatz ${place} von ${all.length}${s.finished ? '' : ' (vorläufig)'}</span></div>`;
    }
    // "Ohne Transfers": diese Elf, aber gekaufte Spieler gegen die verkauften getauscht (berechnet in fetch.js)
    if (g && g.lazyPts != null) {
      const d = g.lazyPts - g.points;
      placeHtml += `<div class="sq-lazy ${d > 0 ? 'bad' : 'good'}">🛋️ Ohne Transfers: ${g.lazyPts} Punkte · ${
        d > 0 ? `−${d} durch Transfers` : d < 0 ? `+${-d} durch Transfers` : 'Transfers ohne Auswirkung'}</div>`;
    } else if (g && s.gw > 1) placeHtml += '<div class="sq-lazy none">🛋️ Keine Transfers in dieser Runde</div>';

    // Kennzahlen oben
    const last = m.gws[m.gws.length - 1];
    const chipsLeft = Math.max(0, 8 - (m.chips || []).length);
    const kpis = [
      ['Platz', `${m.rank}.`], ['Gesamt', m.total], ['Letzte GW', last ? last.points : '–'],
      ['Teamwert', `£${Number(m.valueNow ?? last?.value ?? 0).toFixed(1)}`], ['Bank', `£${Number(m.bankNow ?? last?.bank ?? 0).toFixed(1)}`], ['Chips übrig', chipsLeft],
    ];

    // Diese Runde im Detail
    const cap = s.picks.find(p => p.cap), vice = s.picks.find(p => p.vice);
    const benchPts = bench.reduce((a, p) => a + (p.pts || 0), 0);
    const trs = (g && g.transfersIn) || [];
    const round = `
      ${s.chip ? `<div class="mp-line"><span>Chip</span><b>🃏 ${chipName[s.chip] || s.chip}</b></div>` : ''}
      <div class="mp-line"><span>Kapitän</span><b>${cap ? `${esc(cap.name)} · ${cap.pts * Math.max(cap.mult, 1)} P.` : '–'}</b></div>
      <div class="mp-line"><span>Vize</span><b>${vice ? esc(vice.name) : '–'}</b></div>
      <div class="mp-line"><span>Punkte auf der Bank</span><b>${s.chip === 'bboost' ? `${benchPts} (zählen – Bench Boost)` : benchPts}</b></div>
      <div class="mp-line"><span>Transfers</span><b>${g ? g.transfers : '–'}${s.hits ? ` (−${s.hits} Punkte)` : ''}</b></div>
      ${s.subs.length ? `<div class="mp-line"><span>Auto-Einwechslungen</span><b>${s.subs.length}</b></div>` : ''}
      ${trs.length ? `<h3 style="margin-top:12px">Transfers dieser Runde</h3>${trs.map(t => `<div class="mp-tr"><span class="in">⬆ ${esc(t.in)} <small>${t.inPts} P.</small></span><span>⇄</span><span class="out"><small>${t.outPts} P.</small> ${esc(t.out)} ⬇</span></div>`).join('')}` : ''}`;

    // Saisonverlauf (antippen = diese Gameweek zeigen)
    const hist = [...m.gws].reverse().map(x => `<tr data-gw="${x.gw}" class="${x.gw === s.gw ? 'on' : ''}">
      <td>${x.gw}</td><td class="num">${x.points}</td><td class="num">${x.leagueRank != null ? x.leagueRank + '.' : '–'}</td><td>${esc(x.captain || '–')}</td><td>${x.chip ? chipName[x.chip] || x.chip : ''}</td><td class="num">${x.transfers}${x.hits ? ` (−${x.hits})` : ''}</td></tr>`).join('');

    el.innerHTML = `
      <a class="mp-back" href="#start" data-back>‹ Zurück</a>
      <div class="mp-card">
        <div class="mp-hero">
          <img class="av" src="${av(m)}" alt="">
          <div style="min-width:0"><div class="nm">${esc(m.nick)}</div><div class="tm">${esc(m.team)}</div><div class="fn">${esc(m.name)}</div></div>
        </div>
        <div class="mp-kpis">${kpis.map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('')}</div>
      </div>
      <div class="mp-grid">
        <div class="mp-card">
          <div class="sq-nav">
            <button class="sq-prev" ${idx === 0 ? 'disabled' : ''} aria-label="Ältere Gameweek">‹</button>
            <span>Gameweek ${s.gw}${s.finished ? '' : ' · läuft'} · ${net ?? '–'} P.${s.hits ? ` (−${s.hits})` : ''}</span>
            <button class="sq-next" ${idx === list.length - 1 ? 'disabled' : ''} aria-label="Neuere Gameweek">›</button>
          </div>
          ${placeHtml}
          <div class="sq-pitch">${rows}</div>
          <div class="sq-bench"><h4>Bank</h4><div class="sq-row">${bench.map(p => card(p, true)).join('')}</div></div>
          <div class="sq-foot">Spieler antippen für alle Infos (Spiele, nächste Gegner, Form, Preis) · ↑↓ = automatische Einwechslung${fx.length ? '<br><span class="sq-legend"><span><i style="background:#b9bfcc"></i>noch nicht gespielt (mit Anstoß)</span><span><i style="background:var(--red)"></i>spielt gerade</span></span>' : ''}</div>
        </div>
        <div style="display:grid;gap:16px;min-width:0">
          <div class="mp-card mp-sec"><h3>Gameweek ${s.gw} im Detail</h3>${round}</div>
          <div class="mp-card"><div class="mp-sec" style="padding-bottom:4px"><h3>Saisonverlauf</h3></div>
            <div class="mp-scroll"><table class="mp-hist"><thead><tr><th>GW</th><th class="num">Pkt.</th><th class="num" title="Platz in der Tabelle nach dieser Runde">Tabelle</th><th>Kapitän</th><th>Chip</th><th class="num">Trf.</th></tr></thead><tbody>${hist}</tbody></table></div>
          </div>
        </div>
      </div>`;
  }
  // Zurück: innerhalb der Seite = Browser-Zurück; kam man direkt über einen Link, geht's zur Startseite
  window.glBack = e => { if ((window.glNavDepth || 0) > 0) { e.preventDefault(); history.back(); } };

  // Klicks auf der Manager-Seite: Gameweek blättern, Spieler öffnen, Saisonzeile wählen, zurück
  document.addEventListener('click', e => {
    const el = page();
    if (!el || el.hidden || !el.contains(e.target)) return;
    if (e.target.closest('[data-back]')) return window.glBack(e);
    const m = window.LEAGUE && window.LEAGUE.managers.find(x => x.id === cur.id);
    if (!m) return;
    const step = d => { const n = cur.idx + d; if (n >= 0 && n < m.squads.length) { cur.idx = n; render(m.id); } };
    if (e.target.closest('.sq-prev')) return step(-1);
    if (e.target.closest('.sq-next')) return step(1);
    const pl = e.target.closest('[data-player]');
    if (pl) { location.hash = `#spieler/${pl.dataset.player}`; return; }
    const tr = e.target.closest('tr[data-gw]');
    if (tr) { render(m.id, tr.dataset.gw); el.querySelector('.sq-nav').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });
  document.addEventListener('keydown', e => {
    const el = page();
    if (!el || el.hidden) return;
    const pl = e.target.closest && e.target.closest('[data-player]');
    if (e.key === 'Enter' && pl) { location.hash = `#spieler/${pl.dataset.player}`; return; }
    const m = window.LEAGUE && window.LEAGUE.managers.find(x => x.id === cur.id);
    if (!m) return;
    if (e.key === 'ArrowLeft' && cur.idx > 0) { cur.idx--; render(m.id); }
    if (e.key === 'ArrowRight' && cur.idx < m.squads.length - 1) { cur.idx++; render(m.id); }
  });
  // Wischen am Handy über dem Spielfeld: nach links = neuere, nach rechts = ältere Gameweek
  let x0 = null;
  document.addEventListener('touchstart', e => { x0 = e.target.closest && e.target.closest('#page-manager .sq-pitch, #page-manager .sq-bench') ? e.touches[0].clientX : null; }, { passive: true });
  document.addEventListener('touchend', e => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0; x0 = null;
    const m = window.LEAGUE && window.LEAGUE.managers.find(x => x.id === cur.id);
    if (!m || Math.abs(dx) < 60) return;
    const n = cur.idx + (dx < 0 ? 1 : -1);
    if (n >= 0 && n < m.squads.length) { cur.idx = n; render(m.id); }
  });

  // Route aus app.js: #manager/<id> (wartet, bis die Daten geladen sind)
  const whenData = fn => { if (window.LEAGUE) fn(); else { const t = setInterval(() => { if (window.LEAGUE) { clearInterval(t); fn(); } }, 150); } };
  document.addEventListener('route', e => { if (e.detail.page === 'manager') whenData(() => render(e.detail.arg)); });

  // Spitzname, Teamname oder Spielername eines Managers öffnet die Manager-Seite
  // (nicht in Links/Knöpfen, nicht auf der Manager-/Spielerseite selbst und nicht in den Glück-o-Meter-Zeilen)
  const byText = el => {
    if (!window.LEAGUE || !el || el.nodeType !== 1 || el.closest('a,button,input,select,textarea,#page-manager,#page-spieler,#luck,.tip')) return null;
    const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!t || t.length > 40) return null;
    const hits = window.LEAGUE.managers.filter(x => x.squads && x.squads.length && [x.nick, x.team, x.name].includes(t));
    return hits.length === 1 ? hits[0] : null;
  };
  document.addEventListener('mouseover', e => { if (byText(e.target)) e.target.style.cursor = 'pointer'; });
  document.addEventListener('click', e => {
    const m = byText(e.target);
    if (m) { e.stopPropagation(); open(m); }
  }, true);

  // Ein Klick-Handler für alle Manager-Fotos auf der Seite (Spielerseite: Besitzer-Fotos führen zum Manager)
  document.addEventListener('click', e => {
    const img = e.target.closest('img.av');
    if (!img || img.closest('#page-manager .mp-hero') || !window.LEAGUE) return;
    const hit = (img.getAttribute('src') || '').match(/avatars\/([a-z0-9_-]+)\.webp/i);
    if (!hit) return;
    const m = window.LEAGUE.managers.find(x => x.avatar === hit[1]);
    if (m && m.squads && m.squads.length) { e.stopPropagation(); open(m); }
  }, true);
})();
