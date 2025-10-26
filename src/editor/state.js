import { getTileByCoord } from "../data/tiles.js";
import { getDefaultPresetIdForUsage, resolveFaceTiles } from "../data/blockPresets.js";

const listeners = new Set();

const DEFAULT_WIDTH = 8;
const DEFAULT_DEPTH = 8;
const DEFAULT_ROOM_ID = "room-1";
const DEFAULT_SPAWN = [0, 0.9, 0];
const DEFAULT_FLOOR_PRESET_ID = getDefaultPresetIdForUsage("floor");
const DEFAULT_WALL_HEIGHT = 3;
const DEFAULT_WALL_THICKNESS = 0.25;

function createEmptyRoom(roomId, width = DEFAULT_WIDTH, depth = DEFAULT_DEPTH) {
  return {
    roomId,
    width,
    depth,
    spawnId: `${roomId}-spawn`,
    spawn: [...DEFAULT_SPAWN],
    blocks: new Map(),
    crates: new Map(),
    doors: new Map(),
    floorTiles: new Map(),
    floorPresetId: DEFAULT_FLOOR_PRESET_ID,
    wallHeight: DEFAULT_WALL_HEIGHT,
    wallThickness: DEFAULT_WALL_THICKNESS,
    objects: new Map(),
    lights: new Map(),
    player: null,
  };
}

const state = {
  rooms: new Map([[DEFAULT_ROOM_ID, createEmptyRoom(DEFAULT_ROOM_ID)]]),
  currentRoomId: DEFAULT_ROOM_ID,
};

function getCurrentRoom() {
  const room = state.rooms.get(state.currentRoomId);
  if (!room) {
    throw new Error(`Room "${state.currentRoomId}" not found in editor state.`);
  }
  return room;
}

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
  const room = getCurrentRoom();
  const floorTiles = Array.from(room.floorTiles.entries()).map(([key, value]) => {
    const [x, z] = key.split(",").map(Number);
    return {
      x,
      z,
      presetId: value?.presetId ?? null,
      tiles: value?.tiles ?? {},
    };
  });
  const blocks = Array.from(room.blocks.entries()).map(([key, value]) => {
    const [x, z] = key.split(",").map(Number);
    return {
      x,
      z,
      height: value.height,
      material: value.material,
      tiles: value.tiles,
      presetId: value.presetId,
    };
  });

  const crates = Array.from(room.crates.entries()).map(([key, value]) => {
    const [x, z] = key.split(",").map(Number);
    const data = value && typeof value === "object" ? value : {};
    return {
      x,
      z,
      presetId: data.presetId ?? null,
      tiles: data.tiles ?? {},
    };
  });

  const objects = Array.from(room.objects.entries()).map(([key, value]) => {
    const [x, z] = key.split(",").map(Number);
    return {
      x,
      z,
      presetId: value.presetId ?? null,
      rotation: value.rotation ?? 0,
      height: value.height ?? 0,
      state: value.state ?? null,
    };
  });

  const lights = Array.from(room.lights.entries()).map(([key, value]) => {
    const [x, z] = key.split(",").map(Number);
    return {
      x,
      z,
      presetId: value.presetId ?? null,
      color: value.color ?? "#ffffff",
      intensity: value.intensity ?? 1,
      height: value.height ?? 2,
    };
  });

  const doors = Array.from(room.doors.entries()).map(([key, value]) => {
    const [x, z] = key.split(",").map(Number);
    return {
      x,
      z,
      id: value.id,
      orientation: value.orientation,
      targetRoom: value.targetRoom,
      targetDoor: value.targetDoor,
      openingWidth: value.openingWidth,
      lintelHeight: value.lintelHeight,
      material: value.material,
      spawnId: value.spawnId,
      targetSpawnId: value.targetSpawnId,
    };
  });

  const graph = computeRoomGraph();

  return {
    width: room.width,
    depth: room.depth,
    floor: {
      presetId: room.floorPresetId ?? DEFAULT_FLOOR_PRESET_ID,
      tiles: floorTiles,
      height: 0.125,
      material: "floor",
    },
    wallHeight: room.wallHeight ?? DEFAULT_WALL_HEIGHT,
    wallThickness: room.wallThickness ?? DEFAULT_WALL_THICKNESS,
    blocks,
    crates,
    objects,
    lights,
    doors,
    player: room.player ? { ...room.player } : null,
    roomId: state.currentRoomId,
    roomList: Array.from(state.rooms.keys()),
    roomsMeta: buildRoomsMeta(),
    spawnId: room.spawnId,
    spawn: room.spawn ? [...room.spawn] : [...DEFAULT_SPAWN],
    roomLayout: graph.layout,
    roomEdges: graph.edges,
    validation: computeValidation(),
  };
}

