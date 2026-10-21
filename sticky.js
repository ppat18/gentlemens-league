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
  function mark() {
    document.querySelectorAll('table:not([data-stick])').forEach(t => {
      if (!t.rows.length || !scrollParent(t)) return;
      const col = nameCol(t);
      if (col < 0) return;
      t.dataset.stick = col;
      for (const r of t.rows) { const c = r.cells[col]; if (c && c.colSpan === 1) c.classList.add('stick'); }
    });
  }
  let timer = null;
  new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(mark, 120); })
    .observe(document.documentElement, { childList: true, subtree: true });
  addEventListener('load', mark);
  setTimeout(mark, 300);
})();
