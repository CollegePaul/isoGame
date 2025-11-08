import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  Plane,
  Raycaster,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  WireframeGeometry,
} from "three";
import {
  eraseAt,
  getSnapshot,
  placeBlock,
  updateBlock,
  placeCrate,
  updateCrate,
  placeDoor,
  placeObject,
  updateObject,
  placeFloorTile,
  clearFloorTile,
  placeLight,
  updateLight,
  removeDoor,
  setGridSize,
  setWallHeight,
  setWallThickness,
  setPlayer,
  setRoomId,
  setAmbientColor,
  setAmbientIntensity,
  subscribe,
  updateDoor,
  createRoom,
  setCurrentRoom,
  getProjectSnapshot,
  loadProjectSnapshot,
  setDefaultFloorPreset,
} from "./state.js";
import { snapshotToJson, projectToJson as buildProjectJson } from "./serializer.js";
import { getMaterial } from "../render/materials.js";
import { calculateCameraPosition } from "../render/cameraRig.js";
import { createBoxGeometryWithUVs, getAtlasDimensions, getAtlasTexture, getTileRect } from "../render/atlas.js";
import { computeDoorDefinition, DEFAULT_DOOR_HEIGHT } from "../data/doorRuntime.js";
import {
  blockPresets,
  getBlockPreset,
  listBlockPresetsByUsage,
  resolveFaceTiles,
  getDefaultPresetIdForUsage,
  blockAtlas,
} from "../data/blockPresets.js";
import { getTileById } from "../data/tiles.js";
import atlasUrl from "../../assets/textures/atlas.png";
import blockAtlasTextureUrl from "../../assets/textures/blockAtlas.png";
import { attachSelectionOverlay } from "./selectionOverlay.js";
import { getObjectVariantById, getObjectVariants, loadObjectLibrary } from "../render/objectLibrary.js";

const DEFAULT_BLOCK_PRESET_ID = getDefaultPresetIdForUsage("block");
const DEFAULT_FLOOR_PRESET_ID = getDefaultPresetIdForUsage("floor");

const BLOCK_VARIANTS = [
  { id: "block-half", label: "Half Height", height: 0.5, usage: "block" },
  { id: "block-1", label: "Single Height", height: 1, usage: "block" },
  { id: "block-2", label: "Double Height", height: 2, usage: "blockTall" },
];

const MAX_BLOCK_LEVEL = 5;

const LIGHT_VARIANTS = [
  { id: "neutral", label: "Neutral", color: "#ffffff", intensity: 1, height: 2 },
  { id: "warm", label: "Warm", color: "#ffb07a", intensity: 1.2, height: 2.2 },
  { id: "cool", label: "Cool", color: "#8ecbff", intensity: 1.1, height: 2 },
];

function getLightVariantById(id) {
  return LIGHT_VARIANTS.find((entry) => entry.id === id) ?? null;
}

const viewportCanvas = document.getElementById("viewport-canvas");
const blockMaterialsContainer = document.getElementById("block-materials");
const materialPanelTitle = document.getElementById("material-panel-title");
const roomSelect = document.getElementById("room-select");
const addRoomButton = document.getElementById("add-room-btn");
const doorOrientationSelect = document.getElementById("door-orientation-select");
const roomIdInput = document.getElementById("room-id-input");
const selectionDetails = document.getElementById("selection-details");
const toolSelect = document.getElementById("tool-select");
const toolVariantContainer = document.getElementById("tool-variant-container");
const gridWidthInput = document.getElementById("grid-width");
const gridDepthInput = document.getElementById("grid-depth");
const wallHeightInput = document.getElementById("grid-wall-height");
const wallThicknessInput = document.getElementById("grid-wall-thickness");
const gridApplyButton = document.getElementById("apply-grid");
const ambientColorInput = document.getElementById("ambient-color-input");
const ambientIntensityInput = document.getElementById("ambient-intensity-input");
const ambientIntensityValue = document.getElementById("ambient-intensity-value");
const exportProjectButton = document.getElementById("export-project");
const importProjectButton = document.getElementById("import-project");
const exportOutput = document.getElementById("export-output");
const mapCanvas = document.getElementById("room-map");
const mapCtx = mapCanvas ? mapCanvas.getContext("2d") : null;
const validationMessages = document.getElementById("validation-messages");
const SCROLLABLE_CONTAINER_SELECTOR = ".left-panel, .panel, .material-panel";
const blockMaterialButtons = [];

if (
  !viewportCanvas ||
  !blockMaterialsContainer ||
  !doorOrientationSelect ||
  !roomSelect ||
  !addRoomButton ||
  !toolSelect ||
  !toolVariantContainer ||
  !gridWidthInput ||
  !gridDepthInput ||
  !wallHeightInput ||
  !wallThicknessInput ||
  !gridApplyButton ||
  !ambientColorInput ||
  !ambientIntensityInput ||
  !ambientIntensityValue ||
  !exportProjectButton ||
  !importProjectButton ||
  !exportOutput ||
  !roomIdInput ||
  !selectionDetails
) {
  throw new Error("Missing editor controls or containers in DOM.");
}

getAtlasTexture();
const atlasImage = new Image();
atlasImage.addEventListener("load", () => updateMaterialPreviewStylesSafely());
atlasImage.src = atlasUrl;

const blockAtlasInfo = {
  width: blockAtlas.tileSize,
  height: blockAtlas.tileSize,
};
const blockAtlasImage = new Image();
blockAtlasImage.addEventListener("load", () => {
  blockAtlasInfo.width = blockAtlasImage.naturalWidth || blockAtlasImage.width || blockAtlasInfo.width;
  blockAtlasInfo.height = blockAtlasImage.naturalHeight || blockAtlasImage.height || blockAtlasInfo.height;
  updateMaterialPreviewStylesSafely();
});
blockAtlasImage.src = blockAtlasTextureUrl;

const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.domElement.style.display = "block";
viewportCanvas.appendChild(renderer.domElement);

const scene = new Scene();
scene.background = new Color("#0d121d");

const cameraState = {
  distance: 18,
  pan: Math.PI / 4,
  tilt: Math.PI / 4.5,
};

const camera = new PerspectiveCamera(45, 1, 0.1, 100);

function updateCamera() {
  camera.position.copy(calculateCameraPosition(cameraState.distance, cameraState.tilt, cameraState.pan));
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
}

updateCamera();

const ambient = new AmbientLight(0xffffff, 0.65);
ambient.name = "editor-ambient";
scene.add(ambient);
const keyLight = new DirectionalLight(0xffffff, 0.8);
keyLight.name = "editor-key-light";
keyLight.position.set(6, 10, 6);
scene.add(keyLight);
const fillLight = new DirectionalLight(0x8fb8ff, 0.35);
fillLight.name = "editor-fill-light";
fillLight.position.set(-6, 8, -4);
scene.add(fillLight);
const ambientReferenceIntensity = ambient.intensity || 0.65;
const baseKeyLightIntensity = keyLight.intensity;
const baseFillLightIntensity = fillLight.intensity;

const geometryCache = new Map();

function getCachedBoxGeometry(width, height, depth, tiles) {
  const key = `${width}:${height}:${depth}:${JSON.stringify(tiles ?? {})}`;
  if (!geometryCache.has(key)) {
    geometryCache.set(key, createBoxGeometryWithUVs(width, height, depth, tiles));
  }
  return geometryCache.get(key);
}

const resizeRenderer = () => {
  const { clientWidth, clientHeight } = viewportCanvas;
  renderer.setSize(clientWidth, clientHeight);
  camera.aspect = clientWidth / Math.max(clientHeight, 1);
  camera.updateProjectionMatrix();
};

const floorGroup = new Group();

const wallGroup = new Group();
const blockGroup = new Group();
const doorGroup = new Group();
const crateGroup = new Group();
const objectGroup = new Group();
const lightGroup = new Group();
const playerGroup = new Group();
const doorPlugMaterial = new MeshBasicMaterial({
  color: 0x080b12,
  transparent: true,
  opacity: 0.96,
  depthWrite: false,
});
doorPlugMaterial.name = "doorPlugMaterial";

const selectionOverlay = attachSelectionOverlay(scene);
scene.add(floorGroup, wallGroup, blockGroup, doorGroup, crateGroup, objectGroup, lightGroup, playerGroup);

const highlightMaterial = new LineBasicMaterial({
  color: 0x4c8bf5,
  transparent: true,
  opacity: 0.9,
});
highlightMaterial.depthTest = false;
highlightMaterial.depthWrite = false;
const highlightGeometry = new WireframeGeometry(new BoxGeometry(1, 1, 1));
const highlightMesh = new LineSegments(highlightGeometry, highlightMaterial);
highlightMesh.visible = false;
scene.add(highlightMesh);

const tileSelectionMesh = new Mesh(getCachedBoxGeometry(1, 0.02, 1, { default: "floor" }));
const lightIndicatorGeometry = new SphereGeometry(0.12, 16, 16);

const PLAYER_HEIGHT = 1.6;
const CRATE_HEIGHT = 0.9;
const playerGeometry = getCachedBoxGeometry(0.8, PLAYER_HEIGHT, 0.8, {
  top: "blockTop",
  bottom: "blockSide",
  sides: "blockSide",
});
const playerMaterial = new MeshStandardMaterial({ color: 0xffd480 });

const floorTileGeometry = getCachedBoxGeometry(1, 0.125, 1, {
  top: "floor",
  bottom: "floor",
  sides: "floor",
});

const pointer = new Vector2();
const raycaster = new Raycaster();
const groundPlane = new Plane(new Vector3(0, 1, 0), 0);
const intersectionPoint = new Vector3();

const selectionHighlightMap = new Map();
const blockHighlightKey = (x, z, level = 0) => `${x},${z},${level}`;

let currentSnapshot = getSnapshot();
let currentTool = toolSelect.value;
let currentBlockPresetId = DEFAULT_BLOCK_PRESET_ID;
let currentDoorOrientation = doorOrientationSelect.value || "north";
let currentBlockVariant = BLOCK_VARIANTS[1];
let currentBlockLevel = 0;
let currentDoorLevel = 0;
let currentCrateLevel = 0;
let currentObjectLevel = 0;
let currentLightLevel = 0;
let currentObjectVariant = null;
let currentLightVariant = LIGHT_VARIANTS[0];
let objectVariants = [];
const objectVariantMap = new Map();
let objectLibraryLoading = false;
let objectLibraryError = null;
doorOrientationSelect.value = currentDoorOrientation;
let blockLevelInput = null;
let blockLevelValue = null;
let doorLevelInput = null;
let doorLevelValue = null;
let crateLevelInput = null;
let crateLevelValue = null;
let objectLevelInput = null;
let objectLevelValue = null;
let lightLevelInput = null;
let lightLevelValue = null;
let isRotating = false;
let rotatePointerId = null;
let rotateStart = { x: 0, y: 0, pan: cameraState.pan, tilt: cameraState.tilt };
let playerMesh = null;
let currentSelection = null;
let latestSnapshot = currentSnapshot;
const mapRoomPositions = {};

ensureObjectVariantsLoaded();

function getUsageForTool(tool) {
  switch (tool) {
    case "block":
      return currentBlockVariant?.usage ?? "block";
    case "crate":
      return "crate";
    case "floor":
      return "floor";
    case "object":
      return "object";
    case "door":
      return null;
    case "light":
      return "light";
    default:
      return null;
  }
}

function getEffectivePlacementTool() {
  return currentTool === "select" && currentSelection ? currentSelection.type : currentTool;
}

function clampLevelValue(level) {
  return Math.min(MAX_BLOCK_LEVEL, Math.max(0, Math.round(level ?? 0)));
}

