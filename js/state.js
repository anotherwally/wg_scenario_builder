// Game state lives in the browser's localStorage, so it survives a page
// reload or the phone locking mid-game. Nothing is sent anywhere.

const KEY = 'scenario-selector/v1';
const VERSION = 1;

export function newGame(players) {
  const source = players ?? [{ name: 'Player 1' }, { name: 'Player 2' }];
  return {
    turn: 1,
    extraRoll: null, // die result of the extra-turn roll, or null
    over: false,
    endedBy: null, // { p, label } when a game-ending event (e.g. briefcase off the table) ended it
    players: source.map((p, i) => ({ name: p.name || `Player ${i + 1}`, vp: 0 })),
    log: [], // newest first: { p, d, label, turn }
  };
}

export function defaultState() {
  return {
    v: VERSION,
    system: 'bolt-action',
    view: 'scenario',
    rulesMode: 'summary',
    picks: {}, // { [systemId]: { [categoryId]: optionId } }
    dismissed: {}, // { [systemId]: true } for dismissed draft notices
    game: newGame(),
  };
}

export function loadState() {
  const base = defaultState();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!saved || saved.v !== VERSION) return base;

    const game = { ...base.game, ...saved.game };
    const playersOk = Array.isArray(game.players) && game.players.length === 2
      && game.players.every((p) => p && typeof p.name === 'string' && Number.isFinite(p.vp));
    if (!playersOk) game.players = base.game.players;
    if (!Array.isArray(game.log)) game.log = [];
    if (!Number.isInteger(game.turn) || game.turn < 1) game.turn = 1;

    return {
      ...base,
      ...saved,
      picks: isObject(saved.picks) ? saved.picks : {},
      dismissed: isObject(saved.dismissed) ? saved.dismissed : {},
      game,
    };
  } catch {
    return base;
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Private mode or storage blocked: the app still works, it just won't remember.
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
