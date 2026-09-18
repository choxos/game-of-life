/* Game of Life: the share card and the weeks poster, drawn on a canvas. */
(function (root) {
  const rgb = c => `rgb(${c[0]},${c[1]},${c[2]})`;

  function kit(w, h, d) {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const g = cv.getContext('2d');
    g.fillStyle = rgb(d.C.paper);
    g.fillRect(0, 0, w, h);
    g.textBaseline = 'alphabetic';
    const text = (str, x, y, font, color, align = 'left') => { g.font = font; g.fillStyle = rgb(color); g.textAlign = align; g.fillText(str, x, y); };
    const box = (x, y, bw, bh, r) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, bw, bh, r); else g.rect(x, y, bw, bh); g.fill(); };
    const glider = (x, y, cell, color) => {
      g.fillStyle = rgb(color);
      [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]].forEach(([i, j]) => box(x + i * cell * 1.17, y + j * cell * 1.17, cell, cell, cell / 6));
    };
    return { cv, g, text, box, glider };
  }

  // The weeks ahead, one row per year, each row sorted into what fills it.
  function weekGrid(k, d, x, y, w, h) {
    const rows = d.rows.length, p = Math.min(w / 52, h / rows), s = Math.max(1, p - Math.max(1, p * 0.18));
    d.rows.forEach((counts, r) => {
      let col = 0;
      counts.forEach((n, kind) => {
        k.g.fillStyle = rgb(d.kinds[kind]);
        for (let i = 0; i < n; i++, col++) k.g.fillRect(x + col * p, y + r * p, s, s);
      });
    });
    return { w: 52 * p, h: rows * p };
  }

  function card(d) {
    const W = 1080, H = 1350, P = 84;
    const k = kit(W, H, d), { text } = k;
    k.glider(P, 82, 13, d.C.accent);
    text('Game of Life', P + 60, 124, `600 34px ${d.body}`, d.C.ink);
    text('My life budget', W - P, 124, `500 30px ${d.body}`, d.C.muted, 'right');

    let y = 222;
    text('Years ahead', P, y, `600 32px ${d.body}`, d.C.ink);
    text(d.one(d.yearsAhead), P + 470, y, `600 32px ${d.body}`, d.C.ink, 'right');
    for (const [label, hours, color] of d.parts) {
      y += 54;
      k.g.fillStyle = rgb(color);
      k.box(P, y - 22, 22, 22, 4);
      text(label, P + 38, y, `400 31px ${d.body}`, d.C.muted);
      text(d.fmtYears(hours / d.yearH), P + 470, y, `500 31px ${d.body}`, d.C.ink, 'right');
    }
    weekGrid(k, d, 620, 178, W - P - 620, 330);

    y = 600;
    text('Time that is mine', P, y, `600 30px ${d.body}`, d.C.accentInk);
    text(d.fmtYears(d.free / d.yearH), P - 6, y + 164, `400 190px ${d.display}`, d.C.accent);
    text(`${d.int(d.free)} hours to spend as I choose`, P, y + 250, `400 32px ${d.body}`, d.C.muted);

    y = 952;
    text('I’d spend them on', P, y, `600 28px ${d.body}`, d.C.ink);
    const picks = d.picks.slice(0, 8), rows = Math.ceil(picks.length / 2), colW = (W - 2 * P - 56) / 2;
    picks.forEach(([label, share], i) => {
      const cx = P + (i >= rows ? colW + 56 : 0), cy = y + 52 + (i % rows) * 46;
      text(label, cx, cy, `400 28px ${d.body}`, d.C.ink);
      text(`${share}%`, cx + colW, cy, `500 28px ${d.body}`, d.C.muted, 'right');
    });

    k.g.fillStyle = rgb(d.C.rule);
    k.g.fillRect(P, H - 150, W - 2 * P, 2);
    text('How much of your life is actually yours?', P, H - 90, `400 46px ${d.display}`, d.C.ink);
    if (d.site) text(d.site, P, H - 46, `400 26px ${d.body}`, d.C.muted);
    return k.cv;
  }

  // Every week of a life on one page: the lived ones faded, the rest sorted by what fills them.
  function poster(d) {
    const W = 1800, H = 2700, P = 130;
    const k = kit(W, H, d), { text, g } = k;
    k.glider(P, 118, 20, d.C.accent);
    text('Game of Life', P + 92, 176, `600 48px ${d.body}`, d.C.ink);
    text('My life in weeks', P, 330, `400 150px ${d.display}`, d.C.ink);
    text(`${d.who}. Each square is one week.`, P, 400, `400 40px ${d.body}`, d.C.muted);

    const total = d.age + d.rows.length, top = 480, gutter = 90;
    const p = Math.min((W - 2 * P - gutter) / 52, (H - top - 330) / total), s = Math.max(1, p - Math.max(1, p * 0.18));
    const x0 = P + gutter;
    g.fillStyle = rgb(d.C.lived);
    for (let i = 0; i < d.lived; i++) g.fillRect(x0 + (i % 52) * p, top + Math.floor(i / 52) * p, s, s);
    const grid = weekGrid(k, d, x0, top + d.age * p, 52 * p, d.rows.length * p);
    for (let a = 0; a <= total; a += 10) text(String(a), x0 - 24, top + a * p + p * 0.8, `500 26px ${d.body}`, d.C.muted, 'right');

    let lx = P, ly = top + d.age * p + grid.h + 110;
    g.font = `500 32px ${d.body}`;
    for (const [label, hours, color] of [...d.parts, ['Yours', d.free, d.C.yours]]) {
      const str = `${label} ${d.fmtYears(hours / d.yearH)}`, width = 44 + g.measureText(str).width;
      if (lx + width > W - P) { lx = P; ly += 58; }
      g.fillStyle = rgb(color);
      k.box(lx, ly - 28, 30, 30, 5);
      text(str, lx + 44, ly, `500 32px ${d.body}`, d.C.ink);
      lx += width + 56;
    }

    g.fillStyle = rgb(d.C.rule);
    g.fillRect(P, H - 170, W - 2 * P, 2);
    text('How much of your life is actually yours?', P, H - 100, `400 56px ${d.display}`, d.C.ink);
    if (d.site) text(d.site, W - P, H - 100, `400 32px ${d.body}`, d.C.muted, 'right');
    return k.cv;
  }

  root.Card = { card, poster };
})(window);
