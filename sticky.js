// Breite Tabellen am Handy: die Namensspalte bleibt beim seitlichen Schieben stehen, nur die Zahlen bewegen sich.
// Läuft automatisch über alle Tabellen in seitlich scrollbaren Bereichen – auch über später eingeblendete.
(function () {
  const scrollParent = el => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll') return p;
    }
    return null;
  };
  // Spalte mit dem Namen: erste Zelle mit Avatar/Name, sonst die erste Spalte
  const nameCol = table => {
    const row = table.tBodies[0]?.rows[0] || table.rows[1] || table.rows[0];
    if (!row) return -1;
    const cells = [...row.cells];
    const i = cells.findIndex(c => c.querySelector('.who, .pl, .mt, img.av') || c.classList.contains('nm'));
    return i >= 0 ? i : 0;
  };
  // Ausweichlösung, falls ein Browser „sticky“ in Tabellen nicht umsetzt (iPhone, 7.11.2026): rutscht die Namensspalte
  // beim Schieben links aus dem Bild, wird sie stattdessen um die Scroll-Weite mitgeschoben.
  const follow = sc => {
    const cells = sc.querySelectorAll('td.stick, th.stick');
    if (!cells.length) return;
    if (!sc.dataset.stickJs) {
      // eine Zelle aus dem Tabellenkörper prüfen: am iPhone blieb nur die Kopfzeile stehen, die Namen rutschten weg (7.11.2026)
      const probe = sc.querySelector('td.stick') || cells[0];
      if (probe.getBoundingClientRect().left >= sc.getBoundingClientRect().left - 1) return;   // sticky works
      sc.dataset.stickJs = '1';
    }
    for (const c of cells) { c.style.position = 'relative'; c.style.transform = `translateX(${sc.scrollLeft}px)`; }
  };
  function mark() {
    document.querySelectorAll('table').forEach(t => {
      const sc = t.rows.length && scrollParent(t);
      if (!sc) return;
      // auch schon markierte Tabellen: neu gezeichnete Zeilen (Sortieren, Aktualisieren) brauchen die Klasse wieder
      const col = t.dataset.stick != null ? +t.dataset.stick : nameCol(t);
      if (col < 0) return;
      t.dataset.stick = col;
      for (const r of t.rows) { const c = r.cells[col]; if (c && c.colSpan === 1 && !c.classList.contains('stick')) c.classList.add('stick'); }
      if (!sc.dataset.stickWatch) { sc.dataset.stickWatch = '1'; sc.addEventListener('scroll', () => follow(sc), { passive: true }); }
      if (sc.dataset.stickJs) follow(sc);
    });
  }
  let timer = null;
  new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(mark, 120); })
    .observe(document.documentElement, { childList: true, subtree: true });
  addEventListener('load', mark);
  setTimeout(mark, 300);
})();