function getCurrentPlacementLevel() {
  const tool = getEffectivePlacementTool();
  switch (tool) {
    case "block":
      return clampLevelValue(currentBlockLevel);
    case "crate":
      return clampLevelValue(currentCrateLevel);
    case "object":
      return clampLevelValue(currentObjectLevel);
    case "door":
      return clampLevelValue(currentDoorLevel);
    case "light":
      return clampLevelValue(currentLightLevel);
    case "player":
      return 0;
    case "floor":
      return 0;
    default:
      if (currentSelection && typeof currentSelection.level === "number") {
        return clampLevelValue(currentSelection.level);
      }
      return 0;
  }
}

function getCurrentPlacementDimensions() {
  const tool = getEffectivePlacementTool();
  switch (tool) {
    case "block": {
      const height = currentBlockVariant?.height ?? 1;
      return { width: 1, depth: 1, height };
    }
    case "crate":
      return { width: CRATE_HEIGHT, depth: CRATE_HEIGHT, height: CRATE_HEIGHT };
    case "object": {
      let size = null;
      if (currentObjectVariant?.size) {
        size = currentObjectVariant.size;
      } else if (currentSelection?.type === "object") {
        size = currentSelection.size;
      }
      const fallback = Array.isArray(size) ? size : [1, 1, 1];
      const width = Math.max(0.1, Number(fallback[0]) || 1);
      const height = Math.max(0.25, Number(fallback[1]) || 1);
      const depth = Math.max(0.1, Number(fallback[2]) || 1);
      return { width, depth, height };
    }
    case "door":
      return { width: 1, depth: 1, height: DEFAULT_DOOR_HEIGHT };
    case "light": {
      const height = currentLightVariant?.height ?? (currentSelection?.height ?? 2);
      return { width: 0.35, depth: 0.35, height };
    }
    case "floor":
      return { width: 1, depth: 1, height: 0.1 };
    case "player":
      return { width: 0.8, depth: 0.8, height: PLAYER_HEIGHT };
    default:
      return { width: 1, depth: 1, height: 1 };
  }
}

function faceTilesToIdMap(faceTiles) {
  const result = {};
  Object.entries(faceTiles || {}).forEach(([face, tile]) => {
    if (tile?.id) {
      result[face] = tile.id;
    }
  });
  return result;
}

function tilesFromIds(tiles, presetId) {
  const descriptors = {};
  const base = resolveFaceTiles(presetId) || {};
  Object.entries(base).forEach(([face, tile]) => {
    if (tile) {
      descriptors[face] = tile;
    }
  });
  Object.entries(tiles || {}).forEach(([face, tileId]) => {
    const tile = getTileById(tileId);
    if (tile) {
      descriptors[face] = tile;
    }
  });
  return descriptors;
}

const FACE_ALIAS_MAP = {
  north: "back",
  south: "front",
  east: "right",
  west: "left",
  up: "top",
  down: "bottom",
};

function descriptorsToUVMap(faces) {
  const map = {};
  Object.entries(faces || {}).forEach(([face, tile]) => {
    if (!tile) {
      return;
    }
    const descriptor = { col: tile.col, row: tile.row };
    map[face] = descriptor;
    const alias = FACE_ALIAS_MAP[face];
    if (alias) {
      map[alias] = descriptor;
    }
    if (face === "sides" || face === "default" || face === "all") {
      map[face] = descriptor;
    }
  });
  return map;
}

const MATERIAL_TILE_FALLBACKS = {
  floor: { top: "floor", bottom: "floor", sides: "floor" },
  wall: { default: "wall" },
  block: { top: "blockTop", bottom: "blockSide", sides: "blockSide" },
  blockTall: { top: "blockTop", bottom: "blockSide", sides: "blockSide" },
  crate: { default: "crate" },
  door: { default: "wall" },
  default: { default: "blockSide" },
};

function getDefaultTilesForMaterial(material) {
  const tiles = MATERIAL_TILE_FALLBACKS[material] || MATERIAL_TILE_FALLBACKS.default;
  return tiles;
}

const DOOR_INWARD_NORMALS = {
  north: new Vector3(0, 0, 1),
  south: new Vector3(0, 0, -1),
  west: new Vector3(1, 0, 0),
  east: new Vector3(-1, 0, 0),
};

function getDoorInwardNormal(orientation) {
  return DOOR_INWARD_NORMALS[orientation] ?? DOOR_INWARD_NORMALS.north;
}

const MISSING_PREVIEW = { atlas: blockAtlasTextureUrl, col: 0, row: 0 };

function getBlockPreviewRect(preview = {}) {
  const tileSize = blockAtlas.tileSize ?? 128;
  const col = preview.col ?? 0;
  const row = preview.row ?? 0;
  return {
    col,
    row,
    tileSize,
    pixelX: col * tileSize,
    pixelY: row * tileSize,
  };
}

function applyBlockPreview(element, previewConfig) {
  const preview = previewConfig || MISSING_PREVIEW;
  const rect = getBlockPreviewRect(preview);
  const textureUrl = resolvePreviewAtlas(preview.atlas);
  const tileSize = rect.tileSize;
  const inferredWidth = (rect.col + 1) * tileSize;
  const inferredHeight = (rect.row + 1) * tileSize;
  const atlasWidth = Math.max(blockAtlasInfo.width || 0, inferredWidth);
  const atlasHeight = Math.max(blockAtlasInfo.height || 0, inferredHeight);
  element.style.backgroundImage = `url(${textureUrl})`;
  element.style.backgroundSize = `${atlasWidth}px ${atlasHeight}px`;
  element.style.backgroundPosition = `-${rect.pixelX}px -${rect.pixelY}px`;
  element.style.backgroundRepeat = "no-repeat";
}

function resolvePreviewAtlas(atlasPath) {
  if (!atlasPath) {
    return blockAtlasTextureUrl;
  }
  if (atlasPath === blockAtlas.texture || atlasPath === "/assets/textures/blockAtlas.png") {
    return blockAtlasTextureUrl;
  }
  return atlasPath;
}

toolSelect.addEventListener("change", (event) => {
  currentTool = event.target.value;
  if (currentTool === "block" && !currentBlockVariant) {
    currentBlockVariant = BLOCK_VARIANTS[1];
  }
  renderToolVariants();
  refreshBlockMaterialPanel();
  updateMaterialSelectionUI();
});

gridApplyButton.addEventListener("click", () => {
  setGridSize(Number(gridWidthInput.value), Number(gridDepthInput.value));
  setWallHeight(Number(wallHeightInput.value));
  setWallThickness(Number(wallThicknessInput.value));
});

ambientColorInput.addEventListener("input", (event) => {
  const value = normalizeColorForInput(event.target.value);
  ambient.color.set(value);
  setAmbientColor(value);
});

ambientIntensityInput.addEventListener("input", (event) => {
  const value = clampAmbientIntensityValue(event.target.value);
  ambientIntensityInput.value = value.toString();
  if (ambientIntensityValue) {
    ambientIntensityValue.textContent = value.toFixed(2);
  }
  ambient.intensity = value;
  applyEditorLighting(value);
});

ambientIntensityInput.addEventListener("change", (event) => {
  const value = clampAmbientIntensityValue(event.target.value);
  setAmbientIntensity(value);
  applyEditorLighting(value);
});

exportProjectButton.addEventListener("click", () => {
  const projectSnapshot = getProjectSnapshot();
  exportOutput.value = buildProjectJson(projectSnapshot);
  exportOutput.focus();
  exportOutput.select();
});

if (mapCanvas) {
  mapCanvas.addEventListener("click", (event) => {
    const rect = mapCanvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const x = (event.clientX - rect.left) * (mapCanvas.width / dpr / rect.width);
    const y = (event.clientY - rect.top) * (mapCanvas.height / dpr / rect.height);
    let closestRoom = null;
    let closestDist = Infinity;
    Object.entries(mapRoomPositions).forEach(([roomId, pos]) => {
      const dx = x - pos.x;
      const dy = y - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < pos.r && dist < closestDist) {
        closestDist = dist;
        closestRoom = roomId;
      }
    });
    if (closestRoom) {
      setCurrentRoom(closestRoom);
    }
  });
}

importProjectButton.addEventListener("click", () => {
  const raw = exportOutput.value.trim();
  if (!raw) {
    alert("Paste a project JSON into the textarea before importing.");
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    loadProjectSnapshot(parsed);
    const freshSnapshot = getSnapshot();
    currentSnapshot = freshSnapshot;
    latestSnapshot = freshSnapshot;
    renderRoomList(freshSnapshot);
    refreshBlockMaterialPanel();
    renderValidation(freshSnapshot);
    renderMap(freshSnapshot);
    updateSelectionDetails(null);
    rebuildScene(freshSnapshot);
    if (freshSnapshot.roomId) {
      roomSelect.value = freshSnapshot.roomId;
    }
    gridWidthInput.value = freshSnapshot.width;
    gridDepthInput.value = freshSnapshot.depth;
    roomIdInput.value = freshSnapshot.roomId ?? "";
  } catch (error) {
    console.error("Failed to import project:", error);
    alert(`Import failed: ${error.message}`);
  }
});

doorOrientationSelect.addEventListener("change", (event) => {
  currentDoorOrientation = event.target.value;
});

function updateMaterialPreviewStylesSafely() {
  if (typeof updateMaterialPreviewStyles === "function") {
    updateMaterialPreviewStyles();
  }
}

roomSelect.addEventListener("change", (event) => {
  const value = event.target.value;
  if (!value) {
    return;
  }
  setCurrentRoom(value);
});

addRoomButton.addEventListener("click", () => {
  const newRoomId = createRoom();
  roomSelect.value = newRoomId;
  roomIdInput.focus();
  roomIdInput.select();
});

roomIdInput.addEventListener("input", (event) => {
  setRoomId(event.target.value);
});