export function setGridSize(width, depth) {
  const room = getCurrentRoom();
  const w = Math.min(32, Math.max(4, Math.floor(width)));
  const d = Math.min(32, Math.max(4, Math.floor(depth)));
  if (w === room.width && d === room.depth) {
    return;
  }

  room.width = w;
  room.depth = d;

  for (const key of [...room.blocks.keys()]) {
    const [x, z] = key.split(",").map(Number);
    if (x >= w || z >= d) {
      room.blocks.delete(key);
    }
  }

  for (const key of [...room.crates.keys()]) {
    const [x, z] = key.split(",").map(Number);
    if (x >= w || z >= d) {
      room.crates.delete(key);
    }
  }

  for (const key of [...room.doors.keys()]) {
    const [x, z] = key.split(",").map(Number);
    if (x >= w || z >= d) {
      room.doors.delete(key);
    }
  }

  for (const key of [...room.floorTiles.keys()]) {
    const [x, z] = key.split(",").map(Number);
    if (x >= w || z >= d) {
      room.floorTiles.delete(key);
    }
  }

  for (const key of [...room.objects.keys()]) {
    const [x, z] = key.split(",").map(Number);
    if (x >= w || z >= d) {
      room.objects.delete(key);
    }
  }

  for (const key of [...room.lights.keys()]) {
    const [x, z] = key.split(",").map(Number);
    if (x >= w || z >= d) {
      room.lights.delete(key);
    }
  }

  if (room.player && (room.player.x >= w || room.player.z >= d)) {
    room.player = null;
  }

  notify();
}

export function setWallHeight(height) {
  const room = getCurrentRoom();
  const h = Math.min(8, Math.max(1, Math.floor(height)));
  if (room.wallHeight === h) {
    return;
  }
  room.wallHeight = h;
  notify();
}

export function setWallThickness(value) {
  const room = getCurrentRoom();
  const thickness = Math.min(0.75, Math.max(0.1, Number(value) || DEFAULT_WALL_THICKNESS));
  if (Math.abs((room.wallThickness ?? DEFAULT_WALL_THICKNESS) - thickness) < 0.0001) {
    return;
  }
  room.wallThickness = thickness;
  notify();
}

export function placeBlock(x, z, height, properties = {}) {
  if (!isInBounds(x, z)) {
    return;
  }
  const room = getCurrentRoom();
  room.blocks.set(keyOf(x, z), {
    height,
    material: properties.material,
    tiles: properties.tiles,
    presetId: properties.presetId,
  });
  room.crates.delete(keyOf(x, z));
  room.doors.delete(keyOf(x, z));
  room.objects.delete(keyOf(x, z));
  room.lights.delete(keyOf(x, z));
  notify();
}

export function updateBlock(x, z, updates = {}) {
  if (!isInBounds(x, z)) {
    return;
  }
  const room = getCurrentRoom();
  const key = keyOf(x, z);
  const current = room.blocks.get(key);
  if (!current) {
    return;
  }
  const next = {
    ...current,
    ...updates,
  };
  if (typeof next.height === "number") {
    next.height = Math.max(0.25, Math.min(5, next.height));
  }
  room.blocks.set(key, next);
  notify();
}

