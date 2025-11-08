import { getTileByCoord } from "../data/tiles.js";
import { getDefaultPresetIdForUsage, resolveFaceTiles } from "../data/blockPresets.js";
import { getModelDefinition } from "../data/models.js";
import { DEFAULT_DOOR_HEIGHT } from "../data/doorRuntime.js";

const listeners = new Set();

const DEFAULT_WIDTH = 8;
const DEFAULT_DEPTH = 8;
const DEFAULT_ROOM_ID = "room-1";
const DEFAULT_SPAWN = [0, 0.9, 0];
const DEFAULT_FLOOR_PRESET_ID = getDefaultPresetIdForUsage("floor");
const DEFAULT_WALL_HEIGHT = 3;
const DEFAULT_WALL_THICKNESS = 0.25;
const DEFAULT_BLOCK_LEVEL = 0;
const CRATE_SIZE = 0.9;

function createEmptyRoom(roomId, width = DEFAULT_WIDTH, depth = DEFAULT_DEPTH) {
  return {
    roomId,
    width,
    depth,
    spawnId: `${roomId}-spawn`,
    spawn: [...DEFAULT_SPAWN],
    ambientColor: "#ffffff",
    ambientIntensity: 0.65,
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
    const { x, z, level } = parseBlockKey(key);
    return {
      x,
      z,
      level,
      height: value.height,
      material: value.material,
      tiles: value.tiles,
      presetId: value.presetId,
    };
  });

  const crates = Array.from(room.crates.entries()).map(([key, value]) => {
    const { x, z, level } = parseBlockKey(key);
    const data = value && typeof value === "object" ? value : {};
    return {
      x,
      z,
      level,
      presetId: data.presetId ?? null,
      tiles: data.tiles ?? {},
      height: data.height ?? CRATE_SIZE,
    };
  });

  const objects = Array.from(room.objects.entries()).map(([key, value]) => {
    const { x, z, level } = parseBlockKey(key);
    return {
      x,
      z,
      level,
      presetId: value.presetId ?? null,
      rotation: value.rotation ?? 0,
      height: value.height ?? 0,
      state: value.state ?? null,
      size: Array.isArray(value.size) ? [...value.size] : null,
    };
  });

  const lights = Array.from(room.lights.entries()).map(([key, value]) => {
    const { x, z, level } = parseBlockKey(key);
    return {
      x,
      z,
      level,
      presetId: value.presetId ?? null,
      color: value.color ?? "#ffffff",
      intensity: value.intensity ?? 1,
      height: value.height ?? 2,
    };
  });

  const doors = Array.from(room.doors.entries()).map(([key, value]) => {
    const { x, z, level } = parseDoorKey(key);
    return {
      x,
      z,
      level,
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
    ambient: {
      color: room.ambientColor ?? "#ffffff",
      intensity: room.ambientIntensity ?? 0.65,
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
    const { x, z } = parseBlockKey(key);
    if (x >= w || z >= d) {
      room.blocks.delete(key);
    }
  }

  for (const key of [...room.crates.keys()]) {
    const { x, z } = parseBlockKey(key);
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
    const { x, z } = parseBlockKey(key);
    if (x >= w || z >= d) {
      room.objects.delete(key);
    }
  }

  for (const key of [...room.lights.keys()]) {
    const { x, z } = parseBlockKey(key);
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
  const level = normalizeBlockLevel(properties.level);
  const key = blockKeyOf(x, z, level);
  const resolvedHeight = Math.max(0.25, Math.min(5, Number(height) || 1));
  room.blocks.set(key, {
    level,
    height: resolvedHeight,
    material: properties.material,
    tiles: properties.tiles,
    presetId: properties.presetId,
  });
  deleteCratesAtTile(room, x, z, level);
  deleteDoorsAtTile(room, x, z, level);
  deleteObjectsAtTile(room, x, z, level);
  deleteLightsAtTile(room, x, z, level);
  notify();
}

export function updateBlock(x, z, level, updates = {}) {
  if (!isInBounds(x, z)) {
    return;
  }
  const room = getCurrentRoom();
  const normalizedLevel = normalizeBlockLevel(level);
  const key = blockKeyOf(x, z, normalizedLevel);
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
  let targetLevel = normalizeBlockLevel(next.level ?? normalizedLevel);
  next.level = targetLevel;
  if (targetLevel !== normalizedLevel) {
    room.blocks.delete(key);
    room.blocks.set(blockKeyOf(x, z, targetLevel), next);
  } else {
    room.blocks.set(key, next);
  }
  notify();
}

export function placeCrate(x, z, properties = {}) {
  if (!isInBounds(x, z)) {
    return;
  }
  const room = getCurrentRoom();
  const level = normalizeBlockLevel(properties.level);
  const key = blockKeyOf(x, z, level);
  const crateHeight = Math.max(0.25, Number(properties.height) || CRATE_SIZE);
  const entry = {
    level,
    presetId: properties.presetId ?? null,
    tiles: properties.tiles ?? {},
    height: crateHeight,
  };
  room.crates.set(key, entry);
  deleteDoorsAtTile(room, x, z, level);
  notify();
}

export function updateCrate(x, z, level, updates = {}) {
  const room = getCurrentRoom();
  const currentLevel = normalizeBlockLevel(level ?? DEFAULT_BLOCK_LEVEL);
  const key = blockKeyOf(x, z, currentLevel);
  const current = room.crates.get(key);
  if (!current) {
    return;
  }
  const next = {
    ...current,
    ...updates,
  };
  if (Array.isArray(next.size)) {
    next.size = [...next.size];
  }
  let targetLevel = normalizeBlockLevel(next.level ?? currentLevel);
  next.level = targetLevel;
  if (typeof next.height !== "number" || !Number.isFinite(next.height)) {
    const baseOffset = (current.height ?? currentLevel + 2) - currentLevel;
    next.height = targetLevel + baseOffset;
  }
  const targetKey = blockKeyOf(x, z, targetLevel);
  if (targetLevel !== currentLevel) {
    room.crates.delete(key);
    room.crates.set(targetKey, next);
  } else {
    room.crates.set(key, next);
  }
  notify();
}

export function placeObject(x, z, properties = {}) {
  if (!isInBounds(x, z)) {
    return;
  }
  const room = getCurrentRoom();
  const level = normalizeBlockLevel(properties.level);
  const key = blockKeyOf(x, z, level);
  const resolvedSize = Array.isArray(properties.size)
    ? properties.size.map((value) => Number(value) || 0)
    : null;
  const sizeY = resolvedSize ? resolvedSize[1] ?? 1 : 1;
  const centerHeight =
    typeof properties.height === "number" && Number.isFinite(properties.height)
      ? properties.height
      : level + sizeY / 2;
  room.objects.set(key, {
    level,
    presetId: properties.presetId ?? null,
    rotation: properties.rotation ?? 0,
    height: centerHeight,
    state: properties.state ?? null,
    size: resolvedSize ? [...resolvedSize] : null,
  });
  notify();
}

export function updateObject(x, z, level, updates = {}) {
  const room = getCurrentRoom();
  const currentLevel = normalizeBlockLevel(level ?? DEFAULT_BLOCK_LEVEL);
  const key = blockKeyOf(x, z, currentLevel);
  const current = room.objects.get(key);
  if (!current) {
    return;
  }
  const next = {
    ...current,
    ...updates,
  };
  if (Array.isArray(next.size)) {
    next.size = [...next.size];
  } else if (Array.isArray(current.size)) {
    next.size = [...current.size];
  }
  let targetLevel = normalizeBlockLevel(next.level ?? currentLevel);
  next.level = targetLevel;
  const sizeY = Array.isArray(next.size) ? Number(next.size[1]) || 1 : 1;
  if (typeof next.height !== "number" || !Number.isFinite(next.height)) {
    const baseOffset = (current.height ?? currentLevel + sizeY / 2) - currentLevel;
    next.height = targetLevel + baseOffset;
  }
  if (typeof next.height === "number") {
    next.height = Math.max(0.25, next.height);
  }
  const targetKey = blockKeyOf(x, z, targetLevel);
  if (targetLevel !== currentLevel) {
    room.objects.delete(key);
    room.objects.set(targetKey, next);
  } else {
    room.objects.set(key, next);
  }
  notify();
}

export function placeLight(x, z, properties = {}) {
  if (!isInBounds(x, z)) {
    return;
  }
  const room = getCurrentRoom();
  const level = normalizeBlockLevel(properties.level);
  const key = blockKeyOf(x, z, level);
  room.lights.set(key, {
    level,
    presetId: properties.presetId ?? null,
    color: properties.color ?? "#ffffff",
    intensity: properties.intensity ?? 1,
    height: properties.height ?? level + 2,
  });
  notify();
}

export function updateLight(x, z, level, updates = {}) {
  const room = getCurrentRoom();
  const currentLevel = normalizeBlockLevel(level ?? DEFAULT_BLOCK_LEVEL);
  const key = blockKeyOf(x, z, currentLevel);
  const current = room.lights.get(key);
  if (!current) {
    return;
  }
  const next = {
    ...current,
    ...updates,
  };
  if (typeof next.height === "number" && !Number.isFinite(next.height)) {
    next.height = current.height ?? (current.level ?? 0) + 2;
  }
  let targetLevel = normalizeBlockLevel(next.level ?? currentLevel);
  next.level = targetLevel;
  const targetKey = blockKeyOf(x, z, targetLevel);
  if (targetLevel !== currentLevel) {
    room.lights.delete(key);
    room.lights.set(targetKey, next);
  } else {
    room.lights.set(key, next);
  }
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

export function eraseAt(x, z, level = null) {
  if (!isInBounds(x, z)) {
    return;
  }
  const room = getCurrentRoom();
  const levelArg = level === null || level === undefined ? null : normalizeBlockLevel(level);
  deleteBlocksAtTile(room, x, z, levelArg);
  deleteCratesAtTile(room, x, z, levelArg);
  deleteObjectsAtTile(room, x, z, levelArg);
  deleteLightsAtTile(room, x, z, levelArg);
  deleteDoorsAtTile(room, x, z, levelArg);
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

export function setAmbientColor(color) {
  const room = getCurrentRoom();
  const normalised = normalizeHexColor(color, room.ambientColor ?? "#ffffff");
  if (room.ambientColor === normalised) {
    return;
  }
  room.ambientColor = normalised;
  notify();
}

export function setAmbientIntensity(intensity) {
  const room = getCurrentRoom();
  const clamped = clampAmbientIntensity(intensity, room.ambientIntensity ?? 0.65);
  if (room.ambientIntensity === clamped) {
    return;
  }
  room.ambientIntensity = clamped;
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
  const requestedLevel = normalizeBlockLevel(
    properties.level ?? DEFAULT_BLOCK_LEVEL,
  );
  let existingEntry = room.doors.get(doorKeyOf(x, z, requestedLevel)) ?? null;
  let existingKey = existingEntry ? doorKeyOf(x, z, existingEntry.level ?? requestedLevel) : null;
  if (!existingEntry) {
    for (const [entryKey, door] of room.doors.entries()) {
      const info = parseDoorKey(entryKey);
      if (info.x === x && info.z === z) {
        existingEntry = door;
        existingKey = entryKey;
        break;
      }
    }
  }
  const level = normalizeBlockLevel(properties.level ?? existingEntry?.level ?? DEFAULT_BLOCK_LEVEL);
  const key = doorKeyOf(x, z, level);

  if (existingKey && existingKey !== key) {
    room.doors.delete(existingKey);
  }

  deleteBlocksAtTile(room, x, z, level);
  deleteCratesAtTile(room, x, z, level);
  deleteObjectsAtTile(room, x, z, level);
  deleteLightsAtTile(room, x, z, level);

  const orientation = properties.orientation ?? existingEntry?.orientation ?? "north";
  const openingWidth = properties.openingWidth ?? existingEntry?.openingWidth ?? 1;
  const lintelHeight = properties.lintelHeight ?? existingEntry?.lintelHeight ?? 0.5;
  const material = properties.material ?? existingEntry?.material ?? "door";
  const id =
    properties.id ??
    existingEntry?.id ??
    `door-${state.currentRoomId}-${x}-${z}-${level}-${orientation}`;
  const spawnId = properties.spawnId ?? existingEntry?.spawnId ?? `${id}-spawn`;
  const targetSpawnId = properties.targetSpawnId ?? existingEntry?.targetSpawnId ?? "";

  room.doors.set(key, {
    id,
    orientation,
    targetRoom: properties.targetRoom ?? existingEntry?.targetRoom ?? "",
    targetDoor: properties.targetDoor ?? existingEntry?.targetDoor ?? "",
    openingWidth,
    lintelHeight,
    material,
    spawnId,
    targetSpawnId,
    level,
  });
  notify();
}

export function updateDoor(x, z, level, updates = {}) {
  const room = getCurrentRoom();
  const initialLevel = normalizeBlockLevel(level ?? DEFAULT_BLOCK_LEVEL);
  const key = doorKeyOf(x, z, initialLevel);
  let current = room.doors.get(key);
  let currentKey = key;
  if (!current) {
    for (const [entryKey, door] of room.doors.entries()) {
      const info = parseDoorKey(entryKey);
      if (info.x === x && info.z === z) {
        current = door;
        currentKey = entryKey;
        break;
      }
    }
  }
  if (!current) {
    return;
  }
  const updated = {
    ...current,
    ...updates,
  };

  if (typeof updated.level === "number") {
    updated.level = normalizeBlockLevel(updated.level);
  } else if (typeof current.level === "number") {
    updated.level = normalizeBlockLevel(current.level);
  } else {
    updated.level = initialLevel;
  }

  const hasCustomSpawnId = current.spawnId && !current.spawnId.startsWith(`${current.id}-spawn`);
  if (!updates.spawnId && !hasCustomSpawnId) {
    updated.spawnId = `${updated.id}-spawn`;
  }

  const nextKey = doorKeyOf(x, z, updated.level ?? initialLevel);
  if (currentKey !== nextKey) {
    room.doors.delete(currentKey);
  }
  room.doors.set(nextKey, updated);
  notify();
}

export function removeDoor(x, z, level = null) {
  const room = getCurrentRoom();
  if (level === null || level === undefined) {
    deleteDoorsAtTile(room, x, z, null);
    notify();
    return;
  }
  const key = doorKeyOf(x, z, normalizeBlockLevel(level));
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
      ambient: {
        color: room.ambientColor ?? "#ffffff",
        intensity: room.ambientIntensity ?? 0.65,
      },
      blocks: Array.from(room.blocks.entries()).map(([key, value]) => {
        const { x, z, level } = parseBlockKey(key);
        return {
          x,
          z,
          level,
          height: value.height,
          material: value.material,
          tiles: value.tiles,
          presetId: value.presetId,
        };
      }),
      crates: Array.from(room.crates.entries()).map(([key, value]) => {
        const { x, z, level } = parseBlockKey(key);
        const data = value && typeof value === "object" ? value : {};
        return {
          x,
          z,
          level,
          presetId: data.presetId ?? null,
          tiles: data.tiles ?? {},
          height: data.height ?? CRATE_SIZE,
        };
      }),
      objects: Array.from(room.objects.entries()).map(([key, value]) => {
        const { x, z, level } = parseBlockKey(key);
        return {
          x,
          z,
          level,
          presetId: value.presetId ?? null,
          rotation: value.rotation ?? 0,
          height: value.height ?? 0,
          state: value.state ?? null,
          size: Array.isArray(value.size) ? [...value.size] : null,
        };
      }),
      lights: Array.from(room.lights.entries()).map(([key, value]) => {
        const { x, z, level } = parseBlockKey(key);
        return {
          x,
          z,
          level,
          presetId: value.presetId ?? null,
          color: value.color ?? "#ffffff",
          intensity: value.intensity ?? 1,
          height: value.height ?? 2,
        };
      }),
      doors: Array.from(room.doors.entries()).map(([key, value]) => {
        const { x, z, level } = parseDoorKey(key);
        return {
          x,
          z,
          level,
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

    if (!roomData.player && Array.isArray(room.spawn) && room.spawn.length >= 3) {
      const spawnX = toGrid(room.spawn[0], xOffset);
      const spawnZ = toGrid(room.spawn[2], zOffset);
      if (Number.isFinite(spawnX) && Number.isFinite(spawnZ)) {
        room.player = { x: spawnX, z: spawnZ };
      }
    }

    (roomData.blocks ?? []).forEach((block) => {
      const worldPos = block.position;
      const x = typeof block?.x === "number" ? block.x : Array.isArray(worldPos) ? toGrid(worldPos[0], xOffset) : null;
      const z = typeof block?.z === "number" ? block.z : Array.isArray(worldPos) ? toGrid(worldPos[2], zOffset) : null;
      if (x === null || z === null) {
        return;
      }

      const tileOverrides = resolveTileOverrideIds(block.tiles);
      const sizeY = Array.isArray(block.size) ? Number(block.size[1]) || 1 : Number(block.height) || 1;
      const centerY = Array.isArray(worldPos) ? Number(worldPos[1]) || sizeY / 2 : Number(block.centerY) || sizeY / 2;
      const inferredLevel = normalizeBlockLevel(
        typeof block.level === "number" ? block.level : Math.round(centerY - sizeY / 2),
      );
      room.blocks.set(blockKeyOf(x, z, inferredLevel), {
        level: inferredLevel,
        height: sizeY,
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
      const sizeY = Array.isArray(crate.size) ? Number(crate.size[1]) || CRATE_SIZE : CRATE_SIZE;
      const centerY = Array.isArray(worldPos) ? Number(worldPos[1]) || sizeY / 2 : sizeY / 2;
      const inferredLevel = normalizeBlockLevel(
        typeof crate.level === "number" ? crate.level : Math.round(centerY - sizeY / 2),
      );
      room.crates.set(blockKeyOf(x, z, inferredLevel), {
        level: inferredLevel,
        height: sizeY,
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
      const definition = getModelDefinition(object.presetId ?? object.id ?? null);
      const resolvedSize = Array.isArray(object.size)
        ? object.size.map((value) => Number(value) || 0)
        : definition?.size
        ? [...definition.size]
        : [1, 1, 1];
      while (resolvedSize.length < 3) {
        resolvedSize.push(1);
      }
      const sizeY = resolvedSize[1] ?? 1;
      const centerY = Array.isArray(worldPos)
        ? Number(worldPos[1]) || sizeY / 2
        : typeof object.height === "number"
        ? object.height
        : sizeY / 2;
      const inferredLevel = normalizeBlockLevel(
        typeof object.level === "number" ? object.level : Math.round(centerY - sizeY / 2),
      );
      room.objects.set(blockKeyOf(x, z, inferredLevel), {
        level: inferredLevel,
        presetId: object.presetId ?? object.id ?? null,
        rotation: object.rotation ?? 0,
        height: centerY,
        state: object.state ?? null,
        size: resolvedSize,
      });
    });

    (roomData.lights ?? []).forEach((light) => {
      const worldPos = light.position;
      const x = typeof light?.x === "number" ? light.x : Array.isArray(worldPos) ? toGrid(worldPos[0], xOffset) : null;
      const z = typeof light?.z === "number" ? light.z : Array.isArray(worldPos) ? toGrid(worldPos[2], zOffset) : null;
      if (x === null || z === null) {
        return;
      }
      const height = Array.isArray(worldPos) ? Number(worldPos[1]) || 2 : Number(light.height) || 2;
      const inferredLevel = normalizeBlockLevel(
        typeof light.level === "number" ? light.level : Math.max(0, Math.floor(height - 1)),
      );
      room.lights.set(blockKeyOf(x, z, inferredLevel), {
        level: inferredLevel,
        presetId: light.presetId ?? light.id ?? null,
        color: light.color ?? light.hex ?? "#ffffff",
        intensity: light.intensity ?? 1,
        height,
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
      const frameHeight = Array.isArray(door.size) ? Number(door.size[1]) || DEFAULT_DOOR_HEIGHT : DEFAULT_DOOR_HEIGHT;
      const centerY = Array.isArray(worldPos)
        ? Number(worldPos[1]) || frameHeight / 2
        : typeof door.centerY === "number"
        ? door.centerY
        : (door.level ?? 0) + frameHeight / 2;
      const inferredLevel = normalizeBlockLevel(
        typeof door.level === "number" ? door.level : Math.round(centerY - frameHeight / 2),
      );
      room.doors.set(doorKeyOf(x, z, inferredLevel), {
        id: doorId,
        orientation: door.orientation ?? "north",
        targetRoom: door.targetRoom ?? target.room ?? "",
        targetDoor: door.targetDoor ?? target.door ?? "",
        openingWidth: door.openingWidth ?? 1,
        lintelHeight: door.lintelHeight ?? 0.5,
        material: door.material ?? "door",
        spawnId: door.spawnId ?? `${doorId}-spawn`,
        targetSpawnId: door.targetSpawnId ?? target.spawnId ?? "",
        level: inferredLevel,
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

    const ambientSource = roomData.ambientLight ?? roomData.ambient ?? {};
    room.ambientColor = normalizeHexColor(ambientSource.color, room.ambientColor ?? "#ffffff");
    room.ambientIntensity = clampAmbientIntensity(
      ambientSource.intensity ?? room.ambientIntensity ?? 0.65,
      room.ambientIntensity ?? 0.65,
    );

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

function blockKeyOf(x, z, level = DEFAULT_BLOCK_LEVEL) {
  return `${x},${z},${level}`;
}

function parseBlockKey(key) {
  const [xStr, zStr, levelStr] = key.split(",");
  const x = Number(xStr);
  const z = Number(zStr);
  const levelNumeric = Number(levelStr);
  return {
    x,
    z,
    level: normalizeBlockLevel(Number.isFinite(levelNumeric) ? levelNumeric : DEFAULT_BLOCK_LEVEL),
  };
}

function doorKeyOf(x, z, level = DEFAULT_BLOCK_LEVEL) {
  return blockKeyOf(x, z, level);
}

function parseDoorKey(key) {
  return parseBlockKey(key);
}

function normalizeBlockLevel(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_BLOCK_LEVEL;
  }
  return Math.max(0, Math.floor(numeric));
}

function deleteBlocksAtTile(room, x, z, level = null) {
  return deleteEntriesAtTile(room.blocks, x, z, level);
}

function deleteCratesAtTile(room, x, z, level = null) {
  return deleteEntriesAtTile(room.crates, x, z, level);
}

function deleteObjectsAtTile(room, x, z, level = null) {
  return deleteEntriesAtTile(room.objects, x, z, level);
}

function deleteLightsAtTile(room, x, z, level = null) {
  return deleteEntriesAtTile(room.lights, x, z, level);
}

function deleteDoorsAtTile(room, x, z, level = null) {
  return deleteEntriesAtTile(room.doors, x, z, level);
}

function deleteEntriesAtTile(map, x, z, level = null) {
  const keysToRemove = [];
  map.forEach((_, key) => {
    const info = parseBlockKey(key);
    if (info.x === x && info.z === z && (level === null || info.level === level)) {
      keysToRemove.push(key);
    }
  });
  keysToRemove.forEach((key) => map.delete(key));
  return keysToRemove.length;
}

function normalizeHexColor(value, fallback = "#ffffff") {
  if (typeof value !== "string") {
    return fallback;
  }
  let hex = value.trim();
  if (!hex) {
    return fallback;
  }
  if (!hex.startsWith("#")) {
    hex = `#${hex}`;
  }
  if (/^#([0-9a-fA-F]{3})$/.test(hex)) {
    const [, rgb] = hex.match(/^#([0-9a-fA-F]{3})$/) || [];
    if (rgb) {
      hex = `#${rgb[0]}${rgb[0]}${rgb[1]}${rgb[1]}${rgb[2]}${rgb[2]}`;
    }
  }
  if (/^#([0-9a-fA-F]{6})$/.test(hex)) {
    return hex.toLowerCase();
  }
  return fallback;
}

function clampAmbientIntensity(value, fallback = 0.65) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return Math.min(4, Math.max(0, numeric));
  }
  return Math.min(4, Math.max(0, Number(fallback) || 0.65));
}