renderer.domElement.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  const tile = pickTile(event);
  if (tile) {
    eraseAt(tile.xIndex, tile.zIndex);
    currentSelection = null;
    updateSelectionDetails(null);
    updateSelectionIndicators();
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
    selectTile(tile.xIndex, tile.zIndex);
    if (currentTool !== "select") {
      applyTool(tile.xIndex, tile.zIndex);
    }
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
    const dims = getCurrentPlacementDimensions();
    const level = getCurrentPlacementLevel();
    const width = Math.max(0.05, Number(dims.width) || 1);
    const height = Math.max(0.05, Number(dims.height) || 1);
    const depth = Math.max(0.05, Number(dims.depth) || 1);
    highlightMesh.scale.set(width, height, depth);
    const centerY = level + height / 2;
    highlightMesh.visible = true;
    highlightMesh.position.set(tile.worldPosition.x, centerY, tile.worldPosition.z);
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

window.addEventListener(
  "wheel",
  (event) => {
    if (isPointerOverScrollableUI(event)) {
      return;
    }
    const delta = Math.sign(event.deltaY);
    if (delta === 0) {
      return;
    }
    cameraState.distance = clamp(6, 40, cameraState.distance + delta * 0.6);
    updateCamera();
  },
  { passive: true },
);

window.addEventListener("resize", resizeRenderer);
resizeRenderer();

window.addEventListener("resize", () => {
  if (latestSnapshot) {
    renderMap(latestSnapshot);
  }
});

subscribe((snapshot) => {
  const previousRoom = latestSnapshot?.roomId;
  latestSnapshot = snapshot;
  currentSnapshot = snapshot;
  if (document.activeElement !== gridWidthInput) {
    gridWidthInput.value = snapshot.width;
  }
  if (document.activeElement !== gridDepthInput) {
    gridDepthInput.value = snapshot.depth;
  }
  if (document.activeElement !== wallHeightInput) {
    wallHeightInput.value = snapshot.wallHeight ?? 3;
  }
  if (document.activeElement !== wallThicknessInput) {
    wallThicknessInput.value = (snapshot.wallThickness ?? 0.25).toFixed(2);
  }
  if (document.activeElement !== roomIdInput) {
    roomIdInput.value = snapshot.roomId ?? "";
  }
  const ambientColor = normalizeColorForInput(snapshot.ambient?.color ?? ambientColorInput.value ?? "#ffffff");
  if (ambientColorInput && document.activeElement !== ambientColorInput) {
    ambientColorInput.value = ambientColor;
  }
  const ambientIntensity = clampAmbientIntensityValue(snapshot.ambient?.intensity ?? 0.65);
  if (ambientIntensityInput && document.activeElement !== ambientIntensityInput) {
    ambientIntensityInput.value = ambientIntensity.toString();
  }
  if (ambientIntensityValue) {
    ambientIntensityValue.textContent = ambientIntensity.toFixed(2);
  }
  renderRoomList(snapshot);
  renderValidation(snapshot);
  renderMap(snapshot);
  if (previousRoom !== snapshot.roomId) {
    currentSelection = null;
    updateSelectionDetails(null);
    updateSelectionIndicators();
  }
  rebuildScene(snapshot);
  reconcileSelection();
  renderToolVariants();
});

initBlockMaterialsPanel();
renderToolVariants();
updateMaterialPreviewStylesSafely();
updateSelectionDetails(null);
renderRoomList(currentSnapshot);
renderValidation(currentSnapshot);
renderMap(currentSnapshot);
rebuildScene(currentSnapshot);
animate();


function initBlockMaterialsPanel() {
  refreshBlockMaterialPanel();
}

function refreshBlockMaterialPanel() {
  if (!blockMaterialsContainer) {
    return;
  }
  const usage = getUsageForTool(currentTool);
  if (materialPanelTitle) {
    let title = "Material Presets";
    switch (usage) {
      case "floor":
        title = "Floor Presets";
        break;
      case "crate":
        title = "Crate Presets";
        break;
      case "blockTall":
        title = "Tall Block Presets";
        break;
      case "block":
        title = "Block Presets";
        break;
      default:
        break;
    }
    materialPanelTitle.textContent = title;
  }
  const presets = listBlockPresetsByUsage(usage);
  blockMaterialsContainer.innerHTML = "";
  blockMaterialButtons.length = 0;

  if (presets.length === 0) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "No presets available for this tool yet.";
    blockMaterialsContainer.appendChild(empty);
    return;
  }

  if (!presets.some((preset) => preset.id === currentBlockPresetId)) {
    currentBlockPresetId = presets[0]?.id ?? DEFAULT_BLOCK_PRESET_ID;
  }

  presets.forEach((preset) => {
    const button = createMaterialButton(preset);
    blockMaterialsContainer.appendChild(button);
    blockMaterialButtons.push(button);
  });

  updateMaterialSelectionUI();
  updateMaterialPreviewStylesSafely();
}

function renderToolVariants() {
  if (!toolVariantContainer) {
    return;
  }
  toolVariantContainer.innerHTML = "";
  blockLevelInput = null;
  blockLevelValue = null;
  doorLevelInput = null;
  doorLevelValue = null;
  crateLevelInput = null;
  crateLevelValue = null;
  objectLevelInput = null;
  objectLevelValue = null;
  lightLevelInput = null;
  lightLevelValue = null;
  currentBlockLevel = Math.min(MAX_BLOCK_LEVEL, Math.max(0, Math.round(currentBlockLevel)));
  currentDoorLevel = Math.min(MAX_BLOCK_LEVEL, Math.max(0, Math.round(currentDoorLevel)));
  currentCrateLevel = Math.min(MAX_BLOCK_LEVEL, Math.max(0, Math.round(currentCrateLevel)));
  currentObjectLevel = Math.min(MAX_BLOCK_LEVEL, Math.max(0, Math.round(currentObjectLevel)));
  currentLightLevel = Math.min(MAX_BLOCK_LEVEL, Math.max(0, Math.round(currentLightLevel)));

  const effectiveTool = currentTool === "select" && currentSelection ? currentSelection.type : currentTool;

  if (effectiveTool === "block") {
    if (!currentBlockVariant) {
      currentBlockVariant = BLOCK_VARIANTS[1];
    }
    const wrapper = document.createElement("div");
    wrapper.className = "tool-variant-buttons";

    BLOCK_VARIANTS.forEach((variant) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = variant.label;
      if (currentBlockVariant && currentBlockVariant.id === variant.id) {
        button.classList.add("selected");
      }
      button.addEventListener("click", () => {
        currentBlockVariant = variant;
        Array.from(toolVariantContainer.querySelectorAll("button"))
          .filter((btn) => btn.type === "button")
          .forEach((btn) => {
            btn.classList.toggle("selected", btn === button);
          });
        const selectedBlock =
          currentSelection && currentSelection.type === "block" ? currentSelection : null;
        if (selectedBlock) {
          updateBlock(selectedBlock.x, selectedBlock.z, selectedBlock.level ?? 0, {
            height: variant.height ?? 1,
          });
        } else {
          renderToolVariants();
          if (currentTool === "block") {
            refreshBlockMaterialPanel();
            updateMaterialSelectionUI();
          }
        }
      });
      wrapper.appendChild(button);
    });

    toolVariantContainer.appendChild(wrapper);

    const levelWrapper = document.createElement("div");
    levelWrapper.className = "properties-field";
    const levelLabel = document.createElement("span");
    levelLabel.textContent = "Level";
    const levelRow = document.createElement("div");
    levelRow.className = "slider-row";
    blockLevelInput = document.createElement("input");
    blockLevelInput.type = "range";
    blockLevelInput.min = "0";
    blockLevelInput.max = String(MAX_BLOCK_LEVEL);
    blockLevelInput.step = "1";
    blockLevelInput.value = String(currentBlockLevel);
    blockLevelValue = document.createElement("span");
    blockLevelValue.className = "slider-value";
    blockLevelValue.textContent = String(currentBlockLevel);
    blockLevelInput.addEventListener("input", () => {
      const parsed = Math.round(Number(blockLevelInput.value));
      const clamped = Math.min(MAX_BLOCK_LEVEL, Math.max(0, parsed));
      currentBlockLevel = clamped;
      blockLevelInput.value = String(clamped);
      blockLevelValue.textContent = String(clamped);
    });
    levelRow.append(blockLevelInput, blockLevelValue);
    levelWrapper.append(levelLabel, levelRow);
    toolVariantContainer.appendChild(levelWrapper);
    return;
  }

  if (effectiveTool === "door") {
    const levelWrapper = document.createElement("div");
    levelWrapper.className = "properties-field";
    const levelLabel = document.createElement("span");
    levelLabel.textContent = "Level";
    const levelRow = document.createElement("div");
    levelRow.className = "slider-row";
    doorLevelInput = document.createElement("input");
    doorLevelInput.type = "range";
    doorLevelInput.min = "0";
    doorLevelInput.max = String(MAX_BLOCK_LEVEL);
    doorLevelInput.step = "1";
    doorLevelInput.value = String(currentDoorLevel);
    doorLevelValue = document.createElement("span");
    doorLevelValue.className = "slider-value";
    doorLevelValue.textContent = String(currentDoorLevel);
    doorLevelInput.addEventListener("input", () => {
      const parsed = Math.round(Number(doorLevelInput.value));
      const clamped = Math.min(MAX_BLOCK_LEVEL, Math.max(0, parsed));
      currentDoorLevel = clamped;
      doorLevelInput.value = String(clamped);
      doorLevelValue.textContent = String(clamped);
    });
    doorLevelInput.addEventListener("change", () => {
      if (currentSelection && currentSelection.type === "door") {
        const previousLevel = currentSelection.level ?? 0;
        const clamped = currentDoorLevel;
        if (previousLevel !== clamped) {
          updateDoor(currentSelection.x, currentSelection.z, previousLevel, { level: clamped });
          currentSelection.level = clamped;
          reconcileSelection();
        }
      }
    });
    levelRow.append(doorLevelInput, doorLevelValue);
    levelWrapper.append(levelLabel, levelRow);
    toolVariantContainer.appendChild(levelWrapper);
    return;
  }

  if (effectiveTool === "crate") {
    const levelWrapper = document.createElement("div");
    levelWrapper.className = "properties-field";
    const levelLabel = document.createElement("span");
    levelLabel.textContent = "Level";
    const levelRow = document.createElement("div");
    levelRow.className = "slider-row";
    crateLevelInput = document.createElement("input");
    crateLevelInput.type = "range";
    crateLevelInput.min = "0";
    crateLevelInput.max = String(MAX_BLOCK_LEVEL);
    crateLevelInput.step = "1";
    crateLevelInput.value = String(currentCrateLevel);
    crateLevelValue = document.createElement("span");
    crateLevelValue.className = "slider-value";
    crateLevelValue.textContent = String(currentCrateLevel);
    crateLevelInput.addEventListener("input", () => {
      const parsed = Math.round(Number(crateLevelInput.value));
      const clamped = Math.min(MAX_BLOCK_LEVEL, Math.max(0, parsed));
      currentCrateLevel = clamped;
      crateLevelInput.value = String(clamped);
      crateLevelValue.textContent = String(clamped);
    });
    crateLevelInput.addEventListener("change", () => {
      if (currentSelection && currentSelection.type === "crate") {
        const clamped = currentCrateLevel;
        updateCrate(currentSelection.x, currentSelection.z, currentSelection.level ?? 0, {
          level: clamped,
          height: CRATE_HEIGHT,
        });
        currentSelection.level = clamped;
        reconcileSelection();
      }
    });
    levelRow.append(crateLevelInput, crateLevelValue);
    levelWrapper.append(levelLabel, levelRow);
    toolVariantContainer.appendChild(levelWrapper);
    return;
  }

  if (effectiveTool === "object") {
    ensureObjectVariantsLoaded();
  if (objectLibraryError) {
      const message = document.createElement("div");
      message.className = "hint";
      message.textContent = "Failed to load object library.";
      toolVariantContainer.appendChild(message);
      return;
    }
    if (objectLibraryLoading || objectVariants.length === 0) {
      const message = document.createElement("div");
      message.className = "hint";
      message.textContent = "Loading objects...";
      toolVariantContainer.appendChild(message);
      return;
    }
    if (!currentObjectVariant && objectVariants.length > 0) {
      currentObjectVariant = objectVariants[0];
    }
    const wrapper = document.createElement("div");
    wrapper.className = "tool-variant-buttons";
    objectVariants.forEach((variant) => {
      if (!objectVariantMap.has(variant.id)) {
        objectVariantMap.set(variant.id, variant);
      }
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = variant.label;
      if (variant.description) {
        button.title = variant.description;
      }
      if (currentObjectVariant && currentObjectVariant.id === variant.id) {
        button.classList.add("selected");
      }
      button.addEventListener("click", () => {
        currentObjectVariant = variant;
        Array.from(toolVariantContainer.querySelectorAll("button")).forEach((btn) => {
          btn.classList.toggle("selected", btn === button);
        });
        const selectedObject =
          currentSelection && currentSelection.type === "object" ? currentSelection : null;
        if (selectedObject) {
          const baseOffset = variant.baseOffset ?? (variant.size?.[1] ?? 1) / 2;
          const newLevel = selectedObject.level ?? currentObjectLevel ?? 0;
          const newHeight = newLevel + baseOffset;
          updateObject(selectedObject.x, selectedObject.z, selectedObject.level ?? 0, {
            presetId: variant.id,
            height: newHeight,
            state: variant.defaultState ?? selectedObject.state ?? null,
            size: Array.isArray(variant.size) ? [...variant.size] : null,
            level: newLevel,
          });
        }
      });
      wrapper.appendChild(button);
    });
    toolVariantContainer.appendChild(wrapper);
    const levelWrapper = document.createElement("div");
    levelWrapper.className = "properties-field";
    const levelLabel = document.createElement("span");
    levelLabel.textContent = "Level";
    const levelRow = document.createElement("div");
    levelRow.className = "slider-row";
    objectLevelInput = document.createElement("input");
    objectLevelInput.type = "range";
    objectLevelInput.min = "0";
    objectLevelInput.max = String(MAX_BLOCK_LEVEL);
    objectLevelInput.step = "1";
    objectLevelInput.value = String(currentObjectLevel);
    objectLevelValue = document.createElement("span");
    objectLevelValue.className = "slider-value";
    objectLevelValue.textContent = String(currentObjectLevel);
    objectLevelInput.addEventListener("input", () => {
      const parsed = Math.round(Number(objectLevelInput.value));
      const clamped = Math.min(MAX_BLOCK_LEVEL, Math.max(0, parsed));
      currentObjectLevel = clamped;
      objectLevelInput.value = String(clamped);
      objectLevelValue.textContent = String(clamped);
    });
    objectLevelInput.addEventListener("change", () => {
      if (currentSelection && currentSelection.type === "object") {
        const clamped = currentObjectLevel;
        const preset = currentObjectVariant ?? objectVariantMap.get(currentSelection.presetId);
        const baseOffset = preset?.baseOffset ?? (preset?.size?.[1] ?? 1) / 2;
        const newHeight = clamped + baseOffset;
        updateObject(currentSelection.x, currentSelection.z, currentSelection.level ?? 0, {
          level: clamped,
          height: newHeight,
        });
        currentSelection.level = clamped;
        currentSelection.height = newHeight;
        reconcileSelection();
      }
    });
    levelRow.append(objectLevelInput, objectLevelValue);
    levelWrapper.append(levelLabel, levelRow);
    toolVariantContainer.appendChild(levelWrapper);
    return;
  }

  if (effectiveTool === "light") {
    if (!currentLightVariant) {
      currentLightVariant = LIGHT_VARIANTS[0];
    }
    const wrapper = document.createElement("div");
    wrapper.className = "tool-variant-buttons";
    LIGHT_VARIANTS.forEach((variant) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = variant.label;
      button.title = `Color: ${variant.color.toUpperCase()} | Intensity: ${variant.intensity}`;
      if (currentLightVariant && currentLightVariant.id === variant.id) {
        button.classList.add("selected");
      }
      button.addEventListener("click", () => {
        currentLightVariant = variant;
        Array.from(toolVariantContainer.querySelectorAll("button")).forEach((btn) => {
          btn.classList.toggle("selected", btn === button);
        });
        const selectedLight =
          currentSelection && currentSelection.type === "light" ? currentSelection : null;
        if (selectedLight) {
          const baseHeight = variant.height ?? 2;
          const newLevel = selectedLight.level ?? currentLightLevel ?? 0;
          const newHeight = newLevel + baseHeight;
          updateLight(selectedLight.x, selectedLight.z, selectedLight.level ?? 0, {
            presetId: variant.id,
            color: variant.color,
            intensity: variant.intensity,
            height: newHeight,
            level: newLevel,
          });
        }
      });
      wrapper.appendChild(button);
    });
    toolVariantContainer.appendChild(wrapper);
    const levelWrapper = document.createElement("div");
    levelWrapper.className = "properties-field";
    const levelLabel = document.createElement("span");
    levelLabel.textContent = "Level";
    const levelRow = document.createElement("div");
    levelRow.className = "slider-row";
    lightLevelInput = document.createElement("input");
    lightLevelInput.type = "range";
    lightLevelInput.min = "0";
    lightLevelInput.max = String(MAX_BLOCK_LEVEL);
    lightLevelInput.step = "1";
    lightLevelInput.value = String(currentLightLevel);
    lightLevelValue = document.createElement("span");
    lightLevelValue.className = "slider-value";
    lightLevelValue.textContent = String(currentLightLevel);
    lightLevelInput.addEventListener("input", () => {
      const parsed = Math.round(Number(lightLevelInput.value));
      const clamped = Math.min(MAX_BLOCK_LEVEL, Math.max(0, parsed));
      currentLightLevel = clamped;
      lightLevelInput.value = String(clamped);
      lightLevelValue.textContent = String(clamped);
    });
    lightLevelInput.addEventListener("change", () => {
      if (currentSelection && currentSelection.type === "light") {
        const clamped = currentLightLevel;
        const preset =
          currentLightVariant ||
          LIGHT_VARIANTS.find((entry) => entry.id === currentSelection.presetId) ||
          LIGHT_VARIANTS[0];
        const baseHeight = preset?.height ?? 2;
        const newHeight = clamped + baseHeight;
        updateLight(currentSelection.x, currentSelection.z, currentSelection.level ?? 0, {
          level: clamped,
          height: newHeight,
        });
        currentSelection.level = clamped;
        currentSelection.height = newHeight;
        reconcileSelection();
      }
    });
    levelRow.append(lightLevelInput, lightLevelValue);
    levelWrapper.append(levelLabel, levelRow);
    toolVariantContainer.append(levelWrapper);
    return;
  }
}

