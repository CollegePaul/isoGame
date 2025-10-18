import { Box3, BoxGeometry, Group, Mesh, Vector3 } from "three";
import { getMaterial } from "../render/materials.js";
import { defaultColliderMask } from "../game/physics/collisionGroups.js";

const DEFAULT_TILE_SIZE = 1;
const DEFAULT_FLOOR_HEIGHT = 0.125;

export function createRoomBuilder(roomData) {
  return () => buildRoomFromData(roomData);
}

export function buildRoomFromData(roomData) {
  const meshes = [];
  const colliders = [];
  const doorways = [];
  const dynamicEntities = [];

  const tileSize = roomData.tileSize ?? DEFAULT_TILE_SIZE;
  const spawnPoint = vectorFromArray(roomData.spawn, new Vector3(0, 0.9, 0));

  if (roomData.floor) {
    meshes.push(createFloor(roomData.floor, tileSize, colliders));
  }

  if (Array.isArray(roomData.walls)) {
    roomData.walls.forEach((wall) => {
      const wallResult = createBoxElement(wall);
      if (wallResult.mesh) {
        meshes.push(wallResult.mesh);
      }
      if (wallResult.collider) {
        colliders.push(wallResult.collider);
      }
    });
  }

  if (Array.isArray(roomData.blocks)) {
    roomData.blocks.forEach((block) => {
      const blockResult = createBoxElement(block);
      if (blockResult.mesh) {
        meshes.push(blockResult.mesh);
      }
      if (blockResult.collider) {
        colliders.push(blockResult.collider);
      }
    });
  }

  if (Array.isArray(roomData.crates)) {
    roomData.crates.forEach((crate) => {
      dynamicEntities.push({
        type: "crate",
        position: vectorFromArray(crate.position, new Vector3()),
        size: vectorFromArray(crate.size, new Vector3(0.9, 0.9, 0.9)),
        material: crate.material ?? "crate",
      });
    });
  }

  if (Array.isArray(roomData.doors)) {
    roomData.doors.forEach((door) => {
      const doorResult = createDoorElement(door);
      if (doorResult.mesh) {
        meshes.push(doorResult.mesh);
      }
      if (doorResult.collider) {
        colliders.push(doorResult.collider);
      }
      doorways.push(doorResult.doorway);
    });
  }

  return { meshes, colliders, spawnPoint, doorways, dynamicEntities };
}

function createFloor(floorData, tileSize, colliders) {
  const width = floorData.width ?? floorData.size?.[0] ?? 8;
  const depth = floorData.depth ?? floorData.size?.[1] ?? width;
  const height = floorData.height ?? DEFAULT_FLOOR_HEIGHT;
  const material = getMaterial(floorData.material ?? "floor");

  const group = new Group();
  const geometry = new BoxGeometry(tileSize, height, tileSize);

  const xOffset = (width - 1) / 2;
  const zOffset = (depth - 1) / 2;

  for (let z = 0; z < depth; z += 1) {
    for (let x = 0; x < width; x += 1) {
      const mesh = new Mesh(geometry, material);
      mesh.position.set((x - xOffset) * tileSize, -height / 2, (z - zOffset) * tileSize);
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }

  const colliderSize = new Vector3(width * tileSize, height, depth * tileSize);
  const colliderCenter = new Vector3(0, -height / 2, 0);

  colliders.push({
    center: colliderCenter,
    size: colliderSize,
    axes: floorData.axes ?? ["y"],
  });

  return group;
}

function createBoxElement(definition) {
  const size = vectorFromArray(definition.size, new Vector3(1, 1, 1));
  const position = vectorFromArray(definition.position, new Vector3());
  const axes = Array.isArray(definition.axes) && definition.axes.length > 0 ? definition.axes : ["x", "y", "z"];
  const mask = definition.mask ?? defaultColliderMask;
  const material = getMaterial(definition.material);

  let mesh = null;

  if (definition.visible !== false) {
    const geometry = new BoxGeometry(size.x, size.y, size.z);
    mesh = new Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }

  const collider = {
    center: position.clone(),
    size: size.clone(),
    axes,
    mask,
  };

  return { mesh, collider };
}

function createDoorElement(definition) {
  const size = vectorFromArray(definition.size, new Vector3(1.5, 2.5, 0.5));
  const position = vectorFromArray(definition.position, new Vector3());
  const material = getMaterial(definition.material ?? "door");
  const visible = definition.visible !== false;
  const solid = definition.solid === true;
  const axes = Array.isArray(definition.axes) && definition.axes.length > 0 ? definition.axes : ["x", "y", "z"];
  const mask = definition.mask ?? defaultColliderMask;
  const targetDefinition = definition.target ?? null;
  const targetRoom = typeof targetDefinition === "string" ? targetDefinition : targetDefinition?.room ?? null;
  const targetDoor = targetDefinition && typeof targetDefinition === "object" ? targetDefinition.door ?? null : null;
  const spawnOverride = definition.spawn
    ? vectorFromArray(definition.spawn, null)
    : targetDefinition && typeof targetDefinition === "object" && Array.isArray(targetDefinition.spawn)
    ? vectorFromArray(targetDefinition.spawn, null)
    : null;

  let mesh = null;
  if (visible) {
    const geometry = new BoxGeometry(size.x, size.y, size.z);
    mesh = new Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }

  const doorway = {
    id: definition.id ?? `door-${Math.random().toString(36).slice(2, 8)}`,
    box: new Box3().setFromCenterAndSize(position.clone(), size.clone()),
    target: targetRoom,
    targetDoor,
    spawn: spawnOverride,
  };

  const collider = solid
    ? {
        center: position.clone(),
        size: size.clone(),
        axes,
        mask,
      }
    : null;

  return { mesh, collider, doorway };
}

function vectorFromArray(array, fallback) {
  if (!Array.isArray(array) || array.length < 3) {
    return fallback instanceof Vector3 ? fallback.clone() : fallback;
  }
  return new Vector3(array[0], array[1], array[2]);
}
