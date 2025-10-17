import { PerspectiveCamera, Vector3 } from "three";

const DEFAULT_FOV = 40;
const DEFAULT_NEAR = 0.1;
const DEFAULT_FAR = 1000;

export function createIsometricCamera({ aspect, distance = 18, tilt = Math.PI / 5, pan = Math.PI / 4 } = {}) {
  const camera = new PerspectiveCamera(DEFAULT_FOV, aspect, DEFAULT_NEAR, DEFAULT_FAR);
  camera.position.copy(calculateCameraPosition(distance, tilt, pan));
  camera.lookAt(new Vector3(0, 0, 0));
  camera.up.set(0, 1, 0);
  return camera;
}

export function calculateCameraPosition(distance, tilt, pan) {
  const y = Math.sin(tilt) * distance;
  const horizontal = Math.cos(tilt) * distance;
  const x = Math.cos(pan) * horizontal;
  const z = Math.sin(pan) * horizontal;
  return new Vector3(x, y, z);
}

export function updateCameraAspect(camera, aspect) {
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
}
