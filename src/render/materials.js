import { MeshStandardMaterial } from "three";

const materialRegistry = new Map([
  [
    "floor",
    new MeshStandardMaterial({
      color: 0x324055,
      metalness: 0,
      roughness: 0.85,
    }),
  ],
  [
    "wall",
    new MeshStandardMaterial({
      color: 0x1f2a3b,
      metalness: 0.1,
      roughness: 0.9,
    }),
  ],
  [
    "block",
    new MeshStandardMaterial({
      color: 0x6c9bd2,
      metalness: 0.05,
      roughness: 0.6,
    }),
  ],
  [
    "blockTall",
    new MeshStandardMaterial({
      color: 0x88a4d4,
      metalness: 0.05,
      roughness: 0.6,
    }),
  ],
  [
    "default",
    new MeshStandardMaterial({
      color: 0xcccccc,
    }),
  ],
  [
    "door",
    new MeshStandardMaterial({
      color: 0xffd166,
      metalness: 0.1,
      roughness: 0.6,
      emissive: 0x221100,
      emissiveIntensity: 0.15,
    }),
  ],
]);

export function getMaterial(name) {
  if (!name) {
    return materialRegistry.get("default");
  }
  return materialRegistry.get(name) ?? materialRegistry.get("default");
}

export function registerMaterial(name, material) {
  if (!name || !material) {
    return;
  }
  materialRegistry.set(name, material);
}
