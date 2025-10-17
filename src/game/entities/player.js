import { Box3, Vector3 } from "three";

const PLAYER_SIZE = new Vector3(0.8, 1.6, 0.8);
const MOVE_SPEED = 4;
const JUMP_VELOCITY = 8;
const GRAVITY = -18;

export class Player {
  constructor({ position = new Vector3(), input } = {}) {
    this.position = position.clone();
    this.velocity = new Vector3();
    this.boundingBox = new Box3();
    this.onGround = false;
    this.input = input;
    this.spawn = position.clone();
  }

  update(delta, world) {
    const wasGrounded = this.onGround;
    this.onGround = false;
    if (this.input?.isPressed("jump") && wasGrounded) {
      this.velocity.y = JUMP_VELOCITY;
      this.onGround = false;
    }

    const move = this.computeMoveVector();
    this.velocity.x = move.x * MOVE_SPEED;
    this.velocity.z = move.z * MOVE_SPEED;
    this.velocity.y += GRAVITY * delta;

    world.resolveCollisions(this, delta);
  }

  computeMoveVector() {
    const impulse = new Vector3();
    if (this.input?.isPressed("up")) {
      impulse.z -= 1;
    }
    if (this.input?.isPressed("down")) {
      impulse.z += 1;
    }
    if (this.input?.isPressed("left")) {
      impulse.x -= 1;
    }
    if (this.input?.isPressed("right")) {
      impulse.x += 1;
    }

    if (impulse.lengthSq() > 0) {
      impulse.normalize();
    }

    return impulse;
  }

  getSize() {
    return PLAYER_SIZE.clone();
  }

  getBoundingBox() {
    const halfSize = this.getSize().multiplyScalar(0.5);
    this.boundingBox.min.copy(this.position).sub(halfSize);
    this.boundingBox.max.copy(this.position).add(halfSize);
    return this.boundingBox;
  }

  reset() {
    this.position.copy(this.spawn);
    this.velocity.set(0, 0, 0);
    this.onGround = false;
  }

  setSpawn(position) {
    this.spawn.copy(position);
    this.reset();
  }

  setPosition(position) {
    this.position.copy(position);
  }
}
