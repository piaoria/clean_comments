(function exposeLogger(global) {
  // Shared structured logger for clean_comments.
  //
  // Levels: debug < info < warn < error. info/warn/error are always printed.
  // debug is gated behind verbose mode so day-to-day consoles stay readable.
  //
  // To enable verbose debug logs from a YouTube tab console, run:
  //     localStorage.setItem("cleanCommentsVerbose", "1");
  // and reload. Disable with localStorage.removeItem("cleanCommentsVerbose").
  const PREFIX = "[clean_comments]";
  const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
  const STYLES = {
    debug: "color:#9aa0a6",
    info: "color:#1a73e8;font-weight:600",
    warn: "color:#e37400;font-weight:600",
    error: "color:#d93025;font-weight:600"
  };

  function isVerbose() {
    try {
      if (global.__cleanCommentsVerbose === true) {
        return true;
      }
      return global.localStorage?.getItem("cleanCommentsVerbose") === "1";
    } catch (error) {
      return false;
    }
  }

  function timestamp() {
    return new Date().toISOString().slice(11, 23);
  }

  function emit(level, scope, message, detail) {
    if (LEVELS[level] === LEVELS.debug && !isVerbose()) {
      return;
    }

    const consoleMethod = global.console?.[level] || global.console?.log;
    if (!consoleMethod) {
      return;
    }

    const head = `%c${PREFIX} %c${timestamp()} ${level.toUpperCase()} ${scope ? `[${scope}] ` : ""}${message}`;
    const args = [head, STYLES.info, STYLES[level] || ""];
    if (detail !== undefined) {
      args.push(detail);
    }
    consoleMethod.apply(global.console, args);
  }

  function createScopedLogger(scope) {
    return {
      debug: (message, detail) => emit("debug", scope, message, detail),
      info: (message, detail) => emit("info", scope, message, detail),
      warn: (message, detail) => emit("warn", scope, message, detail),
      error: (message, detail) => emit("error", scope, message, detail)
    };
  }

  global.CleanCommentsLog = {
    scope: createScopedLogger,
    isVerbose,
    setVerbose(enabled) {
      try {
        if (enabled) {
          global.localStorage?.setItem("cleanCommentsVerbose", "1");
        } else {
          global.localStorage?.removeItem("cleanCommentsVerbose");
        }
      } catch (error) {
        global.__cleanCommentsVerbose = Boolean(enabled);
      }
    }
  };
})(globalThis);
