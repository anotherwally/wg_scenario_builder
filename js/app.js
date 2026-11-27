// Scenario Selector: a static app for Bolt Action / Konflikt '47 battle scenarios.
// There's no build step. Everything renders from data/*.json into #view.

import { loadState, saveState, newGame } from './state.js';
import { esc, richText } from './text.js';
import { renderMap } from './diagram.js';

const els = {
  view: document.getElementById('view'),
  systemSwitch: document.getElementById('system-switch'),
  notice: document.getElementById('notice'),
  toast: document.getElementById('toast'),
  tabs: [...document.querySelectorAll('.tabbar [data-view]')],
  themeColor: document.querySelector('meta[name="theme-color"]'),
};

const app = {
  systems: [],
  cache: new Map(),
  data: null,
  state: loadState(),
  rolls: {}, // last die result per category (only for this visit)
  open: new Set(), // open <details> keys, kept across re-renders
};

const VIEWS = ['scenario', 'battle', 'rules'];
const icon = (name, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

init();

/* ------------------------------------------------------------------ */
/* Boot & data                                                         */
/* ------------------------------------------------------------------ */

async function init() {
  bindEvents();
  try {
    const index = await fetchJSON('data/systems.json');
    app.systems = index.systems ?? [];
    if (!app.systems.length) throw new Error('data/systems.json lists no game systems.');
    if (!VIEWS.includes(app.state.view)) app.state.view = 'scenario';
    await switchSystem(app.state.system);
  } catch (err) {
    console.error(err);
    showFatal(err);
  }
  registerServiceWorker();
}

async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Couldn't load ${url} (HTTP ${res.status}).`);
  return res.json();
}

async function switchSystem(id) {
  const entry = app.systems.find((s) => s.id === id) ?? app.systems[0];
  if (!app.cache.has(entry.id)) app.cache.set(entry.id, await fetchJSON(entry.file));
  app.data = app.cache.get(entry.id);
  app.state.system = entry.id;
  app.rolls = {};
  cleanPicks();
  document.documentElement.dataset.system = entry.id;
  save();
  render();
  syncThemeColor();
}

// Drop saved picks that no longer exist in the data file.
function cleanPicks() {
  const picks = currentPicks();
  for (const [catId, optId] of Object.entries(picks)) {
    if (!category(catId)?.options.some((o) => o.id === optId)) delete picks[catId];
  }
}

function showFatal(err) {
  const local = location.protocol === 'file:';
  els.view.innerHTML = `<article class="card">
    <h2>Couldn't load the scenario data</h2>
    <p>${esc(err.message)}</p>
    ${local ? '<p>Browsers block loading data files from <code>file://</code> pages. Start a local web server instead (see README.md).</p>' : ''}
  </article>`;
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker not registered:', e));
  }
}

/* ------------------------------------------------------------------ */
/* State helpers                                                       */
/* ------------------------------------------------------------------ */

function save() { saveState(app.state); }

function currentPicks() {
  const picks = app.state.picks;
  return (picks[app.state.system] ??= {});
}

function category(id) { return app.data?.categories.find((c) => c.id === id); }

function picked(catId) {
  const id = currentPicks()[catId];
  return category(catId)?.options.find((o) => o.id === id) ?? null;
}

function pickedOptions() {
  return app.data.categories.map((c) => picked(c.id)).filter(Boolean);
}

function playerNames() { return app.state.game.players.map((p) => p.name); }

function turnLimits() {
  const base = app.data.game?.turns ?? 6;
  const ext = app.data.game?.extraTurn ?? null;
  return { base, ext, max: base + (ext ? ext.turns ?? 1 : 0) };
}

// Settings that live on the chosen victory conditions (or any picked option).
function pickedSetting(key, fallback) {
  const found = pickedOptions().find((o) => o[key] !== undefined);
  return found ? found[key] : fallback;
}
const winMargin = () => pickedSetting('winMargin', 1);
const scoreUnit = () => pickedSetting('scoreUnit', 'VP');
const killVP = () => pickedSetting('killVP', 0); // VP each kill is worth (Seek and Destroy: 1)

// The optional kills tie-breaker, unless the chosen scenario turns it off
// (Seek and Destroy already scores kills, so a tie-break would just repeat it).
function tiebreakRule() {
  const tb = app.data.game?.tiebreak;
  return tb && pickedSetting('tiebreak', true) !== false ? tb : null;
}

