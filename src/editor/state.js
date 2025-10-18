const listeners = new Set();

const state = {
  width: 8,
  depth: 8,
  blocks: new Map(), // key => { height }
  crates: new Map(), // key => true
  player: null, // { xIndex, zIndex }
};

const keyOf = (x, z) => `${x},${z}`;

function notify() {
  const snapshot = getSnapshot();
  listeners.forEach((listener) => listener(snapshot));
}

export function subscribe(listener) {
  listeners.add(listener);
  listener(getSnapshot());
  return () => listeners.delete(listener);
}

export function getSnapshot() {
  const blocks = Array.from(state.blocks.entries()).map(([key, value]) => {
    const [x, z] = key.split(",").map(Number);
    return { x, z, height: value.height };
  });

  const crates = Array.from(state.crates.keys()).map((key) => {
    const [x, z] = key.split(",").map(Number);
    return { x, z };
  });

  return {
    width: state.width,
    depth: state.depth,
    blocks,
    crates,
    player: state.player ? { ...state.player } : null,
  };
}

export function setGridSize(width, depth) {
  const w = Math.min(16, Math.max(4, Math.floor(width)));
  const d = Math.min(16, Math.max(4, Math.floor(depth)));
  if (w === state.width && d === state.depth) {
    return;
  }
  state.width = w;
  state.depth = d;

  for (const key of [...state.blocks.keys()]) {
    const [x, z] = key.split(",").map(Number);
    if (x >= w || z >= d) {
      state.blocks.delete(key);
    }
  }

  for (const key of [...state.crates.keys()]) {
    const [x, z] = key.split(",").map(Number);
    if (x >= w || z >= d) {
      state.crates.delete(key);
    }
  }

  if (state.player && (state.player.x >= w || state.player.z >= d)) {
    state.player = null;
  }

  notify();
}

export function placeBlock(x, z, height) {
  if (!isInBounds(x, z)) {
    return;
  }
  state.blocks.set(keyOf(x, z), { height });
  state.crates.delete(keyOf(x, z));
  notify();
}

export function placeCrate(x, z) {
  if (!isInBounds(x, z)) {
    return;
  }
  state.crates.set(keyOf(x, z), true);
  state.blocks.delete(keyOf(x, z));
  notify();
}

export function setPlayer(x, z) {
  if (!isInBounds(x, z)) {
    return;
  }
  state.player = { x, z };
  notify();
}

export function eraseAt(x, z) {
  if (!isInBounds(x, z)) {
    return;
  }
  state.blocks.delete(keyOf(x, z));
  state.crates.delete(keyOf(x, z));
  if (state.player && state.player.x === x && state.player.z === z) {
    state.player = null;
  }
  notify();
}

function isInBounds(x, z) {
  return x >= 0 && z >= 0 && x < state.width && z < state.depth;
}
