export const tileAtlas = {
  texture: "/assets/textures/atlas.png",
  tileSize: 32,
};

export const tiles = [
  {
    id: "floor_green_cross",
    col: 0,
    row: 0,
    tags: ["floor", "green", "cross"],
  },
  {
    id: "wall_green_strip",
    col: 0,
    row: 1,
    tags: ["wall", "green"],
  },
  {
    id: "floor_orange_cross",
    col: 0,
    row: 2,
    tags: ["floor", "orange", "cross"],
  },
  {
    id: "wall_orange_strip",
    col: 0,
    row: 3,
    tags: ["wall", "orange"],
  },
  {
    id: "floor_gold_wood",
    col: 0,
    row: 4,
    tags: ["floor", "gold", "wood"],
  },
  {
    id: "wall_gold_strip",
    col: 0,
    row: 5,
    tags: ["wall", "gold"],
  },
  {
    id: "floor_warning_cross",
    col: 0,
    row: 6,
    tags: ["floor", "warning", "cross"],
  },
  {
    id: "wall_warning_strip",
    col: 0,
    row: 7,
    tags: ["wall", "warning"],
  },
  {
    id: "floor_red_diamond",
    col: 0,
    row: 8,
    tags: ["floor", "red", "diamond"],
  },
  {
    id: "floor_stone",
    col: 0,
    row: 9,
    tags: ["floor", "stone"],
  },
  {
    id: "floor_wood_plank",
    col: 0,
    row: 10,
    tags: ["floor", "wood"],
  },
];

export function getTileById(id) {
  return tiles.find((tile) => tile.id === id);
}

export function listTilesByTag(tag) {
  return tiles.filter((tile) => tile.tags?.includes(tag));
}

export function getTileByCoord(col, row) {
  return tiles.find((tile) => tile.col === col && tile.row === row);
}
