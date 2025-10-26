import { createGameLoop } from "./engine/gameLoop.js";
import { createInputManager } from "./engine/input.js";
import { Game } from "./game/game.js";
import { getDefaultRoomId } from "./game/world/rooms/index.js";
import { initCamera, initRenderer, initSceneGraph, handleResize } from "./render/scene.js";
import { logger } from "./utils/logger.js";

const container = document.getElementById("app");
if (!container) {
  throw new Error("Missing #app container");
}

const renderer = initRenderer(container);
const scene = initSceneGraph();
const camera = initCamera(container);

const disposeResize = handleResize(renderer, camera, container);
const input = createInputManager(window);

const hud = createHudOverlay();
document.body.appendChild(hud);

const initialRoom = getDefaultRoomId() ?? "boot-room";
const game = new Game({ scene, input, initialRoom });
logger.info(`Loaded initial room: ${initialRoom}`);

const loop = createGameLoop();

loop.start(
  (delta) => {
    game.update(delta);
  },
  () => {
    renderer.render(scene, camera);
  },
);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    loop.stop();
    input.dispose();
    disposeResize();
    hud.remove();
    renderer.dispose();
  });
}

function createHudOverlay() {
  const element = document.createElement("div");
  element.className = "hud";
  element.innerText = "Score: 000  •  Inventory: —  •  Controls: WASD/Arrows + Space";
  return element;
}
