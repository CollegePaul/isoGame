import { computeDoorDefinition } from "../data/doorRuntime.js";
import { resolveFaceTiles, getDefaultPresetIdForUsage } from "../data/blockPresets.js";
import { getTileById } from "../data/tiles.js";

const TILE_SIZE = 1;
const FLOOR_HEIGHT = 0.125;
const WALL_THICKNESS = 0.25;
const WALL_HEIGHT = 3;
const PLAYER_HEIGHT = 1.6;
const PLAYER_SPAWN_Y = PLAYER_HEIGHT * 0.5625; // ~0.9, keeps same feel
const CRATE_SIZE = 0.9;

export function buildRoomDefinition(snapshot) {
  const {
    width,
    depth,
    blocks,
    crates,
    objects,
    lights,
    doors,
    player,
    roomId,
    spawnId,
    spawn,
    floor,
    wallHeight,
    wallThickness,
  } = snapshot;
  const xOffset = (width - 1) / 2;
  const zOffset = (depth - 1) / 2;

  const toWorldPosition = (x, z) => ({
    x: (x - xOffset) * TILE_SIZE,
    z: (z - zOffset) * TILE_SIZE,
  });

  const solidBlocks = blocks.map(({ x, z, height, material, tiles, presetId }) => {
    const { x: worldX, z: worldZ } = toWorldPosition(x, z);
    const blockHeight = Math.max(1, Math.min(3, height));
    const faceTiles = buildFaceTileDescriptors(tiles, presetId);
    const entry = {
      position: [worldX, blockHeight / 2, worldZ],
      size: [1, blockHeight, 1],
      material: material ?? presetId ?? "block",
      presetId: presetId ?? null,
    };
    if (faceTiles) {
      entry.tiles = faceTiles;
    }
    return entry;
  });

  const crateEntries = crates.map(({ x, z, material, tiles, presetId }) => {
    const { x: worldX, z: worldZ } = toWorldPosition(x, z);
    const faceTiles = buildFaceTileDescriptors(tiles, presetId);
    return {
      position: [worldX, CRATE_SIZE / 2, worldZ],
      size: [CRATE_SIZE, CRATE_SIZE, CRATE_SIZE],
      material: material ?? presetId ?? "crate",
      presetId: presetId ?? null,
      tiles: faceTiles ?? undefined,
    };
  });

  const objectEntries = (objects ?? []).map(({ x, z, presetId, rotation, height }) => {
    const { x: worldX, z: worldZ } = toWorldPosition(x, z);
    const centerY = height ?? 0;
    return {
      position: [worldX, centerY, worldZ],
      size: [1, 1, 1],
      presetId: presetId ?? null,
      rotation: rotation ?? 0,
    };
  });

  const lightEntries = (lights ?? []).map(({ x, z, presetId, color, intensity, height }) => {
    const { x: worldX, z: worldZ } = toWorldPosition(x, z);
    return {
      position: [worldX, height ?? 2, worldZ],
      presetId: presetId ?? null,
      color: color ?? "#ffffff",
      intensity: intensity ?? 1,
      type: "point",
    };
  });

  const spawnPosition = player
    ? (() => {
        const { x: worldX, z: worldZ } = toWorldPosition(player.x, player.z);
        return [worldX, PLAYER_SPAWN_Y, worldZ];
      })()
    : spawn ?? [0, PLAYER_SPAWN_Y, 0];

  const resolvedWallHeight = Math.max(1, Math.floor(wallHeight ?? WALL_HEIGHT));
  const resolvedWallThickness = Math.min(0.75, Math.max(0.1, Number(wallThickness ?? WALL_THICKNESS)));

  const walls = createWalls(width, depth, resolvedWallHeight, resolvedWallThickness);

  const doorEntries = doors.map((door) =>
    computeDoorDefinition(
      {
        ...door,
      },
      {
        width,
        depth,
        tileSize: TILE_SIZE,
      },
    ),
  );

  return {
    name: roomId ?? "editor-room",
    tileSize: TILE_SIZE,
    spawn: spawnPosition,
    spawnId: spawnId ?? `${roomId}-spawn`,
    floor: buildFloorDefinition(width, depth, floor),
    walls,
    wallHeight: resolvedWallHeight,
    wallThickness: resolvedWallThickness,
    blocks: solidBlocks,
    crates: crateEntries,
    objects: objectEntries,
    lights: lightEntries,
    doors: doorEntries,
  };
}

function buildFloorDefinition(width, depth, floorState) {
  const height = floorState?.height ?? FLOOR_HEIGHT;
  const defaultPresetId = floorState?.presetId ?? getDefaultPresetIdForUsage("floor");
  const defaultTiles = buildFaceTileDescriptors(null, defaultPresetId);
  const tileEntries = (floorState?.tiles ?? [])
    .map((tile) => {
      if (typeof tile?.x !== "number" || typeof tile?.z !== "number") {
        return null;
      }
      const descriptor = buildFaceTileDescriptors(tile.tiles, tile.presetId ?? defaultPresetId);
      const entry = {
        x: tile.x,
        z: tile.z,
        presetId: tile.presetId ?? defaultPresetId,
      };
      if (descriptor) {
        entry.tiles = descriptor;
      }
      return entry;
    })
    .filter(Boolean);

  const result = {
    width,
    depth,
    height,
    material: floorState?.material ?? "floor",
    axes: ["y"],
    presetId: defaultPresetId,
  };

  if (defaultTiles) {
    result.defaultTiles = defaultTiles;
  }
  if (tileEntries.length > 0) {
    result.tiles = tileEntries;
  }

  return result;
}


function buildFaceTileDescriptors(tileIds, presetId) {
  const descriptors = {};
  const base = resolveFaceTiles(presetId) || {};
  Object.entries(base).forEach(([face, tile]) => {
    if (tile) {
      descriptors[face] = { id: tile.id, col: tile.col, row: tile.row };
    }
  });
  Object.entries(tileIds || {}).forEach(([face, tileId]) => {
    const tile = getTileById(tileId);
    if (tile) {
      descriptors[face] = { id: tile.id, col: tile.col, row: tile.row };
    }
  });
  return Object.keys(descriptors).length > 0 ? descriptors : null;
}
function createWalls(width, depth, height = WALL_HEIGHT, thickness = WALL_THICKNESS) {
  const halfWidth = (width * TILE_SIZE) / 2;
  const halfDepth = (depth * TILE_SIZE) / 2;

  return [
    {
      position: [-halfWidth - WALL_THICKNESS / 2, height / 2, 0],
      size: [thickness, height, depth],
      axes: ["x", "y"],
      visible: false,
    },
    {
      position: [halfWidth + WALL_THICKNESS / 2, height / 2, 0],
      size: [thickness, height, depth],
      axes: ["x", "y"],
      visible: false,
    },
    {
      position: [0, height / 2, -halfDepth - WALL_THICKNESS / 2],
      size: [width + thickness * 2, height, thickness],
      axes: ["z", "y"],
      visible: true,
      material: "wall",
    },
    {
      position: [0, height / 2, halfDepth + WALL_THICKNESS / 2],
      size: [width + thickness * 2, height, thickness],
      axes: ["z", "y"],
      visible: false,
    },
  ];
}

export function snapshotToJson(snapshot) {
  return JSON.stringify(buildRoomDefinition(snapshot), null, 2);
}


export function projectToJson(projectSnapshot) {
  const rooms = projectSnapshot.rooms.map((room) => buildRoomDefinition(room));
  return JSON.stringify({ rooms }, null, 2);
}
