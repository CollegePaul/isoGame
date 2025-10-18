import { Box3 } from "three";
import { defaultColliderMask } from "./collisionGroups.js";

const EPSILON = 1e-4;

const scratchBox = new Box3();

export function resolveCollisions(entity, colliders, delta) {
  const size = entity.getSize();
  const half = size.clone().multiplyScalar(0.5);
  const position = entity.position.clone();
  const entityMask = entity.collisionMask ?? defaultColliderMask;

  const integrateAxis = (axis) => {
    const velocityComponent = entity.velocity[axis];
    if (velocityComponent === 0) {
      return;
    }

    position[axis] += velocityComponent * delta;
    scratchBox.setFromCenterAndSize(position, size);

    for (const collider of colliders) {
      if (!collider.axisMask[axis]) {
        continue;
      }

      const colliderMask = collider.mask ?? defaultColliderMask;
      if ((entityMask & colliderMask) === 0) {
        continue;
      }

      if (!scratchBox.intersectsBox(collider.box)) {
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
          markBlocked(entity, "posX");
        } else {
          position.x = colliderBox.max.x + half.x + EPSILON;
          markBlocked(entity, "negX");
        }
        entity.velocity.x = 0;
      } else if (axis === "z") {
        if (velocityComponent > 0) {
          position.z = colliderBox.min.z - half.z - EPSILON;
          markBlocked(entity, "posZ");
        } else {
          position.z = colliderBox.max.z + half.z + EPSILON;
          markBlocked(entity, "negZ");
        }
        entity.velocity.z = 0;
      }

      scratchBox.setFromCenterAndSize(position, size);
    }
  };

  integrateAxis("y");
  integrateAxis("x");
  integrateAxis("z");

  entity.position.copy(position);
}

function markBlocked(entity, key) {
  if (!entity || !entity.blocked) {
    return;
  }
  entity.blocked[key] = true;
}
