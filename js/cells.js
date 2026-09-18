/* Game of Life: square cells on a canvas that glide from one layout to the next. */
(function (root) {
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const reduced = root.matchMedia('(prefers-reduced-motion: reduce)');

  // Largest pitch (cell plus gap) that fits n square cells in w by h, and the column count that gets it.
  function pack(n, w, h, max = Infinity) {
    let best = { cols: 1, p: Math.min(w, h, max) };
    for (let cols = 1; cols <= n; cols++) {
      if (w / cols < best.p) break; // more columns only shrink the cells from here on
      const p = Math.min(w / cols, h / Math.ceil(n / cols), max);
      if (p > best.p || cols === 1) best = { cols, p };
    }
    return best;
  }

  // A scene is a function (width, height) => { cells: [...], labels: [...] } in CSS pixels.
  // Cell: { k, x, y, s, c: [r, g, b], a?, d? (delay in ms), from?: { x, y, s }, tip? }.
  // Label: { k, text, x, y, font, color, align? }.
  function createCells(canvas, { duration = 900 } = {}) {
    const ctx = canvas.getContext('2d');
    const cells = new Map();
    const labels = new Map();
    let W = 0, H = 0, dpr = 1, t0 = 0, running = false, scene = null, instant = false;

    function measure() {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(root.devicePixelRatio || 1, 2);
      W = r.width;
      H = r.height;
      const w = Math.max(1, Math.round(W * dpr)), h = Math.max(1, Math.round(H * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    }

    function begin(item, to, d) {
      item.from = instant ? to : Object.fromEntries(Object.keys(to).map(key => [key, item[key]]));
      item.to = to;
      item.d = d;
      item.dead = false;
    }

    function show(next, animate = true) {
      scene = next;
      measure();
      if (W < 1 || H < 1) return;
      instant = !animate || reduced.matches;
      const out = scene(W, H);

      const seen = new Set();
      for (const t of out.cells) {
        seen.add(t.k);
        const to = { x: t.x, y: t.y, s: t.s, a: t.a ?? 1, r: t.c[0], g: t.c[1], b: t.c[2] };
        let c = cells.get(t.k);
        if (!c) {
          const f = t.from || { x: t.x + t.s / 2, y: t.y + t.s / 2, s: 0 };
          c = { ...to, x: f.x, y: f.y, s: f.s };
          cells.set(t.k, c);
        }
        c.tip = t.tip;
        begin(c, to, t.d || 0);
      }
      for (const [k, c] of cells) {
        if (seen.has(k)) continue;
        begin(c, { x: c.x + c.s / 4, y: c.y + c.s / 4, s: c.s / 2, a: 0 }, 0);
        c.dead = true;
      }

      const seenLabels = new Set();
      for (const t of out.labels || []) {
        seenLabels.add(t.k);
        let l = labels.get(t.k);
        if (!l) { l = { x: t.x, y: t.y, a: 0 }; labels.set(t.k, l); }
        Object.assign(l, { text: t.text, font: t.font, color: t.color, align: t.align || 'left' });
        begin(l, { x: t.x, y: t.y, a: 1 }, 0);
      }
      for (const [k, l] of labels) {
        if (seenLabels.has(k)) continue;
        begin(l, { a: 0 }, 0);
        l.dead = true;
      }

      t0 = performance.now();
      if (instant) tick(Infinity);
      else if (!running) { running = true; requestAnimationFrame(frame); }
    }

    function tick(T) {
      let busy = false;
      for (const map of [cells, labels]) {
        for (const [k, item] of map) {
          const p = clamp((T - item.d) / duration, 0, 1), e = ease(p);
          for (const key in item.to) item[key] = lerp(item.from[key], item.to[key], e);
          if (p < 1) busy = true;
          else if (item.dead) map.delete(k);
        }
      }
      draw();
      return busy;
    }

    function frame(now) {
      if (tick(now - t0)) requestAnimationFrame(frame);
      else running = false;
    }

    function draw() {
      const px = v => Math.round(v * dpr) / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      let fill = '';
      for (const c of cells.values()) {
        if (c.a < 0.02 || c.s < 0.3) continue;
        const f = `rgb(${c.r | 0},${c.g | 0},${c.b | 0})`;
        if (f !== fill) { ctx.fillStyle = f; fill = f; }
        ctx.globalAlpha = c.a;
        const s = Math.max(1 / dpr, px(c.s));
        ctx.fillRect(px(c.x), px(c.y), s, s);
      }
      ctx.textBaseline = 'middle';
      for (const l of labels.values()) {
        if (l.a < 0.02) continue;
        ctx.globalAlpha = l.a;
        ctx.font = l.font;
        ctx.fillStyle = l.color;
        ctx.textAlign = l.align;
        ctx.fillText(l.text, l.x, l.y);
      }
      ctx.globalAlpha = 1;
    }

    // The visible cell under a point, in CSS pixels, for hover details.
    function hit(x, y) {
      for (const c of cells.values()) {
        if (!c.dead && c.to && c.to.a > 0.2 && x >= c.to.x && x <= c.to.x + c.to.s && y >= c.to.y && y <= c.to.y + c.to.s) return c;
      }
      return null;
    }

    new ResizeObserver(() => { if (scene) show(scene, false); }).observe(canvas);

    return { show, hit };
  }

  root.Cells = { createCells, pack };
})(window);
