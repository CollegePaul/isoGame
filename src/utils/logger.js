const levels = ["error", "warn", "info", "debug"];

const defaultLevel = (() => {
  const value = (typeof window !== "undefined" && window.localStorage?.getItem("logLevel")) ?? "info";
  return levels.includes(value) ? value : "info";
})();

const shouldLog = (level) => levels.indexOf(level) <= levels.indexOf(defaultLevel);

const format = (level, messages) => [`[${new Date().toISOString()}][${level.toUpperCase()}]`, ...messages];

export const logger = {
  error: (...messages) => shouldLog("error") && console.error(...format("error", messages)),
  warn: (...messages) => shouldLog("warn") && console.warn(...format("warn", messages)),
  info: (...messages) => shouldLog("info") && console.info(...format("info", messages)),
  debug: (...messages) => shouldLog("debug") && console.debug(...format("debug", messages)),
};

export const setLogLevel = (level) => {
  if (!levels.includes(level)) {
    logger.warn(`Attempted to set invalid log level "${level}".`);
    return;
  }

  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.setItem("logLevel", level);
  }
};
