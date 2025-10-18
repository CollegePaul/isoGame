const TILE_SIZE = 1;
const FLOOR_HEIGHT = 0.125;
const WALL_THICKNESS = 0.25;
const WALL_HEIGHT = 3;
const PLAYER_HEIGHT = 1.6;
const PLAYER_SPAWN_Y = PLAYER_HEIGHT * 0.5625; // ~0.9, keeps same feel
const CRATE_SIZE = 0.9;

export function buildRoomDefinition(snapshot) {
  const { width, depth, blocks, crates, player } = snapshot;
  const xOffset = (width - 1) / 2;
  const zOffset = (depth - 1) / 2;

  const toWorldPosition = (x, z) => ({
    x: (x - xOffset) * TILE_SIZE,
    z: (z - zOffset) * TILE_SIZE,
  });

  const solidBlocks = blocks.map(({ x, z, height }) => {
    const { x: worldX, z: worldZ } = toWorldPosition(x, z);
    const blockHeight = Math.max(1, Math.min(3, height));
    return {
      position: [worldX, blockHeight / 2, worldZ],
      size: [1, blockHeight, 1],
      material: blockHeight > 1 ? "blockTall" : "block",
    };
  });

  const crateEntries = crates.map(({ x, z }) => {
    const { x: worldX, z: worldZ } = toWorldPosition(x, z);
    return {
      position: [worldX, CRATE_SIZE / 2, worldZ],
      size: [CRATE_SIZE, CRATE_SIZE, CRATE_SIZE],
      material: "crate",
    };
  });

  const spawnPosition = player
    ? (() => {
        const { x: worldX, z: worldZ } = toWorldPosition(player.x, player.z);
        return [worldX, PLAYER_SPAWN_Y, worldZ];
      })()
    : [0, PLAYER_SPAWN_Y, 0];

  const walls = createWalls(width, depth);

  return {
    name: "editor-room",
    tileSize: TILE_SIZE,
    spawn: spawnPosition,
    floor: {
      width,
      depth,
      height: FLOOR_HEIGHT,
      material: "floor",
      axes: ["y"],
    },
    walls,
    blocks: solidBlocks,
    crates: crateEntries,
    doors: [],
  };
}

function createWalls(width, depth) {
  const halfWidth = (width * TILE_SIZE) / 2;
  const halfDepth = (depth * TILE_SIZE) / 2;

  return [
    {
      position: [-halfWidth - WALL_THICKNESS / 2, WALL_HEIGHT / 2, 0],
      size: [WALL_THICKNESS, WALL_HEIGHT, depth],
      axes: ["x", "y"],
      visible: false,
    },
    {
      position: [halfWidth + WALL_THICKNESS / 2, WALL_HEIGHT / 2, 0],
      size: [WALL_THICKNESS, WALL_HEIGHT, depth],
      axes: ["x", "y"],
      visible: false,
    },
    {
      position: [0, WALL_HEIGHT / 2, -halfDepth - WALL_THICKNESS / 2],
      size: [width + WALL_THICKNESS * 2, WALL_HEIGHT, WALL_THICKNESS],
      axes: ["z", "y"],
      visible: true,
      material: "wall",
    },
    {
      position: [0, WALL_HEIGHT / 2, halfDepth + WALL_THICKNESS / 2],
      size: [width + WALL_THICKNESS * 2, WALL_HEIGHT, WALL_THICKNESS],
      axes: ["z", "y"],
      visible: false,
    },
  ];
}

export function snapshotToJson(snapshot) {
  return JSON.stringify(buildRoomDefinition(snapshot), null, 2);
}
