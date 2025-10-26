import {
  AmbientLight,
  Color,
  DirectionalLight,
  Group,
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
} from "three";
import {
  eraseAt,
  getSnapshot,
  placeBlock,
  updateBlock,
  placeCrate,
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
import { computeDoorDefinition } from "../data/doorRuntime.js";
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
scene.add(ambient);
const keyLight = new DirectionalLight(0xffffff, 0.8);
keyLight.position.set(6, 10, 6);
scene.add(keyLight);
const fillLight = new DirectionalLight(0x8fb8ff, 0.35);
fillLight.position.set(-6, 8, -4);
scene.add(fillLight);

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

const highlightMaterial = new MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.25,
  depthWrite: false,
});
const highlightMesh = new Mesh(getCachedBoxGeometry(1, 0.02, 1, { default: "floor" }), highlightMaterial);
highlightMesh.visible = false;
scene.add(highlightMesh);

const tileSelectionMesh = new Mesh(getCachedBoxGeometry(1, 0.02, 1, { default: "floor" }));
const lightIndicatorGeometry = new SphereGeometry(0.12, 16, 16);

const PLAYER_HEIGHT = 1.6;
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

let currentSnapshot = getSnapshot();
let currentTool = toolSelect.value;
let currentBlockPresetId = DEFAULT_BLOCK_PRESET_ID;
let currentDoorOrientation = doorOrientationSelect.value || "north";
let currentBlockVariant = BLOCK_VARIANTS[1];
let currentObjectVariant = null;
let currentLightVariant = LIGHT_VARIANTS[0];
let objectVariants = [];
const objectVariantMap = new Map();
let objectLibraryLoading = false;
let objectLibraryError = null;
doorOrientationSelect.value = currentDoorOrientation;
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
        Array.from(toolVariantContainer.querySelectorAll("button")).forEach((btn) => {
          btn.classList.toggle("selected", btn === button);
        });
        const selectedBlock =
          currentSelection && currentSelection.type === "block" ? currentSelection : null;
        if (selectedBlock) {
          updateBlock(selectedBlock.x, selectedBlock.z, { height: variant.height ?? 1 });
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
          updateObject(selectedObject.x, selectedObject.z, {
            presetId: variant.id,
            height: variant.baseOffset ?? (variant.size?.[1] ?? 1) / 2,
            state: variant.defaultState ?? selectedObject.state ?? null,
          });
        }
    });
      wrapper.appendChild(button);
    });
    toolVariantContainer.appendChild(wrapper);
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
          updateLight(selectedLight.x, selectedLight.z, {
            presetId: variant.id,
            color: variant.color,
            intensity: variant.intensity,
            height: variant.height,
          });
        }
      });
      wrapper.appendChild(button);
    });
    toolVariantContainer.appendChild(wrapper);
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
    const geometry = getCachedBoxGeometry(1, block.height ?? 1, 1, uvMap);
    const mesh = new Mesh(geometry, getMaterial("default"));
    mesh.position.set(block.x - xOffset, (block.height ?? 1) / 2, block.z - zOffset);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { type: "block", payload: block };
    blockGroup.add(mesh);
    highlights.set(`${block.x},${block.z}`, mesh);
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
    highlights.set(`${door.x},${door.z}`, doorNode);
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
    const geometry = getCachedBoxGeometry(0.9, 0.9, 0.9, uvMap);
    const mesh = new Mesh(geometry, material);
    mesh.position.set(crate.x - xOffset, 0.45, crate.z - zOffset);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { type: "crate", payload: crate };
    crateGroup.add(mesh);
    highlights.set(`${crate.x},${crate.z}`, mesh);
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
    const verticalOffset = object.height ?? variant?.baseOffset ?? (variant?.size?.[1] ?? 1) / 2;
    mesh.position.set(object.x - xOffset, verticalOffset, object.z - zOffset);
    mesh.rotation.y = object.rotation ?? 0;
    mesh.userData = { type: "object", payload: { ...object } };
    if (variant) {
      mesh.userData.variant = variant;
    }
    objectGroup.add(mesh);
    highlights.set(`${object.x},${object.z}`, mesh);
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
    const height = light.height ?? variant?.height ?? 2;

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
    highlights.set(`${light.x},${light.z}`, group);
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
  const block = snapshot.blocks.find((entry) => entry.x === x && entry.z === z);
  if (block) {
    return { type: "block", ...block };
  }
  const door = snapshot.doors?.find((entry) => entry.x === x && entry.z === z);
  if (door) {
    return { type: "door", ...door };
  }
  const crate = snapshot.crates.find((entry) => entry.x === x && entry.z === z);
  if (crate) {
    return { type: "crate", ...crate };
  }
  const objectEntry = snapshot.objects?.find((entry) => entry.x === x && entry.z === z);
  if (objectEntry) {
    return { type: "object", ...objectEntry };
  }
  const lightEntry = snapshot.lights?.find((entry) => entry.x === x && entry.z === z);
  if (lightEntry) {
    return { type: "light", ...lightEntry };
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
    if (selection.tiles) {
      container.appendChild(createInfoRow("Tiles", formatTiles(selection.tiles)));
    }
  } else if (selection.type === "crate") {
    container.appendChild(createInfoRow("Preset", selection.presetId ?? "—"));
  } else if (selection.type === "object") {
    const variant = objectVariantMap.get(selection.presetId) || objectVariants.find((entry) => entry.id === selection.presetId) || null;
    container.appendChild(createInfoRow("Object", variant?.label ?? selection.presetId ?? "—"));
    if (variant?.description) {
      container.appendChild(createInfoRow("Info", variant.description));
    }
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
    container.appendChild(createInfoRow("Color", (selection.color ?? variant?.color ?? "#ffffff").toUpperCase()));
    container.appendChild(
      createInfoRow(
        "Intensity",
        (selection.intensity ?? variant?.intensity ?? 1).toLocaleString(undefined, { maximumFractionDigits: 2 }),
      ),
    );
    container.appendChild(
      createInfoRow(
        "Height",
        (selection.height ?? variant?.height ?? 2).toLocaleString(undefined, { maximumFractionDigits: 2 }),
      ),
    );
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

  const key = `${currentSelection.x},${currentSelection.z}`;

  switch (currentSelection.type) {
    case "block":
    case "crate":
    case "door": {
      const map = selectionHighlightMap.get(currentSelection.type);
      const mesh = map?.get(key);
      if (mesh) {
        selectionOverlay.updateSelection(mesh);
      }
      break;
    }
    case "object":
    case "light": {
      const map = selectionHighlightMap.get(currentSelection.type);
      const mesh = map?.get(key);
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
  if (selection.type === "object") {
    ensureObjectVariantsLoaded();
    if (selectMode) {
      currentTool = "object";
      toolSelect.value = "object";
    }
    const variant = objectVariantMap.get(selection.presetId) || objectVariants.find((entry) => entry.id === selection.presetId) || currentObjectVariant;
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
  placeBlock(x, z, height, {
    material: preset.id,
    tiles: tileIds,
    presetId: preset.id,
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
  placeCrate(x, z, {
    presetId: preset.id,
    tiles: tileIds,
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
  placeObject(x, z, {
    presetId: variant.id,
    height: variant.baseOffset ?? (variant.size?.[1] ?? 1) / 2,
    rotation: 0,
    state: variant.defaultState ?? null,
  });
}

function placeLightWithPreset(x, z) {
  if (!currentLightVariant) {
    currentLightVariant = LIGHT_VARIANTS[0];
  }
  const variant = currentLightVariant;
  placeLight(x, z, {
    presetId: variant.id,
    color: variant.color,
    intensity: variant.intensity,
    height: variant.height,
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
  placeDoor(x, z, {
    orientation: currentDoorOrientation,
    spawnId: `door-${x}-${z}-${currentDoorOrientation}-spawn`,
  });
}

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}

function clamp(min, max, value) {
  return Math.min(max, Math.max(min, value));
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
    updateDoor(selection.x, selection.z, { id: value.trim() });
  });
  container.appendChild(idField.wrapper);

  const orientationOptions = [
    { value: "north", label: "North (top wall)" },
    { value: "south", label: "South (bottom wall)" },
    { value: "west", label: "West (left wall)" },
    { value: "east", label: "East (right wall)" },
  ];
  const orientationField = createLabeledSelect("Orientation", selection.orientation ?? "north", orientationOptions, (value) => {
    updateDoor(selection.x, selection.z, { orientation: value });
    currentDoorOrientation = value;
    doorOrientationSelect.value = value;
  });
  container.appendChild(orientationField.wrapper);

  if (selection.orientation) {
    doorOrientationSelect.value = selection.orientation;
    currentDoorOrientation = selection.orientation;
  }

  const spawnIdField = createLabeledInput("Spawn ID", selection.spawnId ?? "", (value) => {
    updateDoor(selection.x, selection.z, { spawnId: value.trim() });
  });
  container.appendChild(spawnIdField.wrapper);

  const roomOptions = buildRoomOptions();
  let targetDoorSelect = null;
  let targetSpawnFieldInput = null;
  const targetRoomField = createLabeledSelect("Target Room", selection.targetRoom ?? "", roomOptions, (value) => {
    updateDoor(selection.x, selection.z, { targetRoom: value, targetDoor: "", targetSpawnId: "" });
    updateDoorOptionsForRoom(targetDoorSelect, value, "");
    if (targetSpawnFieldInput) {
      targetSpawnFieldInput.value = "";
    }
  });
  container.appendChild(targetRoomField.wrapper);

  const targetDoorOptions = buildDoorOptions(selection.targetRoom ?? "");
  const targetDoorField = createLabeledSelect("Target Door", selection.targetDoor ?? "", targetDoorOptions, (value) => {
    const spawnId = getDoorSpawnId(targetRoomField.select.value, value);
    updateDoor(selection.x, selection.z, { targetDoor: value, targetSpawnId: spawnId });
    if (targetSpawnFieldInput) {
      targetSpawnFieldInput.value = spawnId ?? "";
    }
  });
  targetDoorSelect = targetDoorField.select;
  updateDoorOptionsForRoom(targetDoorSelect, selection.targetRoom ?? "", selection.targetDoor ?? "");
  container.appendChild(targetDoorField.wrapper);

  const targetSpawnField = createLabeledInput("Target Spawn ID", selection.targetSpawnId ?? "", (value) => {
    updateDoor(selection.x, selection.z, { targetSpawnId: value.trim() });
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
    removeDoor(selection.x, selection.z);
    currentSelection = null;
    updateSelectionDetails(null);
  });
  actions.appendChild(removeButton);
  container.appendChild(actions);

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