export function placeCrate(x, z, properties = {}) {
  if (!isInBounds(x, z)) {
    return;
  }
  const room = getCurrentRoom();
  room.crates.set(keyOf(x, z), {
    presetId: properties.presetId ?? null,
    tiles: properties.tiles ?? {},
  });
  room.blocks.delete(keyOf(x, z));
  room.doors.delete(keyOf(x, z));
  room.objects.delete(keyOf(x, z));
  room.lights.delete(keyOf(x, z));
  notify();
}

export function placeObject(x, z, properties = {}) {
  if (!isInBounds(x, z)) {
    return;
  }
  const room = getCurrentRoom();
  room.objects.set(keyOf(x, z), {
    presetId: properties.presetId ?? null,
    rotation: properties.rotation ?? 0,
    height: properties.height ?? 0,
    state: properties.state ?? null,
  });
  room.blocks.delete(keyOf(x, z));
  room.crates.delete(keyOf(x, z));
  room.doors.delete(keyOf(x, z));
  room.lights.delete(keyOf(x, z));
  notify();
}

export function updateObject(x, z, updates = {}) {
  const room = getCurrentRoom();
  const key = keyOf(x, z);
  const current = room.objects.get(key);
  if (!current) {
    return;
  }
  room.objects.set(key, { ...current, ...updates });
  notify();
}

export function placeLight(x, z, properties = {}) {
  if (!isInBounds(x, z)) {
    return;
  }
  const room = getCurrentRoom();
  room.lights.set(keyOf(x, z), {
    presetId: properties.presetId ?? null,
    color: properties.color ?? "#ffffff",
    intensity: properties.intensity ?? 1,
    height: properties.height ?? 2,
  });
  room.blocks.delete(keyOf(x, z));
  room.crates.delete(keyOf(x, z));
  room.objects.delete(keyOf(x, z));
  notify();
}

export function updateLight(x, z, updates = {}) {
  const room = getCurrentRoom();
  const key = keyOf(x, z);
  const current = room.lights.get(key);
  if (!current) {
    return;
  }
  room.lights.set(key, { ...current, ...updates });
  notify();
}

export function placeFloorTile(x, z, properties = {}) {
  if (!isInBounds(x, z)) {
    return;
  }
  const room = getCurrentRoom();
  const defaultPreset = room.floorPresetId ?? DEFAULT_FLOOR_PRESET_ID;
  const presetId = properties.presetId ?? defaultPreset;
  const tiles = properties.tiles ? { ...properties.tiles } : {};
  const key = keyOf(x, z);
  const defaultTileIds = faceTilesToIdMap(resolveFaceTiles(defaultPreset) || {});
  const matchesDefault = presetId === defaultPreset && areTileMapsEquivalent(tiles, defaultTileIds);
  if (!presetId || matchesDefault) {
    room.floorTiles.delete(key);
  } else {
    room.floorTiles.set(key, {
      presetId,
      tiles,
    });
  }
  notify();
}

export function clearFloorTile(x, z) {
  if (!isInBounds(x, z)) {
    return;
  }
  const room = getCurrentRoom();
  const key = keyOf(x, z);
  if (room.floorTiles.delete(key)) {
    notify();
  }
}

export function setDefaultFloorPreset(presetId) {
  const room = getCurrentRoom();
  const next = presetId || DEFAULT_FLOOR_PRESET_ID;
  if (room.floorPresetId === next) {
    return;
  }
  room.floorPresetId = next;
  const defaultTileIds = faceTilesToIdMap(resolveFaceTiles(next) || {});
  for (const [key, value] of [...room.floorTiles.entries()]) {
    const tiles = value?.tiles ?? {};
    if ((value?.presetId ?? null) === next && Object.keys(tiles).length === 0) {
      room.floorTiles.delete(key);
    } else if (areTileMapsEquivalent(tiles, defaultTileIds)) {
      room.floorTiles.delete(key);
    }
  }
  notify();
}

export function setPlayer(x, z) {
  if (!isInBounds(x, z)) {
    return;
  }
  const room = getCurrentRoom();
  room.player = { x, z };
  room.spawn = [x - (room.width - 1) / 2, 0.9, z - (room.depth - 1) / 2];
  notify();
}

