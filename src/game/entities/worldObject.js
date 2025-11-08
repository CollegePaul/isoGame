import { Box3, Vector3 } from "three";

const DEFAULT_SIZE = new Vector3(1, 1, 1);
const DEFAULT_POSITION = new Vector3();

function cloneVector(value, fallback) {
  if (value && typeof value === "object") {
    if (typeof value.isVector3 === "boolean" && value.isVector3) {
      return value.clone();
    }
    if (Array.isArray(value) && value.length >= 3) {
      return new Vector3(Number(value[0]) || 0, Number(value[1]) || 0, Number(value[2]) || 0);
    }
  }
  return fallback.clone();
}

export class WorldObject {
  constructor({ id, position, size, metadata = {}, mesh = null, entry = null, state = null } = {}) {
    this.id = id ?? metadata?.id ?? "object";
    this.position = cloneVector(position, DEFAULT_POSITION);
    this.size = cloneVector(size, DEFAULT_SIZE);
    this.metadata = metadata ?? {};
    this.mesh = mesh ?? null;
    this.entry = entry ?? null;
    this.state = state ?? metadata?.defaultState ?? "default";
    this.boundingBox = new Box3();
    this.meshPosition = cloneVector(entry?.meshPosition ?? position ?? DEFAULT_POSITION, DEFAULT_POSITION);
    if (entry) {
      this.applyEntryUpdate(entry);
    }
  }

  getMetadataId() {
    return this.metadata?.id ?? this.id;
  }

  getLabel() {
    return this.metadata?.label ?? this.getMetadataId();
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

  setMesh(mesh) {
    this.mesh = mesh ?? null;
    if (mesh) {
      mesh.position.copy(this.meshPosition ?? this.position);
    }
    if (this.entry) {
      this.entry.mesh = this.mesh;
      this.entry.meshPosition = this.meshPosition?.clone?.() ?? this.meshPosition;
    }
  }

  setMetadata(metadata) {
    this.metadata = metadata ?? {};
    if (this.entry) {
      this.entry.metadata = this.metadata;
    }
  }

  setState(state) {
    this.state = state;
    if (this.entry) {
      this.entry.state = state;
    }
  }

  setSize(size) {
    this.size = cloneVector(size, DEFAULT_SIZE);
    if (this.entry) {
      this.entry.size = this.size.clone();
    }
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
    if (entry.mesh) {
      this.mesh = entry.mesh;
    }
    if (entry.meshPosition) {
      this.meshPosition = cloneVector(entry.meshPosition, this.meshPosition);
    }
    if (entry.mesh && this.mesh) {
      this.mesh.position.copy(this.meshPosition ?? this.position);
    }
    if (typeof entry.state === "string") {
      this.state = entry.state;
    }
  }
}
