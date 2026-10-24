import { createRequire } from 'module'; const require = createRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/ansi-colors/symbols.js
var require_symbols = __commonJS({
  "node_modules/ansi-colors/symbols.js"(exports, module) {
    "use strict";
    var isHyper = typeof process !== "undefined" && process.env.TERM_PROGRAM === "Hyper";
    var isWindows = typeof process !== "undefined" && process.platform === "win32";
    var isLinux = typeof process !== "undefined" && process.platform === "linux";
    var common = {
      ballotDisabled: "\u2612",
      ballotOff: "\u2610",
      ballotOn: "\u2611",
      bullet: "\u2022",
      bulletWhite: "\u25E6",
      fullBlock: "\u2588",
      heart: "\u2764",
      identicalTo: "\u2261",
      line: "\u2500",
      mark: "\u203B",
      middot: "\xB7",
      minus: "\uFF0D",
      multiplication: "\xD7",
      obelus: "\xF7",
      pencilDownRight: "\u270E",
      pencilRight: "\u270F",
      pencilUpRight: "\u2710",
      percent: "%",
      pilcrow2: "\u2761",
      pilcrow: "\xB6",
      plusMinus: "\xB1",
      question: "?",
      section: "\xA7",
      starsOff: "\u2606",
      starsOn: "\u2605",
      upDownArrow: "\u2195"
    };
    var windows = Object.assign({}, common, {
      check: "\u221A",
      cross: "\xD7",
      ellipsisLarge: "...",
      ellipsis: "...",
      info: "i",
      questionSmall: "?",
      pointer: ">",
      pointerSmall: "\xBB",
      radioOff: "( )",
      radioOn: "(*)",
      warning: "\u203C"
    });
    var other = Object.assign({}, common, {
      ballotCross: "\u2718",
      check: "\u2714",
      cross: "\u2716",
      ellipsisLarge: "\u22EF",
      ellipsis: "\u2026",
      info: "\u2139",
      questionFull: "\uFF1F",
      questionSmall: "\uFE56",
      pointer: isLinux ? "\u25B8" : "\u276F",
      pointerSmall: isLinux ? "\u2023" : "\u203A",
      radioOff: "\u25EF",
      radioOn: "\u25C9",
      warning: "\u26A0"
    });
    module.exports = isWindows && !isHyper ? windows : other;
    Reflect.defineProperty(module.exports, "common", { enumerable: false, value: common });
    Reflect.defineProperty(module.exports, "windows", { enumerable: false, value: windows });
    Reflect.defineProperty(module.exports, "other", { enumerable: false, value: other });
  }
});