export function eraseAt(x, z) {
  if (!isInBounds(x, z)) {
    return;
  }
  const room = getCurrentRoom();
  room.blocks.delete(keyOf(x, z));
  room.crates.delete(keyOf(x, z));
  room.doors.delete(keyOf(x, z));
  room.objects.delete(keyOf(x, z));
  room.lights.delete(keyOf(x, z));
  if (room.player && room.player.x === x && room.player.z === z) {
    room.player = null;
  }
  notify();
}

export function setRoomId(roomId) {
  const trimmed = `${roomId ?? ""}`.trim();
  if (!trimmed || trimmed === state.currentRoomId) {
    return;
  }
  if (state.rooms.has(trimmed)) {
    console.warn(`Room "${trimmed}" already exists.`);
    return;
  }
  const room = getCurrentRoom();
  state.rooms.delete(state.currentRoomId);
  room.roomId = trimmed;
  if (!room.spawnId || room.spawnId.startsWith(`${state.currentRoomId}-spawn`)) {
    room.spawnId = `${trimmed}-spawn`;
  }
  state.rooms.set(trimmed, room);
  state.currentRoomId = trimmed;
  notify();
}

export function createRoom(roomId) {
  const base = roomId && roomId.trim() ? roomId.trim() : `room-${state.rooms.size + 1}`;
  const uniqueId = generateUniqueRoomId(base);
  const room = createEmptyRoom(uniqueId);
  state.rooms.set(uniqueId, room);
  state.currentRoomId = uniqueId;
  notify();
  return uniqueId;
}

export function setCurrentRoom(roomId) {
  if (!state.rooms.has(roomId) || state.currentRoomId === roomId) {
    return;
  }
  state.currentRoomId = roomId;
  notify();
}

export function placeDoor(x, z, properties = {}) {
  if (!isInBounds(x, z)) {
    return;
  }
  const room = getCurrentRoom();
  const key = keyOf(x, z);
  const existing = room.doors.get(key) ?? {};
  room.blocks.delete(key);
  room.crates.delete(key);
  room.objects.delete(key);
  room.lights.delete(key);
  const orientation = properties.orientation ?? existing.orientation ?? "north";
  const openingWidth = properties.openingWidth ?? existing.openingWidth ?? 1;
  const lintelHeight = properties.lintelHeight ?? existing.lintelHeight ?? 0.5;
  const material = properties.material ?? existing.material ?? "door";
  const id =
    properties.id ??
    existing.id ??
    `door-${state.currentRoomId}-${x}-${z}-${orientation}`;
  const spawnId = properties.spawnId ?? existing.spawnId ?? `${id}-spawn`;
  const targetSpawnId = properties.targetSpawnId ?? existing.targetSpawnId ?? "";

  room.doors.set(key, {
    id,
    orientation,
    targetRoom: properties.targetRoom ?? existing.targetRoom ?? "",
    targetDoor: properties.targetDoor ?? existing.targetDoor ?? "",
    openingWidth,
    lintelHeight,
    material,
    spawnId,
    targetSpawnId,
  });
  notify();
}

export function updateDoor(x, z, updates = {}) {
  const room = getCurrentRoom();
  const key = keyOf(x, z);
  const current = room.doors.get(key);
  if (!current) {
    return;
  }
  const updated = {
    ...current,
    ...updates,
  };

  const hasCustomSpawnId = current.spawnId && !current.spawnId.startsWith(`${current.id}-spawn`);
  if (!updates.spawnId && !hasCustomSpawnId) {
    updated.spawnId = `${updated.id}-spawn`;
  }

  room.doors.set(key, updated);
  notify();
}

export function removeDoor(x, z) {
  const room = getCurrentRoom();
  const key = keyOf(x, z);
  if (room.doors.delete(key)) {
    notify();
  }
}

