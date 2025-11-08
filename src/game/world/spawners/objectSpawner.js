import { WorldObject } from "../../entities/worldObject.js";

export function createObjectsFromDefinitions(dynamicEntities = []) {
  const objects = [];

  dynamicEntities
    .filter((entry) => entry?.type === "object")
    .forEach((entry) => {
      const object = new WorldObject({
        id: entry.id,
        position: entry.position,
        size: entry.size,
        metadata: entry.metadata ?? {},
        mesh: entry.mesh ?? null,
        entry,
        state: entry.state ?? entry.metadata?.defaultState ?? "default",
      });
      object.applyEntryUpdate(entry);
      if (!Array.isArray(entry.__listeners)) {
        entry.__listeners = [];
      }
      const listener = () => object.applyEntryUpdate(entry);
      entry.__listeners.push(listener);
      objects.push({ entity: object, entry });
    });

  return objects;
}
