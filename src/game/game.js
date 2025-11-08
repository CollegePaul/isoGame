import { Box3, BoxGeometry, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { Player } from "./entities/player.js";
import { World } from "./world/world.js";
import { logger } from "../utils/logger.js";
import { createCratesFromDefinitions } from "./world/spawners/crateSpawner.js";
import { createCollectablesFromDefinitions } from "./world/spawners/collectableSpawner.js";
import { createObjectsFromDefinitions } from "./world/spawners/objectSpawner.js";
import { getRoomBuilder } from "./world/rooms/index.js";
import { getObjectVariantById } from "../render/objectLibrary.js";
import { getModelDefinition } from "../data/models.js";
import { WorldObject } from "./entities/worldObject.js";
import { cloneObjectVariant } from "../render/objectLibrary.js";

const PLAYER_GEOMETRY = new BoxGeometry(0.8, 1.6, 0.8);
const PLAYER_MATERIAL = new MeshStandardMaterial({ color: 0xffcc66 });
const PUSH_DIRECTION = new Vector3();
const EPSILON = 1e-4;
const VERTICAL_SNAP_EPS = 0.3;
const CRATE_COLLISION_ITERATIONS = 3;
const DOOR_TRANSITION_COOLDOWN = 0.1;
const INTERACTION_EXPANSION = new Vector3(0.4, 0.6, 0.4);
const TELEPORT_ALIGN_EPS = 0.35;
const TELEPORT_HORIZONTAL_MARGIN = 0.05;
const MESSAGE_DEFAULT_DURATION = 2500;
const TELEPORT_PAD_ID = "teleport_pad";
const TELEPORT_PAD_IDS = new Set([TELEPORT_PAD_ID, "teleporter_pad"]);
const TELEPORT_IDS = new Set(["teleporter", "teleport"]);
const PLAYER_ROTATIONS = {
  east: 0,
  south: -Math.PI / 2,
  west: Math.PI,
  north: Math.PI / 2,
};

function isTeleporterPadId(id) {
  return TELEPORT_PAD_IDS.has(id);
}

function normalizeSizeVector(size) {
  if (!size) {
    return new Vector3(1, 0.1, 1);
  }
  if (typeof size.isVector3 === "boolean" && size.isVector3) {
    return size.clone();
  }
  if (Array.isArray(size) && size.length >= 3) {
    return new Vector3(Number(size[0]) || 1, Number(size[1]) || 0.1, Number(size[2]) || 1);
  }
  if (typeof size === "object" && size !== null) {
    const { x = 1, y = 0.1, z = 1 } = size;
    return new Vector3(Number(x) || 1, Number(y) || 0.1, Number(z) || 1);
  }
  return new Vector3(1, 0.1, 1);
}

function snapToGridCenter(position) {
  const snapped = position.clone();
  snapped.x = Math.round(snapped.x);
  snapped.z = Math.round(snapped.z);
  return snapped;
}

function applyOffsetsToPosition(basePosition, entry, variant) {
  const result = basePosition.clone();
  const offset = entry?.centerOffset ?? variant?.centerOffset ?? null;
  if (offset) {
    result.x -= offset.x ?? 0;
    result.y -= offset.y ?? 0;
    result.z -= offset.z ?? 0;
  } else {
    const baseOffset =
      typeof entry?.baseOffset === "number"
        ? entry.baseOffset
        : typeof variant?.baseOffset === "number"
        ? variant.baseOffset
        : 0;
    if (baseOffset) {
      result.y -= baseOffset;
    }
  }
  return result;
}

function copyVariantOffsetsToEntry(entry, variant) {
  if (!entry || !variant) {
    return;
  }
  if (variant.centerOffset) {
    entry.centerOffset = {
      x: variant.centerOffset.x ?? 0,
      y: variant.centerOffset.y ?? 0,
      z: variant.centerOffset.z ?? 0,
    };
    entry.baseOffset = null;
  } else if (typeof variant.baseOffset === "number") {
    entry.centerOffset = null;
    entry.baseOffset = variant.baseOffset;
  }
}

export class Game {
  constructor({ scene, input, initialRoom = "boot-room", onInventoryChange = null, onMessage = null } = {}) {
    this.world = new World({ scene });
    this.player = new Player({ input });
  this.crates = [];
  this.collectables = [];
  this.objects = [];
  this.inventory = [];
    this.collectedIds = new Set();
    this.inventoryChangeListener = typeof onInventoryChange === "function" ? onInventoryChange : null;
    this.messageListener = typeof onMessage === "function" ? onMessage : null;
    this.playerFacing = "east";

    this.playerMesh = new Mesh(PLAYER_GEOMETRY, PLAYER_MATERIAL);
    this.playerMesh.castShadow = true;
    this.updatePlayerMeshRotation();
    scene.add(this.playerMesh);
    this.sceneAmbient =
      scene.getObjectByName?.("global-ambient") ||
      scene.children.find((child) => child.isAmbientLight) ||
      null;
    this.defaultAmbient =
      this.sceneAmbient?.color && typeof this.sceneAmbient.intensity === "number"
        ? {
            color: this.sceneAmbient.color.clone(),
            intensity: this.sceneAmbient.intensity,
          }
        : null;
    this.ambientReferenceIntensity = this.defaultAmbient?.intensity ?? this.sceneAmbient?.intensity ?? 1;
    this.directionalLights = [];
    scene.traverse((node) => {
      if (node.isDirectionalLight) {
        this.directionalLights.push({ light: node, baseIntensity: node.intensity });
      }
    });
    this.activeDoorId = null;
    this.pendingTransition = null;
    this.transitionCooldown = 0;
    this.teleporterCooldown = 0;
    this.pendingInteraction = false;
    this.teleportPadState = {
      mode: "unknown",
      roomId: null,
      position: null,
      entry: null,
      entity: null,
      size: null,
    };
    this.currentRoom = null;
    this.inputHandlers = [];
    this.playerMeshHorizontalOffset = { x: 0, z: 0 };
    this.playerMeshVerticalOffset = 0;

    if (input?.on) {
      const disposeInteract = input.on("interact", (pressed) => {
        if (pressed) {
          this.pendingInteraction = true;
        }
      });
      this.inputHandlers.push(disposeInteract);
    }

    if (initialRoom) {
      this.loadRoomByName(initialRoom);
    }
    this.notifyInventoryChange();
    this.loadPlayerModel();
}

  loadRoomByName(roomName, options = {}) {
    const builder = getRoomBuilder(roomName);
    if (!builder) {
      logger.error(`No room builder found for "${roomName}"`);
      return;
    }

    const builtRoom = this.world.loadRoom(builder);
    this.currentRoom = roomName;

    let spawnPoint = options.spawn ?? null;

    if (!spawnPoint && options.spawnId) {
      spawnPoint = this.world.getSpawnPoint(options.spawnId);
    }

    if (!spawnPoint && options.doorId) {
      const doorwaySpawn = findDoorSpawn(builtRoom.doorways, options.doorId);
      if (doorwaySpawn) {
        spawnPoint = doorwaySpawn.position;
        if (!options.spawnId) {
          options.spawnId = doorwaySpawn.spawnId;
        }
      }
    }

    if (!spawnPoint) {
      spawnPoint = builtRoom.spawnPoint ?? this.world.spawnPoint;
    }

    if (!spawnPoint) {
      logger.warn(`Room "${roomName}" loaded without spawn point; using (0,0,0).`);
    }

    const spawnPosition = spawnPoint ?? new Vector3();
    this.player.setSpawn(spawnPosition);
    this.player.setPosition(spawnPosition);
    this.player.velocity.set(0, 0, 0);

    this.crates = createCratesFromDefinitions(builtRoom.dynamicEntities ?? []);
    this.world.clearDynamicMeshes();
    this.crates.forEach(({ mesh }) => this.world.addDynamicMesh(mesh));
    this.collectables = createCollectablesFromDefinitions(builtRoom.dynamicEntities ?? []);
    this.collectables.forEach(({ entity }) => {
      if (this.collectedIds.has(entity.id)) {
        entity.markAsCollected();
      }
    });
    this.objects = createObjectsFromDefinitions(builtRoom.dynamicEntities ?? []);
    this.refreshTeleporterPadStateFromScene();
    this.pendingInteraction = false;
    this.teleporterCooldown = 0;
    this.syncMeshes();
    this.attachPlayerMesh();
    this.updatePlayerMeshTransform();
    this.applyAmbientSettings(builtRoom.ambient ?? this.world.ambientSettings);
    this.notifyInventoryChange();
  }

  update(delta) {
    this.transitionCooldown = Math.max(0, this.transitionCooldown - delta);
    this.teleporterCooldown = Math.max(0, this.teleporterCooldown - delta);
    this.player.update(delta, this.world);
    this.updatePlayerOrientation();
    this.updatePlayerMeshTransform();
    this.handlePlayerCrateInteractions();
    this.crates.forEach(({ entity }) => entity.update(delta, this.world));
    this.resolveCrateCollisions();
    this.handleCollectableInteractions();
    this.handleTeleporterTriggers();
    this.processInteractionRequests();
    this.syncMeshes();
    this.checkDoorways();
    this.processPendingTransition();
  }

  getPlayer() {
    return this.player;
  }

  syncMeshes() {
    this.updatePlayerMeshPosition();
    this.crates.forEach(({ mesh, entity }) => {
      mesh.position.copy(entity.position);
    });
  }

  checkDoorways() {
    const doorways = this.world.getDoorways();
    if (!doorways || doorways.length === 0) {
      return;
    }

    const playerBox = this.player.getBoundingBox();
    let activeDoor = null;
    for (const doorway of doorways) {
      if (doorway.box.intersectsBox(playerBox)) {
        activeDoor = doorway;
        break;
      }
    }

    if (activeDoor) {
      if (this.activeDoorId !== activeDoor.id) {
        this.activeDoorId = activeDoor.id;
        if (activeDoor.target) {
          this.queueRoomTransition(activeDoor);
        }
      }
    } else if (this.activeDoorId) {
      this.activeDoorId = null;
    }
  }

  handlePlayerCrateInteractions() {
    if (this.crates.length === 0) {
      return;
    }

    const moveDirection = this.player.getMoveDirection();
    const playerHalf = this.player.getHalfSize();

    for (const crate of this.crates) {
      const { entity } = crate;
      const playerBox = this.player.getBoundingBox();
      const crateBox = entity.getBoundingBox();

      if (!playerBox.intersectsBox(crateBox)) {
        continue;
      }

      const crateHalf = entity.getHalfSize();
      const deltaX = this.player.position.x - entity.position.x;
      const deltaY = this.player.position.y - entity.position.y;
      const deltaZ = this.player.position.z - entity.position.z;
      const overlapX = playerHalf.x + crateHalf.x - Math.abs(deltaX);
      const overlapY = playerHalf.y + crateHalf.y - Math.abs(deltaY);
      const overlapZ = playerHalf.z + crateHalf.z - Math.abs(deltaZ);

      if (overlapX <= 0 || overlapY <= 0 || overlapZ <= 0) {
        continue;
      }

      const crateTop = entity.position.y + crateHalf.y;
      const playerBottom = this.player.position.y - playerHalf.y;

      const landingOnCrate =
        this.player.velocity.y <= 0 &&
        deltaY >= 0 &&
        playerBottom >= crateTop - VERTICAL_SNAP_EPS &&
        playerBottom <= crateTop + VERTICAL_SNAP_EPS;

      if (landingOnCrate) {
        this.player.position.y = crateTop + playerHalf.y + EPSILON;
        this.player.velocity.y = 0;
        this.player.onGround = true;
        continue;
      }

      const resolveAxis = overlapX < overlapZ ? "x" : "z";
      const delta = resolveAxis === "x" ? deltaX : deltaZ;
      const moveComponent = moveDirection[resolveAxis];
      const separation = playerHalf[resolveAxis] + crateHalf[resolveAxis] + EPSILON;

      const playerTop = this.player.position.y + playerHalf.y;
      const crateBottom = entity.position.y - crateHalf.y;

      const hittingCrateBottom =
        this.player.velocity.y > 0 &&
        deltaY <= 0 &&
        playerTop >= crateBottom - VERTICAL_SNAP_EPS &&
        playerTop <= crateBottom + VERTICAL_SNAP_EPS;

      if (hittingCrateBottom) {
        this.player.position.y = crateBottom - playerHalf.y - EPSILON;
        this.player.velocity.y = 0;
        continue;
      }

      if (Math.abs(moveComponent) > 0) {
        const pushDirection = Math.sign(moveComponent);
        PUSH_DIRECTION.set(0, 0, 0);
        PUSH_DIRECTION[resolveAxis] = pushDirection;
        entity.applyPush(PUSH_DIRECTION);
        this.player.position[resolveAxis] =
          entity.position[resolveAxis] - pushDirection * separation;
        this.player.velocity[resolveAxis] = 0;
      } else {
        const awayDirection = delta >= 0 ? 1 : -1;
        this.player.position[resolveAxis] =
          entity.position[resolveAxis] + awayDirection * separation;
        this.player.velocity[resolveAxis] = 0;
      }
    }
  }

  resolveCrateCollisions() {
    if (this.crates.length < 2) {
      return;
    }

    const entities = this.crates.map((item) => item.entity);

    for (let iteration = 0; iteration < CRATE_COLLISION_ITERATIONS; iteration += 1) {
      let anyResolved = false;
      for (let i = 0; i < entities.length; i += 1) {
        const a = entities[i];
        for (let j = i + 1; j < entities.length; j += 1) {
          const b = entities[j];
          if (resolveCratePair(a, b)) {
            anyResolved = true;
          }
        }
      }
      if (!anyResolved) {
        break;
      }
    }
  }
}

const STACK_ALIGN_THRESHOLD = 0.2;

Game.prototype.setInventoryChangeListener = function setInventoryChangeListener(listener) {
  this.inventoryChangeListener = typeof listener === "function" ? listener : null;
  this.notifyInventoryChange();
};

Game.prototype.notifyInventoryChange = function notifyInventoryChange() {
  if (this.inventoryChangeListener) {
    this.inventoryChangeListener([...this.inventory]);
  }
};

Game.prototype.handleCollectableInteractions = function handleCollectableInteractions() {
  if (!this.collectables || this.collectables.length === 0) {
    // continue to check object-based collectables
  }

  const playerBox = this.player.getBoundingBox();
  if (!this.pendingInteraction) {
    return;
  }

  let interactionHandled = false;

  if (this.collectables && this.collectables.length > 0) {
    for (let i = this.collectables.length - 1; i >= 0; i -= 1) {
      const collectable = this.collectables[i];
      const { entity } = collectable;
      if (!entity || entity.isCollected()) {
        continue;
      }
      const box = entity.getBoundingBox();
      if (!playerBox.intersectsBox(box)) {
        continue;
      }
      const collected = entity.collect();
      if (!collected) {
        continue;
      }
      this.collectedIds.add(entity.id);
      const label = entity.metadata?.label ?? entity.id;
      const inventoryItem = {
        id: entity.metadata?.id ?? entity.id,
        label,
        metadata: entity.metadata ?? null,
      };
      if (collectable.entry) {
        inventoryItem.sourceEntry = collectable.entry;
        inventoryItem.sourceEntity = entity;
      }
      this.inventory.push(inventoryItem);
      if (isTeleporterPadId(inventoryItem.id)) {
        this.teleportPadState = {
          mode: "inventory",
          roomId: this.currentRoom,
          position: entity.position.clone(),
          entry: collectable.entry ?? null,
          entity,
          size: normalizeSizeVector(entity.size),
        };
        if (collectable.entry) {
          collectable.entry.type = "object";
          collectable.entry.collected = true;
        }
      }
      this.notifyInventoryChange();
      this.collectables.splice(i, 1);
      interactionHandled = true;
      break;
    }
  }

  if (!interactionHandled && this.objects && this.objects.length > 0) {
    for (let i = this.objects.length - 1; i >= 0; i -= 1) {
      const record = this.objects[i];
      if (!record || !record.entity) {
        continue;
      }
      const { entity, entry } = record;
      if (!entity?.metadata?.collectable || entry?.collected) {
        continue;
      }
      const box = entity.getBoundingBox();
      if (!playerBox.intersectsBox(box)) {
        continue;
      }
      if (isTeleporterPadId(entity.getMetadataId()) && this.hasInventoryItem(TELEPORT_PAD_ID)) {
        this.sendMessage("You are already carrying the teleporter pad.", 2000);
        continue;
      }
      if (this.pickupObjectCollectable(record)) {
        this.objects.splice(i, 1);
        interactionHandled = true;
        break;
      }
    }
  }

  if (interactionHandled) {
    this.pendingInteraction = false;
  }
};

Game.prototype.handleTeleporterTriggers = function handleTeleporterTriggers() {
  if (this.teleporterCooldown > 0 || !this.objects || this.objects.length === 0) {
    return;
  }

  const playerHalf = this.player.getHalfSize();
  const playerBottom = this.player.position.y - playerHalf.y;

  for (const entry of this.objects) {
    const object = entry?.entity;
    if (!object || typeof object.getMetadataId !== "function") {
      continue;
    }
    const metadataId = object.getMetadataId();
    if (!TELEPORT_IDS.has(metadataId)) {
      continue;
    }
    const objectHalf = object.getHalfSize();
    const dx = Math.abs(this.player.position.x - object.position.x);
    const dz = Math.abs(this.player.position.z - object.position.z);
    const allowedX = playerHalf.x + objectHalf.x - TELEPORT_HORIZONTAL_MARGIN;
    const allowedZ = playerHalf.z + objectHalf.z - TELEPORT_HORIZONTAL_MARGIN;
    if (dx > allowedX || dz > allowedZ) {
      continue;
    }
    const objectTop = object.position.y + objectHalf.y;
    if (playerBottom < objectTop - TELEPORT_ALIGN_EPS || playerBottom > objectTop + TELEPORT_ALIGN_EPS) {
      continue;
    }

    const padState = this.teleportPadState;
    if (!padState || padState.mode !== "placed" || !padState.position) {
      this.sendMessage("The teleporter hums, but you need to place the pad.", 1800);
      this.teleporterCooldown = 0.9;
      return;
    }
    if (this.hasInventoryItem(TELEPORT_PAD_ID)) {
      this.sendMessage("You can't teleport while you're carrying the pad.", 2000);
      this.teleporterCooldown = 0.9;
      return;
    }

    const padPosition = padState.entity?.position?.clone?.() ?? padState.position.clone();
    const padSize = padState.entity?.size ?? padState.size;

    if (padState.roomId && padState.roomId !== this.currentRoom) {
      const spawnTarget = this.computeTeleportLandingPosition(padPosition.clone(), normalizeSizeVector(padSize));
      this.queueTeleporterTransition(padState, spawnTarget);
      this.teleporterCooldown = 0.9;
      this.sendMessage("Teleporting to the pad...", 1600);
      return;
    }

    if (padPosition.distanceTo(object.position) < 0.25) {
      this.sendMessage("The teleporter pad is already here.", 1500);
      this.teleporterCooldown = 0.9;
      return;
    }

    if (!padState.entity) {
      this.rebuildTeleporterPadInScene();
    }

    const activePadPosition = this.teleportPadState.position?.clone() ?? padPosition.clone();
    const activePadSize = this.teleportPadState.entity?.size ?? padSize;

    this.teleportPlayerTo(activePadPosition, activePadSize);
    this.teleportPadState.position = activePadPosition.clone();
    return;
  }
};

Game.prototype.findPlacedTeleporterPad = function findPlacedTeleporterPad() {
  if (this.objects) {
    const objectPad = this.objects.find(({ entity, entry }) => {
      if (!entity) {
        return false;
      }
      if (!isTeleporterPadId(entity.getMetadataId())) {
        return false;
      }
      return !(entry?.collected);
    });
    if (objectPad) {
      return objectPad;
    }
  }

  if (this.collectables) {
    const collectablePad = this.collectables.find(({ entity }) => {
      if (!entity || entity.isCollected()) {
        return false;
      }
      const id = entity.metadata?.id ?? entity.id;
      return isTeleporterPadId(id);
    });
    if (collectablePad) {
      return collectablePad;
    }
  }

  return null;
};

Game.prototype.refreshTeleporterPadStateFromScene = function refreshTeleporterPadStateFromScene() {
  if (this.teleportPadState?.mode === "inventory") {
    this.teleportPadState.roomId = this.currentRoom;
  }
  const padRecord =
    this.objects?.find(
      ({ entity }) => entity && typeof entity.getMetadataId === "function" && isTeleporterPadId(entity.getMetadataId()),
    ) ?? null;

  if (padRecord && !(padRecord.entry?.collected)) {
    const sizeVec = normalizeSizeVector(padRecord.entity.size);
    this.teleportPadState = {
      mode: "placed",
      roomId: this.currentRoom,
      position: padRecord.entity.position.clone(),
      entry: padRecord.entry,
      entity: padRecord.entity,
      size: sizeVec,
    };
    return;
  }

  if (this.teleportPadState?.mode === "placed" && this.teleportPadState.roomId === this.currentRoom) {
    this.rebuildTeleporterPadInScene();
  } else if (!this.teleportPadState || this.teleportPadState.mode === "unknown") {
    this.teleportPadState = padRecord
      ? {
          mode: "placed",
          roomId: this.currentRoom,
          position: padRecord.entity.position.clone(),
          entry: padRecord.entry,
          entity: padRecord.entity,
          size: normalizeSizeVector(padRecord.entity.size),
        }
      : { mode: "absent", roomId: null, position: null, entry: null, entity: null, size: null };
  }
};

Game.prototype.rebuildTeleporterPadInScene = function rebuildTeleporterPadInScene() {
  const state = this.teleportPadState;
  if (!state || state.mode !== "placed" || state.roomId !== this.currentRoom) {
    return;
  }

  const position = state.position ? state.position.clone() : new Vector3();
  const sizeVec = normalizeSizeVector(state.size);
  const entry = state.entry ?? {
    type: "object",
    id: "teleport_pad",
    metadata: getModelDefinition(TELEPORT_PAD_ID) ?? { id: TELEPORT_PAD_ID, label: "Teleporter Pad", collectable: true },
    size: [sizeVec.x, sizeVec.y, sizeVec.z],
    position: [position.x, position.y, position.z],
    collected: false,
    state: "default",
    __listeners: [],
    room: this.currentRoom,
  };

  const variantId = entry?.metadata?.id ?? entry?.id ?? TELEPORT_PAD_ID;
  const variant = getObjectVariantById(variantId);
  copyVariantOffsetsToEntry(entry, variant);
  let mesh = entry.mesh ?? state.entity?.mesh ?? null;
  if (!mesh && variant) {
    mesh = variant.createInstance();
  }
  if (mesh) {
    mesh.traverse?.((node) => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
    const meshPos = applyOffsetsToPosition(position, entry, variant);
    mesh.position.copy(meshPos);
    const targetGroup = this.world.roomGroup;
    if (targetGroup && mesh.parent !== targetGroup) {
      mesh.parent?.remove(mesh);
      targetGroup.add(mesh);
    }
    mesh.visible = true;
  }

  let entity = state.entity;
  if (!entity) {
    entity = new WorldObject({
      id: entry.id ?? variantId,
      position: position.clone(),
      size: sizeVec.clone(),
      metadata: entry.metadata ?? getModelDefinition(variantId) ?? { id: variantId, collectable: true },
      mesh,
      entry,
      state: entry.state ?? "default",
    });
  } else {
    entity.position.copy(position);
    entity.size = sizeVec.clone();
    entity.setMesh(mesh);
  }

  entry.mesh = mesh;
  entry.meshPosition = mesh ? mesh.position.clone() : position.clone();
  entry.position = position.clone();
  entry.size = [sizeVec.x, sizeVec.y, sizeVec.z];
  entry.collected = false;
  entry.room = this.currentRoom;
  if (!Array.isArray(entry.__listeners)) {
    entry.__listeners = [];
  }
  this.notifyEntryListeners(entry);

  if (!this.objects.some((record) => record.entry === entry)) {
    this.objects.push({ entity, entry });
  }

  this.teleportPadState = {
    mode: "placed",
    roomId: this.currentRoom,
    position,
    entry,
    entity,
    size: sizeVec.clone(),
  };
};

Game.prototype.teleportPlayerTo = function teleportPlayerTo(position, padSize) {
  const sizeVec = normalizeSizeVector(padSize);
  const target = this.computeTeleportLandingPosition(position.clone(), sizeVec);
  this.player.setPosition(target);
  this.player.velocity.set(0, 0, 0);
  this.teleporterCooldown = 0.9;
  this.sendMessage("Teleporting to the pad...", 1600);
};

Game.prototype.computeTeleportLandingPosition = function computeTeleportLandingPosition(position, padSizeVec) {
  const result = position.clone();
  const sizeVec = padSizeVec ?? new Vector3(1, 0.1, 1);
  const playerHalf = this.player.getHalfSize();
  result.y += sizeVec.y / 2 + playerHalf.y + 0.05;
  return result;
};

Game.prototype.processInteractionRequests = function processInteractionRequests() {
  if (!this.pendingInteraction) {
    return;
  }
  this.pendingInteraction = false;
  const target = this.findClosestInteractableObject();
  if (!target) {
    if (this.tryDropTeleporterPad()) {
      return;
    }
    this.sendMessage("There's nothing to interact with here.", 1300);
    return;
  }
  this.handleObjectInteraction(target);
};

Game.prototype.loadPlayerModel = function loadPlayerModel() {
  cloneObjectVariant("player")
    .then((mesh) => {
      if (!mesh) {
        return;
      }
      mesh.traverse?.((node) => {
        if (node.isMesh) {
          node.castShadow = true;
          node.receiveShadow = true;
        }
      });
      const bbox = new Box3().setFromObject(mesh);
      const center = bbox.getCenter(new Vector3());
      this.playerMeshHorizontalOffset = {
        x: typeof center.x === "number" ? center.x : 0,
        z: typeof center.z === "number" ? center.z : 0,
      };
      this.playerMeshVerticalOffset = typeof center.y === "number" ? center.y : 0;
      if (this.playerMesh) {
        if (this.playerMesh.parent) {
          this.playerMesh.parent.remove(this.playerMesh);
        }
      }
      this.playerMesh = mesh;
      this.attachPlayerMesh();
      this.updatePlayerMeshTransform();
    })
    .catch((error) => {
      logger.warn("Failed to load player model, using fallback cube.", error);
    });
};

Game.prototype.updatePlayerOrientation = function updatePlayerOrientation() {
  const move = this.player.getMoveDirection();
  if (move.lengthSq() < 0.0001) {
    return;
  }
  let facing = this.playerFacing;
  if (Math.abs(move.x) >= Math.abs(move.z)) {
    facing = move.x >= 0 ? "east" : "west";
  } else {
    facing = move.z >= 0 ? "south" : "north";
  }
  if (facing !== this.playerFacing) {
    this.playerFacing = facing;
    this.updatePlayerMeshRotation();
  }
};

Game.prototype.updatePlayerMeshRotation = function updatePlayerMeshRotation() {
  if (!this.playerMesh) {
    return;
  }
  const angle = PLAYER_ROTATIONS[this.playerFacing] ?? 0;
  this.playerMesh.rotation.y = angle;
};

Game.prototype.updatePlayerMeshPosition = function updatePlayerMeshPosition() {
  if (!this.playerMesh) {
    return;
  }
  const pos = this.player.position;
  const meshPos = this.playerMesh.position;
  meshPos.set(pos.x, pos.y, pos.z);
  if (this.playerMeshHorizontalOffset) {
    if (typeof this.playerMeshHorizontalOffset.x === "number") {
      meshPos.x -= this.playerMeshHorizontalOffset.x;
    }
    if (typeof this.playerMeshHorizontalOffset.z === "number") {
      meshPos.z -= this.playerMeshHorizontalOffset.z;
    }
  }
  if (typeof this.playerMeshVerticalOffset === "number") {
    meshPos.y -= this.playerMeshVerticalOffset;
  }
};

Game.prototype.updatePlayerMeshTransform = function updatePlayerMeshTransform() {
  this.updatePlayerMeshPosition();
  this.updatePlayerMeshRotation();
};

Game.prototype.attachPlayerMesh = function attachPlayerMesh() {
  if (!this.playerMesh || !this.world?.roomGroup) {
    return;
  }
  const group = this.world.roomGroup;
  if (this.playerMesh.parent !== group) {
    this.playerMesh.parent?.remove(this.playerMesh);
    group.add(this.playerMesh);
  }
};

Game.prototype.pickupObjectCollectable = function pickupObjectCollectable(record) {
  if (!record || !record.entity) {
    return false;
  }
  const { entity, entry } = record;
  const metadataId = entity.getMetadataId();
  if (!entity.metadata?.collectable) {
    return false;
  }
  if (this.hasInventoryItem(metadataId)) {
    this.sendMessage("You can't carry another one right now.", 1800);
    return false;
  }
  const label = entity.getLabel();
  this.inventory.push({
    id: metadataId,
    label,
    metadata: entity.metadata,
    sourceEntry: entry,
    sourceEntity: entity,
  });
  if (isTeleporterPadId(metadataId)) {
    this.teleportPadState = {
      mode: "inventory",
      roomId: this.currentRoom,
      position: entity.position.clone(),
      entry,
      entity,
      size: normalizeSizeVector(entity.size),
    };
  }
  this.notifyInventoryChange();
  if (entry) {
    entry.type = "object";
    entry.collected = true;
    entry.mesh = entity.mesh;
    entry.meshPosition = entity.meshPosition?.clone?.() ?? entity.meshPosition;
    entry.position = entity.position.clone();
    entry.size = entity.size.clone();
    entry.metadata = entity.metadata;
    entry.state = entity.state;
    this.notifyEntryListeners(entry);
  }
  if (entity.mesh) {
    entity.mesh.visible = false;
  }
  if (this.collectables && entry) {
    this.collectables = this.collectables.filter((collectable) => collectable.entry !== entry);
  }
  this.sendMessage(`Picked up ${label}.`, 1500);
  return true;
};

Game.prototype.findClosestInteractableObject = function findClosestInteractableObject() {
  if (!this.objects || this.objects.length === 0) {
    return null;
  }
  const playerBox = this.player.getBoundingBox();
  let closest = null;
  let bestDistance = Infinity;
  this.objects.forEach(({ entity }) => {
    if (!entity) {
      return;
    }
    const box = entity.getBoundingBox().clone();
    box.expandByVector(INTERACTION_EXPANSION);
    if (!box.intersectsBox(playerBox)) {
      return;
    }
    const dx = this.player.position.x - entity.position.x;
    const dz = this.player.position.z - entity.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < bestDistance) {
      bestDistance = distance;
      closest = entity;
    }
  });
  return closest;
};

Game.prototype.handleObjectInteraction = function handleObjectInteraction(object) {
  if (!object) {
    return;
  }
  const metadataId = object.getMetadataId();
  const interactions = object.metadata?.interactions;
  if (interactions?.type === "teleport" || TELEPORT_IDS.has(metadataId)) {
    if (this.hasInventoryItem(TELEPORT_PAD_ID)) {
      this.sendMessage("You can't teleport while you're carrying the pad.", 2000);
      return;
    }
    if (!this.teleportPadState || this.teleportPadState.mode !== "placed") {
      this.sendMessage("You'll need to place the teleporter pad first.", 2000);
      return;
    }
    this.sendMessage("Stand on the teleporter platform to activate it.", 2000);
    return;
  }

  if (isTeleporterPadId(metadataId)) {
    const record = this.objects.find((entry) => entry.entity === object);
    if (record) {
      if (this.pickupObjectCollectable(record)) {
        const index = this.objects.indexOf(record);
        if (index >= 0) {
          this.objects.splice(index, 1);
        }
      }
    }
    return;
  }

  switch (metadataId) {
    case "computer":
      this.handleComputerInteraction(object);
      break;
    case "computer_active":
      this.sendMessage("The computer is already running.", 1800);
      break;
    default:
      this.sendMessage(`${object.getLabel()} doesn't respond.`, 1600);
      break;
  }
};

Game.prototype.handleComputerInteraction = function handleComputerInteraction(object) {
  const metadataId = object.getMetadataId();
  if (metadataId === "computer_active" || object.state === "active") {
    this.sendMessage("The computer is already running.", 1800);
    return;
  }
  const requirements = Array.isArray(object.metadata?.requirements) ? object.metadata.requirements : [];
  const missing = requirements.filter((req) => !this.hasInventoryItem(req));
  if (missing.length > 0) {
    this.sendMessage("It looks like it still needs a tape.", 2000);
    return;
  }
  requirements.forEach((req) => this.consumeInventoryItem(req));
  const targetVariant = object.metadata?.transformsTo ?? "computer_active";
  const transformed = this.transformObject(object, targetVariant);
  if (transformed) {
    this.sendMessage("You load the tape and the computer springs to life.", 2400);
  } else {
    this.sendMessage("The computer sputters but stays silent.", 2000);
  }
};

Game.prototype.transformObject = function transformObject(object, nextVariantId) {
  if (!object || !nextVariantId) {
    return false;
  }
  const variant = getObjectVariantById(nextVariantId);
  const definition = getModelDefinition(nextVariantId) ?? { id: nextVariantId };
  if (!variant) {
    logger.warn(`No object variant found for "${nextVariantId}"`);
    return false;
  }
  const newMesh = variant.createInstance();
  if (!newMesh) {
    return false;
  }
  newMesh.traverse?.((node) => {
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
  const centerPosition = object.position.clone();
  newMesh.position.copy(centerPosition);
  if (variant?.centerOffset) {
    newMesh.position.x -= variant.centerOffset.x ?? 0;
    newMesh.position.y -= variant.centerOffset.y ?? 0;
    newMesh.position.z -= variant.centerOffset.z ?? 0;
  } else if (variant?.baseOffset) {
    newMesh.position.y -= variant.baseOffset;
  }
  const meshRotation = object.mesh ? object.mesh.rotation.clone() : newMesh.rotation.clone();
  newMesh.rotation.copy(meshRotation);
  const currentMesh = object.mesh;
  const targetParent = currentMesh?.parent ?? newMesh.parent ?? null;
  if (currentMesh && currentMesh.parent) {
    currentMesh.parent.remove(currentMesh);
  }
  if (targetParent && newMesh.parent !== targetParent) {
    targetParent.add(newMesh);
  }
  object.meshPosition = newMesh.position.clone();
  object.setMesh(newMesh);
  if (definition?.size) {
    const sizeArray = definition.size;
    const newSize =
      Array.isArray(sizeArray) && sizeArray.length >= 3
        ? new Vector3(Number(sizeArray[0]) || 1, Number(sizeArray[1]) || 1, Number(sizeArray[2]) || 1)
        : object.size.clone();
    object.setSize(newSize);
  }
  object.id = definition?.id ?? nextVariantId;
  object.setMetadata({
    id: definition?.id ?? nextVariantId,
    label: definition?.label ?? nextVariantId,
    description: definition?.description ?? "",
    collectable: Boolean(definition?.collectable),
    solid: definition?.solid ?? true,
    requirements: Array.isArray(definition?.requirements) ? [...definition.requirements] : [],
    transformsTo: definition?.transformsTo ?? null,
    defaultState: definition?.defaultState ?? "default",
    interactions: definition?.interactions ?? null,
    tags: Array.isArray(definition?.tags) ? [...definition.tags] : [],
  });
  object.setState(definition?.defaultState ?? "default");
  if (object.entry) {
    object.entry.mesh = object.mesh;
    object.entry.meshPosition = object.meshPosition?.clone?.() ?? object.meshPosition;
    object.entry.position = object.position.clone();
    object.entry.size = object.size.clone();
    object.entry.metadata = object.metadata;
    object.entry.state = object.state;
  }
  return true;
};

Game.prototype.hasInventoryItem = function hasInventoryItem(itemId) {
  return this.inventory.some((item) => {
    const id = item.metadata?.id ?? item.id;
    if (itemId === TELEPORT_PAD_ID) {
      return isTeleporterPadId(id);
    }
    return id === itemId;
  });
};

Game.prototype.consumeInventoryItem = function consumeInventoryItem(itemId) {
  const index = this.inventory.findIndex((item) => {
    const id = item.metadata?.id ?? item.id;
    if (itemId === TELEPORT_PAD_ID) {
      return isTeleporterPadId(id);
    }
    return id === itemId;
  });
  if (index >= 0) {
    this.inventory.splice(index, 1);
    this.notifyInventoryChange();
    return true;
  }
  return false;
};

Game.prototype.sendMessage = function sendMessage(message, duration = MESSAGE_DEFAULT_DURATION) {
  if (this.messageListener) {
    this.messageListener(message ?? "", duration);
  } else if (message) {
    logger.info(message);
  }
};

Game.prototype.notifyEntryListeners = function notifyEntryListeners(entry) {
  if (!entry || !Array.isArray(entry.__listeners)) {
    return;
  }
  entry.__listeners.forEach((listener) => {
    try {
      listener(entry);
    } catch (error) {
      logger.warn("Dynamic entry listener failed", error);
    }
  });
};

Game.prototype.tryDropTeleporterPad = function tryDropTeleporterPad() {
  const index = this.inventory.findIndex((item) => isTeleporterPadId(item.metadata?.id ?? item.id));
  if (index < 0) {
    return false;
  }
  const item = this.inventory[index];
  const entry = item.sourceEntry ?? null;
  const sourceEntity = item.sourceEntity ?? null;
  if (!entry) {
    this.sendMessage("You can't place the pad right now.", 1600);
    return true;
  }

  const baseMetadata =
    entry.metadata ??
    sourceEntity?.metadata ??
    getModelDefinition(TELEPORT_PAD_ID) ?? { id: TELEPORT_PAD_ID, label: "Teleporter Pad", collectable: true };
  const variant = getObjectVariantById(baseMetadata.id ?? TELEPORT_PAD_ID);
  copyVariantOffsetsToEntry(entry, variant);
  const baseSize = normalizeSizeVector(sourceEntity?.size ?? entry.size ?? variant?.size ?? [1, 0.1, 1]);

  const dropPosition = snapToGridCenter(this.player.position.clone());
  const playerHalf = this.player.getHalfSize();
  const playerBottom = this.player.position.y - playerHalf.y;
  const level = Math.round(playerBottom);
  dropPosition.y = level + baseSize.y / 2;

  let entity = sourceEntity;
  if (!entity || typeof entity.getMetadataId !== "function") {
    entity = new WorldObject({
      id: baseMetadata.id ?? TELEPORT_PAD_ID,
      position: dropPosition.clone(),
      size: baseSize.clone(),
      metadata: baseMetadata,
      mesh: sourceEntity?.mesh ?? entry.mesh ?? null,
      entry,
      state: entry.state ?? "default",
    });
  }

  entity.position.copy(dropPosition);
  entity.meshPosition = dropPosition.clone();
  entity.size = baseSize.clone();
  entity.setMetadata(baseMetadata);
  entity.setState(entry.state ?? "default");
  if (entity.mesh) {
    const meshPosition = applyOffsetsToPosition(entity.meshPosition, entry, variant);
    entity.mesh.position.copy(meshPosition);
    entity.mesh.visible = true;
    const targetGroup = this.world.roomGroup;
    if (targetGroup && entity.mesh.parent !== targetGroup) {
      entity.mesh.parent?.remove(entity.mesh);
      targetGroup.add(entity.mesh);
    }
  }

  entry.collected = false;
  entry.type = "object";
  entry.room = this.currentRoom;
  entry.position = entity.position.clone();
  entry.meshPosition = entity.mesh ? entity.mesh.position.clone() : entity.meshPosition.clone();
  entry.metadata = entity.metadata;
  entry.state = entity.state;
  entry.size = [entity.size.x, entity.size.y, entity.size.z];
  this.notifyEntryListeners(entry);

  if (typeof entity.collected === "boolean") {
    entity.collected = false;
    if (typeof entity.syncMeshState === "function") {
      entity.syncMeshState();
    }
  }

  if (entry.type === "object") {
    if (!this.objects.some((record) => record.entry === entry)) {
      this.objects.push({ entity, entry });
    }
  } else if (entry.type === "collectable") {
    if (!this.collectables) {
      this.collectables = [];
    }
    if (!this.collectables.some((record) => record.entry === entry)) {
      this.collectables.push({ id: entry.id, entity, entry });
    }
  }
  this.teleportPadState = {
    mode: "placed",
    roomId: this.currentRoom,
    position: entity.position.clone(),
    entry,
    entity,
    size: entity.size.clone(),
  };
  this.inventory.splice(index, 1);
  this.notifyInventoryChange();
  this.sendMessage("Teleporter pad placed.", 1600);
  return true;
};

Game.prototype.applyAmbientSettings = function applyAmbientSettings(settings) {
  const source = settings ?? this.defaultAmbient ?? { color: "#ffffff", intensity: 0.65 };
  if (this.sceneAmbient) {
    const colorValue = source?.color;
    if (colorValue) {
      if (typeof colorValue === "string") {
        this.sceneAmbient.color.set(colorValue);
      } else if (colorValue.isColor) {
        this.sceneAmbient.color.copy(colorValue);
      }
    } else if (this.defaultAmbient?.color) {
      this.sceneAmbient.color.copy(this.defaultAmbient.color);
    }
  }
  const intensity =
    typeof source?.intensity === "number" && Number.isFinite(source.intensity)
      ? source.intensity
      : this.defaultAmbient?.intensity ?? this.sceneAmbient?.intensity ?? 0;
  if (this.sceneAmbient) {
    this.sceneAmbient.intensity = intensity;
  }
  const reference = this.ambientReferenceIntensity > 0 ? this.ambientReferenceIntensity : 1;
  const factor = Math.max(0, intensity / reference);
  this.directionalLights.forEach(({ light, baseIntensity }) => {
    light.intensity = baseIntensity * factor;
  });
};

function findDoorSpawn(doorways, targetDoorId) {
  if (!targetDoorId) {
    return null;
  }
  const doorway = doorways?.find((entry) => entry.id === targetDoorId);
  if (!doorway) {
    return null;
  }
  if (doorway.spawn) {
    return { position: doorway.spawn.clone(), spawnId: doorway.spawnId };
  }
  const center = doorway.box?.getCenter(new Vector3());
  if (center) {
    return { position: center, spawnId: doorway.spawnId };
  }
  return null;
}

function resolveCratePair(a, b) {
  const halfA = a.getHalfSize();
  const halfB = b.getHalfSize();

  const dx = a.position.x - b.position.x;
  const dy = a.position.y - b.position.y;
  const dz = a.position.z - b.position.z;

  const overlapX = halfA.x + halfB.x - Math.abs(dx);
  const overlapY = halfA.y + halfB.y - Math.abs(dy);
  const overlapZ = halfA.z + halfB.z - Math.abs(dz);

  if (overlapX <= 0 || overlapY <= 0 || overlapZ <= 0) {
    return false;
  }

  const minHalfY = Math.min(halfA.y, halfB.y);
  const verticallyAligned = Math.abs(dy) < minHalfY * STACK_ALIGN_THRESHOLD;
  const preferVertical = overlapY <= overlapX && overlapY <= overlapZ && !verticallyAligned;

  if (preferVertical) {
    const target = halfA.y + halfB.y + EPSILON;
    if (dy >= 0) {
      a.position.y = b.position.y + target;
      if (a.velocity.y < 0) {
        a.velocity.y = 0;
      }
      a.onGround = true;
    } else {
      b.position.y = a.position.y + target;
      if (b.velocity.y < 0) {
        b.velocity.y = 0;
      }
      b.onGround = true;
    }
    return true;
  }

  const axis = overlapX < overlapZ ? "x" : "z";
  const axisDiff = axis === "x" ? dx : dz;
  const direction = axisDiff >= 0 ? 1 : -1;

  const targetSeparation =
    (axis === "x" ? halfA.x + halfB.x : halfA.z + halfB.z) + EPSILON;
  const currentSeparation = Math.abs(axisDiff);
  const correction = targetSeparation - currentSeparation;
  if (correction <= 0) {
    return false;
  }

  const velA = Math.abs(a.previousVelocity[axis]);
  const velB = Math.abs(b.previousVelocity[axis]);
  let weightA = 0.5;
  let weightB = 0.5;

  if (velA > velB + 0.001) {
    weightA = 1;
    weightB = 0;
  } else if (velB > velA + 0.001) {
    weightA = 0;
    weightB = 1;
  }

  const dirPositive = direction > 0;
  const aBlocked =
    axis === "x"
      ? dirPositive
        ? a.blocked?.posX
        : a.blocked?.negX
      : dirPositive
      ? a.blocked?.posZ
      : a.blocked?.negZ;
  const bBlocked =
    axis === "x"
      ? dirPositive
        ? b.blocked?.negX
        : b.blocked?.posX
      : dirPositive
      ? b.blocked?.negZ
      : b.blocked?.posZ;

  if (aBlocked && !bBlocked) {
    weightA = 0;
    weightB = 1;
  } else if (bBlocked && !aBlocked) {
    weightA = 1;
    weightB = 0;
  } else if (aBlocked && bBlocked) {
    return false;
  }

  const weightSum = weightA + weightB;
  if (weightSum === 0) {
    return false;
  }
  weightA /= weightSum;
  weightB /= weightSum;

  a.position[axis] += weightA * correction * direction;
  b.position[axis] -= weightB * correction * direction;

  if (weightA === 1 && weightB === 0) {
    b.velocity[axis] = a.velocity[axis];
  } else if (weightB === 1 && weightA === 0) {
    a.velocity[axis] = b.velocity[axis];
  } else {
    const avg = (a.velocity[axis] + b.velocity[axis]) / 2;
    a.velocity[axis] = avg;
    b.velocity[axis] = avg;
  }

  return true;
}

Game.prototype.queueRoomTransition = function queueRoomTransition(doorway) {
  if (this.pendingTransition && this.pendingTransition.doorId === doorway.id) {
    return;
  }

  this.pendingTransition = {
    doorId: doorway.id,
    room: doorway.target,
    targetDoor: doorway.targetDoor,
    spawn: null,
    spawnId: doorway.targetSpawnId ?? null,
  };
  this.transitionCooldown = DOOR_TRANSITION_COOLDOWN;
};

Game.prototype.queueTeleporterTransition = function queueTeleporterTransition(padState, spawnPosition) {
  if (!padState?.roomId || !spawnPosition) {
    return;
  }
  this.pendingTransition = {
    doorId: padState.entry?.id ?? "teleport-pad",
    room: padState.roomId,
    targetDoor: null,
    spawn: spawnPosition.clone(),
    spawnId: null,
  };
  this.transitionCooldown = DOOR_TRANSITION_COOLDOWN;
};

Game.prototype.processPendingTransition = function processPendingTransition() {
  if (!this.pendingTransition || this.transitionCooldown > 0) {
    return;
  }

  const transition = this.pendingTransition;
  this.pendingTransition = null;
  this.activeDoorId = null;

  const options = {
    spawn: transition.spawn,
    spawnId: transition.spawnId,
    doorId: transition.targetDoor,
  };

  this.loadRoomByName(transition.room, options);
};