// The picked option in another category that rules this option out (via "excludes"), if any.
function blockedBy(opt, catId) {
  for (const c of app.data.categories) {
    if (c.id === catId) continue;
    const other = picked(c.id);
    if (other?.excludes?.includes(opt.id)) return other;
  }
  return null;
}

function pageRef(item) {
  return item?.page ? `<span class="page">p. ${esc(item.page)}</span>` : '';
}

function rollDie(sides) {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] % sides) + 1;
}

function rollLabel(roll) {
  if (!Array.isArray(roll) || !roll.length) return '';
  const sorted = [...roll].sort((a, b) => a - b);
  const contiguous = sorted.every((n, i) => i === 0 || n === sorted[i - 1] + 1);
  if (sorted.length === 1) return String(sorted[0]);
  return contiguous ? `${sorted[0]}–${sorted.at(-1)}` : sorted.join(',');
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

function render() {
  if (!app.data) return;
  renderSystemSwitch();
  renderNotice();
  renderTabs();
  const v = app.state.view;
  els.view.innerHTML = v === 'battle' ? battleView() : v === 'rules' ? rulesView() : scenarioView();
}

function renderSystemSwitch() {
  els.systemSwitch.innerHTML = app.systems.map((s) => `
    <button type="button" data-action="system" data-id="${esc(s.id)}" aria-pressed="${s.id === app.state.system}">
      <span class="long">${esc(s.name)}</span><span class="short">${esc(s.shortName ?? s.name)}</span>
    </button>`).join('');
}

function renderNotice() {
  const d = app.data;
  const show = d.status !== 'verified' && d.statusNote && !app.state.dismissed[d.id];
  els.notice.hidden = !show;
  els.notice.innerHTML = show
    ? `<div class="notice-inner">${icon('info')}<p>${esc(d.statusNote)}</p>
         <button type="button" class="icon-btn" data-action="dismiss-notice" aria-label="Dismiss notice">${icon('close')}</button></div>`
    : '';
}

function renderTabs() {
  for (const t of els.tabs) {
    if (t.dataset.view === app.state.view) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
  }
}

function syncThemeColor() {
  const bar = getComputedStyle(document.documentElement).getPropertyValue('--bar').trim();
  if (bar && els.themeColor) els.themeColor.content = bar;
}

function mapHtml() {
  const opts = pickedOptions();
  const zone = opts.find((o) => o.diagram);
  return renderMap({
    table: app.data.table,
    diagram: zone?.diagram,
    markers: opts.flatMap((o) => o.markers ?? []),
    names: playerNames(),
    emptyText: 'Choose deployment zones',
  });
}

function fullRules(key, full, label = 'Full rules') {
  if (!full) return '';
  return `<details class="full" data-key="${esc(key)}" ${app.open.has(key) ? 'open' : ''}>
    <summary>${icon('book')} ${esc(label)} ${icon('chevron', 'icon chev')}</summary>
    <div class="rich">${richText(full)}</div>
  </details>`;
}

/* ---------- Scenario view ---------- */

function scenarioView() {
  const d = app.data;
  return `<section class="stack">
    <article class="card mission">
      <header class="card-head">
        <div>
          <p class="eyebrow">${esc(d.name)} · ${esc(d.edition ?? '')}</p>
          <h2>Battle scenario</h2>
        </div>
        <button type="button" class="btn primary small" data-action="roll-all">${icon('dice')} Roll all</button>
      </header>
      ${mapHtml()}
      <ul class="picks">
        ${d.categories.map((c) => {
          const o = picked(c.id);
          const blocker = o && blockedBy(o, c.id);
          return `<li><button type="button" data-action="jump" data-target="cat-${esc(c.id)}" class="${blocker ? 'conflict' : ''}">
            <span class="k">${icon(c.icon)} ${esc(c.shortName ?? c.name)}</span>
            <span class="v">${o ? esc(o.name) : '<em>Not chosen</em>'}</span>
          </button></li>`;
        }).join('')}
      </ul>
      <div class="mission-actions">
        <button type="button" class="btn" data-action="view" data-view="rules">${icon('book')} Rules</button>
        <button type="button" class="btn primary" data-action="view" data-view="battle">${icon('flag')} Battle</button>
      </div>
    </article>
    ${d.categories.map(categoryCard).join('')}
  </section>`;
}

function categoryCard(c) {
  const sel = picked(c.id);
  const rolled = app.rolls[c.id];
  const die = c.die ?? 6;
  return `<article class="card" id="cat-${esc(c.id)}">
    <header class="card-head">
      <h2>${icon(c.icon)} ${esc(c.name)}</h2>
      <button type="button" class="btn small" data-action="roll" data-cat="${esc(c.id)}" aria-label="Roll a D${die} for ${esc(c.name)}">${icon('dice')} D${die}</button>
    </header>
    <div class="chips" role="group" aria-label="${esc(c.name)}">
      ${c.options.map((o) => `<button type="button" class="chip" aria-pressed="${sel?.id === o.id}" data-action="pick" data-cat="${esc(c.id)}" data-opt="${esc(o.id)}">
        ${o.roll ? `<span class="roll" aria-label="Roll ${esc(rollLabel(o.roll))}">${esc(rollLabel(o.roll))}</span>` : ''}${esc(o.name)}
      </button>`).join('')}
    </div>
    ${sel ? `<div class="detail">
      ${rolled ? `<p class="rolled">${icon('dice')} Rolled a ${rolled}</p>` : ''}
      ${conflictNote(sel, c)}
      <h3>${esc(sel.name)} ${pageRef(sel)}</h3>
      <p class="summary">${esc(sel.summary)}</p>
      ${fullRules(`${c.id}:${sel.id}`, sel.full)}
    </div>` : `<div class="detail"><p class="empty">${esc(c.prompt ?? 'Pick an option or roll the dice.')}</p></div>`}
  </article>`;
}

function conflictNote(opt, c) {
  const blocker = blockedBy(opt, c.id);
  if (!blocker) return '';
  return `<p class="warn">${icon('info')} <span>${esc(blocker.name)} doesn't allow ${esc(opt.name)}. Roll the ${esc((c.shortName ?? c.name).toLowerCase())} again or pick another.</span></p>`;
}

/* ---------- Battle view ---------- */

function battleView() {
  const d = app.data;
  return `<section class="stack">
    <div class="mission-strip">
      ${d.categories.map((c) => {
        const o = picked(c.id);
        return `<button type="button" class="pill ${o ? '' : 'unset'}" data-action="view" data-view="${o ? 'rules' : 'scenario'}" aria-label="${esc(c.name)}: ${o ? esc(o.name) : 'not chosen'}">
          ${icon(c.icon)}<span>${o ? esc(o.name) : `No ${esc((c.shortName ?? c.name).toLowerCase())}`}</span></button>`;
      }).join('')}
    </div>
    ${turnCard()}
    <div class="players">${app.state.game.players.map(playerCard).join('')}</div>
    <p class="standing">${standingHtml()}</p>
    ${logCard()}
    <button type="button" class="btn block danger" data-action="new-game">${icon('reset')} New game</button>
  </section>`;
}

function turnCard() {
  const g = app.state.game;
  const { base, ext, max } = turnLimits();
  const extraOk = ext && g.extraRoll != null && g.extraRoll >= ext.on;
  let panel = '';

  if (g.over) {
    const tb = tiebreakText();
    panel = `<div class="turn-panel over">
      <p><strong>Battle over.</strong> ${esc(resultText())}</p>
      ${tb ? `<p class="tb">${icon('crosshair')} ${esc(tb)}</p>` : ''}
      <div class="row">
        <button type="button" class="btn small" data-action="new-game">${icon('reset')} New game</button>
        <button type="button" class="btn small" data-action="resume">Resume</button>
      </div></div>`;
  } else if (g.turn === base && ext && !extraOk) {
    panel = `<div class="turn-panel">
      <p>${esc(ext.summary)}</p>
      <div class="row">
        <button type="button" class="btn small primary" data-action="extra-roll">${icon('dice')} Roll D${ext.die ?? 6}</button>
        <button type="button" class="btn small" data-action="end">${icon('flag')} End battle</button>
      </div></div>`;
  } else if (g.turn === base && extraOk) {
    panel = `<div class="turn-panel">
      <p>Rolled a <strong>${g.extraRoll}</strong>, so turn ${base + 1} will be played. Tap + when you get there.</p></div>`;
  } else if (g.turn >= max) {
    panel = `<div class="turn-panel">
      <p>Final turn. Add up victory points when it ends.</p>
      <div class="row"><button type="button" class="btn small primary" data-action="end">${icon('flag')} End battle</button></div></div>`;
  }

  const ofText = g.turn > base ? 'extra turn' : `of ${base}`;
  return `<article class="card turn">
    <div class="turn-row">
      <button type="button" class="round-btn" data-action="turn" data-d="-1" aria-label="Previous turn" ${g.turn <= 1 ? 'disabled' : ''}>${icon('minus')}</button>
      <div class="turn-num" aria-live="polite"><span class="label">Turn</span><span class="num">${g.turn}</span><span class="of">${ofText}</span></div>
      <button type="button" class="round-btn" data-action="turn" data-d="1" aria-label="Next turn" ${g.turn >= max || g.over ? 'disabled' : ''}>${icon('plus')}</button>
    </div>
    ${panel}
  </article>`;
}

function scoringEvents() {
  const seen = new Set();
  return pickedOptions().flatMap((o) => o.scoring ?? []).filter((s) => {
    const key = `${s.label}|${s.points}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function playerCard(p, i) {
  const quick = scoringEvents();
  const unit = scoreUnit();
  const n = i + 1;
  return `<article class="card player p${n}">
    <label class="sr-only" for="pname${i}">Player ${n} name</label>
    <input id="pname${i}" class="name" data-player="${i}" value="${esc(p.name)}" maxlength="24" autocomplete="off" autocapitalize="words" enterkeyhint="done" spellcheck="false">
    <div class="vp" aria-live="polite"><span class="num">${p.vp}</span><span class="unit">${esc(unit)}</span></div>
    <div class="vp-btns">
      <button type="button" class="btn" data-action="score" data-p="${i}" data-d="-1" aria-label="Remove 1 ${esc(unit)} from ${esc(p.name)}">${icon('minus')}</button>
      <button type="button" class="btn" data-action="score" data-p="${i}" data-d="1" aria-label="Add 1 ${esc(unit)} to ${esc(p.name)}">${icon('plus')}</button>
    </div>
    ${killsRow(p, i)}
    ${quick.length ? `<div class="quick">${quick.map((s) => `
      <button type="button" class="${s.endsGame ? 'ends' : ''}" data-action="score" data-p="${i}" data-d="${+s.points}" data-label="${esc(s.label)}" ${s.endsGame ? 'data-ends="1"' : ''}>
        ${s.endsGame ? icon('trophy') : `<b>${s.points > 0 ? '+' : ''}${+s.points}</b>`}<span>${esc(s.label)}</span>
      </button>`).join('')}</div>` : ''}
  </article>`;
}

// Enemy units destroyed: counted for the tie-breaker, and worth VP in scenarios with "killVP".
function killsRow(p, i) {
  const per = killVP();
  if (!app.data.game?.tiebreak && !per) return '';
  const kills = p.kills ?? 0;
  return `<div class="kills">
    <div class="k-head">
      <span class="k-label">${icon('crosshair')} Kills</span>
      ${per ? `<small>+${per} ${esc(scoreUnit())} each</small>` : '<small>tie-break</small>'}
    </div>
    <div class="k-ctrl">
      <button type="button" class="k-btn" data-action="kill" data-p="${i}" data-d="-1" aria-label="Remove a kill from ${esc(p.name)}" ${kills ? '' : 'disabled'}>${icon('minus')}</button>
      <span class="k-num" aria-live="polite">${kills}</span>
      <button type="button" class="k-btn" data-action="kill" data-p="${i}" data-d="1" aria-label="${esc(p.name)} destroyed an enemy unit">${icon('plus')}</button>
    </div>
  </div>`;
}

// The main result of the battle, and whether it counts as a draw.
function outcome() {
  const g = app.state.game;
  const [a, b] = g.players;

  // A game-ending event (briefcase off the table, base destroyed) decides the
  // battle outright. If both sides did it in the same turn, it's a draw.
  if (g.endedBy) {
    const enders = new Set(g.log.filter((e) => e.ends && e.turn === g.turn).map((e) => e.p));
    if (enders.size > 1) return { draw: true, text: 'Draw: both sides did it in the same turn.' };
    const reason = g.endedBy.label.replace(/\s*\(wins\)\s*$/i, '').toLowerCase();
    return { draw: false, text: `${g.players[g.endedBy.p].name} wins (${reason}).` };
  }

  const margin = winMargin();
  const diff = Math.abs(a.vp - b.vp);
  if (diff === 0) return { draw: true, text: `Draw at ${a.vp}–${b.vp}.` };
  const [w, l] = a.vp > b.vp ? [a, b] : [b, a];
  if (diff < margin) return { draw: true, text: `Draw: ${w.name} is only ${diff} ahead and needs ${margin} to win.` };
  return { draw: false, text: `${w.name} wins ${w.vp}–${l.vp}.` };
}

function resultText() { return outcome().text; }

// Optional rulebook tie-breaker for drawn games: score them as Seek and Destroy.
function tiebreakText() {
  const tb = tiebreakRule();
  if (!tb || !outcome().draw) return '';
  const [a, b] = app.state.game.players;
  const ka = a.kills ?? 0;
  const kb = b.kills ?? 0;
  if (Math.abs(ka - kb) >= (tb.margin ?? 2)) {
    const [w, hi, lo] = ka > kb ? [a, ka, kb] : [b, kb, ka];
    return `Tie-break: ${w.name} takes a winning draw on kills (${hi}–${lo}).`;
  }
  return `Tie-break on kills (${ka}–${kb}): still a draw.`;
}

function standingHtml() {
  const g = app.state.game;
  const [a, b] = g.players;
  if (g.over) {
    const tb = tiebreakText();
    return `${icon('trophy')} <span>${esc(resultText())}</span>${tb ? `<small class="tb">${esc(tb)}</small>` : ''}`;
  }
  if (a.vp === b.vp) return `All square at ${a.vp} ${esc(scoreUnit())}`;
  const margin = winMargin();
  const [lead, diff] = a.vp > b.vp ? [a, a.vp - b.vp] : [b, b.vp - a.vp];
  return diff < margin
    ? `${esc(lead.name)} leads by ${diff} <small>(needs ${margin} to win)</small>`
    : `${esc(lead.name)} leads by ${diff}`;
}

function logCard() {
  const { log, players } = app.state.game;
  const shown = log.slice(0, 25);
  return `<article class="card log">
    <header class="card-head">
      <h2>${icon('clock')} Battle log</h2>
      <button type="button" class="btn small" data-action="undo" ${log.length ? '' : 'disabled'}>${icon('undo')} Undo</button>
    </header>
    ${log.length ? `<ol>${shown.map((e) => `<li>
        <span class="t">T${e.turn}</span>
        <span class="who p${e.p + 1}">${esc(players[e.p]?.name ?? `Player ${e.p + 1}`)}</span>
        <span class="what">${esc(e.label)}</span>
        <span class="d">${logDelta(e, true)}</span>
      </li>`).join('')}</ol>${log.length > shown.length ? `<p class="more">${log.length - shown.length} older entries hidden.</p>` : ''}`
      : '<p class="empty">Score changes will show up here.</p>'}
  </article>`;
}

// "+3", "+1 kill" or "+1 +1 kill" for a log entry (score change, then kills change).
function logDelta(e, html = false) {
  const signed = (n) => `${n > 0 ? '+' : ''}${n}`;
  const parts = [];
  if (e.d) parts.push(signed(e.d));
  if (e.k) {
    const kills = `${signed(e.k)} kill${Math.abs(e.k) === 1 ? '' : 's'}`;
    parts.push(html ? `<small>${kills}</small>` : kills);
  }
  return parts.join(' ') || '0';
}

/* ---------- Rules view ---------- */

function rulesView() {
  const d = app.data;
  const full = app.state.rulesMode === 'full';
  return `<section class="stack">
    <div class="rules-head">
      <div><p class="eyebrow">${esc(d.name)} · ${esc(d.edition ?? '')}</p><h2>Rules reference</h2></div>
      <div class="seg" role="group" aria-label="Detail level">
        <button type="button" data-action="rules-mode" data-mode="summary" aria-pressed="${!full}">Summary</button>
        <button type="button" data-action="rules-mode" data-mode="full" aria-pressed="${full}">Full</button>
      </div>
    </div>
    <h3 class="section-title">This battle</h3>
    ${d.categories.map((c) => ruleCard(picked(c.id), full, { kicker: c.name, icon: c.icon, map: true })).join('')}
    ${d.general?.length ? `<h3 class="section-title">General rules</h3>
      ${d.general.map((g) => ruleCard(g, full, { icon: g.icon ?? 'book' })).join('')}` : ''}
    <p class="disclaimer">${d.source?.book ? `Rules paraphrased from the ${esc(d.source.book)}; page numbers refer to that book. ` : ''}Unofficial fan-made tool, not affiliated with Warlord Games.</p>
  </section>`;
}

function ruleCard(item, full, { kicker, icon: ic, map } = {}) {
  const eyebrow = kicker ? `<p class="eyebrow">${icon(ic)} ${esc(kicker)}</p>` : '';
  if (!item) {
    return `<article class="card rule">${eyebrow}
      <p class="empty">Not chosen yet. <button type="button" class="link" data-action="view" data-view="scenario">Choose one</button></p></article>`;
  }
  const heading = kicker ? esc(item.name) : `${icon(ic)} ${esc(item.name)}`;
  return `<article class="card rule">${eyebrow}
    <h3 class="${kicker ? '' : 'with-icon'}">${heading} ${pageRef(item)}</h3>
    ${map && item.diagram ? mapHtml() : ''}
    ${full ? `<div class="rich">${richText(item.full ?? item.summary)}</div>` : `<p class="summary">${esc(item.summary)}</p>`}
  </article>`;
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

let toastTimer;
function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2600);
}

// Short haptic tick on phones that support it (only after a real tap).
function buzz() {
  if (navigator.userActivation?.hasBeenActive === false) return;
  navigator.vibrate?.(12);
}

function setView(view) {
  if (!VIEWS.includes(view)) return;
  app.state.view = view;
  save();
  render();
  window.scrollTo({ top: 0 });
}

// Roll on a category's table. Options without a "roll" (e.g. Grand Tactical) are
// only chosen by agreement. If another pick rules the result out (Breakthrough
// forbids Fog of War), re-roll, as the rulebook says.
function rollCategory(catId) {
  const c = category(catId);
  const byTable = c.options.some((o) => o.roll?.length);
  const sides = byTable ? c.die ?? 6 : c.options.length;
  const skipped = [];
  let n;
  let opt;
  for (let tries = 0; tries < 30; tries++) {
    n = rollDie(sides);
    opt = byTable ? c.options.find((o) => o.roll?.includes(n)) : c.options[n - 1];
    const blocker = opt && blockedBy(opt, catId);
    if (!blocker) break;
    skipped.push({ n, opt, blocker });
  }
  if (opt) currentPicks()[catId] = opt.id;
  app.rolls[catId] = n;
  return { c, n, opt, skipped };
}

function rollMessage({ n, opt, skipped }) {
  const result = opt ? `${n}: ${opt.name}` : `${n}, but no option matches that roll`;
  if (!skipped.length) return `Rolled a ${result}`;
  const first = skipped[0];
  return `Rolled ${first.n} (${first.opt.name} isn't allowed with ${first.blocker.name}). Re-rolled ${result}`;
}

function score(p, d, label, ends) {
  const g = app.state.game;
  const player = g.players[p];
  const next = Math.max(0, player.vp + d);
  const delta = next - player.vp;
  if (!delta) return;
  player.vp = next;
  const entry = { p, d: delta, label: label || (delta > 0 ? 'Points added' : 'Points removed'), turn: g.turn };
  if (ends && delta > 0) {
    entry.ends = true;
    g.endedBy ??= { p, label: entry.label };
    g.over = true;
  }
  g.log.unshift(entry);
  if (g.log.length > 200) g.log.length = 200;
  buzz();
  save();
  render();
  if (entry.ends) toast(`Battle over: ${resultText()}`);
}

// Record an enemy unit destroyed (or remove one). In scenarios where kills
// score VP (Seek and Destroy, Grand Tactical) the VP follow automatically.
function addKill(p, dk) {
  const g = app.state.game;
  const player = g.players[p];
  const before = player.kills ?? 0;
  const after = Math.max(0, before + dk);
  const k = after - before;
  if (!k) return;
  player.kills = after;
  let d = 0;
  const per = killVP();
  if (per) {
    const vp = Math.max(0, player.vp + k * per);
    d = vp - player.vp;
    player.vp = vp;
  }
  g.log.unshift({ p, d, k, label: k > 0 ? 'Enemy unit destroyed' : 'Kill removed', turn: g.turn });
  if (g.log.length > 200) g.log.length = 200;
  buzz();
  save();
  render();
}

const actions = {
  system: ({ id }) => switchSystem(id),

  view: ({ view }) => setView(view),

  jump: ({ target }) => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),

  pick: ({ cat, opt }) => {
    currentPicks()[cat] = opt;
    delete app.rolls[cat];
    save();
    render();
  },

  roll: ({ cat }) => {
    const result = rollCategory(cat);
    buzz();
    save();
    render();
    toast(rollMessage(result));
  },

  'roll-all': () => {
    // In rulebook order (victory, zones, type), so later rolls respect earlier picks.
    const results = app.data.categories.map((c) => rollCategory(c.id));
    const rerolled = results.flatMap((r) => r.skipped.map((s) => s.opt.name));
    buzz();
    save();
    render();
    toast(`Rolled ${results.map((r) => r.n).join(' · ')}${rerolled.length ? ` (re-rolled ${rerolled[0]})` : ''}`);
  },

  turn: ({ d }) => {
    const g = app.state.game;
    const { base, max } = turnLimits();
    const next = Math.min(max, Math.max(1, g.turn + Number(d)));
    if (next === g.turn) return;
    g.turn = next;
    if (next < base) { g.extraRoll = null; g.over = false; }
    save();
    render();
  },

  'extra-roll': () => {
    const g = app.state.game;
    const { base, ext } = turnLimits();
    const n = rollDie(ext.die ?? 6);
    g.extraRoll = n;
    if (n >= ext.on) {
      toast(`Rolled a ${n}: play turn ${base + 1}`);
    } else {
      g.over = true;
      toast(`Rolled a ${n}: the battle ends`);
    }
    buzz();
    save();
    render();
  },

  end: () => {
    app.state.game.over = true;
    save();
    render();
  },

  resume: () => {
    const g = app.state.game;
    const { ext } = turnLimits();
    g.over = false;
    g.endedBy = null;
    if (ext && g.extraRoll != null && g.extraRoll < ext.on) g.extraRoll = null;
    save();
    render();
  },

  score: ({ p, d, label, ends }) => score(Number(p), Number(d), label, ends === '1'),

  kill: ({ p, d }) => addKill(Number(p), Number(d)),

  undo: () => {
    const g = app.state.game;
    const e = g.log.shift();
    if (!e) return;
    const player = g.players[e.p];
    player.vp = Math.max(0, player.vp - (e.d ?? 0));
    if (e.k) player.kills = Math.max(0, (player.kills ?? 0) - e.k);
    if (e.ends && !g.log.some((x) => x.ends)) {
      g.over = false;
      g.endedBy = null;
    }
    save();
    render();
    toast(`Undid ${logDelta(e)} for ${player.name}`);
  },

  'new-game': () => {
    if (!confirm('Start a new game? Turn, scores and the battle log will be reset. Player names are kept.')) return;
    app.state.game = newGame(app.state.game.players);
    save();
    render();
    toast('New game started');
  },

  'rules-mode': ({ mode }) => {
    app.state.rulesMode = mode === 'full' ? 'full' : 'summary';
    save();
    render();
  },

  'dismiss-notice': () => {
    app.state.dismissed[app.data.id] = true;
    save();
    renderNotice();
  },
};

function bindEvents() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled || !app.data) return;
    const run = actions[el.dataset.action];
    if (!run) return;
    Promise.resolve(run({ ...el.dataset })).catch((err) => {
      console.error(err);
      toast(err.message);
    });
  });

  // Player names: save while typing, without re-rendering (keeps focus).
  document.addEventListener('input', (e) => {
    const input = e.target.closest('input[data-player]');
    if (!input) return;
    app.state.game.players[Number(input.dataset.player)].name = input.value;
    save();
  });

  document.addEventListener('change', (e) => {
    const input = e.target.closest('input[data-player]');
    if (!input) return;
    const i = Number(input.dataset.player);
    const name = input.value.trim() || `Player ${i + 1}`;
    app.state.game.players[i].name = name;
    input.value = name;
    save();
    const standing = els.view.querySelector('.standing');
    if (standing) standing.innerHTML = standingHtml();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches?.('input[data-player]')) e.target.blur();
  });

  // Remember which "Full rules" panels are open across re-renders.
  document.addEventListener('toggle', (e) => {
    const d = e.target;
    if (!(d instanceof HTMLDetailsElement) || !d.dataset.key) return;
    if (d.open) app.open.add(d.dataset.key);
    else app.open.delete(d.dataset.key);
  }, true);

  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', syncThemeColor);
}
