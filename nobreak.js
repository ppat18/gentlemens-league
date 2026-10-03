// Gentlemen's League – verhindert hässliche Zeilenumbrüche auf der ganzen Seite:
// Zahlen bleiben mit dem folgenden Wort zusammen ("391 Punkte", "133 hinter Platz 1", "GW 5", "Top 4,4 %", "£101,6 Mio").
// Läuft automatisch über alles, was auf der Seite erscheint – auch über später eingeblendete Popups.
(function () {
  const NB = ' ';
  const WORDS = 'Platz|Plätze|GW|Gameweek|Runde|Runden|Top|Saison|Rang|Hin|Rück|Finale';
  const fix = t => t
    .replace(/(\d)[ \t]+(?=[^\s·|–—\-])/g, '$1' + NB)                 // Zahl + nächstes Wort
    .replace(new RegExp(`\\b(${WORDS})[ \\t]+(?=[\\d+−\\-])`, 'g'), '$1' + NB) // "Platz 1", "GW 5", "Top 4,4"
    .replace(/([+−\-£])[ \t]+(?=\d)/g, '$1');                          // "− 4" → "−4"
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'svg', 'SVG']);
  function walk(node) {
    if (node.nodeType === 3) {
      const t = node.nodeValue;
      if (/\d/.test(t)) { const n = fix(t); if (n !== t) node.nodeValue = n; }
      return;
    }
    if (node.nodeType !== 1 || SKIP.has(node.nodeName)) return;
    for (const c of node.childNodes) walk(c);
  }
  let queued = false;
  const run = () => { queued = false; walk(document.body); };
  const schedule = () => { if (!queued) { queued = true; setTimeout(run, 0); } };
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', schedule);
})();
