import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import {
  eraseAt,
  getSnapshot,
  placeBlock,
  placeCrate,
  setGridSize,
  setPlayer,
  subscribe,
} from "./state.js";
import { snapshotToJson } from "./serializer.js";
import { getMaterial } from "../render/materials.js";
import { calculateCameraPosition } from "../render/cameraRig.js";

const container = document.getElementById("viewport");
if (!container) {
  throw new Error("Missing #viewport container for editor.");
}

const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.domElement.style.display = "block";
container.appendChild(renderer.domElement);

const scene = new Scene();
scene.background = new Color("#0d121d");

const cameraState = {
  distance: 18,
  pan: Math.PI / 4,
  tilt: Math.PI / 4.5,
};

const camera = new PerspectiveCamera(45, 1, 0.1, 100);
updateCamera();

const ambient = new AmbientLight(0xffffff, 0.65);
scene.add(ambient);
const keyLight = new DirectionalLight(0xffffff, 0.8);
keyLight.position.set(6, 10, 6);
scene.add(keyLight);
const fillLight = new DirectionalLight(0x8fb8ff, 0.35);
fillLight.position.set(-6, 8, -4);
scene.add(fillLight);

const floorGroup = new Group();
const wallGroup = new Group();
const blockGroup = new Group();
const crateGroup = new Group();
const playerGroup = new Group();
let playerMesh = null;

scene.add(floorGroup);
scene.add(wallGroup);
scene.add(blockGroup);
scene.add(crateGroup);
scene.add(playerGroup);

const highlightMaterial = new MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.25,
  depthWrite: false,
});
const highlightMesh = new Mesh(new BoxGeometry(1, 0.02, 1), highlightMaterial);
highlightMesh.visible = false;
scene.add(highlightMesh);

const PLAYER_HEIGHT = 1.6;
const playerGeometry = new BoxGeometry(0.8, PLAYER_HEIGHT, 0.8);
const playerMaterial = new MeshStandardMaterial({ color: 0xffd480 });
const singleBlockGeometry = new BoxGeometry(1, 1, 1);
const doubleBlockGeometry = new BoxGeometry(1, 2, 1);
const floorTileGeometry = new BoxGeometry(1, 0.125, 1);
const crateGeometry = new BoxGeometry(0.9, 0.9, 0.9);

const pointer = new Vector2();
const raycaster = new Raycaster();
const groundPlane = new Plane(new Vector3(0, 1, 0), 0);
const intersectionPoint = new Vector3();

let currentSnapshot = getSnapshot();
let currentTool = "block-1";
let isRotating = false;
let rotatePointerId = null;
let rotateStart = { x: 0, y: 0, pan: cameraState.pan, tilt: cameraState.tilt };

const toolSelect = document.getElementById("tool-select");
const gridWidthInput = document.getElementById("grid-width");
const gridDepthInput = document.getElementById("grid-depth");
const gridApplyButton = document.getElementById("apply-grid");
const exportButton = document.getElementById("export-room");
const exportOutput = document.getElementById("export-output");

if (!toolSelect || !gridWidthInput || !gridDepthInput || !gridApplyButton || !exportButton || !exportOutput) {
  throw new Error("Missing editor controls in DOM.");
}

toolSelect.addEventListener("change", (event) => {
  currentTool = event.target.value;
});

gridApplyButton.addEventListener("click", () => {
  setGridSize(Number(gridWidthInput.value), Number(gridDepthInput.value));
});

exportButton.addEventListener("click", () => {
  exportOutput.value = snapshotToJson(currentSnapshot);
  exportOutput.focus();
  exportOutput.select();
});

renderer.domElement.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  const tile = pickTile(event);
  if (tile) {
    eraseAt(tile.xIndex, tile.zIndex);
  }
});

renderer.domElement.addEventListener("pointerdown", (event) => {
  renderer.domElement.setPointerCapture(event.pointerId);
  if (event.shiftKey && event.button === 0) {
    isRotating = true;
    rotatePointerId = event.pointerId;
    rotateStart = {
      x: event.clientX,
      y: event.clientY,
      pan: cameraState.pan,
      tilt: cameraState.tilt,
    };
    return;
  }

  if (event.button === 0) {
    const tile = pickTile(event);
    if (!tile) {
      return;
    }
    applyTool(tile.xIndex, tile.zIndex);
  }
});

renderer.domElement.addEventListener("pointermove", (event) => {
  if (isRotating && event.pointerId === rotatePointerId) {
    const deltaX = event.clientX - rotateStart.x;
    const deltaY = event.clientY - rotateStart.y;
    cameraState.pan = rotateStart.pan - deltaX * 0.01;
    cameraState.tilt = clamp(0.2, Math.PI / 2.2, rotateStart.tilt - deltaY * 0.01);
    updateCamera();
    return;
  }

  const tile = pickTile(event);
  if (tile) {
    highlightMesh.visible = true;
    highlightMesh.position.set(tile.worldPosition.x, 0.01, tile.worldPosition.z);
  } else {
    highlightMesh.visible = false;
  }
});

renderer.domElement.addEventListener("pointerup", (event) => {
  renderer.domElement.releasePointerCapture(event.pointerId);
  if (isRotating && event.pointerId === rotatePointerId) {
    isRotating = false;
    rotatePointerId = null;
  }
});

renderer.domElement.addEventListener("pointerleave", () => {
  highlightMesh.visible = false;
});

window.addEventListener("wheel", (event) => {
  const delta = Math.sign(event.deltaY);
  cameraState.distance = clamp(6, 40, cameraState.distance + delta * 1.2);
  updateCamera();
}, { passive: true });

window.addEventListener("resize", resizeRenderer);
resizeRenderer();

