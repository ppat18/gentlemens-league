// Gentlemen's League – Geburtstags-Popup (erscheint nur am Geburtstag, österreichische Zeit, 1× pro Gerät)
// Testen: Seite mit ?bday=kai öffnen.
const BIRTHDAYS = [
  { avatar: 'kai', date: '10-03', age: 30 },
];

function renderBirthday(d) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna', month: '2-digit', day: '2-digit' })
    .format(new Date()).replace('/', '-'); // "MM-DD"
  const forced = new URLSearchParams(location.search).get('bday');
  const b = BIRTHDAYS.find(x => forced ? x.avatar === forced : x.date === today);
  if (!b) return;
  const m = d.managers.find(x => x.avatar === b.avatar);
  if (!m) return;
  const key = `bday-${b.avatar}-${new Date().getFullYear()}`;
  try { if (!forced && localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch { /* egal */ }

  const sum = k => m.gws.reduce((a, g) => a + (g[k] || 0), 0);
  const wins = m.gws.filter(g => g.points === Math.max(...d.managers.map(x => x.gws.find(y => y.gw === g.gw)?.points ?? 0))).length;
  const roasts = [
    m.rank === 1 ? `${b.age} Jahre alt und trotzdem Tabellenführer – kein Wunder, wer um 5 Uhr früh wach liegt, hat viel Zeit für Transfers.` : `${b.age} Jahre und immer noch auf Platz ${m.rank}. Im Alter wird man halt langsamer.`,
    wins ? `${wins} Rundensiege diese Saison. Die Erfahrung des Alters – oder einfach Haaland.` : `Noch kein Rundensieg. Aber mit ${b.age} hat man ja Geduld gelernt.`,
    `Ab heute zählt jede Minute doppelt: Kapitän, Knie und Kreuz. ©️🦴`,
    `${sum('bench')} Punkte auf der Bank verschenkt – genau wie bald seine Abende: auf der Couch.`,
    `Die Kerzen auf der Torte kosten mittlerweile mehr als sein ganzes Mittelfeld.`,
    `Gute Nachricht: Ab ${b.age} gibt's im Bier-Bingo kein Feld „Rückenschmerzen“. Noch nicht.`,
  ];

  const css = `
  .bd-ov{position:fixed;inset:0;z-index:200;background:rgba(10,10,30,.75);display:flex;align-items:center;justify-content:center;padding:16px;animation:bdFade .3s}
  @keyframes bdFade{from{opacity:0}to{opacity:1}}
  .bd-box{position:relative;width:100%;max-width:420px;max-height:92vh;overflow-y:auto;background:linear-gradient(170deg,#fff8dc,#ffe7a3);border-radius:24px;padding:20px 18px 18px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.5);border:4px solid var(--gold);animation:bdPop .5s cubic-bezier(.3,1.6,.5,1)}
  @keyframes bdPop{from{transform:scale(.6)}to{transform:scale(1)}}
  .bd-x{position:absolute;top:10px;right:10px;width:34px;height:34px;border:0;border-radius:50%;background:var(--navy);color:#fff;font-size:20px;cursor:pointer}
  .bd-kick{font:700 13px Oswald;letter-spacing:2px;text-transform:uppercase;color:var(--red)}
  .bd-title{font:700 32px/1.05 Oswald;text-transform:uppercase;color:var(--ink);margin:4px 0 2px}
  .bd-sub{font:700 20px Oswald;color:var(--red);text-transform:uppercase;letter-spacing:1px}
  .bd-pic{position:relative;width:180px;height:200px;margin:12px auto 4px}
  .bd-pic .av{position:absolute;left:30px;top:52px;width:120px;height:120px;border:5px solid var(--gold);box-shadow:0 6px 18px rgba(0,0,0,.3);filter:grayscale(.35) sepia(.25)}
  .bd-hat{position:absolute;left:58px;top:0;width:64px;transform:rotate(-12deg)}
  .bd-cane{position:absolute;right:-6px;top:70px;width:46px}
  .bd-glasses{position:absolute;left:52px;top:96px;width:76px}
  .bd-cake{width:150px;display:block;margin:0 auto}
  .bd-list{text-align:left;margin:10px 0 8px;padding:0;list-style:none}
  .bd-list li{padding:7px 4px 7px 26px;position:relative;font-size:14px;line-height:1.45;color:#3a2f10;border-bottom:1px dashed #e2c870}
  .bd-list li::before{content:"🎂";position:absolute;left:0}
  .bd-sign{font-size:12px;font-style:italic;color:#7a6a3a;margin-top:6px}
  .bd-ok{margin-top:12px;background:var(--red);color:#fff;border:0;border-radius:999px;padding:10px 22px;font:700 16px Oswald;letter-spacing:1px;text-transform:uppercase;cursor:pointer}
  .bd-conf{position:fixed;top:-20px;z-index:201;font-size:22px;pointer-events:none;animation:bdFall linear forwards}
  @keyframes bdFall{to{transform:translateY(110vh) rotate(720deg)}}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  const hat = `<svg class="bd-hat" viewBox="0 0 64 80"><path d="M32 2 L60 74 H4 Z" fill="#e0312f"/><path d="M32 2 L46 38 L18 38 Z" fill="#f2c230"/><path d="M12 56 L52 56 L56 66 L8 66 Z" fill="#2a2870"/><circle cx="32" cy="4" r="6" fill="#8dc63f"/><rect x="2" y="70" width="60" height="9" rx="4" fill="#f2c230"/></svg>`;
  const cane = `<svg class="bd-cane" viewBox="0 0 46 130"><path d="M30 128 V40 a14 14 0 1 0 -28 0" fill="none" stroke="#7a4a1f" stroke-width="8" stroke-linecap="round"/><rect x="25" y="118" width="10" height="10" rx="2" fill="#333"/></svg>`;
  const glasses = `<svg class="bd-glasses" viewBox="0 0 76 26"><circle cx="17" cy="13" r="11" fill="rgba(255,255,255,.25)" stroke="#222" stroke-width="3"/><circle cx="59" cy="13" r="11" fill="rgba(255,255,255,.25)" stroke="#222" stroke-width="3"/><path d="M28 12 Q38 6 48 12" fill="none" stroke="#222" stroke-width="3"/></svg>`;
  const cake = `<svg class="bd-cake" viewBox="0 0 150 120">
    <rect x="20" y="62" width="110" height="46" rx="8" fill="#8b5a2b"/><rect x="20" y="62" width="110" height="14" rx="6" fill="#fff4f0"/>
    <path d="M20 74 q9 10 18 0 t18 0 t18 0 t18 0 t18 0 t20 0" fill="#fff4f0"/>
    <rect x="10" y="106" width="130" height="10" rx="5" fill="#c9ccd4"/>
    <text x="75" y="100" text-anchor="middle" font-family="Oswald,Arial Black,sans-serif" font-weight="700" font-size="22" fill="#f2c230">${b.age}</text>
    ${[45, 75, 105].map(x => `<rect x="${x - 3}" y="36" width="6" height="26" rx="2" fill="#2a2870"/><path d="M${x} 22 q6 8 0 14 q-6 -6 0 -14" fill="#ff9d1a"><animate attributeName="opacity" values="1;.5;1" dur=".8s" repeatCount="indefinite"/></path>`).join('')}
    <text x="75" y="14" text-anchor="middle" font-size="9" fill="#7a6a3a" textLength="146" lengthAdjust="spacingAndGlyphs">(mehr Kerzen hat die Feuerwehr verboten)</text>
  </svg>`;

  const ov = document.createElement('div');
  ov.className = 'bd-ov';
  ov.innerHTML = `<div class="bd-box" role="dialog" aria-label="Geburtstag ${esc(m.nick)}">
    <button class="bd-x" aria-label="Schließen">×</button>
    <div class="bd-kick">🎉 Breaking News aus der Gentlemen's League</div>
    <div class="bd-title">Alles Gute, ${esc(m.nick)}!</div>
    <div class="bd-sub">${b.age} Jahre – du alter Sack! 👴</div>
    <div class="bd-pic"><img class="av" src="${av(m)}" alt="">${hat}${glasses}${cane}</div>
    ${cake}
    <ul class="bd-list">${roasts.slice(0, 4).map(r => `<li>${esc(r)}</li>`).join('')}</ul>
    <div class="bd-sign">Herzlichen Glückwunsch von der ganzen Liga – bleib gesund, und bitte stell den Kapitän nicht mehr nach der Deadline ein. 🍻</div>
    <button class="bd-ok">Prost, ${esc(m.nick)}! 🍺</button>
  </div>`;
  const close = () => ov.remove();
  ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('.bd-x,.bd-ok')) close(); });
  document.body.appendChild(ov);

  // Konfetti
  const bits = ['🎉', '🎊', '🍺', '🎂', '👴', '🦴', '⭐'];
  for (let i = 0; i < 40; i++) {
    const c = document.createElement('div');
    c.className = 'bd-conf';
    c.textContent = bits[i % bits.length];
    c.style.left = Math.random() * 100 + 'vw';
    c.style.animationDuration = 2.5 + Math.random() * 3 + 's';
    c.style.animationDelay = Math.random() * 2 + 's';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 8000);
  }
}