export function getProjectSnapshot() {
  const rooms = [];
  state.rooms.forEach((room, roomId) => {
    rooms.push({
      roomId,
      width: room.width,
      depth: room.depth,
      floor: {
        width: room.width,
        depth: room.depth,
        height: 0.125,
        presetId: room.floorPresetId ?? DEFAULT_FLOOR_PRESET_ID,
        material: "floor",
        tiles: Array.from(room.floorTiles.entries()).map(([key, value]) => {
          const [x, z] = key.split(",").map(Number);
          return {
            x,
            z,
            presetId: value?.presetId ?? null,
            tiles: value?.tiles ?? {},
          };
        }),
      },
      wallHeight: room.wallHeight ?? DEFAULT_WALL_HEIGHT,
      wallThickness: room.wallThickness ?? DEFAULT_WALL_THICKNESS,
      spawnId: room.spawnId,
      spawn: room.spawn ? [...room.spawn] : [...DEFAULT_SPAWN],
      blocks: Array.from(room.blocks.entries()).map(([key, value]) => {
        const [x, z] = key.split(",").map(Number);
        return {
          x,
          z,
          height: value.height,
          material: value.material,
          tiles: value.tiles,
          presetId: value.presetId,
        };
      }),
      crates: Array.from(room.crates.entries()).map(([key, value]) => {
        const [x, z] = key.split(",").map(Number);
        const data = value && typeof value === "object" ? value : {};
        return {
          x,
          z,
          presetId: data.presetId ?? null,
          tiles: data.tiles ?? {},
        };
      }),
      objects: Array.from(room.objects.entries()).map(([key, value]) => {
        const [x, z] = key.split(",").map(Number);
        return {
          x,
          z,
          presetId: value.presetId ?? null,
          rotation: value.rotation ?? 0,
          height: value.height ?? 0,
          state: value.state ?? null,
        };
      }),
      lights: Array.from(room.lights.entries()).map(([key, value]) => {
        const [x, z] = key.split(",").map(Number);
        return {
          x,
          z,
          presetId: value.presetId ?? null,
          color: value.color ?? "#ffffff",
          intensity: value.intensity ?? 1,
          height: value.height ?? 2,
        };
      }),
      doors: Array.from(room.doors.entries()).map(([key, value]) => {
        const [x, z] = key.split(",").map(Number);
        return {
          x,
          z,
          id: value.id,
          orientation: value.orientation,
          targetRoom: value.targetRoom,
          targetDoor: value.targetDoor,
          openingWidth: value.openingWidth,
          lintelHeight: value.lintelHeight,
          material: value.material,
          spawnId: value.spawnId,
          targetSpawnId: value.targetSpawnId,
        };
      }),
      player: room.player ? { ...room.player } : null,
    });
  });
  return {
    rooms,
    currentRoomId: state.currentRoomId,
  };
}