function ensureObjectVariantsLoaded() {
  if (objectVariants.length > 0 || objectLibraryLoading) {
    return;
  }
  objectLibraryLoading = true;
  loadObjectLibrary()
    .then(() => getObjectVariants())
    .then((loadedVariants) => {
      objectVariants = [...loadedVariants];
      objectVariantMap.clear();
      loadedVariants.forEach((variant) => {
        objectVariantMap.set(variant.id, variant);
      });
      if (!currentObjectVariant && objectVariants.length > 0) {
        currentObjectVariant = objectVariants[0];
      }
      objectLibraryLoading = false;
      objectLibraryError = null;
      renderToolVariants();
      rebuildObjects(latestSnapshot);
      if (currentSelection?.type === "object") {
        updateSelectionDetails(currentSelection);
      }
    })
    .catch((error) => {
      objectLibraryError = error;
      objectLibraryLoading = false;
      renderToolVariants();
    });
}

function rebuildScene(snapshot) {
  const ambientSettings = snapshot.ambient ?? {};
  if (ambientSettings.color) {
    ambient.color.set(ambientSettings.color);
  } else {
    ambient.color.set("#ffffff");
  }
  ambient.intensity =
    typeof ambientSettings.intensity === "number" && Number.isFinite(ambientSettings.intensity)
      ? ambientSettings.intensity
      : 0.65;
  applyEditorLighting(ambient.intensity);

  rebuildFloor(snapshot);
  rebuildWalls(snapshot);
  rebuildBlocks(snapshot);
  rebuildDoors(snapshot);
  rebuildCrates(snapshot);
  rebuildObjects(snapshot);
  rebuildLights(snapshot);
  rebuildPlayer(snapshot);
}

function rebuildFloor(snapshot) {
  floorGroup.clear();
  const material = getMaterial("floor");
  const floorState = snapshot.floor ?? {};
  const xOffset = (snapshot.width - 1) / 2;
  const zOffset = (snapshot.depth - 1) / 2;
  const height = floorState.height ?? 0.125;
  const defaultPresetId = floorState.presetId ?? DEFAULT_FLOOR_PRESET_ID;
  let defaultFaceTiles = resolveFaceTiles(defaultPresetId) || null;
  if (!defaultFaceTiles || Object.keys(defaultFaceTiles).length === 0) {
    defaultFaceTiles = resolveFaceTiles(DEFAULT_FLOOR_PRESET_ID) || null;
  }
  if (!defaultFaceTiles || Object.keys(defaultFaceTiles).length === 0) {
    const fallbackTile =
      getTileById("floor_green_cross") ||
      getTileById("floor_stone") ||
      getTileById("floor_wood_plank") ||
      null;
    if (fallbackTile) {
      defaultFaceTiles = { top: fallbackTile, bottom: fallbackTile, sides: fallbackTile };
    }
  }
  const defaultUV = defaultFaceTiles ? descriptorsToUVMap(defaultFaceTiles) : {};

  const overrideMap = new Map();
  (floorState.tiles ?? []).forEach((tile) => {
    if (typeof tile?.x === "number" && typeof tile?.z === "number") {
      overrideMap.set(`${tile.x},${tile.z}`, tile);
    }
  });

  for (let z = 0; z < snapshot.depth; z += 1) {
    for (let x = 0; x < snapshot.width; x += 1) {
      const key = `${x},${z}`;
      const override = overrideMap.get(key);
      const presetId = override?.presetId ?? defaultPresetId;
      let faceTiles = tilesFromIds(override?.tiles, presetId);
      if (!faceTiles || Object.keys(faceTiles).length === 0) {
        faceTiles = resolveFaceTiles(presetId) || defaultFaceTiles || {};
      }
      let uvMap = descriptorsToUVMap(faceTiles);
      if (!uvMap || Object.keys(uvMap).length === 0) {
        uvMap = defaultUV;
      }
      const geometry = getCachedBoxGeometry(1, height, 1, uvMap);
      const mesh = new Mesh(geometry, material);
      mesh.position.set(x - xOffset, -height / 2, z - zOffset);
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
  const thickness = Math.max(0.1, snapshot.wallThickness ?? 0.25);
  const height = Math.max(1, snapshot.wallHeight ?? 3);
  const xOffset = (width - 1) / 2;
  const zOffset = (depth - 1) / 2;

  const westGeometry = getCachedBoxGeometry(thickness, 1, 1, { default: "wall" });
  const northGeometry = getCachedBoxGeometry(1, 1, thickness, { default: "wall" });

  const westX = -xOffset - 0.5 - thickness / 2;
  const northZ = -zOffset - 0.5 - thickness / 2;

  for (let layer = 0; layer < height; layer += 1) {
    const y = layer + 0.5;
    for (let z = 0; z < depth; z += 1) {
      const mesh = new Mesh(westGeometry, wallMaterial);
      mesh.position.set(westX, y, z - zOffset);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      wallGroup.add(mesh);
    }
    for (let x = 0; x < width; x += 1) {
      const mesh = new Mesh(northGeometry, wallMaterial);
      mesh.position.set(x - xOffset, y, northZ);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      wallGroup.add(mesh);
    }
  }
}

function rebuildBlocks(snapshot) {
  blockGroup.clear();
  selectionHighlightMap.set("block", new Map());
  const highlights = selectionHighlightMap.get("block");
  const xOffset = (snapshot.width - 1) / 2;
  const zOffset = (snapshot.depth - 1) / 2;

  snapshot.blocks.forEach((block) => {
    let faceTiles = tilesFromIds(block.tiles, block.presetId);
    if (!faceTiles || Object.keys(faceTiles).length === 0) {
      faceTiles = resolveFaceTiles(block.presetId ?? DEFAULT_BLOCK_PRESET_ID) || {};
    }
    const uvMap = descriptorsToUVMap(faceTiles);
    const blockHeight = block.height ?? 1;
    const blockLevel = block.level ?? 0;
    const geometry = getCachedBoxGeometry(1, blockHeight, 1, uvMap);
    const mesh = new Mesh(geometry, getMaterial("default"));
    mesh.position.set(block.x - xOffset, blockLevel + blockHeight / 2, block.z - zOffset);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { type: "block", payload: block };
    blockGroup.add(mesh);
    highlights.set(blockHighlightKey(block.x, block.z, blockLevel), mesh);
  });
}

function rebuildDoors(snapshot) {
  doorGroup.clear();
  selectionHighlightMap.set("door", new Map());
  const highlights = selectionHighlightMap.get("door");
  const material = getMaterial("door");
  const doors = snapshot.doors ?? [];
  doors.forEach((door) => {
    const runtimeDoor = computeDoorDefinition(
      { ...door },
      { width: snapshot.width, depth: snapshot.depth, tileSize: 1 },
    );
    runtimeDoor.tiles = door.tiles ?? getDefaultTilesForMaterial(runtimeDoor.material ?? "door");
    const meshes = createDoorPreviewMeshes(runtimeDoor);
    const doorNode = new Group();
    doorNode.userData = { type: "door", payload: door };
    meshes.forEach((mesh) => {
      mesh.material = material;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      doorNode.add(mesh);
    });
    doorGroup.add(doorNode);
    highlights.set(
      blockHighlightKey(door.x, door.z, door.level ?? 0),
      doorNode,
    );
  });
}

function rebuildCrates(snapshot) {
  crateGroup.clear();
  selectionHighlightMap.set("crate", new Map());
  const highlights = selectionHighlightMap.get("crate");
  const material = getMaterial("crate");
  const xOffset = (snapshot.width - 1) / 2;
  const zOffset = (snapshot.depth - 1) / 2;

  snapshot.crates.forEach((crate) => {
    let faceTiles = tilesFromIds(crate.tiles, crate.presetId);
    if (!faceTiles || Object.keys(faceTiles).length === 0) {
      faceTiles = resolveFaceTiles(crate.presetId ?? DEFAULT_BLOCK_PRESET_ID) || {};
    }
    const uvMap = descriptorsToUVMap(faceTiles);
    const crateHeight = crate.height ?? CRATE_HEIGHT;
    const geometry = getCachedBoxGeometry(0.9, crateHeight, 0.9, uvMap);
    const level = crate.level ?? 0;
    const mesh = new Mesh(geometry, material);
    mesh.position.set(crate.x - xOffset, level + crateHeight / 2, crate.z - zOffset);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { type: "crate", payload: crate };
    crateGroup.add(mesh);
    highlights.set(blockHighlightKey(crate.x, crate.z, level), mesh);
  });
}

function rebuildObjects(snapshot) {
  objectGroup.clear();
  selectionHighlightMap.set("object", new Map());
  const highlights = selectionHighlightMap.get("object");
  const xOffset = (snapshot.width - 1) / 2;
  const zOffset = (snapshot.depth - 1) / 2;

  const items = snapshot.objects ?? [];
  if (items.length === 0) {
    return;
  }

  if (objectVariants.length === 0 && !objectLibraryLoading) {
    ensureObjectVariantsLoaded();
  }

  items.forEach((object) => {
    const variant = objectVariantMap.get(object.presetId) || objectVariants.find((entry) => entry.id === object.presetId) || null;
    let mesh = null;
    if (variant) {
      mesh = variant.createInstance();
    }
    if (!mesh) {
      mesh = new Mesh(getCachedBoxGeometry(1, 1, 1, { default: "block" }), getMaterial("default"));
    }
    const baseX = object.x - xOffset;
    const baseZ = object.z - zOffset;
    const storedSize = Array.isArray(object.size) && object.size.length >= 3 ? object.size : variant?.size ?? [1, 1, 1];
    let baseY = object.height ?? variant?.baseOffset ?? storedSize[1] / 2;
    let worldX = baseX;
    let worldY = baseY;
    let worldZ = baseZ;
    if (variant?.centerOffset) {
      worldX -= variant.centerOffset.x ?? 0;
      worldY -= variant.centerOffset.y ?? 0;
      worldZ -= variant.centerOffset.z ?? 0;
    } else if (variant?.baseOffset) {
      worldY -= variant.baseOffset;
    }
    mesh.position.set(worldX, worldY, worldZ);
    mesh.rotation.y = object.rotation ?? 0;
    mesh.userData = { type: "object", payload: { ...object } };
    if (variant) {
      mesh.userData.variant = variant;
    }
    objectGroup.add(mesh);
    highlights.set(blockHighlightKey(object.x, object.z, object.level ?? 0), mesh);
  });
}

function rebuildLights(snapshot) {
  lightGroup.clear();
  selectionHighlightMap.set("light", new Map());
  const highlights = selectionHighlightMap.get("light");
  const xOffset = (snapshot.width - 1) / 2;
  const zOffset = (snapshot.depth - 1) / 2;

  (snapshot.lights ?? []).forEach((light) => {
    const variant = getLightVariantById(light.presetId) ?? currentLightVariant ?? LIGHT_VARIANTS[0];
    const color = new Color(light.color ?? variant?.color ?? "#ffffff");
    const intensity = light.intensity ?? variant?.intensity ?? 1;
    const level = light.level ?? 0;
    const height = light.height ?? level + (variant?.height ?? 2);

    const point = new PointLight(color, intensity, 10, 2);
    point.position.set(light.x - xOffset, height, light.z - zOffset);
    point.castShadow = false;

    const indicatorMaterial = new MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });
    const indicator = new Mesh(lightIndicatorGeometry, indicatorMaterial);
    indicator.position.copy(point.position);

    const group = new Group();
    group.add(point, indicator);
    group.userData = { type: "light", payload: { ...light }, variant };

    lightGroup.add(group);
    highlights.set(blockHighlightKey(light.x, light.z, level), group);
  });
}

