import { Box3, Color, Group, Mesh, MeshBasicMaterial, PointLight, SphereGeometry, Vector3 } from "three";
import { getMaterial } from "../render/materials.js";
import { defaultColliderMask } from "../game/physics/collisionGroups.js";
import { createBoxGeometryWithUVs } from "../render/atlas.js";
import { getObjectVariants, loadObjectLibrary } from "../render/objectLibrary.js";
import { getModelDefinition } from "../data/models.js";

const DEFAULT_TILE_SIZE = 1;
const DEFAULT_FLOOR_HEIGHT = 0.125;
const floorGeometryCache = new Map();
const lightIndicatorGeometry = new SphereGeometry(0.15, 16, 16);
const doorPlugMaterial = new MeshBasicMaterial({
  color: 0x080b12,
  transparent: true,
  opacity: 0.96,
  depthWrite: false,
});
doorPlugMaterial.name = "doorPlug";

const DOOR_INWARD_NORMALS = {
  north: new Vector3(0, 0, 1),
  south: new Vector3(0, 0, -1),
  west: new Vector3(1, 0, 0),
  east: new Vector3(-1, 0, 0),
};

export function createRoomBuilder(roomData) {
  return () => buildRoomFromData(roomData);
}

export function buildRoomFromData(roomData) {
  const meshes = [];
  const colliders = [];
  const doorways = [];
  const dynamicEntities = [];
  const spawnPoints = new Map();
  const ambientSettings = normalizeAmbientLight(roomData.ambientLight ?? roomData.ambient);

  const tileSize = roomData.tileSize ?? DEFAULT_TILE_SIZE;
  const spawnPoint = vectorFromArray(roomData.spawn, new Vector3(0, 0.9, 0));
  const spawnId = roomData.spawnId ?? "default";
  spawnPoints.set(spawnId, spawnPoint.clone());

  if (roomData.floor) {
    meshes.push(createFloor(roomData.floor, tileSize, colliders));
  }

  const floorWidth = roomData.floor?.width ?? roomData.width ?? 8;
  const floorDepth = roomData.floor?.depth ?? roomData.depth ?? 8;
  const hasPerimeterWalls =
    typeof roomData.wallHeight === "number" || typeof roomData.wallThickness === "number";

  if (hasPerimeterWalls && floorWidth && floorDepth) {
    const perimeter = createPerimeterWalls({
      width: floorWidth,
      depth: floorDepth,
      height: roomData.wallHeight ?? 3,
      thickness: roomData.wallThickness ?? 0.25,
      tileSize,
    });
    if (perimeter) {
      meshes.push(perimeter.group);
      colliders.push(...perimeter.colliders);
    }
  }

  if (Array.isArray(roomData.walls) && !hasPerimeterWalls) {
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

  if (Array.isArray(roomData.objects) && roomData.objects.length > 0) {
    const objectGroup = new Group();
    meshes.push(objectGroup);

    const pendingObjects = [];

    roomData.objects.forEach((object, index) => {
      const definition = getModelDefinition(object.presetId ?? object.id);
      const worldPosition =
        vectorFromArray(object.position, null) ?? new Vector3(object.x ?? 0, object.height ?? 0, object.z ?? 0);
      const sizeArray =
        object.size ?? definition?.size ?? [1, definition?.size?.[1] ?? 1, definition?.size?.[2] ?? 1];
      const sizeVector = new Vector3(sizeArray[0] ?? 1, sizeArray[1] ?? 1, sizeArray[2] ?? 1);
      const isCollectable = definition?.collectable ?? false;
      const isSolid = definition?.solid ?? true;
      const baseId = object.id ?? object.presetId ?? definition?.id ?? `object-${index}`;
      const uniqueId = `${roomData.name ?? "room"}-${baseId}-${index}`;
      const metadata = {
        id: definition?.id ?? baseId,
        label: definition?.label ?? baseId,
        description: definition?.description ?? "",
        collectable: Boolean(isCollectable),
        solid: Boolean(isSolid && !isCollectable),
        requirements: Array.isArray(definition?.requirements) ? [...definition.requirements] : [],
        transformsTo: definition?.transformsTo ?? null,
        defaultState: definition?.defaultState ?? "default",
        interactions: definition?.interactions ?? null,
        tags: Array.isArray(definition?.tags) ? [...definition.tags] : [],
      };

      const baseEntry = {
        type: isCollectable ? "collectable" : "object",
        id: uniqueId,
        position: worldPosition.clone(),
        size: sizeVector.clone(),
        metadata,
        mesh: null,
        meshPosition: worldPosition.clone(),
        state: object.state ?? metadata.defaultState,
        collected: Boolean(object.collected ?? false),
        room: roomData.name ?? null,
        __listeners: [],
      };
      dynamicEntities.push(baseEntry);

      let blocker = null;
      let colliderEntry = null;
      if (isSolid && !isCollectable) {
        const blockerGeometry = createBoxGeometryWithUVs(sizeVector.x, sizeVector.y, sizeVector.z, { default: "wall" });
        blocker = new Mesh(blockerGeometry, getMaterial("wall"));
        blocker.visible = false;
        blocker.position.copy(worldPosition);
        objectGroup.add(blocker);

        colliderEntry = {
          center: worldPosition.clone(),
          size: sizeVector.clone(),
          axes: ["x", "y", "z"],
          mask: defaultColliderMask,
        };
        colliders.push(colliderEntry);
      }

      pendingObjects.push({
        object,
        definition,
        worldPosition,
        sizeVector,
        isCollectable,
        isSolid,
        uniqueId,
        roomName: roomData.name ?? null,
        baseEntry,
        blocker,
        colliderEntry,
      });
    });

    loadObjectLibrary()
      .then(() => getObjectVariants())
      .then((loadedVariants) => {
        const variantLookup = new Map(loadedVariants.map((variant) => [variant.id, variant]));
        pendingObjects.forEach(
          ({
            object,
            definition,
            worldPosition,
            sizeVector,
            isCollectable,
            isSolid,
            uniqueId,
            roomName,
            baseEntry,
            blocker,
            colliderEntry,
          }) => {
          const variant = variantLookup.get(object.presetId ?? object.id) || loadedVariants[0] || null;
          if (variant) {
            baseEntry.centerOffset = variant.centerOffset
              ? {
                  x: variant.centerOffset.x ?? 0,
                  y: variant.centerOffset.y ?? 0,
                  z: variant.centerOffset.z ?? 0,
                }
              : null;
            baseEntry.baseOffset =
              typeof variant.baseOffset === "number" ? variant.baseOffset : baseEntry.baseOffset ?? null;
          }
          let instance = null;
          if (variant) {
            instance = variant.createInstance();
          }
          if (!instance) {
            instance = new Mesh(createBoxGeometryWithUVs(1, 1, 1, { default: "block" }), getMaterial("default"));
          }
          instance.traverse?.((node) => {
            if (node.isMesh) {
              node.castShadow = true;
              node.receiveShadow = true;
            }
          });
          instance.position.copy(worldPosition);
          if (variant?.centerOffset) {
            instance.position.x -= variant.centerOffset.x ?? 0;
            instance.position.y -= variant.centerOffset.y ?? 0;
            instance.position.z -= variant.centerOffset.z ?? 0;
          } else if (variant?.baseOffset) {
            instance.position.y -= variant.baseOffset;
          }
          instance.rotation.y = object.rotation ?? 0;
          instance.userData.objectId = uniqueId;
          instance.userData.presetId = object.presetId ?? object.id ?? variant?.id ?? definition?.id ?? null;
          instance.userData.collectable = Boolean(isCollectable);
          instance.userData.dynamicEntityId = uniqueId;

          objectGroup.add(instance);
          const centerPosition = worldPosition.clone();
          const meshPosition = instance.position.clone();
          if (baseEntry.position instanceof Vector3) {
            baseEntry.position.copy(centerPosition);
          } else {
            baseEntry.position = centerPosition;
          }
          if (baseEntry.size instanceof Vector3) {
            baseEntry.size.copy(sizeVector);
          } else {
            baseEntry.size = sizeVector.clone();
          }
          if (baseEntry.meshPosition instanceof Vector3) {
            baseEntry.meshPosition.copy(meshPosition);
          } else {
            baseEntry.meshPosition = meshPosition;
          }
          baseEntry.mesh = instance;
          baseEntry.metadata = {
            ...baseEntry.metadata,
            id: definition?.id ?? variant?.id ?? baseEntry.metadata?.id ?? uniqueId,
            label: definition?.label ?? variant?.label ?? baseEntry.metadata?.label ?? uniqueId,
            description: definition?.description ?? variant?.description ?? baseEntry.metadata?.description ?? "",
          };
          if (blocker) {
            blocker.position.copy(centerPosition);
          }
          if (colliderEntry?.center) {
            colliderEntry.center.copy(centerPosition);
          }
          baseEntry.state = object.state ?? baseEntry.metadata?.defaultState ?? "default";
          if (baseEntry.type === "collectable" && baseEntry.collected) {
            instance.visible = false;
          }
          notifyDynamicEntry(baseEntry);
        },
        );
      })
      .catch((error) => {
        console.error("Failed to populate objects:", error);
      });
  }

  if (Array.isArray(roomData.lights) && roomData.lights.length > 0) {
    const lightsGroup = new Group();
    meshes.push(lightsGroup);
    roomData.lights.forEach((light) => {
      const position = vectorFromArray(light.position, new Vector3(0, 2, 0));
      const color = new Color(light.color ?? "#ffffff");
      const intensity = light.intensity ?? 1;
      const point = new PointLight(color, intensity, 10, 2);
      point.position.copy(position);
      point.castShadow = false;

      const indicatorMaterial = new MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });
      const indicator = new Mesh(lightIndicatorGeometry, indicatorMaterial);
      indicator.position.copy(position);

      const group = new Group();
      group.add(point, indicator);
      lightsGroup.add(group);
    });
  }

  if (Array.isArray(roomData.doors)) {
    roomData.doors.forEach((door) => {
      const doorResult = createDoorElement(door);
      doorResult.meshes?.forEach((mesh) => meshes.push(mesh));
      doorResult.colliders?.forEach((collider) => colliders.push(collider));
      doorways.push(doorResult.doorway);
      if (doorResult.doorway.spawn) {
        spawnPoints.set(doorResult.doorway.spawnId ?? `${doorResult.doorway.id}-spawn`, doorResult.doorway.spawn.clone());
      }
    });
  }

  return { meshes, colliders, spawnPoint, spawnId, spawnPoints, doorways, dynamicEntities, ambient: ambientSettings };
}

