import { BoxGeometry, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { Player } from "./entities/player.js";
import { World } from "./world/world.js";
import { logger } from "../utils/logger.js";
import { createCratesFromDefinitions } from "./world/spawners/crateSpawner.js";

const PLAYER_GEOMETRY = new BoxGeometry(0.8, 1.6, 0.8);
const PLAYER_MATERIAL = new MeshStandardMaterial({ color: 0xffcc66 });
const PUSH_DIRECTION = new Vector3();
const EPSILON = 1e-4;
const VERTICAL_SNAP_EPS = 0.3;
const CRATE_COLLISION_ITERATIONS = 3;

export class Game {
  constructor({ scene, input }) {
    this.world = new World({ scene });
    this.player = new Player({ input });
    this.crates = [];

    this.playerMesh = new Mesh(PLAYER_GEOMETRY, PLAYER_MATERIAL);
    this.playerMesh.castShadow = true;
    scene.add(this.playerMesh);
    this.activeDoorId = null;
  }

  loadRoom(roomBuilder) {
    const builtRoom = this.world.loadRoom(roomBuilder);
    this.player.setSpawn(this.world.spawnPoint);

    this.crates = createCratesFromDefinitions(builtRoom.dynamicEntities ?? []);
    this.world.clearDynamicMeshes();
    this.crates.forEach(({ mesh }) => this.world.addDynamicMesh(mesh));
    this.syncMeshes();
  }

  update(delta) {
    this.player.update(delta, this.world);
    this.handlePlayerCrateInteractions();
    this.crates.forEach(({ entity }) => entity.update(delta, this.world));
    this.resolveCrateCollisions();
    this.syncMeshes();
    this.checkDoorways();
  }

  getPlayer() {
    return this.player;
  }

  syncMeshes() {
    this.playerMesh.position.copy(this.player.position);
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
        logger.info(
          `Door reached: ${activeDoor.id}`,
          activeDoor.target ? `→ target room "${activeDoor.target}"` : "(no target assigned)",
        );
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