function rebuildPlayer(snapshot) {
  playerGroup.clear();
  if (!snapshot.player) {
    playerMesh = null;
    selectionHighlightMap.delete("player");
    return;
  }
  playerMesh = new Mesh(playerGeometry, playerMaterial);
  const xOffset = (snapshot.width - 1) / 2;
  const zOffset = (snapshot.depth - 1) / 2;
  playerMesh.position.set(snapshot.player.x - xOffset, PLAYER_HEIGHT / 2, snapshot.player.z - zOffset);
  playerMesh.castShadow = true;
  playerGroup.add(playerMesh);
  selectionHighlightMap.set("player", playerMesh);
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

  const worldPosition = new Vector3(tileX - xOffset, 0, tileZ - zOffset);
  return { xIndex: tileX, zIndex: tileZ, worldPosition };
}

function applyTool(xIndex, zIndex) {
  switch (currentTool) {
    case "block":
      placeBlockWithPreset(xIndex, zIndex, currentBlockVariant?.height ?? 1);
      break;
    case "floor":
      placeFloorWithPreset(xIndex, zIndex);
      break;
    case "crate":
      placeCrateWithPreset(xIndex, zIndex);
      break;
    case "object":
      placeObjectWithPreset(xIndex, zIndex);
      break;
    case "door":
      placeDoorWithCurrentSettings(xIndex, zIndex);
      break;
    case "light":
      placeLightWithPreset(xIndex, zIndex);
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

function selectTile(x, z) {
  currentSelection = { x, z };
  reconcileSelection();
  updateSelectionIndicators();
}

function reconcileSelection() {
  if (!currentSelection) {
    updateSelectionDetails(null);
    updateSelectionIndicators();
    return;
  }
  if (
    currentSelection.x < 0 ||
    currentSelection.z < 0 ||
    currentSelection.x >= currentSnapshot.width ||
    currentSelection.z >= currentSnapshot.depth
  ) {
    currentSelection = null;
    updateSelectionDetails(null);
    return;
  }
  const resolved = resolveSelectionAt(currentSnapshot, currentSelection.x, currentSelection.z);
  if (!resolved) {
    const fallback = { type: "empty", x: currentSelection.x, z: currentSelection.z };
    currentSelection = fallback;
    updateSelectionDetails(fallback);
    updateSelectionIndicators();
    return;
  }
  currentSelection = resolved;
  updateSelectionDetails(resolved);
  updateSelectionIndicators();
}

function resolveSelectionAt(snapshot, x, z) {
  const blocksAtTile = (snapshot.blocks ?? []).filter((entry) => entry.x === x && entry.z === z);
  if (blocksAtTile.length > 0) {
    const normalizedLevel = Math.min(MAX_BLOCK_LEVEL, Math.max(0, Math.round(currentBlockLevel)));
    let blockMatch = blocksAtTile.find((entry) => (entry.level ?? 0) === normalizedLevel);
    if (!blockMatch) {
      blockMatch = blocksAtTile.reduce((best, candidate) =>
        (candidate.level ?? 0) > (best?.level ?? -Infinity) ? candidate : best,
      blocksAtTile[0]);
    }
    return { type: "block", ...blockMatch };
  }
  const doorsAtTile = (snapshot.doors ?? []).filter((entry) => entry.x === x && entry.z === z);
  if (doorsAtTile.length > 0) {
    const normalizedLevel = Math.min(MAX_BLOCK_LEVEL, Math.max(0, Math.round(currentDoorLevel)));
    let doorMatch = doorsAtTile.find((entry) => (entry.level ?? 0) === normalizedLevel);
    if (!doorMatch) {
      doorMatch = doorsAtTile.reduce((best, candidate) =>
        (candidate.level ?? 0) > (best?.level ?? -Infinity) ? candidate : best,
      doorsAtTile[0]);
    }
    return { type: "door", ...doorMatch };
  }
  const cratesAtTile = (snapshot.crates ?? []).filter((entry) => entry.x === x && entry.z === z);
  if (cratesAtTile.length > 0) {
    const normalizedLevel = Math.min(MAX_BLOCK_LEVEL, Math.max(0, Math.round(currentCrateLevel)));
    let crateMatch = cratesAtTile.find((entry) => (entry.level ?? 0) === normalizedLevel);
    if (!crateMatch) {
      crateMatch = cratesAtTile.reduce((best, candidate) =>
        (candidate.level ?? 0) > (best?.level ?? -Infinity) ? candidate : best,
      cratesAtTile[0]);
    }
    return { type: "crate", ...crateMatch };
  }
  const objectsAtTile = (snapshot.objects ?? []).filter((entry) => entry.x === x && entry.z === z);
  if (objectsAtTile.length > 0) {
    const normalizedLevel = Math.min(MAX_BLOCK_LEVEL, Math.max(0, Math.round(currentObjectLevel)));
    let objectMatch = objectsAtTile.find((entry) => (entry.level ?? 0) === normalizedLevel);
    if (!objectMatch) {
      objectMatch = objectsAtTile.reduce((best, candidate) =>
        (candidate.level ?? 0) > (best?.level ?? -Infinity) ? candidate : best,
      objectsAtTile[0]);
    }
    return { type: "object", ...objectMatch };
  }
  const lightsAtTile = (snapshot.lights ?? []).filter((entry) => entry.x === x && entry.z === z);
  if (lightsAtTile.length > 0) {
    const normalizedLevel = Math.min(MAX_BLOCK_LEVEL, Math.max(0, Math.round(currentLightLevel)));
    let lightMatch = lightsAtTile.find((entry) => (entry.level ?? 0) === normalizedLevel);
    if (!lightMatch) {
      lightMatch = lightsAtTile.reduce((best, candidate) =>
        (candidate.level ?? 0) > (best?.level ?? -Infinity) ? candidate : best,
      lightsAtTile[0]);
    }
    return { type: "light", ...lightMatch };
  }
  if (snapshot.player && snapshot.player.x === x && snapshot.player.z === z) {
    return { type: "player", ...snapshot.player };
  }
  if (snapshot.floor) {
    const override =
      snapshot.floor.tiles?.find((entry) => entry.x === x && entry.z === z) ?? null;
    const presetId = override?.presetId ?? snapshot.floor.presetId ?? DEFAULT_FLOOR_PRESET_ID;
    return {
      type: "floor",
      x,
      z,
      presetId,
      tiles: override?.tiles ?? null,
      isOverride: Boolean(override),
    };
  }
  return null;
}

function updateSelectionDetails(selection) {
  selectionDetails.innerHTML = "";
  if (!selection) {
    selectionDetails.innerHTML = "<em>No selection</em>";
    syncToolVariantWithSelection(null);
    return;
  }

  const container = document.createElement("div");
  container.className = "properties-stack";

  container.appendChild(createInfoRow("Tile", `(${selection.x}, ${selection.z})`));
  container.appendChild(createInfoRow("Type", selection.type));

  if (selection.type === "block") {
    container.appendChild(createInfoRow("Preset", selection.presetId ?? "—"));
    container.appendChild(createInfoRow("Height", selection.height));
    container.appendChild(createInfoRow("Level", selection.level ?? 0));
    if (selection.tiles) {
      container.appendChild(createInfoRow("Tiles", formatTiles(selection.tiles)));
    }
  } else if (selection.type === "crate") {
    container.appendChild(createInfoRow("Preset", selection.presetId ?? "—"));
    container.appendChild(createInfoRow("Level", selection.level ?? 0));
  } else if (selection.type === "object") {
    const variant = objectVariantMap.get(selection.presetId) || objectVariants.find((entry) => entry.id === selection.presetId) || null;
    container.appendChild(createInfoRow("Object", variant?.label ?? selection.presetId ?? "—"));
    if (variant?.description) {
      container.appendChild(createInfoRow("Info", variant.description));
    }
    container.appendChild(createInfoRow("Level", selection.level ?? 0));
    container.appendChild(createInfoRow("Collectable", (variant?.collectable ?? false) ? "Yes" : "No"));
    container.appendChild(createInfoRow("Solid", (variant?.solid ?? true) ? "Yes" : "No"));
    if (variant?.requirements?.length) {
      container.appendChild(createInfoRow("Requires", variant.requirements.join(", ")));
    }
    if (variant?.tags?.length) {
      container.appendChild(createInfoRow("Tags", variant.tags.join(", ")));
    }
    if (selection.state) {
      container.appendChild(createInfoRow("State", selection.state));
    }
  } else if (selection.type === "light") {
    const variant = getLightVariantById(selection.presetId);
    container.appendChild(createInfoRow("Light", variant?.label ?? selection.presetId ?? "—"));
    if (variant?.description) {
      container.appendChild(createInfoRow("Info", variant.description));
    }
    container.appendChild(createInfoRow("Level", selection.level ?? 0));
    container.appendChild(buildLightPropertiesForm(selection, variant));
  } else if (selection.type === "player") {
    container.appendChild(createInfoRow("Spawn", "Player"));
  } else if (selection.type === "door") {
    container.appendChild(buildDoorPropertiesForm(selection));
  } else if (selection.type === "floor") {
    container.appendChild(createInfoRow("Preset", selection.presetId ?? "—"));
    container.appendChild(createInfoRow("Source", selection.isOverride ? "Override" : "Room default"));
    if (selection.tiles && Object.keys(selection.tiles).length > 0) {
      container.appendChild(createInfoRow("Tiles", formatTiles(selection.tiles)));
    }
    const actions = document.createElement("div");
    actions.className = "properties-actions";
    const defaultButton = document.createElement("button");
    defaultButton.type = "button";
    defaultButton.textContent = "Use As Room Default";
    defaultButton.addEventListener("click", () => {
      if (selection.presetId) {
        setDefaultFloorPreset(selection.presetId);
      }
    });
    actions.appendChild(defaultButton);
    if (selection.isOverride) {
      const clearButton = document.createElement("button");
      clearButton.type = "button";
      clearButton.className = "secondary";
      clearButton.textContent = "Clear Tile Override";
      clearButton.addEventListener("click", () => {
        clearFloorTile(selection.x, selection.z);
      });
      actions.appendChild(clearButton);
    }
    container.appendChild(actions);
  } else if (selection.type === "empty") {
    container.appendChild(createInfoRow("Status", "Empty tile"));
  }

  selectionDetails.appendChild(container);
  syncToolVariantWithSelection(selection);
}

function updateSelectionIndicators() {
  if (!selectionOverlay) {
    return;
  }
  selectionOverlay.clearSelection();
  selectionOverlay.clearHover();

  if (!currentSelection) {
    return;
  }

  switch (currentSelection.type) {
    case "block":
    case "crate":
    case "door": {
      const map = selectionHighlightMap.get(currentSelection.type);
      const blockKey = blockHighlightKey(
        currentSelection.x,
        currentSelection.z,
        currentSelection.level ?? 0,
      );
      const mesh =
        map?.get(blockKey) ?? map?.get(`${currentSelection.x},${currentSelection.z}`);
      if (mesh) {
        selectionOverlay.updateSelection(mesh);
      }
      break;
    }
    case "object":
    case "light": {
      const map = selectionHighlightMap.get(currentSelection.type);
      const mesh =
        map?.get(
          blockHighlightKey(currentSelection.x, currentSelection.z, currentSelection.level ?? 0),
        ) ?? map?.get(`${currentSelection.x},${currentSelection.z}`);
      if (mesh) {
        selectionOverlay.updateSelection(mesh);
      }
      break;
    }
    case "player": {
      const mesh = selectionHighlightMap.get("player");
      if (mesh) {
        selectionOverlay.updateSelection(mesh);
      }
      break;
    }
    case "floor": {
      const xOffset = (currentSnapshot.width - 1) / 2;
      const zOffset = (currentSnapshot.depth - 1) / 2;
      tileSelectionMesh.position.set(
        currentSelection.x - xOffset,
        -0.04,
        currentSelection.z - zOffset,
      );
      tileSelectionMesh.updateMatrixWorld(true);
      selectionOverlay.updateSelection(tileSelectionMesh);
      break;
    }
    default:
      break;
  }
}

function syncToolVariantWithSelection(selection) {
  if (!selection) {
    return;
  }
  const selectMode = currentTool === "select" || toolSelect.value === "select";
  if (selection.type === "block") {
    if (selectMode) {
      currentTool = "block";
      toolSelect.value = "block";
    }
    currentBlockLevel = Math.min(
      MAX_BLOCK_LEVEL,
      Math.max(0, Math.round(selection.level ?? currentBlockLevel ?? 0)),
    );
    const desiredHeight = selection.height ?? 1;
    let match = BLOCK_VARIANTS.find((variant) => Math.abs((variant.height ?? 1) - desiredHeight) < 0.01);
    if (!match) {
      match = BLOCK_VARIANTS[0];
    }
    currentBlockVariant = match;
    renderToolVariants();
    if (currentTool === "block") {
      refreshBlockMaterialPanel();
      updateMaterialSelectionUI();
    }
    return;
  }
  if (selection.type === "door") {
    if (selectMode) {
      currentTool = "door";
      toolSelect.value = "door";
    }
    currentDoorLevel = Math.min(
      MAX_BLOCK_LEVEL,
      Math.max(0, Math.round(selection.level ?? currentDoorLevel ?? 0)),
    );
    if (selection.orientation) {
      currentDoorOrientation = selection.orientation;
      doorOrientationSelect.value = selection.orientation;
    }
    renderToolVariants();
    return;
  }
  if (selection.type === "crate") {
    if (selectMode) {
      currentTool = "crate";
      toolSelect.value = "crate";
    }
    currentCrateLevel = Math.min(
      MAX_BLOCK_LEVEL,
      Math.max(0, Math.round(selection.level ?? currentCrateLevel ?? 0)),
    );
    renderToolVariants();
    return;
  }
  if (selection.type === "object") {
    ensureObjectVariantsLoaded();
    if (selectMode) {
      currentTool = "object";
      toolSelect.value = "object";
    }
    currentObjectLevel = Math.min(
      MAX_BLOCK_LEVEL,
      Math.max(0, Math.round(selection.level ?? currentObjectLevel ?? 0)),
    );
    const variant =
      objectVariantMap.get(selection.presetId) ||
      objectVariants.find((entry) => entry.id === selection.presetId) ||
      currentObjectVariant;
    if (!variant && objectVariants.length > 0) {
      currentObjectVariant = objectVariants[0];
    } else if (variant) {
      currentObjectVariant = variant;
    }
    renderToolVariants();
    return;
  }
  if (selection.type === "light") {
    if (selectMode) {
      currentTool = "light";
      toolSelect.value = "light";
    }
    currentLightLevel = Math.min(
      MAX_BLOCK_LEVEL,
      Math.max(0, Math.round(selection.level ?? currentLightLevel ?? 0)),
    );
    const variant = LIGHT_VARIANTS.find((entry) => entry.id === selection.presetId) || currentLightVariant;
    if (variant) {
      currentLightVariant = variant;
    }
    renderToolVariants();
    return;
  }
}

function placeBlockWithPreset(x, z, height) {
  const usage = getUsageForTool(currentTool);
  let preset = getBlockPreset(currentBlockPresetId);
  if (!preset || (usage && !preset.usage?.includes(usage))) {
    const fallback = listBlockPresetsByUsage(usage)[0] || blockPresets[0];
    preset = fallback || { id: "custom" };
    currentBlockPresetId = preset.id;
    updateMaterialSelectionUI();
  }

  const faceTiles = resolveFaceTiles(preset.id) || {};
  const tileIds = faceTilesToIdMap(faceTiles);
  const blockHeight = height ?? currentBlockVariant?.height ?? 1;
  const level = Math.min(MAX_BLOCK_LEVEL, Math.max(0, Math.round(currentBlockLevel)));
  placeBlock(x, z, blockHeight, {
    material: preset.id,
    tiles: tileIds,
    presetId: preset.id,
    level,
  });
}

function placeCrateWithPreset(x, z) {
  const usage = "crate";
  let preset = getBlockPreset(currentBlockPresetId);
  if (!preset || !preset.usage?.includes(usage)) {
    const fallback = listBlockPresetsByUsage(usage)[0] || blockPresets[0];
    preset = fallback || { id: "custom" };
    currentBlockPresetId = preset.id;
    updateMaterialSelectionUI();
  }

  const faceTiles = resolveFaceTiles(preset.id) || {};
  const tileIds = faceTilesToIdMap(faceTiles);
  const level = Math.min(MAX_BLOCK_LEVEL, Math.max(0, Math.round(currentCrateLevel)));
  placeCrate(x, z, {
    presetId: preset.id,
    tiles: tileIds,
    level,
    height: CRATE_HEIGHT,
  });
}

function placeObjectWithPreset(x, z) {
  ensureObjectVariantsLoaded();
  if (objectVariants.length === 0) {
    console.warn("Object library not ready yet.");
    return;
  }
  if (!currentObjectVariant) {
    currentObjectVariant = objectVariants[0];
  }
  const variant = objectVariantMap.get(currentObjectVariant?.id) || currentObjectVariant || objectVariants[0];
  if (!variant) {
    return;
  }
  const level = Math.min(MAX_BLOCK_LEVEL, Math.max(0, Math.round(currentObjectLevel)));
  const baseOffset = variant.baseOffset ?? (variant.size?.[1] ?? 1) / 2;
  const height = level + baseOffset;
  placeObject(x, z, {
    presetId: variant.id,
    height,
    rotation: 0,
    state: variant.defaultState ?? null,
    size: Array.isArray(variant.size) ? [...variant.size] : null,
    level,
  });
}

function placeLightWithPreset(x, z) {
  if (!currentLightVariant) {
    currentLightVariant = LIGHT_VARIANTS[0];
  }
  const variant = currentLightVariant;
  const level = Math.min(MAX_BLOCK_LEVEL, Math.max(0, Math.round(currentLightLevel)));
  const height = level + (variant.height ?? 2);
  placeLight(x, z, {
    presetId: variant.id,
    color: variant.color,
    intensity: variant.intensity,
    height,
    level,
  });
}

function placeFloorWithPreset(x, z) {
  const usage = "floor";
  let preset = getBlockPreset(currentBlockPresetId);
  if (!preset || !preset.usage?.includes(usage)) {
    const fallbackPresetId = getDefaultPresetIdForUsage(usage);
    const fallback =
      listBlockPresetsByUsage(usage).find((entry) => entry.id === fallbackPresetId) ||
      listBlockPresetsByUsage(usage)[0] ||
      getBlockPreset(fallbackPresetId) ||
      null;
    preset = fallback || { id: DEFAULT_FLOOR_PRESET_ID };
    currentBlockPresetId = preset.id;
    updateMaterialSelectionUI();
  }
  if (!preset) {
    return;
  }
  const faceTiles = resolveFaceTiles(preset.id) || {};
  const tileIds = faceTilesToIdMap(faceTiles);
  placeFloorTile(x, z, {
    presetId: preset.id,
    tiles: tileIds,
  });
}

function placeDoorWithCurrentSettings(x, z) {
  const level = Math.min(MAX_BLOCK_LEVEL, Math.max(0, Math.round(currentDoorLevel)));
  placeDoor(x, z, {
    orientation: currentDoorOrientation,
    level,
    spawnId: `door-${x}-${z}-${level}-${currentDoorOrientation}-spawn`,
  });
}

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}

function clamp(min, max, value) {
  return Math.min(max, Math.max(min, value));
}

function applyEditorLighting(intensity) {
  const ref = ambientReferenceIntensity > 0 ? ambientReferenceIntensity : 1;
  const numeric = Number(intensity);
  const clampedIntensity = Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
  const factor = clampedIntensity / ref;
  keyLight.intensity = baseKeyLightIntensity * factor;
  fillLight.intensity = baseFillLightIntensity * factor;
}

function normalizeColorForInput(value, fallback = "#ffffff") {
  if (typeof value !== "string") {
    return fallback;
  }
  let hex = value.trim();
  if (!hex) {
    return fallback;
  }
  if (!hex.startsWith("#")) {
    hex = `#${hex}`;
  }
  const shortMatch = /^#([0-9a-fA-F]{3})$/.exec(hex);
  if (shortMatch) {
    const [r, g, b] = shortMatch[1].split("");
    hex = `#${r}${r}${g}${g}${b}${b}`;
  }
  const fullMatch = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (fullMatch) {
    return `#${fullMatch[1].toLowerCase()}`;
  }
  return fallback;
}

function clampAmbientIntensityValue(value, fallback = 0.65) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return Math.min(4, Math.max(0, Number(fallback) || 0.65));
  }
  return Math.min(4, Math.max(0, numeric));
}

