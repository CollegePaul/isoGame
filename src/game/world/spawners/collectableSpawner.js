import { Collectable } from "../../entities/collectable.js";

export function createCollectablesFromDefinitions(dynamicEntities = []) {
  const collectables = [];

  dynamicEntities
    .filter((entry) => entry?.type === "collectable")
    .forEach((entry, index) => {
      const id = entry.id ?? `collectable-${index}`;
      const collectable = new Collectable({
        id,
        position: entry.position,
        size: entry.size,
        metadata: entry.metadata ?? null,
        mesh: entry.mesh ?? null,
        entry,
      });

      collectable.applyEntryUpdate(entry);

      if (!Array.isArray(entry.__listeners)) {
        entry.__listeners = [];
      }
      const listener = () => collectable.applyEntryUpdate(entry);
      entry.__listeners.push(listener);

      if (entry.collected) {
        collectable.markAsCollected();
      } else {
        collectable.syncMeshState();
      }

      collectables.push({ id, entity: collectable, entry });
    });

  return collectables;
}