export function loadProjectSnapshot(project) {
  if (!project || !Array.isArray(project.rooms)) {
    throw new Error("Invalid project data: expected { rooms: [...] }");
  }

  const newRooms = new Map();

  const ensureUniqueRoomId = (base) => {
    let candidate = (base && base.trim()) ? base.trim() : `room-${newRooms.size + 1}`;
    let counter = 1;
    while (newRooms.has(candidate)) {
      candidate = `${base}-${counter++}`;
    }
    return candidate;
  };

  project.rooms.forEach((roomData, index) => {
    if (!roomData) {
      return;
    }

    const baseId = roomData.roomId ?? `room-${index + 1}`;
    const roomId = ensureUniqueRoomId(baseId);

    const width = Math.max(4, Math.floor(roomData.width ?? DEFAULT_WIDTH));
    const depth = Math.max(4, Math.floor(roomData.depth ?? DEFAULT_DEPTH));

    const room = createEmptyRoom(roomId, width, depth);
    room.spawnId = roomData.spawnId ?? `${roomId}-spawn`;
    room.spawn = Array.isArray(roomData.spawn) && roomData.spawn.length === 3 ? [...roomData.spawn] : [...DEFAULT_SPAWN];

    const xOffset = (width - 1) / 2;
    const zOffset = (depth - 1) / 2;

    const toGrid = (worldValue, offset) => Math.round(worldValue + offset);

    (roomData.blocks ?? []).forEach((block) => {
      const worldPos = block.position;
      const x = typeof block?.x === "number" ? block.x : Array.isArray(worldPos) ? toGrid(worldPos[0], xOffset) : null;
      const z = typeof block?.z === "number" ? block.z : Array.isArray(worldPos) ? toGrid(worldPos[2], zOffset) : null;
      if (x === null || z === null) {
        return;
      }

      const tileOverrides = resolveTileOverrideIds(block.tiles);
      room.blocks.set(keyOf(x, z), {
        height: block.height ?? 1,
        material: block.material,
        tiles: tileOverrides,
        presetId: block.presetId ?? null,
      });
    });

    (roomData.crates ?? []).forEach((crate) => {
      const worldPos = crate.position;
      const x = typeof crate?.x === "number" ? crate.x : Array.isArray(worldPos) ? toGrid(worldPos[0], xOffset) : null;
      const z = typeof crate?.z === "number" ? crate.z : Array.isArray(worldPos) ? toGrid(worldPos[2], zOffset) : null;
      if (x === null || z === null) {
        return;
      }

      const tileOverrides = resolveTileOverrideIds(crate.tiles);
      room.crates.set(keyOf(x, z), {
        presetId: crate.presetId ?? null,
        tiles: tileOverrides,
      });
    });

    (roomData.objects ?? []).forEach((object) => {
      const worldPos = object.position;
      const x = typeof object?.x === "number" ? object.x : Array.isArray(worldPos) ? toGrid(worldPos[0], xOffset) : null;
      const z = typeof object?.z === "number" ? object.z : Array.isArray(worldPos) ? toGrid(worldPos[2], zOffset) : null;
      if (x === null || z === null) {
        return;
      }
      room.objects.set(keyOf(x, z), {
        presetId: object.presetId ?? object.id ?? null,
        rotation: object.rotation ?? 0,
        height: object.height ?? (Array.isArray(worldPos) ? worldPos[1] : 0),
        state: object.state ?? null,
      });
    });

    (roomData.lights ?? []).forEach((light) => {
      const worldPos = light.position;
      const x = typeof light?.x === "number" ? light.x : Array.isArray(worldPos) ? toGrid(worldPos[0], xOffset) : null;
      const z = typeof light?.z === "number" ? light.z : Array.isArray(worldPos) ? toGrid(worldPos[2], zOffset) : null;
      if (x === null || z === null) {
        return;
      }
      room.lights.set(keyOf(x, z), {
        presetId: light.presetId ?? light.id ?? null,
        color: light.color ?? light.hex ?? "#ffffff",
        intensity: light.intensity ?? 1,
        height: light.height ?? (Array.isArray(worldPos) ? worldPos[1] : 2),
      });
    });

    (roomData.doors ?? []).forEach((door) => {
      const worldPos = door.position;
      const x = typeof door?.x === "number" ? door.x : Array.isArray(worldPos) ? toGrid(worldPos[0], xOffset) : null;
      const z = typeof door?.z === "number" ? door.z : Array.isArray(worldPos) ? toGrid(worldPos[2], zOffset) : null;
      if (x === null || z === null) {
        return;
      }
      const doorId = door.id ?? `door-${roomId}-${x}-${z}`;
      const target = door.target ?? {};
      room.doors.set(keyOf(x, z), {
        id: doorId,
        orientation: door.orientation ?? "north",
        targetRoom: door.targetRoom ?? target.room ?? "",
        targetDoor: door.targetDoor ?? target.door ?? "",
        openingWidth: door.openingWidth ?? 1,
        lintelHeight: door.lintelHeight ?? 0.5,
        material: door.material ?? "door",
        spawnId: door.spawnId ?? `${doorId}-spawn`,
        targetSpawnId: door.targetSpawnId ?? target.spawnId ?? "",
      });
    });

    const floorData = roomData.floor ?? {};
    const floorPresetId = floorData.presetId ?? floorData.defaultPresetId ?? DEFAULT_FLOOR_PRESET_ID;
    room.floorPresetId = floorPresetId || DEFAULT_FLOOR_PRESET_ID;
    room.wallHeight = Math.min(8, Math.max(1, Math.floor(roomData.wallHeight ?? room.wallHeight ?? DEFAULT_WALL_HEIGHT)));
    room.wallThickness = Math.min(0.75, Math.max(0.1, Number(roomData.wallThickness ?? room.wallThickness ?? DEFAULT_WALL_THICKNESS)));
    if (Array.isArray(floorData.tiles)) {
      floorData.tiles.forEach((tile) => {
        const tilePos = tile.position;
        const x = typeof tile?.x === "number" ? tile.x : Array.isArray(tilePos) ? toGrid(tilePos[0], xOffset) : null;
        const z = typeof tile?.z === "number" ? tile.z : Array.isArray(tilePos) ? toGrid(tilePos[2], zOffset) : null;
        if (x === null || z === null) {
          return;
        }
        const tileOverrides = resolveTileOverrideIds(tile.tiles);
        const preset = tile.presetId ?? floorPresetId ?? DEFAULT_FLOOR_PRESET_ID;
        const key = keyOf(x, z);
        if (!preset || (preset === (floorPresetId ?? DEFAULT_FLOOR_PRESET_ID) && Object.keys(tileOverrides).length === 0)) {
          room.floorTiles.delete(key);
        } else {
          room.floorTiles.set(key, {
            presetId: preset,
            tiles: tileOverrides,
          });
        }
      });
    }

    if (roomData.player) {
      const worldPos = roomData.player.position ?? roomData.player;
      const x = typeof roomData.player.x === "number" ? roomData.player.x : Array.isArray(worldPos) ? toGrid(worldPos[0], xOffset) : null;
      const z = typeof roomData.player.z === "number" ? roomData.player.z : Array.isArray(worldPos) ? toGrid(worldPos[2], zOffset) : null;
      if (x !== null && z !== null) {
        room.player = { x, z };
      }
    }

    newRooms.set(roomId, room);
  });

  if (newRooms.size === 0) {
    const fallbackRoom = createEmptyRoom(DEFAULT_ROOM_ID);
    newRooms.set(DEFAULT_ROOM_ID, fallbackRoom);
  }

  state.rooms = newRooms;
  const desiredRoom = project.currentRoomId && newRooms.has(project.currentRoomId) ? project.currentRoomId : newRooms.keys().next().value;
  state.currentRoomId = desiredRoom;
  notify();
}