function isPointerOverScrollableUI(event) {
  if (!event) {
    return false;
  }
  const target = event.target;
  if (!(target instanceof Element)) {
    return false;
  }
  return Boolean(target.closest(SCROLLABLE_CONTAINER_SELECTOR));
}


function createMaterialButton(preset) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "material-card";
  button.dataset.presetId = preset.id;
  button.dataset.usage = (preset.usage || []).join(",");
  button.title = preset.label ?? preset.id;
  button.setAttribute("aria-label", preset.label ?? preset.id);

  const preview = document.createElement("div");
  preview.className = "material-preview";

  button.append(preview);

  button._previewElement = preview;

  button.addEventListener("click", () => {
    currentBlockPresetId = preset.id;
    updateMaterialSelectionUI();
  });

  return button;
}

function updateMaterialSelectionUI() {
  blockMaterialButtons.forEach((button) => {
    const selected = button.dataset.presetId === currentBlockPresetId;
    button.classList.toggle("selected", selected);
  });
}

function renderRoomList(snapshot) {
  if (!roomSelect) {
    return;
  }
  const rooms = snapshot.roomList ?? [];
  const options = rooms.map((id) => ({ value: id, label: id }));
  updateSelectOptions(roomSelect, options, snapshot.roomId);
  roomSelect.value = snapshot.roomId ?? "";
}

