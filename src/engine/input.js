const KEY_MAP = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  KeyW: "up",
  KeyS: "down",
  KeyA: "left",
  KeyD: "right",
  Space: "jump",
  KeyE: "interact",
};

export function createInputManager(target = window) {
  const state = new Map();
  const listeners = new Map();

  const handleKey = (event, pressed) => {
    const action = KEY_MAP[event.code];
    if (!action) {
      return;
    }

    if (pressed) {
      event.preventDefault();
    }

    if (state.get(action) === pressed) {
      return;
    }

    state.set(action, pressed);
    listeners.get(action)?.forEach((callback) => callback(pressed));
  };

  const onKeyDown = (e) => handleKey(e, true);
  const onKeyUp = (e) => handleKey(e, false);

  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);

  return {
    isPressed(action) {
      return Boolean(state.get(action));
    },
    on(action, callback) {
      if (!listeners.has(action)) {
        listeners.set(action, []);
      }
      listeners.get(action).push(callback);
      return () => {
        const items = listeners.get(action);
        if (!items) {
          return;
        }
        const index = items.indexOf(callback);
        if (index >= 0) {
          items.splice(index, 1);
        }
      };
    },
    dispose() {
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
      listeners.clear();
      state.clear();
    },
  };
}
