const DEFAULT_TILE_SIZE = 1;
export const DEFAULT_DOOR_HEIGHT = 2.5;
export const DEFAULT_DOOR_DEPTH = 0.5;
export const DEFAULT_POST_WIDTH = 0.5;
export const DEFAULT_OPENING_WIDTH = 1;
export const DEFAULT_LINTEL_HEIGHT = 0.5;

function sanitizeId(id) {
  if (!id) {
    return "";
  }
  return `${id}`.trim();
}

function fallbackDoorId(x, z, orientation) {
  return `door-${x}-${z}-${orientation}`;
}

export function computeDoorDefinition(door, gridMeta = {}) {
  const tileSize = gridMeta.tileSize ?? DEFAULT_TILE_SIZE;
  const width = gridMeta.width ?? 0;
  const depth = gridMeta.depth ?? 0;
  const xOffset = (width - 1) / 2;
  const zOffset = (depth - 1) / 2;

  const orientation = door.orientation ?? "north";
  const openingWidth = door.openingWidth ?? DEFAULT_OPENING_WIDTH;
  const lintelHeight = door.lintelHeight ?? DEFAULT_LINTEL_HEIGHT;
  const frameHeight = door.height ?? DEFAULT_DOOR_HEIGHT;
  const postWidth = door.postWidth ?? DEFAULT_POST_WIDTH;
  const frameDepth = door.depth ?? DEFAULT_DOOR_DEPTH;

  const worldX = (door.x - xOffset) * tileSize;
  const worldZ = (door.z - zOffset) * tileSize;

  let sizeX;
  let sizeZ;
  let centerX = worldX;
  let centerZ = worldZ;

  if (orientation === "north" || orientation === "south") {
    sizeX = openingWidth + postWidth * 2;
    sizeZ = frameDepth;
    centerZ = worldZ + (orientation === "north" ? -frameDepth / 2 : frameDepth / 2);
  } else {
    sizeX = frameDepth;
    sizeZ = openingWidth + postWidth * 2;
    centerX = worldX + (orientation === "west" ? -frameDepth / 2 : frameDepth / 2);
  }

  const position = [centerX, frameHeight / 2, centerZ];
  const size = [sizeX, frameHeight, sizeZ];

  const id = sanitizeId(door.id) || fallbackDoorId(door.x, door.z, orientation);

  const definition = {
    id,
    position,
    size,
    material: door.material ?? "door",
    solid: Boolean(door.solid),
    openingWidth,
    lintelHeight,
    orientation,
    postWidth,
    depth: frameDepth,
  };

  const targetRoom = door.targetRoom ?? door.target?.room ?? "";
  const targetDoor = door.targetDoor ?? door.target?.door ?? "";
  const targetSpawn = door.target?.spawn;
  const targetSpawnId = door.target?.spawnId ?? door.targetSpawnId;

  if (targetRoom || targetDoor || targetSpawn || targetSpawnId) {
    definition.target = {
      room: targetRoom || undefined,
      door: targetDoor || undefined,
      spawn: targetSpawn,
      spawnId: targetSpawnId,
    };
  }

  if (door.tiles) {
    definition.tiles = door.tiles;
  }

  definition.spawnId = door.spawnId ?? `${id}-spawn`;
  definition.spawn = door.spawn ?? computeDefaultDoorSpawn(position, frameDepth, orientation);

  return definition;
}

function computeDefaultDoorSpawn(position, depth, orientation) {
  const [cx, cy, cz] = position;
  const offset = depth + 0.5;
  switch (orientation) {
    case "north":
      return [cx, 0.9, cz + offset];
    case "south":
      return [cx, 0.9, cz - offset];
    case "west":
      return [cx + offset, 0.9, cz];
    case "east":
      return [cx - offset, 0.9, cz];
    default:
      return [cx, 0.9, cz];
  }
}