// node_modules/ansi-colors/index.js
var require_ansi_colors = __commonJS({
  "node_modules/ansi-colors/index.js"(exports, module) {
    "use strict";
    var isObject = (val) => val !== null && typeof val === "object" && !Array.isArray(val);
    var ANSI_REGEX = /[\u001b\u009b][[\]#;?()]*(?:(?:(?:[^\W_]*;?[^\W_]*)\u0007)|(?:(?:[0-9]{1,4}(;[0-9]{0,4})*)?[~0-9=<>cf-nqrtyA-PRZ]))/g;
    var hasColor = () => {
      if (typeof process !== "undefined") {
        return process.env.FORCE_COLOR !== "0";
      }
      return false;
    };
    var create = () => {
      const colors = {
        enabled: hasColor(),
        visible: true,
        styles: {},
        keys: {}
      };
      const ansi = (style2) => {
        let open = style2.open = `\x1B[${style2.codes[0]}m`;
        let close = style2.close = `\x1B[${style2.codes[1]}m`;
        let regex = style2.regex = new RegExp(`\\u001b\\[${style2.codes[1]}m`, "g");
        style2.wrap = (input, newline) => {
          if (input.includes(close)) input = input.replace(regex, close + open);
          let output = open + input + close;
          return newline ? output.replace(/\r*\n/g, `${close}$&${open}`) : output;
        };
        return style2;
      };
      const wrap = (style2, input, newline) => {
        return typeof style2 === "function" ? style2(input) : style2.wrap(input, newline);
      };
      const style = (input, stack) => {
        if (input === "" || input == null) return "";
        if (colors.enabled === false) return input;
        if (colors.visible === false) return "";
        let str = "" + input;
        let nl = str.includes("\n");
        let n = stack.length;
        if (n > 0 && stack.includes("unstyle")) {
          stack = [.../* @__PURE__ */ new Set(["unstyle", ...stack])].reverse();
        }
        while (n-- > 0) str = wrap(colors.styles[stack[n]], str, nl);
        return str;
      };
      const define = (name, codes, type) => {
        colors.styles[name] = ansi({ name, codes });
        let keys = colors.keys[type] || (colors.keys[type] = []);
        keys.push(name);
        Reflect.defineProperty(colors, name, {
          configurable: true,
          enumerable: true,
          set(value) {
            colors.alias(name, value);
          },
          get() {
            let color = (input) => style(input, color.stack);
            Reflect.setPrototypeOf(color, colors);
            color.stack = this.stack ? this.stack.concat(name) : [name];
            return color;
          }
        });
      };
      define("reset", [0, 0], "modifier");
      define("bold", [1, 22], "modifier");
      define("dim", [2, 22], "modifier");
      define("italic", [3, 23], "modifier");
      define("underline", [4, 24], "modifier");
      define("inverse", [7, 27], "modifier");
      define("hidden", [8, 28], "modifier");
      define("strikethrough", [9, 29], "modifier");
      define("black", [30, 39], "color");
      define("red", [31, 39], "color");
      define("green", [32, 39], "color");
      define("yellow", [33, 39], "color");
      define("blue", [34, 39], "color");
      define("magenta", [35, 39], "color");
      define("cyan", [36, 39], "color");
      define("white", [37, 39], "color");
      define("gray", [90, 39], "color");
      define("grey", [90, 39], "color");
      define("bgBlack", [40, 49], "bg");
      define("bgRed", [41, 49], "bg");
      define("bgGreen", [42, 49], "bg");
      define("bgYellow", [43, 49], "bg");
      define("bgBlue", [44, 49], "bg");
      define("bgMagenta", [45, 49], "bg");
      define("bgCyan", [46, 49], "bg");
      define("bgWhite", [47, 49], "bg");
      define("blackBright", [90, 39], "bright");
      define("redBright", [91, 39], "bright");
      define("greenBright", [92, 39], "bright");
      define("yellowBright", [93, 39], "bright");
      define("blueBright", [94, 39], "bright");
      define("magentaBright", [95, 39], "bright");
      define("cyanBright", [96, 39], "bright");
      define("whiteBright", [97, 39], "bright");
      define("bgBlackBright", [100, 49], "bgBright");
      define("bgRedBright", [101, 49], "bgBright");
      define("bgGreenBright", [102, 49], "bgBright");
      define("bgYellowBright", [103, 49], "bgBright");
      define("bgBlueBright", [104, 49], "bgBright");
      define("bgMagentaBright", [105, 49], "bgBright");
      define("bgCyanBright", [106, 49], "bgBright");
      define("bgWhiteBright", [107, 49], "bgBright");
      colors.ansiRegex = ANSI_REGEX;
      colors.hasColor = colors.hasAnsi = (str) => {
        colors.ansiRegex.lastIndex = 0;
        return typeof str === "string" && str !== "" && colors.ansiRegex.test(str);
      };
      colors.alias = (name, color) => {
        let fn = typeof color === "string" ? colors[color] : color;
        if (typeof fn !== "function") {
          throw new TypeError("Expected alias to be the name of an existing color (string) or a function");
        }
        if (!fn.stack) {
          Reflect.defineProperty(fn, "name", { value: name });
          colors.styles[name] = fn;
          fn.stack = [name];
        }
        Reflect.defineProperty(colors, name, {
          configurable: true,
          enumerable: true,
          set(value) {
            colors.alias(name, value);
          },
          get() {
            let color2 = (input) => style(input, color2.stack);
            Reflect.setPrototypeOf(color2, colors);
            color2.stack = this.stack ? this.stack.concat(fn.stack) : fn.stack;
            return color2;
          }
        });
      };
      colors.theme = (custom) => {
        if (!isObject(custom)) throw new TypeError("Expected theme to be an object");
        for (let name of Object.keys(custom)) {
          colors.alias(name, custom[name]);
        }
        return colors;
      };
      colors.alias("unstyle", (str) => {
        if (typeof str === "string" && str !== "") {
          colors.ansiRegex.lastIndex = 0;
          return str.replace(colors.ansiRegex, "");
        }
        return "";
      });
      colors.alias("noop", (str) => str);
      colors.none = colors.clear = colors.noop;
      colors.stripColor = colors.unstyle;
      colors.symbols = require_symbols();
      colors.define = define;
      return colors;
    };
    module.exports = create();
    module.exports.create = create;
  }
});

// node_modules/enquirer/lib/utils.js
var require_utils = __commonJS({
  "node_modules/enquirer/lib/utils.js"(exports) {
    "use strict";
    var toString = Object.prototype.toString;
    var colors = require_ansi_colors();
    var onExitCalled = false;
    var onExitCallbacks = /* @__PURE__ */ new Set();
    var complements = {
      "yellow": "blue",
      "cyan": "red",
      "green": "magenta",
      "black": "white",
      "blue": "yellow",
      "red": "cyan",
      "magenta": "green",
      "white": "black"
    };
    exports.longest = (arr, prop) => {
      return arr.reduce((a, v) => Math.max(a, prop ? v[prop].length : v.length), 0);
    };
    exports.hasColor = (str) => !!str && colors.hasColor(str);
    var isObject = exports.isObject = (val) => {
      return val !== null && typeof val === "object" && !Array.isArray(val);
    };
    exports.nativeType = (val) => {
      return toString.call(val).slice(8, -1).toLowerCase().replace(/\s/g, "");
    };
    exports.isAsyncFn = (val) => {
      return exports.nativeType(val) === "asyncfunction";
    };
    exports.isPrimitive = (val) => {
      return val != null && typeof val !== "object" && typeof val !== "function";
    };
    exports.resolve = (context2, value, ...rest) => {
      if (typeof value === "function") {
        return value.call(context2, ...rest);
      }
      return value;
    };
    exports.scrollDown = (choices = []) => [...choices.slice(1), choices[0]];
    exports.scrollUp = (choices = []) => [choices.pop(), ...choices];
    exports.reorder = (arr = []) => {
      let res = arr.slice();
      res.sort((a, b) => {
        if (a.index > b.index) return 1;
        if (a.index < b.index) return -1;
        return 0;
      });
      return res;
    };
    exports.swap = (arr, index, pos) => {
      let len = arr.length;
      let idx = pos === len ? 0 : pos < 0 ? len - 1 : pos;
      let choice = arr[index];
      arr[index] = arr[idx];
      arr[idx] = choice;
    };
    exports.width = (stream, fallback = 80) => {
      let columns = stream && stream.columns ? stream.columns : fallback;
      if (stream && typeof stream.getWindowSize === "function") {
        columns = stream.getWindowSize()[0];
      }
      if (process.platform === "win32") {
        return columns - 1;
      }
      return columns;
    };
    exports.height = (stream, fallback = 20) => {
      let rows = stream && stream.rows ? stream.rows : fallback;
      if (stream && typeof stream.getWindowSize === "function") {
        rows = stream.getWindowSize()[1];
      }
      return rows;
    };
    exports.wordWrap = (str, options = {}) => {
      if (!str) return str;
      if (typeof options === "number") {
        options = { width: options };
      }
      let { indent = "", newline = "\n" + indent, width = 80 } = options;
      let spaces = (newline + indent).match(/[^\S\n]/g) || [];
      width -= spaces.length;
      let source = `.{1,${width}}([\\s\\u200B]+|$)|[^\\s\\u200B]+?([\\s\\u200B]+|$)`;
      let output = str.trim();
      let regex = new RegExp(source, "g");
      let lines = output.match(regex) || [];
      lines = lines.map((line) => line.replace(/\n$/, ""));
      if (options.padEnd) lines = lines.map((line) => line.padEnd(width, " "));
      if (options.padStart) lines = lines.map((line) => line.padStart(width, " "));
      return indent + lines.join(newline);
    };
    exports.unmute = (color) => {
      let name = color.stack.find((n) => colors.keys.color.includes(n));
      if (name) {
        return colors[name];
      }
      let bg = color.stack.find((n) => n.slice(2) === "bg");
      if (bg) {
        return colors[name.slice(2)];
      }
      return (str) => str;
    };
    exports.pascal = (str) => str ? str[0].toUpperCase() + str.slice(1) : "";
    exports.inverse = (color) => {
      if (!color || !color.stack) return color;
      let name = color.stack.find((n) => colors.keys.color.includes(n));
      if (name) {
        let col = colors["bg" + exports.pascal(name)];
        return col ? col.black : color;
      }
      let bg = color.stack.find((n) => n.slice(0, 2) === "bg");
      if (bg) {
        return colors[bg.slice(2).toLowerCase()] || color;
      }
      return colors.none;
    };
    exports.complement = (color) => {
      if (!color || !color.stack) return color;
      let name = color.stack.find((n) => colors.keys.color.includes(n));
      let bg = color.stack.find((n) => n.slice(0, 2) === "bg");
      if (name && !bg) {
        return colors[complements[name] || name];
      }
      if (bg) {
        let lower = bg.slice(2).toLowerCase();
        let comp = complements[lower];
        if (!comp) return color;
        return colors["bg" + exports.pascal(comp)] || color;
      }
      return colors.none;
    };
    exports.meridiem = (date) => {
      let hours = date.getHours();
      let minutes = date.getMinutes();
      let ampm = hours >= 12 ? "pm" : "am";
      hours = hours % 12;
      let hrs = hours === 0 ? 12 : hours;
      let min = minutes < 10 ? "0" + minutes : minutes;
      return hrs + ":" + min + " " + ampm;
    };
    exports.set = (obj = {}, prop = "", val) => {
      return prop.split(".").reduce((acc, k, i, arr) => {
        let value = arr.length - 1 > i ? acc[k] || {} : val;
        if (!exports.isObject(value) && i < arr.length - 1) value = {};
        return acc[k] = value;
      }, obj);
    };
    exports.get = (obj = {}, prop = "", fallback) => {
      let value = obj[prop] == null ? prop.split(".").reduce((acc, k) => acc && acc[k], obj) : obj[prop];
      return value == null ? fallback : value;
    };
    exports.mixin = (target, b) => {
      if (!isObject(target)) return b;
      if (!isObject(b)) return target;
      for (let key of Object.keys(b)) {
        let desc = Object.getOwnPropertyDescriptor(b, key);
        if (hasOwnProperty.call(desc, "value")) {
          if (hasOwnProperty.call(target, key) && isObject(desc.value)) {
            let existing = Object.getOwnPropertyDescriptor(target, key);
            if (isObject(existing.value) && existing.value !== desc.value) {
              target[key] = exports.merge({}, target[key], b[key]);
            } else {
              Reflect.defineProperty(target, key, desc);
            }
          } else {
            Reflect.defineProperty(target, key, desc);
          }
        } else {
          Reflect.defineProperty(target, key, desc);
        }
      }
      return target;
    };
    exports.merge = (...args) => {
      let target = {};
      for (let ele of args) exports.mixin(target, ele);
      return target;
    };
    exports.mixinEmitter = (obj, emitter) => {
      let proto = emitter.constructor.prototype;
      for (let key of Object.keys(proto)) {
        let val = proto[key];
        if (typeof val === "function") {
          exports.define(obj, key, val.bind(emitter));
        } else {
          exports.define(obj, key, val);
        }
      }
    };
    var onExit = (quit, code) => {
      if (onExitCalled) return;
      onExitCalled = true;
      onExitCallbacks.forEach((fn) => fn());
      if (quit === true) {
        process.exit(128 + code);
      }
    };
    var onSigTerm = onExit.bind(null, true, 15);
    var onSigInt = onExit.bind(null, true, 2);
    exports.onExit = (callback) => {
      if (onExitCallbacks.size === 0) {
        process.once("SIGTERM", onSigTerm);
        process.once("SIGINT", onSigInt);
        process.once("exit", onExit);
      }
      onExitCallbacks.add(callback);
      return () => {
        onExitCallbacks.delete(callback);
        if (onExitCallbacks.size === 0) {
          process.off("SIGTERM", onSigTerm);
          process.off("SIGINT", onSigInt);
          process.off("exit", onExit);
        }
      };
    };
    exports.define = (obj, key, value) => {
      Reflect.defineProperty(obj, key, { value });
    };
    exports.defineExport = (obj, key, fn) => {
      let custom;
      Reflect.defineProperty(obj, key, {
        enumerable: true,
        configurable: true,
        set(val) {
          custom = val;
        },
        get() {
          return custom ? custom() : fn();
        }
      });
    };
  }
});

// node_modules/ansi-regex/index.js
var require_ansi_regex = __commonJS({
  "node_modules/ansi-regex/index.js"(exports, module) {
    "use strict";
    module.exports = ({ onlyFirst = false } = {}) => {
      const pattern = [
        "[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)",
        "(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))"
      ].join("|");
      return new RegExp(pattern, onlyFirst ? void 0 : "g");
    };
  }
});

// node_modules/strip-ansi/index.js
var require_strip_ansi = __commonJS({
  "node_modules/strip-ansi/index.js"(exports, module) {
    "use strict";
    var ansiRegex = require_ansi_regex();
    module.exports = (string) => typeof string === "string" ? string.replace(ansiRegex(), "") : string;
  }
});

// node_modules/enquirer/lib/combos.js
var require_combos = __commonJS({
  "node_modules/enquirer/lib/combos.js"(exports) {
    "use strict";
    exports.ctrl = {
      a: "first",
      b: "backward",
      c: "cancel",
      d: "deleteForward",
      e: "last",
      f: "forward",
      g: "reset",
      i: "tab",
      k: "cutForward",
      l: "reset",
      n: "newItem",
      m: "cancel",
      j: "submit",
      p: "search",
      r: "remove",
      s: "save",
      u: "undo",
      w: "cutLeft",
      x: "toggleCursor",
      v: "paste"
    };
    exports.shift = {
      up: "shiftUp",
      down: "shiftDown",
      left: "shiftLeft",
      right: "shiftRight",
      tab: "prev"
    };
    exports.fn = {
      up: "pageUp",
      down: "pageDown",
      left: "pageLeft",
      right: "pageRight",
      delete: "deleteForward"
    };
    exports.option = {
      b: "backward",
      f: "forward",
      d: "cutRight",
      left: "cutLeft",
      up: "altUp",
      down: "altDown"
    };
    exports.keys = {
      pageup: "pageUp",
      // <fn>+<up> (mac), <Page Up> (windows)
      pagedown: "pageDown",
      // <fn>+<down> (mac), <Page Down> (windows)
      home: "home",
      // <fn>+<left> (mac), <home> (windows)
      end: "end",
      // <fn>+<right> (mac), <end> (windows)
      cancel: "cancel",
      delete: "deleteForward",
      backspace: "delete",
      down: "down",
      enter: "submit",
      escape: "cancel",
      left: "left",
      space: "space",
      number: "number",
      return: "submit",
      right: "right",
      tab: "next",
      up: "up"
    };
  }
});

// node_modules/enquirer/lib/queue.js
var require_queue = __commonJS({
  "node_modules/enquirer/lib/queue.js"(exports, module) {
    "use strict";
    module.exports = class Queue {
      _queue = [];
      _executing = false;
      _jobRunner = null;
      constructor(jobRunner) {
        this._jobRunner = jobRunner;
      }
      enqueue = (...args) => {
        this._queue.push(args);
        this._dequeue();
      };
      destroy() {
        this._queue.length = 0;
        this._jobRunner = null;
      }
      _dequeue() {
        if (this._executing || !this._queue.length) return;
        this._executing = true;
        this._jobRunner(...this._queue.shift());
        setTimeout(() => {
          this._executing = false;
          this._dequeue();
        });
      }
    };
  }
});

// node_modules/enquirer/lib/keypress.js
var require_keypress = __commonJS({
  "node_modules/enquirer/lib/keypress.js"(exports, module) {
    "use strict";
    var readline = __require("readline");
    var combos = require_combos();
    var Queue = require_queue();
    var metaKeyCodeRe = /^(?:\x1b)([a-zA-Z0-9])$/;
    var fnKeyRe = /^(?:\x1b+)(O|N|\[|\[\[)(?:(\d+)(?:;(\d+))?([~^$])|(?:1;)?(\d+)?([a-zA-Z]))/;
    var keyName = {
      /* xterm/gnome ESC O letter */
      "OP": "f1",
      "OQ": "f2",
      "OR": "f3",
      "OS": "f4",
      /* xterm/rxvt ESC [ number ~ */
      "[11~": "f1",
      "[12~": "f2",
      "[13~": "f3",
      "[14~": "f4",
      /* from Cygwin and used in libuv */
      "[[A": "f1",
      "[[B": "f2",
      "[[C": "f3",
      "[[D": "f4",
      "[[E": "f5",
      /* common */
      "[15~": "f5",
      "[17~": "f6",
      "[18~": "f7",
      "[19~": "f8",
      "[20~": "f9",
      "[21~": "f10",
      "[23~": "f11",
      "[24~": "f12",
      /* xterm ESC [ letter */
      "[A": "up",
      "[B": "down",
      "[C": "right",
      "[D": "left",
      "[E": "clear",
      "[F": "end",
      "[H": "home",
      /* xterm/gnome ESC O letter */
      "OA": "up",
      "OB": "down",
      "OC": "right",
      "OD": "left",
      "OE": "clear",
      "OF": "end",
      "OH": "home",
      /* xterm/rxvt ESC [ number ~ */
      "[1~": "home",
      "[2~": "insert",
      "[3~": "delete",
      "[4~": "end",
      "[5~": "pageup",
      "[6~": "pagedown",
      /* putty */
      "[[5~": "pageup",
      "[[6~": "pagedown",
      /* rxvt */
      "[7~": "home",
      "[8~": "end",
      /* rxvt keys with modifiers */
      "[a": "up",
      "[b": "down",
      "[c": "right",
      "[d": "left",
      "[e": "clear",
      "[2$": "insert",
      "[3$": "delete",
      "[5$": "pageup",
      "[6$": "pagedown",
      "[7$": "home",
      "[8$": "end",
      "Oa": "up",
      "Ob": "down",
      "Oc": "right",
      "Od": "left",
      "Oe": "clear",
      "[2^": "insert",
      "[3^": "delete",
      "[5^": "pageup",
      "[6^": "pagedown",
      "[7^": "home",
      "[8^": "end",
      /* misc. */
      "[Z": "tab"
    };
    function isShiftKey(code) {
      return ["[a", "[b", "[c", "[d", "[e", "[2$", "[3$", "[5$", "[6$", "[7$", "[8$", "[Z"].includes(code);
    }
    function isCtrlKey(code) {
      return ["Oa", "Ob", "Oc", "Od", "Oe", "[2^", "[3^", "[5^", "[6^", "[7^", "[8^"].includes(code);
    }
    var keypress = (s = "", event = {}) => {
      let parts;
      let key = {
        name: event.name,
        ctrl: false,
        meta: false,
        shift: false,
        option: false,
        sequence: s,
        raw: s,
        ...event
      };
      if (Buffer.isBuffer(s)) {
        if (s[0] > 127 && s[1] === void 0) {
          s[0] -= 128;
          s = "\x1B" + String(s);
        } else {
          s = String(s);
        }
      } else if (s !== void 0 && typeof s !== "string") {
        s = String(s);
      } else if (!s) {
        s = key.sequence || "";
      }
      key.sequence = key.sequence || s || key.name;
      if (s === "\r") {
        key.raw = void 0;
        key.name = "return";
      } else if (s === "\n") {
        key.name = "enter";
      } else if (s === "	") {
        key.name = "tab";
      } else if (s === "\b" || s === "\x7F" || s === "\x1B\x7F" || s === "\x1B\b") {
        key.name = "backspace";
        key.meta = s.charAt(0) === "\x1B";
      } else if (s === "\x1B" || s === "\x1B\x1B") {
        key.name = "escape";
        key.meta = s.length === 2;
      } else if (s === " " || s === "\x1B ") {
        key.name = "space";
        key.meta = s.length === 2;
      } else if (s <= "") {
        key.name = String.fromCharCode(s.charCodeAt(0) + "a".charCodeAt(0) - 1);
        key.ctrl = true;
      } else if (s.length === 1 && s >= "0" && s <= "9") {
        key.name = "number";
      } else if (s.length === 1 && s >= "a" && s <= "z") {
        key.name = s;
      } else if (s.length === 1 && s >= "A" && s <= "Z") {
        key.name = s.toLowerCase();
        key.shift = true;
      } else if (parts = metaKeyCodeRe.exec(s)) {
        key.meta = true;
        key.shift = /^[A-Z]$/.test(parts[1]);
      } else if (parts = fnKeyRe.exec(s)) {
        let segs = [...s];
        if (segs[0] === "\x1B" && segs[1] === "\x1B") {
          key.option = true;
        }
        let code = [parts[1], parts[2], parts[4], parts[6]].filter(Boolean).join("");
        let modifier = (parts[3] || parts[5] || 1) - 1;
        key.ctrl = !!(modifier & 4);
        key.meta = !!(modifier & 10);
        key.shift = !!(modifier & 1);
        key.code = code;
        key.name = keyName[code];
        key.shift = isShiftKey(code) || key.shift;
        key.ctrl = isCtrlKey(code) || key.ctrl;
      }
      return key;
    };
    keypress.listen = (options = {}, onKeypress) => {
      let { stdin } = options;
      if (!stdin || stdin !== process.stdin && !stdin.isTTY) {
        throw new Error("Invalid stream passed");
      }
      let rl = readline.createInterface({ terminal: true, input: stdin });
      readline.emitKeypressEvents(stdin, rl);
      const queue = new Queue((buf, key) => onKeypress(buf, keypress(buf, key), rl));
      let isRaw = stdin.isRaw;
      if (stdin.isTTY) stdin.setRawMode(true);
      stdin.on("keypress", queue.enqueue);
      rl.resume();
      let off = () => {
        if (stdin.isTTY) stdin.setRawMode(isRaw);
        stdin.removeListener("keypress", queue.enqueue);
        queue.destroy();
        rl.pause();
        rl.close();
      };
      return off;
    };
    keypress.action = (buf, key, customActions) => {
      let obj = { ...combos, ...customActions };
      if (key.ctrl) {
        key.action = obj.ctrl[key.name];
        return key;
      }
      if (key.option && obj.option) {
        key.action = obj.option[key.name];
        return key;
      }
      if (key.shift) {
        key.action = obj.shift[key.name];
        return key;
      }
      key.action = obj.keys[key.name];
      return key;
    };
    module.exports = keypress;
  }
});

// node_modules/enquirer/lib/timer.js
var require_timer = __commonJS({
  "node_modules/enquirer/lib/timer.js"(exports, module) {
    "use strict";
    module.exports = (prompt) => {
      prompt.timers = prompt.timers || {};
      let timers = prompt.options.timers;
      if (!timers) return;
      for (let key of Object.keys(timers)) {
        let opts = timers[key];
        if (typeof opts === "number") {
          opts = { interval: opts };
        }
        create(prompt, key, opts);
      }
    };
    function create(prompt, name, options = {}) {
      let timer = prompt.timers[name] = { name, start: Date.now(), ms: 0, tick: 0 };
      let ms = options.interval || 120;
      timer.frames = options.frames || [];
      timer.loading = true;
      let interval = setInterval(() => {
        timer.ms = Date.now() - timer.start;
        timer.tick++;
        prompt.render();
      }, ms);
      timer.stop = () => {
        timer.loading = false;
        clearInterval(interval);
      };
      Reflect.defineProperty(timer, "interval", { value: interval });
      prompt.once("close", () => timer.stop());
      return timer.stop;
    }
  }
});

// node_modules/enquirer/lib/state.js
var require_state = __commonJS({
  "node_modules/enquirer/lib/state.js"(exports, module) {
    "use strict";
    var { define, width } = require_utils();
    var State = class {
      constructor(prompt) {
        let options = prompt.options;
        define(this, "_prompt", prompt);
        this.type = prompt.type;
        this.name = prompt.name;
        this.message = "";
        this.header = "";
        this.footer = "";
        this.error = "";
        this.hint = "";
        this.input = "";
        this.cursor = 0;
        this.index = 0;
        this.lines = 0;
        this.tick = 0;
        this.prompt = "";
        this.buffer = "";
        this.width = width(options.stdout || process.stdout);
        Object.assign(this, options);
        this.name = this.name || this.message;
        this.message = this.message || this.name;
        this.symbols = prompt.symbols;
        this.styles = prompt.styles;
        this.required = /* @__PURE__ */ new Set();
        this.cancelled = false;
        this.submitted = false;
      }
      clone() {
        let state = { ...this };
        state.status = this.status;
        state.buffer = Buffer.from(state.buffer);
        delete state.clone;
        return state;
      }
      set color(val) {
        this._color = val;
      }
      get color() {
        let styles = this.prompt.styles;
        if (this.cancelled) return styles.cancelled;
        if (this.submitted) return styles.submitted;
        let color = this._color || styles[this.status];
        return typeof color === "function" ? color : styles.pending;
      }
      set loading(value) {
        this._loading = value;
      }
      get loading() {
        if (typeof this._loading === "boolean") return this._loading;
        if (this.loadingChoices) return "choices";
        return false;
      }
      get status() {
        if (this.cancelled) return "cancelled";
        if (this.submitted) return "submitted";
        return "pending";
      }
    };
    module.exports = State;
  }
});

// node_modules/enquirer/lib/styles.js
var require_styles = __commonJS({
  "node_modules/enquirer/lib/styles.js"(exports, module) {
    "use strict";
    var utils = require_utils();
    var colors = require_ansi_colors();
    var styles = {
      default: colors.noop,
      noop: colors.noop,
      /**
       * Modifiers
       */
      set inverse(custom) {
        this._inverse = custom;
      },
      get inverse() {
        return this._inverse || utils.inverse(this.primary);
      },
      set complement(custom) {
        this._complement = custom;
      },
      get complement() {
        return this._complement || utils.complement(this.primary);
      },
      /**
       * Main color
       */
      primary: colors.cyan,
      /**
       * Main palette
       */
      success: colors.green,
      danger: colors.magenta,
      strong: colors.bold,
      warning: colors.yellow,
      muted: colors.dim,
      disabled: colors.gray,
      dark: colors.dim.gray,
      underline: colors.underline,
      set info(custom) {
        this._info = custom;
      },
      get info() {
        return this._info || this.primary;
      },
      set em(custom) {
        this._em = custom;
      },
      get em() {
        return this._em || this.primary.underline;
      },
      set heading(custom) {
        this._heading = custom;
      },
      get heading() {
        return this._heading || this.muted.underline;
      },
      /**
       * Statuses
       */
      set pending(custom) {
        this._pending = custom;
      },
      get pending() {
        return this._pending || this.primary;
      },
      set submitted(custom) {
        this._submitted = custom;
      },
      get submitted() {
        return this._submitted || this.success;
      },
      set cancelled(custom) {
        this._cancelled = custom;
      },
      get cancelled() {
        return this._cancelled || this.danger;
      },
      /**
       * Special styling
       */
      set typing(custom) {
        this._typing = custom;
      },
      get typing() {
        return this._typing || this.dim;
      },
      set placeholder(custom) {
        this._placeholder = custom;
      },
      get placeholder() {
        return this._placeholder || this.primary.dim;
      },
      set highlight(custom) {
        this._highlight = custom;
      },
      get highlight() {
        return this._highlight || this.inverse;
      }
    };
    styles.merge = (options = {}) => {
      if (options.styles && typeof options.styles.enabled === "boolean") {
        colors.enabled = options.styles.enabled;
      }
      if (options.styles && typeof options.styles.visible === "boolean") {
        colors.visible = options.styles.visible;
      }
      let result = utils.merge({}, styles, options.styles);
      delete result.merge;
      for (let key of Object.keys(colors)) {
        if (!hasOwnProperty.call(result, key)) {
          Reflect.defineProperty(result, key, { get: () => colors[key] });
        }
      }
      for (let key of Object.keys(colors.styles)) {
        if (!hasOwnProperty.call(result, key)) {
          Reflect.defineProperty(result, key, { get: () => colors[key] });
        }
      }
      return result;
    };
    module.exports = styles;
  }
});

// node_modules/enquirer/lib/symbols.js
var require_symbols2 = __commonJS({
  "node_modules/enquirer/lib/symbols.js"(exports, module) {
    "use strict";
    var isWindows = process.platform === "win32";
    var colors = require_ansi_colors();
    var utils = require_utils();
    var symbols = {
      ...colors.symbols,
      upDownDoubleArrow: "\u21D5",
      upDownDoubleArrow2: "\u2B0D",
      upDownArrow: "\u2195",
      asterisk: "*",
      asterism: "\u2042",
      bulletWhite: "\u25E6",
      electricArrow: "\u2301",
      ellipsisLarge: "\u22EF",
      ellipsisSmall: "\u2026",
      fullBlock: "\u2588",
      identicalTo: "\u2261",
      indicator: colors.symbols.check,
      leftAngle: "\u2039",
      mark: "\u203B",
      minus: "\u2212",
      multiplication: "\xD7",
      obelus: "\xF7",
      percent: "%",
      pilcrow: "\xB6",
      pilcrow2: "\u2761",
      pencilUpRight: "\u2710",
      pencilDownRight: "\u270E",
      pencilRight: "\u270F",
      plus: "+",
      plusMinus: "\xB1",
      pointRight: "\u261E",
      rightAngle: "\u203A",
      section: "\xA7",
      hexagon: { off: "\u2B21", on: "\u2B22", disabled: "\u2B22" },
      ballot: { on: "\u2611", off: "\u2610", disabled: "\u2612" },
      stars: { on: "\u2605", off: "\u2606", disabled: "\u2606" },
      folder: { on: "\u25BC", off: "\u25B6", disabled: "\u25B6" },
      prefix: {
        pending: colors.symbols.question,
        submitted: colors.symbols.check,
        cancelled: colors.symbols.cross
      },
      separator: {
        pending: colors.symbols.pointerSmall,
        submitted: colors.symbols.middot,
        cancelled: colors.symbols.middot
      },
      radio: {
        off: isWindows ? "( )" : "\u25EF",
        on: isWindows ? "(*)" : "\u25C9",
        disabled: isWindows ? "(|)" : "\u24BE"
      },
      numbers: ["\u24EA", "\u2460", "\u2461", "\u2462", "\u2463", "\u2464", "\u2465", "\u2466", "\u2467", "\u2468", "\u2469", "\u246A", "\u246B", "\u246C", "\u246D", "\u246E", "\u246F", "\u2470", "\u2471", "\u2472", "\u2473", "\u3251", "\u3252", "\u3253", "\u3254", "\u3255", "\u3256", "\u3257", "\u3258", "\u3259", "\u325A", "\u325B", "\u325C", "\u325D", "\u325E", "\u325F", "\u32B1", "\u32B2", "\u32B3", "\u32B4", "\u32B5", "\u32B6", "\u32B7", "\u32B8", "\u32B9", "\u32BA", "\u32BB", "\u32BC", "\u32BD", "\u32BE", "\u32BF"]
    };
    symbols.merge = (options) => {
      let result = utils.merge({}, colors.symbols, symbols, options.symbols);
      delete result.merge;
      return result;
    };
    module.exports = symbols;
  }
});

// node_modules/enquirer/lib/theme.js
var require_theme = __commonJS({
  "node_modules/enquirer/lib/theme.js"(exports, module) {
    "use strict";
    var styles = require_styles();
    var symbols = require_symbols2();
    var utils = require_utils();
    module.exports = (prompt) => {
      prompt.options = utils.merge({}, prompt.options.theme, prompt.options);
      prompt.symbols = symbols.merge(prompt.options);
      prompt.styles = styles.merge(prompt.options);
    };
  }
});

// node_modules/enquirer/lib/ansi.js
var require_ansi = __commonJS({
  "node_modules/enquirer/lib/ansi.js"(exports, module) {
    "use strict";
    var isTerm = process.env.TERM_PROGRAM === "Apple_Terminal";
    var stripAnsi = require_strip_ansi();
    var utils = require_utils();
    var ansi = module.exports = exports;
    var ESC = "\x1B[";
    var BEL = "\x07";
    var hidden = false;
    var code = ansi.code = {
      bell: BEL,
      beep: BEL,
      beginning: `${ESC}G`,
      down: `${ESC}J`,
      esc: ESC,
      getPosition: `${ESC}6n`,
      hide: `${ESC}?25l`,
      line: `${ESC}2K`,
      lineEnd: `${ESC}K`,
      lineStart: `${ESC}1K`,
      restorePosition: ESC + (isTerm ? "8" : "u"),
      savePosition: ESC + (isTerm ? "7" : "s"),
      screen: `${ESC}2J`,
      show: `${ESC}?25h`,
      up: `${ESC}1J`
    };
    var cursor = ansi.cursor = {
      get hidden() {
        return hidden;
      },
      hide() {
        hidden = true;
        return code.hide;
      },
      show() {
        hidden = false;
        return code.show;
      },
      forward: (count = 1) => `${ESC}${count}C`,
      backward: (count = 1) => `${ESC}${count}D`,
      nextLine: (count = 1) => `${ESC}E`.repeat(count),
      prevLine: (count = 1) => `${ESC}F`.repeat(count),
      up: (count = 1) => count ? `${ESC}${count}A` : "",
      down: (count = 1) => count ? `${ESC}${count}B` : "",
      right: (count = 1) => count ? `${ESC}${count}C` : "",
      left: (count = 1) => count ? `${ESC}${count}D` : "",
      to(x, y) {
        return y ? `${ESC}${y + 1};${x + 1}H` : `${ESC}${x + 1}G`;
      },
      move(x = 0, y = 0) {
        let res = "";
        res += x < 0 ? cursor.left(-x) : x > 0 ? cursor.right(x) : "";
        res += y < 0 ? cursor.up(-y) : y > 0 ? cursor.down(y) : "";
        return res;
      },
      strLen(str) {
        var realLength = 0, len = str.length, charCode = -1;
        for (var i = 0; i < len; i++) {
          charCode = str.charCodeAt(i);
          if (charCode >= 0 && charCode <= 128) realLength += 1;
          else realLength += 2;
        }
        return realLength;
      },
      restore(state = {}) {
        let { after, cursor: cursor2, initial, input, prompt, size, value } = state;
        initial = utils.isPrimitive(initial) ? String(initial) : "";
        input = utils.isPrimitive(input) ? String(input) : "";
        value = utils.isPrimitive(value) ? String(value) : "";
        if (size) {
          let codes = ansi.cursor.up(size) + ansi.cursor.to(this.strLen(prompt));
          let diff = input.length - cursor2;
          if (diff > 0) {
            codes += ansi.cursor.left(diff);
          }
          return codes;
        }
        if (value || after) {
          let pos = !input && !!initial ? -this.strLen(initial) : -this.strLen(input) + cursor2;
          if (after) pos -= this.strLen(after);
          if (input === "" && initial && !prompt.includes(initial)) {
            pos += this.strLen(initial);
          }
          return ansi.cursor.move(pos);
        }
      }
    };
    var erase = ansi.erase = {
      screen: code.screen,
      up: code.up,
      down: code.down,
      line: code.line,
      lineEnd: code.lineEnd,
      lineStart: code.lineStart,
      lines(n) {
        let str = "";
        for (let i = 0; i < n; i++) {
          str += ansi.erase.line + (i < n - 1 ? ansi.cursor.up(1) : "");
        }
        if (n) str += ansi.code.beginning;
        return str;
      }
    };
    ansi.clear = (input = "", columns = process.stdout.columns) => {
      if (!columns) return erase.line + cursor.to(0);
      let width = (str) => [...stripAnsi(str)].length;
      let lines = input.split(/\r?\n/);
      let rows = 0;
      for (let line of lines) {
        rows += 1 + Math.floor(Math.max(width(line) - 1, 0) / columns);
      }
      return (erase.line + cursor.prevLine()).repeat(rows - 1) + erase.line + cursor.to(0);
    };
  }
});

// node_modules/enquirer/lib/prompt.js
var require_prompt = __commonJS({
  "node_modules/enquirer/lib/prompt.js"(exports, module) {
    "use strict";
    var Events = __require("events");
    var stripAnsi = require_strip_ansi();
    var keypress = require_keypress();
    var timer = require_timer();
    var State = require_state();
    var theme = require_theme();
    var utils = require_utils();
    var ansi = require_ansi();
    var Prompt = class _Prompt extends Events {
      constructor(options = {}) {
        super();
        this.name = options.name;
        this.type = options.type;
        this.options = options;
        theme(this);
        timer(this);
        this.state = new State(this);
        this.initial = [options.initial, options.default].find((v) => v != null);
        this.stdout = options.stdout || process.stdout;
        this.stdin = options.stdin || process.stdin;
        this.scale = options.scale || 1;
        this.term = this.options.term || process.env.TERM_PROGRAM;
        this.margin = margin(this.options.margin);
        this.setMaxListeners(0);
        setOptions(this);
      }
      async keypress(input, event = {}) {
        this.keypressed = true;
        let key = keypress.action(input, keypress(input, event), this.options.actions);
        this.state.keypress = key;
        this.emit("keypress", input, key);
        this.emit("state", this.state.clone());
        const fn = this.options[key.action] || this[key.action] || this.dispatch;
        if (typeof fn === "function") {
          return await fn.call(this, input, key);
        }
        this.alert();
      }
      alert() {
        delete this.state.alert;
        if (this.options.show === false) {
          this.emit("alert");
        } else {
          this.stdout.write(ansi.code.beep);
        }
      }
      cursorHide() {
        this.stdout.write(ansi.cursor.hide());
        const releaseOnExit = utils.onExit(() => this.cursorShow());
        this.on("close", () => {
          this.cursorShow();
          releaseOnExit();
        });
      }
      cursorShow() {
        this.stdout.write(ansi.cursor.show());
      }
      write(str) {
        if (!str) return;
        if (this.stdout && this.state.show !== false) {
          this.stdout.write(str);
        }
        this.state.buffer += str;
      }
      clear(lines = 0) {
        let buffer = this.state.buffer;
        this.state.buffer = "";
        if (!buffer && !lines || this.options.show === false) return;
        this.stdout.write(ansi.cursor.down(lines) + ansi.clear(buffer, this.width));
      }
      restore() {
        if (this.state.closed || this.options.show === false) return;
        let { prompt, after, rest } = this.sections();
        let { cursor, initial = "", input = "", value = "" } = this;
        let size = this.state.size = rest.length;
        let state = { after, cursor, initial, input, prompt, size, value };
        let codes = ansi.cursor.restore(state);
        if (codes) {
          this.stdout.write(codes);
        }
      }
      sections() {
        let { buffer, input, prompt } = this.state;
        prompt = stripAnsi(prompt);
        let buf = stripAnsi(buffer);
        let idx = buf.indexOf(prompt);
        let header = buf.slice(0, idx);
        let rest = buf.slice(idx);
        let lines = rest.split("\n");
        let first = lines[0];
        let last = lines[lines.length - 1];
        let promptLine = prompt + (input ? " " + input : "");
        let len = promptLine.length;
        let after = len < first.length ? first.slice(len + 1) : "";
        return { header, prompt: first, after, rest: lines.slice(1), last };
      }
      async submit() {
        this.state.submitted = true;
        this.state.validating = true;
        if (this.options.onSubmit) {
          await this.options.onSubmit.call(this, this.name, this.value, this);
        }
        let result = this.state.error || await this.validate(this.value, this.state);
        if (result !== true) {
          let error = "\n" + this.symbols.pointer + " ";
          if (typeof result === "string") {
            error += result.trim();
          } else {
            error += "Invalid input";
          }
          this.state.error = "\n" + this.styles.danger(error);
          this.state.submitted = false;
          await this.render();
          await this.alert();
          this.state.validating = false;
          this.state.error = void 0;
          return;
        }
        this.state.validating = false;
        await this.render();
        await this.close();
        this.value = await this.result(this.value);
        this.emit("submit", this.value);
      }
      async cancel(err) {
        this.state.cancelled = this.state.submitted = true;
        await this.render();
        await this.close();
        if (typeof this.options.onCancel === "function") {
          await this.options.onCancel.call(this, this.name, this.value, this);
        }
        this.emit("cancel", await this.error(err));
      }
      async close() {
        this.state.closed = true;
        try {
          let sections = this.sections();
          let lines = Math.ceil(sections.prompt.length / this.width);
          if (sections.rest) {
            this.write(ansi.cursor.down(sections.rest.length));
          }
          this.write("\n".repeat(lines));
        } catch (err) {
        }
        this.emit("close");
      }
      start() {
        if (!this.stop && this.options.show !== false) {
          this.stop = keypress.listen(this, this.keypress.bind(this));
          this.once("close", this.stop);
          this.emit("start", this);
        }
      }
      async skip() {
        this.skipped = this.options.skip === true;
        if (typeof this.options.skip === "function") {
          this.skipped = await this.options.skip.call(this, this.name, this.value);
        }
        return this.skipped;
      }
      async initialize() {
        let { format: format2, options, result } = this;
        this.format = () => format2.call(this, this.value);
        this.result = () => result.call(this, this.value);
        if (typeof options.initial === "function") {
          this.initial = await options.initial.call(this, this);
        }
        if (typeof options.onRun === "function") {
          await options.onRun.call(this, this);
        }
        if (typeof options.onSubmit === "function") {
          let onSubmit = options.onSubmit.bind(this);
          let submit = this.submit.bind(this);
          delete this.options.onSubmit;
          this.submit = async () => {
            await onSubmit(this.name, this.value, this);
            return submit();
          };
        }
        await this.start();
        await this.render();
      }
      render() {
        throw new Error("expected prompt to have a custom render method");
      }
      run() {
        return new Promise(async (resolve2, reject) => {
          this.once("submit", resolve2);
          this.once("cancel", reject);
          if (await this.skip()) {
            this.render = () => {
            };
            return this.submit();
          }
          await this.initialize();
          this.emit("run");
        });
      }
      async element(name, choice, i) {
        let { options, state, symbols, timers } = this;
        let timer2 = timers && timers[name];
        state.timer = timer2;
        let value = options[name] || state[name] || symbols[name];
        let val = choice && choice[name] != null ? choice[name] : await value;
        if (val === "") return val;
        let res = await this.resolve(val, state, choice, i);
        if (!res && choice && choice[name]) {
          return this.resolve(value, state, choice, i);
        }
        return res;
      }
      async prefix() {
        let element = await this.element("prefix") || this.symbols;
        let timer2 = this.timers && this.timers.prefix;
        let state = this.state;
        state.timer = timer2;
        if (utils.isObject(element)) element = element[state.status] || element.pending;
        if (!utils.hasColor(element)) {
          let style = this.styles[state.status] || this.styles.pending;
          return style(element);
        }
        return element;
      }
      async message() {
        let message = await this.element("message");
        if (!utils.hasColor(message)) {
          return this.styles.strong(message);
        }
        return message;
      }
      async separator() {
        let element = await this.element("separator") || this.symbols;
        let timer2 = this.timers && this.timers.separator;
        let state = this.state;
        state.timer = timer2;
        let value = element[state.status] || element.pending || state.separator;
        let ele = await this.resolve(value, state);
        if (utils.isObject(ele)) ele = ele[state.status] || ele.pending;
        if (!utils.hasColor(ele)) {
          return this.styles.muted(ele);
        }
        return ele;
      }
      async pointer(choice, i) {
        let val = await this.element("pointer", choice, i);
        if (typeof val === "string" && utils.hasColor(val)) {
          return val;
        }
        if (val) {
          let styles = this.styles;
          let focused = this.index === i;
          let style = focused ? styles.primary : (val2) => val2;
          let ele = await this.resolve(val[focused ? "on" : "off"] || val, this.state);
          let styled = !utils.hasColor(ele) ? style(ele) : ele;
          return focused ? styled : " ".repeat(ele.length);
        }
      }
      async indicator(choice, i) {
        let val = await this.element("indicator", choice, i);
        if (typeof val === "string" && utils.hasColor(val)) {
          return val;
        }
        if (val) {
          let styles = this.styles;
          let enabled = choice.enabled === true;
          let style = enabled ? styles.success : styles.dark;
          let ele = val[enabled ? "on" : "off"] || val;
          return !utils.hasColor(ele) ? style(ele) : ele;
        }
        return "";
      }
      body() {
        return null;
      }
      footer() {
        if (this.state.status === "pending") {
          return this.element("footer");
        }
      }
      header() {
        if (this.state.status === "pending") {
          return this.element("header");
        }
      }
      async hint() {
        if (this.state.status === "pending" && !this.isValue(this.state.input)) {
          let hint = await this.element("hint");
          if (!utils.hasColor(hint)) {
            return this.styles.muted(hint);
          }
          return hint;
        }
      }
      error(err) {
        return !this.state.submitted ? err || this.state.error : "";
      }
      format(value) {
        return value;
      }
      result(value) {
        return value;
      }
      validate(value) {
        if (this.options.required === true) {
          return this.isValue(value);
        }
        return true;
      }
      isValue(value) {
        return value != null && value !== "";
      }
      resolve(value, ...args) {
        return utils.resolve(this, value, ...args);
      }
      get base() {
        return _Prompt.prototype;
      }
      get style() {
        return this.styles[this.state.status];
      }
      get height() {
        return this.options.rows || utils.height(this.stdout, 25);
      }
      get width() {
        return this.options.columns || utils.width(this.stdout, 80);
      }
      get size() {
        return { width: this.width, height: this.height };
      }
      set cursor(value) {
        this.state.cursor = value;
      }
      get cursor() {
        return this.state.cursor;
      }
      set input(value) {
        this.state.input = value;
      }
      get input() {
        return this.state.input;
      }
      set value(value) {
        this.state.value = value;
      }
      get value() {
        let { input, value } = this.state;
        let result = [value, input].find(this.isValue.bind(this));
        return this.isValue(result) ? result : this.initial;
      }
      static get prompt() {
        return (options) => new this(options).run();
      }
    };
    function setOptions(prompt) {
      let isValidKey = (key) => {
        return prompt[key] === void 0 || typeof prompt[key] === "function";
      };
      let ignore = [
        "actions",
        "choices",
        "initial",
        "margin",
        "roles",
        "styles",
        "symbols",
        "theme",
        "timers",
        "value"
      ];
      let ignoreFn = [
        "body",
        "footer",
        "error",
        "header",
        "hint",
        "indicator",
        "message",
        "prefix",
        "separator",
        "skip"
      ];
      for (let key of Object.keys(prompt.options)) {
        if (ignore.includes(key)) continue;
        if (/^on[A-Z]/.test(key)) continue;
        let option = prompt.options[key];
        if (typeof option === "function" && isValidKey(key)) {
          if (!ignoreFn.includes(key)) {
            prompt[key] = option.bind(prompt);
          }
        } else if (typeof prompt[key] !== "function") {
          prompt[key] = option;
        }
      }
    }
    function margin(value) {
      if (typeof value === "number") {
        value = [value, value, value, value];
      }
      let arr = [].concat(value || []);
      let pad = (i) => i % 2 === 0 ? "\n" : " ";
      let res = [];
      for (let i = 0; i < 4; i++) {
        let char = pad(i);
        if (arr[i]) {
          res.push(char.repeat(arr[i]));
        } else {
          res.push("");
        }
      }
      return res;
    }
    module.exports = Prompt;
  }
});

// node_modules/enquirer/lib/roles.js
var require_roles = __commonJS({
  "node_modules/enquirer/lib/roles.js"(exports, module) {
    "use strict";
    var utils = require_utils();
    var roles = {
      default(prompt, choice) {
        return choice;
      },
      checkbox(prompt, choice) {
        throw new Error("checkbox role is not implemented yet");
      },
      editable(prompt, choice) {
        throw new Error("editable role is not implemented yet");
      },
      expandable(prompt, choice) {
        throw new Error("expandable role is not implemented yet");
      },
      heading(prompt, choice) {
        choice.disabled = "";
        choice.indicator = [choice.indicator, " "].find((v) => v != null);
        choice.message = choice.message || "";
        return choice;
      },
      input(prompt, choice) {
        throw new Error("input role is not implemented yet");
      },
      option(prompt, choice) {
        return roles.default(prompt, choice);
      },
      radio(prompt, choice) {
        throw new Error("radio role is not implemented yet");
      },
      separator(prompt, choice) {
        choice.disabled = "";
        choice.indicator = [choice.indicator, " "].find((v) => v != null);
        choice.message = choice.message || prompt.symbols.line.repeat(5);
        return choice;
      },
      spacer(prompt, choice) {
        return choice;
      }
    };
    module.exports = (name, options = {}) => {
      let role = utils.merge({}, roles, options.roles);
      return role[name] || role.default;
    };
  }
});

// node_modules/enquirer/lib/types/array.js
var require_array = __commonJS({
  "node_modules/enquirer/lib/types/array.js"(exports, module) {
    "use strict";
    var stripAnsi = require_strip_ansi();
    var Prompt = require_prompt();
    var roles = require_roles();
    var utils = require_utils();
    var { reorder, scrollUp, scrollDown, isObject, swap } = utils;
    var ArrayPrompt = class extends Prompt {
      constructor(options) {
        super(options);
        this.cursorHide();
        this.maxSelected = options.maxSelected || Infinity;
        this.multiple = options.multiple || false;
        this.initial = options.initial || 0;
        this.delay = options.delay || 0;
        this.longest = 0;
        this.num = "";
      }
      async initialize() {
        if (typeof this.options.initial === "function") {
          this.initial = await this.options.initial.call(this);
        }
        await this.reset(true);
        await super.initialize();
      }
      async reset() {
        let { choices, initial, autofocus, suggest } = this.options;
        this.state._choices = [];
        this.state.choices = [];
        this.choices = await Promise.all(await this.toChoices(choices));
        this.choices.forEach((ch) => ch.enabled = false);
        if (typeof suggest !== "function" && this.selectable.length === 0) {
          throw new Error("At least one choice must be selectable");
        }
        if (isObject(initial)) initial = Object.keys(initial);
        if (Array.isArray(initial)) {
          if (autofocus != null) this.index = this.findIndex(autofocus);
          initial.forEach((v) => this.enable(this.find(v)));
          await this.render();
        } else {
          if (autofocus != null) initial = autofocus;
          if (typeof initial === "string") initial = this.findIndex(initial);
          if (typeof initial === "number" && initial > -1) {
            this.index = Math.max(0, Math.min(initial, this.choices.length));
            this.enable(this.find(this.index));
          }
        }
        if (this.isDisabled(this.focused)) {
          await this.down();
        }
      }
      async toChoices(value, parent) {
        this.state.loadingChoices = true;
        let choices = [];
        let index = 0;
        let toChoices = async (items, parent2) => {
          if (typeof items === "function") items = await items.call(this);
          if (items instanceof Promise) items = await items;
          for (let i = 0; i < items.length; i++) {
            let choice = items[i] = await this.toChoice(items[i], index++, parent2);
            choices.push(choice);
            if (choice.choices) {
              await toChoices(choice.choices, choice);
            }
          }
          return choices;
        };
        return toChoices(value, parent).then((choices2) => {
          this.state.loadingChoices = false;
          return choices2;
        });
      }
      async toChoice(ele, i, parent) {
        if (typeof ele === "function") ele = await ele.call(this, this);
        if (ele instanceof Promise) ele = await ele;
        if (typeof ele === "string") ele = { name: ele };
        if (ele.normalized) return ele;
        ele.normalized = true;
        let origVal = ele.value;
        let role = roles(ele.role, this.options);
        ele = role(this, ele);
        if (typeof ele.disabled === "string" && !ele.hint) {
          ele.hint = ele.disabled;
          ele.disabled = true;
        }
        if (ele.disabled === true && ele.hint == null) {
          ele.hint = "(disabled)";
        }
        if (ele.index != null) return ele;
        ele.name = ele.name || ele.key || ele.title || ele.value || ele.message;
        ele.message = ele.message || ele.name || "";
        ele.value = [ele.value, ele.name].find(this.isValue.bind(this));
        ele.input = "";
        ele.index = i;
        ele.cursor = 0;
        utils.define(ele, "parent", parent);
        ele.level = parent ? parent.level + 1 : 1;
        if (ele.indent == null) {
          ele.indent = parent ? parent.indent + "  " : ele.indent || "";
        }
        ele.path = parent ? parent.path + "." + ele.name : ele.name;
        ele.enabled = !!(this.multiple && !this.isDisabled(ele) && (ele.enabled || this.isSelected(ele)));
        if (!this.isDisabled(ele)) {
          this.longest = Math.max(this.longest, stripAnsi(ele.message).length);
        }
        let choice = { ...ele };
        ele.reset = (input = choice.input, value = choice.value) => {
          for (let key of Object.keys(choice)) ele[key] = choice[key];
          ele.input = input;
          ele.value = value;
        };
        if (origVal == null && typeof ele.initial === "function") {
          ele.input = await ele.initial.call(this, this.state, ele, i);
        }
        return ele;
      }
      async onChoice(choice, i) {
        this.emit("choice", choice, i, this);
        if (typeof choice.onChoice === "function") {
          await choice.onChoice.call(this, this.state, choice, i);
        }
      }
      async addChoice(ele, i, parent) {
        let choice = await this.toChoice(ele, i, parent);
        this.choices.push(choice);
        this.index = this.choices.length - 1;
        this.limit = this.choices.length;
        return choice;
      }
      async newItem(item, i, parent) {
        let ele = { name: "New choice name?", editable: true, newChoice: true, ...item };
        let choice = await this.addChoice(ele, i, parent);
        choice.updateChoice = () => {
          delete choice.newChoice;
          choice.name = choice.message = choice.input;
          choice.input = "";
          choice.cursor = 0;
        };
        return this.render();
      }
      indent(choice) {
        if (choice.indent == null) {
          return choice.level > 1 ? "  ".repeat(choice.level - 1) : "";
        }
        return choice.indent;
      }
      dispatch(s, key) {
        if (this.multiple && this[key.name]) return this[key.name]();
        this.alert();
      }
      focus(choice, enabled) {
        if (typeof enabled !== "boolean") enabled = choice.enabled;
        if (enabled && !choice.enabled && this.selected.length >= this.maxSelected) {
          return this.alert();
        }
        this.index = choice.index;
        choice.enabled = enabled && !this.isDisabled(choice);
        return choice;
      }
      space() {
        if (!this.multiple) return this.alert();
        if (!this.focused) return;
        this.toggle(this.focused);
        return this.render();
      }
      a() {
        if (this.maxSelected < this.choices.length) return this.alert();
        let enabled = this.selectable.every((ch) => ch.enabled);
        this.choices.forEach((ch) => ch.enabled = !enabled);
        return this.render();
      }
      i() {
        if (this.choices.length - this.selected.length > this.maxSelected) {
          return this.alert();
        }
        this.choices.forEach((ch) => ch.enabled = !ch.enabled);
        return this.render();
      }
      g() {
        if (!this.choices.some((ch) => !!ch.parent)) return this.a();
        const focused = this.focused;
        this.toggle(focused.parent && !focused.choices ? focused.parent : focused);
        return this.render();
      }
      toggle(choice, enabled) {
        if (!choice.enabled && this.selected.length >= this.maxSelected) {
          return this.alert();
        }
        if (typeof enabled !== "boolean") enabled = !choice.enabled;
        choice.enabled = enabled;
        if (choice.choices) {
          choice.choices.forEach((ch) => this.toggle(ch, enabled));
        }
        let parent = choice.parent;
        while (parent) {
          let choices = parent.choices.filter((ch) => this.isDisabled(ch));
          parent.enabled = choices.every((ch) => ch.enabled === true);
          parent = parent.parent;
        }
        reset(this, this.choices);
        this.emit("toggle", choice, this);
        return choice;
      }
      enable(choice) {
        if (this.selected.length >= this.maxSelected) return this.alert();
        choice.enabled = !this.isDisabled(choice);
        choice.choices && choice.choices.forEach(this.enable.bind(this));
        return choice;
      }
      disable(choice) {
        choice.enabled = false;
        choice.choices && choice.choices.forEach(this.disable.bind(this));
        return choice;
      }
      number(n) {
        this.num += n;
        let number = (num) => {
          let i = Number(num);
          if (i > this.choices.length - 1) return this.alert();
          let focused = this.focused;
          let choice = this.choices.find((ch) => i === ch.index);
          if (!choice.enabled && this.selected.length >= this.maxSelected) {
            return this.alert();
          }
          if (this.visible.indexOf(choice) === -1) {
            let choices = reorder(this.choices);
            let actualIdx = choices.indexOf(choice);
            if (focused.index > actualIdx) {
              let start = choices.slice(actualIdx, actualIdx + this.limit);
              let end = choices.filter((ch) => !start.includes(ch));
              this.choices = start.concat(end);
            } else {
              let pos = actualIdx - this.limit + 1;
              this.choices = choices.slice(pos).concat(choices.slice(0, pos));
            }
          }
          this.index = this.choices.indexOf(choice);
          this.toggle(this.focused);
          return this.render();
        };
        clearTimeout(this.numberTimeout);
        return new Promise((resolve2) => {
          let len = this.choices.length;
          let num = this.num;
          let handle = (val = false, res) => {
            clearTimeout(this.numberTimeout);
            if (val) res = number(num);
            this.num = "";
            resolve2(res);
          };
          if (num === "0" || num.length === 1 && Number(num + "0") > len) {
            return handle(true);
          }
          if (Number(num) > len) {
            return handle(false, this.alert());
          }
          this.numberTimeout = setTimeout(() => handle(true), this.delay);
        });
      }
      home() {
        this.choices = reorder(this.choices);
        this.index = 0;
        return this.render();
      }
      end() {
        let pos = this.choices.length - this.limit;
        let choices = reorder(this.choices);
        this.choices = choices.slice(pos).concat(choices.slice(0, pos));
        this.index = this.limit - 1;
        return this.render();
      }
      first() {
        this.index = 0;
        return this.render();
      }
      last() {
        this.index = this.visible.length - 1;
        return this.render();
      }
      prev() {
        if (this.visible.length <= 1) return this.alert();
        return this.up();
      }
      next() {
        if (this.visible.length <= 1) return this.alert();
        return this.down();
      }
      right() {
        if (this.cursor >= this.input.length) return this.alert();
        this.cursor++;
        return this.render();
      }
      left() {
        if (this.cursor <= 0) return this.alert();
        this.cursor--;
        return this.render();
      }
      up() {
        let len = this.choices.length;
        let vis = this.visible.length;
        let idx = this.index;
        if (this.options.scroll === false && idx === 0) {
          return this.alert();
        }
        if (len > vis && idx === 0) {
          return this.scrollUp();
        }
        this.index = (idx - 1 % len + len) % len;
        if (this.isDisabled() && !this.allChoicesAreDisabled()) {
          return this.up();
        }
        return this.render();
      }
      down() {
        let len = this.choices.length;
        let vis = this.visible.length;
        let idx = this.index;
        if (this.options.scroll === false && idx === vis - 1) {
          return this.alert();
        }
        if (len > vis && idx === vis - 1) {
          return this.scrollDown();
        }
        this.index = (idx + 1) % len;
        if (this.isDisabled() && !this.allChoicesAreDisabled()) {
          return this.down();
        }
        return this.render();
      }
      scrollUp(i = 0) {
        this.choices = scrollUp(this.choices);
        this.index = i;
        if (this.isDisabled()) {
          return this.up();
        }
        return this.render();
      }
      scrollDown(i = this.visible.length - 1) {
        this.choices = scrollDown(this.choices);
        this.index = i;
        if (this.isDisabled()) {
          return this.down();
        }
        return this.render();
      }
      async shiftUp() {
        if (this.options.sort === true) {
          this.sorting = true;
          this.swap(this.index - 1);
          await this.up();
          this.sorting = false;
          return;
        }
        return this.scrollUp(this.index);
      }
      async shiftDown() {
        if (this.options.sort === true) {
          this.sorting = true;
          this.swap(this.index + 1);
          await this.down();
          this.sorting = false;
          return;
        }
        return this.scrollDown(this.index);
      }
      pageUp() {
        if (this.visible.length <= 1) return this.alert();
        this.limit = Math.max(this.limit - 1, 0);
        this.index = Math.min(this.limit - 1, this.index);
        this._limit = this.limit;
        if (this.isDisabled()) {
          return this.up();
        }
        return this.render();
      }
      pageDown() {
        if (this.visible.length >= this.choices.length) return this.alert();
        this.index = Math.max(0, this.index);
        this.limit = Math.min(this.limit + 1, this.choices.length);
        this._limit = this.limit;
        if (this.isDisabled()) {
          return this.down();
        }
        return this.render();
      }
      swap(pos) {
        swap(this.choices, this.index, pos);
      }
      allChoicesAreDisabled(choices = this.choices) {
        return choices.every((choice) => this.isDisabled(choice));
      }
      isDisabled(choice = this.focused) {
        let keys = ["disabled", "collapsed", "hidden", "completing", "readonly"];
        if (choice && keys.some((key) => choice[key] === true)) {
          return true;
        }
        return choice && choice.role === "heading";
      }
      isEnabled(choice = this.focused) {
        if (Array.isArray(choice)) return choice.every((ch) => this.isEnabled(ch));
        if (choice.choices) {
          let choices = choice.choices.filter((ch) => !this.isDisabled(ch));
          return choice.enabled && choices.every((ch) => this.isEnabled(ch));
        }
        return choice.enabled && !this.isDisabled(choice);
      }
      isChoice(choice, value) {
        return choice.name === value || choice.index === Number(value);
      }
      isSelected(choice) {
        if (Array.isArray(this.initial)) {
          return this.initial.some((value) => this.isChoice(choice, value));
        }
        return this.isChoice(choice, this.initial);
      }
      map(names = [], prop = "value") {
        return [].concat(names || []).reduce((acc, name) => {
          acc[name] = this.find(name, prop);
          return acc;
        }, {});
      }
      filter(value, prop) {
        let isChoice = (ele, i) => [ele.name, i].includes(value);
        let fn = typeof value === "function" ? value : isChoice;
        let choices = this.options.multiple ? this.state._choices : this.choices;
        let result = choices.filter(fn);
        if (prop) {
          return result.map((ch) => ch[prop]);
        }
        return result;
      }
      find(value, prop) {
        if (isObject(value)) return prop ? value[prop] : value;
        let isChoice = (ele, i) => [ele.name, i].includes(value);
        let fn = typeof value === "function" ? value : isChoice;
        let choice = this.choices.find(fn);
        if (choice) {
          return prop ? choice[prop] : choice;
        }
      }
      findIndex(value) {
        return this.choices.indexOf(this.find(value));
      }
      async submit() {
        let choice = this.focused;
        if (!choice) return this.alert();
        if (choice.newChoice) {
          if (!choice.input) return this.alert();
          choice.updateChoice();
          return this.render();
        }
        if (this.choices.some((ch) => ch.newChoice)) {
          return this.alert();
        }
        let { reorder: reorder2, sort } = this.options;
        let multi = this.multiple === true;
        let value = this.selected;
        if (value === void 0) {
          return this.alert();
        }
        if (Array.isArray(value) && reorder2 !== false && sort !== true) {
          value = utils.reorder(value);
        }
        this.value = multi ? value.map((ch) => ch.name) : value.name;
        return super.submit();
      }
      set choices(choices = []) {
        this.state._choices = this.state._choices || [];
        this.state.choices = choices;
        for (let choice of choices) {
          if (!this.state._choices.some((ch) => ch.name === choice.name)) {
            this.state._choices.push(choice);
          }
        }
        if (!this._initial && this.options.initial) {
          this._initial = true;
          let init = this.initial;
          if (typeof init === "string" || typeof init === "number") {
            let choice = this.find(init);
            if (choice) {
              this.initial = choice.index;
              this.focus(choice, true);
            }
          }
        }
      }
      get choices() {
        return reset(this, this.state.choices || []);
      }
      set visible(visible) {
        this.state.visible = visible;
      }
      get visible() {
        return (this.state.visible || this.choices).slice(0, this.limit);
      }
      set limit(num) {
        this.state.limit = num;
      }
      get limit() {
        let { state, options, choices } = this;
        let limit = state.limit || this._limit || options.limit || choices.length;
        return Math.min(limit, this.height);
      }
      set value(value) {
        super.value = value;
      }
      get value() {
        if (typeof super.value !== "string" && super.value === this.initial) {
          return this.input;
        }
        return super.value;
      }
      set index(i) {
        this.state.index = i;
      }
      get index() {
        return Math.max(0, this.state ? this.state.index : 0);
      }
      get enabled() {
        return this.filter(this.isEnabled.bind(this));
      }
      get focused() {
        let choice = this.choices[this.index];
        if (choice && this.state.submitted && this.multiple !== true) {
          choice.enabled = true;
        }
        return choice;
      }
      get selectable() {
        return this.choices.filter((choice) => !this.isDisabled(choice));
      }
      get selected() {
        return this.multiple ? this.enabled : this.focused;
      }
    };
    function reset(prompt, choices) {
      if (choices instanceof Promise) return choices;
      if (typeof choices === "function") {
        if (utils.isAsyncFn(choices)) return choices;
        choices = choices.call(prompt, prompt);
      }
      for (let choice of choices) {
        if (Array.isArray(choice.choices)) {
          let items = choice.choices.filter((ch) => !prompt.isDisabled(ch));
          choice.enabled = items.every((ch) => ch.enabled === true);
        }
        if (prompt.isDisabled(choice) === true) {
          delete choice.enabled;
        }
      }
      return choices;
    }
    module.exports = ArrayPrompt;
  }
});

// node_modules/enquirer/lib/prompts/select.js
var require_select = __commonJS({
  "node_modules/enquirer/lib/prompts/select.js"(exports, module) {
    "use strict";
    var ArrayPrompt = require_array();
    var utils = require_utils();
    var SelectPrompt = class extends ArrayPrompt {
      constructor(options) {
        super(options);
        this.emptyError = this.options.emptyError || "No items were selected";
      }
      async dispatch(s, key) {
        if (this.multiple) {
          return this[key.name] ? await this[key.name](s, key) : await super.dispatch(s, key);
        }
        this.alert();
      }
      separator() {
        if (this.options.separator) return super.separator();
        let sep = this.styles.muted(this.symbols.ellipsis);
        return this.state.submitted ? super.separator() : sep;
      }
      pointer(choice, i) {
        return !this.multiple || this.options.pointer ? super.pointer(choice, i) : "";
      }
      indicator(choice, i) {
        return this.multiple ? super.indicator(choice, i) : "";
      }
      choiceMessage(choice, i) {
        let message = this.resolve(choice.message, this.state, choice, i);
        if (choice.role === "heading" && !utils.hasColor(message)) {
          message = this.styles.strong(message);
        }
        return this.resolve(message, this.state, choice, i);
      }
      choiceSeparator() {
        return ":";
      }
      async renderChoice(choice, i) {
        await this.onChoice(choice, i);
        let focused = this.index === i;
        let pointer = await this.pointer(choice, i);
        let check = await this.indicator(choice, i) + (choice.pad || "");
        let hint = await this.resolve(choice.hint, this.state, choice, i);
        if (hint && !utils.hasColor(hint)) {
          hint = this.styles.muted(hint);
        }
        let ind = this.indent(choice);
        let msg = await this.choiceMessage(choice, i);
        let line = () => [this.margin[3], ind + pointer + check, msg, this.margin[1], hint].filter(Boolean).join(" ");
        if (choice.role === "heading") {
          return line();
        }
        if (choice.disabled) {
          if (!utils.hasColor(msg)) {
            msg = this.styles.disabled(msg);
          }
          return line();
        }
        if (focused) {
          msg = this.styles.em(msg);
        }
        return line();
      }
      async renderChoices() {
        if (this.state.loading === "choices") {
          return this.styles.warning("Loading choices");
        }
        if (this.state.submitted) return "";
        let choices = this.visible.map(async (ch, i) => await this.renderChoice(ch, i));
        let visible = await Promise.all(choices);
        if (!visible.length) visible.push(this.styles.danger("No matching choices"));
        let result = this.margin[0] + visible.join("\n");
        let header;
        if (this.options.choicesHeader) {
          header = await this.resolve(this.options.choicesHeader, this.state);
        }
        return [header, result].filter(Boolean).join("\n");
      }
      format() {
        if (!this.state.submitted || this.state.cancelled) return "";
        if (Array.isArray(this.selected)) {
          return this.selected.map((choice) => this.styles.primary(choice.name)).join(", ");
        }
        return this.styles.primary(this.selected.name);
      }
      async render() {
        let { submitted, size } = this.state;
        let prompt = "";
        let header = await this.header();
        let prefix = await this.prefix();
        let separator = await this.separator();
        let message = await this.message();
        if (this.options.promptLine !== false) {
          prompt = [prefix, message, separator, ""].join(" ");
          this.state.prompt = prompt;
        }
        let output = await this.format();
        let help = await this.error() || await this.hint();
        let body = await this.renderChoices();
        let footer = await this.footer();
        if (output) prompt += output;
        if (help && !prompt.includes(help)) prompt += " " + help;
        if (submitted && !output && !body.trim() && this.multiple && this.emptyError != null) {
          prompt += this.styles.danger(this.emptyError);
        }
        this.clear(size);
        this.write([header, prompt, body, footer].filter(Boolean).join("\n"));
        this.write(this.margin[2]);
        this.restore();
      }
    };
    module.exports = SelectPrompt;
  }
});

// node_modules/enquirer/lib/prompts/autocomplete.js
var require_autocomplete = __commonJS({
  "node_modules/enquirer/lib/prompts/autocomplete.js"(exports, module) {
    "use strict";
    var Select = require_select();
    var highlight = (input, color) => {
      const regex = input ? new RegExp(input, "ig") : /$^/;
      return (str) => {
        return input ? str.replace(regex, (match) => color(match)) : str;
      };
    };
    var AutoComplete = class extends Select {
      constructor(options) {
        super(options);
        this.cursorShow();
      }
      moveCursor(n) {
        this.state.cursor += n;
      }
      dispatch(ch) {
        return this.append(ch);
      }
      space(ch) {
        return this.options.multiple ? super.space(ch) : this.append(ch);
      }
      append(ch) {
        let { cursor, input } = this.state;
        this.input = input.slice(0, cursor) + ch + input.slice(cursor);
        this.moveCursor(1);
        return this.complete();
      }
      delete() {
        let { cursor, input } = this.state;
        if (!input) return this.alert();
        this.input = input.slice(0, cursor - 1) + input.slice(cursor);
        this.moveCursor(-1);
        return this.complete();
      }
      deleteForward() {
        let { cursor, input } = this.state;
        if (input[cursor] === void 0) return this.alert();
        this.input = `${input}`.slice(0, cursor) + `${input}`.slice(cursor + 1);
        return this.complete();
      }
      number(ch) {
        return this.append(ch);
      }
      async complete() {
        this.completing = true;
        this.choices = await this.suggest(this.input, this.state._choices);
        this.state.limit = void 0;
        this.index = Math.min(Math.max(this.visible.length - 1, 0), this.index);
        await this.render();
        this.completing = false;
      }
      suggest(input = this.input, choices = this.state._choices) {
        if (typeof this.options.suggest === "function") {
          return this.options.suggest.call(this, input, choices);
        }
        let str = input.toLowerCase();
        return choices.filter((ch) => ch.message.toLowerCase().includes(str));
      }
      pointer() {
        return "";
      }
      format() {
        if (!this.focused) return this.input;
        if (this.options.multiple && this.state.submitted) {
          return this.selected.map((ch) => this.styles.primary(ch.message)).join(", ");
        }
        if (this.state.submitted) {
          let value = this.value = this.input = this.focused.value;
          return this.styles.primary(value);
        }
        return this.input;
      }
      async render() {
        if (this.state.status !== "pending") return super.render();
        const hl = this.options.highlight || this.styles.complement;
        const style = (input, color2) => {
          if (!input) return input;
          if (hl.stack) return hl(input);
          return hl.call(this, input);
        };
        const color = highlight(this.input, style);
        const choices = this.choices;
        this.choices = choices.map((ch) => ({ ...ch, message: color(ch.message) }));
        await super.render();
        this.choices = choices;
      }
      submit() {
        if (this.options.multiple) {
          this.value = this.selected.map((ch) => ch.name);
        }
        return super.submit();
      }
    };
    module.exports = AutoComplete;
  }
});

// node_modules/enquirer/lib/placeholder.js
var require_placeholder = __commonJS({
  "node_modules/enquirer/lib/placeholder.js"(exports, module) {
    "use strict";
    var utils = require_utils();
    module.exports = (prompt, options = {}) => {
      prompt.cursorHide();
      let { input = "", initial = "", pos, showCursor = true, color } = options;
      let style = color || prompt.styles.placeholder;
      let inverse = utils.inverse(prompt.styles.primary);
      let blinker = (str) => inverse(prompt.styles.black(str));
      let output = input;
      let char = " ";
      let reverse = blinker(char);
      if (prompt.blink && prompt.blink.off === true) {
        blinker = (str) => str;
        reverse = "";
      }
      if (showCursor && pos === 0 && initial === "" && input === "") {
        return blinker(char);
      }
      if (showCursor && pos === 0 && (input === initial || input === "")) {
        return blinker(initial[0]) + style(initial.slice(1));
      }
      initial = utils.isPrimitive(initial) ? `${initial}` : "";
      input = utils.isPrimitive(input) ? `${input}` : "";
      let placeholder = initial && initial.startsWith(input) && initial !== input;
      let cursor = placeholder ? blinker(initial[input.length]) : reverse;
      if (pos !== input.length && showCursor === true) {
        output = input.slice(0, pos) + blinker(input[pos]) + input.slice(pos + 1);
        cursor = "";
      }
      if (showCursor === false) {
        cursor = "";
      }
      if (placeholder) {
        let raw = prompt.styles.unstyle(output + cursor);
        return output + cursor + style(initial.slice(raw.length));
      }
      return output + cursor;
    };
  }
});

// node_modules/enquirer/lib/prompts/form.js
var require_form = __commonJS({
  "node_modules/enquirer/lib/prompts/form.js"(exports, module) {
    "use strict";
    var stripAnsi = require_strip_ansi();
    var SelectPrompt = require_select();
    var placeholder = require_placeholder();
    var FormPrompt = class extends SelectPrompt {
      constructor(options) {
        super({ ...options, multiple: true });
        this.type = "form";
        this.initial = this.options.initial;
        this.align = [this.options.align, "right"].find((v) => v != null);
        this.emptyError = "";
        this.values = {};
      }
      async reset(first) {
        await super.reset();
        if (first === true) this._index = this.index;
        this.index = this._index;
        this.values = {};
        this.choices.forEach((choice) => choice.reset && choice.reset());
        return this.render();
      }
      dispatch(char) {
        return !!char && this.append(char);
      }
      append(char) {
        let choice = this.focused;
        if (!choice) return this.alert();
        let { cursor, input } = choice;
        choice.value = choice.input = input.slice(0, cursor) + char + input.slice(cursor);
        choice.cursor++;
        return this.render();
      }
      delete() {
        let choice = this.focused;
        if (!choice || choice.cursor <= 0) return this.alert();
        let { cursor, input } = choice;
        choice.value = choice.input = input.slice(0, cursor - 1) + input.slice(cursor);
        choice.cursor--;
        return this.render();
      }
      deleteForward() {
        let choice = this.focused;
        if (!choice) return this.alert();
        let { cursor, input } = choice;
        if (input[cursor] === void 0) return this.alert();
        let str = `${input}`.slice(0, cursor) + `${input}`.slice(cursor + 1);
        choice.value = choice.input = str;
        return this.render();
      }
      right() {
        let choice = this.focused;
        if (!choice) return this.alert();
        if (choice.cursor >= choice.input.length) return this.alert();
        choice.cursor++;
        return this.render();
      }
      left() {
        let choice = this.focused;
        if (!choice) return this.alert();
        if (choice.cursor <= 0) return this.alert();
        choice.cursor--;
        return this.render();
      }
      space(ch, key) {
        return this.dispatch(ch, key);
      }
      number(ch, key) {
        return this.dispatch(ch, key);
      }
      next() {
        let ch = this.focused;
        if (!ch) return this.alert();
        let { initial, input } = ch;
        if (initial && initial.startsWith(input) && input !== initial) {
          ch.value = ch.input = initial;
          ch.cursor = ch.value.length;
          return this.render();
        }
        return super.next();
      }
      prev() {
        let ch = this.focused;
        if (!ch) return this.alert();
        if (ch.cursor === 0) return super.prev();
        ch.value = ch.input = "";
        ch.cursor = 0;
        return this.render();
      }
      separator() {
        return "";
      }
      format(value) {
        return !this.state.submitted ? super.format(value) : "";
      }
      pointer() {
        return "";
      }
      indicator(choice) {
        return choice.input ? "\u29BF" : "\u2299";
      }
      async choiceSeparator(choice, i) {
        let sep = await this.resolve(choice.separator, this.state, choice, i) || ":";
        return sep ? " " + this.styles.disabled(sep) : "";
      }
      async renderChoice(choice, i) {
        await this.onChoice(choice, i);
        let { state, styles } = this;
        let { cursor, initial = "", name, input = "" } = choice;
        let { muted, submitted, primary, danger } = styles;
        let focused = this.index === i;
        let validate = choice.validate || (() => true);
        let sep = await this.choiceSeparator(choice, i);
        let msg = choice.message;
        if (this.align === "right") msg = msg.padStart(this.longest + 1, " ");
        if (this.align === "left") msg = msg.padEnd(this.longest + 1, " ");
        let value = this.values[name] = input || initial;
        let color = input ? "success" : "dark";
        if (await validate.call(choice, value, this.state) !== true) {
          color = "danger";
        }
        let style = styles[color];
        let indicator = style(await this.indicator(choice, i)) + (choice.pad || "");
        let indent = this.indent(choice);
        let line = () => [indent, indicator, msg + sep, input].filter(Boolean).join(" ");
        if (state.submitted) {
          msg = stripAnsi(msg);
          input = submitted(input);
          return line();
        }
        if (choice.format) {
          input = await choice.format.call(this, input, choice, i);
        } else {
          let color2 = this.styles.muted;
          let options = { input, initial, pos: cursor, showCursor: focused, color: color2 };
          input = placeholder(this, options);
        }
        if (!this.isValue(input)) {
          input = this.styles.muted(this.symbols.ellipsis);
        }
        if (choice.result) {
          this.values[name] = await choice.result.call(this, value, choice, i);
        }
        if (focused) {
          msg = primary(msg);
        }
        if (choice.error) {
          input += (input ? " " : "") + danger(choice.error.trim());
        } else if (choice.hint) {
          input += (input ? " " : "") + muted(choice.hint.trim());
        }
        return line();
      }
      async submit() {
        this.value = this.values;
        return super.base.submit.call(this);
      }
    };
    module.exports = FormPrompt;
  }
});

// node_modules/enquirer/lib/types/auth.js
var require_auth = __commonJS({
  "node_modules/enquirer/lib/types/auth.js"(exports, module) {
    "use strict";
    var FormPrompt = require_form();
    var defaultAuthenticate = () => {
      throw new Error("expected prompt to have a custom authenticate method");
    };
    var factory = (authenticate = defaultAuthenticate) => {
      class AuthPrompt extends FormPrompt {
        constructor(options) {
          super(options);
        }
        async submit() {
          this.value = await authenticate.call(this, this.values, this.state);
          super.base.submit.call(this);
        }
        static create(authenticate2) {
          return factory(authenticate2);
        }
      }
      return AuthPrompt;
    };
    module.exports = factory();
  }
});

// node_modules/enquirer/lib/prompts/basicauth.js
var require_basicauth = __commonJS({
  "node_modules/enquirer/lib/prompts/basicauth.js"(exports, module) {
    "use strict";
    var AuthPrompt = require_auth();
    function defaultAuthenticate(value, state) {
      if (value.username === this.options.username && value.password === this.options.password) {
        return true;
      }
      return false;
    }
    var factory = (authenticate = defaultAuthenticate) => {
      const choices = [
        { name: "username", message: "username" },
        {
          name: "password",
          message: "password",
          format(input) {
            if (this.options.showPassword) {
              return input;
            }
            let color = this.state.submitted ? this.styles.primary : this.styles.muted;
            return color(this.symbols.asterisk.repeat(input.length));
          }
        }
      ];
      class BasicAuthPrompt extends AuthPrompt.create(authenticate) {
        constructor(options) {
          super({ ...options, choices });
        }
        static create(authenticate2) {
          return factory(authenticate2);
        }
      }
      return BasicAuthPrompt;
    };
    module.exports = factory();
  }
});

// node_modules/enquirer/lib/types/boolean.js
var require_boolean = __commonJS({
  "node_modules/enquirer/lib/types/boolean.js"(exports, module) {
    "use strict";
    var Prompt = require_prompt();
    var { isPrimitive, hasColor } = require_utils();
    var BooleanPrompt = class extends Prompt {
      constructor(options) {
        super(options);
        this.cursorHide();
      }
      async initialize() {
        let initial = await this.resolve(this.initial, this.state);
        this.input = await this.cast(initial);
        await super.initialize();
      }
      dispatch(ch) {
        if (!this.isValue(ch)) return this.alert();
        this.input = ch;
        return this.submit();
      }
      format(value) {
        let { styles, state } = this;
        return !state.submitted ? styles.primary(value) : styles.success(value);
      }
      cast(input) {
        return this.isTrue(input);
      }
      isTrue(input) {
        return /^[ty1]/i.test(input);
      }
      isFalse(input) {
        return /^[fn0]/i.test(input);
      }
      isValue(value) {
        return isPrimitive(value) && (this.isTrue(value) || this.isFalse(value));
      }
      async hint() {
        if (this.state.status === "pending") {
          let hint = await this.element("hint");
          if (!hasColor(hint)) {
            return this.styles.muted(hint);
          }
          return hint;
        }
      }
      async render() {
        let { input, size } = this.state;
        let prefix = await this.prefix();
        let sep = await this.separator();
        let msg = await this.message();
        let hint = this.styles.muted(this.default);
        let promptLine = [prefix, msg, hint, sep].filter(Boolean).join(" ");
        this.state.prompt = promptLine;
        let header = await this.header();
        let value = this.value = this.cast(input);
        let output = await this.format(value);
        let help = await this.error() || await this.hint();
        let footer = await this.footer();
        if (help && !promptLine.includes(help)) output += " " + help;
        promptLine += " " + output;
        this.clear(size);
        this.write([header, promptLine, footer].filter(Boolean).join("\n"));
        this.restore();
      }
      set value(value) {
        super.value = value;
      }
      get value() {
        return this.cast(super.value);
      }
    };
    module.exports = BooleanPrompt;
  }
});

// node_modules/enquirer/lib/prompts/confirm.js
var require_confirm = __commonJS({
  "node_modules/enquirer/lib/prompts/confirm.js"(exports, module) {
    "use strict";
    var BooleanPrompt = require_boolean();
    var ConfirmPrompt = class extends BooleanPrompt {
      constructor(options) {
        super(options);
        this.default = this.options.default || (this.initial ? "(Y/n)" : "(y/N)");
      }
    };
    module.exports = ConfirmPrompt;
  }
});

// node_modules/enquirer/lib/prompts/editable.js
var require_editable = __commonJS({
  "node_modules/enquirer/lib/prompts/editable.js"(exports, module) {
    "use strict";
    var Select = require_select();
    var Form = require_form();
    var form = Form.prototype;
    var Editable = class extends Select {
      constructor(options) {
        super({ ...options, multiple: true });
        this.align = [this.options.align, "left"].find((v) => v != null);
        this.emptyError = "";
        this.values = {};
      }
      dispatch(char, key) {
        let choice = this.focused;
        let parent = choice.parent || {};
        if (!choice.editable && !parent.editable) {
          if (char === "a" || char === "i") return super[char]();
        }
        return form.dispatch.call(this, char, key);
      }
      append(char, key) {
        return form.append.call(this, char, key);
      }
      delete(char, key) {
        return form.delete.call(this, char, key);
      }
      space(char) {
        return this.focused.editable ? this.append(char) : super.space();
      }
      number(char) {
        return this.focused.editable ? this.append(char) : super.number(char);
      }
      next() {
        return this.focused.editable ? form.next.call(this) : super.next();
      }
      prev() {
        return this.focused.editable ? form.prev.call(this) : super.prev();
      }
      async indicator(choice, i) {
        let symbol = choice.indicator || "";
        let value = choice.editable ? symbol : super.indicator(choice, i);
        return await this.resolve(value, this.state, choice, i) || "";
      }
      indent(choice) {
        return choice.role === "heading" ? "" : choice.editable ? " " : "  ";
      }
      async renderChoice(choice, i) {
        choice.indent = "";
        if (choice.editable) return form.renderChoice.call(this, choice, i);
        return super.renderChoice(choice, i);
      }
      error() {
        return "";
      }
      footer() {
        return this.state.error;
      }
      async validate() {
        let result = true;
        for (let choice of this.choices) {
          if (typeof choice.validate !== "function") {
            continue;
          }
          if (choice.role === "heading") {
            continue;
          }
          let val = choice.parent ? this.value[choice.parent.name] : this.value;
          if (choice.editable) {
            val = choice.value === choice.name ? choice.initial || "" : choice.value;
          } else if (!this.isDisabled(choice)) {
            val = choice.enabled === true;
          }
          result = await choice.validate(val, this.state);
          if (result !== true) {
            break;
          }
        }
        if (result !== true) {
          this.state.error = typeof result === "string" ? result : "Invalid Input";
        }
        return result;
      }
      submit() {
        if (this.focused.newChoice === true) return super.submit();
        if (this.choices.some((ch) => ch.newChoice)) {
          return this.alert();
        }
        this.value = {};
        for (let choice of this.choices) {
          let val = choice.parent ? this.value[choice.parent.name] : this.value;
          if (choice.role === "heading") {
            this.value[choice.name] = {};
            continue;
          }
          if (choice.editable) {
            val[choice.name] = choice.value === choice.name ? choice.initial || "" : choice.value;
          } else if (!this.isDisabled(choice)) {
            val[choice.name] = choice.enabled === true;
          }
        }
        return this.base.submit.call(this);
      }
    };
    module.exports = Editable;
  }
});

// node_modules/enquirer/lib/types/string.js
var require_string = __commonJS({
  "node_modules/enquirer/lib/types/string.js"(exports, module) {
    "use strict";
    var Prompt = require_prompt();
    var keypress = require_keypress();
    var placeholder = require_placeholder();
    var { isPrimitive } = require_utils();
    var StringPrompt = class extends Prompt {
      constructor(options) {
        super(options);
        this.initial = isPrimitive(this.initial) ? String(this.initial) : "";
        if (this.initial) this.cursorHide();
        this.state.prevCursor = 0;
        this.state.clipboard = [];
        this.keypressTimeout = this.options.keypressTimeout !== void 0 ? this.options.keypressTimeout : null;
      }
      async keypress(input, key = input ? keypress(input, {}) : {}) {
        const now = Date.now();
        const elapsed = now - this.lastKeypress;
        this.lastKeypress = now;
        const isEnterKey = key.name === "return" || key.name === "enter";
        let prev = this.state.prevKeypress;
        let append;
        this.state.prevKeypress = key;
        if (this.keypressTimeout != null && isEnterKey) {
          if (elapsed < this.keypressTimeout) {
            return this.submit();
          }
          this.state.multilineBuffer = this.state.multilineBuffer || "";
          this.state.multilineBuffer += input;
          append = true;
          prev = null;
        }
        if (append || this.options.multiline && isEnterKey) {
          if (!prev || prev.name !== "return") {
            return this.append("\n", key);
          }
        }
        return super.keypress(input, key);
      }
      moveCursor(n) {
        this.cursor += n;
      }
      reset() {
        this.input = this.value = "";
        this.cursor = 0;
        return this.render();
      }
      dispatch(ch, key) {
        if (!ch || key.ctrl || key.code) return this.alert();
        this.append(ch);
      }
      append(ch) {
        let { cursor, input } = this.state;
        this.input = `${input}`.slice(0, cursor) + ch + `${input}`.slice(cursor);
        this.moveCursor(String(ch).length);
        this.render();
      }
      insert(str) {
        this.append(str);
      }
      delete() {
        let { cursor, input } = this.state;
        if (cursor <= 0) return this.alert();
        this.input = `${input}`.slice(0, cursor - 1) + `${input}`.slice(cursor);
        this.moveCursor(-1);
        this.render();
      }
      deleteForward() {
        let { cursor, input } = this.state;
        if (input[cursor] === void 0) return this.alert();
        this.input = `${input}`.slice(0, cursor) + `${input}`.slice(cursor + 1);
        this.render();
      }
      cutForward() {
        let pos = this.cursor;
        if (this.input.length <= pos) return this.alert();
        this.state.clipboard.push(this.input.slice(pos));
        this.input = this.input.slice(0, pos);
        this.render();
      }
      cutLeft() {
        let pos = this.cursor;
        if (pos === 0) return this.alert();
        let before = this.input.slice(0, pos);
        let after = this.input.slice(pos);
        let words = before.split(" ");
        this.state.clipboard.push(words.pop());
        this.input = words.join(" ");
        this.cursor = this.input.length;
        this.input += after;
        this.render();
      }
      paste() {
        if (!this.state.clipboard.length) return this.alert();
        this.insert(this.state.clipboard.pop());
        this.render();
      }
      toggleCursor() {
        if (this.state.prevCursor) {
          this.cursor = this.state.prevCursor;
          this.state.prevCursor = 0;
        } else {
          this.state.prevCursor = this.cursor;
          this.cursor = 0;
        }
        this.render();
      }
      first() {
        this.cursor = 0;
        this.render();
      }
      last() {
        this.cursor = this.input.length - 1;
        this.render();
      }
      next() {
        let init = this.initial != null ? String(this.initial) : "";
        if (!init || !init.startsWith(this.input)) return this.alert();
        this.input = this.initial;
        this.cursor = this.initial.length;
        this.render();
      }
      prev() {
        if (!this.input) return this.alert();
        this.reset();
      }
      backward() {
        return this.left();
      }
      forward() {
        return this.right();
      }
      right() {
        if (this.cursor >= this.input.length) return this.alert();
        this.moveCursor(1);
        return this.render();
      }
      left() {
        if (this.cursor <= 0) return this.alert();
        this.moveCursor(-1);
        return this.render();
      }
      isValue(value) {
        return !!value;
      }
      async format(input = this.value) {
        let initial = await this.resolve(this.initial, this.state);
        if (!this.state.submitted) {
          return placeholder(this, { input, initial, pos: this.cursor });
        }
        return this.styles.submitted(input || initial);
      }
      async render() {
        let size = this.state.size;
        let prefix = await this.prefix();
        let separator = await this.separator();
        let message = await this.message();
        let prompt = [prefix, message, separator].filter(Boolean).join(" ");
        this.state.prompt = prompt;
        let header = await this.header();
        let output = await this.format();
        let help = await this.error() || await this.hint();
        let footer = await this.footer();
        if (help && !output.includes(help)) output += " " + help;
        prompt += " " + output;
        this.clear(size);
        this.write([header, prompt, footer].filter(Boolean).join("\n"));
        this.restore();
      }
    };
    module.exports = StringPrompt;
  }
});

// node_modules/enquirer/lib/completer.js
var require_completer = __commonJS({
  "node_modules/enquirer/lib/completer.js"(exports, module) {
    "use strict";
    var unique = (arr) => arr.filter((v, i) => arr.lastIndexOf(v) === i);
    var compact = (arr) => unique(arr).filter(Boolean);
    module.exports = (action, data = {}, value = "") => {
      let { past = [], present = "" } = data;
      let rest, prev;
      switch (action) {
        case "prev":
        case "undo":
          rest = past.slice(0, past.length - 1);
          prev = past[past.length - 1] || "";
          return {
            past: compact([value, ...rest]),
            present: prev
          };
        case "next":
        case "redo":
          rest = past.slice(1);
          prev = past[0] || "";
          return {
            past: compact([...rest, value]),
            present: prev
          };
        case "save":
          return {
            past: compact([...past, value]),
            present: ""
          };
        case "remove":
          prev = compact(past.filter((v) => v !== value));
          present = "";
          if (prev.length) {
            present = prev.pop();
          }
          return {
            past: prev,
            present
          };
        default: {
          throw new Error(`Invalid action: "${action}"`);
        }
      }
    };
  }
});

// node_modules/enquirer/lib/prompts/input.js
var require_input = __commonJS({
  "node_modules/enquirer/lib/prompts/input.js"(exports, module) {
    "use strict";
    var Prompt = require_string();
    var completer = require_completer();
    var Input = class extends Prompt {
      constructor(options) {
        super(options);
        let history = this.options.history;
        if (history && history.store) {
          let initial = history.values || this.initial;
          this.autosave = !!history.autosave;
          this.store = history.store;
          this.data = this.store.get("values") || { past: [], present: initial };
          this.initial = this.data.present || this.data.past[this.data.past.length - 1];
        }
      }
      completion(action) {
        if (!this.store) return this.alert();
        this.data = completer(action, this.data, this.input);
        if (!this.data.present) return this.alert();
        this.input = this.data.present;
        this.cursor = this.input.length;
        return this.render();
      }
      altUp() {
        return this.completion("prev");
      }
      altDown() {
        return this.completion("next");
      }
      prev() {
        this.save();
        return super.prev();
      }
      save() {
        if (!this.store) return;
        this.data = completer("save", this.data, this.input);
        this.store.set("values", this.data);
      }
      submit() {
        if (this.store && this.autosave === true) {
          this.save();
        }
        return super.submit();
      }
    };
    module.exports = Input;
  }
});

// node_modules/enquirer/lib/prompts/invisible.js
var require_invisible = __commonJS({
  "node_modules/enquirer/lib/prompts/invisible.js"(exports, module) {
    "use strict";
    var StringPrompt = require_string();
    var InvisiblePrompt = class extends StringPrompt {
      format() {
        return "";
      }
    };
    module.exports = InvisiblePrompt;
  }
});

// node_modules/enquirer/lib/prompts/list.js
var require_list = __commonJS({
  "node_modules/enquirer/lib/prompts/list.js"(exports, module) {
    "use strict";
    var StringPrompt = require_string();
    var ListPrompt = class extends StringPrompt {
      constructor(options = {}) {
        super(options);
        this.sep = this.options.separator || /, */;
        this.initial = options.initial || "";
      }
      split(input = this.value) {
        return input ? String(input).split(this.sep) : [];
      }
      format() {
        let style = this.state.submitted ? this.styles.primary : (val) => val;
        return this.list.map(style).join(", ");
      }
      async submit(value) {
        let result = this.state.error || await this.validate(this.list, this.state);
        if (result !== true) {
          this.state.error = result;
          return super.submit();
        }
        this.value = this.list;
        return super.submit();
      }
      get list() {
        return this.split();
      }
    };
    module.exports = ListPrompt;
  }
});

// node_modules/enquirer/lib/prompts/multiselect.js
var require_multiselect = __commonJS({
  "node_modules/enquirer/lib/prompts/multiselect.js"(exports, module) {
    "use strict";
    var Select = require_select();
    var MultiSelect = class extends Select {
      constructor(options) {
        super({ ...options, multiple: true });
      }
    };
    module.exports = MultiSelect;
  }
});

// node_modules/enquirer/lib/types/number.js
var require_number = __commonJS({
  "node_modules/enquirer/lib/types/number.js"(exports, module) {
    "use strict";
    var StringPrompt = require_string();
    var NumberPrompt = class extends StringPrompt {
      constructor(options = {}) {
        super({ style: "number", ...options });
        this.min = this.isValue(options.min) ? this.toNumber(options.min) : -Infinity;
        this.max = this.isValue(options.max) ? this.toNumber(options.max) : Infinity;
        this.delay = options.delay != null ? options.delay : 1e3;
        this.float = options.float !== false;
        this.round = options.round === true || options.float === false;
        this.major = options.major || 10;
        this.minor = options.minor || 1;
        this.initial = options.initial != null ? options.initial : "";
        this.input = String(this.initial);
        this.cursor = this.input.length;
        this.cursorShow();
      }
      append(ch) {
        if (!/[-+.]/.test(ch) || ch === "." && this.input.includes(".")) {
          return this.alert("invalid number");
        }
        return super.append(ch);
      }
      number(ch) {
        return super.append(ch);
      }
      next() {
        if (this.input && this.input !== this.initial) return this.alert();
        if (!this.isValue(this.initial)) return this.alert();
        this.input = this.initial;
        this.cursor = String(this.initial).length;
        return this.render();
      }
      up(number) {
        let step = number || this.minor;
        let num = this.toNumber(this.input);
        if (num > this.max + step) return this.alert();
        this.input = `${num + step}`;
        return this.render();
      }
      down(number) {
        let step = number || this.minor;
        let num = this.toNumber(this.input);
        if (num < this.min - step) return this.alert();
        this.input = `${num - step}`;
        return this.render();
      }
      shiftDown() {
        return this.down(this.major);
      }
      shiftUp() {
        return this.up(this.major);
      }
      format(input = this.input) {
        if (typeof this.options.format === "function") {
          return this.options.format.call(this, input);
        }
        return this.styles.info(input);
      }
      toNumber(value = "") {
        return this.float ? +value : Math.round(+value);
      }
      isValue(value) {
        return /^[-+]?[0-9]+((\.)|(\.[0-9]+))?$/.test(value);
      }
      submit() {
        let value = [this.input, this.initial].find((v) => this.isValue(v));
        this.value = this.toNumber(value || 0);
        return super.submit();
      }
    };
    module.exports = NumberPrompt;
  }
});

// node_modules/enquirer/lib/prompts/numeral.js
var require_numeral = __commonJS({
  "node_modules/enquirer/lib/prompts/numeral.js"(exports, module) {
    module.exports = require_number();
  }
});

// node_modules/enquirer/lib/prompts/password.js
var require_password = __commonJS({
  "node_modules/enquirer/lib/prompts/password.js"(exports, module) {
    "use strict";
    var StringPrompt = require_string();
    var PasswordPrompt = class extends StringPrompt {
      constructor(options) {
        super(options);
        this.cursorShow();
      }
      format(input = this.input) {
        if (!this.keypressed) return "";
        let color = this.state.submitted ? this.styles.primary : this.styles.muted;
        return color(this.symbols.asterisk.repeat(input.length));
      }
    };
    module.exports = PasswordPrompt;
  }
});

// node_modules/enquirer/lib/prompts/scale.js
var require_scale = __commonJS({
  "node_modules/enquirer/lib/prompts/scale.js"(exports, module) {
    "use strict";
    var stripAnsi = require_strip_ansi();
    var ArrayPrompt = require_array();
    var utils = require_utils();
    var LikertScale = class extends ArrayPrompt {
      constructor(options = {}) {
        super(options);
        this.widths = [].concat(options.messageWidth || 50);
        this.align = [].concat(options.align || "left");
        this.linebreak = options.linebreak || false;
        this.edgeLength = options.edgeLength || 3;
        this.newline = options.newline || "\n   ";
        let start = options.startNumber || 1;
        if (typeof this.scale === "number") {
          this.scaleKey = false;
          this.scale = Array(this.scale).fill(0).map((v, i) => ({ name: i + start }));
        }
      }
      async reset() {
        this.tableized = false;
        await super.reset();
        return this.render();
      }
      tableize() {
        if (this.tableized === true) return;
        this.tableized = true;
        let longest = 0;
        for (let ch of this.choices) {
          longest = Math.max(longest, ch.message.length);
          ch.scaleIndex = ch.initial || 2;
          ch.scale = [];
          for (let i = 0; i < this.scale.length; i++) {
            ch.scale.push({ index: i });
          }
        }
        this.widths[0] = Math.min(this.widths[0], longest + 3);
      }
      async dispatch(s, key) {
        if (this.multiple) {
          return this[key.name] ? await this[key.name](s, key) : await super.dispatch(s, key);
        }
        this.alert();
      }
      heading(msg, item, i) {
        return this.styles.strong(msg);
      }
      separator() {
        return this.styles.muted(this.symbols.ellipsis);
      }
      right() {
        let choice = this.focused;
        if (choice.scaleIndex >= this.scale.length - 1) return this.alert();
        choice.scaleIndex++;
        return this.render();
      }
      left() {
        let choice = this.focused;
        if (choice.scaleIndex <= 0) return this.alert();
        choice.scaleIndex--;
        return this.render();
      }
      indent() {
        return "";
      }
      format() {
        if (this.state.submitted) {
          let values = this.choices.map((ch) => this.styles.info(ch.index));
          return values.join(", ");
        }
        return "";
      }
      pointer() {
        return "";
      }
      /**
       * Render the scale "Key". Something like:
       * @return {String}
       */
      renderScaleKey() {
        if (this.scaleKey === false) return "";
        if (this.state.submitted) return "";
        let scale = this.scale.map((item) => `   ${item.name} - ${item.message}`);
        let key = ["", ...scale].map((item) => this.styles.muted(item));
        return key.join("\n");
      }
      /**
       * Render the heading row for the scale.
       * @return {String}
       */
      renderScaleHeading(max) {
        let keys = this.scale.map((ele) => ele.name);
        if (typeof this.options.renderScaleHeading === "function") {
          keys = this.options.renderScaleHeading.call(this, max);
        }
        let diff = this.scaleLength - keys.join("").length;
        let spacing = Math.round(diff / (keys.length - 1));
        let names = keys.map((key) => this.styles.strong(key));
        let headings = names.join(" ".repeat(spacing));
        let padding = " ".repeat(this.widths[0]);
        return this.margin[3] + padding + this.margin[1] + headings;
      }
      /**
       * Render a scale indicator => ◯ or ◉ by default
       */
      scaleIndicator(choice, item, i) {
        if (typeof this.options.scaleIndicator === "function") {
          return this.options.scaleIndicator.call(this, choice, item, i);
        }
        let enabled = choice.scaleIndex === item.index;
        if (item.disabled) return this.styles.hint(this.symbols.radio.disabled);
        if (enabled) return this.styles.success(this.symbols.radio.on);
        return this.symbols.radio.off;
      }
      /**
       * Render the actual scale => ◯────◯────◉────◯────◯
       */
      renderScale(choice, i) {
        let scale = choice.scale.map((item) => this.scaleIndicator(choice, item, i));
        let padding = this.term === "Hyper" ? "" : " ";
        return scale.join(padding + this.symbols.line.repeat(this.edgeLength));
      }
      /**
       * Render a choice, including scale =>
       *   "The website is easy to navigate. ◯───◯───◉───◯───◯"
       */
      async renderChoice(choice, i) {
        await this.onChoice(choice, i);
        let focused = this.index === i;
        let pointer = await this.pointer(choice, i);
        let hint = await choice.hint;
        if (hint && !utils.hasColor(hint)) {
          hint = this.styles.muted(hint);
        }
        let pad = (str) => this.margin[3] + str.replace(/\s+$/, "").padEnd(this.widths[0], " ");
        let newline = this.newline;
        let ind = this.indent(choice);
        let message = await this.resolve(choice.message, this.state, choice, i);
        let scale = await this.renderScale(choice, i);
        let margin = this.margin[1] + this.margin[3];
        this.scaleLength = stripAnsi(scale).length;
        this.widths[0] = Math.min(this.widths[0], this.width - this.scaleLength - margin.length);
        let msg = utils.wordWrap(message, { width: this.widths[0], newline });
        let lines = msg.split("\n").map((line) => pad(line) + this.margin[1]);
        if (focused) {
          scale = this.styles.info(scale);
          lines = lines.map((line) => this.styles.info(line));
        }
        lines[0] += scale;
        if (this.linebreak) lines.push("");
        return [ind + pointer, lines.join("\n")].filter(Boolean);
      }
      async renderChoices() {
        if (this.state.submitted) return "";
        this.tableize();
        let choices = this.visible.map(async (ch, i) => await this.renderChoice(ch, i));
        let visible = await Promise.all(choices);
        let heading = await this.renderScaleHeading();
        return this.margin[0] + [heading, ...visible.map((v) => v.join(" "))].join("\n");
      }
      async render() {
        let { submitted, size } = this.state;
        let prefix = await this.prefix();
        let separator = await this.separator();
        let message = await this.message();
        let prompt = "";
        if (this.options.promptLine !== false) {
          prompt = [prefix, message, separator, ""].join(" ");
          this.state.prompt = prompt;
        }
        let header = await this.header();
        let output = await this.format();
        let key = await this.renderScaleKey();
        let help = await this.error() || await this.hint();
        let body = await this.renderChoices();
        let footer = await this.footer();
        let err = this.emptyError;
        if (output) prompt += output;
        if (help && !prompt.includes(help)) prompt += " " + help;
        if (submitted && !output && !body.trim() && this.multiple && err != null) {
          prompt += this.styles.danger(err);
        }
        this.clear(size);
        this.write([header, prompt, key, body, footer].filter(Boolean).join("\n"));
        if (!this.state.submitted) {
          this.write(this.margin[2]);
        }
        this.restore();
      }
      submit() {
        this.value = {};
        for (let choice of this.choices) {
          this.value[choice.name] = choice.scaleIndex;
        }
        return this.base.submit.call(this);
      }
    };
    module.exports = LikertScale;
  }
});

// node_modules/enquirer/lib/interpolate.js
var require_interpolate = __commonJS({
  "node_modules/enquirer/lib/interpolate.js"(exports, module) {
    "use strict";
    var stripAnsi = require_strip_ansi();
    var clean = (str = "") => {
      return typeof str === "string" ? str.replace(/^['"]|['"]$/g, "") : "";
    };
    var Item = class {
      constructor(token) {
        this.name = token.key;
        this.field = token.field || {};
        this.value = clean(token.initial || this.field.initial || "");
        this.message = token.message || this.name;
        this.cursor = 0;
        this.input = "";
        this.lines = [];
      }
    };
    var tokenize = async (options = {}, defaults = {}, fn = (token) => token) => {
      let unique = /* @__PURE__ */ new Set();
      let fields = options.fields || [];
      let input = options.template;
      let tabstops = [];
      let items = [];
      let keys = [];
      let line = 1;
      if (typeof input === "function") {
        input = await input();
      }
      let i = -1;
      let next = () => input[++i];
      let peek = () => input[i + 1];
      let push = (token) => {
        token.line = line;
        tabstops.push(token);
      };
      push({ type: "bos", value: "" });
      while (i < input.length - 1) {
        let value = next();
        if (/^[^\S\n ]$/.test(value)) {
          push({ type: "text", value });
          continue;
        }
        if (value === "\n") {
          push({ type: "newline", value });
          line++;
          continue;
        }
        if (value === "\\") {
          value += next();
          push({ type: "text", value });
          continue;
        }
        if ((value === "$" || value === "#" || value === "{") && peek() === "{") {
          let n = next();
          value += n;
          let token = { type: "template", open: value, inner: "", close: "", value };
          let ch;
          while (ch = next()) {
            if (ch === "}") {
              if (peek() === "}") ch += next();
              token.value += ch;
              token.close = ch;
              break;
            }
            if (ch === ":") {
              token.initial = "";
              token.key = token.inner;
            } else if (token.initial !== void 0) {
              token.initial += ch;
            }
            token.value += ch;
            token.inner += ch;
          }
          token.template = token.open + (token.initial || token.inner) + token.close;
          token.key = token.key || token.inner;
          if (hasOwnProperty.call(defaults, token.key)) {
            token.initial = defaults[token.key];
          }
          token = fn(token);
          push(token);
          keys.push(token.key);
          unique.add(token.key);
          let item = items.find((item2) => item2.name === token.key);
          token.field = fields.find((ch2) => ch2.name === token.key);
          if (!item) {
            item = new Item(token);
            items.push(item);
          }
          item.lines.push(token.line - 1);
          continue;
        }
        let last = tabstops[tabstops.length - 1];
        if (last.type === "text" && last.line === line) {
          last.value += value;
        } else {
          push({ type: "text", value });
        }
      }
      push({ type: "eos", value: "" });
      return { input, tabstops, unique, keys, items };
    };
    module.exports = async (prompt) => {
      let options = prompt.options;
      let required = new Set(options.required === true ? [] : options.required || []);
      let defaults = { ...options.values, ...options.initial };
      let { tabstops, items, keys } = await tokenize(options, defaults);
      let result = createFn("result", prompt, options);
      let format2 = createFn("format", prompt, options);
      let isValid = createFn("validate", prompt, options, true);
      let isVal = prompt.isValue.bind(prompt);
      return async (state = {}, submitted = false) => {
        let index = 0;
        state.required = required;
        state.items = items;
        state.keys = keys;
        state.output = "";
        let validate = async (value, state2, item, index2) => {
          let error = await isValid(value, state2, item, index2);
          if (error === false) {
            return "Invalid field " + item.name;
          }
          return error;
        };
        for (let token of tabstops) {
          let value = token.value;
          let key = token.key;
          if (token.type !== "template") {
            if (value) state.output += value;
            continue;
          }
          if (token.type === "template") {
            let item = items.find((ch) => ch.name === key);
            if (options.required === true) {
              state.required.add(item.name);
            }
            let val = [item.input, state.values[item.value], item.value, value].find(isVal);
            let field = item.field || {};
            let message = field.message || token.inner;
            if (submitted) {
              let error = await validate(state.values[key], state, item, index);
              if (error && typeof error === "string" || error === false) {
                state.invalid.set(key, error);
                continue;
              }
              state.invalid.delete(key);
              let res = await result(state.values[key], state, item, index);
              state.output += stripAnsi(res);
              continue;
            }
            item.placeholder = false;
            let before = value;
            value = await format2(value, state, item, index);
            if (val !== value) {
              state.values[key] = val;
              value = prompt.styles.typing(val);
              state.missing.delete(message);
            } else {
              state.values[key] = void 0;
              val = `<${message}>`;
              value = prompt.styles.primary(val);
              item.placeholder = true;
              if (state.required.has(key)) {
                state.missing.add(message);
              }
            }
            if (state.missing.has(message) && state.validating) {
              value = prompt.styles.warning(val);
            }
            if (state.invalid.has(key) && state.validating) {
              value = prompt.styles.danger(val);
            }
            if (index === state.index) {
              if (before !== value) {
                value = prompt.styles.underline(value);
              } else {
                value = prompt.styles.heading(stripAnsi(value));
              }
            }
            index++;
          }
          if (value) {
            state.output += value;
          }
        }
        let lines = state.output.split("\n").map((l) => " " + l);
        let len = items.length;
        let done = 0;
        for (let item of items) {
          if (state.invalid.has(item.name)) {
            item.lines.forEach((i) => {
              if (lines[i][0] !== " ") return;
              lines[i] = state.styles.danger(state.symbols.bullet) + lines[i].slice(1);
            });
          }
          if (prompt.isValue(state.values[item.name])) {
            done++;
          }
        }
        state.completed = (done / len * 100).toFixed(0);
        state.output = lines.join("\n");
        return state.output;
      };
    };
    function createFn(prop, prompt, options, fallback) {
      return (value, state, item, index) => {
        if (typeof item.field[prop] === "function") {
          return item.field[prop].call(prompt, value, state, item, index);
        }
        return [fallback, value].find((v) => prompt.isValue(v));
      };
    }
  }
});

// node_modules/enquirer/lib/prompts/snippet.js
var require_snippet = __commonJS({
  "node_modules/enquirer/lib/prompts/snippet.js"(exports, module) {
    "use strict";
    var stripAnsi = require_strip_ansi();
    var interpolate = require_interpolate();
    var Prompt = require_prompt();
    var SnippetPrompt = class extends Prompt {
      constructor(options) {
        super(options);
        this.cursorHide();
        this.reset(true);
      }
      async initialize() {
        this.interpolate = await interpolate(this);
        await super.initialize();
      }
      async reset(first) {
        this.state.keys = [];
        this.state.invalid = /* @__PURE__ */ new Map();
        this.state.missing = /* @__PURE__ */ new Set();
        this.state.completed = 0;
        this.state.values = {};
        if (first !== true) {
          await this.initialize();
          await this.render();
        }
      }
      moveCursor(n) {
        let item = this.getItem();
        this.cursor += n;
        item.cursor += n;
      }
      dispatch(ch, key) {
        if (!key.code && !key.ctrl && ch != null && this.getItem()) {
          this.append(ch, key);
          return;
        }
        this.alert();
      }
      append(ch, key) {
        let item = this.getItem();
        let prefix = item.input.slice(0, this.cursor);
        let suffix = item.input.slice(this.cursor);
        this.input = item.input = `${prefix}${ch}${suffix}`;
        this.moveCursor(1);
        this.render();
      }
      delete() {
        let item = this.getItem();
        if (this.cursor <= 0 || !item.input) return this.alert();
        let suffix = item.input.slice(this.cursor);
        let prefix = item.input.slice(0, this.cursor - 1);
        this.input = item.input = `${prefix}${suffix}`;
        this.moveCursor(-1);
        this.render();
      }
      increment(i) {
        return i >= this.state.keys.length - 1 ? 0 : i + 1;
      }
      decrement(i) {
        return i <= 0 ? this.state.keys.length - 1 : i - 1;
      }
      first() {
        this.state.index = 0;
        this.render();
      }
      last() {
        this.state.index = this.state.keys.length - 1;
        this.render();
      }
      right() {
        if (this.cursor >= this.input.length) return this.alert();
        this.moveCursor(1);
        this.render();
      }
      left() {
        if (this.cursor <= 0) return this.alert();
        this.moveCursor(-1);
        this.render();
      }
      prev() {
        this.state.index = this.decrement(this.state.index);
        this.getItem();
        this.render();
      }
      next() {
        this.state.index = this.increment(this.state.index);
        this.getItem();
        this.render();
      }
      up() {
        this.prev();
      }
      down() {
        this.next();
      }
      format(value) {
        let color = this.state.completed < 100 ? this.styles.warning : this.styles.success;
        if (this.state.submitted === true && this.state.completed !== 100) {
          color = this.styles.danger;
        }
        return color(`${this.state.completed}% completed`);
      }
      async render() {
        let { index, keys = [], submitted, size } = this.state;
        let newline = [this.options.newline, "\n"].find((v) => v != null);
        let prefix = await this.prefix();
        let separator = await this.separator();
        let message = await this.message();
        let prompt = [prefix, message, separator].filter(Boolean).join(" ");
        this.state.prompt = prompt;
        let header = await this.header();
        let error = await this.error() || "";
        let hint = await this.hint() || "";
        let body = submitted ? "" : await this.interpolate(this.state);
        let key = this.state.key = keys[index] || "";
        let input = await this.format(key);
        let footer = await this.footer();
        if (input) prompt += " " + input;
        if (hint && !input && this.state.completed === 0) prompt += " " + hint;
        this.clear(size);
        let lines = [header, prompt, body, footer, error.trim()];
        this.write(lines.filter(Boolean).join(newline));
        this.restore();
      }
      getItem(name) {
        let { items, keys, index } = this.state;
        let item = items.find((ch) => ch.name === keys[index]);
        if (item && item.input != null) {
          this.input = item.input;
          this.cursor = item.cursor;
        }
        return item;
      }
      async submit() {
        if (typeof this.interpolate !== "function") await this.initialize();
        await this.interpolate(this.state, true);
        let { invalid, missing, output, values } = this.state;
        if (invalid.size) {
          let err = "";
          for (let [key, value] of invalid) err += `Invalid ${key}: ${value}
`;
          this.state.error = err;
          return super.submit();
        }
        if (missing.size) {
          this.state.error = "Required: " + [...missing.keys()].join(", ");
          return super.submit();
        }
        let lines = stripAnsi(output).split("\n");
        let result = lines.map((v) => v.slice(1)).join("\n");
        this.value = { values, result };
        return super.submit();
      }
    };
    module.exports = SnippetPrompt;
  }
});

// node_modules/enquirer/lib/prompts/sort.js
var require_sort = __commonJS({
  "node_modules/enquirer/lib/prompts/sort.js"(exports, module) {
    "use strict";
    var hint = "(Use <shift>+<up/down> to sort)";
    var Prompt = require_select();
    var Sort = class extends Prompt {
      constructor(options) {
        super({ ...options, reorder: false, sort: true, multiple: true });
        this.state.hint = [this.options.hint, hint].find(this.isValue.bind(this));
      }
      indicator() {
        return "";
      }
      async renderChoice(choice, i) {
        let str = await super.renderChoice(choice, i);
        let sym = this.symbols.identicalTo + " ";
        let pre = this.index === i && this.sorting ? this.styles.muted(sym) : "  ";
        if (this.options.drag === false) pre = "";
        if (this.options.numbered === true) {
          return pre + `${i + 1} - ` + str;
        }
        return pre + str;
      }
      get selected() {
        return this.choices;
      }
      submit() {
        this.value = this.choices.map((choice) => choice.value);
        return super.submit();
      }
    };
    module.exports = Sort;
  }
});

// node_modules/enquirer/lib/prompts/survey.js
var require_survey = __commonJS({
  "node_modules/enquirer/lib/prompts/survey.js"(exports, module) {
    "use strict";
    var ArrayPrompt = require_array();
    var Survey = class extends ArrayPrompt {
      constructor(options = {}) {
        super(options);
        this.emptyError = options.emptyError || "No items were selected";
        this.term = process.env.TERM_PROGRAM;
        if (!this.options.header) {
          let header = ["", "4 - Strongly Agree", "3 - Agree", "2 - Neutral", "1 - Disagree", "0 - Strongly Disagree", ""];
          header = header.map((ele) => this.styles.muted(ele));
          this.state.header = header.join("\n   ");
        }
      }
      async toChoices(...args) {
        if (this.createdScales) return false;
        this.createdScales = true;
        let choices = await super.toChoices(...args);
        for (let choice of choices) {
          choice.scale = createScale(5, this.options);
          choice.scaleIdx = 2;
        }
        return choices;
      }
      dispatch() {
        this.alert();
      }
      space() {
        let choice = this.focused;
        let ele = choice.scale[choice.scaleIdx];
        let selected = ele.selected;
        choice.scale.forEach((e) => e.selected = false);
        ele.selected = !selected;
        return this.render();
      }
      indicator() {
        return "";
      }
      pointer() {
        return "";
      }
      separator() {
        return this.styles.muted(this.symbols.ellipsis);
      }
      right() {
        let choice = this.focused;
        if (choice.scaleIdx >= choice.scale.length - 1) return this.alert();
        choice.scaleIdx++;
        return this.render();
      }
      left() {
        let choice = this.focused;
        if (choice.scaleIdx <= 0) return this.alert();
        choice.scaleIdx--;
        return this.render();
      }
      indent() {
        return "   ";
      }
      async renderChoice(item, i) {
        await this.onChoice(item, i);
        let focused = this.index === i;
        let isHyper = this.term === "Hyper";
        let n = !isHyper ? 8 : 9;
        let s = !isHyper ? " " : "";
        let ln = this.symbols.line.repeat(n);
        let sp = " ".repeat(n + (isHyper ? 0 : 1));
        let dot = (enabled) => (enabled ? this.styles.success("\u25C9") : "\u25EF") + s;
        let num = i + 1 + ".";
        let color = focused ? this.styles.heading : this.styles.noop;
        let msg = await this.resolve(item.message, this.state, item, i);
        let indent = this.indent(item);
        let scale = indent + item.scale.map((e, i2) => dot(i2 === item.scaleIdx)).join(ln);
        let val = (i2) => i2 === item.scaleIdx ? color(i2) : i2;
        let next = indent + item.scale.map((e, i2) => val(i2)).join(sp);
        let line = () => [num, msg].filter(Boolean).join(" ");
        let lines = () => [line(), scale, next, " "].filter(Boolean).join("\n");
        if (focused) {
          scale = this.styles.cyan(scale);
          next = this.styles.cyan(next);
        }
        return lines();
      }
      async renderChoices() {
        if (this.state.submitted) return "";
        let choices = this.visible.map(async (ch, i) => await this.renderChoice(ch, i));
        let visible = await Promise.all(choices);
        if (!visible.length) visible.push(this.styles.danger("No matching choices"));
        return visible.join("\n");
      }
      format() {
        if (this.state.submitted) {
          let values = this.choices.map((ch) => this.styles.info(ch.scaleIdx));
          return values.join(", ");
        }
        return "";
      }
      async render() {
        let { submitted, size } = this.state;
        let prefix = await this.prefix();
        let separator = await this.separator();
        let message = await this.message();
        let prompt = [prefix, message, separator].filter(Boolean).join(" ");
        this.state.prompt = prompt;
        let header = await this.header();
        let output = await this.format();
        let help = await this.error() || await this.hint();
        let body = await this.renderChoices();
        let footer = await this.footer();
        if (output || !help) prompt += " " + output;
        if (help && !prompt.includes(help)) prompt += " " + help;
        if (submitted && !output && !body && this.multiple && this.type !== "form") {
          prompt += this.styles.danger(this.emptyError);
        }
        this.clear(size);
        this.write([prompt, header, body, footer].filter(Boolean).join("\n"));
        this.restore();
      }
      submit() {
        this.value = {};
        for (let choice of this.choices) {
          this.value[choice.name] = choice.scaleIdx;
        }
        return this.base.submit.call(this);
      }
    };
    function createScale(n, options = {}) {
      if (Array.isArray(options.scale)) {
        return options.scale.map((ele) => ({ ...ele }));
      }
      let scale = [];
      for (let i = 1; i < n + 1; i++) scale.push({ i, selected: false });
      return scale;
    }
    module.exports = Survey;
  }
});

// node_modules/enquirer/lib/prompts/text.js
var require_text = __commonJS({
  "node_modules/enquirer/lib/prompts/text.js"(exports, module) {
    module.exports = require_input();
  }
});

// node_modules/enquirer/lib/prompts/toggle.js
var require_toggle = __commonJS({
  "node_modules/enquirer/lib/prompts/toggle.js"(exports, module) {
    "use strict";
    var BooleanPrompt = require_boolean();
    var TogglePrompt = class extends BooleanPrompt {
      async initialize() {
        await super.initialize();
        this.value = this.initial = this.resolve(this.options.initial);
        this.disabled = this.options.disabled || "no";
        this.enabled = this.options.enabled || "yes";
        await this.render();
      }
      reset() {
        this.value = this.initial;
        this.render();
      }
      delete() {
        this.alert();
      }
      toggle() {
        this.value = !this.value;
        this.render();
      }
      enable() {
        if (this.value === true) return this.alert();
        this.value = true;
        this.render();
      }
      disable() {
        if (this.value === false) return this.alert();
        this.value = false;
        this.render();
      }
      up() {
        this.toggle();
      }
      down() {
        this.toggle();
      }
      right() {
        this.toggle();
      }
      left() {
        this.toggle();
      }
      next() {
        this.toggle();
      }
      prev() {
        this.toggle();
      }
      dispatch(ch = "", key) {
        switch (ch.toLowerCase()) {
          case " ":
            return this.toggle();
          case "1":
          case "y":
          case "t":
            return this.enable();
          case "0":
          case "n":
          case "f":
            return this.disable();
          default: {
            return this.alert();
          }
        }
      }
      format() {
        let active = (str) => this.styles.primary.underline(str);
        let value = [
          this.value ? this.disabled : active(this.disabled),
          this.value ? active(this.enabled) : this.enabled
        ];
        return value.join(this.styles.muted(" / "));
      }
      async render() {
        let { size } = this.state;
        let header = await this.header();
        let prefix = await this.prefix();
        let separator = await this.separator();
        let message = await this.message();
        let output = await this.format();
        let help = await this.error() || await this.hint();
        let footer = await this.footer();
        let prompt = [prefix, message, separator, output].join(" ");
        this.state.prompt = prompt;
        if (help && !prompt.includes(help)) prompt += " " + help;
        this.clear(size);
        this.write([header, prompt, footer].filter(Boolean).join("\n"));
        this.write(this.margin[2]);
        this.restore();
      }
    };
    module.exports = TogglePrompt;
  }
});

// node_modules/enquirer/lib/prompts/quiz.js
var require_quiz = __commonJS({
  "node_modules/enquirer/lib/prompts/quiz.js"(exports, module) {
    "use strict";
    var SelectPrompt = require_select();
    var Quiz = class extends SelectPrompt {
      constructor(options) {
        super(options);
        if (typeof this.options.correctChoice !== "number" || this.options.correctChoice < 0) {
          throw new Error("Please specify the index of the correct answer from the list of choices");
        }
      }
      async toChoices(value, parent) {
        let choices = await super.toChoices(value, parent);
        if (choices.length < 2) {
          throw new Error("Please give at least two choices to the user");
        }
        if (this.options.correctChoice > choices.length) {
          throw new Error("Please specify the index of the correct answer from the list of choices");
        }
        return choices;
      }
      check(state) {
        return state.index === this.options.correctChoice;
      }
      async result(selected) {
        return {
          selectedAnswer: selected,
          correctAnswer: this.options.choices[this.options.correctChoice].value,
          correct: await this.check(this.state)
        };
      }
    };
    module.exports = Quiz;
  }
});

// node_modules/enquirer/lib/prompts/index.js
var require_prompts = __commonJS({
  "node_modules/enquirer/lib/prompts/index.js"(exports) {
    "use strict";
    var utils = require_utils();
    var define = (key, fn) => {
      utils.defineExport(exports, key, fn);
      utils.defineExport(exports, key.toLowerCase(), fn);
    };
    define("AutoComplete", () => require_autocomplete());
    define("BasicAuth", () => require_basicauth());
    define("Confirm", () => require_confirm());
    define("Editable", () => require_editable());
    define("Form", () => require_form());
    define("Input", () => require_input());
    define("Invisible", () => require_invisible());
    define("List", () => require_list());
    define("MultiSelect", () => require_multiselect());
    define("Numeral", () => require_numeral());
    define("Password", () => require_password());
    define("Scale", () => require_scale());
    define("Select", () => require_select());
    define("Snippet", () => require_snippet());
    define("Sort", () => require_sort());
    define("Survey", () => require_survey());
    define("Text", () => require_text());
    define("Toggle", () => require_toggle());
    define("Quiz", () => require_quiz());
  }
});

// node_modules/enquirer/lib/types/index.js
var require_types = __commonJS({
  "node_modules/enquirer/lib/types/index.js"(exports, module) {
    module.exports = {
      ArrayPrompt: require_array(),
      AuthPrompt: require_auth(),
      BooleanPrompt: require_boolean(),
      NumberPrompt: require_number(),
      StringPrompt: require_string()
    };
  }
});

// node_modules/enquirer/index.js
var require_enquirer = __commonJS({
  "node_modules/enquirer/index.js"(exports, module) {
    "use strict";
    var assert = __require("assert");
    var Events = __require("events");
    var utils = require_utils();
    var Enquirer2 = class extends Events {
      constructor(options, answers) {
        super();
        this.options = utils.merge({}, options);
        this.answers = { ...answers };
      }
      /**
       * Register a custom prompt type.
       *
       * ```js
       * const Enquirer = require('enquirer');
       * const enquirer = new Enquirer();
       * enquirer.register('customType', require('./custom-prompt'));
       * ```
       * @name register()
       * @param {String} `type`
       * @param {Function|Prompt} `fn` `Prompt` class, or a function that returns a `Prompt` class.
       * @return {Object} Returns the Enquirer instance
       * @api public
       */
      register(type, fn) {
        if (utils.isObject(type)) {
          for (let key of Object.keys(type)) this.register(key, type[key]);
          return this;
        }
        assert.equal(typeof fn, "function", "expected a function");
        const name = type.toLowerCase();
        if (fn.prototype instanceof this.Prompt) {
          this.prompts[name] = fn;
        } else {
          this.prompts[name] = fn(this.Prompt, this);
        }
        return this;
      }
      /**
       * Prompt function that takes a "question" object or array of question objects,
       * and returns an object with responses from the user.
       *
       * ```js
       * const Enquirer = require('enquirer');
       * const enquirer = new Enquirer();
       *
       * const response = await enquirer.prompt({
       *   type: 'input',
       *   name: 'username',
       *   message: 'What is your username?'
       * });
       * console.log(response);
       * ```
       * @name prompt()
       * @param {Array|Object} `questions` Options objects for one or more prompts to run.
       * @return {Promise} Promise that returns an "answers" object with the user's responses.
       * @api public
       */
      async prompt(questions = []) {
        for (let question of [].concat(questions)) {
          try {
            if (typeof question === "function") question = await question.call(this);
            await this.ask(utils.merge({}, this.options, question));
          } catch (err) {
            return Promise.reject(err);
          }
        }
        return this.answers;
      }
      async ask(question) {
        if (typeof question === "function") {
          question = await question.call(this);
        }
        let opts = utils.merge({}, this.options, question);
        let { type, name } = question;
        let { set, get } = utils;
        if (typeof type === "function") {
          type = await type.call(this, question, this.answers);
        }
        if (!type) return this.answers[name];
        if (type === "number") type = "numeral";
        assert(this.prompts[type], `Prompt "${type}" is not registered`);
        let prompt = new this.prompts[type](opts);
        let value = get(this.answers, name);
        prompt.state.answers = this.answers;
        prompt.enquirer = this;
        if (name) {
          prompt.on("submit", (value2) => {
            this.emit("answer", name, value2, prompt);
            set(this.answers, name, value2);
          });
        }
        let emit = prompt.emit.bind(prompt);
        prompt.emit = (...args) => {
          this.emit.call(this, ...args);
          return emit(...args);
        };
        this.emit("prompt", prompt, this);
        if (opts.autofill && value != null) {
          prompt.value = prompt.input = value;
          if (opts.autofill === "show") {
            await prompt.submit();
          }
        } else {
          value = prompt.value = await prompt.run();
        }
        return value;
      }
      /**
       * Use an enquirer plugin.
       *
       * ```js
       * const Enquirer = require('enquirer');
       * const enquirer = new Enquirer();
       * const plugin = enquirer => {
       *   // do stuff to enquire instance
       * };
       * enquirer.use(plugin);
       * ```
       * @name use()
       * @param {Function} `plugin` Plugin function that takes an instance of Enquirer.
       * @return {Object} Returns the Enquirer instance.
       * @api public
       */
      use(plugin) {
        plugin.call(this, this);
        return this;
      }
      set Prompt(value) {
        this._Prompt = value;
      }
      get Prompt() {
        return this._Prompt || this.constructor.Prompt;
      }
      get prompts() {
        return this.constructor.prompts;
      }
      static set Prompt(value) {
        this._Prompt = value;
      }
      static get Prompt() {
        return this._Prompt || require_prompt();
      }
      static get prompts() {
        return require_prompts();
      }
      static get types() {
        return require_types();
      }
      /**
       * Prompt function that takes a "question" object or array of question objects,
       * and returns an object with responses from the user.
       *
       * ```js
       * const { prompt } = require('enquirer');
       * const response = await prompt({
       *   type: 'input',
       *   name: 'username',
       *   message: 'What is your username?'
       * });
       * console.log(response);
       * ```
       * @name Enquirer#prompt
       * @param {Array|Object} `questions` Options objects for one or more prompts to run.
       * @return {Promise} Promise that returns an "answers" object with the user's responses.
       * @api public
       */
      static get prompt() {
        const fn = (questions, ...rest) => {
          let enquirer2 = new this(...rest);
          let emit = enquirer2.emit.bind(enquirer2);
          enquirer2.emit = (...args) => {
            fn.emit(...args);
            return emit(...args);
          };
          return enquirer2.prompt(questions);
        };
        utils.mixinEmitter(fn, new Events());
        return fn;
      }
    };
    utils.mixinEmitter(Enquirer2, new Events());
    var prompts = Enquirer2.prompts;
    for (let name of Object.keys(prompts)) {
      let key = name.toLowerCase();
      let run = (options) => new prompts[name](options).run();
      Enquirer2.prompt[key] = run;
      Enquirer2[key] = run;
      if (!Enquirer2[name]) {
        Reflect.defineProperty(Enquirer2, name, { get: () => prompts[name] });
      }
    }
    var define = (name) => {
      utils.defineExport(Enquirer2, name, () => Enquirer2.types[name]);
    };
    define("ArrayPrompt");
    define("AuthPrompt");
    define("BooleanPrompt");
    define("NumberPrompt");
    define("StringPrompt");
    module.exports = Enquirer2;
  }
});

// node_modules/dotenv/package.json
var require_package = __commonJS({
  "node_modules/dotenv/package.json"(exports, module) {
    module.exports = {
      name: "dotenv",
      version: "16.5.0",
      description: "Loads environment variables from .env file",
      main: "lib/main.js",
      types: "lib/main.d.ts",
      exports: {
        ".": {
          types: "./lib/main.d.ts",
          require: "./lib/main.js",
          default: "./lib/main.js"
        },
        "./config": "./config.js",
        "./config.js": "./config.js",
        "./lib/env-options": "./lib/env-options.js",
        "./lib/env-options.js": "./lib/env-options.js",
        "./lib/cli-options": "./lib/cli-options.js",
        "./lib/cli-options.js": "./lib/cli-options.js",
        "./package.json": "./package.json"
      },
      scripts: {
        "dts-check": "tsc --project tests/types/tsconfig.json",
        lint: "standard",
        pretest: "npm run lint && npm run dts-check",
        test: "tap run --allow-empty-coverage --disable-coverage --timeout=60000",
        "test:coverage": "tap run --show-full-coverage --timeout=60000 --coverage-report=lcov",
        prerelease: "npm test",
        release: "standard-version"
      },
      repository: {
        type: "git",
        url: "git://github.com/motdotla/dotenv.git"
      },
      homepage: "https://github.com/motdotla/dotenv#readme",
      funding: "https://dotenvx.com",
      keywords: [
        "dotenv",
        "env",
        ".env",
        "environment",
        "variables",
        "config",
        "settings"
      ],
      readmeFilename: "README.md",
      license: "BSD-2-Clause",
      devDependencies: {
        "@types/node": "^18.11.3",
        decache: "^4.6.2",
        sinon: "^14.0.1",
        standard: "^17.0.0",
        "standard-version": "^9.5.0",
        tap: "^19.2.0",
        typescript: "^4.8.4"
      },
      engines: {
        node: ">=12"
      },
      browser: {
        fs: false
      }
    };
  }
});

// node_modules/dotenv/lib/main.js
var require_main = __commonJS({
  "node_modules/dotenv/lib/main.js"(exports, module) {
    var fs2 = __require("fs");
    var path3 = __require("path");
    var os = __require("os");
    var crypto = __require("crypto");
    var packageJson = require_package();
    var version = packageJson.version;
    var LINE = /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/mg;
    function parse(src) {
      const obj = {};
      let lines = src.toString();
      lines = lines.replace(/\r\n?/mg, "\n");
      let match;
      while ((match = LINE.exec(lines)) != null) {
        const key = match[1];
        let value = match[2] || "";
        value = value.trim();
        const maybeQuote = value[0];
        value = value.replace(/^(['"`])([\s\S]*)\1$/mg, "$2");
        if (maybeQuote === '"') {
          value = value.replace(/\\n/g, "\n");
          value = value.replace(/\\r/g, "\r");
        }
        obj[key] = value;
      }
      return obj;
    }
    function _parseVault(options) {
      const vaultPath = _vaultPath(options);
      const result = DotenvModule.configDotenv({ path: vaultPath });
      if (!result.parsed) {
        const err = new Error(`MISSING_DATA: Cannot parse ${vaultPath} for an unknown reason`);
        err.code = "MISSING_DATA";
        throw err;
      }
      const keys = _dotenvKey(options).split(",");
      const length = keys.length;
      let decrypted;
      for (let i = 0; i < length; i++) {
        try {
          const key = keys[i].trim();
          const attrs = _instructions(result, key);
          decrypted = DotenvModule.decrypt(attrs.ciphertext, attrs.key);
          break;
        } catch (error) {
          if (i + 1 >= length) {
            throw error;
          }
        }
      }
      return DotenvModule.parse(decrypted);
    }
    function _warn(message) {
      console.log(`[dotenv@${version}][WARN] ${message}`);
    }
    function _debug(message) {
      console.log(`[dotenv@${version}][DEBUG] ${message}`);
    }
    function _dotenvKey(options) {
      if (options && options.DOTENV_KEY && options.DOTENV_KEY.length > 0) {
        return options.DOTENV_KEY;
      }
      if (process.env.DOTENV_KEY && process.env.DOTENV_KEY.length > 0) {
        return process.env.DOTENV_KEY;
      }
      return "";
    }
    function _instructions(result, dotenvKey) {
      let uri;
      try {
        uri = new URL(dotenvKey);
      } catch (error) {
        if (error.code === "ERR_INVALID_URL") {
          const err = new Error("INVALID_DOTENV_KEY: Wrong format. Must be in valid uri format like dotenv://:key_1234@dotenvx.com/vault/.env.vault?environment=development");
          err.code = "INVALID_DOTENV_KEY";
          throw err;
        }
        throw error;
      }
      const key = uri.password;
      if (!key) {
        const err = new Error("INVALID_DOTENV_KEY: Missing key part");
        err.code = "INVALID_DOTENV_KEY";
        throw err;
      }
      const environment = uri.searchParams.get("environment");
      if (!environment) {
        const err = new Error("INVALID_DOTENV_KEY: Missing environment part");
        err.code = "INVALID_DOTENV_KEY";
        throw err;
      }
      const environmentKey = `DOTENV_VAULT_${environment.toUpperCase()}`;
      const ciphertext = result.parsed[environmentKey];
      if (!ciphertext) {
        const err = new Error(`NOT_FOUND_DOTENV_ENVIRONMENT: Cannot locate environment ${environmentKey} in your .env.vault file.`);
        err.code = "NOT_FOUND_DOTENV_ENVIRONMENT";
        throw err;
      }
      return { ciphertext, key };
    }
    function _vaultPath(options) {
      let possibleVaultPath = null;
      if (options && options.path && options.path.length > 0) {
        if (Array.isArray(options.path)) {
          for (const filepath of options.path) {
            if (fs2.existsSync(filepath)) {
              possibleVaultPath = filepath.endsWith(".vault") ? filepath : `${filepath}.vault`;
            }
          }
        } else {
          possibleVaultPath = options.path.endsWith(".vault") ? options.path : `${options.path}.vault`;
        }
      } else {
        possibleVaultPath = path3.resolve(process.cwd(), ".env.vault");
      }
      if (fs2.existsSync(possibleVaultPath)) {
        return possibleVaultPath;
      }
      return null;
    }
    function _resolveHome(envPath) {
      return envPath[0] === "~" ? path3.join(os.homedir(), envPath.slice(1)) : envPath;
    }
    function _configVault(options) {
      const debug = Boolean(options && options.debug);
      if (debug) {
        _debug("Loading env from encrypted .env.vault");
      }
      const parsed = DotenvModule._parseVault(options);
      let processEnv = process.env;
      if (options && options.processEnv != null) {
        processEnv = options.processEnv;
      }
      DotenvModule.populate(processEnv, parsed, options);
      return { parsed };
    }
    function configDotenv(options) {
      const dotenvPath = path3.resolve(process.cwd(), ".env");
      let encoding = "utf8";
      const debug = Boolean(options && options.debug);
      if (options && options.encoding) {
        encoding = options.encoding;
      } else {
        if (debug) {
          _debug("No encoding is specified. UTF-8 is used by default");
        }
      }
      let optionPaths = [dotenvPath];
      if (options && options.path) {
        if (!Array.isArray(options.path)) {
          optionPaths = [_resolveHome(options.path)];
        } else {
          optionPaths = [];
          for (const filepath of options.path) {
            optionPaths.push(_resolveHome(filepath));
          }
        }
      }
      let lastError;
      const parsedAll = {};
      for (const path4 of optionPaths) {
        try {
          const parsed = DotenvModule.parse(fs2.readFileSync(path4, { encoding }));
          DotenvModule.populate(parsedAll, parsed, options);
        } catch (e) {
          if (debug) {
            _debug(`Failed to load ${path4} ${e.message}`);
          }
          lastError = e;
        }
      }
      let processEnv = process.env;
      if (options && options.processEnv != null) {
        processEnv = options.processEnv;
      }
      DotenvModule.populate(processEnv, parsedAll, options);
      if (lastError) {
        return { parsed: parsedAll, error: lastError };
      } else {
        return { parsed: parsedAll };
      }
    }
    function config2(options) {
      if (_dotenvKey(options).length === 0) {
        return DotenvModule.configDotenv(options);
      }
      const vaultPath = _vaultPath(options);
      if (!vaultPath) {
        _warn(`You set DOTENV_KEY but you are missing a .env.vault file at ${vaultPath}. Did you forget to build it?`);
        return DotenvModule.configDotenv(options);
      }
      return DotenvModule._configVault(options);
    }
    function decrypt(encrypted, keyStr) {
      const key = Buffer.from(keyStr.slice(-64), "hex");
      let ciphertext = Buffer.from(encrypted, "base64");
      const nonce = ciphertext.subarray(0, 12);
      const authTag = ciphertext.subarray(-16);
      ciphertext = ciphertext.subarray(12, -16);
      try {
        const aesgcm = crypto.createDecipheriv("aes-256-gcm", key, nonce);
        aesgcm.setAuthTag(authTag);
        return `${aesgcm.update(ciphertext)}${aesgcm.final()}`;
      } catch (error) {
        const isRange = error instanceof RangeError;
        const invalidKeyLength = error.message === "Invalid key length";
        const decryptionFailed = error.message === "Unsupported state or unable to authenticate data";
        if (isRange || invalidKeyLength) {
          const err = new Error("INVALID_DOTENV_KEY: It must be 64 characters long (or more)");
          err.code = "INVALID_DOTENV_KEY";
          throw err;
        } else if (decryptionFailed) {
          const err = new Error("DECRYPTION_FAILED: Please check your DOTENV_KEY");
          err.code = "DECRYPTION_FAILED";
          throw err;
        } else {
          throw error;
        }
      }
    }
    function populate(processEnv, parsed, options = {}) {
      const debug = Boolean(options && options.debug);
      const override = Boolean(options && options.override);
      if (typeof parsed !== "object") {
        const err = new Error("OBJECT_REQUIRED: Please check the processEnv argument being passed to populate");
        err.code = "OBJECT_REQUIRED";
        throw err;
      }
      for (const key of Object.keys(parsed)) {
        if (Object.prototype.hasOwnProperty.call(processEnv, key)) {
          if (override === true) {
            processEnv[key] = parsed[key];
          }
          if (debug) {
            if (override === true) {
              _debug(`"${key}" is already defined and WAS overwritten`);
            } else {
              _debug(`"${key}" is already defined and was NOT overwritten`);
            }
          }
        } else {
          processEnv[key] = parsed[key];
        }
      }
    }
    var DotenvModule = {
      configDotenv,
      _configVault,
      _parseVault,
      config: config2,
      decrypt,
      parse,
      populate
    };
    module.exports.configDotenv = DotenvModule.configDotenv;
    module.exports._configVault = DotenvModule._configVault;
    module.exports._parseVault = DotenvModule._parseVault;
    module.exports.config = DotenvModule.config;
    module.exports.decrypt = DotenvModule.decrypt;
    module.exports.parse = DotenvModule.parse;
    module.exports.populate = DotenvModule.populate;
    module.exports = DotenvModule;
  }
});

// src/util.js
import path from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
import { format } from "node:util";
import { appendFileSync } from "node:fs";

// node_modules/lowdb/lib/adapters/node/TextFile.js
import { readFile } from "node:fs/promises";

// node_modules/steno/lib/index.js
import { rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
function getTempFilename(file) {
  const f = file instanceof URL ? fileURLToPath(file) : file.toString();
  return join(dirname(f), `.${basename(f)}.tmp`);
}
async function retryAsyncOperation(fn, maxRetries, delayMs) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i < maxRetries - 1) {
        await new Promise((resolve2) => setTimeout(resolve2, delayMs));
      } else {
        throw error;
      }
    }
  }
}
var Writer = class {
  #filename;
  #tempFilename;
  #locked = false;
  #prev = null;
  #next = null;
  #nextPromise = null;
  #nextData = null;
  // File is locked, add data for later
  #add(data) {
    this.#nextData = data;
    this.#nextPromise ||= new Promise((resolve2, reject) => {
      this.#next = [resolve2, reject];
    });
    return new Promise((resolve2, reject) => {
      this.#nextPromise?.then(resolve2).catch(reject);
    });
  }
  // File isn't locked, write data
  async #write(data) {
    this.#locked = true;
    try {
      await writeFile(this.#tempFilename, data, "utf-8");
      await retryAsyncOperation(async () => {
        await rename(this.#tempFilename, this.#filename);
      }, 10, 100);
      this.#prev?.[0]();
    } catch (err) {
      if (err instanceof Error) {
        this.#prev?.[1](err);
      }
      throw err;
    } finally {
      this.#locked = false;
      this.#prev = this.#next;
      this.#next = this.#nextPromise = null;
      if (this.#nextData !== null) {
        const nextData = this.#nextData;
        this.#nextData = null;
        await this.write(nextData);
      }
    }
  }
  constructor(filename) {
    this.#filename = filename;
    this.#tempFilename = getTempFilename(filename);
  }
  async write(data) {
    return this.#locked ? this.#add(data) : this.#write(data);
  }
};

// node_modules/lowdb/lib/adapters/node/TextFile.js
var TextFile = class {
  #filename;
  #writer;
  constructor(filename) {
    this.#filename = filename;
    this.#writer = new Writer(filename);
  }
  async read() {
    let data;
    try {
      data = await readFile(this.#filename, "utf-8");
    } catch (e) {
      if (e.code === "ENOENT") {
        return null;
      }
      throw e;
    }
    return data;
  }
  write(str) {
    return this.#writer.write(str);
  }
};

// node_modules/lowdb/lib/adapters/node/DataFile.js
var DataFile = class {
  #adapter;
  #parse;
  #stringify;
  constructor(filename, { parse, stringify }) {
    this.#adapter = new TextFile(filename);
    this.#parse = parse;
    this.#stringify = stringify;
  }
  async read() {
    const data = await this.#adapter.read();
    if (data === null) {
      return null;
    } else {
      return this.#parse(data);
    }
  }
  write(obj) {
    return this.#adapter.write(this.#stringify(obj));
  }
};

// node_modules/lowdb/lib/adapters/node/JSONFile.js
var JSONFile = class extends DataFile {
  constructor(filename) {
    super(filename, {
      parse: JSON.parse,
      stringify: (data) => JSON.stringify(data, null, 2)
    });
  }
};

// node_modules/lowdb/lib/adapters/Memory.js
var Memory = class {
  #data = null;
  read() {
    return Promise.resolve(this.#data);
  }
  write(obj) {
    this.#data = obj;
    return Promise.resolve();
  }
};

// node_modules/lowdb/lib/core/Low.js
function checkArgs(adapter, defaultData) {
  if (adapter === void 0)
    throw new Error("lowdb: missing adapter");
  if (defaultData === void 0)
    throw new Error("lowdb: missing default data");
}
var Low = class {
  adapter;
  data;
  constructor(adapter, defaultData) {
    checkArgs(adapter, defaultData);
    this.adapter = adapter;
    this.data = defaultData;
  }
  async read() {
    const data = await this.adapter.read();
    if (data)
      this.data = data;
  }
  async write() {
    if (this.data)
      await this.adapter.write(this.data);
  }
  async update(fn) {
    fn(this.data);
    await this.write();
  }
};

// node_modules/lowdb/lib/presets/node.js
async function JSONFilePreset(filename, defaultData) {
  const adapter = process.env.NODE_ENV === "test" ? new Memory() : new JSONFile(filename);
  const db2 = new Low(adapter, defaultData);
  await db2.read();
  return db2;
}

// src/util.js
var import_enquirer = __toESM(require_enquirer(), 1);
import { execFile } from "child_process";

// src/config.js
var dotenv = __toESM(require_main(), 1);
dotenv.config({ path: "data/config.env" });
var cfg = {
  debug: process.env.DEBUG == "1" || process.env.PWDEBUG == "1",
  // runs non-headless and opens https://playwright.dev/docs/inspector
  debug_network: process.env.DEBUG_NETWORK == "1",
  // log network requests and responses
  record: process.env.RECORD == "1",
  // `recordHar` (network) + `recordVideo`
  time: process.env.TIME == "1",
  // log duration of each step
  dryrun: process.env.DRYRUN == "1",
  // don't claim anything
  interactive: process.env.INTERACTIVE == "1",
  // confirm to claim, default skip
  automation: process.env.AUTOMATION || "patchright",
  // browser automation engine: patchright (default) or playwright
  show: process.env.SHOW == "1",
  // run non-headless
  get headless() {
    return !this.debug && !this.show;
  },
  width: Number(process.env.WIDTH) || 1920,
  // width of the opened browser
  height: Number(process.env.HEIGHT) || 1080,
  // height of the opened browser
  timeout: (Number(process.env.TIMEOUT) || 60) * 1e3,
  // default timeout for playwright is 30s
  login_timeout: (Number(process.env.LOGIN_TIMEOUT) || 180) * 1e3,
  // higher timeout for login, will wait twice: prompt + wait for manual login
  novnc_port: process.env.NOVNC_PORT,
  // running in docker if set
  notify: process.env.NOTIFY,
  // apprise notification services
  notify_title: process.env.NOTIFY_TITLE,
  // apprise notification title
  get dir() {
    return {
      browser: process.env.BROWSER_DIR || dataDir("browser"),
      // for multiple accounts or testing
      screenshots: process.env.SCREENSHOTS_DIR || dataDir("screenshots")
      // set to 0 to disable screenshots
    };
  },
  // auth epic-games
  eg_email: process.env.EG_EMAIL || process.env.EMAIL,
  eg_password: process.env.EG_PASSWORD || process.env.PASSWORD,
  eg_otpkey: process.env.EG_OTPKEY,
  eg_parentalpin: process.env.EG_PARENTALPIN,
  // auth prime-gaming
  pg_email: process.env.PG_EMAIL || process.env.EMAIL,
  pg_password: process.env.PG_PASSWORD || process.env.PASSWORD,
  pg_otpkey: process.env.PG_OTPKEY,
  // auth gog
  gog_email: process.env.GOG_EMAIL || process.env.EMAIL,
  gog_password: process.env.GOG_PASSWORD || process.env.PASSWORD,
  gog_newsletter: process.env.GOG_NEWSLETTER == "1",
  // do not unsubscribe from newsletter after claiming a game
  // auth AliExpress
  ae_email: process.env.AE_EMAIL || process.env.EMAIL,
  ae_password: process.env.AE_PASSWORD || process.env.PASSWORD,
  // auth Steam
  steam_username: process.env.STEAM_USERNAME || process.env.EMAIL,
  steam_password: process.env.STEAM_PASSWORD || process.env.PASSWORD,
  steam_id: process.env.STEAM_ID,
  // steam-games: community id for the library export
  // OTP only via GOG_EMAIL, can't add app...
  // experimmental
  pg_redeem: process.env.PG_REDEEM == "1",
  // prime-gaming: redeem keys on external stores
  lg_email: process.env.LG_EMAIL || process.env.PG_EMAIL || process.env.EMAIL,
  // prime-gaming: external: legacy-games: email to use for redeeming
  pg_claimdlc: process.env.PG_CLAIMDLC == "1",
  // prime-gaming: claim in-game content
  pg_timeLeft: Number(process.env.PG_TIMELEFT)
  // prime-gaming: check time left to claim and skip game if there are more than PG_TIMELEFT days left to claim it
};

// src/util.js
var __filename = fileURLToPath2(import.meta.url);
var __dirname = path.dirname(__filename);
var dataDir = (s) => path.resolve(__dirname, "..", "data", s);
var resolve = (...a) => a.length && a[0] == "0" ? null : path.resolve(...a);
var fgcLogFile = process.env.FGC_LOG_FILE;
if (fgcLogFile) {
  for (const level of ["log", "info", "debug", "error", "warn"]) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      appendFileSync(fgcLogFile, `${format(...args)}
`);
      original(...args);
    };
  }
}
var jsonDb = (file, defaultData) => JSONFilePreset(dataDir(file), defaultData);
var datetimeUTC = (d = /* @__PURE__ */ new Date()) => d.toISOString().replace("T", " ").replace("Z", "");
var datetime = (d = /* @__PURE__ */ new Date()) => datetimeUTC(new Date(d.getTime() - d.getTimezoneOffset() * 6e4));
var filenamify = (s) => s.replaceAll(":", ".").replace(/[^a-z0-9 _\-.]/gi, "_");
var handleSIGINT = (context2 = null) => process.on("SIGINT", async () => {
  console.error("\nInterrupted by SIGINT. Exit!");
  process.exitCode = 130;
  if (context2) await context2.close();
});
var enquirer = new import_enquirer.default();
var timeoutPlugin = (timeout) => (enquirer2) => {
  enquirer2.on("prompt", (prompt) => {
    const t = setTimeout(() => {
      prompt.hint = () => "timeout";
      prompt.cancel();
    }, timeout);
    prompt.on("submit", (_) => clearTimeout(t));
    prompt.on("cancel", (_) => clearTimeout(t));
  });
};
enquirer.use(timeoutPlugin(cfg.login_timeout));
var notify = (html) => new Promise((resolve2, reject) => {
  if (!cfg.notify) {
    if (cfg.debug) console.debug("notify: NOTIFY is not set!");
    return resolve2();
  }
  const args = [cfg.notify, "-i", "html", "-b", `'${html}'`];
  if (cfg.notify_title) args.push(...["-t", cfg.notify_title]);
  if (cfg.debug) console.debug(`apprise ${args.map((a) => `'${a}'`).join(" ")}`);
  execFile("apprise", args, (error, stdout, stderr) => {
    if (error) {
      console.log(`error: ${error.message}`);
      if (error.message.includes("command not found")) {
        console.info("Run `pip install apprise`. See https://github.com/vogler/free-games-claimer#notifications");
      }
      return reject(error);
    }
    if (stderr) console.error(`stderr: ${stderr}`);
    if (stdout) console.log(`stdout: ${stdout}`);
    resolve2();
  });
});
var escapeHtml = (unsafe) => unsafe.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
var recordClaimStat = async (store, { title, url, priceUsd = 0, coverUrl = null }) => {
  const statsDb = await jsonDb("stats.json", { totalSavedUsd: 0, totalClaimed: 0, history: [] });
  statsDb.data.totalClaimed = (statsDb.data.totalClaimed || 0) + 1;
  statsDb.data.totalSavedUsd = Number(((statsDb.data.totalSavedUsd || 0) + (Number(priceUsd) || 0)).toFixed(2));
  statsDb.data.history.push({
    store,
    title,
    url,
    priceUsd: Number(priceUsd) || 0,
    coverUrl,
    date: datetime()
  });
  await statsDb.write();
  return statsDb.data;
};
var getStatsSummary = async () => {
  const statsDb = await jsonDb("stats.json", { totalSavedUsd: 0, totalClaimed: 0, history: [] });
  return `\u{1F4B0} \u0412\u0441\u0435\u0433\u043E \u0441\u044D\u043A\u043E\u043D\u043E\u043C\u043B\u0435\u043D\u043E: $${statsDb.data.totalSavedUsd || 0} (${statsDb.data.totalClaimed || 0} \u0440\u0430\u0437\u0434\u0430\u0447)`;
};
var html_game_list = (games, statsSummary = null) => {
  const list = games.map((g) => `- <a href="${g.url}">${escapeHtml(g.title)}</a> (${g.status}${g.price ? ` - $${g.price}` : ""})`).join("<br>");
  return statsSummary ? `${list}<br><br><b>${escapeHtml(statsSummary)}</b>` : list;
};

// src/browser.js
import fs from "fs";
import path2 from "path";
var ENGINES = {
  patchright: {
    package: "patchright",
    browser: "chromium",
    install: "npm install && npx patchright install chromium chrome"
  },
  playwright: {
    package: "playwright",
    browser: "chromium",
    install: "npm install playwright && npx playwright install chromium chrome"
  }
};
var minimizeWindow = async (context2) => {
  if (typeof context2.newCDPSession != "function") return;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const page2 = context2.pages()[0] || await context2.newPage();
      const session = await context2.newCDPSession(page2);
      const { windowId } = await session.send("Browser.getWindowForTarget");
      await session.send("Browser.setWindowBounds", {
        windowId,
        bounds: { left: -32e3, top: -32e3, width: 1280, height: 900, windowState: "normal" }
      });
      await session.detach();
      return;
    } catch (error) {
      if (attempt == 5) console.warn(`could not move the browser window off-screen: ${error.message}`);
      else await new Promise((resolve2) => setTimeout(resolve2, 200));
    }
  }
};
var launchContext = async (cfg2, options) => {
  const engine = ENGINES[cfg2.automation];
  if (!engine) {
    throw new Error(`Unknown AUTOMATION "${cfg2.automation}". Supported values: ${Object.keys(ENGINES).join(", ")}.`);
  }
  let module;
  try {
    module = await import(engine.package);
  } catch (error) {
    if (error?.code == "ERR_MODULE_NOT_FOUND") {
      throw new Error(`Browser automation "${cfg2.automation}" is not installed. Install it with: ${engine.install}`);
    }
    throw error;
  }
  const browser = module[engine.browser];
  if (!browser) {
    throw new Error(`Package "${engine.package}" does not export "${engine.browser}".`);
  }
  if (process.platform == "win32") {
    const linuxGlArgs = ["--use-gl", "--use-angle"];
    options.args = (options.args ?? []).filter((a) => !linuxGlArgs.some((p) => a.startsWith(p)));
  }
  const proxyArgs = ["--proxy-server", "--proxy-pac-url", "--proxy-auto-detect"];
  const args = options.args ?? [];
  const hasProxyArg = args.some((a) => proxyArgs.some((p) => a.startsWith(p)));
  if (!hasProxyArg) options.args = [...args, "--no-proxy-server"];
  if (options.headless === false && process.env.FGC_MINIMIZE == "1") {
    const offscreenArgs = [
      "--window-position=-32000,-32000",
      "--window-size=1280,900",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--no-default-browser-check"
    ];
    options.args = [...options.args ?? [], ...offscreenArgs];
  }
  if (cfg2.dir?.browser) {
    const lockFile = path2.resolve(cfg2.dir.browser, "SingletonLock");
    if (fs.existsSync(lockFile)) {
      try {
        fs.unlinkSync(lockFile);
      } catch {
      }
    }
  }
  let context2;
  const launch = (opts) => browser.launchPersistentContext(cfg2.dir.browser, opts);
  try {
    context2 = await launch(options);
  } catch (error) {
    const isChannelError = options.channel && (error.message.includes("Chromium distribution") || error.message.includes("not found") || error.message.includes("Executable doesn't exist") || error.message.includes("Cannot find") || error.message.toLowerCase().includes("channel"));
    if (isChannelError) {
      console.warn(`[WARN] Browser channel "${options.channel}" is not available on this system.`);
      if (process.platform === "win32" && options.channel !== "msedge") {
        try {
          console.log("[INFO] Attempting fallback to Microsoft Edge (msedge)...");
          context2 = await launch({ ...options, channel: "msedge" });
        } catch {
        }
      }
      if (!context2) {
        console.log("[INFO] Falling back to bundled Patchright Chromium...");
        const fallbackOpts = { ...options };
        delete fallbackOpts.channel;
        try {
          context2 = await launch(fallbackOpts);
        } catch (bundledError) {
          if (bundledError.message.includes("Executable doesn't exist")) {
            console.log('[INFO] Bundled Chromium binary not found. Automatically running "npx patchright install chromium"...');
            const { execSync } = await import("child_process");
            execSync("npx patchright install chromium", { stdio: "inherit" });
            context2 = await launch(fallbackOpts);
          } else {
            throw bundledError;
          }
        }
      }
    } else {
      throw error;
    }
  }
  if (options.headless === false && process.env.FGC_MINIMIZE == "1") await minimizeWindow(context2);
  return context2;
};

// unity.js
var screenshot = (...a) => resolve(cfg.dir.screenshots, "unity", ...a);
console.log(datetime(), "started checking Unity Asset Store");
var db = await jsonDb("unity.json", {});
var dbEpic = await jsonDb("epic-games.json", {});
var user = Object.keys(dbEpic.data)[0] || "default";
db.data[user] ||= {};
var notify_games = [];
var context = await launchContext(cfg, {
  channel: "chrome",
  headless: false,
  viewport: null,
  locale: "en-US",
  recordVideo: cfg.record ? { dir: "data/record/", size: { width: cfg.width, height: cfg.height } } : void 0,
  recordHar: cfg.record ? { path: `data/record/unity-${filenamify(datetime())}.har` } : void 0,
  handleSIGINT: false
});
handleSIGINT(context);
if (!cfg.debug) context.setDefaultTimeout(cfg.timeout);
var page = context.pages().length ? context.pages()[0] : await context.newPage();
await page.setViewportSize({ width: cfg.width, height: cfg.height });
try {
  console.log("Checking Unity ID login status...");
  await page.goto("https://assetstore.unity.com/account/cart", { waitUntil: "domcontentloaded", timeout: 35e3 });
  await page.waitForTimeout(3e3);
  page.locator('button:has-text("Accept All Cookies"), button:has-text("\u041E\u0434\u043E\u0431\u0440\u0438\u0442\u044C \u0432\u0441\u0435")').first().click().catch(() => {
  });
  const isLoggedOut = page.url().includes("id.unity.com") || page.url().includes("login.unity.com") || await page.locator('button:has-text("Sign in"), button:has-text("Sign up"), a:has-text("Sign in"), input#email, input[name="email"]').count() > 0;
  if (isLoggedOut) {
    const loginPrompt = "Not signed in to Unity ID. Run with --show to login: ClaimGames.cmd --show --claim unity";
    console.warn(`[WARN] ${loginPrompt}`);
    if (!cfg.show || process.env.FGC_MINIMIZE == "1") {
      console.log("Skipping Unity Asset Store (requires interactive login once via --show).");
      await notify('Unity Asset Store: Not signed in. Run "ClaimGames.cmd --show --claim unity" to log in.');
      await context.close();
      process.exit(0);
    } else {
      console.log("Waiting for manual login in the browser window (up to 3 minutes)...");
      await page.waitForURL((url) => url.href.includes("assetstore.unity.com") && !url.href.includes("login") && !url.href.includes("sign-in"), { timeout: cfg.login_timeout || 18e4 });
      console.log("Login detected! Continuing to asset discovery...");
    }
  }
  console.log("Navigating to Publisher Sale page: https://assetstore.unity.com/publisher-sale ...");
  await page.goto("https://assetstore.unity.com/publisher-sale", { waitUntil: "domcontentloaded", timeout: 45e3 });
  await page.waitForTimeout(3e3);
  await page.addStyleTag({
    content: '#CybotCookiebotDialog, .onetrust-pc-dark-filter, [class*="SurveyModal"] { display: none !important; pointer-events: none !important; }'
  }).catch(() => {
  });
  const banner = page.locator("text=PUBLISHER ASSET GIVEAWAY").first();
  const hasGiveaway = await banner.isVisible().catch(() => false);
  if (!hasGiveaway) {
    console.log('No active "PUBLISHER ASSET GIVEAWAY" banner found on publisher-sale page.');
  } else {
    const bannerContainer = banner.locator('xpath=./ancestor::div[contains(@class, "rounded") or contains(@class, "flex") or contains(@class, "relative")][2]');
    const bannerText = await bannerContainer.innerText().catch(() => "") || await page.evaluate(() => document.body.innerText);
    const match = bannerText.match(/coupon code\s+([A-Z0-9_-]+)/i);
    const couponCode = match ? match[1].trim() : null;
    const giftBtn = page.locator('a:has-text("GET YOUR FREE GIFT")').first();
    const assetHref = await giftBtn.getAttribute("href").catch(() => null) || "";
    if (!couponCode || !assetHref) {
      console.warn(`[WARN] Could not parse giveaway details: coupon=${couponCode}, href=${assetHref}`);
    } else {
      const assetUrl = assetHref.startsWith("http") ? assetHref : `https://assetstore.unity.com${assetHref}`;
      const assetId = assetHref.split("-").pop() || assetHref;
      console.log(`Found weekly giveaway: Coupon=[${couponCode}], URL=[${assetUrl}]`);
      console.log(`Navigating to asset: ${assetUrl} ...`);
      await page.goto(assetUrl, { waitUntil: "domcontentloaded", timeout: 45e3 });
      await page.waitForTimeout(3e3);
      const title = (await page.locator("h1").innerText().catch(() => "Unity Free Asset")).trim();
      console.log(`Asset Title: "${title}"`);
      db.data[user][assetId] ||= { title, time: datetime(), url: assetUrl, status: "failed" };
      const notifyItem = { title, url: assetUrl, status: "failed" };
      notify_games.push(notifyItem);
      const isOwned = await page.locator('button:has-text("Open in Unity"), button:has-text("In Library")').count();
      if (isOwned > 0) {
        console.log(`  [Owned] "${title}" is already in your Unity library.`);
        db.data[user][assetId].status = "existed";
        notifyItem.status = "existed";
      } else {
        console.log(`  [Claiming] "${title}" with coupon [${couponCode}] ...`);
        if (cfg.dryrun) {
          console.log("    DRYRUN=1 -> Skip order");
        } else {
          console.log("    Checking and clearing cart...");
          await page.goto("https://assetstore.unity.com/account/cart", { waitUntil: "domcontentloaded", timeout: 35e3 });
          await page.waitForTimeout(3e3);
          const clearCartBtn = page.locator('button:has-text("Clear Cart")').first();
          if (await clearCartBtn.isVisible().catch(() => false)) {
            console.log("    Clearing existing cart items...");
            await clearCartBtn.click();
            const confirmClearBtn = page.locator('button:has-text("Confirm")').first();
            await confirmClearBtn.waitFor({ state: "visible", timeout: 5e3 }).catch(() => {
            });
            if (await confirmClearBtn.isVisible().catch(() => false)) {
              await confirmClearBtn.click();
              await page.waitForTimeout(3e3);
            }
          }
          console.log(`    Adding "${title}" to cart...`);
          await page.goto(assetUrl, { waitUntil: "domcontentloaded", timeout: 35e3 });
          await page.waitForTimeout(3e3);
          const addToCartBtn = page.locator('button[aria-label="Add to Cart"], button:has-text("Add to Cart")').first();
          if (await addToCartBtn.isVisible()) {
            await addToCartBtn.click();
            await page.waitForTimeout(3e3);
          }
          console.log("    Navigating to cart...");
          await page.goto("https://assetstore.unity.com/account/cart", { waitUntil: "domcontentloaded", timeout: 35e3 });
          await page.waitForTimeout(3e3);
          const proceedBtn = page.locator('button:has-text("Proceed to Checkout")').first();
          if (!await proceedBtn.isVisible()) {
            throw new Error("Proceed to Checkout button not found in cart");
          }
          await proceedBtn.click();
          await page.waitForTimeout(2e3);
          const acceptBtn = page.locator('button:has-text("Accept")').filter({ hasText: "Accept" }).last();
          if (await acceptBtn.isVisible().catch(() => false)) {
            console.log("    Accepting Terms of Service modal...");
            await acceptBtn.click();
          }
          for (let i = 0; i < 20; i++) {
            await page.waitForTimeout(1e3);
            if (page.url().includes("pay.unity.com") || page.url().includes("checkout")) break;
          }
          await page.waitForTimeout(3e3);
          const addressForm = page.locator("#org_address_form");
          if (await addressForm.isVisible().catch(() => false)) {
            console.log("    Completing required billing address fields...");
            const regionSelect = page.locator('select[name="sta[region]"]');
            if (await regionSelect.count() > 0) {
              await regionSelect.selectOption({ index: 1 }).catch(() => {
              });
            }
            const setField = async (selector, val) => {
              const el = page.locator(selector);
              if (await el.count() > 0 && !await el.inputValue().catch(() => "")) {
                await el.fill(val).catch(() => {
                });
              }
            };
            const defaultName = typeof user === "string" && user.split("@")[0] || "User";
            await setField('input[name="sta[firstName]"]', defaultName);
            await setField('input[name="sta[lastName]"]', "Claimer");
            await setField('input[name="sta[email]"]', typeof user === "string" && user.includes("@") ? user : `${defaultName}@example.com`);
            await setField('input[name="sta[companyName]"]', "Studio");
            await setField('input[name="sta[phoneNumber]"]', "1234567890");
            await setField('input[name="sta[streetAddress]"]', "Main Street 1");
            await setField('input[name="sta[postalCode]"]', "10001");
            await setField('input[name="sta[locality]"]', "City");
            const vatNoLabel = page.locator('label[for="vatRegisteredNo"]');
            if (await vatNoLabel.isVisible().catch(() => false)) {
              await vatNoLabel.click().catch(() => {
              });
              await page.waitForTimeout(1e3);
            }
          }
          const couponActive = await page.locator(`text=${couponCode}`).count() > 0;
          if (!couponActive) {
            console.log(`    Applying coupon: ${couponCode}...`);
            const couponInput = page.locator('dd.input input[type="text"]:visible, input[placeholder*="Coupon" i], input[placeholder*="Promo" i]').first();
            const applyBtn = page.locator('dd.input button.btn:visible, button:has-text("Apply"), button:has-text("\u041F\u0440\u0438\u043C\u0435\u043D\u0438\u0442\u044C")').first();
            if (await couponInput.isVisible()) {
              await couponInput.fill(couponCode);
              await page.waitForTimeout(1e3);
              await applyBtn.click();
              await page.waitForTimeout(4e3);
            }
          }
          console.log("    Verifying cart total is strictly $0.00 / 0.00...");
          const isZeroPrice = await page.waitForFunction(() => {
            const text = document.body.innerText;
            return /(?:Total|Итого|Сумма)[\s\S]{0,40}?(?:[$€£¥₽]\s*0(?:[.,]00)?|0(?:[.,]00)?\s*[$€£¥₽])/i.test(text);
          }, { timeout: 15e3 }).catch(() => false);
          if (!isZeroPrice) {
            throw new Error("Safety guard tripped: Cart total is not $0.00. Aborting checkout to prevent accidental charges.");
          }
          console.log("    Accepting purchase terms...");
          await page.evaluate(() => {
            const terms = document.querySelectorAll('#order_terms, input[name="term"], input[type="checkbox"]');
            terms.forEach((cb) => {
              cb.checked = true;
              cb.dispatchEvent(new Event("change", { bubbles: true }));
            });
          });
          await page.waitForTimeout(1e3);
          const payBtn = page.locator([
            'button[type="submit"]:not([disabled])',
            "button.btn:visible",
            'button:has-text("Pay now")',
            'button:has-text("Complete order")',
            'button:has-text("Confirm")',
            'button:has-text("Place order")',
            'button:has-text("\u041E\u043F\u043B\u0430\u0442\u0438\u0442\u044C")',
            'button:has-text("\u0417\u0430\u043F\u043B\u0430\u0442\u0438\u0442\u044C \u043D\u0435\u043C\u0435\u0434\u043B\u0435\u043D\u043D\u043E")',
            'button:has-text("\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C")'
          ].join(", ")).filter({ hasText: /pay|complete|confirm|order|оплат|подтверд|заказ|немедленно/i }).first();
          await payBtn.scrollIntoViewIfNeeded().catch(() => {
          });
          if (!await payBtn.isVisible()) {
            throw new Error("Checkout confirmation button not visible");
          }
          console.log("    Submitting final order...");
          await payBtn.click();
          let orderConfirmed = false;
          for (let i = 0; i < 25; i++) {
            await page.waitForTimeout(1e3);
            const url = page.url();
            if (url.includes("/confirm") || url.includes("/thank-you") || url.includes("/success") || url.includes("/orders/") && !url.includes("checkout")) {
              orderConfirmed = true;
              break;
            }
          }
          if (orderConfirmed || await page.locator("text=Thanks for your order, text=Thank you").count() > 0) {
            console.log(`    >>> Successfully claimed: "${title}"!`);
            db.data[user][assetId].status = "claimed";
            db.data[user][assetId].time = datetime();
            await recordClaimStat("unity", { title, url: assetUrl }).catch(() => {
            });
            notifyItem.status = "claimed";
            await page.screenshot({ path: screenshot(`${filenamify(title)}_${filenamify(datetime())}.png`) }).catch(() => {
            });
          } else {
            throw new Error(`Order checkout did not reach confirmation page (current URL: ${page.url()})`);
          }
        }
      }
    }
  }
} catch (error) {
  process.exitCode ||= 1;
  console.error("--- Exception in Unity claimer:", error);
  if (error.message && process.exitCode != 130) {
    notify(`Unity claimer failed: ${error.message.split("\n")[0]}`);
  }
} finally {
  await db.write();
  if (notify_games.filter((g) => g.status != "existed").length) {
    const statsSummary = await getStatsSummary().catch(() => null);
    notify(`Unity Asset Store (${user}):<br>${html_game_list(notify_games, statsSummary)}`);
  }
  await context.close();
}
console.log(datetime(), "finished checking Unity Asset Store");
