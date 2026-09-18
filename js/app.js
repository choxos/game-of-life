/* Game of Life: page wiring, the zoom story, the allocation, and the share card. */
(() => {
  const M = window.Model;
  const T = window.LIFE_TABLES;
  const { createCells, pack } = window.Cells;
  const CATS = M.CATEGORIES;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const sum = xs => xs.reduce((a, b) => a + b, 0);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const wide = matchMedia('(min-width: 60rem)');

  /* Formatting */

  const nf = new Intl.NumberFormat('en-US');
  const int = n => nf.format(Math.round(n));
  const one = n => (Math.round(n * 10) / 10).toFixed(1);
  const pct = n => `${Math.round(n)}%`;
  const years = n => `${one(n)} ${one(n) === '1.0' ? 'year' : 'years'}`;
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const qty = n => (n >= 10 ? int(n) : n >= 1 ? String(Math.round(n * 10) / 10) : n > 0 ? 'less than one' : 'no');
  const noun = (unit, n) => (qty(n) === '1' || (n > 0 && n < 1) ? unit.one : unit.many);
  const FRACTIONS = { 0.25: '¼', 0.5: '½', 0.75: '¾' };

  function duration(h, short) {
    if (h === 0) return short ? 'none' : 'no time';
    if (h < 1) return `${Math.round(h * 60)} ${short ? 'min' : 'minutes'}`;
    const whole = Math.floor(h), frac = FRACTIONS[Math.round((h - whole) * 100) / 100] || '';
    return short ? `${whole}${frac} h` : `${whole}${frac} ${h === 1 ? 'hour' : 'hours'}`;
  }

  function amount(hours, unit) {
    if (unit.range) {
      const lo = Math.round(hours / unit.range[1]), hi = Math.round(hours / unit.range[0]);
      if (hi < 1) return `less than one ${unit.one}`;
      if (lo === hi) return `${int(hi)} ${hi === 1 ? unit.one : unit.many}`;
      return `${lo < 1 ? 'up to' : `${int(lo)} to`} ${int(hi)} ${unit.many}`;
    }
    const n = hours / M.unitHours(unit, S);
    return `${qty(n)} ${noun(unit, n)}`;
  }

  function pace(n) {
    const per = n / YEARS;
    if (per >= 1) return `about ${qty(per)} a year`;
    return per > 0 ? `about one every ${qty(1 / per)} years` : 'none at all';
  }

  /* State, kept in the address so a link carries it */

  const range = (a, b, step) => Array.from({ length: Math.round((b - a) / step) + 1 }, (_, i) => Math.round((a + i * step) * 100) / 100);
  const nearest = (list, v) => list.reduce((best, x) => (Math.abs(x - v) < Math.abs(best - v) ? x : best), list[0]);
  const OPTIONS = {
    sleep: range(4, 12, 0.5),
    work: range(0, 16, 0.5),
    days: range(0, 7, 1),
    commute: [0, 10, 15, 20, 30, 40, 45, 60, 75, 90, 120, 150, 180, 240].map(m => m / 60),
    weeksOff: range(0, 12, 1),
    routine: range(0, 8, 0.25),
    words: [50000, 80000, 120000],
  };

  const S = {
    ...M.DEFAULTS,
    routine: [...M.DEFAULTS.routine],
    mine: [...M.DEFAULTS.mine],
    shares: CATS.map(c => c.share),
    units: CATS.map(() => 0),
    wpm: 250,
    words: 80000,
    fq: [4, 2, 12],
  };

  function readHash() {
    const q = new URLSearchParams(location.hash.slice(1));
    if (!q.has('age')) return false;
    const num = (key, lo, hi, fallback) => {
      const v = Number(q.get(key));
      return q.has(key) && q.get(key) !== '' && Number.isFinite(v) ? M.clamp(v, lo, hi) : fallback;
    };
    const list = (key, n, lo, hi, fallback) => {
      const v = (q.get(key) || '').split(',').map(Number);
      return v.length === n && v.every(Number.isFinite) ? v.map(x => M.clamp(x, lo, hi)) : fallback;
    };
    S.age = Math.round(num('age', 10, 100, S.age));
    if (['b', 'f', 'm'].includes(q.get('sex'))) S.sex = q.get('sex');
    if (Object.hasOwn(T.places, q.get('in') || '')) S.country = q.get('in');
    S.sleep = nearest(OPTIONS.sleep, num('sleep', 0, 24, S.sleep));
    S.work = nearest(OPTIONS.work, num('work', 0, 24, S.work));
    S.days = nearest(OPTIONS.days, num('days', 0, 7, S.days));
    S.commute = nearest(OPTIONS.commute, num('commute', 0, 24, S.commute));
    S.retire = Math.round(num('retire', 30, 100, S.retire));
    S.weeksOff = nearest(OPTIONS.weeksOff, num('off', 0, 52, S.weeksOff));
    S.routine = list('day', M.ROUTINE.length, 0, 8, S.routine).map(v => nearest(OPTIONS.routine, v));
    if (/^[01]+$/.test(q.get('mine') || '') && q.get('mine').length === M.ROUTINE.length) S.mine = [...q.get('mine')].map(c => c === '1');
    const shares = list('split', CATS.length, 0, 100, null);
    if (shares && sum(shares) > 0) S.shares = shares.map(x => (x / sum(shares)) * 100);
    S.units = list('as', CATS.length, 0, 9, S.units).map((u, i) => (Number.isInteger(u) && u < CATS[i].units.length ? u : 0));
    S.wpm = Math.round(num('wpm', 150, 450, S.wpm));
    S.words = nearest(OPTIONS.words, num('words', 1, 1e6, S.words));
    S.fq = list('often', 3, 0, 365, S.fq).map(Math.round);
    return true;
  }

  function hashNow() {
    const q = new URLSearchParams({
      age: S.age, sex: S.sex, in: S.country, sleep: S.sleep, work: S.work, days: S.days,
      commute: +S.commute.toFixed(3), retire: S.retire, off: S.weeksOff,
      day: S.routine.join(','), mine: S.mine.map(Number).join(''),
      split: S.shares.map(x => +x.toFixed(1)).join(','), as: S.units.join(','),
      wpm: S.wpm, words: S.words, often: S.fq.join(','),
    });
    try { history.replaceState(null, '', `#${q}`); } catch { /* Safari rate-limits this; the next change retries */ }
  }

  let hashTimer = 0;
  function writeHash() {
    clearTimeout(hashTimer);
    hashTimer = setTimeout(hashNow, 250);
  }

  /* Places */

  const regions = (() => { try { return new Intl.DisplayNames(['en'], { type: 'region' }); } catch { return null; } })();
  const THE = /^(United |Netherlands|Philippines|Bahamas|Gambia|Maldives|Seychelles|Comoros|Dominican Republic|Central African Republic)|Islands$/;
  const NAMES = {};
  for (const [code, p] of Object.entries(T.places)) {
    let name = p.n;
    try {
      const d = regions && p.a2 && regions.of(p.a2);
      if (d && d !== p.a2 && !d.includes(' - ')) name = d;
    } catch { /* keep the UN name */ }
    NAMES[code] = code === 'WLD' ? 'the world' : name;
  }
  const inPlace = code => (code === 'WLD' ? 'worldwide' : `in ${THE.test(NAMES[code]) ? 'the ' : ''}${NAMES[code]}`);

  function detectCountry() {
    const byA2 = Object.fromEntries(Object.entries(T.places).map(([k, p]) => [p.a2, k]));
    for (const tag of navigator.languages || [navigator.language]) {
      try {
        const region = new Intl.Locale(tag).maximize().region;
        if (byA2[region]) return byA2[region];
      } catch { /* try the next language */ }
    }
    return 'WLD';
  }

  const article = age => (age === 8 || age === 11 || age === 18 || (age >= 80 && age < 90) ? 'an' : 'a');
  const SEX = { b: 'person', f: 'woman', m: 'man' };
  const who = () => `${article(S.age)} ${S.age}-year-old ${SEX[S.sex]} ${inPlace(S.country)}`;

  /* The numbers */

  let YEARS = 0, B = null, ROWS = [];
  function compute() {
    YEARS = M.remainingYears(T, S.country, S.sex, S.age);
    B = M.budget(S, YEARS);
    ROWS = M.yearRows(S, B);
  }

  function unitInfo(i) {
    const cat = CATS[i], unit = cat.units[S.units[i]];
    const hours = (B.h.free * S.shares[i]) / 100;
    return { cat, unit, hours, n: hours / M.unitHours(unit, S) };
  }

  const perSquare = (n, max) => { let k = 1; while (n / k > max) k *= 10; return k; };
  const shown = () => M.apportion(S.shares, 100);
  const focusIndex = () => {
    const r = CATS.findIndex(c => c.id === 'reading');
    return S.shares[r] >= 1 ? r : S.shares.indexOf(Math.max(...S.shares));
  };

  /* Colors come from the CSS tokens so the canvas follows the theme */

  const C = {};
  const rgb = c => `rgb(${c[0]},${c[1]},${c[2]})`;
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const probe = document.createElement('canvas');
    probe.width = probe.height = 1;
    const g = probe.getContext('2d', { willReadFrequently: true });
    const TOKENS = {
      lived: '--mark-lived', ahead: '--mark-ahead', sleep: '--mark-sleep', work: '--mark-work',
      commute: '--mark-commute', admin: '--mark-admin', yours: '--mark-yours', yours2: '--mark-yours-2',
      ink: '--color-ink', muted: '--color-muted', accent: '--color-accent',
      accentInk: '--color-accent-ink', paper: '--color-paper', rule: '--color-rule',
    };
    for (const [name, token] of Object.entries(TOKENS)) {
      g.clearRect(0, 0, 1, 1);
      g.fillStyle = '#000';
      g.fillStyle = cs.getPropertyValue(token).trim();
      g.fillRect(0, 0, 1, 1);
      C[name] = [...g.getImageData(0, 0, 1, 1).data.slice(0, 3)];
    }
    C.body = cs.getPropertyValue('--font-body').trim();
    C.display = cs.getPropertyValue('--font-display').trim();
  }

  /* Stage scenes: one square per week, zooming from a whole life down to single books */

  const KINDS = ['sleep', 'work', 'commute', 'admin', 'yours'];
  const GUTTER = 30;
  const snap = p => { const d = Math.min(devicePixelRatio || 1, 2); return Math.max(1 / d, Math.floor(p * d) / d); };
  const size = p => Math.max(0.5, p - Math.max(1, p * 0.18));
  const tickFont = () => `500 11px ${C.body}`;

  // Weeks ahead in time order; each knows its year row, its column, and what fills it.
  function weeksAhead() {
    const out = [];
    ROWS.forEach((counts, y) => {
      let col = 0;
      counts.forEach((n, kind) => { for (let i = 0; i < n; i++) out.push({ y, col: col++, kind }); });
    });
    return out;
  }

  function ageTicks(from, to, yOf, x, marks) {
    const out = marks.map(m => ({ ...m, x, y: yOf(m.age), align: 'right', font: `600 11px ${C.body}` }));
    for (let a = Math.ceil(from / 10) * 10; a <= to; a += 10) {
      const y = yOf(a);
      if (out.some(m => Math.abs(m.y - y) < 13)) continue;
      out.push({ k: `t${a}`, text: String(a), x, y, align: 'right', font: tickFont(), color: rgb(C.muted) });
    }
    return out;
  }

  function sceneLife(W, H) {
    const lived = S.age * 52, rows = S.age + ROWS.length;
    const p = snap(Math.min((W - GUTTER) / 52, H / rows)), s = size(p);
    const ox = Math.round((W - GUTTER - 52 * p) / 2) + GUTTER, oy = Math.round((H - rows * p) / 2);
    const cells = [];
    for (let i = 0; i < lived; i++) {
      const y = Math.floor(i / 52);
      cells.push({ k: `l${i}`, x: ox + (i % 52) * p, y: oy + y * p, s, c: C.lived, d: (y / rows) * 500 });
    }
    weeksAhead().forEach((w, j) => {
      const y = S.age + w.y;
      cells.push({ k: `a${j}`, x: ox + w.col * p, y: oy + y * p, s, c: C.ahead, d: (y / rows) * 500 });
    });
    const yOf = a => oy + a * p + p / 2;
    const labels = ageTicks(0, rows, yOf, ox - 8, [{ k: 'now', text: 'now', age: S.age, color: rgb(C.ink) }]);
    return { cells, labels };
  }

  function sceneAhead(W, H) {
    const rows = ROWS.length;
    const p = snap(Math.min((W - GUTTER) / 52, H / rows)), s = size(p);
    const ox = Math.round((W - GUTTER - 52 * p) / 2) + GUTTER, oy = Math.round((H - rows * p) / 2);
    const cells = [];
    for (let i = 0; i < S.age * 52; i++) {
      const y = Math.floor(i / 52) - S.age;
      cells.push({ k: `l${i}`, x: ox + (i % 52) * p, y: oy + y * p, s, c: C.lived, a: 0 });
    }
    weeksAhead().forEach((w, j) => {
      cells.push({ k: `a${j}`, x: ox + w.col * p, y: oy + w.y * p, s, c: C[KINDS[w.kind]], d: w.col * 5 + (w.y / rows) * 250 });
    });
    const yOf = a => oy + (a - S.age) * p + p / 2;
    const marks = [{ k: 'now', text: 'now', age: S.age, color: rgb(C.ink) }];
    if (S.retire > S.age && S.retire < S.age + rows) marks.push({ k: 'retire', text: String(S.retire), age: S.retire, color: rgb(C.accentInk) });
    return { cells, labels: ageTicks(S.age, S.age + rows, yOf, ox - 8, marks) };
  }

  const freeWeeks = () => weeksAhead().map((w, j) => ({ ...w, j })).filter(w => w.kind === 4);

  function sceneYours(W, H) {
    const F = freeWeeks();
    const { cols, p: raw } = pack(F.length, W, H, 28);
    const p = snap(raw), s = size(p), rows = Math.ceil(F.length / cols);
    const ox = Math.round((W - cols * p) / 2), oy = Math.round((H - rows * p) / 2);
    const cells = F.map((w, i) => ({
      k: `a${w.j}`, x: ox + (i % cols) * p, y: oy + Math.floor(i / cols) * p, s, c: C.yours, d: (i / F.length) * 400,
    }));
    return { cells, labels: [] };
  }

  function scenePlans(W, H) {
    const F = freeWeeks(), LABEL = 22;
    const groups = M.apportion(S.shares, F.length).map((n, i) => ({ i, n })).filter(g => g.n > 0);
    let best = { cols: 52, p: 0 };
    for (let cols = 8; cols <= 90; cols++) {
      const rows = sum(groups.map(g => Math.ceil(g.n / cols)));
      const p = Math.min(W / cols, (H - groups.length * LABEL) / rows, 24);
      if (p > best.p) best = { cols, p };
    }
    const { cols } = best, p = snap(best.p), s = size(p);
    const height = sum(groups.map(g => LABEL + Math.ceil(g.n / cols) * p));
    const ox = Math.round((W - cols * p) / 2);
    let y = Math.round((H - height) / 2), k = 0;
    const cells = [], labels = [], whole = shown();
    groups.forEach((g, gi) => {
      labels.push({ k: `g${g.i}`, text: `${CATS[g.i].label} · ${whole[g.i]}%`, x: ox, y: y + LABEL / 2, font: `500 12px ${C.body}`, color: rgb(C.muted) });
      y += LABEL;
      for (let m = 0; m < g.n; m++, k++) {
        cells.push({ k: `a${F[k].j}`, x: ox + (m % cols) * p, y: y + Math.floor(m / cols) * p, s, c: gi % 2 ? C.yours2 : C.yours, d: (k / F.length) * 350, cat: g.i });
      }
      y += Math.ceil(g.n / cols) * p;
    });
    return { cells, labels };
  }

  const STAGE_MAX = 3000;
  function sceneUnits(W, H) {
    const fi = focusIndex(), { n } = unitInfo(fi);
    const k = perSquare(n, STAGE_MAX), m = Math.floor(n / k);
    const parents = scenePlans(W, H).cells.filter(c => c.cat === fi);
    const { cols, p: raw } = pack(m, W, H, 26);
    const p = snap(raw), s = size(p), rows = Math.ceil(m / cols);
    const ox = Math.round((W - cols * p) / 2), oy = Math.round((H - rows * p) / 2);
    const cells = [];
    for (let u = 0; u < m; u++) {
      const par = parents[Math.floor((u * parents.length) / m)] || { x: W / 2, y: H / 2, s: 0 };
      cells.push({
        k: `u${u}`, x: ox + (u % cols) * p, y: oy + Math.floor(u / cols) * p, s, c: C.yours,
        d: (u / m) * 600, from: { x: par.x + par.s / 2, y: par.y + par.s / 2, s: 0 },
      });
    }
    return { cells, labels: [] };
  }

  const SCENES = { life: sceneLife, ahead: sceneAhead, yours: sceneYours, plans: scenePlans, units: sceneUnits };
  const stage = createCells($('#stage'));
  let level = null, figureShown = false;

  function stageLabel() {
    const weeks = [0, 0, 0, 0, 0];
    ROWS.forEach(r => r.forEach((n, k) => { weeks[k] += n; }));
    const { unit, n } = unitInfo(focusIndex());
    return {
      life: `${int(S.age * 52)} weeks lived and about ${int(sum(weeks))} ahead, one square per week.`,
      ahead: `Weeks ahead: ${int(weeks[0])} asleep, ${int(weeks[1])} working, ${int(weeks[2])} commuting, ${int(weeks[3])} on upkeep, ${int(weeks[4])} yours.`,
      yours: `${int(weeks[4])} weeks that are yours.`,
      plans: `Your weeks, split: ${CATS.map((c, i) => `${c.label} ${shown()[i]}%`).join(', ')}.`,
      units: `About ${amount(unitInfo(focusIndex()).hours, unit)}, ${pace(n)}.`,
    }[level];
  }

  function setLevel(next) {
    if (next === level) return;
    level = next;
    for (const step of $$('.step')) step.classList.toggle('is-active', step.dataset.level === level);
    stage.show(SCENES[level], true);
    $('#stage').setAttribute('aria-label', stageLabel());
    if (level === 'yours' && !figureShown) {
      figureShown = true;
      tween($('#figure'), B.h.free, 0);
    }
  }

  let stageTimer = 0;
  function refreshStage() {
    if (!level || stageTimer) return;
    stageTimer = setTimeout(() => {
      stageTimer = 0;
      stage.show(SCENES[level], true);
      $('#stage').setAttribute('aria-label', stageLabel());
    }, 120);
  }

  let stepObserver = null;
  function observeSteps() {
    if (stepObserver) stepObserver.disconnect();
    stepObserver = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) setLevel(e.target.closest('.step').dataset.level);
    }, { rootMargin: wide.matches ? '-50% 0px -50% 0px' : '-78% 0px -22% 0px' });
    $$('.step__card').forEach(card => stepObserver.observe(card));
  }

  /* Number tweens */

  function tween(el, to, from) {
    const start = from ?? el.value ?? to;
    el.value = to;
    cancelAnimationFrame(el.raf);
    if (reduced.matches || start === to) { el.textContent = int(to); return; }
    const t0 = performance.now();
    const step = now => {
      const p = Math.min(1, (now - t0) / 900), e = 1 - Math.pow(1 - p, 3);
      el.textContent = int(start + (to - start) * e);
      if (p < 1) el.raf = requestAnimationFrame(step);
    };
    el.raf = requestAnimationFrame(step);
  }

  /* Text */

  const keyed = {};
  for (const el of $$('[data-k]')) (keyed[el.dataset.k] ||= []).push(el);
  const set = (key, text) => { for (const el of keyed[key] || []) el.textContent = text; };

  function renderStory() {
    const Y = h => years(h / M.YEAR_H);
    set('livedWeeks', int(S.age * 52));
    set('whoCap', cap(who()));
    set('years', one(YEARS));
    set('aheadWeeks', int(sum(ROWS.map(sum))));
    set('ySleep', Y(B.h.sleep));
    set('yWork', Y(B.h.work));
    set('yCommute', Y(B.h.commute));
    set('yAdmin', Y(B.h.admin));
    set('yFree', Y(B.h.free));
    set('aheadNote', B.workYears > 0 && B.workYears < YEARS
      ? `Each row is a year. Your part sits at the end of each row, and it widens once you stop working at ${S.retire}.`
      : 'Each row is a year. Your part sits at the end of each row.');
    set('freeYears', one(B.h.free / M.YEAR_H));
    set('freePct', pct((B.h.free / B.h.total) * 100));
    set('weekly', B.weekly.now === null
      ? `That’s about ${int(B.weekly.later)} hours a week.`
      : `Right now that’s about ${int(B.weekly.now)} hours a week. After ${S.retire}, about ${int(B.weekly.later)}.`);
    if (figureShown) tween($('#figure'), B.h.free);
    renderUnitStory();
  }

  function renderUnitStory() {
    const fi = focusIndex(), { cat, unit, hours, n } = unitInfo(fi);
    const k = perSquare(n, STAGE_MAX);
    set('unitTitle', k === 1 ? `Every square is now ${/^[aeiou]/i.test(unit.one) ? 'an' : 'a'} ${unit.one}.` : `Every square is now ${int(k)} ${unit.many}.`);
    set('unitText', cat.id === 'reading'
      ? `${shown()[fi]}% of your free time, at ${S.wpm} words a minute, is about ${amount(hours, unit)}. That’s ${pace(n)} for the rest of your life.`
      : `${shown()[fi]}% of your free time on ${cat.label.toLowerCase()} is about ${amount(hours, unit)}. That’s ${pace(n)} for the rest of your life.`);
    set('unitCoda', cat.id === 'reading'
      ? 'You won’t get to every book you want to read. You have time for about this many, so choose them carefully.'
      : 'Not endless, but plenty. Choose them carefully.');
  }

  /* The answer form */

  const measure = document.createElement('canvas').getContext('2d');
  function fit(el) {
    const cs = getComputedStyle(el);
    measure.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const text = el.tagName === 'SELECT' ? el.options[el.selectedIndex]?.text || '' : el.value || '0';
    const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    el.style.width = `${Math.ceil(measure.measureText(text).width + pad + 2)}px`;
  }

  const fill = (select, values, label) => select.replaceChildren(...values.map(v => new Option(label(v), String(v))));
  const plural = (n, word) => `${n} ${n === 1 ? word : `${word}s`}`;

  function buildForm() {
    const countries = Object.keys(T.places).filter(k => k !== 'WLD').sort((a, b) => NAMES[a].localeCompare(NAMES[b], 'en'));
    $('#country').replaceChildren(new Option('the world', 'WLD'), ...countries.map(k => new Option(`${THE.test(NAMES[k]) ? 'the ' : ''}${NAMES[k]}`, k)));
    fill($('#sleep'), OPTIONS.sleep, h => duration(h));
    fill($('#work'), OPTIONS.work, h => (h === 0 ? '0 hours' : duration(h)));
    fill($('#days'), OPTIONS.days, d => plural(d, 'day'));
    fill($('#commute'), OPTIONS.commute, h => duration(h));
    fill($('#weeksOff'), OPTIONS.weeksOff, w => plural(w, 'week'));

    const selects = { sex: 'sex', country: 'country', sleep: 'sleep', work: 'work', days: 'days', commute: 'commute', weeksOff: 'weeksOff' };
    for (const [id, key] of Object.entries(selects)) {
      const el = $(`#${id}`);
      el.value = String(S[key]);
      el.addEventListener('change', () => {
        S[key] = typeof S[key] === 'number' ? Number(el.value) : el.value;
        update();
      });
    }

    for (const [id, lo, hi] of [['age', 10, 100], ['retire', 30, 100]]) {
      const el = $(`#${id}`);
      el.value = String(S[id]);
      el.addEventListener('input', () => {
        fit(el);
        const v = Number(el.value);
        if (Number.isInteger(v) && v >= lo && v <= hi && v !== S[id]) { S[id] = v; update(); }
      });
      el.addEventListener('change', () => { el.value = String(S[id]); fit(el); });
    }

    S.fq.forEach((f, i) => {
      const el = $(`#fq${i}`);
      el.value = String(f);
      el.addEventListener('input', () => {
        const v = Number(el.value);
        if (Number.isInteger(v) && v >= 0 && v <= 365) { S.fq[i] = v; renderFewer(); writeHash(); }
      });
      el.addEventListener('change', () => { el.value = String(S.fq[i]); });
    });
  }

  const ARROW = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const chips = [];

  function buildRoutine() {
    M.ROUTINE.forEach((item, i) => {
      const li = document.createElement('li');
      li.className = 'chip';
      li.innerHTML = `<span class="chip__name">${item.label}</span><select class="field" aria-label="${item.label}, hours a day"></select><button class="chip__move" type="button">${ARROW}</button>`;
      const select = $('select', li);
      fill(select, OPTIONS.routine, h => duration(h, true));
      select.value = String(S.routine[i]);
      select.addEventListener('change', () => { S.routine[i] = Number(select.value); fit(select); update(); });
      $('.chip__move', li).addEventListener('click', () => {
        S.mine[i] = !S.mine[i];
        placeChips(true);
        $('.chip__move', li).focus({ preventScroll: true });
        update();
      });
      chips.push(li);
    });
    placeChips(false);
  }

  function placeChips(animate) {
    const before = chips.map(li => li.getBoundingClientRect());
    chips.forEach((li, i) => {
      (S.mine[i] ? $('#mine') : $('#duty')).append(li);
      const name = M.ROUTINE[i].label.toLowerCase();
      $('.chip__move', li).setAttribute('aria-label', S.mine[i] ? `Move ${name} back to obligations` : `Move ${name} to mine`);
    });
    if (!animate || reduced.matches) return;
    chips.forEach((li, i) => {
      const after = li.getBoundingClientRect(), dx = before[i].left - after.left, dy = before[i].top - after.top;
      if (dx || dy) li.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(0.65, 0, 0.35, 1)' });
    });
  }

  function renderForm() {
    $('#article').textContent = article(S.age);
    $('#warn').hidden = !B.overbooked;
    $$('.field').forEach(fit);
  }

  /* Allocation */

  const CHEVRON = '<svg class="row__chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 6 8 10.5 12.5 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const READING = `
    <div class="params">
      <div class="param"><label for="wpm">Reading speed</label><output id="wpmOut" for="wpm"></output></div>
      <input id="wpm" type="range" min="150" max="450" step="10">
      <div class="param">
        <label for="words">A typical book</label>
        <select class="field" id="words">
          <option value="50000">short, 50,000 words</option>
          <option value="80000">average, 80,000 words</option>
          <option value="120000">long, 120,000 words</option>
        </select>
      </div>
    </div>`;
  const ROW_MAX = 2000;
  const R = [];

  function buildAlloc() {
    const list = $('#alloc'), bar = $('#bar');
    CATS.forEach((cat, i) => {
      const li = document.createElement('li');
      li.className = 'row';
      li.innerHTML = `
        <label class="row__name" for="r-${cat.id}">${cat.label}</label>
        <output class="row__pct" for="r-${cat.id}"></output>
        <input class="row__range" id="r-${cat.id}" type="range" min="0" max="100" step="1">
        <button class="row__sum" type="button" aria-expanded="false" aria-controls="d-${cat.id}">
          <span class="row__hours"></span><span class="row__buys"></span>${CHEVRON}
        </button>
        <div class="row__detail" id="d-${cat.id}">
          <div class="row__inner" inert>
            <div class="row__panel">
              ${cat.units.length > 1 ? `<div class="units" role="radiogroup" aria-label="Count it as">${cat.units.map((u, k) => `<button class="unit" type="button" role="radio" data-u="${k}">${u.many}</button>`).join('')}</div>` : ''}
              ${cat.id === 'reading' ? READING : ''}
              <canvas class="row__canvas" aria-hidden="true"></canvas>
              <p class="row__caption"></p>
            </div>
          </div>
        </div>`;
      list.append(li);
      const span = document.createElement('span');
      bar.append(span);
      const r = {
        li, span, cells: null,
        range: $('.row__range', li), pct: $('.row__pct', li), hours: $('.row__hours', li), buys: $('.row__buys', li),
        sum: $('.row__sum', li), inner: $('.row__inner', li), canvas: $('.row__canvas', li), caption: $('.row__caption', li),
      };
      R.push(r);

      r.range.addEventListener('input', () => {
        S.shares = M.rebalance(S.shares, i, Number(r.range.value));
        bar.classList.add('is-dragging');
        sharesChanged();
      });
      r.range.addEventListener('change', () => bar.classList.remove('is-dragging'));
      const light = on => {
        bar.classList.toggle('has-focus', on);
        R.forEach((o, j) => o.span.classList.toggle('is-on', on && j === i));
      };
      li.addEventListener('pointerenter', () => light(true));
      li.addEventListener('pointerleave', () => light(false));
      r.range.addEventListener('focus', () => light(true));
      r.range.addEventListener('blur', () => light(false));
      r.sum.addEventListener('click', () => toggleRow(i));
      $$('.unit', li).forEach(button => button.addEventListener('click', () => {
        S.units[i] = Number(button.dataset.u);
        sharesChanged();
      }));
    });

    const wpm = $('#wpm'), words = $('#words');
    wpm.value = String(S.wpm);
    words.value = String(S.words);
    wpm.addEventListener('input', () => { S.wpm = Number(wpm.value); sharesChanged(); renderChanges(); });
    words.addEventListener('change', () => { S.words = Number(words.value); fit(words); sharesChanged(); renderChanges(); });

    $('#resetShares').addEventListener('click', () => {
      S.shares = CATS.map(c => c.share);
      sharesChanged();
    });
  }

  function toggleRow(i) {
    const r = R[i], open = !r.li.classList.contains('is-open');
    r.li.classList.toggle('is-open', open);
    r.sum.setAttribute('aria-expanded', String(open));
    r.inner.inert = !open;
    if (open) {
      r.cells ||= createCells(r.canvas, { duration: 650 });
      drawRow(i, true);
    }
  }

  function drawRow(i, animate) {
    const r = R[i];
    if (!r.cells || !r.li.classList.contains('is-open')) return;
    const { unit, n } = unitInfo(i);
    const k = perSquare(n, ROW_MAX), m = Math.floor(n / k);
    r.cells.show((W, H) => {
      const { cols, p: raw } = pack(m, W, H, 22);
      const p = snap(raw), s = size(p);
      const cells = Array.from({ length: m }, (_, u) => ({
        k: `u${u}`, x: (u % cols) * p, y: Math.floor(u / cols) * p, s, c: C.yours, d: Math.min(u, 400) * 1.2,
      }));
      return { cells, labels: [] };
    }, animate);
    const each = k === 1 ? `one ${unit.one}` : `${int(k)} ${unit.many}`;
    r.caption.textContent = `Each square is ${each}. That’s ${pace(n)} for the rest of your life.${unit.note ? ` ${unit.note}` : ''}`;
  }

  function renderAlloc() {
    set('freeHours', int(B.h.free));
    const whole = shown();
    CATS.forEach((cat, i) => {
      const r = R[i], share = S.shares[i], { unit, hours } = unitInfo(i);
      r.range.value = String(whole[i]);
      r.range.style.setProperty('--p', share);
      r.range.setAttribute('aria-valuetext', `${whole[i]}%, ${int(hours)} hours`);
      r.pct.textContent = `${whole[i]}%`;
      r.hours.textContent = `${int(hours)} h`;
      r.buys.textContent = `≈ ${amount(hours, unit)}`;
      r.span.style.setProperty('--g', share);
      $$('.unit', r.li).forEach((b, k) => b.setAttribute('aria-checked', String(k === S.units[i])));
      drawRow(i, true);
    });
    const wpm = $('#wpm');
    wpm.style.setProperty('--p', ((S.wpm - 150) / 300) * 100);
    $('#wpmOut').textContent = `${S.wpm} words a minute`;
  }

  function sharesChanged() {
    renderAlloc();
    renderUnitStory();
    if (level === 'plans' || level === 'units') refreshStage();
    scheduleCard();
    writeHash();
  }

  /* Fewer than you think, and small changes */

  function renderFewer() {
    set('weekends', int(YEARS * M.WEEKS));
    set('summers', int(YEARS));
    set('moons', int(YEARS * 12.3685));
    set('sunsets', int(YEARS * M.DAYS));
    S.fq.forEach((f, i) => set(`fq${i}`, int(YEARS * f)));
  }

  function renderChanges() {
    const book = CATS.find(c => c.id === 'reading').units[0];
    const language = CATS.find(c => c.id === 'learning').units[0];
    const titles = {
      commute: c => `Commute ${duration(c.cut)} less each workday`,
      day: () => (S.days === 5 ? 'Work four days a week instead of five' : 'Work one day less each week'),
      scroll: () => 'Scroll 45 minutes less each day',
      retire: () => 'Stop working two years sooner',
    };
    $('#changes').replaceChildren(...M.changes(S, B).map(c => {
      const li = document.createElement('li');
      const buys = `Enough for ${amount(c.h, book)}, or ${int(c.h / 2)} movies, or ${amount(c.h, language)}.`;
      const lead = c.id === 'scroll'
        ? `About ${years(c.h / M.YEAR_H)} of your life, moved from your feed to anything you like.`
        : `That’s ${pct((c.h / Math.max(1, B.h.free)) * 100)} more time that’s yours.`;
      li.innerHTML = '<p class="change__what"></p><p class="change__gain"></p><p class="change__alt"></p>';
      $('.change__what', li).textContent = titles[c.id](c);
      $('.change__gain', li).innerHTML = `+${int(c.h)} <small>hours</small>`;
      $('.change__alt', li).textContent = `${lead} ${buys}`;
      return li;
    }));
  }

  /* The share card */

  let cardBlob = null, cardUrl = '', cardDirty = true, cardTimer = 0, shareVisible = false;

  function scheduleCard() {
    cardDirty = true;
    if (!shareVisible) return;
    clearTimeout(cardTimer);
    cardTimer = setTimeout(drawCard, 300);
  }

  async function drawCard() {
    cardDirty = false;
    await Promise.all([
      document.fonts.load(`400 100px ${C.display}`),
      document.fonts.load(`500 30px ${C.body}`),
      document.fonts.load(`600 30px ${C.body}`),
    ]).catch(() => {});
    const W = 1080, H = 1350, P = 88;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const g = cv.getContext('2d');
    const text = (str, x, y, font, color, align = 'left') => { g.font = font; g.fillStyle = rgb(color); g.textAlign = align; g.fillText(str, x, y); };
    const box = (x, y, w, h, r) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); g.fill(); };

    g.fillStyle = rgb(C.paper);
    g.fillRect(0, 0, W, H);
    g.textBaseline = 'alphabetic';

    g.fillStyle = rgb(C.accent);
    [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]].forEach(([x, y]) => box(P + x * 14, 84 + y * 14, 12, 12, 2));
    text('Game of Life', P + 60, 124, `600 34px ${C.body}`, C.ink);
    text('My life budget', W - P, 124, `500 30px ${C.body}`, C.muted, 'right');

    let y = 228;
    const line = (label, value) => {
      text(label, P, y, `400 33px ${C.body}`, C.muted);
      text(value, W - P, y, `500 33px ${C.body}`, C.ink, 'right');
      y += 50;
    };
    line('Years ahead', one(YEARS));
    line('Asleep', years(B.h.sleep / M.YEAR_H));
    line('Working', years(B.h.work / M.YEAR_H));
    line('Commuting', years(B.h.commute / M.YEAR_H));
    line('Upkeep', years(B.h.admin / M.YEAR_H));

    const parts = [[B.h.sleep, C.sleep], [B.h.work, C.work], [B.h.commute, C.commute], [B.h.admin, C.admin], [B.h.free, C.yours]].filter(([h]) => h > 0);
    const room = W - 2 * P - 3 * (parts.length - 1), total = sum(parts.map(([h]) => h));
    let x = P;
    y -= 12;
    for (const [h, c] of parts) {
      const w = (room * h) / total;
      g.fillStyle = rgb(c);
      box(x, y, Math.max(2, w), 22, 4);
      x += w + 3;
    }

    y += 104;
    text('Time that is mine', P, y, `600 30px ${C.body}`, C.accentInk);
    y += 164;
    text(years(B.h.free / M.YEAR_H), P - 6, y, `400 190px ${C.display}`, C.accent);
    y += 88;
    text(`${int(B.h.free)} hours to spend as I choose`, P, y, `400 33px ${C.body}`, C.muted);

    y += 96;
    text('I’d spend them on', P, y, `600 28px ${C.body}`, C.ink);
    const picks = CATS.map((c, i) => [c.label, shown()[i]]).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]);
    const colW = (W - 2 * P - 56) / 2, rows = Math.ceil(picks.length / 2);
    picks.forEach(([label, share], i) => {
      const cx = P + (i >= rows ? colW + 56 : 0), cy = y + 54 + (i % rows) * 48;
      text(label, cx, cy, `400 29px ${C.body}`, C.ink);
      text(`${share}%`, cx + colW, cy, `500 29px ${C.body}`, C.muted, 'right');
    });

    g.fillStyle = rgb(C.rule);
    g.fillRect(P, H - 162, W - 2 * P, 2);
    text('How much of your life is actually yours?', P, H - 98, `400 46px ${C.display}`, C.ink);
    if (/^https?:$/.test(location.protocol)) text(`${location.host}${location.pathname}`.replace(/\/(index\.html)?$/, ''), P, H - 52, `400 26px ${C.body}`, C.muted);

    await new Promise(done => cv.toBlob(blob => {
      cardBlob = blob;
      if (cardUrl) URL.revokeObjectURL(cardUrl);
      cardUrl = URL.createObjectURL(blob);
      $('#card').src = cardUrl;
      done();
    }, 'image/png'));
  }

  async function freshCard() {
    if (cardDirty || !cardBlob) await drawCard();
    return cardBlob;
  }

  const status = msg => { $('#shareStatus').textContent = msg; };

  function buildShare() {
    $('#download').addEventListener('click', async () => {
      const blob = await freshCard();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'my-life-budget.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });

    const probe = typeof File === 'function' ? [new File([''], 'card.png', { type: 'image/png' })] : [];
    if (navigator.canShare && navigator.canShare({ files: probe })) {
      const button = $('#shareCard');
      button.hidden = false;
      button.addEventListener('click', async () => {
        const blob = await freshCard();
        const file = new File([blob], 'my-life-budget.png', { type: 'image/png' });
        navigator.share({ files: [file], title: 'My life budget', text: 'How much of your life is actually yours?' }).catch(() => {});
      });
    }

    $('#copyLink').addEventListener('click', () => {
      clearTimeout(hashTimer);
      hashNow();
      navigator.clipboard.writeText(location.href)
        .then(() => status('Link copied. It includes your answers.'))
        .catch(() => status('Couldn’t copy. The address bar has the same link.'));
    });

    new IntersectionObserver(([e]) => {
      shareVisible = e.isIntersecting;
      if (shareVisible && cardDirty) drawCard();
    }, { rootMargin: '300px 0px' }).observe($('#share'));
  }

  /* Everything together */

  function update() {
    compute();
    renderForm();
    renderStory();
    renderAlloc();
    renderFewer();
    renderChanges();
    refreshStage();
    scheduleCard();
    writeHash();
  }

  function init() {
    if (!readHash()) S.country = detectCountry();
    readColors();
    compute();
    buildForm();
    buildRoutine();
    buildAlloc();
    buildShare();
    update();
    observeSteps();
    wide.addEventListener('change', observeSteps);
    new IntersectionObserver(([e]) => { if (e.isIntersecting && !level) setLevel('life'); }, { threshold: 0.05 }).observe($('#story'));

    // In-page links scroll without touching the address, which holds the answers.
    document.addEventListener('click', e => {
      const a = e.target.closest('a[href^="#"]');
      const target = a && document.getElementById(a.getAttribute('href').slice(1));
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: reduced.matches ? 'auto' : 'smooth', block: 'start' });
    });

    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      readColors();
      if (level) stage.show(SCENES[level], false);
      R.forEach((_, i) => drawRow(i, false));
      scheduleCard();
    });

    let resizing = 0;
    addEventListener('resize', () => {
      cancelAnimationFrame(resizing);
      resizing = requestAnimationFrame(() => $$('.field').forEach(fit));
    });

    // Field widths and canvas labels are measured, so redo them once the web fonts arrive.
    Promise.all([`400 1em ${C.display}`, `400 1em ${C.body}`, `600 1em ${C.body}`].map(f => document.fonts.load(f)))
      .catch(() => {})
      .then(() => {
        $$('.field').forEach(fit);
        if (level) stage.show(SCENES[level], false);
      });
  }

  init();
})();
