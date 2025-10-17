const FRAME_STEP = 1 / 60;
const MAX_FRAME = FRAME_STEP * 5;

export function createGameLoop() {
  let animationHandle = 0;
  let accumulator = 0;
  let lastTime = 0;
  let running = false;
  let tick = () => {};
  let frame = () => {};

  const loop = (time) => {
    if (!running) {
      return;
    }

    const delta = (time - lastTime) / 1000;
    lastTime = time;

    accumulator += Math.min(delta, MAX_FRAME);

    while (accumulator >= FRAME_STEP) {
      tick(FRAME_STEP);
      accumulator -= FRAME_STEP;
    }

    frame(accumulator / FRAME_STEP);
    animationHandle = requestAnimationFrame(loop);
  };

  return {
    start(onTick, onFrame = () => {}) {
      if (running) {
        return;
      }

      tick = onTick;
      frame = onFrame;
      running = true;
      accumulator = 0;
      lastTime = performance.now();
      animationHandle = requestAnimationFrame(loop);
    },
    stop() {
      if (!running) {
        return;
      }
      running = false;
      cancelAnimationFrame(animationHandle);
      animationHandle = 0;
    },
    isRunning() {
      return running;
    },
  };
}
