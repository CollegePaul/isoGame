import {
  BoxGeometry,
  MathUtils,
  TextureLoader,
  NearestFilter,
  NearestMipmapNearestFilter,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";

import atlasUrl from "../../assets/textures/atlas.png";

const TILE_SIZE = 32;
const DEFAULT_COLUMNS = 64;
const DEFAULT_ROWS = 64;

export const TILE_IDS = {
  floor: { col: 0, row: 0 },
  wall: { col: 0, row: 1 },
  blockTop: { col: 0, row: 2 },
  blockSide: { col: 0, row: 3 },
  crate: { col: 0, row: 4 },
};

const FACE_INDEX = {
  right: 0,
  left: 1,
  top: 2,
  bottom: 3,
  front: 4,
  back: 5,
};

let atlasTexture;
const atlasInfo = {
  width: TILE_SIZE * DEFAULT_COLUMNS,
  height: TILE_SIZE * DEFAULT_ROWS,
};

export function getAtlasTexture() {
  if (!atlasTexture) {
    const loader = new TextureLoader();
    atlasTexture = loader.load(
      atlasUrl,
      (texture) => {
        finalizeTexture(texture);
      },
      undefined,
      (error) => {
        console.error("Failed to load atlas texture", error);
      },
    );
    finalizeTexture(atlasTexture);
  }
  return atlasTexture;
}

function finalizeTexture(texture) {
  if (!texture) {
    return;
  }
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestMipmapNearestFilter;
  texture.colorSpace = SRGBColorSpace;

  const image = texture.image;
  if (image && image.width && image.height) {
    atlasInfo.width = image.width;
    atlasInfo.height = image.height;
  }
}

export function createBoxGeometryWithUVs(width, height, depth, tiles) {
  const geometry = new BoxGeometry(width, height, depth);
  applyBoxUVs(geometry, tiles);
  return geometry;
}

export function applyBoxUVs(geometry, tiles) {
  const uv = geometry.getAttribute("uv");
  if (!uv) {
    return geometry;
  }

  const tileForFace = (face) =>
    tiles?.[face] ??
    tiles?.sides ??
    tiles?.default ??
    tiles?.all ??
    tiles?.top ??
    null;

  Object.entries(FACE_INDEX).forEach(([face, index]) => {
    const tileId = tileForFace(face);
    if (!tileId) {
      return;
    }
    const rect = resolveTileRect(tileId);
    remapFaceUV(uv, index, rect);
  });

  uv.needsUpdate = true;
  return geometry;
}

function resolveTileRect(tileId) {
  let descriptor = tileId;
  if (typeof descriptor === "string") {
    descriptor = TILE_IDS[descriptor];
  }
  if (!descriptor) {
    throw new Error(`Unknown atlas tile "${tileId}"`);
  }

  const width = atlasInfo.width || TILE_SIZE * DEFAULT_COLUMNS;
  const height = atlasInfo.height || TILE_SIZE * DEFAULT_ROWS;
  const tileWidth = TILE_SIZE / width;
  const tileHeight = TILE_SIZE / height;

  const uMin = descriptor.col * tileWidth;
  const uMax = uMin + tileWidth;
  const vMax = 1 - descriptor.row * tileHeight;
  const vMin = vMax - tileHeight;

  return {
    uMin,
    uMax,
    vMin,
    vMax,
    tileWidth,
    tileHeight,
    col: descriptor.col,
    row: descriptor.row,
    pixelX: descriptor.col * TILE_SIZE,
    pixelY: descriptor.row * TILE_SIZE,
    pixelWidth: TILE_SIZE,
    pixelHeight: TILE_SIZE,
  };
}

function remapFaceUV(uvAttribute, faceIndex, rect) {
  const { uMin, uMax, vMin, vMax } = rect;
  const faceVertexCount = 4;
  const start = faceIndex * faceVertexCount;

  for (let i = 0; i < faceVertexCount; i += 1) {
    const idx = start + i;
    const u = uvAttribute.getX(idx);
    const v = uvAttribute.getY(idx);
    const mappedU = MathUtils.lerp(uMin, uMax, u);
    const mappedV = MathUtils.lerp(vMin, vMax, v);
    uvAttribute.setXY(idx, mappedU, mappedV);
  }
}

export function getTileRect(tileId) {
  return resolveTileRect(tileId);
}

export function getAtlasDimensions() {
  return {
    width: atlasInfo.width,
    height: atlasInfo.height,
  };
}
