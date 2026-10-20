// Liga-Wecker: Cloudflare-Worker, der alle 10 Minuten prüft, ob die Liga-Seite aktualisiert werden muss,
// und dann den GitHub-Workflow "update.yml" startet. Grund: GitHub drosselt geplante Läufe oft stark.
// Entscheidung wie scripts/should-update.js: Spiel läuft · bis 3 h nach dem letzten Spiel der GW ·
// GW vorbei, FPL hat noch nicht abgeschlossen → stündlich · FPL hat abgeschlossen, Seite zeigt noch vorläufig → sofort.
// Secret GH_TOKEN (fine-grained, nur Repo gentlemens-league, Actions: read & write) setzt Patrick selbst.
const REPO = 'ppat18/gentlemens-league';
const SITE = 'https://ppat18.github.io/gentlemens-league';
const FPL = 'https://fantasy.premierleague.com/api';
const MATCH_MIN = 120, AFTER_GW_MIN = 3 * 60, MIN = 60_000;

async function decide(now) {
  const get = async u => (await fetch(FPL + u, { headers: { 'User-Agent': 'Mozilla/5.0' } })).json();
  const boot = await get('/bootstrap-static/');
  const started = boot.events.filter(e => new Date(e.deadline_time).getTime() < now);
  const cur = started[started.length - 1];
  if (!cur) return { update: false, reason: 'Saison noch nicht gestartet' };
  const fx = (await get(`/fixtures/?event=${cur.id}`)).filter(f => f.kickoff_time);
  const ko = f => new Date(f.kickoff_time).getTime();
  const live = fx.find(f => now >= ko(f) && now <= ko(f) + MATCH_MIN * MIN);
  if (live) return { update: true, reason: `Spiel läuft (Anstoß ${live.kickoff_time})` };
  const lastKo = Math.max(...fx.map(ko));
  const allPlayed = fx.length && fx.every(f => ko(f) + MATCH_MIN * MIN <= now);
  if (!allPlayed) return { update: false, reason: 'kein Spiel läuft' };
  if (now <= lastKo + (MATCH_MIN + AFTER_GW_MIN) * MIN) return { update: true, reason: `GW ${cur.id} vorbei – Nachlauf` };
  let ours = null;
  try { ours = await (await fetch(`${SITE}/data/data.json?x=${now}`)).json(); } catch (e) { /* egal */ }
  if (cur.finished && cur.data_checked && ours && (ours.lastGW < cur.id || ours.provisionalGW === cur.id))
    return { update: true, reason: `FPL hat GW ${cur.id} abgeschlossen – Endstand holen` };
  if (!cur.data_checked && new Date(now).getUTCMinutes() < 10)
    return { update: true, reason: `GW ${cur.id} vorbei, FPL-Abschluss steht aus – stündlich` };
  return { update: false, reason: 'nichts zu tun' };
}

async function gh(env, path, init = {}) {
  return fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'liga-wecker', 'X-GitHub-Api-Version': '2022-11-28', ...(init.headers || {}) },
  });
}

async function run(env, now = Date.now()) {
  const d = await decide(now);
  if (!d.update) return { ...d, started: false };
  if (!env.GH_TOKEN) return { ...d, started: false, note: 'GH_TOKEN fehlt' };
  // nicht doppelt starten: läuft gerade etwas oder lief vor weniger als 8 Minuten etwas?
  const runs = await (await gh(env, '/actions/workflows/update.yml/runs?per_page=3')).json();
  const busy = (runs.workflow_runs || []).some(r => r.status !== 'completed' || now - new Date(r.created_at).getTime() < 8 * MIN);
  if (busy) return { ...d, started: false, note: 'GitHub läuft gerade bzw. lief eben erst' };
  const res = await gh(env, '/actions/workflows/update.yml/dispatches', { method: 'POST', body: JSON.stringify({ ref: 'main' }) });
  return { ...d, started: res.status === 204, status: res.status };
}

export default {
  async scheduled(event, env, ctx) {
    const r = await run(env);
    console.log(JSON.stringify(r));
  },
  // Statusabfrage im Browser (startet nichts): zeigt nur, was der Wecker gerade entscheiden würde
  async fetch(req, env) {
    // /check: prüft nur, ob der Schlüssel GitHub lesen darf (startet nichts)
    if (new URL(req.url).pathname === '/check') {
      const r = await gh(env, '/actions/workflows/update.yml/runs?per_page=1');
      const j = r.ok ? await r.json() : null;
      return new Response(JSON.stringify({ github: r.status, letzterLauf: j?.workflow_runs?.[0]?.created_at || null }), { headers: { 'content-type': 'application/json' } });
    }
    const d = await decide(Date.now());
    return new Response(JSON.stringify({ ...d, token: !!env.GH_TOKEN }, null, 1), { headers: { 'content-type': 'application/json; charset=utf-8' } });
  },
};
