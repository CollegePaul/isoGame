import { floor } from "three/tsl";

export const TILE_IDS = {
  floor_green_cross: { col: 0, row: 0 },
  wall_green_stripe: { col: 0, row: 1 },
  floor_brown_cross: { col: 0, row: 2 },
  wall_brown_stripe: { col: 0, row: 3 },
  decor_crate_wood: { col: 0, row: 4 },
  floor_red_cross: { col: 0, row: 5 },
  wall_red_stripe: { col: 0, row: 6 },  
  decore_crate_plain: { col: 0, row: 7 },
  floor_red_diamond: { col: 0, row: 8 },
  floor_grey_cross: { col: 0, row: 9 },
  wall_brown_wood: { col: 0, row: 10 },
};

export const blocks = {
    block_red_cross: {floor: "floor_red_cross", wall: "wall_red_stripe"},
    block_green_cross: {floor: "floor_green_cross", wall: "wall_green_stripe"},
    block_brown_cross: {floor: "floor_brown_cross", wall: "wall_brown_stripe"},
    block_red_diamond: {floor: "floor_red_diamond", wall: "wall_red_stripe"},
    floor_green_cross: {floor: "floor_green_cross"},
    floor_brown_cross: {floor: "floor_brown_cross"},
    wall_red_stripe: {wall: "wall_red_stripe"},
    crate_wood: {crate: "decor_crate_wood"},
    crate_plain: {crate: "decore_crate_plain"},
};
