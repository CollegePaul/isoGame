import { Mesh } from "three";
import { getMaterial } from "../../../render/materials.js";
import { Crate } from "../../entities/crate.js";
import { createBoxGeometryWithUVs } from "../../../render/atlas.js";

const geometryCache = new Map();

function getGeometry(sizeKey, size) {
  if (!geometryCache.has(sizeKey)) {
    geometryCache.set(
      sizeKey,
      createBoxGeometryWithUVs(size.x, size.y, size.z, { default: "crate" }),
    );
  }
  return geometryCache.get(sizeKey);
}

export function createCratesFromDefinitions(dynamicEntities) {
  const crates = [];

  dynamicEntities
    .filter((entry) => entry.type === "crate")
    .forEach((entry, index) => {
      const { position, size, material } = entry;
      const key = `${size.x}:${size.y}:${size.z}`;
      const geometry = getGeometry(key, size);
      const mesh = new Mesh(geometry, getMaterial(material ?? "crate"));
      mesh.position.copy(position);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      const crate = new Crate({ position: position.clone(), size: size.clone() });
      crates.push({ mesh, entity: crate, id: `crate-${index}` });
    });

  return crates;
}
