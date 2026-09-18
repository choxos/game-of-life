// Run with: node test/model.test.js
const assert = require('node:assert/strict');
const M = require('../js/model.js');
globalThis.window = globalThis;
require('../data/life-tables.js');

const near = (actual, expected, tol, msg) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg}: ${actual} not within ${tol} of ${expected}`);

// The worked example from the brief: 47.3 years left, 8 h sleep, 8 h work, about 4.2 h of upkeep a day.
const example = {
  ...M.DEFAULTS, age: 34, retire: 65, sleep: 8, work: 8, days: 5, commute: 1.25,
  weeksOff: M.WEEKS - 49.5, routine: [4.18, 0, 0, 0, 0, 0], mine: [false, false, false, false, true, true],
};
const b = M.budget(example, 47.3);
near(b.h.waking, 276000, 1500, 'waking hours');
near(b.h.work, 61400, 700, 'work hours');
near(b.h.commute, 9600, 100, 'commute hours');
near(b.h.admin, 72300, 700, 'upkeep hours');
near(b.h.free, 132700, 132700 * 0.02, 'free hours');
near(b.h.free, b.h.waking - b.h.work - b.h.commute - b.h.admin, 1e-6, 'free is what is left');

// Past retirement age: no work, no commute.
const retired = M.budget({ ...M.DEFAULTS, age: 70, retire: 65 }, 16);
assert.equal(retired.h.work, 0);
assert.equal(retired.h.commute, 0);
assert.equal(retired.weekly.now, null);

// Moving a routine item to "mine" gives its hours back.
const moved = M.budget({ ...example, mine: [true, false, false, false, true, true] }, 47.3);
near(moved.h.free - b.h.free, 4.18 * M.DAYS * 47.3, 1e-6, 'moving upkeep to mine');

// Week rows: 52 cells per full year, and the free cells match the free hours.
const rows = M.yearRows(example, b);
assert.equal(rows.length, 48);
assert.ok(rows.slice(0, -1).every(r => r.reduce((a, c) => a + c, 0) === 52));
near(rows.reduce((a, r) => a + r[4], 0), b.h.free / M.WEEK_H, 25, 'free week cells');

// Largest remainder keeps the total.
assert.deepEqual(M.apportion([1, 1, 1], 10).reduce((a, c) => a + c, 0), 10);
assert.deepEqual(M.apportion([0, 0], 5), [0, 0]);

// Rebalancing keeps 100 and handles an all-zero remainder.
const shares = M.rebalance(M.CATEGORIES.map(c => c.share), 2, 40);
near(shares.reduce((a, c) => a + c, 0), 100, 1e-9, 'shares sum');
assert.equal(shares[2], 40);
const spread = M.rebalance([100, 0, 0, 0], 0, 40);
assert.deepEqual(spread, [40, 20, 20, 20]);

// Reading: 80,000 words at 250 wpm is about 5.3 hours a book.
near(M.unitHours({ h: null }, { words: 80000, wpm: 250 }), 5.333, 0.001, 'hours per book');

// Changes: 30 fewer commuting minutes on 5 days a week, 48.18 weeks a year, 31 years.
const commute = M.changes(example, b).find(c => c.id === 'commute');
near(commute.h, 0.5 * 5 * 49.5 * 31, 1e-6, 'commute change');

// Life tables: remaining life expectancy, not life expectancy at birth minus age.
assert.equal(M.remainingYears(window.LIFE_TABLES, 'CAN', 'b', 34), 50.1);
assert.ok(M.remainingYears(window.LIFE_TABLES, 'NGA', 'b', 34) > window.LIFE_TABLES.places.NGA.b[0] - 34);
assert.equal(M.remainingYears(window.LIFE_TABLES, 'NOPE', 'b', 200), window.LIFE_TABLES.places.WLD.b[100]);

// Survival: the curve integrates back to e(x), the median sits above the mean, cohort adds years.
const T = window.LIFE_TABLES;
const can = M.lifeFacts(T, 'CAN', 'b', 34, false);
let area = 0;
for (let t = 0; t < 130; t++) area += (M.survivalAt(can, t) + M.survivalAt(can, t + 1)) / 2;
near(area, can.years, 0.3, 'survival area');
assert.ok(can.median > can.years && can.q3 > can.median);
const jpn = M.lifeFacts(T, 'JPN', 'b', 30, true);
assert.ok(jpn.years > M.lifeFacts(T, 'JPN', 'b', 30, false).years + 3, 'cohort adds years in Japan');
assert.equal(T.places.CAN.c.b[100], T.places.CAN.b[100]);

// Shared years with a parent: positive and below either person's own expectation.
const mom = M.lifeFacts(T, 'CAN', 'f', 62, false);
const shared = M.sharedYears(can, mom);
assert.ok(shared > 0 && shared < Math.min(can.years, mom.years));

// Healthy years are a share of the years ahead; places without WHO data return null.
const healthy = M.healthyYears(T, 'CAN', 'b', 34, can.years);
assert.ok(healthy > 0.6 * can.years && healthy < can.years);
assert.equal(M.healthyYears({ places: { WLD: {} } }, 'WLD', 'b', 34, 50), null);

// Dates: whole years and days.
assert.equal(M.ageOn(new Date(1990, 5, 15), new Date(2026, 5, 14)), 35);
assert.equal(M.ageOn(new Date(1990, 5, 15), new Date(2026, 5, 15)), 36);
assert.equal(M.daysBetween(new Date(2026, 0, 1), new Date(2026, 11, 31)), 364);

// The phone what-if cuts at most 45 minutes of phone time.
const scroll = M.changes({ ...example, routine: [4.18, 0, 0, 0, 0, 0.5] }, b).find(c => c.id === 'scroll');
near(scroll.h, 0.5 * M.DAYS * 47.3, 1e-6, 'phone change');
assert.equal(M.changes(example, b).find(c => c.id === 'scroll'), undefined);

// Quartiles bracket the median, and a day adds up to 24 hours.
assert.ok(can.q1 < can.median && can.median < can.q3);
const day = M.dayParts(example, b);
near(day.workday.reduce((a, c) => a + c, 0), 24, 1e-9, 'workday hours');
near(day.off[4], 24 - 8 - 4.18, 1e-9, 'day off is yours after sleep and upkeep');
assert.equal(M.dayParts({ ...example, sleep: 12, work: 12, commute: 2 }, b).workday[4], 0);

console.log('model ok');
