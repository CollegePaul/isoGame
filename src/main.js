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
document.body.appendChild(hud.element);

const initialRoom = getDefaultRoomId() ?? "boot-room";
const game = new Game({
  scene,
  input,
  initialRoom,
  onInventoryChange: hud.updateInventory,
  onMessage: hud.showMessage,
});
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
    hud.element.remove();
    renderer.dispose();
  });
}

function createHudOverlay() {
  const element = document.createElement("div");
  element.className = "hud";

  const statusRow = document.createElement("div");
  statusRow.className = "hud-row";

  const score = document.createElement("span");
  score.className = "hud-score";
  score.textContent = "Score: 000";

  const dividerA = document.createElement("span");
  dividerA.className = "hud-divider";
  dividerA.textContent = " • ";

  const inventory = document.createElement("span");
  inventory.className = "hud-inventory";

  const dividerB = document.createElement("span");
  dividerB.className = "hud-divider";
  dividerB.textContent = " • ";

  const controls = document.createElement("span");
  controls.className = "hud-controls";
  controls.textContent = "Controls: WASD/Arrows + Space (Jump) + E (Interact)";

  statusRow.append(score, dividerA, inventory, dividerB, controls);

  const message = document.createElement("div");
  message.className = "hud-message";

  element.append(statusRow, message);

  const updateInventory = (items) => {
    if (!items || items.length === 0) {
      inventory.textContent = "Inventory: —";
      return;
    }
    const labels = items.map((item) => item.label ?? item.id ?? "Item");
    inventory.textContent = `Inventory: ${labels.join(", ")}`;
  };

  updateInventory([]);

  let messageTimer = null;
  const showMessage = (text, duration = 2500) => {
    if (messageTimer) {
      clearTimeout(messageTimer);
      messageTimer = null;
    }
    message.textContent = text ?? "";
    if (text && text.trim()) {
      message.classList.add("visible");
      if (duration > 0) {
        messageTimer = window.setTimeout(() => {
          message.classList.remove("visible");
          message.textContent = "";
          messageTimer = null;
        }, duration);
      }
    } else {
      message.classList.remove("visible");
    }
  };

  return { element, updateInventory, showMessage };
}
