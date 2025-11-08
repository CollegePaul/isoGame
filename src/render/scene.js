import {
  AmbientLight,
  Color,
  DirectionalLight,
  Scene,
  WebGLRenderer,
} from "three";
import { createIsometricCamera, updateCameraAspect } from "./cameraRig.js";

export function initRenderer(container) {
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.xr.enabled = true;
  container.appendChild(renderer.domElement);
  return renderer;
}

export function initSceneGraph() {
  const scene = new Scene();
  scene.background = new Color("#1a202c");

  const ambient = new AmbientLight(0xffffff, 0.6);
  ambient.name = "global-ambient";
  scene.add(ambient);

  const keyLight = new DirectionalLight(0xffffff, 0.7);
  keyLight.name = "global-key-light";
  keyLight.position.set(5, 10, 7);
  scene.add(keyLight);

  return scene;
}

export function initCamera(container) {
  const aspect = container.clientWidth / container.clientHeight;
  return createIsometricCamera({ aspect });
}

export function handleResize(renderer, camera, container) {
  const onResize = () => {
    const { clientWidth, clientHeight } = container;
    renderer.setSize(clientWidth, clientHeight);
    updateCameraAspect(camera, clientWidth / clientHeight);
  };

  window.addEventListener("resize", onResize);

  return () => window.removeEventListener("resize", onResize);
}