function updateMaterialPreviewStyles() {
  const atlasDims = getAtlasDimensions();
  blockMaterialButtons.forEach((button) => {
    const preset = getBlockPreset(button.dataset.presetId);
    const previewElement = button._previewElement;
    if (!preset || !previewElement) {
      return;
    }
    if (preset.preview) {
      applyBlockPreview(previewElement, preset.preview);
      return;
    }
    const faceTiles = resolveFaceTiles(preset.id) || {};
    const topTile = faceTiles.top || faceTiles.default || faceTiles.sides || Object.values(faceTiles)[0];
    if (topTile) {
      setFaceBackground(previewElement, topTile, atlasDims, atlasUrl);
    } else {
      applyBlockPreview(previewElement, MISSING_PREVIEW);
    }
  });
}

function setFaceBackground(element, tileDescriptor, atlasDims, textureUrl = atlasUrl) {
  if (!element || !tileDescriptor) {
    return;
  }
  const rect = getTileRect(tileDescriptor);
  if (!rect) {
    return;
  }
  const { width, height } = atlasDims;
  element.style.backgroundImage = `url(${textureUrl})`;
  element.style.backgroundSize = `${width}px ${height}px`;
  element.style.backgroundPosition = `-${rect.pixelX}px -${rect.pixelY}px`;
  element.style.backgroundRepeat = "no-repeat";
}

function createInfoRow(label, value) {
  const row = document.createElement("div");
  row.className = "properties-row";
  const labelEl = document.createElement("strong");
  labelEl.textContent = `${label}:`;
  const valueEl = document.createElement("span");
  valueEl.textContent = value ?? "—";
  row.append(labelEl, valueEl);
  return row;
}

function withSelectedLightGroup(selection, callback) {
  if (!selection || typeof callback !== "function") {
    return;
  }
  const map = selectionHighlightMap.get("light");
  if (!map) {
    return;
  }
  const key = `${selection.x},${selection.z}`;
  const group = map.get(key);
  if (group) {
    callback(group);
  }
}

function previewLightColor(selection, color) {
  withSelectedLightGroup(selection, (group) => {
    group.children.forEach((child) => {
      if (child.isLight) {
        child.color.set(color);
      } else if (child.isMesh && child.material && child.material.color) {
        child.material.color.set(color);
      }
    });
    if (group.userData?.payload) {
      group.userData.payload.color = color;
    }
  });
}

function previewLightIntensity(selection, value) {
  withSelectedLightGroup(selection, (group) => {
    group.children.forEach((child) => {
      if (child.isLight) {
        child.intensity = value;
      }
    });
    if (group.userData?.payload) {
      group.userData.payload.intensity = value;
    }
  });
}

function previewLightHeight(selection, value) {
  withSelectedLightGroup(selection, (group) => {
    group.children.forEach((child) => {
      if (child.position) {
        child.position.y = value;
      }
    });
    if (group.userData?.payload) {
      group.userData.payload.height = value;
    }
  });
}

function createLabeledInput(label, value, onChange) {
  const wrapper = document.createElement("div");
  wrapper.className = "properties-field";
  const title = document.createElement("span");
  title.textContent = label;
  const input = document.createElement("input");
  input.type = "text";
  input.value = value ?? "";
  if (onChange) {
    input.addEventListener("input", (event) => onChange(event.target.value));
  }
  wrapper.append(title, input);
  return { wrapper, input };
}

function createLabeledSelect(label, value, options, onChange) {
  const wrapper = document.createElement("div");
  wrapper.className = "properties-field";
  const title = document.createElement("span");
  title.textContent = label;
  const select = document.createElement("select");
  updateSelectOptions(select, options, value);
  if (onChange) {
    select.addEventListener("change", (event) => onChange(event.target.value));
  }
  wrapper.append(title, select);
  return { wrapper, select };
}

function updateSelectOptions(select, options, value) {
  while (select.firstChild) {
    select.removeChild(select.firstChild);
  }
  options.forEach((option) => {
    const opt = document.createElement("option");
    opt.value = option.value ?? "";
    opt.textContent = option.label ?? option.value ?? "";
    if (option.spawnId !== undefined) {
      opt.dataset.spawnId = option.spawnId ?? "";
    } else if (opt.dataset.spawnId) {
      delete opt.dataset.spawnId;
    }
    select.appendChild(opt);
  });
  if (value && !options.some((option) => option.value === value)) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = `${value} (missing)`;
    select.appendChild(opt);
  }
  select.value = value ?? "";
}

function buildRoomOptions() {
  const rooms = latestSnapshot?.roomList ?? [];
  const options = rooms.map((id) => ({ value: id, label: id }));
  options.unshift({ value: "", label: "—" });
  return options;
}

function buildDoorOptions(roomId) {
  if (!roomId) {
    return [{ value: "", label: "—" }];
  }
  const doors = latestSnapshot?.roomsMeta?.[roomId]?.doors ?? [];
  const options = [{ value: "", label: "—" }];
  doors.forEach((door) => {
    options.push({ value: door.id, label: door.label ?? door.id, spawnId: door.spawnId });
  });
  return options;
}

function getDoorSpawnId(roomId, doorId) {
  if (!roomId || !doorId) {
    return "";
  }
  const doors = latestSnapshot?.roomsMeta?.[roomId]?.doors ?? [];
  const match = doors.find((door) => door.id === doorId);
  return match?.spawnId ?? "";
}

function updateDoorOptionsForRoom(select, roomId, currentValue) {
  if (!select) {
    return;
  }
  const options = buildDoorOptions(roomId);
  updateSelectOptions(select, options, currentValue ?? "");
}


function renderMap(snapshot) {
  if (!mapCanvas || !mapCtx) {
    return;
  }
  const rect = mapCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = rect.width || mapCanvas.width || 1;
  const height = rect.height || mapCanvas.height || 1;
  if (mapCanvas.width !== width * dpr || mapCanvas.height !== height * dpr) {
    mapCanvas.width = width * dpr;
    mapCanvas.height = height * dpr;
  }
  mapCtx.setTransform(1, 0, 0, 1, 0, 0);
  mapCtx.scale(dpr, dpr);
  mapCtx.clearRect(0, 0, width, height);
  Object.keys(mapRoomPositions).forEach((key) => delete mapRoomPositions[key]);

  const layout = snapshot.roomLayout || {};
  const roomIds = Object.keys(layout);
  if (roomIds.length === 0) {
    Object.keys(mapRoomPositions).forEach((key) => delete mapRoomPositions[key]);
    return;
  }

  const positions = roomIds.map((id) => layout[id]);
  const minX = Math.min(...positions.map((p) => p.x));
  const maxX = Math.max(...positions.map((p) => p.x));
  const minY = Math.min(...positions.map((p) => p.y));
  const maxY = Math.max(...positions.map((p) => p.y));

  const padding = 32;
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const usableWidth = Math.max(10, width - padding * 2);
  const usableHeight = Math.max(10, height - padding * 2);
  const scale = Math.min(usableWidth / (rangeX + 1), usableHeight / (rangeY + 1));
  const radius = Math.max(10, Math.min(20, scale * 0.35));

  const toCanvas = (pos) => ({
    x: padding + (pos.x - minX + 0.5) * scale,
    y: padding + (pos.y - minY + 0.5) * scale,
  });

  mapCtx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  mapCtx.lineWidth = 2;
  (snapshot.roomEdges || []).forEach((edge) => {
    const from = layout[edge.from];
    const to = layout[edge.to];
    if (!from || !to) {
      return;
    }
    const start = toCanvas(from);
    const end = toCanvas(to);
    mapCtx.beginPath();
    mapCtx.moveTo(start.x, start.y);
    mapCtx.lineTo(end.x, end.y);
    mapCtx.stroke();
  });

  roomIds.forEach((roomId) => {
    const pos = layout[roomId];
    const canvasPos = toCanvas(pos);
    mapRoomPositions[roomId] = { x: canvasPos.x, y: canvasPos.y, r: radius };
    mapCtx.beginPath();
    if (roomId === snapshot.roomId) {
      mapCtx.fillStyle = "#4c8bf5";
    } else {
      mapCtx.fillStyle = "#1b2230";
    }
    mapCtx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    mapCtx.lineWidth = 2;
    mapCtx.arc(canvasPos.x, canvasPos.y, radius, 0, Math.PI * 2);
    mapCtx.fill();
    mapCtx.stroke();

    mapCtx.fillStyle = "#f4f6ff";
    mapCtx.font = "12px system-ui";
    mapCtx.textAlign = "center";
    mapCtx.textBaseline = "middle";
    mapCtx.fillText(roomId, canvasPos.x, canvasPos.y);
  });
}


