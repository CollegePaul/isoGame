import { Box3, Vector3 } from "three";

const DEFAULT_SIZE = new Vector3(1, 1, 1);
const DEFAULT_POSITION = new Vector3();

const cloneVector = (value, fallback) => {
  if (value && typeof value === "object" && typeof value.isVector3 === "boolean") {
    return value.clone();
  }
  if (Array.isArray(value) && value.length >= 3) {
    return new Vector3(value[0], value[1], value[2]);
  }
  return fallback.clone();
};

export class Collectable {
  constructor({ id, position, size, metadata = null, mesh = null, entry = null } = {}) {
    this.id = id ?? "collectable";
    this.position = cloneVector(position, DEFAULT_POSITION);
    this.size = cloneVector(size, DEFAULT_SIZE);
    this.metadata = metadata;
    this.entry = entry ?? null;
    this.mesh = mesh ?? null;
    this.collected = Boolean(entry?.collected);
    this.boundingBox = new Box3();
    this.meshPosition = cloneVector(entry?.meshPosition ?? position ?? DEFAULT_POSITION, DEFAULT_POSITION);
    if (entry) {
      this.applyEntryUpdate(entry);
    }
  }

  getBoundingBox() {
    const half = this.getHalfSize();
    this.boundingBox.min.copy(this.position).sub(half);
    this.boundingBox.max.copy(this.position).add(half);
    return this.boundingBox;
  }

  getHalfSize() {
    return this.size.clone().multiplyScalar(0.5);
  }

  isCollected() {
    return this.collected;
  }

  collect() {
    if (this.collected) {
      return false;
    }
    this.collected = true;
    if (this.entry) {
      this.entry.collected = true;
    }
    this.syncMeshState();
    return true;
  }

  markAsCollected() {
    if (!this.collected) {
      this.collected = true;
      if (this.entry) {
        this.entry.collected = true;
      }
    }
    this.syncMeshState();
  }

  syncMeshState() {
    const mesh = this.getMesh();
    if (mesh) {
      mesh.visible = !this.collected;
      mesh.position.copy(this.meshPosition);
    }
  }

  getMesh() {
    if (this.entry?.mesh && this.entry.mesh !== this.mesh) {
      this.mesh = this.entry.mesh;
    }
    return this.mesh;
  }

  applyEntryUpdate(entry) {
    if (!entry) {
      return;
    }
    this.entry = entry;
    if (entry.position) {
      if (entry.position.isVector3) {
        this.position.copy(entry.position);
      } else if (Array.isArray(entry.position) && entry.position.length >= 3) {
        this.position.set(
          Number(entry.position[0]) || 0,
          Number(entry.position[1]) || 0,
          Number(entry.position[2]) || 0,
        );
      }
    }
    if (entry.size) {
      if (entry.size.isVector3) {
        this.size.copy(entry.size);
      } else if (Array.isArray(entry.size) && entry.size.length >= 3) {
        this.size.set(
          Number(entry.size[0]) || 1,
          Number(entry.size[1]) || 1,
          Number(entry.size[2]) || 1,
        );
      }
    }
    if (entry.metadata) {
      this.metadata = entry.metadata;
    }
    if (typeof entry.collected === "boolean") {
      this.collected = entry.collected;
    }
    if (entry.mesh) {
      this.mesh = entry.mesh;
    }
    if (entry.meshPosition) {
      this.meshPosition = cloneVector(entry.meshPosition, this.meshPosition);
    }
    this.syncMeshState();
  }
}