function resolveTileOverrideIds(rawTiles) {
  const overrides = {};
  Object.entries(rawTiles ?? {}).forEach(([face, info]) => {
    if (typeof info === "string") {
      overrides[face] = info;
    } else if (info && typeof info === "object") {
      if (info.id) {
        overrides[face] = info.id;
      } else if (typeof info.col === "number" && typeof info.row === "number") {
        const tile = getTileByCoord(info.col, info.row);
        if (tile) {
          overrides[face] = tile.id;
        }
      }
    }
  });
  return overrides;
}

function faceTilesToIdMap(faceTiles) {
  const map = {};
  Object.entries(faceTiles ?? {}).forEach(([face, tile]) => {
    if (!tile) {
      return;
    }
    if (typeof tile === "string") {
      map[face] = tile;
    } else if (tile.id) {
      map[face] = tile.id;
    }
  });
  return map;
}

function areTileMapsEquivalent(a, b) {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  for (const key of keys) {
    if ((a ?? {})[key] !== (b ?? {})[key]) {
      return false;
    }
  }
  return true;
}

function computeRoomGraph() {
  const layout = new Map();
  const edges = new Set();
  const rooms = Array.from(state.rooms.keys());
  const offsets = {
    north: { x: 0, y: -1 },
    south: { x: 0, y: 1 },
    east: { x: 1, y: 0 },
    west: { x: -1, y: 0 },
  };

  const queue = [];
  const occupied = new Set();

  const placeRoom = (roomId, pos) => {
    const key = `${pos.x},${pos.y}`;
    if (occupied.has(key)) {
      return false;
    }
    layout.set(roomId, pos);
    occupied.add(key);
    queue.push(roomId);
    return true;
  };

  if (rooms.length === 0) {
    return { layout: {}, edges: [] };
  }

  placeRoom(rooms[0], { x: 0, y: 0 });

  while (queue.length > 0) {
    const roomId = queue.shift();
    const pos = layout.get(roomId);
    const room = state.rooms.get(roomId);
    if (!room) {
      continue;
    }

    room.doors.forEach((door) => {
      const targetRoom = door.targetRoom;
      if (!targetRoom || !state.rooms.has(targetRoom)) {
        return;
      }
      const orientation = door.orientation ?? "north";
      const offset = offsets[orientation] ?? offsets.north;
      const targetPos = { x: pos.x + offset.x, y: pos.y + offset.y };
      const key = `${roomId}->${targetRoom}`;
      edges.add(key);
      edges.add(`${targetRoom}->${roomId}`);
      if (!layout.has(targetRoom)) {
        placeRoom(targetRoom, targetPos);
      }
    });
  }

  // place any rooms not yet laid out
  rooms.forEach((roomId) => {
    if (!layout.has(roomId)) {
      let attempt = 0;
      while (!placeRoom(roomId, { x: layout.size + attempt, y: layout.size })) {
        attempt += 1;
      }
    }
  });

  const layoutObj = {};
  layout.forEach((value, key) => {
    layoutObj[key] = value;
  });

  const edgesArr = Array.from(edges).map((edge) => {
    const [from, to] = edge.split("->");
    return { from, to };
  });

  return { layout: layoutObj, edges: edgesArr };
}

