import { MeshStandardMaterial } from "three";
import { getAtlasTexture } from "./atlas.js";

const atlasTexture = getAtlasTexture();

const sharedMaterial = new MeshStandardMaterial({
  map: atlasTexture,
  metalness: 0.05,
  roughness: 0.65,
});

const materialRegistry = new Map([
  ["default", sharedMaterial],
  ["floor", sharedMaterial],
  ["wall", sharedMaterial],
  ["block", sharedMaterial],
  ["blockTall", sharedMaterial],
  ["crate", sharedMaterial],
  ["door", sharedMaterial],
]);

export function getMaterial(name) {
  return materialRegistry.get(name) ?? sharedMaterial;
}

export function registerMaterial(name, material) {
  if (!name || !material) {
    return;
  }
  materialRegistry.set(name, material);
}
