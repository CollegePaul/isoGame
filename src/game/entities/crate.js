import { Box3, Vector3 } from "three";
import { CollisionLayer } from "../physics/collisionGroups.js";

const DEFAULT_SIZE = new Vector3(0.9, 0.9, 0.9);
const MOVE_SPEED = 4;
const GRAVITY = -18;
const FRICTION = 0.35;
const MIN_VELOCITY = 0.01;

export class Crate {
  constructor({ position = new Vector3(), size = DEFAULT_SIZE.clone() } = {}) {
    this.position = position.clone();
    this.size = size.clone();
    this.velocity = new Vector3();
    this.previousVelocity = new Vector3();
    this.boundingBox = new Box3();
    this.onGround = false;
    this.collisionMask = CollisionLayer.STATIC;
  }

  update(delta, world) {
    this.onGround = false;
    this.blocked = {
      posX: false,
      negX: false,
      posZ: false,
      negZ: false,
    };
    this.velocity.y += GRAVITY * delta;
    this.previousVelocity.copy(this.velocity);
    world.resolveCollisions(this, delta);
    if (this.onGround && this.velocity.y < 0) {
      this.velocity.y = 0;
    }
    this.applyFriction("x");
    this.applyFriction("z");
  }

  applyPush(direction, strength = 1) {
    this.velocity.x = direction.x * MOVE_SPEED * strength;
    this.velocity.z = direction.z * MOVE_SPEED * strength;
  }

  getSize() {
    return this.size.clone();
  }

  getBoundingBox() {
    const halfSize = this.size.clone().multiplyScalar(0.5);
    this.boundingBox.min.copy(this.position).sub(halfSize);
    this.boundingBox.max.copy(this.position).add(halfSize);
    return this.boundingBox;
  }

  setPosition(position) {
    this.position.copy(position);
  }

  getHalfSize() {
    return this.size.clone().multiplyScalar(0.5);
  }

  applyFriction(axis) {
    this.velocity[axis] *= FRICTION;
    if (Math.abs(this.velocity[axis]) < MIN_VELOCITY) {
      this.velocity[axis] = 0;
    }
  }
}