function computeValidation() {
  const warnings = [];
  state.rooms.forEach((room, roomId) => {
    room.doors.forEach((door) => {
      const targetRoomId = door.targetRoom;
      if (!targetRoomId) {
        warnings.push({ roomId, doorId: door.id, message: "Door has no target room assigned." });
        return;
      }
      const targetRoom = state.rooms.get(targetRoomId);
      if (!targetRoom) {
        warnings.push({ roomId, doorId: door.id, message: `Target room "${targetRoomId}" does not exist.` });
        return;
      }
      if (!door.targetDoor) {
        warnings.push({ roomId, doorId: door.id, message: `Door targeting "${targetRoomId}" is missing a target door ID.` });
        return;
      }
      const targetDoor = Array.from(targetRoom.doors.values()).find((entry) => entry.id === door.targetDoor);
      if (!targetDoor) {
        warnings.push({ roomId, doorId: door.id, message: `Target door "${door.targetDoor}" not found in room "${targetRoomId}".` });
        return;
      }
      if (targetDoor.targetRoom && targetDoor.targetRoom !== roomId) {
        warnings.push({ roomId, doorId: door.id, message: `Target door "${door.targetDoor}" points to "${targetDoor.targetRoom}" instead of "${roomId}".` });
      }
      if (targetDoor.targetDoor && targetDoor.targetDoor !== door.id) {
        warnings.push({ roomId, doorId: door.id, message: `Door "${door.id}" and "${door.targetDoor}" are not mutually linked.` });
      }
    });
  });
  return warnings;
}
function buildRoomsMeta() {
  const meta = {};
  state.rooms.forEach((room, roomId) => {
    meta[roomId] = {
      doors: Array.from(room.doors.values()).map((door) => ({
        id: door.id,
        label: door.id,
        spawnId: door.spawnId,
      })),
    };
  });
  return meta;
}

function isInBounds(x, z) {
  const room = getCurrentRoom();
  return x >= 0 && z >= 0 && x < room.width && z < room.depth;
}

function keyOf(x, z) {
  return `${x},${z}`;
}

function generateUniqueRoomId(base) {
  let candidate = base;
  let counter = 1;
  while (state.rooms.has(candidate)) {
    candidate = `${base}-${counter++}`;
  }
  return candidate;
}
