/* Game of Life: one screen. Your week, the week grid and its zoom levels, the split, and the extras in dialogs. */
(() => {
  const M = window.Model;
  const T = window.LIFE_TABLES;
  const { createCells, pack } = window.Cells;
  const CATS = M.CATEGORIES;
  const CUSTOM = CATS.findIndex(c => c.custom);
  const PHONE = M.ROUTINE.findIndex(r => r.id === 'phone');
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const sum = xs => xs.reduce((a, b) => a + b, 0);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

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

  /* State, kept in the address and on this device */

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
  const clean = (s, max) => String(s || '').replace(/[~;]/g, ' ').trim().slice(0, max);

  const S = {
    ...M.DEFAULTS,
    routine: [...M.DEFAULTS.routine],
    mine: [...M.DEFAULTS.mine],
    shares: CATS.map(c => c.share),
    units: CATS.map(() => 0),
    wpm: 250,
    words: 80000,
    fq: [2, 12],
    focus: CATS.findIndex(c => c.id === 'reading'),
    cohort: false,
    dob: '',
    vs: 'JPN',
    custom: { label: 'Something else', unit: 'sessions', h: 2 },
    people: [],
  };

  // Lists from older links may be one item short; pad them with defaults.
  const fill = (list, n, pad) => (list.length === n - 1 ? [...list, pad] : list);

  function readHash(hash) {
    const q = new URLSearchParams(hash.replace(/^#/, ''));
    if (!q.has('age')) return false;
    const num = (key, lo, hi, fallback) => {
      const v = Number(q.get(key));
      return q.has(key) && q.get(key) !== '' && Number.isFinite(v) ? M.clamp(v, lo, hi) : fallback;
    };
    const list = (key, n, lo, hi, fallback, pad) => {
      const v = fill((q.get(key) || '').split(',').filter(x => x !== '').map(Number), n, pad);
      return v.length === n && v.every(Number.isFinite) ? v.map(x => M.clamp(x, lo, hi)) : fallback;
    };
    S.age = Math.round(num('age', 10, 100, S.age));
    if (['b', 'f', 'm'].includes(q.get('sex'))) S.sex = q.get('sex');
    if (Object.hasOwn(T.places, q.get('in') || '')) S.country = q.get('in');
    if (Object.hasOwn(T.places, q.get('vs') || '')) S.vs = q.get('vs');
    S.sleep = nearest(OPTIONS.sleep, num('sleep', 0, 24, S.sleep));
    S.work = nearest(OPTIONS.work, num('work', 0, 24, S.work));
    S.days = nearest(OPTIONS.days, num('days', 0, 7, S.days));
    S.commute = nearest(OPTIONS.commute, num('commute', 0, 24, S.commute));
    S.retire = Math.round(num('retire', 30, 100, S.retire));
    S.weeksOff = nearest(OPTIONS.weeksOff, num('off', 0, 52, S.weeksOff));
    S.routine = list('day', M.ROUTINE.length, 0, 8, S.routine, M.ROUTINE[PHONE].h).map(v => nearest(OPTIONS.routine, v));
    const mine = q.get('mine') || '';
    if (/^[01]+$/.test(mine)) {
      const flags = fill([...mine].map(c => c === '1'), M.ROUTINE.length, true);
      if (flags.length === M.ROUTINE.length) S.mine = flags;
    }
    const shares = list('split', CATS.length, 0, 100, null, 0);
    if (shares && sum(shares) > 0) S.shares = shares.map(x => (x / sum(shares)) * 100);
    S.units = list('as', CATS.length, 0, 9, S.units, 0).map((u, i) => (Number.isInteger(u) && u < CATS[i].units.length ? u : 0));
    S.focus = Math.round(num('focus', 0, CATS.length - 1, S.focus));
    S.wpm = Math.round(num('wpm', 150, 450, S.wpm));
    S.words = nearest(OPTIONS.words, num('words', 1, 1e6, S.words));
    const often = (q.get('often') || '').split(',').map(Number);
    if (often.length >= 2 && often.every(Number.isFinite)) S.fq = often.slice(-2).map(v => Math.round(M.clamp(v, 0, 365)));
    S.cohort = q.get('cohort') === '1';
    if (/^\d{4}-\d{2}-\d{2}$/.test(q.get('dob') || '')) S.dob = q.get('dob');
    const custom = (q.get('custom') || '').split('~');
    if (custom.length === 3 && Number(custom[2]) > 0) S.custom = { label: clean(custom[0], 24) || S.custom.label, unit: clean(custom[1], 24) || S.custom.unit, h: M.clamp(Number(custom[2]), 0.1, 10000) };
    S.people = (q.get('people') || '').split(';').filter(Boolean).slice(0, 3).map(p => {
      const [name, age, sex, visits] = p.split('~');
      return { name: clean(name, 20), age: Math.round(M.clamp(Number(age) || 0, 0, 100)), sex: ['b', 'f', 'm'].includes(sex) ? sex : 'b', visits: Math.round(M.clamp(Number(visits) || 0, 0, 365)) };
    });
    return true;
  }

  function hashNow() {
    const q = new URLSearchParams({
      age: S.age, sex: S.sex, in: S.country, sleep: S.sleep, work: S.work, days: S.days,
      commute: +S.commute.toFixed(3), retire: S.retire, off: S.weeksOff,
      day: S.routine.join(','), mine: S.mine.map(Number).join(''),
      split: S.shares.map(x => +x.toFixed(1)).join(','), as: S.units.join(','), focus: S.focus,
      wpm: S.wpm, words: S.words, often: S.fq.join(','), vs: S.vs,
    });
    if (S.cohort) q.set('cohort', '1');
    if (S.dob) q.set('dob', S.dob);
    q.set('custom', `${clean(S.custom.label, 24)}~${clean(S.custom.unit, 24)}~${S.custom.h}`);
    if (S.people.length) q.set('people', S.people.map(p => `${clean(p.name, 20)}~${p.age}~${p.sex}~${p.visits}`).join(';'));
    try {
      history.replaceState(null, '', `#${q}`);
      localStorage.setItem('game-of-life', `#${q}`);
    } catch { /* Safari rate-limits history and private windows block storage; the next change retries */ }
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
  const withThe = code => `${THE.test(NAMES[code]) ? 'the ' : ''}${NAMES[code]}`;
  const inPlace = code => (code === 'WLD' ? 'worldwide' : `in ${withThe(code)}`);
  const COUNTRIES = Object.keys(T.places).filter(k => k !== 'WLD').sort((a, b) => NAMES[a].localeCompare(NAMES[b], 'en'));

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

  /* Birthday */

  function birthday() {
    if (!S.dob) return null;
    const [y, m, d] = S.dob.split('-').map(Number), date = new Date(y, m - 1, d);
    const age = M.ageOn(date, new Date());
    return Number.isNaN(date.getTime()) || age < 10 || age > 100 ? null : date;
  }

  function livedWeeks() {
    const dob = birthday();
    if (!dob) return S.age * 52;
    const today = new Date(), last = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
    if (last > today) last.setFullYear(today.getFullYear() - 1);
    return S.age * 52 + Math.min(51, Math.floor(M.daysBetween(last, today) / 7));
  }

  function milestone() {
    const dob = birthday();
    if (!dob) return '';
    const lived = M.daysBetween(dob, new Date()), next = (Math.floor(lived / 5000) + 1) * 5000;
    const date = new Date(dob.getFullYear(), dob.getMonth(), dob.getDate() + next);
    return ` Your ${int(next)}th day is ${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.`;
  }

  /* The numbers */

  let F = null, YEARS = 0, B = null, ROWS = [], HEALTHY = null;
  function compute() {
    const dob = birthday();
    if (dob) S.age = M.ageOn(dob, new Date());
    F = M.lifeFacts(T, S.country, S.sex, S.age, S.cohort);
    YEARS = F.years;
    B = M.budget(S, YEARS);
    ROWS = M.yearRows(S, B);
    HEALTHY = M.healthyYears(T, S.country, S.sex, S.age, YEARS);
  }

  const labelOf = i => (i === CUSTOM ? S.custom.label : CATS[i].label);
  function unitOf(i) {
    if (i !== CUSTOM) return CATS[i].units[S.units[i]];
    const u = S.custom.unit;
    return { id: 'custom', tab: cap(u), one: u.replace(/s$/, ''), many: u, h: S.custom.h };
  }

  function unitInfo(i) {
    const unit = unitOf(i), share = S.shares[i] / 100, hours = B.h.free * share;
    return {
      unit, hours, n: hours / M.unitHours(unit, S),
      weekNow: B.weekly.now === null ? null : B.weekly.now * share,
      weekLater: B.weekly.later * share,
    };
  }

  const perSquare = (n, max) => { let k = 1; while (n / k > max) k *= 10; return k; };
  const shown = () => M.apportion(S.shares, 100);

  function weekly(info, short) {
    const now = info.weekNow === null ? info.weekLater : info.weekNow;
    const later = info.weekNow === null || B.workYears >= YEARS ? '' : `, ${qty(info.weekLater)} after ${S.retire}`;
    return `${qty(now)} h a week${info.weekNow === null || short ? '' : ' now'}${later}`;
  }

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
  const KIND_NAMES = ['asleep', 'of work', 'commuting', 'on upkeep', 'that are yours'];
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

  // How many years past now the faded tail runs: until almost nobody your age is still alive.
  function horizon() {
    let t = Math.ceil(YEARS);
    while (t < 100 - S.age + 10 && M.survivalAt(F, t) > 0.02) t++;
    return t;
  }

  function sceneLife(W, H) {
    const lived = livedWeeks(), ahead = weeksAhead(), tail = horizon();
    const rows = S.age + tail;
    const p = snap(Math.min((W - GUTTER) / 52, H / rows)), s = size(p);
    const ox = Math.round((W - GUTTER - 52 * p) / 2) + GUTTER, oy = Math.round((H - rows * p) / 2);
    const cells = [];
    for (let i = 0; i < lived; i++) {
      const y = Math.floor(i / 52);
      cells.push({ k: `l${i}`, x: ox + (i % 52) * p, y: oy + y * p, s, c: C.lived, d: (y / rows) * 500, group: y, info: { value: `Age ${y}`, label: 'Already lived' } });
    }
    const future = (tail * 52) - (lived - S.age * 52);
    for (let j = 0; j < future; j++) {
      const g = lived + j, y = Math.floor(g / 52), t = j / 52, alive = M.survivalAt(F, t);
      const cell = {
        x: ox + (g % 52) * p, y: oy + y * p, s, c: C.ahead, a: Math.max(0.06, alive), d: (y / rows) * 500,
        group: y, info: { value: pct(alive * 100), label: `of people your age are still alive at ${y}` },
      };
      cells.push(j < ahead.length ? { k: `a${j}`, ...cell } : { k: `x${j}`, ...cell });
    }
    const yOf = a => oy + a * p + p / 2;
    return { cells, labels: ageTicks(0, rows, yOf, ox - 8, [{ k: 'now', text: 'now', age: S.age, color: rgb(C.ink) }]) };
  }

  function sceneAhead(W, H) {
    const rows = ROWS.length;
    const p = snap(Math.min((W - GUTTER) / 52, H / rows)), s = size(p);
    const ox = Math.round((W - GUTTER - 52 * p) / 2) + GUTTER, oy = Math.round((H - rows * p) / 2);
    const cells = [];
    for (let i = 0; i < livedWeeks(); i++) {
      const y = Math.floor(i / 52) - S.age;
      cells.push({ k: `l${i}`, x: ox + (i % 52) * p, y: oy + y * p, s, c: C.lived, a: 0 });
    }
    const totals = kindHours().map(h => years(h / M.YEAR_H));
    weeksAhead().forEach((w, j) => {
      const alive = M.survivalAt(F, w.y);
      cells.push({
        k: `a${j}`, x: ox + w.col * p, y: oy + w.y * p, s, c: C[KINDS[w.kind]], a: 0.35 + 0.65 * alive,
        d: w.col * 5 + (w.y / rows) * 250, group: w.kind,
        info: { value: `${totals[w.kind]} ${KIND_NAMES[w.kind]}`, label: `At ${S.age + w.y}: ${ROWS[w.y][w.kind]} of that year’s ${sum(ROWS[w.y])} weeks` },
      });
    });
    const yOf = a => oy + (a - S.age) * p + p / 2;
    const marks = [{ k: 'now', text: 'now', age: S.age, color: rgb(C.ink) }];
    if (S.retire > S.age && S.retire < S.age + rows) marks.push({ k: 'retire', text: String(S.retire), age: S.retire, color: rgb(C.accentInk) });
    return { cells, labels: ageTicks(S.age, S.age + rows, yOf, ox - 8, marks) };
  }

  const freeWeeks = () => weeksAhead().map((w, j) => ({ ...w, j })).filter(w => w.kind === 4);
  const kindHours = () => [B.h.sleep, B.h.work, B.h.commute, B.h.admin, B.h.free];

  // The age by which a given share of your own time has been spent.
  function ageAtShare() {
    const free = ROWS.map(r => r[4]), total = Math.max(1, sum(free)), cum = [];
    free.reduce((acc, n, y) => (cum[y] = acc + n), 0);
    return share => {
      const y = cum.findIndex(c => c >= share * total);
      return S.age + (y < 0 ? free.length - 1 : y);
    };
  }

  function sceneYours(W, H) {
    const F2 = freeWeeks();
    const { cols, p: raw } = pack(F2.length, W, H, 28);
    const p = snap(raw), s = size(p), rows = Math.ceil(F2.length / cols);
    const ox = Math.round((W - cols * p) / 2), oy = Math.round((H - rows * p) / 2);
    const cells = F2.map((w, i) => ({
      k: `a${w.j}`, x: ox + (i % cols) * p, y: oy + Math.floor(i / cols) * p, s, c: C.yours,
      d: (i / F2.length) * 400, group: w.y,
      info: { value: `Week ${int(i + 1)} of ${int(F2.length)}`, label: `yours, around age ${S.age + w.y}` },
    }));
    return { cells, labels: [] };
  }

  function scenePlans(W, H) {
    const F2 = freeWeeks(), LABEL = 20, whole = shown();
    const groups = M.apportion(S.shares, F2.length).map((n, i) => ({ i, n })).filter(g => g.n > 0);
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
    const cells = [], labels = [];
    for (const g of groups) {
      const on = g.i === S.focus, split = unitInfo(g.i);
      const info = { value: `≈ ${amount(split.hours, split.unit)}`, label: `${labelOf(g.i)} · ${whole[g.i]}% · ${weekly(split, true)}. Click to zoom in.` };
      labels.push({ k: `g${g.i}`, text: `${labelOf(g.i)} · ${whole[g.i]}%`, x: ox, y: y + LABEL / 2, font: `${on ? 600 : 500} 12px ${C.body}`, color: rgb(on ? C.accentInk : C.muted) });
      y += LABEL;
      for (let m = 0; m < g.n; m++, k++) {
        cells.push({ k: `a${F2[k].j}`, x: ox + (m % cols) * p, y: y + Math.floor(m / cols) * p, s, c: on ? C.yours : C.yours2, d: (k / F2.length) * 350, cat: g.i, group: g.i, info });
      }
      y += Math.ceil(g.n / cols) * p;
    }
    return { cells, labels };
  }

  const STAGE_MAX = 3000;
  function sceneUnits(W, H) {
    const fi = S.focus, { unit, n } = unitInfo(fi);
    const k = perSquare(n, STAGE_MAX), m = Math.round(n / k);
    const parents = scenePlans(W, H).cells.filter(c => c.cat === fi);
    const { cols, p: raw } = pack(m, W, H, 26);
    const p = snap(raw), s = size(p), rows = Math.ceil(m / cols);
    const ox = Math.round((W - cols * p) / 2), oy = Math.round((H - rows * p) / 2);
    const cells = [], ageAt = ageAtShare();
    for (let u = 0; u < m; u++) {
      const par = parents[Math.floor((u * parents.length) / m)] || { x: W / 2, y: H / 2, s: 0 };
      cells.push({
        k: `u${u}`, x: ox + (u % cols) * p, y: oy + Math.floor(u / cols) * p, s, c: C.yours,
        d: (u / m) * 600, from: { x: par.x + par.s / 2, y: par.y + par.s / 2, s: 0 },
        info: {
          value: k === 1 ? `${cap(unit.one)} ${int(u + 1)} of ${int(m)}` : `${cap(unit.many)} ${int(u * k + 1)} to ${int((u + 1) * k)}`,
          label: `around age ${ageAt((u + 0.5) / m)}, at this pace`,
        },
      });
    }
    return { cells, labels: [] };
  }

  const LEVELS = ['life', 'ahead', 'yours', 'plans', 'units'];
  const SCENES = { life: sceneLife, ahead: sceneAhead, yours: sceneYours, plans: scenePlans, units: sceneUnits };
  const stage = createCells($('#stage'));
  let level = null, intro = 0;

  function stageLabel() {
    const weeks = [0, 0, 0, 0, 0];
    ROWS.forEach(r => r.forEach((n, k) => { weeks[k] += n; }));
    const info = unitInfo(S.focus);
    return {
      life: `${int(livedWeeks())} weeks lived and about ${int(sum(weeks))} ahead, one square per week, paler where fewer people your age are still alive.`,
      ahead: `Weeks ahead: ${int(weeks[0])} asleep, ${int(weeks[1])} working, ${int(weeks[2])} commuting, ${int(weeks[3])} on upkeep, ${int(weeks[4])} yours.`,
      yours: `${int(weeks[4])} weeks that are yours.`,
      plans: `Your weeks, split: ${CATS.map((c, i) => `${labelOf(i)} ${shown()[i]}%`).join(', ')}.`,
      units: `About ${amount(info.hours, info.unit)}, ${pace(info.n)}.`,
    }[level];
  }

  function setLevel(next) {
    if (next === level) return;
    level = next;
    for (const b of $$('.levels button')) b.setAttribute('aria-pressed', String(b.dataset.level === level));
    for (const c of $$('.caption')) c.hidden = c.dataset.level !== level;
    clearGrid();
    stage.show(SCENES[level], true);
    $('#stage').setAttribute('aria-label', stageLabel());
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

  /* Hover: one tooltip for the grid, the split bar, the legend and the band */

  const tooltip = $('#tooltip');
  function showTip(x, y, value, label) {
    tooltip.firstElementChild.textContent = value;
    tooltip.lastElementChild.textContent = label;
    tooltip.classList.add('is-on');
    const w = tooltip.offsetWidth, h = tooltip.offsetHeight;
    const left = x + 16 + w > innerWidth ? x - w - 12 : x + 16;
    const top = y + 16 + h > innerHeight ? y - h - 12 : y + 16;
    tooltip.style.transform = `translate(${Math.max(4, left)}px, ${Math.max(4, top)}px)`;
  }
  const hideTip = () => tooltip.classList.remove('is-on');

  const canvas = $('#stage');
  const cellAt = e => { const r = canvas.getBoundingClientRect(); return stage.hit(e.clientX - r.left, e.clientY - r.top); };
  function clearGrid() {
    stage.setHover(null);
    hideTip();
    canvas.style.cursor = '';
    lightRow(-1);
  }
  function hoverGrid(e) {
    const cell = cellAt(e);
    if (!cell || !cell.info) return clearGrid();
    stage.setHover({ group: cell.group, key: cell.k, stroke: rgb(C.ink) });
    showTip(e.clientX, e.clientY, cell.info.value, cell.info.label);
    canvas.style.cursor = level === 'plans' ? 'pointer' : 'default';
    lightRow(level === 'plans' ? cell.group : -1);
  }
  canvas.addEventListener('pointermove', hoverGrid);
  canvas.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') hoverGrid(e); });
  canvas.addEventListener('pointerleave', clearGrid);
  canvas.addEventListener('click', e => {
    const cell = level === 'plans' && cellAt(e);
    if (cell && cell.group !== undefined) { clearGrid(); focusRow(cell.group); }
  });

  // Rows, bar segments and plan groups light up together.
  function lightRow(i) {
    R.forEach((r, j) => {
      r.li.classList.toggle('is-hover', j === i);
      r.span.classList.toggle('is-hover', j === i);
    });
  }

  function buildHover() {
    for (const row of $$('.legend [data-kind]')) {
      const kind = row.dataset.kind;
      row.addEventListener('pointermove', e => {
        if (kind === 'all') {
          showTip(e.clientX, e.clientY, `${int(YEARS * M.YEAR_H)} hours`, `ahead, on average. Half of people your age live past ${int(S.age + F.median)}, a quarter past ${int(S.age + F.q3)}.`);
          return;
        }
        const h = kindHours()[kind];
        showTip(e.clientX, e.clientY, `${int(h)} hours`, `${pct((h / B.h.total) * 100)} of the time you have left`);
        if (level === 'ahead') stage.setHover({ group: Number(kind) });
      });
      row.addEventListener('pointerleave', () => { hideTip(); if (level === 'ahead') stage.setHover(null); });
    }

    const HINTS = {
      weekends: () => ['52 a year', `for the ${one(YEARS)} years you likely have`],
      summers: () => ['One a year', `for the ${one(YEARS)} years you likely have`],
      moons: () => ['About 12.4 a year', `for the ${one(YEARS)} years you likely have`],
      sunsets: () => ['One a day', `for the ${one(YEARS)} years you likely have`],
    };
    for (const [key, hint] of Object.entries(HINTS)) {
      const tile = $(`[data-k="${key}"]`).parentElement;
      tile.addEventListener('pointermove', e => showTip(e.clientX, e.clientY, ...hint()));
      tile.addEventListener('pointerleave', hideTip);
    }
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

  function renderNumbers() {
    const Y = h => years(h / M.YEAR_H);
    tween($('#figure'), B.h.free);
    set('freeYears', one(B.h.free / M.YEAR_H));
    set('freePct', pct((B.h.free / B.h.total) * 100));
    set('years', `${one(YEARS)} years`);
    set('ySleep', Y(B.h.sleep));
    set('yWork', Y(B.h.work));
    set('yCommute', Y(B.h.commute));
    set('yAdmin', Y(B.h.admin));
    set('yFree', Y(B.h.free));
    set('freeHours', int(B.h.free));
  }

  function renderCaptions() {
    const healthy = HEALTHY === null ? '' : ` About ${int(HEALTHY)} of them in good health, roughly.`;
    set('capLife', `Each square is a week, and the faded ones are behind you. ${cap(who())} can expect about ${one(YEARS)} more years${S.cohort ? ' if death rates keep falling' : ''}.${healthy}${milestone()}`);
    set('capOdds', `Paler squares are less likely: half of people your age live past ${int(S.age + F.median)}, a quarter past ${int(S.age + F.q3)}.`);
    const other = M.lifeFacts(T, S.vs, S.sex, S.age, S.cohort).years, diff = other - YEARS;
    set('compareYears', `${years(other)}${S.vs === S.country ? '' : ` (${diff >= 0 ? '+' : ''}${one(diff)})`}`);
    const widens = B.workYears > 0 && B.workYears < YEARS ? `, and it widens once you stop working at ${S.retire}` : '';
    set('capAhead', `Each row is a year from now. Gray goes to sleep, work, commuting and upkeep; orange is yours${widens}. Later rows fade with the odds of living them.`);
    set('capWeekly', B.weekly.now === null
      ? `About ${int(B.weekly.later)} hours a week are yours.`
      : `Right now about ${int(B.weekly.now)} hours a week are yours. After ${S.retire}, about ${int(B.weekly.later)}.`);
    set('capYours', `Only your weeks remain: ${int(B.h.free)} hours, about ${one(B.h.free / M.YEAR_H)} full years to spend as you choose.`);
    const phone = S.routine[PHONE];
    set('capPhone', phone > 0
      ? `At ${duration(phone)} a day on your phone, that’s about ${one((phone * M.DAYS * YEARS) / M.YEAR_H)} full years${S.mine[PHONE] ? ' of this time' : ''}. Fine-tune your day to change it.`
      : '');
    set('capPlans', 'The same weeks, split the way your sliders say. Pick a row to zoom into it.');
    const info = unitInfo(S.focus), k = perSquare(info.n, STAGE_MAX), unit = info.unit;
    const each = k === 1 ? `${/^[aeiou]/i.test(unit.one) ? 'an' : 'a'} ${unit.one}` : `${int(k)} ${unit.many}`;
    const reading = CATS[S.focus].id === 'reading' ? ` at ${S.wpm} words a minute` : '';
    set('capUnits', info.n < 1
      ? `${labelOf(S.focus)} has no time yet. Drag its slider to give it some, and every square here becomes ${each}.`
      : `Every square is now ${each}: about ${amount(info.hours, unit)}${reading}, ${pace(info.n)}. That’s ${weekly(info)}.${unit.note ? ` ${unit.note}` : ''}`);
    set('unitTab', unit.tab);
  }

  /* The answer form */

  const measure = document.createElement('canvas').getContext('2d');
  function fit(el) {
    const cs = getComputedStyle(el);
    measure.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const text = el.tagName === 'SELECT' ? el.options[el.selectedIndex]?.text || '' : el.value || el.placeholder || '0';
    const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    el.style.width = `${Math.ceil(measure.measureText(text).width + pad + 2)}px`;
  }
  const fitAll = () => $$('.field:not([type="date"]):not(.field--text)').forEach(fit);

  const options = (select, values, label) => select.replaceChildren(...values.map(v => new Option(label(v), String(v))));
  const plural = (n, word) => `${n} ${n === 1 ? word : `${word}s`}`;
  const countryOptions = select => select.replaceChildren(new Option('the world', 'WLD'), ...COUNTRIES.map(k => new Option(withThe(k), k)));

  function buildForm() {
    countryOptions($('#country'));
    countryOptions($('#compare'));
    options($('#sleep'), OPTIONS.sleep, h => duration(h));
    options($('#work'), OPTIONS.work, h => (h === 0 ? '0 hours' : duration(h)));
    options($('#days'), OPTIONS.days, d => plural(d, 'day'));
    options($('#commute'), OPTIONS.commute, h => duration(h));
    options($('#weeksOff'), OPTIONS.weeksOff, w => plural(w, 'week'));

    const selects = { sex: 'sex', country: 'country', compare: 'vs', sleep: 'sleep', work: 'work', days: 'days', commute: 'commute', weeksOff: 'weeksOff' };
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
      const el = $(`#fq${i + 1}`);
      el.value = String(f);
      el.addEventListener('input', () => {
        const v = Number(el.value);
        if (Number.isInteger(v) && v >= 0 && v <= 365) { S.fq[i] = v; renderBand(); writeHash(); }
      });
      el.addEventListener('change', () => { el.value = String(S.fq[i]); });
    });

    const dob = $('#dob');
    const today = new Date();
    dob.max = `${today.getFullYear() - 10}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    dob.value = S.dob;
    dob.addEventListener('change', () => {
      S.dob = dob.value;
      const ok = !S.dob || birthday();
      dob.setCustomValidity(ok ? '' : 'Pick a birthday between 10 and 100 years ago.');
      if (!ok) { dob.reportValidity(); S.dob = ''; }
      update();
    });

    const cohort = $('#cohort');
    cohort.checked = S.cohort;
    cohort.addEventListener('change', () => { S.cohort = cohort.checked; update(); });
  }

  const ARROW = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const chips = [];

  function buildRoutine() {
    M.ROUTINE.forEach((item, i) => {
      const li = document.createElement('li');
      li.className = 'chip';
      li.innerHTML = `<span class="chip__name">${item.label}</span><select class="field" aria-label="${item.label}, hours a day"></select><button class="chip__move" type="button">${ARROW}</button>`;
      const select = $('select', li);
      options(select, OPTIONS.routine, h => duration(h, true));
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
    const age = $('#age'), dob = birthday();
    age.readOnly = !!dob;
    age.title = dob ? 'From your birthday. Clear it in Fine-tune my day to type an age.' : '';
    if (dob) age.value = String(S.age);
    fitAll();
  }

  /* The split */

  const R = [];

  function buildAlloc() {
    const list = $('#alloc'), bar = $('#bar');
    CATS.forEach((cat, i) => {
      const li = document.createElement('li');
      li.className = 'row';
      li.innerHTML = `
        <button class="row__name" type="button"></button>
        <input class="row__range" type="range" min="0" max="100" step="1">
        <output class="row__pct"></output>
        <span class="row__buys"></span>`;
      list.append(li);
      const span = document.createElement('span');
      bar.append(span);
      const r = { li, span, name: $('.row__name', li), range: $('.row__range', li), pct: $('.row__pct', li), buys: $('.row__buys', li) };
      R.push(r);

      r.range.addEventListener('input', () => {
        S.shares = M.rebalance(S.shares, i, Number(r.range.value));
        bar.classList.add('is-dragging');
        sharesChanged();
      });
      r.range.addEventListener('change', () => bar.classList.remove('is-dragging'));
      li.addEventListener('click', e => { if (!e.target.closest('input')) focusRow(i); });
      const emphasize = on => { lightRow(on ? i : -1); if (level === 'plans') stage.setHover(on ? { group: i } : null); };
      li.addEventListener('pointerenter', () => emphasize(true));
      li.addEventListener('pointerleave', () => emphasize(false));
      span.addEventListener('pointermove', e => {
        const info = unitInfo(i);
        showTip(e.clientX, e.clientY, `≈ ${amount(info.hours, info.unit)}`, `${labelOf(i)} · ${shown()[i]}% · ${int(info.hours)} hours`);
        emphasize(true);
      });
      span.addEventListener('pointerleave', () => { hideTip(); emphasize(false); });
      span.addEventListener('click', () => focusRow(i));
    });

    $('#resetShares').addEventListener('click', () => {
      S.shares = CATS.map(c => c.share);
      sharesChanged();
    });
  }

  function focusRow(i) {
    const changed = S.focus !== i;
    S.focus = i;
    renderAlloc();
    renderFocus();
    renderCaptions();
    if (level === 'units' && changed) stage.show(SCENES.units, true);
    else setLevel('units');
    stopIntro();
    writeHash();
  }

  function renderAlloc() {
    const whole = shown();
    CATS.forEach((cat, i) => {
      const r = R[i], share = S.shares[i], info = unitInfo(i);
      r.li.classList.toggle('is-focus', i === S.focus);
      r.span.classList.toggle('is-on', i === S.focus);
      r.name.textContent = labelOf(i);
      r.range.value = String(whole[i]);
      r.range.style.setProperty('--p', share);
      r.range.setAttribute('aria-label', `${labelOf(i)}, share of your free time`);
      r.range.setAttribute('aria-valuetext', `${whole[i]}%, ${int(info.hours)} hours`);
      r.pct.textContent = `${whole[i]}%`;
      r.buys.innerHTML = '';
      if (whole[i] === 0) r.buys.textContent = i === CUSTOM ? 'Your own category: select it to name it, then drag' : 'Drag to give it some time';
      else {
        const b = document.createElement('b');
        b.textContent = `≈ ${amount(info.hours, info.unit)}`;
        r.buys.append(b, ` · ${weekly(info, true)}`);
      }
      r.span.style.setProperty('--g', share);
    });
  }

  // Unit choices, reading speed, or the custom row's name, for the row in focus.
  function renderFocus() {
    const box = $('#focus'), i = S.focus, cat = CATS[i];
    box.replaceChildren();
    if (cat.units.length > 1) {
      const group = document.createElement('div');
      group.className = 'units';
      group.setAttribute('role', 'radiogroup');
      group.setAttribute('aria-label', `Count ${labelOf(i).toLowerCase()} as`);
      cat.units.forEach((u, k) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'unit';
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(k === S.units[i]));
        b.textContent = u.many;
        b.addEventListener('click', () => {
          S.units[i] = k;
          renderFocus();
          sharesChanged();
        });
        group.append(b);
      });
      box.append(group);
    }
    if (cat.id === 'reading') {
      box.insertAdjacentHTML('beforeend', `
        <label for="wpm">Speed</label><input id="wpm" type="range" min="150" max="450" step="10"><b id="wpmOut"></b>
        <label for="words">Book</label><select class="field field--sm" id="words">
          <option value="50000">short, 50,000 words</option>
          <option value="80000">average, 80,000 words</option>
          <option value="120000">long, 120,000 words</option>
        </select>`);
      const wpm = $('#wpm'), words = $('#words');
      const show = () => { wpm.style.setProperty('--p', ((S.wpm - 150) / 300) * 100); $('#wpmOut').textContent = `${S.wpm} wpm`; };
      wpm.value = String(S.wpm);
      words.value = String(S.words);
      show();
      fit(words);
      wpm.addEventListener('input', () => { S.wpm = Number(wpm.value); show(); sharesChanged(); renderBand(); });
      words.addEventListener('change', () => { S.words = Number(words.value); fit(words); sharesChanged(); renderBand(); });
    }
    if (cat.custom) {
      box.insertAdjacentHTML('beforeend', `
        <label for="customLabel">Call it</label><input class="field field--sm field--text" id="customLabel" maxlength="24">
        <label for="customUnit">counted in</label><input class="field field--sm field--text" id="customUnit" maxlength="24">
        <label for="customHours">of</label><input class="field field--sm" id="customHours" type="number" min="0.1" max="10000" step="0.5"> hours each`);
      const label = $('#customLabel'), unit = $('#customUnit'), hours = $('#customHours');
      label.value = S.custom.label;
      unit.value = S.custom.unit;
      hours.value = String(S.custom.h);
      fit(hours);
      label.addEventListener('input', () => { S.custom.label = clean(label.value, 24) || 'Something else'; sharesChanged(); });
      unit.addEventListener('input', () => { S.custom.unit = clean(unit.value, 24) || 'sessions'; sharesChanged(); });
      hours.addEventListener('input', () => {
        const v = Number(hours.value);
        fit(hours);
        if (v > 0 && v <= 10000) { S.custom.h = v; sharesChanged(); }
      });
    }
  }

  function sharesChanged() {
    renderAlloc();
    renderCaptions();
    if (level === 'plans' || level === 'units') refreshStage();
    writeHash();
  }

  /* People who matter */

  function renderPeople() {
    const list = $('#peopleList');
    list.replaceChildren(...S.people.map((person, i) => {
      const li = document.createElement('li');
      li.className = 'person';
      li.innerHTML = `
        <p class="person__line">
          <input class="field field--sm field--text" data-f="name" maxlength="20" placeholder="Name" aria-label="Name">,
          <input class="field field--sm" data-f="age" type="number" min="0" max="100" aria-label="Their age"> years old,
          <select class="field field--sm" data-f="sex" aria-label="Their sex, optional"><option value="b">person</option><option value="f">woman</option><option value="m">man</option></select>,
          seen <input class="field field--sm" data-f="visits" type="number" min="0" max="365" aria-label="Visits a year"> times a year
        </p>
        <p class="person__out"></p>
        <button class="link" type="button" data-remove>Remove</button>`;
      for (const el of $$('[data-f]', li)) {
        el.value = String(person[el.dataset.f]);
        el.addEventListener('input', () => {
          const f = el.dataset.f;
          if (f === 'name') person.name = clean(el.value, 20);
          else if (f === 'sex') person.sex = el.value;
          else {
            const v = Number(el.value);
            if (!Number.isInteger(v) || v < 0 || v > (f === 'age' ? 100 : 365)) return;
            person[f] = v;
          }
          if (el.tagName !== 'INPUT' || el.type !== 'text') fit(el);
          renderPerson(li, person);
          renderBand();
          writeHash();
        });
      }
      $('[data-remove]', li).addEventListener('click', () => {
        S.people.splice(i, 1);
        renderPeople();
        renderBand();
        writeHash();
      });
      renderPerson(li, person);
      return li;
    }));
    $$('.field:not(.field--text)', list).forEach(fit);
    $('#addPerson').hidden = S.people.length >= 3;
  }

  function together(person) {
    return M.sharedYears(F, M.lifeFacts(T, S.country, person.sex, person.age, S.cohort));
  }

  function renderPerson(li, person) {
    const shared = together(person), out = $('.person__out', li);
    const kid = person.age < 18 ? ` <b>${plural(18 - person.age, 'year')}</b> until they turn 18.` : '';
    out.innerHTML = `About <b>${years(shared)}</b> together, so about <b>${int(shared * person.visits)} visits</b> at your pace.${kid}`;
  }

  /* The band: counts, pace, one small change */

  const TITLES = {
    commute: c => `Commute ${duration(c.cut)} less each workday`,
    day: () => (S.days === 5 ? 'Work four days a week instead of five' : 'Work one day less each week'),
    scroll: c => `Spend ${duration(c.cut)} less a day on your phone`,
    retire: () => 'Stop working two years sooner',
  };
  let changeId = 'commute';

  function renderBand() {
    set('weekends', int(YEARS * M.WEEKS));
    set('summers', int(YEARS));
    set('moons', int(YEARS * 12.3685));
    set('sunsets', int(YEARS * M.DAYS));
    set('fq1', int(YEARS * S.fq[0]));
    set('fq2', int(YEARS * S.fq[1]));

    const line = $('#peopleLine');
    line.replaceChildren();
    if (S.people.length) {
      const who = document.createElement('span');
      who.className = 'pace__who';
      who.textContent = S.people.map(p => `${p.name || 'Someone'}: about ${int(together(p) * p.visits)} visits`).join(' · ');
      who.title = who.textContent;
      line.append(who);
    }
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'link';
    open.dataset.open = 'people';
    open.textContent = S.people.length ? 'Edit' : 'Add the people who matter';
    line.append(open);

    const list = M.changes(S, B), pick = $('#changePick');
    if (!list.some(c => c.id === changeId)) changeId = list[0].id;
    pick.replaceChildren(...list.map(c => new Option(TITLES[c.id](c), c.id)));
    pick.value = changeId;
    const c = list.find(x => x.id === changeId);
    const book = CATS.find(x => x.id === 'reading').units[0], language = CATS.find(x => x.id === 'learning').units[0];
    $('#changeResult').textContent = `+${int(c.h)} hours${c.id === 'scroll' ? '' : `, ${pct((c.h / Math.max(1, B.h.free)) * 100)} more time that’s yours`}. Enough for ${amount(c.h, book)}, or ${int(c.h / 2)} movies, or ${amount(c.h, language)}.`;
    fit(pick);
  }

  /* How it works: the numbers as tables */

  function renderTables() {
    const row = (cells, head) => `<tr>${cells.map((c, i) => (head || i === 0 ? `<th scope="${head ? 'col' : 'row'}">${c}</th>` : `<td>${c}</td>`)).join('')}</tr>`;
    const parts = [['Sleep', B.h.sleep], ['Work', B.h.work], ['Commuting', B.h.commute], ['Upkeep', B.h.admin], ['Yours', B.h.free]];
    $('#breakdown').innerHTML = `<caption>Your years ahead</caption><thead>${row(['', 'Years', 'Weeks', 'Hours'], true)}</thead><tbody>${
      parts.map(([label, h]) => row([label, one(h / M.YEAR_H), int(h / M.WEEK_H), int(h)])).join('')}${
      row(['All', one(YEARS), int((YEARS * M.YEAR_H) / M.WEEK_H), int(YEARS * M.YEAR_H)])}</tbody>`;
    const whole = shown();
    $('#splitTable').innerHTML = `<caption>Your split</caption><thead>${row(['', 'Share', 'Hours', 'A week now', 'Could be'], true)}</thead><tbody>${
      CATS.map((c, i) => {
        const info = unitInfo(i);
        return row([labelOf(i), `${whole[i]}%`, int(info.hours), qty(info.weekNow ?? info.weekLater), amount(info.hours, info.unit)]);
      }).join('')}</tbody>`;
  }

  /* Share images */

  let imageKind = 'card', image = null, imageUrl = '', imageDirty = true;
  const share = $('#share');

  function cardData() {
    const whole = shown();
    return {
      C, body: C.body, display: C.display, int, one, fmtYears: years, yearH: M.YEAR_H,
      yearsAhead: YEARS, free: B.h.free, rows: ROWS, age: S.age, lived: S.age * 52, who: cap(who()),
      kinds: KINDS.map(k => C[k]),
      parts: [['Asleep', B.h.sleep, C.sleep], ['Working', B.h.work, C.work], ['Commuting', B.h.commute, C.commute], ['Upkeep', B.h.admin, C.admin]],
      picks: CATS.map((c, i) => [labelOf(i), whole[i]]).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]),
      site: /^https?:$/.test(location.protocol) ? `${location.host}${location.pathname}`.replace(/\/(index\.html)?$/, '') : '',
    };
  }

  async function freshImage() {
    if (imageDirty || !image) {
      imageDirty = false;
      await Promise.all([`400 100px ${C.display}`, `500 30px ${C.body}`, `600 30px ${C.body}`].map(f => document.fonts.load(f))).catch(() => {});
      const cv = window.Card[imageKind](cardData());
      image = await new Promise(done => cv.toBlob(done, 'image/png'));
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      imageUrl = URL.createObjectURL(image);
      const img = $('#shareImage');
      img.src = imageUrl;
      img.alt = imageKind === 'card' ? 'Your life budget card' : 'Your life in weeks poster';
    }
    return image;
  }

  const status = msg => { $('#shareStatus').textContent = msg; };
  const fileName = () => (imageKind === 'card' ? 'my-life-budget.png' : 'my-life-in-weeks.png');

  function buildShare() {
    for (const b of $$('.share__pick button')) {
      b.addEventListener('click', () => {
        imageKind = b.dataset.image;
        for (const o of $$('.share__pick button')) o.setAttribute('aria-pressed', String(o === b));
        imageDirty = true;
        freshImage();
      });
    }
    $('#download').addEventListener('click', async () => {
      const blob = await freshImage();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName();
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
    const probe = typeof File === 'function' ? [new File([''], 'card.png', { type: 'image/png' })] : [];
    if (navigator.canShare && navigator.canShare({ files: probe })) {
      const button = $('#shareFile');
      button.hidden = false;
      button.addEventListener('click', async () => {
        const blob = await freshImage();
        const file = new File([blob], fileName(), { type: 'image/png' });
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
  }

  /* Dialogs */

  function buildDialogs() {
    document.addEventListener('click', e => {
      const opener = e.target.closest('[data-open]');
      if (opener) {
        const dialog = $(`#${opener.dataset.open}`);
        if (dialog.id === 'method') renderTables();
        hideTip();
        dialog.showModal();
        fitAll();
        if (dialog.id === 'share') { imageDirty = true; freshImage(); }
        return;
      }
      if (e.target.closest('[data-close]')) e.target.closest('dialog').close();
      else if (e.target.tagName === 'DIALOG') e.target.close();
    });
    $('#addPerson').addEventListener('click', () => {
      S.people.push({ name: '', age: 60, sex: 'b', visits: 4 });
      renderPeople();
      renderBand();
      writeHash();
      $('#peopleList li:last-child input').focus();
    });
  }

  /* Levels */

  function stopIntro() { clearTimeout(intro); intro = 0; }

  function buildLevels() {
    for (const b of $$('.levels button')) b.addEventListener('click', () => { stopIntro(); setLevel(b.dataset.level); });
    document.addEventListener('keydown', e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (document.querySelector('dialog[open]') || e.target.closest('input, select, textarea')) return;
      stopIntro();
      const i = LEVELS.indexOf(level) + (e.key === 'ArrowRight' ? 1 : -1);
      if (i >= 0 && i < LEVELS.length) setLevel(LEVELS[i]);
    });
  }

  /* Everything together */

  function update() {
    compute();
    renderForm();
    renderNumbers();
    renderCaptions();
    renderAlloc();
    renderBand();
    if ($('#people').open) $$('#peopleList .person').forEach((li, i) => renderPerson(li, S.people[i]));
    refreshStage();
    imageDirty = true;
    writeHash();
  }

  function init() {
    let restored = readHash(location.hash);
    if (!restored) {
      try {
        const saved = localStorage.getItem('game-of-life');
        if (saved) restored = readHash(saved);
      } catch { /* storage blocked; start fresh */ }
    }
    if (!restored) S.country = detectCountry();
    if (S.vs === S.country) S.vs = S.country === 'JPN' ? 'CAN' : 'JPN';
    readColors();
    compute();
    buildForm();
    buildRoutine();
    buildAlloc();
    buildShare();
    buildDialogs();
    buildLevels();
    buildHover();
    renderPeople();
    renderFocus();
    update();
    setLevel('life');
    if (!reduced.matches) intro = setTimeout(() => { intro = 0; setLevel('ahead'); }, 1800);

    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      readColors();
      if (level) stage.show(SCENES[level], false);
      imageDirty = true;
    });

    // A pasted link in the same tab only changes the hash; start over from it.
    addEventListener('hashchange', () => location.reload());

    let resizing = 0;
    addEventListener('resize', () => {
      cancelAnimationFrame(resizing);
      resizing = requestAnimationFrame(fitAll);
    });

    // Field widths and canvas labels are measured, so redo them once the web fonts arrive.
    Promise.all([`400 1em ${C.display}`, `400 1em ${C.body}`, `600 1em ${C.body}`].map(f => document.fonts.load(f)))
      .catch(() => {})
      .then(() => {
        fitAll();
        if (level) stage.show(SCENES[level], false);
      });
  }

  init();
})();
