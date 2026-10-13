// Entscheidet, ob gerade aktualisiert werden soll (2026-10-05: nicht ständig abgleichen):
// ja, während ein PL-Spiel der aktuellen Gameweek läuft (Anstoß bis ~2 h danach)
// und bis 3 Stunden nach dem Ende des letzten Spiels der Gameweek (Bonuspunkte, Auto-Wechsel).
// Sonst nein – die tägliche Aktualisierung um 05:00 UTC läuft getrennt davon.
// Ausgabe für GitHub Actions: update=true|false
const fs = require('fs');
const API = 'https://fantasy.premierleague.com/api';
const MATCH_MIN = 120;       // Spieldauer ab Anstoß inkl. Halbzeit/Nachspielzeit
const AFTER_GW_MIN = 3 * 60; // Nachlauf nach dem letzten Spiel der Gameweek (Patrick: 2–3 h)

(async () => {
  const get = async u => (await fetch(API + u, { headers: { 'User-Agent': 'Mozilla/5.0' } })).json();
  let update = false, reason = 'kein Spiel läuft';
  try {
    const boot = await get('/bootstrap-static/');
    const now = Date.now();
    const started = boot.events.filter(e => new Date(e.deadline_time).getTime() < now);
    const cur = started[started.length - 1];
    if (cur) {
      const fx = (await get(`/fixtures/?event=${cur.id}`)).filter(f => f.kickoff_time);
      const ko = f => new Date(f.kickoff_time).getTime();
      const live = fx.find(f => now >= ko(f) && now <= ko(f) + MATCH_MIN * 60000);
      const lastKo = Math.max(...fx.map(ko));
      const allPlayed = fx.length && fx.every(f => ko(f) + MATCH_MIN * 60000 <= now);
      if (live) { update = true; reason = `Spiel läuft (Anstoß ${live.kickoff_time})`; }
      else if (allPlayed && now <= lastKo + (MATCH_MIN + AFTER_GW_MIN) * 60000) {
        update = true; reason = `GW ${cur.id} vorbei – Nachlauf bis 3 h nach dem letzten Spiel`;
      } else if (allPlayed) {
        // Alle Spiele vorbei, aber FPL schließt die Runde oft erst Stunden später ab (Bonus/Auto-Wechsel bestätigt).
        // Sobald FPL abgeschlossen hat und unsere Seite das noch nicht weiß → sofort holen; bis dahin 1× pro Stunde.
        let ourLast = null;
        try { ourLast = (await (await fetch(`https://ppat18.github.io/gentlemens-league/data/data.json?x=${now}`)).json()).lastGW; } catch (e) { /* egal */ }
        if (cur.finished && cur.data_checked && ourLast != null && ourLast < cur.id) { update = true; reason = `FPL hat GW ${cur.id} abgeschlossen – Endstand holen`; }
        else if (!cur.data_checked && new Date(now).getUTCMinutes() < 10) { update = true; reason = `GW ${cur.id} vorbei, FPL-Abschluss steht aus – stündlicher Abgleich`; }
      }
    }
  } catch (e) {
    // FPL nicht erreichbar: lieber auslassen als einen fehlschlagenden Lauf starten
    reason = 'FPL nicht erreichbar – nächster Versuch in 10 Min.';
  }
  console.log(`update=${update} (${reason})`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `update=${update}\n`);
})();
