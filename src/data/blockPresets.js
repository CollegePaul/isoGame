import { getTileById } from "./tiles.js";

export const blockAtlas = {
  texture: "/assets/textures/blockAtlas.png",
  tileSize: 64,
};

export const blockPresets = [
  {
    id: "block_green_cross",
    label: "Green Cross Crate",
    faces: {
      top: "floor_green_cross",
      bottom: "wall_green_strip",
      north: "wall_green_strip",
      south: "wall_green_strip",
      east: "wall_green_strip",
      west: "wall_green_strip",
    },
    preview: { atlas: blockAtlas.texture, col: 4, row: 0},
    usage: ["crate", "block", "blockTall", "floor"],
    tags: ["green", "cross"],
  },
  {
    id: "block_orange_cross",
    label: "Orange Cross Crate",
    faces: {
      top: "floor_orange_cross",
      bottom: "wall_orange_strip",
      north: "wall_orange_strip",
      south: "wall_orange_strip",
      east: "wall_orange_strip",
      west: "wall_orange_strip",
    },
    preview: { atlas: blockAtlas.texture, col: 1, row: 0 },
    usage: ["crate", "block", "blockTall", "floor"],
    tags: ["orange", "cross"],
  },
  {
    id: "block_gold",
    label: "Gold Storage",
    faces: {
      top: "floor_gold_wood",
      bottom: "wall_gold_strip",
      north: "wall_gold_strip",
      south: "wall_gold_strip",
      east: "wall_gold_strip",
      west: "wall_gold_strip",
    },
    preview: { atlas: blockAtlas.texture, col: 2, row: 0 },
    usage: ["crate", "block", "blockTall", "floor"],
    tags: ["gold", "storage"],
  },
  {
    id: "floor_green_cross",
    label: "Green Cross Floor",
    faces: {
      top: "floor_green_cross",
      bottom: "floor_green_cross",
      north: "wall_green_strip",
      south: "wall_green_strip",
      east: "wall_green_strip",
      west: "wall_green_strip",
    },
    usage: ["floor"],
    tags: ["green", "cross", "floor"],
  },
  {
    id: "floor_red_diamond",
    label: "Red Warning Floor",
    faces: {
      top: "floor_red_diamond",
      bottom: "floor_red_diamond",
      north: "wall_warning_strip",
      south: "wall_warning_strip",
      east: "wall_warning_strip",
      west: "wall_warning_strip",
    },
    preview: { atlas: blockAtlas.texture, col: 3, row: 0 },
    usage: ["floor"],
    tags: ["red", "warning", "diamond"],
  },
  {
    id: "floor_stone",
    label: "Stone Tile",
    faces: {
      top: "floor_stone",
      bottom: "floor_stone",
      north: "floor_stone",
      south: "floor_stone",
      east: "floor_stone",
      west: "floor_stone",
    },
    preview: { atlas: blockAtlas.texture, col: 6, row: 0 },
    usage: ["floor"],
    tags: ["stone"],
  },
  {
    id: "floor_wood_plank",
    label: "Wood Plank",
    faces: {
      top: "floor_wood_plank",
      bottom: "floor_wood_plank",
      north: "floor_wood_plank",
      south: "floor_wood_plank",
      east: "floor_wood_plank",
      west: "floor_wood_plank",
    },
    preview: { atlas: blockAtlas.texture, col: 5, row: 0 },
    usage: ["floor"],
    tags: ["wood"],
  },
  {
    id: "custom",
    label: "Custom",
    faces: {},
    usage: ["block", "blockTall", "crate", "floor"],
    allowCustom: true,
  },
];

export function getBlockPreset(id) {
  return blockPresets.find((preset) => preset.id === id);
}

export function listBlockPresets(filterFn = () => true) {
  return blockPresets.filter(filterFn);
}

export function listBlockPresetsByUsage(usage) {
  if (!usage) {
    return blockPresets;
  }
  return blockPresets.filter((preset) => preset.usage?.includes(usage));
}

export function resolveFaceTiles(presetId) {
  const preset = getBlockPreset(presetId) || getBlockPreset("custom");
  if (!preset || !preset.faces) {
    return null;
  }
  const result = {};
  Object.entries(preset.faces).forEach(([face, tileId]) => {
    const tile = getTileById(tileId);
    if (tile) {
      result[face] = tile;
    }
  });
  return result;
}

export function getDefaultPresetIdForUsage(usage) {
  const presets = listBlockPresetsByUsage(usage);
  const dedicated = presets.find((preset) => Array.isArray(preset.usage) && preset.usage.length === 1 && preset.usage.includes(usage));
  if (dedicated) {
    return dedicated.id;
  }
  if (presets.length > 0) {
    return presets[0].id;
  }
  const fallback = getBlockPreset("custom");
  return fallback?.id ?? "custom";
}
