export const CollisionLayer = {
  STATIC: 1 << 0,
  PLAYER: 1 << 1,
  CRATE: 1 << 2,
  CRATE_SOLID: 1 << 3,
};

export const defaultColliderMask = CollisionLayer.STATIC | CollisionLayer.CRATE | CollisionLayer.PLAYER;
