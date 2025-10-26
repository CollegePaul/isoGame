import { Box3, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { getModelDefinition } from "../data/models.js";

const MODEL_URL = "/assets/models/objects.glb";

const loader = new GLTFLoader();

let loadPromise = null;
let variants = [];
const variantMap = new Map();

function normaliseLabel(name, index) {
  if (!name) {
    return `Object ${index + 1}`;
  }
  const withSpaces = name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  const capitalised = withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
  return capitalised.trim();
}

function prepareVariants(scene) {
  variants = [];
  variantMap.clear();
  const children = scene.children.filter((child) => child.visible !== false);
  children.forEach((child, index) => {
    const template = child.clone(true);
    template.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
    const box = new Box3().setFromObject(template);
    if (box.isEmpty()) {
      return;
    }
    const sizeVec = new Vector3();
    box.getSize(sizeVec);
    const center = new Vector3();
    box.getCenter(center);
    const minY = box.min.y;
    const height = sizeVec.y || 1;
    const baseOffset = height / 2;
    const id = child.name || `object-${index}`;

    const definition = getModelDefinition(id);
    const label = definition?.label ?? normaliseLabel(child.name, index);
    const description = definition?.description ?? "";
    const tags = definition?.tags ?? [];
    const collectable = definition?.collectable ?? false;
    const solid = definition?.solid ?? true;
    const requirements = definition?.requirements ?? [];
    const transformsTo = definition?.transformsTo ?? null;
    const defaultState = definition?.defaultState ?? "default";
    const interactions = definition?.interactions ?? null;

    const size = definition?.size ?? [Math.max(sizeVec.x, 0.1), Math.max(sizeVec.y, 0.1), Math.max(sizeVec.z, 0.1)];
    const resolvedBaseOffset = definition?.size ? (definition.size[1] ?? height) / 2 : baseOffset;

    const variant = {
      id,
      label,
      description,
      tags,
      collectable,
      solid,
      requirements,
      transformsTo,
      defaultState,
      interactions,
      size,
      baseOffset: resolvedBaseOffset,
      height: size[1] ?? height,
      template,
      createInstance: () => clone(template),
    };
    variants.push(variant);
    variantMap.set(id, variant);
  });
  if (variants.length === 0) {
    const box = new Box3();
    const placeholder = {
      id: "default",
      label: "Default",
      baseOffset: 0.5,
      height: 1,
      template: scene.clone(true),
      createInstance: () => scene.clone(true),
    };
    variants.push(placeholder);
    variantMap.set("default", placeholder);
  }
}

export function loadObjectLibrary() {
  if (!loadPromise) {
    loadPromise = new Promise((resolve, reject) => {
      loader.load(
        MODEL_URL,
        (gltf) => {
          try {
            prepareVariants(gltf.scene);
            resolve({ variants });
          } catch (error) {
            reject(error);
          }
        },
        undefined,
        (error) => {
          reject(error);
        },
      );
    }).catch((error) => {
      console.error("Failed to load object library", error);
      variants = [];
      variantMap.clear();
      throw error;
    });
  }
  return loadPromise;
}

export async function getObjectVariants() {
  await loadObjectLibrary().catch(() => {});
  return variants;
}

export function getObjectVariantById(id) {
  return variantMap.get(id) || null;
}

export async function cloneObjectVariant(id) {
  await loadObjectLibrary().catch(() => {});
  const variant = getObjectVariantById(id) || variants[0];
  return variant ? variant.createInstance() : null;
}

export function getObjectBaseOffset(id) {
  const variant = getObjectVariantById(id) || variants[0];
  return variant ? variant.baseOffset : 0;
}
