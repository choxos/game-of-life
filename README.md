# Game of Life

How much of your life is actually yours?

A remaining life budget. Enter your age, country and a typical week. The page zooms out to the rest of your life in weeks, finds the hours that are yours once sleep, work, commuting and upkeep are paid for, and lets you decide what fills them: books, trips, dinners, languages, or doing nothing at all.

## Run it

No build step. Open `index.html`, or serve the folder:

```sh
python3 -m http.server 8000
```

Everything runs in the browser. Answers live in the page address, so a copied link restores them.

## How the numbers work

- **Years ahead** is remaining life expectancy, e(x), from the UN World Population Prospects 2024 complete life tables for 2026 (medium variant), by country, sex and single year of age. It is not life expectancy at birth minus age.
- **Time that is yours** is waking time, minus work and commuting until the age you stop working, minus daily upkeep (eating, getting ready, chores, caring for others) for the rest of your life. Anything moved to "Mine" counts as free time.
- **Conversions** are alternatives, not a to-do list: reading at 238 to 260 words a minute (Brysbaert, 2019), about 500 to 600 guided learning hours to B2 (Cambridge English), 8 free hours per travel day.

## Files

| Path | What it is |
| --- | --- |
| `index.html`, `styles.css` | The page |
| `js/model.js` | The budget math, no DOM |
| `js/cells.js` | The canvas week grid and its transitions |
| `js/app.js` | Page wiring, the zoom story, sliders, share card |
| `data/life-tables.js` | Generated life tables |
| `scripts/build_life_tables.py` | Regenerates the data: `python3 scripts/build_life_tables.py 2026` |
| `test/model.test.js` | Model check: `node test/model.test.js` |

## Data

UN DESA, Population Division (2024). World Population Prospects 2024. CC BY 3.0 IGO.