function createPerimeterWalls({ width, depth, height, thickness, tileSize }) {
  if (!width || !depth) {
    return null;
  }

  const group = new Group();
  group.name = "PerimeterWalls";
  const colliders = [];
  const material = getMaterial("wall");

  const wallHeight = Math.max(1, height ?? 3);
  const wallThickness = Math.max(0.1, thickness ?? 0.25);
  const segmentLength = tileSize;
  const thicknessWorld = wallThickness * tileSize;
  const halfHeight = wallHeight / 2;
  const xOffset = (width - 1) / 2;
  const zOffset = (depth - 1) / 2;

  const westGeometry = createBoxGeometryWithUVs(thicknessWorld, wallHeight, segmentLength, { default: "wall" });
  const northGeometry = createBoxGeometryWithUVs(segmentLength, wallHeight, thicknessWorld, { default: "wall" });

  const westX = (-xOffset - 0.5) * tileSize - thicknessWorld / 2;
  const northZ = (-zOffset - 0.5) * tileSize - thicknessWorld / 2;

  for (let z = 0; z < depth; z += 1) {
    const mesh = new Mesh(westGeometry, material);
    mesh.position.set(westX, halfHeight, (z - zOffset) * tileSize);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  for (let x = 0; x < width; x += 1) {
    const mesh = new Mesh(northGeometry, material);
    mesh.position.set((x - xOffset) * tileSize, halfHeight, northZ);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  const westCollider = {
    center: new Vector3(westX, halfHeight, 0),
    size: new Vector3(thicknessWorld, wallHeight, depth * tileSize),
    axes: ["x", "y", "z"],
    mask: defaultColliderMask,
  };
  const northCollider = {
    center: new Vector3(0, halfHeight, northZ),
    size: new Vector3(width * tileSize, wallHeight, thicknessWorld),
    axes: ["x", "y", "z"],
    mask: defaultColliderMask,
  };
  const eastCollider = {
    center: new Vector3((xOffset + 0.5) * tileSize + thicknessWorld / 2, halfHeight, 0),
    size: new Vector3(thicknessWorld, wallHeight, depth * tileSize),
    axes: ["x", "y", "z"],
    mask: defaultColliderMask,
  };
  const southCollider = {
    center: new Vector3(0, halfHeight, (zOffset + 0.5) * tileSize + thicknessWorld / 2),
    size: new Vector3(width * tileSize, wallHeight, thicknessWorld),
    axes: ["x", "y", "z"],
    mask: defaultColliderMask,
  };

  colliders.push(westCollider, northCollider, eastCollider, southCollider);

  return { group, colliders };
}

function createFloor(floorData, tileSize, colliders) {
  const width = floorData.width ?? floorData.size?.[0] ?? 8;
  const depth = floorData.depth ?? floorData.size?.[1] ?? width;
  const height = floorData.height ?? DEFAULT_FLOOR_HEIGHT;
  const material = getMaterial(floorData.material ?? "floor");
  const defaultTiles = floorData.defaultTiles ?? resolveMaterialTiles(floorData.material ?? "floor");
  const tileOverrides = new Map();
  (floorData.tiles ?? []).forEach((tile) => {
    if (typeof tile?.x === "number" && typeof tile?.z === "number") {
      tileOverrides.set(`${tile.x},${tile.z}`, tile.tiles ?? defaultTiles);
    }
  });

  const group = new Group();

  const xOffset = (width - 1) / 2;
  const zOffset = (depth - 1) / 2;

  for (let z = 0; z < depth; z += 1) {
    for (let x = 0; x < width; x += 1) {
      const key = `${x},${z}`;
      const tiles = tileOverrides.get(key) ?? defaultTiles;
      const geometry = getFloorGeometry(tileSize, height, tiles);
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

function getFloorGeometry(tileSize, height, tiles) {
  const key = `${tileSize}:${height}:${JSON.stringify(tiles ?? {})}`;
  if (!floorGeometryCache.has(key)) {
    floorGeometryCache.set(key, createBoxGeometryWithUVs(tileSize, height, tileSize, tiles));
  }
  return floorGeometryCache.get(key);
}

function createBoxElement(definition) {
  const size = vectorFromArray(definition.size, new Vector3(1, 1, 1));
  const position = vectorFromArray(definition.position, new Vector3());
  const axes = Array.isArray(definition.axes) && definition.axes.length > 0 ? definition.axes : ["x", "y", "z"];
  const mask = definition.mask ?? defaultColliderMask;
  const material = getMaterial(definition.material);

  let mesh = null;

  if (definition.visible !== false) {
    const geometry = createBoxGeometryWithUVs(
      size.x,
      size.y,
      size.z,
      definition.tiles ?? resolveMaterialTiles(definition.material),
    );
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

export function createDoorElement(definition) {
  const size = vectorFromArray(definition.size, new Vector3(1.5, 2.5, 0.5));
  const position = vectorFromArray(definition.position, new Vector3());
  const material = getMaterial(definition.material ?? "door");
  const visible = definition.visible !== false;
  const solid = definition.solid === true;
  const axes = Array.isArray(definition.axes) && definition.axes.length > 0 ? definition.axes : ["x", "y", "z"];
  const mask = definition.mask ?? defaultColliderMask;
  const orientation = definition.orientation ?? "north";
  const targetDefinition = definition.target ?? null;
  const targetRoom = typeof targetDefinition === "string" ? targetDefinition : targetDefinition?.room ?? null;
  const targetDoor = targetDefinition && typeof targetDefinition === "object" ? targetDefinition.door ?? null : null;
  const spawnOverride = definition.spawn
    ? vectorFromArray(definition.spawn, null)
    : targetDefinition && typeof targetDefinition === "object" && Array.isArray(targetDefinition.spawn)
    ? vectorFromArray(targetDefinition.spawn, null)
    : null;

  const meshes = [];
  const doorColliders = [];

  if (visible) {
    const frameOptions = {
      openingWidth: definition.openingWidth ?? 1,
      postWidth: definition.postWidth,
      lintelHeight: definition.lintelHeight,
      depth: definition.depth,
      tiles: definition.tiles ?? resolveMaterialTiles(definition.material ?? "door"),
      material: definition.material ?? "door",
      orientation,
    };
    const frame = createDoorFrame(position, size, frameOptions);
    frame.meshes.forEach((mesh) => {
      mesh.material = material;
      meshes.push(mesh);
    });
    doorColliders.push(...frame.colliders);

    const plug = createDoorPlug(position, size, frameOptions);
    if (plug) {
      plug.material = doorPlugMaterial;
      meshes.push(plug);
    }
  }

  const doorway = {
    id: definition.id ?? `door-${Math.random().toString(36).slice(2, 8)}`,
    box: createDoorwayBox(position, size, {
      openingWidth: definition.openingWidth,
      lintelHeight: definition.lintelHeight,
      orientation,
      depth: definition.depth,
      postWidth: definition.postWidth,
    }),
    target: targetRoom,
    targetDoor,
    spawn: spawnOverride,
    spawnId: definition.spawnId ?? `${definition.id}-spawn`,
    targetSpawnId: definition.target?.spawnId ?? definition.targetSpawnId,
    orientation,
  };

  if (!spawnOverride && definition.spawn) {
    doorway.spawn = vectorFromArray(definition.spawn, position.clone());
  } else if (spawnOverride) {
    doorway.spawn = spawnOverride.clone();
  }

  if (solid) {
    doorColliders.push({
      center: position.clone(),
      size: size.clone(),
      axes,
      mask,
    });
  }

  return { meshes, colliders: doorColliders, doorway };
}

function createDoorFrame(position, size, options = {}) {
  const meshes = [];
  const colliders = [];

  const orientation = options.orientation ?? "north";
  const isNorthSouth = orientation === "north" || orientation === "south";
  const frameHeight = size.y;
  const depth = options.depth ?? (isNorthSouth ? size.z : size.x);
  const lintelHeight = Math.min(options.lintelHeight ?? 0.5, frameHeight);
  const openingWidth = options.openingWidth ?? 1;
  const frameWidth = isNorthSouth ? size.x : size.z;
  const postWidth = options.postWidth ?? Math.max(0, (frameWidth - openingWidth) / 2);
  const openingHeight = Math.max(0, frameHeight - lintelHeight);

  const bottom = position.y - frameHeight / 2;
  const postCenterY = bottom + openingHeight / 2;
  const lintelCenterY = bottom + openingHeight + lintelHeight / 2;

  const tiles = options.tiles ?? resolveMaterialTiles(options.material ?? "door");

  const parallelOffset = openingWidth / 2 + postWidth / 2;

  if (postWidth > 0 && openingHeight > 0) {
    const postGeometry = createBoxGeometryWithUVs(
      isNorthSouth ? postWidth : depth,
      openingHeight,
      isNorthSouth ? depth : postWidth,
      tiles,
    );

    const leftPost = new Mesh(postGeometry.clone(), null);
    const rightPost = new Mesh(postGeometry.clone(), null);

    if (isNorthSouth) {
      leftPost.position.set(position.x - parallelOffset, postCenterY, position.z);
      rightPost.position.set(position.x + parallelOffset, postCenterY, position.z);
      colliders.push({
        center: leftPost.position.clone(),
        size: new Vector3(postWidth, openingHeight, depth),
        axes: ["x", "y", "z"],
        mask: defaultColliderMask,
      });
      colliders.push({
        center: rightPost.position.clone(),
        size: new Vector3(postWidth, openingHeight, depth),
        axes: ["x", "y", "z"],
        mask: defaultColliderMask,
      });
    } else {
      leftPost.position.set(position.x, postCenterY, position.z - parallelOffset);
      rightPost.position.set(position.x, postCenterY, position.z + parallelOffset);
      colliders.push({
        center: leftPost.position.clone(),
        size: new Vector3(depth, openingHeight, postWidth),
        axes: ["x", "y", "z"],
        mask: defaultColliderMask,
      });
      colliders.push({
        center: rightPost.position.clone(),
        size: new Vector3(depth, openingHeight, postWidth),
        axes: ["x", "y", "z"],
        mask: defaultColliderMask,
      });
    }

    leftPost.castShadow = true;
    leftPost.receiveShadow = true;
    rightPost.castShadow = true;
    rightPost.receiveShadow = true;
    meshes.push(leftPost, rightPost);
  }

  if (lintelHeight > 0) {
    const lintelWidth = openingWidth + postWidth * 2;
    const lintelGeometry = createBoxGeometryWithUVs(
      isNorthSouth ? lintelWidth : depth,
      lintelHeight,
      isNorthSouth ? depth : lintelWidth,
      tiles,
    );
    const lintel = new Mesh(lintelGeometry, null);
    lintel.position.copy(position);
    lintel.position.y = lintelCenterY;
    lintel.castShadow = true;
    lintel.receiveShadow = true;
    meshes.push(lintel);
    colliders.push({
      center: lintel.position.clone(),
      size: new Vector3(isNorthSouth ? lintelWidth : depth, lintelHeight, isNorthSouth ? depth : lintelWidth),
      axes: ["x", "y", "z"],
      mask: defaultColliderMask,
    });
  }

  return { meshes, colliders };
}

function createDoorPlug(position, size, options = {}) {
  const orientation = options.orientation ?? "north";
  const isNorthSouth = orientation === "north" || orientation === "south";
  const frameHeight = size.y;
  const depth = options.depth ?? (isNorthSouth ? size.z : size.x);
  const lintelHeight = Math.min(options.lintelHeight ?? 0.5, frameHeight);
  const openingWidth = options.openingWidth ?? 1;
  const frameWidth = isNorthSouth ? size.x : size.z;
  const postWidth = options.postWidth ?? Math.max(0, (frameWidth - openingWidth) / 2);
  const openingHeight = Math.max(0, frameHeight - lintelHeight);

  if (openingHeight <= 0 || openingWidth <= 0) {
    return null;
  }

  const plugThickness = Math.max(0.04, Math.min(0.12, depth * 0.2));
  const geometry = createBoxGeometryWithUVs(
    isNorthSouth ? openingWidth : plugThickness,
    openingHeight,
    isNorthSouth ? plugThickness : openingWidth,
    { default: "wall" },
  );

  const plug = new Mesh(geometry, doorPlugMaterial);
  const bottom = position.y - frameHeight / 2;
  plug.position.set(position.x, bottom + openingHeight / 2, position.z);

  const inward = getDoorInwardNormal(orientation);
  const plugOffset = depth / 2 - plugThickness / 2;
  plug.position.x += inward.x * plugOffset;
  plug.position.z += inward.z * plugOffset;

  return plug;
}

function createDoorwayBox(position, size, options = {}) {
  const frameHeight = size.y;
  const lintelHeight = Math.min(options.lintelHeight ?? 0.5, frameHeight);
  const openingWidth = options.openingWidth ?? 1;
  const openingHeight = Math.max(0.1, frameHeight - lintelHeight);
  const orientation = options.orientation ?? "north";
  const isNorthSouth = orientation === "north" || orientation === "south";
  const depth = options.depth ?? (isNorthSouth ? size.z : size.x);

  const center = position.clone();
  center.y = position.y - frameHeight / 2 + openingHeight / 2;

  const boxSize = new Vector3(
    isNorthSouth ? openingWidth : depth,
    openingHeight,
    isNorthSouth ? depth : openingWidth,
  );
  return new Box3().setFromCenterAndSize(center, boxSize);
}

function resolveMaterialTiles(material = "default") {
  switch (material) {
    case "floor":
      return { top: "floor", bottom: "floor", sides: "floor" };
    case "wall":
      return { default: "wall" };
    case "block":
    case "blockTall":
      return {
        top: "blockTop",
        bottom: "blockSide",
        sides: "blockSide",
      };
    case "crate":
      return { default: "crate" };
    case "door":
      return { default: "wall" };
    default:
      return { default: "blockSide" };
  }
}

function getDoorInwardNormal(orientation) {
  return DOOR_INWARD_NORMALS[orientation] ?? DOOR_INWARD_NORMALS.north;
}

function vectorFromArray(array, fallback) {
  if (!Array.isArray(array) || array.length < 3) {
    return fallback instanceof Vector3 ? fallback.clone() : fallback;
  }
  return new Vector3(array[0], array[1], array[2]);
}

function notifyDynamicEntry(entry) {
  if (!entry || !Array.isArray(entry.__listeners)) {
    return;
  }
  entry.__listeners.forEach((listener) => {
    try {
      listener(entry);
    } catch (error) {
      console.error("Dynamic entity listener error:", error);
    }
  });
}

function normalizeAmbientLight(definition) {
  const color =
    typeof definition?.color === "string" && definition.color.trim()
      ? definition.color
      : "#ffffff";
  const intensity =
    typeof definition?.intensity === "number" && Number.isFinite(definition.intensity)
      ? definition.intensity
      : 0.65;
  return { color, intensity };
}
