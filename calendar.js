// Spielkalender: alle Spieltage zum Durchblättern (‹ › oder wischen), Live-Spiele blinken rot,
// unter jedem gestarteten Spiel Tore, Assists, Karten, Elfer & (vorläufige) Bonuspunkte.
// Daten: data/fixtures.json (scripts/fixtures.js)
(function () {
  const TZ = { timeZone: 'Europe/Vienna' };
  const LIVE_MIN = 120; // Anstoß bis Spielende inkl. Halbzeit/Nachspielzeit
  let F = null, gw = null, timer = null;

  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ko = f => f.ko ? new Date(f.ko).getTime() : 0;
  const isLive = f => f.hs != null && !f.done && Date.now() >= ko(f) && Date.now() <= ko(f) + LIVE_MIN * 60000;
  const gws = () => [...new Set(F.fixtures.map(f => f.gw))].sort((a, b) => a - b);
  const ofGw = g => F.fixtures.filter(f => f.gw === g).sort((a, b) => ko(a) - ko(b) || a.id - b.id);

  // Start: laufende GW, solange dort noch nicht alles fertig ist – sonst die nächste
  function startGw() {
    const ev = F.events || {};
    const cur = +Object.keys(ev).find(k => ev[k].current) || 0;
    const nxt = +Object.keys(ev).find(k => ev[k].next) || 0;
    if (cur && ofGw(cur).some(f => !f.done)) return cur;
    return nxt || cur || gws()[0];
  }

  const badge = t => `<img src="assets/badges/${t.code}.png" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`;
  const dot = x => x ? `<i class="fdr fdr${x}" title="Schwierigkeit ${x}/5"></i>` : '';
  const name = id => esc((F.players[id] || ['?'])[0]);
  const ICON = { g: '⚽', og: '🙈', as: '🅰️', yc: '🟨', rc: '🟥', ps: '🧤', pm: '❌' };
  const TITLE = { g: 'Tor', og: 'Eigentor', as: 'Assist', yc: 'Gelbe Karte', rc: 'Rote Karte', ps: 'Elfer gehalten', pm: 'Elfer verschossen' };

  function events(f, s) {
    const out = [];
    for (const k of ['g', 'og', 'as', 'yc', 'rc', 'ps', 'pm']) {
      const l = (f.ev?.[k]?.[s] || []).map(([id, n]) => `${name(id)}${n > 1 ? ` <b>×${n}</b>` : ''}`);
      if (l.length) out.push(`<div title="${TITLE[k]}">${ICON[k]} ${l.join(', ')}</div>`);
    }
    return out.join('');
  }

  function card(f) {
    const h = F.teams[f.h], a = F.teams[f.a], live = isLive(f), started = f.hs != null;
    const time = f.ko ? new Date(f.ko).toLocaleTimeString('de-AT', { ...TZ, hour: '2-digit', minute: '2-digit' }) : '–';
    const mid = !started ? `<div class="time">${time}</div>`
      : `<div class="score"><b>${f.hs} : ${f.as}</b><small>${live ? `<span class="live-tag">LIVE</span>${f.min ? ` ${f.min}'` : ''}` : f.done ? 'Ende' : 'Pause'}</small></div>`;
    let det = '';
    if (started) {
      const eh = events(f, 'h'), ea = events(f, 'a');
      const bonus = (f.bonus || []).map(([id, p]) => `<span><b>${p}</b> ${name(id)}</span>`).join('');
      det = (eh || ea ? `<div class="fx-ev"><div>${eh}</div><div class="a">${ea}</div></div>` : '')
        + (bonus ? `<div class="fx-bonus"><span>⭐ Bonus${f.bonusLive ? ' <i>(vorläufig)</i>' : ''}:</span>${bonus}</div>` : '');
    }
    return `<div class="fx${live ? ' fx-live' : ''}${f.done ? ' fx-done' : ''}">
      <div class="fx-row">
        <div class="tm">${badge(h)}<span class="full">${esc(h.name)}</span><span class="short">${esc(h.short)}</span>${started ? '' : dot(f.hd)}</div>
        ${mid}
        <div class="tm a">${started ? '' : dot(f.ad)}<span class="full">${esc(a.name)}</span><span class="short">${esc(a.short)}</span>${badge(a)}</div>
      </div>${det}
    </div>`;
  }

  function draw() {
    const el = document.getElementById('next');
    if (!el) return;
    const list = ofGw(gw), all = gws(), i = all.indexOf(gw);
    const anyLive = list.some(isLive), allDone = list.length && list.every(f => f.done), started = list.some(f => f.hs != null);
    const state = anyLive ? '<span class="live-tag">LIVE</span>' : allDone ? 'beendet' : started ? 'läuft' : 'kommend';
    const dlRaw = F.events?.[gw]?.deadline, dl = dlRaw ? new Date(dlRaw) : null;
    let deadline = '';
    if (dl && dl > Date.now()) {
      const days = Math.ceil((dl - Date.now()) / 864e5);
      const cd = days > 1 ? `noch ${days} Tage` : days === 1 ? 'morgen!' : 'heute!';
      deadline = `<div class="deadline">
        <div>⏰ Transfer-Deadline<br><b>${dl.toLocaleString('de-AT', { ...TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} Uhr</b></div>
        <span class="cd">${cd}</span></div>`;
    }
    const byDay = {};
    for (const f of list) {
      const k = f.ko ? new Date(f.ko).toLocaleDateString('de-AT', { ...TZ, weekday: 'long', day: 'numeric', month: 'long' }) : 'Termin offen';
      (byDay[k] ||= []).push(f);
    }
    el.innerHTML = `
      <div class="cal-nav">
        <button type="button" class="cal-btn" data-d="-1" ${i <= 0 ? 'disabled' : ''} aria-label="Vorheriger Spieltag">‹</button>
        <div class="cal-title">Gameweek ${gw}<small>${state}</small></div>
        <button type="button" class="cal-btn" data-d="1" ${i >= all.length - 1 ? 'disabled' : ''} aria-label="Nächster Spieltag">›</button>
      </div>
      ${deadline}
      ${Object.entries(byDay).map(([day, l]) => `<div class="fx-day">${day}</div><div class="fx-list">${l.map(card).join('')}</div>`).join('')}
      <p class="fx-note">‹ › oder wischen = anderer Spieltag. Punkte = FPL-Schwierigkeit: 🟢 leicht · ⚪ mittel · 🟠 schwer · 🔴 sehr schwer.
      ⚽ Tor · 🅰️ Assist · 🙈 Eigentor · 🟨🟥 Karten · 🧤 Elfer gehalten · ❌ Elfer verschossen · ⭐ Bonus (live vorläufig aus dem BPS). Zeiten in österreichischer Zeit.</p>`;
    el.querySelectorAll('.cal-btn').forEach(b => b.onclick = () => go(+b.dataset.d));
  }

  function go(d) {
    const all = gws(), i = all.indexOf(gw) + d;
    if (i < 0 || i >= all.length) return;
    gw = all[i];
    draw();
  }

  function swipe(el) {
    let x0 = null, y0 = null;
    el.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    el.addEventListener('touchend', e => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
      x0 = null;
    }, { passive: true });
  }

  async function load() {
    const res = await fetch('data/fixtures.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('fixtures.json fehlt');
    F = await res.json();
  }

  // Wird von app.js nach dem Rendern aufgerufen; ohne fixtures.json bleibt die alte Vorschau stehen
  window.renderCalendar = async function () {
    const el = document.getElementById('next');
    if (!el) return;
    try { await load(); } catch (e) { return; }
    gw = startGw();
    const t = document.getElementById('cal-title');
    if (t) t.textContent = '📅 Spielkalender';
    swipe(el);
    draw();
    // Live: jede Minute neu zeichnen (Blinken an/aus), alle 3 Min. frische Daten holen
    clearInterval(timer);
    let n = 0;
    timer = setInterval(async () => {
      n++;
      if (F.fixtures.some(isLive) && n % 3 === 0) { try { await load(); } catch (e) { /* nächster Versuch */ } }
      draw();
    }, 60000);
  };
})();
