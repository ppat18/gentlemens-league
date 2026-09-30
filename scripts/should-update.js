// Entscheidet, ob gerade aktualisiert werden soll:
// ja, wenn ein PL-Spiel läuft oder vor weniger als 30 Min. geendet hat (Spieldauer ~2 h ab Anstoß),
// oder wenn eine Gameweek beendet ist, FPL die Daten aber noch nicht final geprüft hat.
// Ausgabe für GitHub Actions: update=true|false
const fs = require('fs');
const API = 'https://fantasy.premierleague.com/api';
const WINDOW_MIN = 120 + 30; // ab Anstoß: ~2 h Spiel + 30 Min. Nachlauf

(async () => {
  const get = async u => (await fetch(API + u, { headers: { 'User-Agent': 'Mozilla/5.0' } })).json();
  let update = false, reason = 'kein Spiel läuft';
  try {
    const boot = await get('/bootstrap-static/');
    const now = Date.now();
    const started = boot.events.filter(e => new Date(e.deadline_time).getTime() < now);
    const cur = started[started.length - 1];
    if (cur && cur.finished && !cur.data_checked) { update = true; reason = `GW ${cur.id} beendet, FPL prüft noch`; }
    if (cur && !update) {
      const fx = await get(`/fixtures/?event=${cur.id}`);
      const live = fx.find(f => f.kickoff_time && now >= new Date(f.kickoff_time).getTime() &&
        now <= new Date(f.kickoff_time).getTime() + WINDOW_MIN * 60000);
      if (live) { update = true; reason = `Spiel läuft/gerade vorbei (Anstoß ${live.kickoff_time})`; }
    }
  } catch (e) { update = true; reason = 'Prüfung fehlgeschlagen – sicherheitshalber aktualisieren'; }
  console.log(`update=${update} (${reason})`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `update=${update}\n`);
})();
