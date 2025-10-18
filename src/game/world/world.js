import { Box3, Group, Vector3 } from "three";
import { resolveCollisions } from "../physics/collisionWorld.js";
import { defaultColliderMask } from "../physics/collisionGroups.js";

const normalizeCollider = (raw) => {
  let box;
  if (raw.box instanceof Box3) {
    box = raw.box.clone();
  } else if (raw.min && raw.max) {
    box = new Box3().set(raw.min.clone(), raw.max.clone());
  } else if (raw.center && raw.size) {
    const half = raw.size.clone().multiplyScalar(0.5);
    box = new Box3().set(raw.center.clone().sub(half), raw.center.clone().add(half));
  } else {
    throw new Error("Invalid collider definition.");
  }

  const axes = Array.isArray(raw.axes) && raw.axes.length > 0 ? raw.axes : ["x", "y", "z"];
  const axisMask = { x: false, y: false, z: false };
  axes.forEach((axis) => {
    if (axis in axisMask) {
      axisMask[axis] = true;
    }
  });

  const mask = raw.mask ?? defaultColliderMask;

  return {
    ...raw,
    box,
    axisMask,
    mask,
  };
};

export class World {
  constructor({ scene }) {
    this.scene = scene;
    this.roomGroup = new Group();
    this.dynamicGroup = new Group();
    this.scene.add(this.roomGroup);
    this.scene.add(this.dynamicGroup);
    this.colliders = [];
    this.spawnPoint = new Vector3(0, 0.8, 0);
    this.doorways = [];
  }

  loadRoom(roomBuilder) {
    this.roomGroup.clear();
    this.dynamicGroup.clear();
    this.colliders = [];
    const builtRoom = roomBuilder();
    const { meshes = [], colliders = [], spawnPoint, doorways = [] } = builtRoom;
    meshes.forEach((mesh) => this.roomGroup.add(mesh));
    this.colliders.push(...colliders.map((item) => normalizeCollider(item)));
    this.doorways = doorways;
    if (spawnPoint) {
      this.spawnPoint.copy(spawnPoint);
    }
    return builtRoom;
  }

  resolveCollisions(entity, delta) {
    resolveCollisions(entity, this.colliders, delta);
  }

  getDoorways() {
    return this.doorways;
  }

  clearDynamicMeshes() {
    this.dynamicGroup.clear();
  }

  addDynamicMesh(mesh) {
    this.dynamicGroup.add(mesh);
  }
}
