// Gentlemen's League – Kader-Ansicht: Tippen auf ein Manager-Foto öffnet den aktuellsten Kader auf einem Spielfeld.
// (nutzt av, esc aus app.js; Daten aus window.LEAGUE, gesetzt in app.js)

(function () {
  const css = `
  .sq-overlay{position:fixed;inset:0;z-index:100;background:rgba(10,10,30,.72);display:flex;align-items:flex-start;justify-content:center;padding:24px 12px;overflow-y:auto;-webkit-overflow-scrolling:touch}
  .sq-panel{width:100%;max-width:560px;background:var(--card);border-radius:22px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.5)}
  .sq-overlay.in .sq-panel{animation:sqIn .22s ease-out}
  @keyframes sqIn{from{transform:translateY(16px);opacity:0}to{transform:none;opacity:1}}
  .sq-head{display:flex;align-items:center;gap:12px;padding:14px 16px;background:linear-gradient(180deg,var(--navy-2),var(--navy));color:#fff}
  .sq-head .av{width:56px;height:56px;border:3px solid var(--lime);flex:none}
  .sq-head .nm{font:700 24px/1 Oswald;text-transform:uppercase}
  .sq-head .tm{font-size:13px;color:var(--lime-2);font-weight:600;margin-top:3px}
  .sq-head .gw{margin-left:auto;text-align:right;font:700 26px/1 Oswald;color:var(--gold)}
  .sq-head .gw small{display:block;font:600 11px Inter;color:#fff;opacity:.8;margin-top:3px}
  .sq-x{background:rgba(255,255,255,.12);color:#fff;border:0;width:36px;height:36px;border-radius:50%;font-size:22px;line-height:1;cursor:pointer;flex:none}
  .sq-chip{display:inline-block;background:var(--gold);color:var(--ink);font:700 11px Oswald;letter-spacing:1px;text-transform:uppercase;padding:2px 8px;border-radius:999px;margin-top:4px}
  .sq-nav{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;background:var(--lime);color:var(--navy);font:700 17px Oswald;text-transform:uppercase;letter-spacing:.5px}
  .sq-nav button{width:40px;height:34px;border:0;border-radius:10px;background:var(--navy);color:#fff;font:700 24px/1 Inter;cursor:pointer}
  .sq-nav button:disabled{opacity:.25;cursor:default}
  .sq-place{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;padding:7px 10px;background:#f3f5f9;font-size:13px;font-weight:600;color:#444}
  .sq-tag{font:700 13px Oswald;letter-spacing:.8px;text-transform:uppercase;padding:3px 10px;border-radius:999px}
  .sq-tag.win{background:var(--gold);color:var(--ink)}
  .sq-tag.last{background:var(--red);color:#fff}
  .sq-pitch{position:relative;overflow:hidden;padding:14px 6px 10px;background:repeating-linear-gradient(180deg,#2f7d32 0 44px,#2a722d 44px 88px)}
  .sq-pitch::before{content:"";position:absolute;left:12%;right:12%;top:0;height:54px;border:2px solid rgba(255,255,255,.35);border-top:0}
  .sq-pitch::after{content:"";position:absolute;left:50%;bottom:-40px;width:110px;height:80px;border:2px solid rgba(255,255,255,.35);border-radius:50%;transform:translateX(-50%)}
  .sq-row{position:relative;z-index:1;display:flex;justify-content:center;gap:4px;margin:6px 0 12px}
  .sq-p{width:19%;max-width:92px;display:flex;flex-direction:column;align-items:center;text-align:center;position:relative}
  .sq-p img{width:38px;height:38px;object-fit:contain;filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))}
  .sq-p .n{margin-top:3px;width:100%;background:#fff;color:var(--ink);font:600 11px/1.25 Inter;padding:2px 3px;border-radius:5px 5px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .sq-p .pt{width:100%;background:var(--navy);color:#fff;font:700 13px/1.35 Oswald;border-radius:0 0 5px 5px}
  .sq-p .pt.hi{background:var(--lime);color:var(--navy)}
  .sq-p .cv{position:absolute;top:-4px;right:12%;width:20px;height:20px;border-radius:50%;background:var(--ink);color:#fff;font:700 11px/20px Oswald;box-shadow:0 0 0 2px #fff}
  .sq-p .cv.c{background:var(--gold);color:var(--ink)}
  .sq-p .sub{position:absolute;top:-4px;left:12%;width:18px;height:18px;border-radius:50%;font:700 12px/18px Inter;color:#fff;box-shadow:0 0 0 2px #fff}
  .sq-p .sub.in{background:#1e9e3a}.sq-p .sub.out{background:var(--red)}
  .sq-p.dim{opacity:.5}
  .sq-bench{background:#e9edf3;padding:10px 6px 12px}
  .sq-bench h4{font:700 12px Oswald;letter-spacing:1.5px;text-transform:uppercase;color:#666;text-align:center;margin-bottom:6px}
  .sq-bench .sq-row{margin:0}
  .sq-foot{font-size:12px;color:#777;padding:8px 14px 14px;text-align:center}
  img.av{cursor:pointer}
  img.av[src$="unknown.svg"]{cursor:default}
  @media (max-width:420px){.sq-p img{width:32px;height:32px}.sq-p .n{font-size:10px}.sq-head .nm{font-size:20px}.sq-head .gw{font-size:22px}}
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  const TYPES = { 1: 'Tor', 2: 'Abwehr', 3: 'Mittelfeld', 4: 'Sturm' };
  const chipName = { wildcard: 'Wildcard', freehit: 'Free Hit', bboost: 'Bench Boost', '3xc': 'Triple Captain', manager: 'Assistant Manager' };

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

  function open(m) {
    const list = m.squads || [];
    if (!list.length) return;
    let idx = list.length - 1; // neueste Gameweek zuerst

    const ov = document.createElement('div');
    ov.className = 'sq-overlay';
    const close = () => { ov.remove(); document.body.style.overflow = ''; document.removeEventListener('keydown', keys); };
    const go = d => { const n = idx + d; if (n >= 0 && n < list.length) { idx = n; draw(); } };
    const keys = e => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1); };
    ov.addEventListener('click', e => {
      if (e.target === ov || e.target.closest('.sq-x')) close();
      else if (e.target.closest('.sq-prev')) go(-1);
      else if (e.target.closest('.sq-next')) go(1);
    });
    // Wischen am Handy: nach links = neuere, nach rechts = ältere Gameweek
    let x0 = null;
    ov.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    ov.addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1); x0 = null; });
    document.addEventListener('keydown', keys);
    document.body.style.overflow = 'hidden';
    document.body.appendChild(ov);

    function draw() {
    const s = expand(list[idx]);
    const subIn = new Set(s.subs.map(x => x.in)), subOut = new Set(s.subs.map(x => x.out));
    const card = (p, bench) => {
      const shown = bench && s.chip !== 'bboost' ? p.pts : p.pts * Math.max(p.mult, 1);
      return `<div class="sq-p ${bench && !subIn.has(p.id) && s.chip !== 'bboost' ? 'dim' : ''}" title="${esc(p.name)} (${esc(p.team)}) · ${p.minutes} Min.">
        ${p.cap ? `<span class="cv c">${p.mult === 3 ? '3×' : 'C'}</span>` : p.vice ? '<span class="cv">V</span>' : ''}
        ${subIn.has(p.id) ? '<span class="sub in">↑</span>' : subOut.has(p.id) ? '<span class="sub out">↓</span>' : ''}
        <img src="assets/badges/${p.teamCode}.png" alt="${esc(p.team)}" onerror="this.style.visibility='hidden'">
        <div class="n">${esc(p.name)}</div>
        <div class="pt ${shown >= 10 ? 'hi' : ''}">${shown}</div>
      </div>`;
    };
    const xi = s.picks.filter(p => p.pos <= 11), bench = s.picks.filter(p => p.pos > 11);
    const rows = [1, 2, 3, 4].map(t => xi.filter(p => p.type === t)).filter(r => r.length)
      .map(r => `<div class="sq-row">${r.map(p => card(p, false)).join('')}</div>`).join('');
    const net = s.points != null ? s.points - (s.hits || 0) : null;

    // Rundenplatz in der Liga (Netto-Punkte dieser Gameweek aller Manager)
    const netOf = x => { const q = (x.squads || []).find(q => q.gw === s.gw); return q && q.points != null ? q.points - (q.hits || 0) : null; };
    const all = window.LEAGUE.managers.map(netOf).filter(v => v != null);
    let placeHtml = '';
    if (net != null && all.length > 1) {
      const place = all.filter(v => v > net).length + 1;
      const tag = net === Math.max(...all) ? '<span class="sq-tag win">🥇 Rundensieger</span>'
        : net === Math.min(...all) ? '<span class="sq-tag last">🥄 Rundenletzter</span>' : '';
      placeHtml = `<div class="sq-place">${tag}<span>Rundenplatz ${place} von ${all.length}${s.finished ? '' : ' (vorläufig)'}</span></div>`;
    }

    ov.innerHTML = `<div class="sq-panel" role="dialog" aria-label="Kader von ${esc(m.nick)}">
      <div class="sq-head">
        <img class="av" src="${av(m)}" alt="">
        <div><div class="nm">${esc(m.nick)}</div><div class="tm">${esc(m.team)}</div>${s.chip ? `<span class="sq-chip">🃏 ${chipName[s.chip] || s.chip}</span>` : ''}</div>
        <div class="gw">${net ?? '–'}<small>Punkte${s.hits ? ` (−${s.hits})` : ''}</small></div>
        <button class="sq-x" aria-label="Schließen">×</button>
      </div>
      <div class="sq-nav">
        <button class="sq-prev" ${idx === 0 ? 'disabled' : ''} aria-label="Ältere Gameweek">‹</button>
        <span>Gameweek ${s.gw}${s.finished ? '' : ' · läuft'}</span>
        <button class="sq-next" ${idx === list.length - 1 ? 'disabled' : ''} aria-label="Neuere Gameweek">›</button>
      </div>
      ${placeHtml}
      <div class="sq-pitch">${rows}</div>
      <div class="sq-bench"><h4>Bank</h4><div class="sq-row">${bench.map(p => card(p, true)).join('')}</div></div>
      <div class="sq-foot">${s.finished ? `Endstand Gameweek ${s.gw}` : `Gameweek ${s.gw} läuft – Punkte werden bei jeder Aktualisierung nachgetragen`} · ↑↓ = automatische Einwechslung</div>
    </div>`;
    }
    ov.classList.add('in');
    draw();
    setTimeout(() => ov.classList.remove('in'), 300); // Animation nur beim Öffnen, nicht beim Blättern
  }

  // Ein Klick-Handler für alle Manager-Fotos auf der Seite
  document.addEventListener('click', e => {
    const img = e.target.closest('img.av');
    if (!img || img.closest('.sq-overlay') || !window.LEAGUE) return;
    const hit = (img.getAttribute('src') || '').match(/avatars\/([a-z0-9_-]+)\.webp/i);
    if (!hit) return;
    const m = window.LEAGUE.managers.find(x => x.avatar === hit[1]);
    if (m && m.squads && m.squads.length) { e.stopPropagation(); open(m); }
  }, true);
})();