function renderValidation(snapshot) {
  if (!validationMessages) {
    return;
  }
  const issues = snapshot.validation ?? [];
  if (issues.length === 0) {
    validationMessages.innerHTML = "<em>No validation issues detected.</em>";
    return;
  }
  validationMessages.innerHTML = "";
  issues.forEach((issue) => {
    const entry = document.createElement("div");
    entry.className = "warning";
    const header = document.createElement("strong");
    header.textContent = issue.doorId ? `${issue.roomId} — ${issue.doorId}` : issue.roomId;
    const message = document.createElement("div");
    message.textContent = issue.message;
    entry.appendChild(header);
    entry.appendChild(message);
    validationMessages.appendChild(entry);
  });
}
function buildDoorPropertiesForm(selection) {
  const container = document.createElement("div");
  container.className = "properties-door";

  const idField = createLabeledInput("Door ID", selection.id ?? "", (value) => {
    updateDoor(selection.x, selection.z, selection.level ?? 0, { id: value.trim() });
  });
  container.appendChild(idField.wrapper);

  container.appendChild(createInfoRow("Level", selection.level ?? 0));

  const orientationOptions = [
    { value: "north", label: "North (top wall)" },
    { value: "south", label: "South (bottom wall)" },
    { value: "west", label: "West (left wall)" },
    { value: "east", label: "East (right wall)" },
  ];
  const orientationField = createLabeledSelect("Orientation", selection.orientation ?? "north", orientationOptions, (value) => {
    updateDoor(selection.x, selection.z, selection.level ?? 0, { orientation: value });
    currentDoorOrientation = value;
    doorOrientationSelect.value = value;
  });
  container.appendChild(orientationField.wrapper);

  if (selection.orientation) {
    doorOrientationSelect.value = selection.orientation;
    currentDoorOrientation = selection.orientation;
  }

  const spawnIdField = createLabeledInput("Spawn ID", selection.spawnId ?? "", (value) => {
    updateDoor(selection.x, selection.z, selection.level ?? 0, { spawnId: value.trim() });
  });
  container.appendChild(spawnIdField.wrapper);

  const roomOptions = buildRoomOptions();
  let targetDoorSelect = null;
  let targetSpawnFieldInput = null;
  const targetRoomField = createLabeledSelect("Target Room", selection.targetRoom ?? "", roomOptions, (value) => {
    updateDoor(selection.x, selection.z, selection.level ?? 0, { targetRoom: value, targetDoor: "", targetSpawnId: "" });
    updateDoorOptionsForRoom(targetDoorSelect, value, "");
    if (targetSpawnFieldInput) {
      targetSpawnFieldInput.value = "";
    }
  });
  container.appendChild(targetRoomField.wrapper);

  const targetDoorOptions = buildDoorOptions(selection.targetRoom ?? "");
  const targetDoorField = createLabeledSelect("Target Door", selection.targetDoor ?? "", targetDoorOptions, (value) => {
    const spawnId = getDoorSpawnId(targetRoomField.select.value, value);
    updateDoor(selection.x, selection.z, selection.level ?? 0, { targetDoor: value, targetSpawnId: spawnId });
    if (targetSpawnFieldInput) {
      targetSpawnFieldInput.value = spawnId ?? "";
    }
  });
  targetDoorSelect = targetDoorField.select;
  updateDoorOptionsForRoom(targetDoorSelect, selection.targetRoom ?? "", selection.targetDoor ?? "");
  container.appendChild(targetDoorField.wrapper);

  const targetSpawnField = createLabeledInput("Target Spawn ID", selection.targetSpawnId ?? "", (value) => {
    updateDoor(selection.x, selection.z, selection.level ?? 0, { targetSpawnId: value.trim() });
  });
  targetSpawnFieldInput = targetSpawnField.input;
  if (!selection.targetSpawnId && selection.targetRoom && selection.targetDoor) {
    const inferredSpawn = getDoorSpawnId(selection.targetRoom, selection.targetDoor);
    if (inferredSpawn) {
      targetSpawnFieldInput.value = inferredSpawn;
    }
  }
  container.appendChild(targetSpawnField.wrapper);

  const actions = document.createElement("div");
  actions.className = "properties-actions";
  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "secondary";
  removeButton.textContent = "Remove Door";
  removeButton.addEventListener("click", () => {
    removeDoor(selection.x, selection.z, selection.level ?? null);
    currentSelection = null;
    updateSelectionDetails(null);
  });
  actions.appendChild(removeButton);
  container.appendChild(actions);

  return container;
}

function buildLightPropertiesForm(selection, variant) {
  const container = document.createElement("div");
  container.className = "properties-light";

  const colorWrapper = document.createElement("div");
  colorWrapper.className = "properties-field";
  const colorLabel = document.createElement("span");
  colorLabel.textContent = "Color";
  const colorInput = document.createElement("input");
  colorInput.type = "color";
  const initialColor = normalizeColorForInput(selection.color ?? variant?.color ?? "#ffffff", "#ffffff");
  colorInput.value = initialColor;
  colorInput.addEventListener("input", (event) => {
    const value = normalizeColorForInput(event.target.value, initialColor);
    previewLightColor(selection, value);
  });
  colorInput.addEventListener("change", (event) => {
    const value = normalizeColorForInput(event.target.value, initialColor);
    updateLight(selection.x, selection.z, selection.level ?? 0, { color: value });
  });
  colorWrapper.append(colorLabel, colorInput);
  container.appendChild(colorWrapper);

  const intensityWrapper = document.createElement("div");
  intensityWrapper.className = "properties-field";
  const intensityLabel = document.createElement("span");
  intensityLabel.textContent = "Intensity";
  const intensityRow = document.createElement("div");
  intensityRow.className = "slider-row";
  const intensitySlider = document.createElement("input");
  intensitySlider.type = "range";
  intensitySlider.min = "0";
  intensitySlider.max = "4";
  intensitySlider.step = "0.05";
  const initialIntensity = clampAmbientIntensityValue(
    selection.intensity ?? variant?.intensity ?? 1,
    variant?.intensity ?? 1,
  );
  intensitySlider.value = initialIntensity.toString();
  const intensityValueLabel = document.createElement("span");
  intensityValueLabel.className = "slider-value";
  intensityValueLabel.textContent = initialIntensity.toFixed(2);
  intensitySlider.addEventListener("input", () => {
    const value = clampAmbientIntensityValue(intensitySlider.value, initialIntensity);
    intensitySlider.value = value.toString();
    intensityValueLabel.textContent = value.toFixed(2);
    previewLightIntensity(selection, value);
  });
  intensitySlider.addEventListener("change", () => {
    const value = clampAmbientIntensityValue(intensitySlider.value, initialIntensity);
    updateLight(selection.x, selection.z, selection.level ?? 0, { intensity: value });
  });
  intensityRow.append(intensitySlider, intensityValueLabel);
  intensityWrapper.append(intensityLabel, intensityRow);
  container.appendChild(intensityWrapper);

  const heightWrapper = document.createElement("div");
  heightWrapper.className = "properties-field";
  const heightLabel = document.createElement("span");
  heightLabel.textContent = "Height";
  const heightRow = document.createElement("div");
  heightRow.className = "slider-row";
  const heightSlider = document.createElement("input");
  heightSlider.type = "range";
  heightSlider.min = "0";
  heightSlider.max = "6";
  heightSlider.step = "0.1";
  const initialHeight = Number.isFinite(selection.height) ? selection.height : variant?.height ?? 2;
  heightSlider.value = initialHeight.toString();
  const heightValueLabel = document.createElement("span");
  heightValueLabel.className = "slider-value";
  heightValueLabel.textContent = Number(initialHeight).toFixed(2);
  heightSlider.addEventListener("input", () => {
    const value = Number(heightSlider.value);
    heightValueLabel.textContent = value.toFixed(2);
    previewLightHeight(selection, value);
  });
  heightSlider.addEventListener("change", () => {
    const value = Number(heightSlider.value);
    const level = selection.level ?? 0;
    updateLight(selection.x, selection.z, level, { height: value, level });
  });
  heightRow.append(heightSlider, heightValueLabel);
  heightWrapper.append(heightLabel, heightRow);
  container.appendChild(heightWrapper);

  return container;
}

function createDoorPreviewMeshes(definition) {
  const meshes = [];
  const center = new Vector3(definition.position[0], definition.position[1], definition.position[2]);
  const orientation = definition.orientation ?? "north";
  const isNorthSouth = orientation === "north" || orientation === "south";
  const openingWidth = definition.openingWidth ?? 1;
  const postWidth = definition.postWidth ?? 0.5;
  const lintelHeight = definition.lintelHeight ?? 0.5;
  const frameHeight = definition.size[1];
  const depth = definition.depth ?? (isNorthSouth ? definition.size[2] : definition.size[0]);

  const bottom = center.y - frameHeight / 2;
  const openingHeight = Math.max(0, frameHeight - lintelHeight);
  const postCenterY = bottom + openingHeight / 2;
  const lintelCenterY = bottom + openingHeight + lintelHeight / 2;
  const parallelOffset = openingWidth / 2 + postWidth / 2;

  const postTiles = definition.tiles ?? { default: "door" };

  if (postWidth > 0 && openingHeight > 0) {
    const postGeometry = getCachedBoxGeometry(
      isNorthSouth ? postWidth : depth,
      openingHeight,
      isNorthSouth ? depth : postWidth,
      postTiles,
    );
    const leftPost = new Mesh(postGeometry, null);
    const rightPost = new Mesh(postGeometry, null);

    if (isNorthSouth) {
      leftPost.position.set(center.x - parallelOffset, postCenterY, center.z);
      rightPost.position.set(center.x + parallelOffset, postCenterY, center.z);
    } else {
      leftPost.position.set(center.x, postCenterY, center.z - parallelOffset);
      rightPost.position.set(center.x, postCenterY, center.z + parallelOffset);
    }

    meshes.push(leftPost, rightPost);
  }

  if (lintelHeight > 0) {
    const lintelWidth = openingWidth + postWidth * 2;
    const lintelGeometry = getCachedBoxGeometry(
      isNorthSouth ? lintelWidth : depth,
      lintelHeight,
      isNorthSouth ? depth : lintelWidth,
      postTiles,
    );
    const lintel = new Mesh(lintelGeometry, null);
    lintel.position.copy(center);
    lintel.position.y = lintelCenterY;
    meshes.push(lintel);
  }

  const plugThickness = Math.max(0.04, Math.min(0.12, depth * 0.2));
  if (openingHeight > 0 && openingWidth > 0) {
    const plugGeometry = getCachedBoxGeometry(
      isNorthSouth ? openingWidth : plugThickness,
      openingHeight,
      isNorthSouth ? plugThickness : openingWidth,
      null,
    );
    const plug = new Mesh(plugGeometry, doorPlugMaterial);
    const inward = getDoorInwardNormal(orientation);
    const plugOffset = depth / 2 - plugThickness / 2;
    plug.position.copy(center);
    plug.position.y = bottom + openingHeight / 2;
    plug.position.x += inward.x * plugOffset;
    plug.position.z += inward.z * plugOffset;
    meshes.push(plug);
  }

  return meshes;
}

function formatTiles(tiles) {
  if (!tiles) {
    return "—";
  }
  const entries = Object.entries(tiles).map(([face, tile]) => `${face}: ${typeof tile === "string" ? tile : `(${tile.col},${tile.row})`}`);
  return entries.join(", ");
}