subscribe((snapshot) => {
  currentSnapshot = snapshot;
  if (document.activeElement !== gridWidthInput) {
    gridWidthInput.value = snapshot.width;
  }
  if (document.activeElement !== gridDepthInput) {
    gridDepthInput.value = snapshot.depth;
  }
  rebuildScene(snapshot);
});

rebuildScene(currentSnapshot);
animate();

function rebuildScene(snapshot) {
  rebuildFloor(snapshot);
  rebuildWalls(snapshot);
  rebuildBlocks(snapshot);
  rebuildCrates(snapshot);
  rebuildPlayer(snapshot);
}

function rebuildFloor(snapshot) {
  floorGroup.clear();
  const material = getMaterial("floor");
  const xOffset = (snapshot.width - 1) / 2;
  const zOffset = (snapshot.depth - 1) / 2;

  for (let z = 0; z < snapshot.depth; z += 1) {
    for (let x = 0; x < snapshot.width; x += 1) {
      const mesh = new Mesh(floorTileGeometry, material);
      mesh.position.set(x - xOffset, -0.0625, z - zOffset);
      mesh.receiveShadow = true;
      floorGroup.add(mesh);
    }
  }
}

function rebuildWalls(snapshot) {
  wallGroup.clear();
  const wallMaterial = getMaterial("wall");
  const width = snapshot.width;
  const depth = snapshot.depth;
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const thickness = 0.25;
  const height = 3;

  const walls = [
    {
      size: [thickness, height, depth],
      position: [-halfWidth - thickness / 2, height / 2, 0],
      visible: false,
    },
    {
      size: [thickness, height, depth],
      position: [halfWidth + thickness / 2, height / 2, 0],
      visible: false,
    },
    {
      size: [width + thickness * 2, height, thickness],
      position: [0, height / 2, -halfDepth - thickness / 2],
      visible: true,
    },
    {
      size: [width + thickness * 2, height, thickness],
      position: [0, height / 2, halfDepth + thickness / 2],
      visible: false,
    },
  ];

  walls.forEach(({ size, position, visible }) => {
    const geometry = new BoxGeometry(size[0], size[1], size[2]);
    const mesh = new Mesh(geometry, wallMaterial);
    mesh.position.set(position[0], position[1], position[2]);
    if (!visible) {
      mesh.visible = false;
    } else {
      mesh.castShadow = false;
      mesh.receiveShadow = true;
    }
    wallGroup.add(mesh);
  });
}

function rebuildBlocks(snapshot) {
  blockGroup.clear();
  snapshot.blocks.forEach(({ x, z, height }) => {
    const geometry = height > 1 ? doubleBlockGeometry : singleBlockGeometry;
    const material = getMaterial(height > 1 ? "blockTall" : "block");
    const world = tileToWorld(snapshot, x, z);
    const mesh = new Mesh(geometry, material);
    mesh.position.set(world.x, height / 2, world.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    blockGroup.add(mesh);
  });
}

function rebuildCrates(snapshot) {
  crateGroup.clear();
  snapshot.crates.forEach(({ x, z }) => {
    const material = getMaterial("crate");
    const world = tileToWorld(snapshot, x, z);
    const mesh = new Mesh(crateGeometry, material);
    mesh.position.set(world.x, 0.45, world.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    crateGroup.add(mesh);
  });
}

function rebuildPlayer(snapshot) {
  playerGroup.clear();
  if (!snapshot.player) {
    playerMesh = null;
    return;
  }
  const material = playerMaterial;
  playerMesh = new Mesh(playerGeometry, material);
  const world = tileToWorld(snapshot, snapshot.player.x, snapshot.player.z);
  playerMesh.position.set(world.x, PLAYER_HEIGHT / 2, world.z);
  playerMesh.castShadow = true;
  playerGroup.add(playerMesh);
}

function pickTile(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  pointer.set(x, y);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.ray.intersectPlane(groundPlane, intersectionPoint);
  if (!hit) {
    return null;
  }

  const xOffset = (currentSnapshot.width - 1) / 2;
  const zOffset = (currentSnapshot.depth - 1) / 2;
  const tileX = Math.round(intersectionPoint.x + xOffset);
  const tileZ = Math.round(intersectionPoint.z + zOffset);

  if (tileX < 0 || tileX >= currentSnapshot.width || tileZ < 0 || tileZ >= currentSnapshot.depth) {
    return null;
  }

  const worldPosition = tileToWorld(currentSnapshot, tileX, tileZ);
  return {
    xIndex: tileX,
    zIndex: tileZ,
    worldPosition,
  };
}

function applyTool(xIndex, zIndex) {
  switch (currentTool) {
    case "block-1":
      placeBlock(xIndex, zIndex, 1);
      break;
    case "block-2":
      placeBlock(xIndex, zIndex, 2);
      break;
    case "crate":
      placeCrate(xIndex, zIndex);
      break;
    case "player":
      setPlayer(xIndex, zIndex);
      break;
    case "erase":
      eraseAt(xIndex, zIndex);
      break;
    default:
      break;
  }
}

function updateCamera() {
  camera.position.copy(calculateCameraPosition(cameraState.distance, cameraState.tilt, cameraState.pan));
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
}

function resizeRenderer() {
  const { clientWidth, clientHeight } = container;
  renderer.setSize(clientWidth, clientHeight);
  camera.aspect = clientWidth / clientHeight;
  camera.updateProjectionMatrix();
}

function tileToWorld(snapshot, x, z) {
  const xOffset = (snapshot.width - 1) / 2;
  const zOffset = (snapshot.depth - 1) / 2;
  return new Vector3(x - xOffset, 0, z - zOffset);
}

function clamp(min, max, value) {
  return Math.min(max, Math.max(min, value));
}

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
