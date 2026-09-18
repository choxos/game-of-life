/* Game of Life: the life budget model. Pure functions, no DOM; runs in the browser and in Node. */
(function (root) {
  const DAYS = 365.2425;          // days per year
  const WEEKS = DAYS / 7;         // 52.18 weeks per year
  const YEAR_H = DAYS * 24;       // hours per year
  const WEEK_H = 168;

  // Daily routine beyond sleep, work and commuting. "mine" means it counts as free time.
  const ROUTINE = [
    { id: 'eating', label: 'Eating', h: 1.5, mine: false },
    { id: 'hygiene', label: 'Getting ready', h: 0.75, mine: false },
    { id: 'chores', label: 'Chores and errands', h: 2, mine: false },
    { id: 'care', label: 'Caring for others', h: 0, mine: false },
    { id: 'exercise', label: 'Exercise', h: 0.5, mine: true },
    { id: 'phone', label: 'Phone and scrolling', h: 2, mine: true },
  ];

  const DEFAULTS = {
    age: 30, sex: 'b', country: 'WLD',
    sleep: 8, work: 8, days: 5, commute: 0.75, retire: 65, weeksOff: 4,
    routine: ROUTINE.map(r => r.h),
    mine: ROUTINE.map(r => r.mine),
  };

  // Where free time can go. Units convert hours into things; they are alternatives, not a to-do list.
  const CATEGORIES = [
    { id: 'people', label: 'Friends and family', share: 25, units: [
      { id: 'dinner', tab: 'Dinners', one: 'two-hour dinner', many: 'two-hour dinners', h: 2 },
      { id: 'evening', tab: 'Evenings', one: 'long evening together', many: 'long evenings together', h: 5 },
    ] },
    { id: 'outside', label: 'Travel and outdoors', share: 15, units: [
      { id: 'trip', tab: 'Trips', one: 'week-long trip', many: 'week-long trips', h: 56, note: 'Counts 8 free hours a day for 7 days.' },
      { id: 'walk', tab: 'Walks', one: 'two-hour walk', many: 'two-hour walks', h: 2 },
      { id: 'day', tab: 'Days out', one: 'full day outdoors', many: 'full days outdoors', h: 8 },
    ] },
    { id: 'reading', label: 'Reading', share: 10, units: [
      { id: 'book', tab: 'Books', one: 'book', many: 'books', h: null },
    ] },
    { id: 'learning', label: 'Learning', share: 10, units: [
      { id: 'language', tab: 'Languages', one: 'B2 language', many: 'B2 languages', h: 550, range: [500, 600],
        note: 'Cambridge English estimates about 500 to 600 guided hours from beginner to B2. A time equivalence, not a promise.' },
      { id: 'course', tab: 'Courses', one: 'university course', many: 'university courses', h: 135,
        note: 'A 3-credit course: about 45 hours in class and 90 hours of study.' },
    ] },
    { id: 'exercise', label: 'Exercise', share: 10, units: [
      { id: 'workout', tab: 'Workouts', one: 'one-hour workout', many: 'one-hour workouts', h: 1 },
      { id: 'run', tab: 'Runs', one: '5 km run', many: '5 km runs', h: 0.5 },
    ] },
    { id: 'screens', label: 'Movies, TV, games', share: 15, units: [
      { id: 'movie', tab: 'Movies', one: 'movie', many: 'movies', h: 2 },
      { id: 'season', tab: 'Seasons', one: 'TV season', many: 'TV seasons', h: 8, note: 'About 8 hours per season.' },
      { id: 'game', tab: 'Games', one: 'video game', many: 'video games', h: 25, note: 'About 25 hours to finish one.' },
    ] },
    { id: 'hobbies', label: 'Hobbies', share: 10, units: [
      { id: 'session', tab: 'Sessions', one: 'two-hour session', many: 'two-hour sessions', h: 2 },
      { id: 'project', tab: 'Projects', one: 'weekend project', many: 'weekend projects', h: 12, note: 'About 12 hours each.' },
    ] },
    { id: 'nothing', label: 'Doing nothing', share: 5, units: [
      { id: 'afternoon', tab: 'Afternoons', one: 'slow afternoon', many: 'slow afternoons', h: 4 },
      { id: 'nap', tab: 'Naps', one: 'twenty-minute nap', many: 'twenty-minute naps', h: 1 / 3 },
    ] },
    // Named by the user: label, unit and hours per unit live in the page state.
    { id: 'custom', label: 'Something else', share: 0, custom: true, units: [
      { id: 'custom', tab: 'Sessions', one: 'session', many: 'sessions', h: 2 },
    ] },
  ];

  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const sum = xs => xs.reduce((a, b) => a + b, 0);

  const placeOf = (tables, country) => tables.places[country] || tables.places.WLD;

  // Remaining life expectancy e(x): average years left for people who have reached this age.
  function remainingYears(tables, country, sex, age) {
    return placeOf(tables, country)[sex][clamp(Math.floor(age), 0, 100)];
  }

  // Years until the share still alive falls to `share`: linear within each year,
  // exponential past 100 with the open age group's mean.
  function yearsTo(S, share, openE) {
    for (let t = 0; t < S.length - 1; t++) {
      if (S[t + 1] <= share) return t + (S[t] - share) / (S[t] - S[t + 1]);
    }
    const last = S[S.length - 1];
    return S.length - 1 + (last > share ? openE * Math.log(last / share) : 0);
  }

  // Everything the page needs about one person's years ahead. Period mode holds 2026
  // death rates; cohort mode follows the UN projection. `scale` stretches the period
  // survival curve so its median matches the cohort median, for drawing and sharing.
  function lifeFacts(tables, country, sex, age, cohort) {
    const p = placeOf(tables, country), a = clamp(Math.floor(age), 0, 100);
    const l = p.l[sex], base = Math.max(l[a], 1e-6);
    const S = l.slice(a).map(v => v / base);
    const openE = p[sex][100];
    const median = yearsTo(S, 0.5, openE), q3 = yearsTo(S, 0.25, openE);
    if (!cohort) return { years: p[sex][a], median, q3, S, openE, scale: 1 };
    return { years: p.c[sex][a], median: p.cmed[sex][a], q3: p.cq3[sex][a], S, openE, scale: median > 0 ? p.cmed[sex][a] / median : 1 };
  }

  // Share still alive t years from now.
  function survivalAt(f, t) {
    const u = t / f.scale, i = Math.floor(u), S = f.S;
    if (i + 1 < S.length) return S[i] + (S[i + 1] - S[i]) * (u - i);
    return S[S.length - 1] * Math.exp(-(u - (S.length - 1)) / Math.max(f.openE, 0.5));
  }

  // Expected years two people are both alive, treating their chances as independent.
  function sharedYears(f1, f2) {
    let years = 0;
    for (let t = 0; t < 120; t++) {
      years += (survivalAt(f1, t) * survivalAt(f2, t) + survivalAt(f1, t + 1) * survivalAt(f2, t + 1)) / 2;
    }
    return years;
  }

  // Rough healthy years: WHO healthy share of remaining life, at birth and at 60, blended by age.
  function healthyYears(tables, country, sex, age, years) {
    const h = placeOf(tables, country).h;
    if (!h) return null;
    const [atBirth, at60] = h[sex];
    return years * (age >= 60 ? at60 : atBirth + ((at60 - atBirth) * age) / 60);
  }

  // Whole years between two dates, and whole days lived.
  function ageOn(dob, date) {
    let age = date.getFullYear() - dob.getFullYear();
    if (date.getMonth() < dob.getMonth() || (date.getMonth() === dob.getMonth() && date.getDate() < dob.getDate())) age--;
    return age;
  }
  const daysBetween = (a, b) => Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 864e5);

  function adminPerDay(inp) {
    return sum(inp.routine.filter((_, i) => !inp.mine[i]));
  }

  function budget(inp, years) {
    const workYears = clamp(inp.retire - inp.age, 0, years);
    const workDays = inp.days * Math.max(0, WEEKS - inp.weeksOff); // per year
    const admin = adminPerDay(inp);
    const open = Math.max(0, 24 - inp.sleep - admin);              // hours a day not slept or owed
    const job = (inp.work + inp.commute) * workDays;               // hours a year
    const h = {
      total: years * YEAR_H,
      sleep: inp.sleep * DAYS * years,
      work: inp.work * workDays * workYears,
      commute: inp.commute * workDays * workYears,
      admin: admin * DAYS * years,
    };
    h.waking = h.total - h.sleep;
    // Each phase is clamped on its own so an overbooked working life can't borrow from retirement.
    h.free = Math.max(0, open * DAYS - job) * workYears + open * DAYS * (years - workYears);
    return {
      years, workYears, admin, h,
      weekly: {
        now: workYears > 0 ? Math.max(0, open * 7 - job / WEEKS) : null,
        later: open * 7,
      },
      overbooked: inp.sleep + admin + inp.work + inp.commute > 24,
    };
  }

  // Integer counts proportional to weights that add up to total (largest remainder method).
  function apportion(weights, total) {
    const s = sum(weights);
    if (s <= 0 || total <= 0) return weights.map(() => 0);
    const raw = weights.map(w => (w / s) * total);
    const out = raw.map(Math.floor);
    const order = raw.map((r, i) => [r - out[i], i]).sort((a, b) => b[0] - a[0]);
    const left = total - sum(out);
    for (let k = 0; k < left; k++) out[order[k][1]]++;
    return out;
  }

  // One row per year ahead, 52 week cells each: [sleep, work, commute, admin, free].
  function yearRows(inp, b) {
    const workDays = inp.days * Math.max(0, WEEKS - inp.weeksOff);
    const rows = [];
    for (let y = 0; y < Math.ceil(b.years); y++) {
      const alive = Math.min(1, b.years - y);
      const working = clamp(b.workYears - y, 0, alive);
      const hours = [
        inp.sleep * DAYS * alive,
        inp.work * workDays * working,
        inp.commute * workDays * working,
        b.admin * DAYS * alive,
      ];
      hours.push(Math.max(0, YEAR_H * alive - sum(hours)));
      rows.push(apportion(hours, Math.round(52 * alive)));
    }
    return rows;
  }

  // Set one share and scale the others so the total stays 100.
  function rebalance(shares, i, v) {
    v = clamp(v, 0, 100);
    const rest = sum(shares) - shares[i];
    return shares.map((x, j) => (j === i ? v : rest > 0 ? (x * (100 - v)) / rest : (100 - v) / (shares.length - 1)));
  }

  function unitHours(unit, reading) {
    return unit.h === null ? reading.words / reading.wpm / 60 : unit.h;
  }

  // Small changes to a week, summed over the years they apply to.
  function changes(inp, b) {
    const workDays = inp.days * Math.max(0, WEEKS - inp.weeksOff);
    const out = [];
    const cut = Math.min(inp.commute, 0.5);
    if (cut > 0 && b.workYears > 0) out.push({ id: 'commute', cut, h: cut * workDays * b.workYears });
    if (inp.days > 0 && inp.work > 0 && b.workYears > 0) {
      out.push({ id: 'day', h: (inp.work + inp.commute) * Math.max(0, WEEKS - inp.weeksOff) * b.workYears });
    }
    const phone = Math.min(0.75, inp.routine[ROUTINE.findIndex(r => r.id === 'phone')] || 0);
    if (phone > 0) out.push({ id: 'scroll', cut: phone, h: phone * DAYS * b.years });
    if (inp.work > 0 && b.workYears > 0) out.push({ id: 'retire', h: (inp.work + inp.commute) * workDays * Math.min(2, b.workYears) });
    return out;
  }

  const Model = {
    DAYS, WEEKS, YEAR_H, WEEK_H, ROUTINE, DEFAULTS, CATEGORIES,
    clamp, remainingYears, yearsTo, lifeFacts, survivalAt, sharedYears, healthyYears, ageOn, daysBetween,
    budget, apportion, yearRows, rebalance, unitHours, changes,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Model;
  else root.Model = Model;
})(globalThis);
