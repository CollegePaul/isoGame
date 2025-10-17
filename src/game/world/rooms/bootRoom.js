import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from "three";

const TILE_SIZE = 1;
const ROOM_DIMENSION = 8;

const FLOOR_HEIGHT = 0.125;
const WALL_THICKNESS = 0.25;
const WALL_HEIGHT = 3;

const floorMaterial = new MeshStandardMaterial({ color: 0x324055 });
const wallMaterial = new MeshStandardMaterial({ color: 0x1f2a3b });
const blockMaterial = new MeshStandardMaterial({ color: 0x6c9bd2 });
const tallBlockMaterial = new MeshStandardMaterial({ color: 0x88a4d4 });

export function buildBootRoom() {
  const meshes = [];
  const colliders = [];
  const spawnPoint = new Vector3(0, 0.9, 0);

  meshes.push(createFloor(colliders));
  meshes.push(...createPerimeterWalls(colliders));
  meshes.push(...createTestBlocks(colliders));

  return { meshes, colliders, spawnPoint };
}

function createFloor(colliders) {
  const floorGroup = new Group();
  const geometry = new BoxGeometry(TILE_SIZE, FLOOR_HEIGHT, TILE_SIZE);

  for (let z = 0; z < ROOM_DIMENSION; z += 1) {
    for (let x = 0; x < ROOM_DIMENSION; x += 1) {
      const mesh = new Mesh(geometry, floorMaterial);
      const offsetX = x - (ROOM_DIMENSION - 1) / 2;
      const offsetZ = z - (ROOM_DIMENSION - 1) / 2;
      mesh.position.set(offsetX * TILE_SIZE, -FLOOR_HEIGHT / 2, offsetZ * TILE_SIZE);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      floorGroup.add(mesh);
    }
  }

  colliders.push({
    center: new Vector3(0, -FLOOR_HEIGHT / 2, 0),
    size: new Vector3(ROOM_DIMENSION, FLOOR_HEIGHT, ROOM_DIMENSION),
    axes: ["y"],
  });

  return floorGroup;
}

function createPerimeterWalls(colliders) {
  const halfSpan = (ROOM_DIMENSION * TILE_SIZE) / 2;
  const definitions = [
    {
      center: new Vector3(-halfSpan - WALL_THICKNESS / 2, WALL_HEIGHT / 2, 0),
      size: new Vector3(WALL_THICKNESS, WALL_HEIGHT, ROOM_DIMENSION),
      axes: ["x", "y"],
      visible: false,
    },
    {
      center: new Vector3(halfSpan + WALL_THICKNESS / 2, WALL_HEIGHT / 2, 0),
      size: new Vector3(WALL_THICKNESS, WALL_HEIGHT, ROOM_DIMENSION),
      axes: ["x", "y"],
      visible: false,
    },
    {
      center: new Vector3(0, WALL_HEIGHT / 2, -halfSpan - WALL_THICKNESS / 2),
      size: new Vector3(ROOM_DIMENSION + WALL_THICKNESS * 2, WALL_HEIGHT, WALL_THICKNESS),
      axes: ["z", "y"],
      visible: true,
    },
    {
      center: new Vector3(0, WALL_HEIGHT / 2, halfSpan + WALL_THICKNESS / 2),
      size: new Vector3(ROOM_DIMENSION + WALL_THICKNESS * 2, WALL_HEIGHT, WALL_THICKNESS),
      axes: ["z", "y"],
      visible: false,
    },
  ];

  return definitions.reduce((walls, definition) => {
    const { center, size, axes, visible } = definition;
    if (visible) {
      const geometry = new BoxGeometry(size.x, size.y, size.z);
      const mesh = new Mesh(geometry, wallMaterial);
      mesh.position.copy(center);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      walls.push(mesh);
    }

    colliders.push({
      center: center.clone(),
      size: size.clone(),
      axes,
    });
    return walls;
  }, []);
}

function createTestBlocks(colliders) {
  const meshes = [];

  const blocks = [
    {
      position: new Vector3(1.5, 0.5, 1.5),
      size: new Vector3(1, 1, 1),
      material: blockMaterial,
    },
    {
      position: new Vector3(-1.5, 0.5, 2.5),
      size: new Vector3(1, 1, 1),
      material: blockMaterial,
    },
    {
      position: new Vector3(0, 1, -1.5),
      size: new Vector3(1, 2, 1),
      material: tallBlockMaterial,
    },
    {
      position: new Vector3(-2.5, 1, -2),
      size: new Vector3(1, 2, 1),
      material: tallBlockMaterial,
    },
    {
      position: new Vector3(2.5, 0.5, -2.5),
      size: new Vector3(1, 1, 1),
      material: blockMaterial,
    },
  ];

  blocks.forEach(({ position, size, material }) => {
    const geometry = new BoxGeometry(size.x, size.y, size.z);
    const mesh = new Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    meshes.push(mesh);

    colliders.push({
      center: position.clone(),
      size: size.clone(),
    });
  });

  return meshes;
}
