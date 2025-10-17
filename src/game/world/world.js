import { Box3, Group, Vector3 } from "three";

const EPSILON = 1e-4;

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

  return {
    ...raw,
    box,
    axisMask,
  };
};

export class World {
  constructor({ scene }) {
    this.scene = scene;
    this.roomGroup = new Group();
    this.scene.add(this.roomGroup);
    this.colliders = [];
    this.spawnPoint = new Vector3(0, 0.8, 0);
    this._scratchBox = new Box3();
    this._halfSize = new Vector3();
  }

  loadRoom(roomBuilder) {
    this.roomGroup.clear();
    this.colliders = [];
    const { meshes = [], colliders = [], spawnPoint } = roomBuilder();
    meshes.forEach((mesh) => this.roomGroup.add(mesh));
    this.colliders.push(...colliders.map((item) => normalizeCollider(item)));
    if (spawnPoint) {
      this.spawnPoint.copy(spawnPoint);
    }
  }

  resolveCollisions(entity, delta) {
    const size = entity.getSize();
    const half = this._halfSize.copy(size).multiplyScalar(0.5);
    const position = entity.position.clone();
    const colliders = this.colliders;
    const box = this._scratchBox;

    const integrateAxis = (axis) => {
      const velocityComponent = entity.velocity[axis];
      if (velocityComponent === 0) {
        return;
      }

      position[axis] += velocityComponent * delta;
      box.setFromCenterAndSize(position, size);

      for (const collider of colliders) {
        if (!collider.axisMask[axis]) {
          continue;
        }

        if (!box.intersectsBox(collider.box)) {
          continue;
        }

        const colliderBox = collider.box;
        if (axis === "y") {
          if (velocityComponent > 0) {
            position.y = colliderBox.min.y - half.y - EPSILON;
          } else {
            position.y = colliderBox.max.y + half.y + EPSILON;
            entity.onGround = true;
          }
          entity.velocity.y = 0;
        } else if (axis === "x") {
          if (velocityComponent > 0) {
            position.x = colliderBox.min.x - half.x - EPSILON;
          } else {
            position.x = colliderBox.max.x + half.x + EPSILON;
          }
          entity.velocity.x = 0;
        } else if (axis === "z") {
          if (velocityComponent > 0) {
            position.z = colliderBox.min.z - half.z - EPSILON;
          } else {
            position.z = colliderBox.max.z + half.z + EPSILON;
          }
          entity.velocity.z = 0;
        }

        box.setFromCenterAndSize(position, size);
      }
    };

    integrateAxis("y");
    integrateAxis("x");
    integrateAxis("z");

    entity.position.copy(position);
  }
}
