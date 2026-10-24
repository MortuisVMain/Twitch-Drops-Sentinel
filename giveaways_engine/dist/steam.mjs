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
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __commonJS = (cb, mod3) => function __require2() {
  try {
    return mod3 || (0, cb[__getOwnPropNames(cb)[0]])((mod3 = { exports: {} }).exports, mod3), mod3.exports;
  } catch (e) {
    throw mod3 = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod3, isNodeMode, target) => (target = mod3 != null ? __create(__getProtoOf(mod3)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod3 || !mod3.__esModule ? __defProp(target, "default", { value: mod3, enumerable: true }) : target,
  mod3
));
var __toCommonJS = (mod3) => __copyProps(__defProp({}, "__esModule", { value: true }), mod3);

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
      let proto2 = emitter.constructor.prototype;
      for (let key of Object.keys(proto2)) {
        let val = proto2[key];
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
    module.exports = (prompt2) => {
      prompt2.timers = prompt2.timers || {};
      let timers = prompt2.options.timers;
      if (!timers) return;
      for (let key of Object.keys(timers)) {
        let opts = timers[key];
        if (typeof opts === "number") {
          opts = { interval: opts };
        }
        create(prompt2, key, opts);
      }
    };
    function create(prompt2, name, options = {}) {
      let timer = prompt2.timers[name] = { name, start: Date.now(), ms: 0, tick: 0 };
      let ms = options.interval || 120;
      timer.frames = options.frames || [];
      timer.loading = true;
      let interval = setInterval(() => {
        timer.ms = Date.now() - timer.start;
        timer.tick++;
        prompt2.render();
      }, ms);
      timer.stop = () => {
        timer.loading = false;
        clearInterval(interval);
      };
      Reflect.defineProperty(timer, "interval", { value: interval });
      prompt2.once("close", () => timer.stop());
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
      constructor(prompt2) {
        let options = prompt2.options;
        define(this, "_prompt", prompt2);
        this.type = prompt2.type;
        this.name = prompt2.name;
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
        this.symbols = prompt2.symbols;
        this.styles = prompt2.styles;
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
        let styles3 = this.prompt.styles;
        if (this.cancelled) return styles3.cancelled;
        if (this.submitted) return styles3.submitted;
        let color = this._color || styles3[this.status];
        return typeof color === "function" ? color : styles3.pending;
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
    var styles3 = {
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
    styles3.merge = (options = {}) => {
      if (options.styles && typeof options.styles.enabled === "boolean") {
        colors.enabled = options.styles.enabled;
      }
      if (options.styles && typeof options.styles.visible === "boolean") {
        colors.visible = options.styles.visible;
      }
      let result = utils.merge({}, styles3, options.styles);
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
    module.exports = styles3;
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
    var styles3 = require_styles();
    var symbols = require_symbols2();
    var utils = require_utils();
    module.exports = (prompt2) => {
      prompt2.options = utils.merge({}, prompt2.options.theme, prompt2.options);
      prompt2.symbols = symbols.merge(prompt2.options);
      prompt2.styles = styles3.merge(prompt2.options);
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
        let { after, cursor: cursor2, initial, input, prompt: prompt2, size, value } = state;
        initial = utils.isPrimitive(initial) ? String(initial) : "";
        input = utils.isPrimitive(input) ? String(input) : "";
        value = utils.isPrimitive(value) ? String(value) : "";
        if (size) {
          let codes = ansi.cursor.up(size) + ansi.cursor.to(this.strLen(prompt2));
          let diff = input.length - cursor2;
          if (diff > 0) {
            codes += ansi.cursor.left(diff);
          }
          return codes;
        }
        if (value || after) {
          let pos = !input && !!initial ? -this.strLen(initial) : -this.strLen(input) + cursor2;
          if (after) pos -= this.strLen(after);
          if (input === "" && initial && !prompt2.includes(initial)) {
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
        let { prompt: prompt2, after, rest } = this.sections();
        let { cursor, initial = "", input = "", value = "" } = this;
        let size = this.state.size = rest.length;
        let state = { after, cursor, initial, input, prompt: prompt2, size, value };
        let codes = ansi.cursor.restore(state);
        if (codes) {
          this.stdout.write(codes);
        }
      }
      sections() {
        let { buffer, input, prompt: prompt2 } = this.state;
        prompt2 = stripAnsi(prompt2);
        let buf = stripAnsi(buffer);
        let idx = buf.indexOf(prompt2);
        let header = buf.slice(0, idx);
        let rest = buf.slice(idx);
        let lines = rest.split("\n");
        let first = lines[0];
        let last = lines[lines.length - 1];
        let promptLine = prompt2 + (input ? " " + input : "");
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
        return new Promise(async (resolve, reject) => {
          this.once("submit", resolve);
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
          let styles3 = this.styles;
          let focused = this.index === i;
          let style = focused ? styles3.primary : (val2) => val2;
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
          let styles3 = this.styles;
          let enabled = choice.enabled === true;
          let style = enabled ? styles3.success : styles3.dark;
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
    function setOptions(prompt2) {
      let isValidKey = (key) => {
        return prompt2[key] === void 0 || typeof prompt2[key] === "function";
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
      for (let key of Object.keys(prompt2.options)) {
        if (ignore.includes(key)) continue;
        if (/^on[A-Z]/.test(key)) continue;
        let option = prompt2.options[key];
        if (typeof option === "function" && isValidKey(key)) {
          if (!ignoreFn.includes(key)) {
            prompt2[key] = option.bind(prompt2);
          }
        } else if (typeof prompt2[key] !== "function") {
          prompt2[key] = option;
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
      default(prompt2, choice) {
        return choice;
      },
      checkbox(prompt2, choice) {
        throw new Error("checkbox role is not implemented yet");
      },
      editable(prompt2, choice) {
        throw new Error("editable role is not implemented yet");
      },
      expandable(prompt2, choice) {
        throw new Error("expandable role is not implemented yet");
      },
      heading(prompt2, choice) {
        choice.disabled = "";
        choice.indicator = [choice.indicator, " "].find((v) => v != null);
        choice.message = choice.message || "";
        return choice;
      },
      input(prompt2, choice) {
        throw new Error("input role is not implemented yet");
      },
      option(prompt2, choice) {
        return roles.default(prompt2, choice);
      },
      radio(prompt2, choice) {
        throw new Error("radio role is not implemented yet");
      },
      separator(prompt2, choice) {
        choice.disabled = "";
        choice.indicator = [choice.indicator, " "].find((v) => v != null);
        choice.message = choice.message || prompt2.symbols.line.repeat(5);
        return choice;
      },
      spacer(prompt2, choice) {
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
        return new Promise((resolve) => {
          let len = this.choices.length;
          let num = this.num;
          let handle = (val = false, res) => {
            clearTimeout(this.numberTimeout);
            if (val) res = number(num);
            this.num = "";
            resolve(res);
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
    function reset(prompt2, choices) {
      if (choices instanceof Promise) return choices;
      if (typeof choices === "function") {
        if (utils.isAsyncFn(choices)) return choices;
        choices = choices.call(prompt2, prompt2);
      }
      for (let choice of choices) {
        if (Array.isArray(choice.choices)) {
          let items = choice.choices.filter((ch) => !prompt2.isDisabled(ch));
          choice.enabled = items.every((ch) => ch.enabled === true);
        }
        if (prompt2.isDisabled(choice) === true) {
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
        let prompt2 = "";
        let header = await this.header();
        let prefix = await this.prefix();
        let separator = await this.separator();
        let message = await this.message();
        if (this.options.promptLine !== false) {
          prompt2 = [prefix, message, separator, ""].join(" ");
          this.state.prompt = prompt2;
        }
        let output = await this.format();
        let help = await this.error() || await this.hint();
        let body = await this.renderChoices();
        let footer = await this.footer();
        if (output) prompt2 += output;
        if (help && !prompt2.includes(help)) prompt2 += " " + help;
        if (submitted && !output && !body.trim() && this.multiple && this.emptyError != null) {
          prompt2 += this.styles.danger(this.emptyError);
        }
        this.clear(size);
        this.write([header, prompt2, body, footer].filter(Boolean).join("\n"));
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
    module.exports = (prompt2, options = {}) => {
      prompt2.cursorHide();
      let { input = "", initial = "", pos, showCursor = true, color } = options;
      let style = color || prompt2.styles.placeholder;
      let inverse = utils.inverse(prompt2.styles.primary);
      let blinker = (str) => inverse(prompt2.styles.black(str));
      let output = input;
      let char = " ";
      let reverse = blinker(char);
      if (prompt2.blink && prompt2.blink.off === true) {
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
        let raw = prompt2.styles.unstyle(output + cursor);
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
        let { state, styles: styles3 } = this;
        let { cursor, initial = "", name, input = "" } = choice;
        let { muted, submitted, primary, danger } = styles3;
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
        let style = styles3[color];
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
        let { styles: styles3, state } = this;
        return !state.submitted ? styles3.primary(value) : styles3.success(value);
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
        let prompt2 = [prefix, message, separator].filter(Boolean).join(" ");
        this.state.prompt = prompt2;
        let header = await this.header();
        let output = await this.format();
        let help = await this.error() || await this.hint();
        let footer = await this.footer();
        if (help && !output.includes(help)) output += " " + help;
        prompt2 += " " + output;
        this.clear(size);
        this.write([header, prompt2, footer].filter(Boolean).join("\n"));
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
        let prompt2 = "";
        if (this.options.promptLine !== false) {
          prompt2 = [prefix, message, separator, ""].join(" ");
          this.state.prompt = prompt2;
        }
        let header = await this.header();
        let output = await this.format();
        let key = await this.renderScaleKey();
        let help = await this.error() || await this.hint();
        let body = await this.renderChoices();
        let footer = await this.footer();
        let err = this.emptyError;
        if (output) prompt2 += output;
        if (help && !prompt2.includes(help)) prompt2 += " " + help;
        if (submitted && !output && !body.trim() && this.multiple && err != null) {
          prompt2 += this.styles.danger(err);
        }
        this.clear(size);
        this.write([header, prompt2, key, body, footer].filter(Boolean).join("\n"));
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
    module.exports = async (prompt2) => {
      let options = prompt2.options;
      let required = new Set(options.required === true ? [] : options.required || []);
      let defaults = { ...options.values, ...options.initial };
      let { tabstops, items, keys } = await tokenize(options, defaults);
      let result = createFn("result", prompt2, options);
      let format2 = createFn("format", prompt2, options);
      let isValid = createFn("validate", prompt2, options, true);
      let isVal = prompt2.isValue.bind(prompt2);
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
              value = prompt2.styles.typing(val);
              state.missing.delete(message);
            } else {
              state.values[key] = void 0;
              val = `<${message}>`;
              value = prompt2.styles.primary(val);
              item.placeholder = true;
              if (state.required.has(key)) {
                state.missing.add(message);
              }
            }
            if (state.missing.has(message) && state.validating) {
              value = prompt2.styles.warning(val);
            }
            if (state.invalid.has(key) && state.validating) {
              value = prompt2.styles.danger(val);
            }
            if (index === state.index) {
              if (before !== value) {
                value = prompt2.styles.underline(value);
              } else {
                value = prompt2.styles.heading(stripAnsi(value));
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
          if (prompt2.isValue(state.values[item.name])) {
            done++;
          }
        }
        state.completed = (done / len * 100).toFixed(0);
        state.output = lines.join("\n");
        return state.output;
      };
    };
    function createFn(prop, prompt2, options, fallback) {
      return (value, state, item, index) => {
        if (typeof item.field[prop] === "function") {
          return item.field[prop].call(prompt2, value, state, item, index);
        }
        return [fallback, value].find((v) => prompt2.isValue(v));
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
        let prompt2 = [prefix, message, separator].filter(Boolean).join(" ");
        this.state.prompt = prompt2;
        let header = await this.header();
        let error = await this.error() || "";
        let hint = await this.hint() || "";
        let body = submitted ? "" : await this.interpolate(this.state);
        let key = this.state.key = keys[index] || "";
        let input = await this.format(key);
        let footer = await this.footer();
        if (input) prompt2 += " " + input;
        if (hint && !input && this.state.completed === 0) prompt2 += " " + hint;
        this.clear(size);
        let lines = [header, prompt2, body, footer, error.trim()];
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
        let prompt2 = [prefix, message, separator].filter(Boolean).join(" ");
        this.state.prompt = prompt2;
        let header = await this.header();
        let output = await this.format();
        let help = await this.error() || await this.hint();
        let body = await this.renderChoices();
        let footer = await this.footer();
        if (output || !help) prompt2 += " " + output;
        if (help && !prompt2.includes(help)) prompt2 += " " + help;
        if (submitted && !output && !body && this.multiple && this.type !== "form") {
          prompt2 += this.styles.danger(this.emptyError);
        }
        this.clear(size);
        this.write([prompt2, header, body, footer].filter(Boolean).join("\n"));
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
        let prompt2 = [prefix, message, separator, output].join(" ");
        this.state.prompt = prompt2;
        if (help && !prompt2.includes(help)) prompt2 += " " + help;
        this.clear(size);
        this.write([header, prompt2, footer].filter(Boolean).join("\n"));
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
        let prompt2 = new this.prompts[type](opts);
        let value = get(this.answers, name);
        prompt2.state.answers = this.answers;
        prompt2.enquirer = this;
        if (name) {
          prompt2.on("submit", (value2) => {
            this.emit("answer", name, value2, prompt2);
            set(this.answers, name, value2);
          });
        }
        let emit = prompt2.emit.bind(prompt2);
        prompt2.emit = (...args) => {
          this.emit.call(this, ...args);
          return emit(...args);
        };
        this.emit("prompt", prompt2, this);
        if (opts.autofill && value != null) {
          prompt2.value = prompt2.input = value;
          if (opts.autofill === "show") {
            await prompt2.submit();
          }
        } else {
          value = prompt2.value = await prompt2.run();
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
    var os2 = __require("os");
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
      return envPath[0] === "~" ? path3.join(os2.homedir(), envPath.slice(1)) : envPath;
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

// node_modules/tslib/tslib.es6.mjs
var tslib_es6_exports = {};
__export(tslib_es6_exports, {
  __addDisposableResource: () => __addDisposableResource,
  __assign: () => __assign,
  __asyncDelegator: () => __asyncDelegator,
  __asyncGenerator: () => __asyncGenerator,
  __asyncValues: () => __asyncValues,
  __await: () => __await,
  __awaiter: () => __awaiter,
  __classPrivateFieldGet: () => __classPrivateFieldGet,
  __classPrivateFieldIn: () => __classPrivateFieldIn,
  __classPrivateFieldSet: () => __classPrivateFieldSet,
  __createBinding: () => __createBinding,
  __decorate: () => __decorate,
  __disposeResources: () => __disposeResources,
  __esDecorate: () => __esDecorate,
  __exportStar: () => __exportStar,
  __extends: () => __extends,
  __generator: () => __generator,
  __importDefault: () => __importDefault,
  __importStar: () => __importStar,
  __makeTemplateObject: () => __makeTemplateObject,
  __metadata: () => __metadata,
  __param: () => __param,
  __propKey: () => __propKey,
  __read: () => __read,
  __rest: () => __rest,
  __rewriteRelativeImportExtension: () => __rewriteRelativeImportExtension,
  __runInitializers: () => __runInitializers,
  __setFunctionName: () => __setFunctionName,
  __spread: () => __spread,
  __spreadArray: () => __spreadArray,
  __spreadArrays: () => __spreadArrays,
  __values: () => __values,
  default: () => tslib_es6_default
});
function __extends(d, b) {
  if (typeof b !== "function" && b !== null)
    throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
  extendStatics(d, b);
  function __() {
    this.constructor = d;
  }
  d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
}
function __rest(s, e) {
  var t = {};
  for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
    t[p] = s[p];
  if (s != null && typeof Object.getOwnPropertySymbols === "function")
    for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
      if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
        t[p[i]] = s[p[i]];
    }
  return t;
}
function __decorate(decorators, target, key, desc) {
  var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
  if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
  else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
  return c > 3 && r && Object.defineProperty(target, key, r), r;
}
function __param(paramIndex, decorator) {
  return function(target, key) {
    decorator(target, key, paramIndex);
  };
}
function __esDecorate(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
  function accept(f) {
    if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
    return f;
  }
  var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
  var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
  var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
  var _, done = false;
  for (var i = decorators.length - 1; i >= 0; i--) {
    var context2 = {};
    for (var p in contextIn) context2[p] = p === "access" ? {} : contextIn[p];
    for (var p in contextIn.access) context2.access[p] = contextIn.access[p];
    context2.addInitializer = function(f) {
      if (done) throw new TypeError("Cannot add initializers after decoration has completed");
      extraInitializers.push(accept(f || null));
    };
    var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context2);
    if (kind === "accessor") {
      if (result === void 0) continue;
      if (result === null || typeof result !== "object") throw new TypeError("Object expected");
      if (_ = accept(result.get)) descriptor.get = _;
      if (_ = accept(result.set)) descriptor.set = _;
      if (_ = accept(result.init)) initializers.unshift(_);
    } else if (_ = accept(result)) {
      if (kind === "field") initializers.unshift(_);
      else descriptor[key] = _;
    }
  }
  if (target) Object.defineProperty(target, contextIn.name, descriptor);
  done = true;
}
function __runInitializers(thisArg, initializers, value) {
  var useValue = arguments.length > 2;
  for (var i = 0; i < initializers.length; i++) {
    value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
  }
  return useValue ? value : void 0;
}
function __propKey(x) {
  return typeof x === "symbol" ? x : "".concat(x);
}
function __setFunctionName(f, name, prefix) {
  if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
  return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
}
function __metadata(metadataKey, metadataValue) {
  if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(metadataKey, metadataValue);
}
function __awaiter(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
}
function __generator(thisArg, body) {
  var _ = { label: 0, sent: function() {
    if (t[0] & 1) throw t[1];
    return t[1];
  }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
  return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
    return this;
  }), g;
  function verb(n) {
    return function(v) {
      return step([n, v]);
    };
  }
  function step(op) {
    if (f) throw new TypeError("Generator is already executing.");
    while (g && (g = 0, op[0] && (_ = 0)), _) try {
      if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
      if (y = 0, t) op = [op[0] & 2, t.value];
      switch (op[0]) {
        case 0:
        case 1:
          t = op;
          break;
        case 4:
          _.label++;
          return { value: op[1], done: false };
        case 5:
          _.label++;
          y = op[1];
          op = [0];
          continue;
        case 7:
          op = _.ops.pop();
          _.trys.pop();
          continue;
        default:
          if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
            _ = 0;
            continue;
          }
          if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
            _.label = op[1];
            break;
          }
          if (op[0] === 6 && _.label < t[1]) {
            _.label = t[1];
            t = op;
            break;
          }
          if (t && _.label < t[2]) {
            _.label = t[2];
            _.ops.push(op);
            break;
          }
          if (t[2]) _.ops.pop();
          _.trys.pop();
          continue;
      }
      op = body.call(thisArg, _);
    } catch (e) {
      op = [6, e];
      y = 0;
    } finally {
      f = t = 0;
    }
    if (op[0] & 5) throw op[1];
    return { value: op[0] ? op[1] : void 0, done: true };
  }
}
function __exportStar(m, o) {
  for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(o, p)) __createBinding(o, m, p);
}
function __values(o) {
  var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
  if (m) return m.call(o);
  if (o && typeof o.length === "number") return {
    next: function() {
      if (o && i >= o.length) o = void 0;
      return { value: o && o[i++], done: !o };
    }
  };
  throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
}
function __read(o, n) {
  var m = typeof Symbol === "function" && o[Symbol.iterator];
  if (!m) return o;
  var i = m.call(o), r, ar = [], e;
  try {
    while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
  } catch (error) {
    e = { error };
  } finally {
    try {
      if (r && !r.done && (m = i["return"])) m.call(i);
    } finally {
      if (e) throw e.error;
    }
  }
  return ar;
}
function __spread() {
  for (var ar = [], i = 0; i < arguments.length; i++)
    ar = ar.concat(__read(arguments[i]));
  return ar;
}
function __spreadArrays() {
  for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
  for (var r = Array(s), k = 0, i = 0; i < il; i++)
    for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
      r[k] = a[j];
  return r;
}
function __spreadArray(to, from, pack) {
  if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
    if (ar || !(i in from)) {
      if (!ar) ar = Array.prototype.slice.call(from, 0, i);
      ar[i] = from[i];
    }
  }
  return to.concat(ar || Array.prototype.slice.call(from));
}
function __await(v) {
  return this instanceof __await ? (this.v = v, this) : new __await(v);
}
function __asyncGenerator(thisArg, _arguments, generator) {
  if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
  var g = generator.apply(thisArg, _arguments || []), i, q = [];
  return i = Object.create((typeof AsyncIterator === "function" ? AsyncIterator : Object).prototype), verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function() {
    return this;
  }, i;
  function awaitReturn(f) {
    return function(v) {
      return Promise.resolve(v).then(f, reject);
    };
  }
  function verb(n, f) {
    if (g[n]) {
      i[n] = function(v) {
        return new Promise(function(a, b) {
          q.push([n, v, a, b]) > 1 || resume(n, v);
        });
      };
      if (f) i[n] = f(i[n]);
    }
  }
  function resume(n, v) {
    try {
      step(g[n](v));
    } catch (e) {
      settle(q[0][3], e);
    }
  }
  function step(r) {
    r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r);
  }
  function fulfill(value) {
    resume("next", value);
  }
  function reject(value) {
    resume("throw", value);
  }
  function settle(f, v) {
    if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]);
  }
}
function __asyncDelegator(o) {
  var i, p;
  return i = {}, verb("next"), verb("throw", function(e) {
    throw e;
  }), verb("return"), i[Symbol.iterator] = function() {
    return this;
  }, i;
  function verb(n, f) {
    i[n] = o[n] ? function(v) {
      return (p = !p) ? { value: __await(o[n](v)), done: false } : f ? f(v) : v;
    } : f;
  }
}
function __asyncValues(o) {
  if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
  var m = o[Symbol.asyncIterator], i;
  return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function() {
    return this;
  }, i);
  function verb(n) {
    i[n] = o[n] && function(v) {
      return new Promise(function(resolve, reject) {
        v = o[n](v), settle(resolve, reject, v.done, v.value);
      });
    };
  }
  function settle(resolve, reject, d, v) {
    Promise.resolve(v).then(function(v2) {
      resolve({ value: v2, done: d });
    }, reject);
  }
}
function __makeTemplateObject(cooked, raw) {
  if (Object.defineProperty) {
    Object.defineProperty(cooked, "raw", { value: raw });
  } else {
    cooked.raw = raw;
  }
  return cooked;
}
function __importStar(mod3) {
  if (mod3 && mod3.__esModule) return mod3;
  var result = {};
  if (mod3 != null) {
    for (var k = ownKeys(mod3), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod3, k[i]);
  }
  __setModuleDefault(result, mod3);
  return result;
}
function __importDefault(mod3) {
  return mod3 && mod3.__esModule ? mod3 : { default: mod3 };
}
function __classPrivateFieldGet(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
}
function __classPrivateFieldSet(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
}
function __classPrivateFieldIn(state, receiver) {
  if (receiver === null || typeof receiver !== "object" && typeof receiver !== "function") throw new TypeError("Cannot use 'in' operator on non-object");
  return typeof state === "function" ? receiver === state : state.has(receiver);
}
function __addDisposableResource(env2, value, async) {
  if (value !== null && value !== void 0) {
    if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
    var dispose, inner;
    if (async) {
      if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
      dispose = value[Symbol.asyncDispose];
    }
    if (dispose === void 0) {
      if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
      dispose = value[Symbol.dispose];
      if (async) inner = dispose;
    }
    if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
    if (inner) dispose = function() {
      try {
        inner.call(this);
      } catch (e) {
        return Promise.reject(e);
      }
    };
    env2.stack.push({ value, dispose, async });
  } else if (async) {
    env2.stack.push({ async: true });
  }
  return value;
}
function __disposeResources(env2) {
  function fail(e) {
    env2.error = env2.hasError ? new _SuppressedError(e, env2.error, "An error was suppressed during disposal.") : e;
    env2.hasError = true;
  }
  var r, s = 0;
  function next() {
    while (r = env2.stack.pop()) {
      try {
        if (!r.async && s === 1) return s = 0, env2.stack.push(r), Promise.resolve().then(next);
        if (r.dispose) {
          var result = r.dispose.call(r.value);
          if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) {
            fail(e);
            return next();
          });
        } else s |= 1;
      } catch (e) {
        fail(e);
      }
    }
    if (s === 1) return env2.hasError ? Promise.reject(env2.error) : Promise.resolve();
    if (env2.hasError) throw env2.error;
  }
  return next();
}
function __rewriteRelativeImportExtension(path3, preserveJsx) {
  if (typeof path3 === "string" && /^\.\.?\//.test(path3)) {
    return path3.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function(m, tsx, d, ext, cm) {
      return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : d + ext + "." + cm.toLowerCase() + "js";
    });
  }
  return path3;
}
var extendStatics, __assign, __createBinding, __setModuleDefault, ownKeys, _SuppressedError, tslib_es6_default;
var init_tslib_es6 = __esm({
  "node_modules/tslib/tslib.es6.mjs"() {
    extendStatics = function(d, b) {
      extendStatics = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(d2, b2) {
        d2.__proto__ = b2;
      } || function(d2, b2) {
        for (var p in b2) if (Object.prototype.hasOwnProperty.call(b2, p)) d2[p] = b2[p];
      };
      return extendStatics(d, b);
    };
    __assign = function() {
      __assign = Object.assign || function __assign2(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
          s = arguments[i];
          for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
        }
        return t;
      };
      return __assign.apply(this, arguments);
    };
    __createBinding = Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    });
    __setModuleDefault = Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    };
    ownKeys = function(o) {
      ownKeys = Object.getOwnPropertyNames || function(o2) {
        var ar = [];
        for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
        return ar;
      };
      return ownKeys(o);
    };
    _SuppressedError = typeof SuppressedError === "function" ? SuppressedError : function(error, suppressed, message) {
      var e = new Error(message);
      return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
    };
    tslib_es6_default = {
      __extends,
      __assign,
      __rest,
      __decorate,
      __param,
      __esDecorate,
      __runInitializers,
      __propKey,
      __setFunctionName,
      __metadata,
      __awaiter,
      __generator,
      __createBinding,
      __exportStar,
      __values,
      __read,
      __spread,
      __spreadArrays,
      __spreadArray,
      __await,
      __asyncGenerator,
      __asyncDelegator,
      __asyncValues,
      __makeTemplateObject,
      __importStar,
      __importDefault,
      __classPrivateFieldGet,
      __classPrivateFieldSet,
      __classPrivateFieldIn,
      __addDisposableResource,
      __disposeResources,
      __rewriteRelativeImportExtension
    };
  }
});

// node_modules/adm-zip/util/constants.js
var require_constants = __commonJS({
  "node_modules/adm-zip/util/constants.js"(exports, module) {
    module.exports = {
      /* The local file header */
      LOCHDR: 30,
      // LOC header size
      LOCSIG: 67324752,
      // "PK\003\004"
      LOCVER: 4,
      // version needed to extract
      LOCFLG: 6,
      // general purpose bit flag
      LOCHOW: 8,
      // compression method
      LOCTIM: 10,
      // modification time (2 bytes time, 2 bytes date)
      LOCCRC: 14,
      // uncompressed file crc-32 value
      LOCSIZ: 18,
      // compressed size
      LOCLEN: 22,
      // uncompressed size
      LOCNAM: 26,
      // filename length
      LOCEXT: 28,
      // extra field length
      /* The Data descriptor */
      EXTSIG: 134695760,
      // "PK\007\008"
      EXTHDR: 16,
      // EXT header size
      EXTCRC: 4,
      // uncompressed file crc-32 value
      EXTSIZ: 8,
      // compressed size
      EXTLEN: 12,
      // uncompressed size
      /* The central directory file header */
      CENHDR: 46,
      // CEN header size
      CENSIG: 33639248,
      // "PK\001\002"
      CENVEM: 4,
      // version made by
      CENVER: 6,
      // version needed to extract
      CENFLG: 8,
      // encrypt, decrypt flags
      CENHOW: 10,
      // compression method
      CENTIM: 12,
      // modification time (2 bytes time, 2 bytes date)
      CENCRC: 16,
      // uncompressed file crc-32 value
      CENSIZ: 20,
      // compressed size
      CENLEN: 24,
      // uncompressed size
      CENNAM: 28,
      // filename length
      CENEXT: 30,
      // extra field length
      CENCOM: 32,
      // file comment length
      CENDSK: 34,
      // volume number start
      CENATT: 36,
      // internal file attributes
      CENATX: 38,
      // external file attributes (host system dependent)
      CENOFF: 42,
      // LOC header offset
      /* The entries in the end of central directory */
      ENDHDR: 22,
      // END header size
      ENDSIG: 101010256,
      // "PK\005\006"
      ENDSUB: 8,
      // number of entries on this disk
      ENDTOT: 10,
      // total number of entries
      ENDSIZ: 12,
      // central directory size in bytes
      ENDOFF: 16,
      // offset of first CEN header
      ENDCOM: 20,
      // zip file comment length
      END64HDR: 20,
      // zip64 END header size
      END64SIG: 117853008,
      // zip64 Locator signature, "PK\006\007"
      END64START: 4,
      // number of the disk with the start of the zip64
      END64OFF: 8,
      // relative offset of the zip64 end of central directory
      END64NUMDISKS: 16,
      // total number of disks
      ZIP64SIG: 101075792,
      // zip64 signature, "PK\006\006"
      ZIP64HDR: 56,
      // zip64 record minimum size
      ZIP64LEAD: 12,
      // leading bytes at the start of the record, not counted by the value stored in ZIP64SIZE
      ZIP64SIZE: 4,
      // zip64 size of the central directory record
      ZIP64VEM: 12,
      // zip64 version made by
      ZIP64VER: 14,
      // zip64 version needed to extract
      ZIP64DSK: 16,
      // zip64 number of this disk
      ZIP64DSKDIR: 20,
      // number of the disk with the start of the record directory
      ZIP64SUB: 24,
      // number of entries on this disk
      ZIP64TOT: 32,
      // total number of entries
      ZIP64SIZB: 40,
      // zip64 central directory size in bytes
      ZIP64OFF: 48,
      // offset of start of central directory with respect to the starting disk number
      ZIP64EXTRA: 56,
      // extensible data sector
      /* Compression methods */
      STORED: 0,
      // no compression
      SHRUNK: 1,
      // shrunk
      REDUCED1: 2,
      // reduced with compression factor 1
      REDUCED2: 3,
      // reduced with compression factor 2
      REDUCED3: 4,
      // reduced with compression factor 3
      REDUCED4: 5,
      // reduced with compression factor 4
      IMPLODED: 6,
      // imploded
      // 7 reserved for Tokenizing compression algorithm
      DEFLATED: 8,
      // deflated
      ENHANCED_DEFLATED: 9,
      // enhanced deflated
      PKWARE: 10,
      // PKWare DCL imploded
      // 11 reserved by PKWARE
      BZIP2: 12,
      //  compressed using BZIP2
      // 13 reserved by PKWARE
      LZMA: 14,
      // LZMA
      // 15-17 reserved by PKWARE
      IBM_TERSE: 18,
      // compressed using IBM TERSE
      IBM_LZ77: 19,
      // IBM LZ77 z
      AES_ENCRYPT: 99,
      // WinZIP AES encryption method
      /* General purpose bit flag */
      // values can obtained with expression 2**bitnr
      FLG_ENC: 1,
      // Bit 0: encrypted file
      FLG_COMP1: 2,
      // Bit 1, compression option
      FLG_COMP2: 4,
      // Bit 2, compression option
      FLG_DESC: 8,
      // Bit 3, data descriptor
      FLG_ENH: 16,
      // Bit 4, enhanced deflating
      FLG_PATCH: 32,
      // Bit 5, indicates that the file is compressed patched data.
      FLG_STR: 64,
      // Bit 6, strong encryption (patented)
      // Bits 7-10: Currently unused.
      FLG_EFS: 2048,
      // Bit 11: Language encoding flag (EFS)
      // Bit 12: Reserved by PKWARE for enhanced compression.
      // Bit 13: encrypted the Central Directory (patented).
      // Bits 14-15: Reserved by PKWARE.
      FLG_MSK: 4096,
      // mask header values
      /* Load type */
      FILE: 2,
      BUFFER: 1,
      NONE: 0,
      /* 4.5 Extensible data fields */
      EF_ID: 0,
      EF_SIZE: 2,
      /* Header IDs */
      ID_ZIP64: 1,
      ID_AVINFO: 7,
      ID_PFS: 8,
      ID_OS2: 9,
      ID_NTFS: 10,
      ID_OPENVMS: 12,
      ID_UNIX: 13,
      ID_FORK: 14,
      ID_PATCH: 15,
      ID_X509_PKCS7: 20,
      ID_X509_CERTID_F: 21,
      ID_X509_CERTID_C: 22,
      ID_STRONGENC: 23,
      ID_RECORD_MGT: 24,
      ID_X509_PKCS7_RL: 25,
      ID_IBM1: 101,
      ID_IBM2: 102,
      ID_POSZIP: 18064,
      EF_ZIP64_OR_32: 4294967295,
      EF_ZIP64_OR_16: 65535,
      EF_ZIP64_SUNCOMP: 0,
      EF_ZIP64_SCOMP: 8,
      EF_ZIP64_RHO: 16,
      EF_ZIP64_DSN: 24
    };
  }
});

// node_modules/adm-zip/util/errors.js
var require_errors = __commonJS({
  "node_modules/adm-zip/util/errors.js"(exports) {
    var errors = {
      /* Header error messages */
      INVALID_LOC: "Invalid LOC header (bad signature)",
      INVALID_CEN: "Invalid CEN header (bad signature)",
      INVALID_END: "Invalid END header (bad signature)",
      /* Descriptor */
      DESCRIPTOR_NOT_EXIST: "No descriptor present",
      DESCRIPTOR_UNKNOWN: "Unknown descriptor format",
      DESCRIPTOR_FAULTY: "Descriptor data is malformed",
      /* ZipEntry error messages*/
      NO_DATA: "Nothing to decompress",
      BAD_CRC: "CRC32 checksum failed {0}",
      FILE_IN_THE_WAY: "There is a file in the way: {0}",
      UNKNOWN_METHOD: "Invalid/unsupported compression method",
      /* Inflater error messages */
      AVAIL_DATA: "inflate::Available inflate data did not terminate",
      INVALID_DISTANCE: "inflate::Invalid literal/length or distance code in fixed or dynamic block",
      TO_MANY_CODES: "inflate::Dynamic block code description: too many length or distance codes",
      INVALID_REPEAT_LEN: "inflate::Dynamic block code description: repeat more than specified lengths",
      INVALID_REPEAT_FIRST: "inflate::Dynamic block code description: repeat lengths with no first length",
      INCOMPLETE_CODES: "inflate::Dynamic block code description: code lengths codes incomplete",
      INVALID_DYN_DISTANCE: "inflate::Dynamic block code description: invalid distance code lengths",
      INVALID_CODES_LEN: "inflate::Dynamic block code description: invalid literal/length code lengths",
      INVALID_STORE_BLOCK: "inflate::Stored block length did not match one's complement",
      INVALID_BLOCK_TYPE: "inflate::Invalid block type (type == 3)",
      /* ADM-ZIP error messages */
      CANT_EXTRACT_FILE: "Could not extract the file",
      CANT_OVERRIDE: "Target file already exists",
      DISK_ENTRY_TOO_LARGE: "Number of disk entries is too large",
      NO_ZIP: "No zip file was loaded",
      NO_ENTRY: "Entry doesn't exist",
      DIRECTORY_CONTENT_ERROR: "A directory cannot have content",
      FILE_NOT_FOUND: 'File not found: "{0}"',
      NOT_IMPLEMENTED: "Not implemented",
      INVALID_FILENAME: "Invalid filename",
      INVALID_FORMAT: "Invalid or unsupported zip format. No END header found",
      INVALID_PASS_PARAM: "Incompatible password parameter",
      WRONG_PASSWORD: "Wrong Password",
      /* ADM-ZIP */
      COMMENT_TOO_LONG: "Comment is too long",
      // Comment can be max 65535 bytes long (NOTE: some non-US characters may take more space)
      EXTRA_FIELD_PARSE_ERROR: "Extra field parsing error"
    };
    function E(message) {
      return function(...args) {
        if (args.length) {
          message = message.replace(/\{(\d)\}/g, (_, n) => args[n] || "");
        }
        return new Error("ADM-ZIP: " + message);
      };
    }
    for (const msg of Object.keys(errors)) {
      exports[msg] = E(errors[msg]);
    }
  }
});

// node_modules/adm-zip/util/utils.js
var require_utils2 = __commonJS({
  "node_modules/adm-zip/util/utils.js"(exports, module) {
    var fsystem = __require("fs");
    var pth = __require("path");
    var Constants = require_constants();
    var Errors = require_errors();
    var isWin = typeof process === "object" && "win32" === process.platform;
    var is_Obj = (obj) => typeof obj === "object" && obj !== null;
    var crcTable = new Uint32Array(256).map((t, c) => {
      for (let k = 0; k < 8; k++) {
        if ((c & 1) !== 0) {
          c = 3988292384 ^ c >>> 1;
        } else {
          c >>>= 1;
        }
      }
      return c >>> 0;
    });
    function Utils(opts) {
      this.sep = pth.sep;
      this.fs = fsystem;
      if (is_Obj(opts)) {
        if (is_Obj(opts.fs) && typeof opts.fs.statSync === "function") {
          this.fs = opts.fs;
        }
      }
    }
    module.exports = Utils;
    Utils.prototype.makeDir = function(folder) {
      const self2 = this;
      function mkdirSync(fpath) {
        let resolvedPath = fpath.split(self2.sep)[0];
        fpath.split(self2.sep).forEach(function(name) {
          if (!name || name.substr(-1, 1) === ":") return;
          resolvedPath += self2.sep + name;
          var stat;
          try {
            stat = self2.fs.statSync(resolvedPath);
          } catch (e) {
            self2.fs.mkdirSync(resolvedPath);
          }
          if (stat && stat.isFile()) throw Errors.FILE_IN_THE_WAY(`"${resolvedPath}"`);
        });
      }
      mkdirSync(folder);
    };
    Utils.prototype.writeFileTo = function(path3, content, overwrite, attr) {
      const self2 = this;
      if (self2.fs.existsSync(path3)) {
        if (!overwrite) return false;
        var stat = self2.fs.statSync(path3);
        if (stat.isDirectory()) {
          return false;
        }
      }
      var folder = pth.dirname(path3);
      if (!self2.fs.existsSync(folder)) {
        self2.makeDir(folder);
      }
      var fd;
      try {
        fd = self2.fs.openSync(path3, "w", 438);
      } catch (e) {
        self2.fs.chmodSync(path3, 438);
        fd = self2.fs.openSync(path3, "w", 438);
      }
      if (fd) {
        try {
          self2.fs.writeSync(fd, content, 0, content.length, 0);
        } finally {
          self2.fs.closeSync(fd);
        }
      }
      self2.fs.chmodSync(path3, attr || 438);
      return true;
    };
    Utils.prototype.writeFileToAsync = function(path3, content, overwrite, attr, callback) {
      if (typeof attr === "function") {
        callback = attr;
        attr = void 0;
      }
      const self2 = this;
      self2.fs.exists(path3, function(exist) {
        if (exist && !overwrite) return callback(false);
        self2.fs.stat(path3, function(err, stat) {
          if (exist && stat.isDirectory()) {
            return callback(false);
          }
          var folder = pth.dirname(path3);
          self2.fs.exists(folder, function(exists) {
            if (!exists) self2.makeDir(folder);
            self2.fs.open(path3, "w", 438, function(err2, fd) {
              if (err2) {
                self2.fs.chmod(path3, 438, function() {
                  self2.fs.open(path3, "w", 438, function(err3, fd2) {
                    self2.fs.write(fd2, content, 0, content.length, 0, function() {
                      self2.fs.close(fd2, function() {
                        self2.fs.chmod(path3, attr || 438, function() {
                          callback(true);
                        });
                      });
                    });
                  });
                });
              } else if (fd) {
                self2.fs.write(fd, content, 0, content.length, 0, function() {
                  self2.fs.close(fd, function() {
                    self2.fs.chmod(path3, attr || 438, function() {
                      callback(true);
                    });
                  });
                });
              } else {
                self2.fs.chmod(path3, attr || 438, function() {
                  callback(true);
                });
              }
            });
          });
        });
      });
    };
    Utils.prototype.findFiles = function(path3) {
      const self2 = this;
      function findSync(dir, pattern, recursive) {
        if (typeof pattern === "boolean") {
          recursive = pattern;
          pattern = void 0;
        }
        let files = [];
        self2.fs.readdirSync(dir).forEach(function(file) {
          const path4 = pth.join(dir, file);
          const stat = self2.fs.statSync(path4);
          if (!pattern || pattern.test(path4)) {
            files.push(pth.normalize(path4) + (stat.isDirectory() ? self2.sep : ""));
          }
          if (stat.isDirectory() && recursive) files = files.concat(findSync(path4, pattern, recursive));
        });
        return files;
      }
      return findSync(path3, void 0, true);
    };
    Utils.prototype.findFilesAsync = function(dir, cb) {
      const self2 = this;
      let results = [];
      self2.fs.readdir(dir, function(err, list) {
        if (err) return cb(err);
        let list_length = list.length;
        if (!list_length) return cb(null, results);
        list.forEach(function(file) {
          file = pth.join(dir, file);
          self2.fs.stat(file, function(err2, stat) {
            if (err2) return cb(err2);
            if (stat) {
              results.push(pth.normalize(file) + (stat.isDirectory() ? self2.sep : ""));
              if (stat.isDirectory()) {
                self2.findFilesAsync(file, function(err3, res) {
                  if (err3) return cb(err3);
                  results = results.concat(res);
                  if (!--list_length) cb(null, results);
                });
              } else {
                if (!--list_length) cb(null, results);
              }
            }
          });
        });
      });
    };
    Utils.prototype.getAttributes = function() {
    };
    Utils.prototype.setAttributes = function() {
    };
    Utils.crc32update = function(crc, byte) {
      return crcTable[(crc ^ byte) & 255] ^ crc >>> 8;
    };
    Utils.crc32 = function(buf) {
      if (typeof buf === "string") {
        buf = Buffer.from(buf, "utf8");
      }
      let len = buf.length;
      let crc = ~0;
      for (let off = 0; off < len; ) crc = Utils.crc32update(crc, buf[off++]);
      return ~crc >>> 0;
    };
    Utils.methodToString = function(method) {
      switch (method) {
        case Constants.STORED:
          return "STORED (" + method + ")";
        case Constants.DEFLATED:
          return "DEFLATED (" + method + ")";
        default:
          return "UNSUPPORTED (" + method + ")";
      }
    };
    Utils.canonical = function(path3) {
      if (!path3) return "";
      const safeSuffix = pth.posix.normalize("/" + path3.split("\\").join("/"));
      return pth.join(".", safeSuffix);
    };
    Utils.zipnamefix = function(path3) {
      if (!path3) return "";
      const safeSuffix = pth.posix.normalize("/" + path3.split("\\").join("/"));
      return pth.posix.join(".", safeSuffix);
    };
    Utils.findLast = function(arr, callback) {
      if (!Array.isArray(arr)) throw new TypeError("arr is not array");
      const len = arr.length >>> 0;
      for (let i = len - 1; i >= 0; i--) {
        if (callback(arr[i], i, arr)) {
          return arr[i];
        }
      }
      return void 0;
    };
    Utils.sanitize = function(prefix, name) {
      prefix = pth.resolve(pth.normalize(prefix));
      var parts = name.split("/");
      for (var i = 0, l = parts.length; i < l; i++) {
        var path3 = pth.normalize(pth.join(prefix, parts.slice(i, l).join(pth.sep)));
        if (path3.indexOf(prefix) === 0) {
          return path3;
        }
      }
      return pth.normalize(pth.join(prefix, pth.basename(name)));
    };
    Utils.toBuffer = function toBuffer(input, encoder) {
      if (Buffer.isBuffer(input)) {
        return input;
      } else if (input instanceof Uint8Array) {
        return Buffer.from(input);
      } else {
        return typeof input === "string" ? encoder(input) : Buffer.alloc(0);
      }
    };
    Utils.readBigUInt64LE = function(buffer, index) {
      var slice = Buffer.from(buffer.slice(index, index + 8));
      slice.swap64();
      return parseInt(`0x${slice.toString("hex")}`);
    };
    Utils.fromDOS2Date = function(val) {
      return new Date((val >> 25 & 127) + 1980, Math.max((val >> 21 & 15) - 1, 0), Math.max(val >> 16 & 31, 1), val >> 11 & 31, val >> 5 & 63, (val & 31) << 1);
    };
    Utils.fromDate2DOS = function(val) {
      let date = 0;
      let time = 0;
      if (val.getFullYear() > 1979) {
        date = (val.getFullYear() - 1980 & 127) << 9 | val.getMonth() + 1 << 5 | val.getDate();
        time = val.getHours() << 11 | val.getMinutes() << 5 | val.getSeconds() >> 1;
      }
      return date << 16 | time;
    };
    Utils.isWin = isWin;
    Utils.crcTable = crcTable;
  }
});

// node_modules/adm-zip/util/fattr.js
var require_fattr = __commonJS({
  "node_modules/adm-zip/util/fattr.js"(exports, module) {
    var pth = __require("path");
    module.exports = function(path3, { fs: fs2 }) {
      var _path = path3 || "", _obj = newAttr(), _stat = null;
      function newAttr() {
        return {
          directory: false,
          readonly: false,
          hidden: false,
          executable: false,
          mtime: 0,
          atime: 0
        };
      }
      if (_path && fs2.existsSync(_path)) {
        _stat = fs2.statSync(_path);
        _obj.directory = _stat.isDirectory();
        _obj.mtime = _stat.mtime;
        _obj.atime = _stat.atime;
        _obj.executable = (73 & _stat.mode) !== 0;
        _obj.readonly = (128 & _stat.mode) === 0;
        _obj.hidden = pth.basename(_path)[0] === ".";
      } else {
        console.warn("Invalid path: " + _path);
      }
      return {
        get directory() {
          return _obj.directory;
        },
        get readOnly() {
          return _obj.readonly;
        },
        get hidden() {
          return _obj.hidden;
        },
        get mtime() {
          return _obj.mtime;
        },
        get atime() {
          return _obj.atime;
        },
        get executable() {
          return _obj.executable;
        },
        decodeAttributes: function() {
        },
        encodeAttributes: function() {
        },
        toJSON: function() {
          return {
            path: _path,
            isDirectory: _obj.directory,
            isReadOnly: _obj.readonly,
            isHidden: _obj.hidden,
            isExecutable: _obj.executable,
            mTime: _obj.mtime,
            aTime: _obj.atime
          };
        },
        toString: function() {
          return JSON.stringify(this.toJSON(), null, "	");
        }
      };
    };
  }
});

// node_modules/adm-zip/util/decoder.js
var require_decoder = __commonJS({
  "node_modules/adm-zip/util/decoder.js"(exports, module) {
    module.exports = {
      efs: true,
      encode: (data) => Buffer.from(data, "utf8"),
      decode: (data) => data.toString("utf8")
    };
  }
});

// node_modules/adm-zip/util/index.js
var require_util = __commonJS({
  "node_modules/adm-zip/util/index.js"(exports, module) {
    module.exports = require_utils2();
    module.exports.Constants = require_constants();
    module.exports.Errors = require_errors();
    module.exports.FileAttr = require_fattr();
    module.exports.decoder = require_decoder();
  }
});

// node_modules/adm-zip/headers/entryHeader.js
var require_entryHeader = __commonJS({
  "node_modules/adm-zip/headers/entryHeader.js"(exports, module) {
    var Utils = require_util();
    var Constants = Utils.Constants;
    module.exports = function() {
      var _verMade = 20, _version = 10, _flags = 0, _method = 0, _time = 0, _crc = 0, _compressedSize = 0, _size = 0, _fnameLen = 0, _extraLen = 0, _comLen = 0, _diskStart = 0, _inattr = 0, _attr = 0, _offset = 0;
      _verMade |= Utils.isWin ? 2560 : 768;
      _flags |= Constants.FLG_EFS;
      const _localHeader = {
        extraLen: 0
      };
      const uint32 = (val) => Math.max(0, val) >>> 0;
      const uint16 = (val) => Math.max(0, val) & 65535;
      const uint8 = (val) => Math.max(0, val) & 255;
      _time = Utils.fromDate2DOS(/* @__PURE__ */ new Date());
      return {
        get made() {
          return _verMade;
        },
        set made(val) {
          _verMade = val;
        },
        get version() {
          return _version;
        },
        set version(val) {
          _version = val;
        },
        get flags() {
          return _flags;
        },
        set flags(val) {
          _flags = val;
        },
        get flags_efs() {
          return (_flags & Constants.FLG_EFS) > 0;
        },
        set flags_efs(val) {
          if (val) {
            _flags |= Constants.FLG_EFS;
          } else {
            _flags &= ~Constants.FLG_EFS;
          }
        },
        get flags_desc() {
          return (_flags & Constants.FLG_DESC) > 0;
        },
        set flags_desc(val) {
          if (val) {
            _flags |= Constants.FLG_DESC;
          } else {
            _flags &= ~Constants.FLG_DESC;
          }
        },
        get method() {
          return _method;
        },
        set method(val) {
          switch (val) {
            case Constants.STORED:
              this.version = 10;
            case Constants.DEFLATED:
            default:
              this.version = 20;
          }
          _method = val;
        },
        get time() {
          return Utils.fromDOS2Date(this.timeval);
        },
        set time(val) {
          this.timeval = Utils.fromDate2DOS(val);
        },
        get timeval() {
          return _time;
        },
        set timeval(val) {
          _time = uint32(val);
        },
        get timeHighByte() {
          return uint8(_time >>> 8);
        },
        get crc() {
          return _crc;
        },
        set crc(val) {
          _crc = uint32(val);
        },
        get compressedSize() {
          return _compressedSize;
        },
        set compressedSize(val) {
          _compressedSize = uint32(val);
        },
        get size() {
          return _size;
        },
        set size(val) {
          _size = uint32(val);
        },
        get fileNameLength() {
          return _fnameLen;
        },
        set fileNameLength(val) {
          _fnameLen = val;
        },
        get extraLength() {
          return _extraLen;
        },
        set extraLength(val) {
          _extraLen = val;
        },
        get extraLocalLength() {
          return _localHeader.extraLen;
        },
        set extraLocalLength(val) {
          _localHeader.extraLen = val;
        },
        get commentLength() {
          return _comLen;
        },
        set commentLength(val) {
          _comLen = val;
        },
        get diskNumStart() {
          return _diskStart;
        },
        set diskNumStart(val) {
          _diskStart = uint32(val);
        },
        get inAttr() {
          return _inattr;
        },
        set inAttr(val) {
          _inattr = uint32(val);
        },
        get attr() {
          return _attr;
        },
        set attr(val) {
          _attr = uint32(val);
        },
        // get Unix file permissions
        get fileAttr() {
          return (_attr || 0) >> 16 & 4095;
        },
        get offset() {
          return _offset;
        },
        set offset(val) {
          _offset = uint32(val);
        },
        get encrypted() {
          return (_flags & Constants.FLG_ENC) === Constants.FLG_ENC;
        },
        get centralHeaderSize() {
          return Constants.CENHDR + _fnameLen + _extraLen + _comLen;
        },
        get realDataOffset() {
          return _offset + Constants.LOCHDR + _localHeader.fnameLen + _localHeader.extraLen;
        },
        get localHeader() {
          return _localHeader;
        },
        loadLocalHeaderFromBinary: function(input) {
          var data = input.slice(_offset, _offset + Constants.LOCHDR);
          if (data.readUInt32LE(0) !== Constants.LOCSIG) {
            throw Utils.Errors.INVALID_LOC();
          }
          _localHeader.version = data.readUInt16LE(Constants.LOCVER);
          _localHeader.flags = data.readUInt16LE(Constants.LOCFLG);
          _localHeader.method = data.readUInt16LE(Constants.LOCHOW);
          _localHeader.time = data.readUInt32LE(Constants.LOCTIM);
          _localHeader.crc = data.readUInt32LE(Constants.LOCCRC);
          _localHeader.compressedSize = data.readUInt32LE(Constants.LOCSIZ);
          _localHeader.size = data.readUInt32LE(Constants.LOCLEN);
          _localHeader.fnameLen = data.readUInt16LE(Constants.LOCNAM);
          _localHeader.extraLen = data.readUInt16LE(Constants.LOCEXT);
          const extraStart = _offset + Constants.LOCHDR + _localHeader.fnameLen;
          const extraEnd = extraStart + _localHeader.extraLen;
          return input.slice(extraStart, extraEnd);
        },
        loadFromBinary: function(data) {
          if (data.length !== Constants.CENHDR || data.readUInt32LE(0) !== Constants.CENSIG) {
            throw Utils.Errors.INVALID_CEN();
          }
          _verMade = data.readUInt16LE(Constants.CENVEM);
          _version = data.readUInt16LE(Constants.CENVER);
          _flags = data.readUInt16LE(Constants.CENFLG);
          _method = data.readUInt16LE(Constants.CENHOW);
          _time = data.readUInt32LE(Constants.CENTIM);
          _crc = data.readUInt32LE(Constants.CENCRC);
          _compressedSize = data.readUInt32LE(Constants.CENSIZ);
          _size = data.readUInt32LE(Constants.CENLEN);
          _fnameLen = data.readUInt16LE(Constants.CENNAM);
          _extraLen = data.readUInt16LE(Constants.CENEXT);
          _comLen = data.readUInt16LE(Constants.CENCOM);
          _diskStart = data.readUInt16LE(Constants.CENDSK);
          _inattr = data.readUInt16LE(Constants.CENATT);
          _attr = data.readUInt32LE(Constants.CENATX);
          _offset = data.readUInt32LE(Constants.CENOFF);
        },
        localHeaderToBinary: function() {
          var data = Buffer.alloc(Constants.LOCHDR);
          data.writeUInt32LE(Constants.LOCSIG, 0);
          data.writeUInt16LE(_version, Constants.LOCVER);
          data.writeUInt16LE(_flags, Constants.LOCFLG);
          data.writeUInt16LE(_method, Constants.LOCHOW);
          data.writeUInt32LE(_time, Constants.LOCTIM);
          data.writeUInt32LE(_crc, Constants.LOCCRC);
          data.writeUInt32LE(_compressedSize, Constants.LOCSIZ);
          data.writeUInt32LE(_size, Constants.LOCLEN);
          data.writeUInt16LE(_fnameLen, Constants.LOCNAM);
          data.writeUInt16LE(_localHeader.extraLen, Constants.LOCEXT);
          return data;
        },
        centralHeaderToBinary: function() {
          var data = Buffer.alloc(Constants.CENHDR + _fnameLen + _extraLen + _comLen);
          data.writeUInt32LE(Constants.CENSIG, 0);
          data.writeUInt16LE(_verMade, Constants.CENVEM);
          data.writeUInt16LE(_version, Constants.CENVER);
          data.writeUInt16LE(_flags, Constants.CENFLG);
          data.writeUInt16LE(_method, Constants.CENHOW);
          data.writeUInt32LE(_time, Constants.CENTIM);
          data.writeUInt32LE(_crc, Constants.CENCRC);
          data.writeUInt32LE(_compressedSize, Constants.CENSIZ);
          data.writeUInt32LE(_size, Constants.CENLEN);
          data.writeUInt16LE(_fnameLen, Constants.CENNAM);
          data.writeUInt16LE(_extraLen, Constants.CENEXT);
          data.writeUInt16LE(_comLen, Constants.CENCOM);
          data.writeUInt16LE(_diskStart, Constants.CENDSK);
          data.writeUInt16LE(_inattr, Constants.CENATT);
          data.writeUInt32LE(_attr, Constants.CENATX);
          data.writeUInt32LE(_offset, Constants.CENOFF);
          return data;
        },
        toJSON: function() {
          const bytes = function(nr) {
            return nr + " bytes";
          };
          return {
            made: _verMade,
            version: _version,
            flags: _flags,
            method: Utils.methodToString(_method),
            time: this.time,
            crc: "0x" + _crc.toString(16).toUpperCase(),
            compressedSize: bytes(_compressedSize),
            size: bytes(_size),
            fileNameLength: bytes(_fnameLen),
            extraLength: bytes(_extraLen),
            commentLength: bytes(_comLen),
            diskNumStart: _diskStart,
            inAttr: _inattr,
            attr: _attr,
            offset: _offset,
            centralHeaderSize: bytes(Constants.CENHDR + _fnameLen + _extraLen + _comLen)
          };
        },
        toString: function() {
          return JSON.stringify(this.toJSON(), null, "	");
        }
      };
    };
  }
});

// node_modules/adm-zip/headers/mainHeader.js
var require_mainHeader = __commonJS({
  "node_modules/adm-zip/headers/mainHeader.js"(exports, module) {
    var Utils = require_util();
    var Constants = Utils.Constants;
    module.exports = function() {
      var _volumeEntries = 0, _totalEntries = 0, _size = 0, _offset = 0, _commentLength = 0;
      return {
        get diskEntries() {
          return _volumeEntries;
        },
        set diskEntries(val) {
          _volumeEntries = _totalEntries = val;
        },
        get totalEntries() {
          return _totalEntries;
        },
        set totalEntries(val) {
          _totalEntries = _volumeEntries = val;
        },
        get size() {
          return _size;
        },
        set size(val) {
          _size = val;
        },
        get offset() {
          return _offset;
        },
        set offset(val) {
          _offset = val;
        },
        get commentLength() {
          return _commentLength;
        },
        set commentLength(val) {
          _commentLength = val;
        },
        get mainHeaderSize() {
          return Constants.ENDHDR + _commentLength;
        },
        loadFromBinary: function(data) {
          if ((data.length !== Constants.ENDHDR || data.readUInt32LE(0) !== Constants.ENDSIG) && (data.length < Constants.ZIP64HDR || data.readUInt32LE(0) !== Constants.ZIP64SIG)) {
            throw Utils.Errors.INVALID_END();
          }
          if (data.readUInt32LE(0) === Constants.ENDSIG) {
            _volumeEntries = data.readUInt16LE(Constants.ENDSUB);
            _totalEntries = data.readUInt16LE(Constants.ENDTOT);
            _size = data.readUInt32LE(Constants.ENDSIZ);
            _offset = data.readUInt32LE(Constants.ENDOFF);
            _commentLength = data.readUInt16LE(Constants.ENDCOM);
          } else {
            _volumeEntries = Utils.readBigUInt64LE(data, Constants.ZIP64SUB);
            _totalEntries = Utils.readBigUInt64LE(data, Constants.ZIP64TOT);
            _size = Utils.readBigUInt64LE(data, Constants.ZIP64SIZE);
            _offset = Utils.readBigUInt64LE(data, Constants.ZIP64OFF);
            _commentLength = 0;
          }
        },
        toBinary: function() {
          var b = Buffer.alloc(Constants.ENDHDR + _commentLength);
          b.writeUInt32LE(Constants.ENDSIG, 0);
          b.writeUInt32LE(0, 4);
          b.writeUInt16LE(_volumeEntries, Constants.ENDSUB);
          b.writeUInt16LE(_totalEntries, Constants.ENDTOT);
          b.writeUInt32LE(_size, Constants.ENDSIZ);
          b.writeUInt32LE(_offset, Constants.ENDOFF);
          b.writeUInt16LE(_commentLength, Constants.ENDCOM);
          b.fill(" ", Constants.ENDHDR);
          return b;
        },
        toJSON: function() {
          const offset = function(nr, len) {
            let offs = nr.toString(16).toUpperCase();
            while (offs.length < len) offs = "0" + offs;
            return "0x" + offs;
          };
          return {
            diskEntries: _volumeEntries,
            totalEntries: _totalEntries,
            size: _size + " bytes",
            offset: offset(_offset, 4),
            commentLength: _commentLength
          };
        },
        toString: function() {
          return JSON.stringify(this.toJSON(), null, "	");
        }
      };
    };
  }
});

// node_modules/adm-zip/headers/index.js
var require_headers = __commonJS({
  "node_modules/adm-zip/headers/index.js"(exports) {
    exports.EntryHeader = require_entryHeader();
    exports.MainHeader = require_mainHeader();
  }
});

// node_modules/adm-zip/methods/deflater.js
var require_deflater = __commonJS({
  "node_modules/adm-zip/methods/deflater.js"(exports, module) {
    module.exports = function(inbuf) {
      var zlib = __require("zlib");
      var opts = { chunkSize: (parseInt(inbuf.length / 1024) + 1) * 1024 };
      return {
        deflate: function() {
          return zlib.deflateRawSync(inbuf, opts);
        },
        deflateAsync: function(callback) {
          var tmp = zlib.createDeflateRaw(opts), parts = [], total = 0;
          tmp.on("data", function(data) {
            parts.push(data);
            total += data.length;
          });
          tmp.on("end", function() {
            var buf = Buffer.alloc(total), written = 0;
            buf.fill(0);
            for (var i = 0; i < parts.length; i++) {
              var part = parts[i];
              part.copy(buf, written);
              written += part.length;
            }
            callback && callback(buf);
          });
          tmp.end(inbuf);
        }
      };
    };
  }
});

// node_modules/adm-zip/methods/inflater.js
var require_inflater = __commonJS({
  "node_modules/adm-zip/methods/inflater.js"(exports, module) {
    var version = +(process.versions ? process.versions.node : "").split(".")[0] || 0;
    module.exports = function(inbuf, expectedLength) {
      var zlib = __require("zlib");
      const option = version >= 15 && expectedLength > 0 ? { maxOutputLength: expectedLength } : {};
      return {
        inflate: function() {
          return zlib.inflateRawSync(inbuf, option);
        },
        inflateAsync: function(callback) {
          var tmp = zlib.createInflateRaw(option), parts = [], total = 0;
          tmp.on("data", function(data) {
            parts.push(data);
            total += data.length;
          });
          tmp.on("end", function() {
            var buf = Buffer.alloc(total), written = 0;
            buf.fill(0);
            for (var i = 0; i < parts.length; i++) {
              var part = parts[i];
              part.copy(buf, written);
              written += part.length;
            }
            callback && callback(buf);
          });
          tmp.end(inbuf);
        }
      };
    };
  }
});

// node_modules/adm-zip/methods/zipcrypto.js
var require_zipcrypto = __commonJS({
  "node_modules/adm-zip/methods/zipcrypto.js"(exports, module) {
    "use strict";
    var { randomFillSync } = __require("crypto");
    var Errors = require_errors();
    var crctable = new Uint32Array(256).map((t, crc) => {
      for (let j = 0; j < 8; j++) {
        if (0 !== (crc & 1)) {
          crc = crc >>> 1 ^ 3988292384;
        } else {
          crc >>>= 1;
        }
      }
      return crc >>> 0;
    });
    var uMul = (a, b) => Math.imul(a, b) >>> 0;
    var crc32update = (pCrc32, bval) => {
      return crctable[(pCrc32 ^ bval) & 255] ^ pCrc32 >>> 8;
    };
    var genSalt = () => {
      if ("function" === typeof randomFillSync) {
        return randomFillSync(Buffer.alloc(12));
      } else {
        return genSalt.node();
      }
    };
    genSalt.node = () => {
      const salt = Buffer.alloc(12);
      const len = salt.length;
      for (let i = 0; i < len; i++) salt[i] = Math.random() * 256 & 255;
      return salt;
    };
    var config2 = {
      genSalt
    };
    function Initkeys(pw) {
      const pass = Buffer.isBuffer(pw) ? pw : Buffer.from(pw);
      this.keys = new Uint32Array([305419896, 591751049, 878082192]);
      for (let i = 0; i < pass.length; i++) {
        this.updateKeys(pass[i]);
      }
    }
    Initkeys.prototype.updateKeys = function(byteValue) {
      const keys = this.keys;
      keys[0] = crc32update(keys[0], byteValue);
      keys[1] += keys[0] & 255;
      keys[1] = uMul(keys[1], 134775813) + 1;
      keys[2] = crc32update(keys[2], keys[1] >>> 24);
      return byteValue;
    };
    Initkeys.prototype.next = function() {
      const k = (this.keys[2] | 2) >>> 0;
      return uMul(k, k ^ 1) >> 8 & 255;
    };
    function make_decrypter(pwd) {
      const keys = new Initkeys(pwd);
      return function(data) {
        const result = Buffer.alloc(data.length);
        let pos = 0;
        for (let c of data) {
          result[pos++] = keys.updateKeys(c ^ keys.next());
        }
        return result;
      };
    }
    function make_encrypter(pwd) {
      const keys = new Initkeys(pwd);
      return function(data, result, pos = 0) {
        if (!result) result = Buffer.alloc(data.length);
        for (let c of data) {
          const k = keys.next();
          result[pos++] = c ^ k;
          keys.updateKeys(c);
        }
        return result;
      };
    }
    function decrypt(data, header, pwd) {
      if (!data || !Buffer.isBuffer(data) || data.length < 12) {
        return Buffer.alloc(0);
      }
      const decrypter = make_decrypter(pwd);
      const salt = decrypter(data.slice(0, 12));
      const verifyByte = (header.flags & 8) === 8 ? header.timeHighByte : header.crc >>> 24;
      if (salt[11] !== verifyByte) {
        throw Errors.WRONG_PASSWORD();
      }
      return decrypter(data.slice(12));
    }
    function _salter(data) {
      if (Buffer.isBuffer(data) && data.length >= 12) {
        config2.genSalt = function() {
          return data.slice(0, 12);
        };
      } else if (data === "node") {
        config2.genSalt = genSalt.node;
      } else {
        config2.genSalt = genSalt;
      }
    }
    function encrypt(data, header, pwd, oldlike = false) {
      if (data == null) data = Buffer.alloc(0);
      if (!Buffer.isBuffer(data)) data = Buffer.from(data.toString());
      const encrypter = make_encrypter(pwd);
      const salt = config2.genSalt();
      salt[11] = header.crc >>> 24 & 255;
      if (oldlike) salt[10] = header.crc >>> 16 & 255;
      const result = Buffer.alloc(data.length + 12);
      encrypter(salt, result);
      return encrypter(data, result, 12);
    }
    module.exports = { decrypt, encrypt, _salter };
  }
});

// node_modules/adm-zip/methods/index.js
var require_methods = __commonJS({
  "node_modules/adm-zip/methods/index.js"(exports) {
    exports.Deflater = require_deflater();
    exports.Inflater = require_inflater();
    exports.ZipCrypto = require_zipcrypto();
  }
});

// node_modules/adm-zip/zipEntry.js
var require_zipEntry = __commonJS({
  "node_modules/adm-zip/zipEntry.js"(exports, module) {
    var Utils = require_util();
    var Headers = require_headers();
    var Constants = Utils.Constants;
    var Methods = require_methods();
    module.exports = function(options, input) {
      var _centralHeader = new Headers.EntryHeader(), _entryName = Buffer.alloc(0), _comment = Buffer.alloc(0), _isDirectory = false, uncompressedData = null, _extra = Buffer.alloc(0), _extralocal = Buffer.alloc(0), _efs = true;
      const opts = options;
      const decoder = typeof opts.decoder === "object" ? opts.decoder : Utils.decoder;
      _efs = decoder.hasOwnProperty("efs") ? decoder.efs : false;
      function getCompressedDataFromZip() {
        if (!input || !(input instanceof Uint8Array)) {
          return Buffer.alloc(0);
        }
        _extralocal = _centralHeader.loadLocalHeaderFromBinary(input);
        return input.slice(_centralHeader.realDataOffset, _centralHeader.realDataOffset + _centralHeader.compressedSize);
      }
      function crc32OK(data) {
        if (!_centralHeader.flags_desc) {
          if (Utils.crc32(data) !== _centralHeader.localHeader.crc) {
            return false;
          }
        } else {
          const descriptor = {};
          const dataEndOffset = _centralHeader.realDataOffset + _centralHeader.compressedSize;
          if (input.readUInt32LE(dataEndOffset) == Constants.LOCSIG || input.readUInt32LE(dataEndOffset) == Constants.CENSIG) {
            throw Utils.Errors.DESCRIPTOR_NOT_EXIST();
          }
          if (input.readUInt32LE(dataEndOffset) == Constants.EXTSIG) {
            descriptor.crc = input.readUInt32LE(dataEndOffset + Constants.EXTCRC);
            descriptor.compressedSize = input.readUInt32LE(dataEndOffset + Constants.EXTSIZ);
            descriptor.size = input.readUInt32LE(dataEndOffset + Constants.EXTLEN);
          } else if (input.readUInt16LE(dataEndOffset + 12) === 19280) {
            descriptor.crc = input.readUInt32LE(dataEndOffset + Constants.EXTCRC - 4);
            descriptor.compressedSize = input.readUInt32LE(dataEndOffset + Constants.EXTSIZ - 4);
            descriptor.size = input.readUInt32LE(dataEndOffset + Constants.EXTLEN - 4);
          } else {
            throw Utils.Errors.DESCRIPTOR_UNKNOWN();
          }
          if (descriptor.compressedSize !== _centralHeader.compressedSize || descriptor.size !== _centralHeader.size || descriptor.crc !== _centralHeader.crc) {
            throw Utils.Errors.DESCRIPTOR_FAULTY();
          }
          if (Utils.crc32(data) !== descriptor.crc) {
            return false;
          }
        }
        return true;
      }
      function decompress(async, callback, pass) {
        if (typeof callback === "undefined" && typeof async === "string") {
          pass = async;
          async = void 0;
        }
        if (_isDirectory) {
          if (async && callback) {
            callback(Buffer.alloc(0), Utils.Errors.DIRECTORY_CONTENT_ERROR());
          }
          return Buffer.alloc(0);
        }
        var compressedData = getCompressedDataFromZip();
        if (compressedData.length === 0) {
          if (async && callback) callback(compressedData);
          return compressedData;
        }
        if (_centralHeader.encrypted) {
          if ("string" !== typeof pass && !Buffer.isBuffer(pass)) {
            throw Utils.Errors.INVALID_PASS_PARAM();
          }
          compressedData = Methods.ZipCrypto.decrypt(compressedData, _centralHeader, pass);
        }
        var data = Buffer.alloc(_centralHeader.size);
        switch (_centralHeader.method) {
          case Utils.Constants.STORED:
            compressedData.copy(data);
            if (!crc32OK(data)) {
              if (async && callback) callback(data, Utils.Errors.BAD_CRC());
              throw Utils.Errors.BAD_CRC();
            } else {
              if (async && callback) callback(data);
              return data;
            }
          case Utils.Constants.DEFLATED:
            var inflater = new Methods.Inflater(compressedData, _centralHeader.size);
            if (!async) {
              const result = inflater.inflate(data);
              result.copy(data, 0);
              if (!crc32OK(data)) {
                throw Utils.Errors.BAD_CRC(`"${decoder.decode(_entryName)}"`);
              }
              return data;
            } else {
              inflater.inflateAsync(function(result) {
                result.copy(result, 0);
                if (callback) {
                  if (!crc32OK(result)) {
                    callback(result, Utils.Errors.BAD_CRC());
                  } else {
                    callback(result);
                  }
                }
              });
            }
            break;
          default:
            if (async && callback) callback(Buffer.alloc(0), Utils.Errors.UNKNOWN_METHOD());
            throw Utils.Errors.UNKNOWN_METHOD();
        }
      }
      function compress(async, callback) {
        if ((!uncompressedData || !uncompressedData.length) && Buffer.isBuffer(input)) {
          if (async && callback) callback(getCompressedDataFromZip());
          return getCompressedDataFromZip();
        }
        if (uncompressedData.length && !_isDirectory) {
          var compressedData;
          switch (_centralHeader.method) {
            case Utils.Constants.STORED:
              _centralHeader.compressedSize = _centralHeader.size;
              compressedData = Buffer.alloc(uncompressedData.length);
              uncompressedData.copy(compressedData);
              if (async && callback) callback(compressedData);
              return compressedData;
            default:
            case Utils.Constants.DEFLATED:
              var deflater = new Methods.Deflater(uncompressedData);
              if (!async) {
                var deflated = deflater.deflate();
                _centralHeader.compressedSize = deflated.length;
                return deflated;
              } else {
                deflater.deflateAsync(function(data) {
                  compressedData = Buffer.alloc(data.length);
                  _centralHeader.compressedSize = data.length;
                  data.copy(compressedData);
                  callback && callback(compressedData);
                });
              }
              deflater = null;
              break;
          }
        } else if (async && callback) {
          callback(Buffer.alloc(0));
        } else {
          return Buffer.alloc(0);
        }
      }
      function readUInt64LE(buffer, offset) {
        return (buffer.readUInt32LE(offset + 4) << 4) + buffer.readUInt32LE(offset);
      }
      function parseExtra(data) {
        try {
          var offset = 0;
          var signature, size, part;
          while (offset + 4 < data.length) {
            signature = data.readUInt16LE(offset);
            offset += 2;
            size = data.readUInt16LE(offset);
            offset += 2;
            part = data.slice(offset, offset + size);
            offset += size;
            if (Constants.ID_ZIP64 === signature) {
              parseZip64ExtendedInformation(part);
            }
          }
        } catch (error) {
          throw Utils.Errors.EXTRA_FIELD_PARSE_ERROR();
        }
      }
      function parseZip64ExtendedInformation(data) {
        var size, compressedSize, offset, diskNumStart;
        if (data.length >= Constants.EF_ZIP64_SCOMP) {
          size = readUInt64LE(data, Constants.EF_ZIP64_SUNCOMP);
          if (_centralHeader.size === Constants.EF_ZIP64_OR_32) {
            _centralHeader.size = size;
          }
        }
        if (data.length >= Constants.EF_ZIP64_RHO) {
          compressedSize = readUInt64LE(data, Constants.EF_ZIP64_SCOMP);
          if (_centralHeader.compressedSize === Constants.EF_ZIP64_OR_32) {
            _centralHeader.compressedSize = compressedSize;
          }
        }
        if (data.length >= Constants.EF_ZIP64_DSN) {
          offset = readUInt64LE(data, Constants.EF_ZIP64_RHO);
          if (_centralHeader.offset === Constants.EF_ZIP64_OR_32) {
            _centralHeader.offset = offset;
          }
        }
        if (data.length >= Constants.EF_ZIP64_DSN + 4) {
          diskNumStart = data.readUInt32LE(Constants.EF_ZIP64_DSN);
          if (_centralHeader.diskNumStart === Constants.EF_ZIP64_OR_16) {
            _centralHeader.diskNumStart = diskNumStart;
          }
        }
      }
      return {
        get entryName() {
          return decoder.decode(_entryName);
        },
        get rawEntryName() {
          return _entryName;
        },
        set entryName(val) {
          _entryName = Utils.toBuffer(val, decoder.encode);
          var lastChar = _entryName[_entryName.length - 1];
          _isDirectory = lastChar === 47 || lastChar === 92;
          _centralHeader.fileNameLength = _entryName.length;
        },
        get efs() {
          if (typeof _efs === "function") {
            return _efs(this.entryName);
          } else {
            return _efs;
          }
        },
        get extra() {
          return _extra;
        },
        set extra(val) {
          _extra = val;
          _centralHeader.extraLength = val.length;
          parseExtra(val);
        },
        get comment() {
          return decoder.decode(_comment);
        },
        set comment(val) {
          _comment = Utils.toBuffer(val, decoder.encode);
          _centralHeader.commentLength = _comment.length;
          if (_comment.length > 65535) throw Utils.Errors.COMMENT_TOO_LONG();
        },
        get name() {
          var n = decoder.decode(_entryName);
          return _isDirectory ? n.substr(n.length - 1).split("/").pop() : n.split("/").pop();
        },
        get isDirectory() {
          return _isDirectory;
        },
        getCompressedData: function() {
          return compress(false, null);
        },
        getCompressedDataAsync: function(callback) {
          compress(true, callback);
        },
        setData: function(value) {
          uncompressedData = Utils.toBuffer(value, Utils.decoder.encode);
          if (!_isDirectory && uncompressedData.length) {
            _centralHeader.size = uncompressedData.length;
            _centralHeader.method = Utils.Constants.DEFLATED;
            _centralHeader.crc = Utils.crc32(value);
            _centralHeader.changed = true;
          } else {
            _centralHeader.method = Utils.Constants.STORED;
          }
        },
        getData: function(pass) {
          if (_centralHeader.changed) {
            return uncompressedData;
          } else {
            return decompress(false, null, pass);
          }
        },
        getDataAsync: function(callback, pass) {
          if (_centralHeader.changed) {
            callback(uncompressedData);
          } else {
            decompress(true, callback, pass);
          }
        },
        set attr(attr) {
          _centralHeader.attr = attr;
        },
        get attr() {
          return _centralHeader.attr;
        },
        set header(data) {
          _centralHeader.loadFromBinary(data);
        },
        get header() {
          return _centralHeader;
        },
        packCentralHeader: function() {
          _centralHeader.flags_efs = this.efs;
          _centralHeader.extraLength = _extra.length;
          var header = _centralHeader.centralHeaderToBinary();
          var addpos = Utils.Constants.CENHDR;
          _entryName.copy(header, addpos);
          addpos += _entryName.length;
          _extra.copy(header, addpos);
          addpos += _centralHeader.extraLength;
          _comment.copy(header, addpos);
          return header;
        },
        packLocalHeader: function() {
          let addpos = 0;
          _centralHeader.flags_efs = this.efs;
          _centralHeader.extraLocalLength = _extralocal.length;
          const localHeaderBuf = _centralHeader.localHeaderToBinary();
          const localHeader = Buffer.alloc(localHeaderBuf.length + _entryName.length + _centralHeader.extraLocalLength);
          localHeaderBuf.copy(localHeader, addpos);
          addpos += localHeaderBuf.length;
          _entryName.copy(localHeader, addpos);
          addpos += _entryName.length;
          _extralocal.copy(localHeader, addpos);
          addpos += _extralocal.length;
          return localHeader;
        },
        toJSON: function() {
          const bytes = function(nr) {
            return "<" + (nr && nr.length + " bytes buffer" || "null") + ">";
          };
          return {
            entryName: this.entryName,
            name: this.name,
            comment: this.comment,
            isDirectory: this.isDirectory,
            header: _centralHeader.toJSON(),
            compressedData: bytes(input),
            data: bytes(uncompressedData)
          };
        },
        toString: function() {
          return JSON.stringify(this.toJSON(), null, "	");
        }
      };
    };
  }
});

// node_modules/adm-zip/zipFile.js
var require_zipFile = __commonJS({
  "node_modules/adm-zip/zipFile.js"(exports, module) {
    var ZipEntry = require_zipEntry();
    var Headers = require_headers();
    var Utils = require_util();
    module.exports = function(inBuffer, options) {
      var entryList = [], entryTable = {}, _comment = Buffer.alloc(0), mainHeader = new Headers.MainHeader(), loadedEntries = false;
      var password = null;
      const temporary = /* @__PURE__ */ new Set();
      const opts = options;
      const { noSort, decoder } = opts;
      if (inBuffer) {
        readMainHeader(opts.readEntries);
      } else {
        loadedEntries = true;
      }
      function makeTemporaryFolders() {
        const foldersList = /* @__PURE__ */ new Set();
        for (const elem of Object.keys(entryTable)) {
          const elements = elem.split("/");
          elements.pop();
          if (!elements.length) continue;
          for (let i = 0; i < elements.length; i++) {
            const sub = elements.slice(0, i + 1).join("/") + "/";
            foldersList.add(sub);
          }
        }
        for (const elem of foldersList) {
          if (!(elem in entryTable)) {
            const tempfolder = new ZipEntry(opts);
            tempfolder.entryName = elem;
            tempfolder.attr = 16;
            tempfolder.temporary = true;
            entryList.push(tempfolder);
            entryTable[tempfolder.entryName] = tempfolder;
            temporary.add(tempfolder);
          }
        }
      }
      function readEntries() {
        loadedEntries = true;
        entryTable = {};
        if (mainHeader.diskEntries > (inBuffer.length - mainHeader.offset) / Utils.Constants.CENHDR) {
          throw Utils.Errors.DISK_ENTRY_TOO_LARGE();
        }
        entryList = new Array(mainHeader.diskEntries);
        var index = mainHeader.offset;
        for (var i = 0; i < entryList.length; i++) {
          var tmp = index, entry = new ZipEntry(opts, inBuffer);
          entry.header = inBuffer.slice(tmp, tmp += Utils.Constants.CENHDR);
          entry.entryName = inBuffer.slice(tmp, tmp += entry.header.fileNameLength);
          if (entry.header.extraLength) {
            entry.extra = inBuffer.slice(tmp, tmp += entry.header.extraLength);
          }
          if (entry.header.commentLength) entry.comment = inBuffer.slice(tmp, tmp + entry.header.commentLength);
          index += entry.header.centralHeaderSize;
          entryList[i] = entry;
          entryTable[entry.entryName] = entry;
        }
        temporary.clear();
        makeTemporaryFolders();
      }
      function readMainHeader(readNow) {
        var i = inBuffer.length - Utils.Constants.ENDHDR, max = Math.max(0, i - 65535), n = max, endStart = inBuffer.length, endOffset = -1, commentEnd = 0;
        const trailingSpace = typeof opts.trailingSpace === "boolean" ? opts.trailingSpace : false;
        if (trailingSpace) max = 0;
        for (i; i >= n; i--) {
          if (inBuffer[i] !== 80) continue;
          if (inBuffer.readUInt32LE(i) === Utils.Constants.ENDSIG) {
            endOffset = i;
            commentEnd = i;
            endStart = i + Utils.Constants.ENDHDR;
            n = i - Utils.Constants.END64HDR;
            continue;
          }
          if (inBuffer.readUInt32LE(i) === Utils.Constants.END64SIG) {
            n = max;
            continue;
          }
          if (inBuffer.readUInt32LE(i) === Utils.Constants.ZIP64SIG) {
            endOffset = i;
            endStart = i + Utils.readBigUInt64LE(inBuffer, i + Utils.Constants.ZIP64SIZE) + Utils.Constants.ZIP64LEAD;
            break;
          }
        }
        if (endOffset == -1) throw Utils.Errors.INVALID_FORMAT();
        mainHeader.loadFromBinary(inBuffer.slice(endOffset, endStart));
        if (mainHeader.commentLength) {
          _comment = inBuffer.slice(commentEnd + Utils.Constants.ENDHDR);
        }
        if (readNow) readEntries();
      }
      function sortEntries() {
        if (entryList.length > 1 && !noSort) {
          entryList.sort((a, b) => a.entryName.toLowerCase().localeCompare(b.entryName.toLowerCase()));
        }
      }
      return {
        /**
         * Returns an array of ZipEntry objects existent in the current opened archive
         * @return Array
         */
        get entries() {
          if (!loadedEntries) {
            readEntries();
          }
          return entryList.filter((e) => !temporary.has(e));
        },
        /**
         * Archive comment
         * @return {String}
         */
        get comment() {
          return decoder.decode(_comment);
        },
        set comment(val) {
          _comment = Utils.toBuffer(val, decoder.encode);
          mainHeader.commentLength = _comment.length;
        },
        getEntryCount: function() {
          if (!loadedEntries) {
            return mainHeader.diskEntries;
          }
          return entryList.length;
        },
        forEach: function(callback) {
          this.entries.forEach(callback);
        },
        /**
         * Returns a reference to the entry with the given name or null if entry is inexistent
         *
         * @param entryName
         * @return ZipEntry
         */
        getEntry: function(entryName) {
          if (!loadedEntries) {
            readEntries();
          }
          return entryTable[entryName] || null;
        },
        /**
         * Adds the given entry to the entry list
         *
         * @param entry
         */
        setEntry: function(entry) {
          if (!loadedEntries) {
            readEntries();
          }
          entryList.push(entry);
          entryTable[entry.entryName] = entry;
          mainHeader.totalEntries = entryList.length;
        },
        /**
         * Removes the file with the given name from the entry list.
         *
         * If the entry is a directory, then all nested files and directories will be removed
         * @param entryName
         * @returns {void}
         */
        deleteFile: function(entryName, withsubfolders = true) {
          if (!loadedEntries) {
            readEntries();
          }
          const entry = entryTable[entryName];
          const list = this.getEntryChildren(entry, withsubfolders).map((child) => child.entryName);
          list.forEach(this.deleteEntry);
        },
        /**
         * Removes the entry with the given name from the entry list.
         *
         * @param {string} entryName
         * @returns {void}
         */
        deleteEntry: function(entryName) {
          if (!loadedEntries) {
            readEntries();
          }
          const entry = entryTable[entryName];
          const index = entryList.indexOf(entry);
          if (index >= 0) {
            entryList.splice(index, 1);
            delete entryTable[entryName];
            mainHeader.totalEntries = entryList.length;
          }
        },
        /**
         *  Iterates and returns all nested files and directories of the given entry
         *
         * @param entry
         * @return Array
         */
        getEntryChildren: function(entry, subfolders = true) {
          if (!loadedEntries) {
            readEntries();
          }
          if (typeof entry === "object") {
            if (entry.isDirectory && subfolders) {
              const list = [];
              const name = entry.entryName;
              for (const zipEntry of entryList) {
                if (zipEntry.entryName.startsWith(name)) {
                  list.push(zipEntry);
                }
              }
              return list;
            } else {
              return [entry];
            }
          }
          return [];
        },
        /**
         *  How many child elements entry has
         *
         * @param {ZipEntry} entry
         * @return {integer}
         */
        getChildCount: function(entry) {
          if (entry && entry.isDirectory) {
            const list = this.getEntryChildren(entry);
            return list.includes(entry) ? list.length - 1 : list.length;
          }
          return 0;
        },
        /**
         * Returns the zip file
         *
         * @return Buffer
         */
        compressToBuffer: function() {
          if (!loadedEntries) {
            readEntries();
          }
          sortEntries();
          const dataBlock = [];
          const headerBlocks = [];
          let totalSize = 0;
          let dindex = 0;
          mainHeader.size = 0;
          mainHeader.offset = 0;
          let totalEntries = 0;
          for (const entry of this.entries) {
            const compressedData = entry.getCompressedData();
            entry.header.offset = dindex;
            const localHeader = entry.packLocalHeader();
            const dataLength = localHeader.length + compressedData.length;
            dindex += dataLength;
            dataBlock.push(localHeader);
            dataBlock.push(compressedData);
            const centralHeader = entry.packCentralHeader();
            headerBlocks.push(centralHeader);
            mainHeader.size += centralHeader.length;
            totalSize += dataLength + centralHeader.length;
            totalEntries++;
          }
          totalSize += mainHeader.mainHeaderSize;
          mainHeader.offset = dindex;
          mainHeader.totalEntries = totalEntries;
          dindex = 0;
          const outBuffer = Buffer.alloc(totalSize);
          for (const content of dataBlock) {
            content.copy(outBuffer, dindex);
            dindex += content.length;
          }
          for (const content of headerBlocks) {
            content.copy(outBuffer, dindex);
            dindex += content.length;
          }
          const mh = mainHeader.toBinary();
          if (_comment) {
            _comment.copy(mh, Utils.Constants.ENDHDR);
          }
          mh.copy(outBuffer, dindex);
          inBuffer = outBuffer;
          loadedEntries = false;
          return outBuffer;
        },
        toAsyncBuffer: function(onSuccess, onFail, onItemStart, onItemEnd) {
          try {
            if (!loadedEntries) {
              readEntries();
            }
            sortEntries();
            const dataBlock = [];
            const centralHeaders = [];
            let totalSize = 0;
            let dindex = 0;
            let totalEntries = 0;
            mainHeader.size = 0;
            mainHeader.offset = 0;
            const compress2Buffer = function(entryLists) {
              if (entryLists.length > 0) {
                const entry = entryLists.shift();
                const name = entry.entryName + entry.extra.toString();
                if (onItemStart) onItemStart(name);
                entry.getCompressedDataAsync(function(compressedData) {
                  if (onItemEnd) onItemEnd(name);
                  entry.header.offset = dindex;
                  const localHeader = entry.packLocalHeader();
                  const dataLength = localHeader.length + compressedData.length;
                  dindex += dataLength;
                  dataBlock.push(localHeader);
                  dataBlock.push(compressedData);
                  const centalHeader = entry.packCentralHeader();
                  centralHeaders.push(centalHeader);
                  mainHeader.size += centalHeader.length;
                  totalSize += dataLength + centalHeader.length;
                  totalEntries++;
                  compress2Buffer(entryLists);
                });
              } else {
                totalSize += mainHeader.mainHeaderSize;
                mainHeader.offset = dindex;
                mainHeader.totalEntries = totalEntries;
                dindex = 0;
                const outBuffer = Buffer.alloc(totalSize);
                dataBlock.forEach(function(content) {
                  content.copy(outBuffer, dindex);
                  dindex += content.length;
                });
                centralHeaders.forEach(function(content) {
                  content.copy(outBuffer, dindex);
                  dindex += content.length;
                });
                const mh = mainHeader.toBinary();
                if (_comment) {
                  _comment.copy(mh, Utils.Constants.ENDHDR);
                }
                mh.copy(outBuffer, dindex);
                inBuffer = outBuffer;
                loadedEntries = false;
                onSuccess(outBuffer);
              }
            };
            compress2Buffer(Array.from(this.entries));
          } catch (e) {
            onFail(e);
          }
        }
      };
    };
  }
});

// node_modules/adm-zip/adm-zip.js
var require_adm_zip = __commonJS({
  "node_modules/adm-zip/adm-zip.js"(exports, module) {
    var Utils = require_util();
    var pth = __require("path");
    var ZipEntry = require_zipEntry();
    var ZipFile = require_zipFile();
    var get_Bool = (...val) => Utils.findLast(val, (c) => typeof c === "boolean");
    var get_Str = (...val) => Utils.findLast(val, (c) => typeof c === "string");
    var get_Fun = (...val) => Utils.findLast(val, (c) => typeof c === "function");
    var defaultOptions = {
      // option "noSort" : if true it disables files sorting
      noSort: false,
      // read entries during load (initial loading may be slower)
      readEntries: false,
      // default method is none
      method: Utils.Constants.NONE,
      // file system
      fs: null
    };
    module.exports = function(input, options) {
      let inBuffer = null;
      const opts = Object.assign(/* @__PURE__ */ Object.create(null), defaultOptions);
      if (input && "object" === typeof input) {
        if (!(input instanceof Uint8Array)) {
          Object.assign(opts, input);
          input = opts.input ? opts.input : void 0;
          if (opts.input) delete opts.input;
        }
        if (Buffer.isBuffer(input)) {
          inBuffer = input;
          opts.method = Utils.Constants.BUFFER;
          input = void 0;
        }
      }
      Object.assign(opts, options);
      const filetools = new Utils(opts);
      if (typeof opts.decoder !== "object" || typeof opts.decoder.encode !== "function" || typeof opts.decoder.decode !== "function") {
        opts.decoder = Utils.decoder;
      }
      if (input && "string" === typeof input) {
        if (filetools.fs.existsSync(input)) {
          opts.method = Utils.Constants.FILE;
          opts.filename = input;
          inBuffer = filetools.fs.readFileSync(input);
        } else {
          throw Utils.Errors.INVALID_FILENAME();
        }
      }
      const _zip = new ZipFile(inBuffer, opts);
      const { canonical, sanitize, zipnamefix } = Utils;
      function getEntry(entry) {
        if (entry && _zip) {
          var item;
          if (typeof entry === "string") item = _zip.getEntry(pth.posix.normalize(entry));
          if (typeof entry === "object" && typeof entry.entryName !== "undefined" && typeof entry.header !== "undefined") item = _zip.getEntry(entry.entryName);
          if (item) {
            return item;
          }
        }
        return null;
      }
      function fixPath(zipPath) {
        const { join: join2, normalize, sep } = pth.posix;
        return join2(".", normalize(sep + zipPath.split("\\").join(sep) + sep));
      }
      function filenameFilter(filterfn) {
        if (filterfn instanceof RegExp) {
          return /* @__PURE__ */ (function(rx) {
            return function(filename) {
              return rx.test(filename);
            };
          })(filterfn);
        } else if ("function" !== typeof filterfn) {
          return () => true;
        }
        return filterfn;
      }
      const relativePath = (local, entry) => {
        let lastChar = entry.slice(-1);
        lastChar = lastChar === filetools.sep ? filetools.sep : "";
        return pth.relative(local, entry) + lastChar;
      };
      return {
        /**
         * Extracts the given entry from the archive and returns the content as a Buffer object
         * @param {ZipEntry|string} entry ZipEntry object or String with the full path of the entry
         * @param {Buffer|string} [pass] - password
         * @return Buffer or Null in case of error
         */
        readFile: function(entry, pass) {
          var item = getEntry(entry);
          return item && item.getData(pass) || null;
        },
        /**
         * Returns how many child elements has on entry (directories) on files it is always 0
         * @param {ZipEntry|string} entry ZipEntry object or String with the full path of the entry
         * @returns {integer}
         */
        childCount: function(entry) {
          const item = getEntry(entry);
          if (item) {
            return _zip.getChildCount(item);
          }
        },
        /**
         * Asynchronous readFile
         * @param {ZipEntry|string} entry ZipEntry object or String with the full path of the entry
         * @param {callback} callback
         *
         * @return Buffer or Null in case of error
         */
        readFileAsync: function(entry, callback) {
          var item = getEntry(entry);
          if (item) {
            item.getDataAsync(callback);
          } else {
            callback(null, "getEntry failed for:" + entry);
          }
        },
        /**
         * Extracts the given entry from the archive and returns the content as plain text in the given encoding
         * @param {ZipEntry|string} entry - ZipEntry object or String with the full path of the entry
         * @param {string} encoding - Optional. If no encoding is specified utf8 is used
         *
         * @return String
         */
        readAsText: function(entry, encoding) {
          var item = getEntry(entry);
          if (item) {
            var data = item.getData();
            if (data && data.length) {
              return data.toString(encoding || "utf8");
            }
          }
          return "";
        },
        /**
         * Asynchronous readAsText
         * @param {ZipEntry|string} entry ZipEntry object or String with the full path of the entry
         * @param {callback} callback
         * @param {string} [encoding] - Optional. If no encoding is specified utf8 is used
         *
         * @return String
         */
        readAsTextAsync: function(entry, callback, encoding) {
          var item = getEntry(entry);
          if (item) {
            item.getDataAsync(function(data, err) {
              if (err) {
                callback(data, err);
                return;
              }
              if (data && data.length) {
                callback(data.toString(encoding || "utf8"));
              } else {
                callback("");
              }
            });
          } else {
            callback("");
          }
        },
        /**
         * Remove the entry from the file or the entry and all it's nested directories and files if the given entry is a directory
         *
         * @param {ZipEntry|string} entry
         * @returns {void}
         */
        deleteFile: function(entry, withsubfolders = true) {
          var item = getEntry(entry);
          if (item) {
            _zip.deleteFile(item.entryName, withsubfolders);
          }
        },
        /**
         * Remove the entry from the file or directory without affecting any nested entries
         *
         * @param {ZipEntry|string} entry
         * @returns {void}
         */
        deleteEntry: function(entry) {
          var item = getEntry(entry);
          if (item) {
            _zip.deleteEntry(item.entryName);
          }
        },
        /**
         * Adds a comment to the zip. The zip must be rewritten after adding the comment.
         *
         * @param {string} comment
         */
        addZipComment: function(comment) {
          _zip.comment = comment;
        },
        /**
         * Returns the zip comment
         *
         * @return String
         */
        getZipComment: function() {
          return _zip.comment || "";
        },
        /**
         * Adds a comment to a specified zipEntry. The zip must be rewritten after adding the comment
         * The comment cannot exceed 65535 characters in length
         *
         * @param {ZipEntry} entry
         * @param {string} comment
         */
        addZipEntryComment: function(entry, comment) {
          var item = getEntry(entry);
          if (item) {
            item.comment = comment;
          }
        },
        /**
         * Returns the comment of the specified entry
         *
         * @param {ZipEntry} entry
         * @return String
         */
        getZipEntryComment: function(entry) {
          var item = getEntry(entry);
          if (item) {
            return item.comment || "";
          }
          return "";
        },
        /**
         * Updates the content of an existing entry inside the archive. The zip must be rewritten after updating the content
         *
         * @param {ZipEntry} entry
         * @param {Buffer} content
         */
        updateFile: function(entry, content) {
          var item = getEntry(entry);
          if (item) {
            item.setData(content);
          }
        },
        /**
         * Adds a file from the disk to the archive
         *
         * @param {string} localPath File to add to zip
         * @param {string} [zipPath] Optional path inside the zip
         * @param {string} [zipName] Optional name for the file
         * @param {string} [comment] Optional file comment
         */
        addLocalFile: function(localPath2, zipPath, zipName, comment) {
          if (filetools.fs.existsSync(localPath2)) {
            zipPath = zipPath ? fixPath(zipPath) : "";
            const p = pth.win32.basename(pth.win32.normalize(localPath2));
            zipPath += zipName ? zipName : p;
            const _attr = filetools.fs.statSync(localPath2);
            const data = _attr.isFile() ? filetools.fs.readFileSync(localPath2) : Buffer.alloc(0);
            if (_attr.isDirectory()) zipPath += filetools.sep;
            this.addFile(zipPath, data, comment, _attr);
          } else {
            throw Utils.Errors.FILE_NOT_FOUND(localPath2);
          }
        },
        /**
         * Callback for showing if everything was done.
         *
         * @callback doneCallback
         * @param {Error} err - Error object
         * @param {boolean} done - was request fully completed
         */
        /**
         * Adds a file from the disk to the archive
         *
         * @param {(object|string)} options - options object, if it is string it us used as localPath.
         * @param {string} options.localPath - Local path to the file.
         * @param {string} [options.comment] - Optional file comment.
         * @param {string} [options.zipPath] - Optional path inside the zip
         * @param {string} [options.zipName] - Optional name for the file
         * @param {doneCallback} callback - The callback that handles the response.
         */
        addLocalFileAsync: function(options2, callback) {
          options2 = typeof options2 === "object" ? options2 : { localPath: options2 };
          const localPath2 = pth.resolve(options2.localPath);
          const { comment } = options2;
          let { zipPath, zipName } = options2;
          const self2 = this;
          filetools.fs.stat(localPath2, function(err, stats) {
            if (err) return callback(err, false);
            zipPath = zipPath ? fixPath(zipPath) : "";
            const p = pth.win32.basename(pth.win32.normalize(localPath2));
            zipPath += zipName ? zipName : p;
            if (stats.isFile()) {
              filetools.fs.readFile(localPath2, function(err2, data) {
                if (err2) return callback(err2, false);
                self2.addFile(zipPath, data, comment, stats);
                return setImmediate(callback, void 0, true);
              });
            } else if (stats.isDirectory()) {
              zipPath += filetools.sep;
              self2.addFile(zipPath, Buffer.alloc(0), comment, stats);
              return setImmediate(callback, void 0, true);
            }
          });
        },
        /**
         * Adds a local directory and all its nested files and directories to the archive
         *
         * @param {string} localPath - local path to the folder
         * @param {string} [zipPath] - optional path inside zip
         * @param {(RegExp|function)} [filter] - optional RegExp or Function if files match will be included.
         */
        addLocalFolder: function(localPath2, zipPath, filter) {
          filter = filenameFilter(filter);
          zipPath = zipPath ? fixPath(zipPath) : "";
          localPath2 = pth.normalize(localPath2);
          if (filetools.fs.existsSync(localPath2)) {
            const items = filetools.findFiles(localPath2);
            const self2 = this;
            if (items.length) {
              for (const filepath of items) {
                const p = pth.join(zipPath, relativePath(localPath2, filepath));
                if (filter(p)) {
                  self2.addLocalFile(filepath, pth.dirname(p));
                }
              }
            }
          } else {
            throw Utils.Errors.FILE_NOT_FOUND(localPath2);
          }
        },
        /**
         * Asynchronous addLocalFolder
         * @param {string} localPath
         * @param {callback} callback
         * @param {string} [zipPath] optional path inside zip
         * @param {RegExp|function} [filter] optional RegExp or Function if files match will
         *               be included.
         */
        addLocalFolderAsync: function(localPath2, callback, zipPath, filter) {
          filter = filenameFilter(filter);
          zipPath = zipPath ? fixPath(zipPath) : "";
          localPath2 = pth.normalize(localPath2);
          var self2 = this;
          filetools.fs.open(localPath2, "r", function(err) {
            if (err && err.code === "ENOENT") {
              callback(void 0, Utils.Errors.FILE_NOT_FOUND(localPath2));
            } else if (err) {
              callback(void 0, err);
            } else {
              var items = filetools.findFiles(localPath2);
              var i = -1;
              var next = function() {
                i += 1;
                if (i < items.length) {
                  var filepath = items[i];
                  var p = relativePath(localPath2, filepath).split("\\").join("/");
                  p = p.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "");
                  if (filter(p)) {
                    filetools.fs.stat(filepath, function(er0, stats) {
                      if (er0) callback(void 0, er0);
                      if (stats.isFile()) {
                        filetools.fs.readFile(filepath, function(er1, data) {
                          if (er1) {
                            callback(void 0, er1);
                          } else {
                            self2.addFile(zipPath + p, data, "", stats);
                            next();
                          }
                        });
                      } else {
                        self2.addFile(zipPath + p + "/", Buffer.alloc(0), "", stats);
                        next();
                      }
                    });
                  } else {
                    process.nextTick(() => {
                      next();
                    });
                  }
                } else {
                  callback(true, void 0);
                }
              };
              next();
            }
          });
        },
        /**
         * Adds a local directory and all its nested files and directories to the archive
         *
         * @param {object | string} options - options object, if it is string it us used as localPath.
         * @param {string} options.localPath - Local path to the folder.
         * @param {string} [options.zipPath] - optional path inside zip.
         * @param {RegExp|function} [options.filter] - optional RegExp or Function if files match will be included.
         * @param {function|string} [options.namefix] - optional function to help fix filename
         * @param {doneCallback} callback - The callback that handles the response.
         *
         */
        addLocalFolderAsync2: function(options2, callback) {
          const self2 = this;
          options2 = typeof options2 === "object" ? options2 : { localPath: options2 };
          localPath = pth.resolve(fixPath(options2.localPath));
          let { zipPath, filter, namefix } = options2;
          if (filter instanceof RegExp) {
            filter = /* @__PURE__ */ (function(rx) {
              return function(filename) {
                return rx.test(filename);
              };
            })(filter);
          } else if ("function" !== typeof filter) {
            filter = function() {
              return true;
            };
          }
          zipPath = zipPath ? fixPath(zipPath) : "";
          if (namefix == "latin1") {
            namefix = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "");
          }
          if (typeof namefix !== "function") namefix = (str) => str;
          const relPathFix = (entry) => pth.join(zipPath, namefix(relativePath(localPath, entry)));
          const fileNameFix = (entry) => pth.win32.basename(pth.win32.normalize(namefix(entry)));
          filetools.fs.open(localPath, "r", function(err) {
            if (err && err.code === "ENOENT") {
              callback(void 0, Utils.Errors.FILE_NOT_FOUND(localPath));
            } else if (err) {
              callback(void 0, err);
            } else {
              filetools.findFilesAsync(localPath, function(err2, fileEntries) {
                if (err2) return callback(err2);
                fileEntries = fileEntries.filter((dir) => filter(relPathFix(dir)));
                if (!fileEntries.length) callback(void 0, false);
                setImmediate(
                  fileEntries.reverse().reduce(function(next, entry) {
                    return function(err3, done) {
                      if (err3 || done === false) return setImmediate(next, err3, false);
                      self2.addLocalFileAsync(
                        {
                          localPath: entry,
                          zipPath: pth.dirname(relPathFix(entry)),
                          zipName: fileNameFix(entry)
                        },
                        next
                      );
                    };
                  }, callback)
                );
              });
            }
          });
        },
        /**
         * Adds a local directory and all its nested files and directories to the archive
         *
         * @param {string} localPath - path where files will be extracted
         * @param {object} props - optional properties
         * @param {string} [props.zipPath] - optional path inside zip
         * @param {RegExp|function} [props.filter] - optional RegExp or Function if files match will be included.
         * @param {function|string} [props.namefix] - optional function to help fix filename
         */
        addLocalFolderPromise: function(localPath2, props) {
          return new Promise((resolve, reject) => {
            this.addLocalFolderAsync2(Object.assign({ localPath: localPath2 }, props), (err, done) => {
              if (err) reject(err);
              if (done) resolve(this);
            });
          });
        },
        /**
         * Allows you to create a entry (file or directory) in the zip file.
         * If you want to create a directory the entryName must end in / and a null buffer should be provided.
         * Comment and attributes are optional
         *
         * @param {string} entryName
         * @param {Buffer | string} content - file content as buffer or utf8 coded string
         * @param {string} [comment] - file comment
         * @param {number | object} [attr] - number as unix file permissions, object as filesystem Stats object
         */
        addFile: function(entryName, content, comment, attr) {
          entryName = zipnamefix(entryName);
          let entry = getEntry(entryName);
          const update = entry != null;
          if (!update) {
            entry = new ZipEntry(opts);
            entry.entryName = entryName;
          }
          entry.comment = comment || "";
          const isStat = "object" === typeof attr && attr instanceof filetools.fs.Stats;
          if (isStat) {
            entry.header.time = attr.mtime;
          }
          var fileattr = entry.isDirectory ? 16 : 0;
          let unix = entry.isDirectory ? 16384 : 32768;
          if (isStat) {
            unix |= 4095 & attr.mode;
          } else if ("number" === typeof attr) {
            unix |= 4095 & attr;
          } else {
            unix |= entry.isDirectory ? 493 : 420;
          }
          fileattr = (fileattr | unix << 16) >>> 0;
          entry.attr = fileattr;
          entry.setData(content);
          if (!update) _zip.setEntry(entry);
          return entry;
        },
        /**
         * Returns an array of ZipEntry objects representing the files and folders inside the archive
         *
         * @param {string} [password]
         * @returns Array
         */
        getEntries: function(password) {
          _zip.password = password;
          return _zip ? _zip.entries : [];
        },
        /**
         * Returns a ZipEntry object representing the file or folder specified by ``name``.
         *
         * @param {string} name
         * @return ZipEntry
         */
        getEntry: function(name) {
          return getEntry(name);
        },
        getEntryCount: function() {
          return _zip.getEntryCount();
        },
        forEach: function(callback) {
          return _zip.forEach(callback);
        },
        /**
         * Extracts the given entry to the given targetPath
         * If the entry is a directory inside the archive, the entire directory and it's subdirectories will be extracted
         *
         * @param {string|ZipEntry} entry - ZipEntry object or String with the full path of the entry
         * @param {string} targetPath - Target folder where to write the file
         * @param {boolean} [maintainEntryPath=true] - If maintainEntryPath is true and the entry is inside a folder, the entry folder will be created in targetPath as well. Default is TRUE
         * @param {boolean} [overwrite=false] - If the file already exists at the target path, the file will be overwriten if this is true.
         * @param {boolean} [keepOriginalPermission=false] - The file will be set as the permission from the entry if this is true.
         * @param {string} [outFileName] - String If set will override the filename of the extracted file (Only works if the entry is a file)
         *
         * @return Boolean
         */
        extractEntryTo: function(entry, targetPath, maintainEntryPath, overwrite, keepOriginalPermission, outFileName) {
          overwrite = get_Bool(false, overwrite);
          keepOriginalPermission = get_Bool(false, keepOriginalPermission);
          maintainEntryPath = get_Bool(true, maintainEntryPath);
          outFileName = get_Str(keepOriginalPermission, outFileName);
          var item = getEntry(entry);
          if (!item) {
            throw Utils.Errors.NO_ENTRY();
          }
          var entryName = canonical(item.entryName);
          var target = sanitize(targetPath, outFileName && !item.isDirectory ? outFileName : maintainEntryPath ? entryName : pth.basename(entryName));
          if (item.isDirectory) {
            var children = _zip.getEntryChildren(item);
            children.forEach(function(child) {
              if (child.isDirectory) return;
              var content2 = child.getData();
              if (!content2) {
                throw Utils.Errors.CANT_EXTRACT_FILE();
              }
              var name = canonical(child.entryName);
              var childName = sanitize(targetPath, maintainEntryPath ? name : pth.basename(name));
              const fileAttr2 = keepOriginalPermission ? child.header.fileAttr : void 0;
              filetools.writeFileTo(childName, content2, overwrite, fileAttr2);
            });
            return true;
          }
          var content = item.getData(_zip.password);
          if (!content) throw Utils.Errors.CANT_EXTRACT_FILE();
          if (filetools.fs.existsSync(target) && !overwrite) {
            throw Utils.Errors.CANT_OVERRIDE();
          }
          const fileAttr = keepOriginalPermission ? entry.header.fileAttr : void 0;
          filetools.writeFileTo(target, content, overwrite, fileAttr);
          return true;
        },
        /**
         * Test the archive
         * @param {string} [pass]
         */
        test: function(pass) {
          if (!_zip) {
            return false;
          }
          for (var entry in _zip.entries) {
            try {
              if (entry.isDirectory) {
                continue;
              }
              var content = _zip.entries[entry].getData(pass);
              if (!content) {
                return false;
              }
            } catch (err) {
              return false;
            }
          }
          return true;
        },
        /**
         * Extracts the entire archive to the given location
         *
         * @param {string} targetPath Target location
         * @param {boolean} [overwrite=false] If the file already exists at the target path, the file will be overwriten if this is true.
         *                  Default is FALSE
         * @param {boolean} [keepOriginalPermission=false] The file will be set as the permission from the entry if this is true.
         *                  Default is FALSE
         * @param {string|Buffer} [pass] password
         */
        extractAllTo: function(targetPath, overwrite, keepOriginalPermission, pass) {
          keepOriginalPermission = get_Bool(false, keepOriginalPermission);
          pass = get_Str(keepOriginalPermission, pass);
          overwrite = get_Bool(false, overwrite);
          if (!_zip) throw Utils.Errors.NO_ZIP();
          _zip.entries.forEach(function(entry) {
            var entryName = sanitize(targetPath, canonical(entry.entryName));
            if (entry.isDirectory) {
              filetools.makeDir(entryName);
              return;
            }
            var content = entry.getData(pass);
            if (!content) {
              throw Utils.Errors.CANT_EXTRACT_FILE();
            }
            const fileAttr = keepOriginalPermission ? entry.header.fileAttr : void 0;
            filetools.writeFileTo(entryName, content, overwrite, fileAttr);
            try {
              filetools.fs.utimesSync(entryName, entry.header.time, entry.header.time);
            } catch (err) {
              throw Utils.Errors.CANT_EXTRACT_FILE();
            }
          });
        },
        /**
         * Asynchronous extractAllTo
         *
         * @param {string} targetPath Target location
         * @param {boolean} [overwrite=false] If the file already exists at the target path, the file will be overwriten if this is true.
         *                  Default is FALSE
         * @param {boolean} [keepOriginalPermission=false] The file will be set as the permission from the entry if this is true.
         *                  Default is FALSE
         * @param {function} callback The callback will be executed when all entries are extracted successfully or any error is thrown.
         */
        extractAllToAsync: function(targetPath, overwrite, keepOriginalPermission, callback) {
          callback = get_Fun(overwrite, keepOriginalPermission, callback);
          keepOriginalPermission = get_Bool(false, keepOriginalPermission);
          overwrite = get_Bool(false, overwrite);
          if (!callback) {
            return new Promise((resolve, reject) => {
              this.extractAllToAsync(targetPath, overwrite, keepOriginalPermission, function(err) {
                if (err) {
                  reject(err);
                } else {
                  resolve(this);
                }
              });
            });
          }
          if (!_zip) {
            callback(Utils.Errors.NO_ZIP());
            return;
          }
          targetPath = pth.resolve(targetPath);
          const getPath = (entry) => sanitize(targetPath, pth.normalize(canonical(entry.entryName)));
          const getError = (msg, file) => new Error(msg + ': "' + file + '"');
          const dirEntries = [];
          const fileEntries = [];
          _zip.entries.forEach((e) => {
            if (e.isDirectory) {
              dirEntries.push(e);
            } else {
              fileEntries.push(e);
            }
          });
          for (const entry of dirEntries) {
            const dirPath = getPath(entry);
            const dirAttr = keepOriginalPermission ? entry.header.fileAttr : void 0;
            try {
              filetools.makeDir(dirPath);
              if (dirAttr) filetools.fs.chmodSync(dirPath, dirAttr);
              filetools.fs.utimesSync(dirPath, entry.header.time, entry.header.time);
            } catch (er) {
              callback(getError("Unable to create folder", dirPath));
            }
          }
          fileEntries.reverse().reduce(function(next, entry) {
            return function(err) {
              if (err) {
                next(err);
              } else {
                const entryName = pth.normalize(canonical(entry.entryName));
                const filePath = sanitize(targetPath, entryName);
                entry.getDataAsync(function(content, err_1) {
                  if (err_1) {
                    next(err_1);
                  } else if (!content) {
                    next(Utils.Errors.CANT_EXTRACT_FILE());
                  } else {
                    const fileAttr = keepOriginalPermission ? entry.header.fileAttr : void 0;
                    filetools.writeFileToAsync(filePath, content, overwrite, fileAttr, function(succ) {
                      if (!succ) {
                        next(getError("Unable to write file", filePath));
                      }
                      filetools.fs.utimes(filePath, entry.header.time, entry.header.time, function(err_2) {
                        if (err_2) {
                          next(getError("Unable to set times", filePath));
                        } else {
                          next();
                        }
                      });
                    });
                  }
                });
              }
            };
          }, callback)();
        },
        /**
         * Writes the newly created zip file to disk at the specified location or if a zip was opened and no ``targetFileName`` is provided, it will overwrite the opened zip
         *
         * @param {string} targetFileName
         * @param {function} callback
         */
        writeZip: function(targetFileName, callback) {
          if (arguments.length === 1) {
            if (typeof targetFileName === "function") {
              callback = targetFileName;
              targetFileName = "";
            }
          }
          if (!targetFileName && opts.filename) {
            targetFileName = opts.filename;
          }
          if (!targetFileName) return;
          var zipData = _zip.compressToBuffer();
          if (zipData) {
            var ok = filetools.writeFileTo(targetFileName, zipData, true);
            if (typeof callback === "function") callback(!ok ? new Error("failed") : null, "");
          }
        },
        /**
                 *
                 * @param {string} targetFileName
                 * @param {object} [props]
                 * @param {boolean} [props.overwrite=true] If the file already exists at the target path, the file will be overwriten if this is true.
                 * @param {boolean} [props.perm] The file will be set as the permission from the entry if this is true.
        
                 * @returns {Promise<void>}
                 */
        writeZipPromise: function(targetFileName, props) {
          const { overwrite, perm } = Object.assign({ overwrite: true }, props);
          return new Promise((resolve, reject) => {
            if (!targetFileName && opts.filename) targetFileName = opts.filename;
            if (!targetFileName) reject("ADM-ZIP: ZIP File Name Missing");
            this.toBufferPromise().then((zipData) => {
              const ret = (done) => done ? resolve(done) : reject("ADM-ZIP: Wasn't able to write zip file");
              filetools.writeFileToAsync(targetFileName, zipData, overwrite, perm, ret);
            }, reject);
          });
        },
        /**
         * @returns {Promise<Buffer>} A promise to the Buffer.
         */
        toBufferPromise: function() {
          return new Promise((resolve, reject) => {
            _zip.toAsyncBuffer(resolve, reject);
          });
        },
        /**
         * Returns the content of the entire zip file as a Buffer object
         *
         * @prop {function} [onSuccess]
         * @prop {function} [onFail]
         * @prop {function} [onItemStart]
         * @prop {function} [onItemEnd]
         * @returns {Buffer}
         */
        toBuffer: function(onSuccess, onFail, onItemStart, onItemEnd) {
          if (typeof onSuccess === "function") {
            _zip.toAsyncBuffer(onSuccess, onFail, onItemStart, onItemEnd);
            return null;
          }
          return _zip.compressToBuffer();
        }
      };
    };
  }
});

// node_modules/generative-bayesian-network/bayesian-node.js
var require_bayesian_node = __commonJS({
  "node_modules/generative-bayesian-network/bayesian-node.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.BayesianNode = void 0;
    function getRelativeFrequencies(data, attributeName) {
      const frequencies = {};
      const totalCount = data.length;
      data.forEach((record) => {
        const value = record[attributeName];
        frequencies[value] = (frequencies[value] ?? 0) + 1;
      });
      return Object.fromEntries(Object.entries(frequencies).map(([key, value]) => [
        key,
        value / totalCount
      ]));
    }
    var BayesianNode = class {
      /**
       * @param nodeDefinition Node structure and distributions definition taken from the network definition file.
       */
      constructor(nodeDefinition) {
        Object.defineProperty(this, "nodeDefinition", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: void 0
        });
        this.nodeDefinition = nodeDefinition;
      }
      toJSON() {
        return this.nodeDefinition;
      }
      /**
       * Extracts unconditional probabilities of node values given the values of the parent nodes
       * @param parentValues Parent nodes values.
       */
      getProbabilitiesGivenKnownValues(parentValues = {}) {
        let probabilities = this.nodeDefinition.conditionalProbabilities;
        for (const parentName of this.parentNames) {
          const parentValue = parentValues[parentName];
          if (parentValue in probabilities.deeper) {
            probabilities = probabilities.deeper[parentValue];
          } else {
            probabilities = probabilities.skip;
          }
        }
        return probabilities;
      }
      /**
       * Randomly samples from the given values using the given probabilities
       * @param possibleValues A list of values to sample from.
       * @param totalProbabilityOfPossibleValues Sum of probabilities of possibleValues in the conditional distribution.
       * @param probabilities A dictionary of probabilities from the conditional distribution, indexed by the values.
       */
      sampleRandomValueFromPossibilities(possibleValues, totalProbabilityOfPossibleValues, probabilities) {
        let chosenValue = possibleValues[0];
        const anchor = Math.random() * totalProbabilityOfPossibleValues;
        let cumulativeProbability = 0;
        for (const possibleValue of possibleValues) {
          cumulativeProbability += probabilities[possibleValue];
          if (cumulativeProbability > anchor) {
            chosenValue = possibleValue;
            break;
          }
        }
        return chosenValue;
      }
      /**
       * Randomly samples from the conditional distribution of this node given values of parents
       * @param parentValues Values of the parent nodes.
       */
      sample(parentValues = {}) {
        const probabilities = this.getProbabilitiesGivenKnownValues(parentValues);
        const possibleValues = Object.keys(probabilities);
        return this.sampleRandomValueFromPossibilities(possibleValues, 1, probabilities);
      }
      /**
       * Randomly samples from the conditional distribution of this node given restrictions on the possible
       * values and the values of the parents.
       * @param parentValues Values of the parent nodes.
       * @param valuePossibilities List of possible values for this node.
       * @param bannedValues What values of this node are banned.
       */
      sampleAccordingToRestrictions(parentValues, valuePossibilities, bannedValues) {
        const probabilities = this.getProbabilitiesGivenKnownValues(parentValues);
        let totalProbability = 0;
        const validValues = [];
        const valuesInDistribution = Object.keys(probabilities);
        const possibleValues = valuePossibilities || valuesInDistribution;
        for (const value of possibleValues) {
          if (!bannedValues.includes(value) && valuesInDistribution.includes(value)) {
            validValues.push(value);
            totalProbability += probabilities[value];
          }
        }
        if (validValues.length === 0)
          return false;
        return this.sampleRandomValueFromPossibilities(validValues, totalProbability, probabilities);
      }
      /**
       * Sets the conditional probability distribution for this node to match the given data.
       * @param data A RecordList containing the data.
       * @param possibleParentValues A dictionary of lists of possible values for parent nodes.
       */
      setProbabilitiesAccordingToData(data, possibleParentValues = {}) {
        this.nodeDefinition.possibleValues = Array.from(new Set(data.map((record) => record[this.name])));
        this.nodeDefinition.conditionalProbabilities = this.recursivelyCalculateConditionalProbabilitiesAccordingToData(data, possibleParentValues, 0);
      }
      /**
       * Recursively calculates the conditional probability distribution for this node from the data.
       * @param dataframe A Danfo.js dataframe containing the data.
       * @param possibleParentValues A dictionary of lists of possible values for parent nodes.
       * @param depth Depth of the current recursive call.
       */
      recursivelyCalculateConditionalProbabilitiesAccordingToData(data, possibleParentValues, depth) {
        let probabilities = {
          deeper: {}
        };
        if (depth < this.parentNames.length) {
          const currentParentName = this.parentNames[depth];
          for (const possibleValue of possibleParentValues[currentParentName]) {
            const skip = !data.map((record) => record[currentParentName]).includes(possibleValue);
            let filteredData = data;
            if (!skip) {
              filteredData = data.filter((record) => record[currentParentName] === possibleValue);
            }
            const nextLevel = this.recursivelyCalculateConditionalProbabilitiesAccordingToData(filteredData, possibleParentValues, depth + 1);
            if (!skip) {
              probabilities.deeper[possibleValue] = nextLevel;
            } else {
              probabilities.skip = nextLevel;
            }
          }
        } else {
          probabilities = getRelativeFrequencies(data, this.name);
        }
        return probabilities;
      }
      get name() {
        return this.nodeDefinition.name;
      }
      get parentNames() {
        return this.nodeDefinition.parentNames;
      }
      get possibleValues() {
        return this.nodeDefinition.possibleValues;
      }
    };
    exports.BayesianNode = BayesianNode;
  }
});

// node_modules/generative-bayesian-network/bayesian-network.js
var require_bayesian_network = __commonJS({
  "node_modules/generative-bayesian-network/bayesian-network.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.BayesianNetwork = void 0;
    var AdmZip = require_adm_zip();
    var bayesian_node_1 = require_bayesian_node();
    var BayesianNetwork = class {
      constructor({ path: path3 }) {
        Object.defineProperty(this, "nodesInSamplingOrder", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: []
        });
        Object.defineProperty(this, "nodesByName", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: {}
        });
        const zip = new AdmZip(path3);
        const zipEntries = zip.getEntries();
        const networkDefinition = JSON.parse(zipEntries[0].getData().toString("utf8"));
        this.nodesInSamplingOrder = networkDefinition.nodes.map((nodeDefinition) => new bayesian_node_1.BayesianNode(nodeDefinition));
        this.nodesByName = this.nodesInSamplingOrder.reduce((p, node) => ({
          ...p,
          [node.name]: node
        }), {});
      }
      /**
       * Randomly samples from the distribution represented by the bayesian network.
       * @param inputValues Already known node values.
       */
      generateSample(inputValues = {}) {
        const sample = inputValues;
        for (const node of this.nodesInSamplingOrder) {
          if (!(node.name in sample)) {
            sample[node.name] = node.sample(sample);
          }
        }
        return sample;
      }
      /**
       * Randomly samples values from the distribution represented by the bayesian network,
       * making sure the sample is consistent with the provided restrictions on value possibilities.
       * Returns false if no such sample can be generated.
       * @param valuePossibilities A dictionary of lists of possible values for nodes (if a node isn't present in the dictionary, all values are possible).
       */
      generateConsistentSampleWhenPossible(valuePossibilities) {
        return this.recursivelyGenerateConsistentSampleWhenPossible({}, valuePossibilities, 0);
      }
      /**
       * Recursively generates a random sample consistent with the given restrictions on possible values.
       * @param sampleSoFar Already known node values.
       * @param valuePossibilities A dictionary of lists of possible values for nodes (if a node isn't present in the dictionary, all values are possible).
       * @param depth Current recursion depth.
       */
      recursivelyGenerateConsistentSampleWhenPossible(sampleSoFar, valuePossibilities, depth) {
        const bannedValues = [];
        const node = this.nodesInSamplingOrder[depth];
        let sampleValue;
        do {
          sampleValue = node.sampleAccordingToRestrictions(sampleSoFar, valuePossibilities[node.name], bannedValues);
          if (!sampleValue)
            break;
          sampleSoFar[node.name] = sampleValue;
          if (depth + 1 < this.nodesInSamplingOrder.length) {
            const sample = this.recursivelyGenerateConsistentSampleWhenPossible(sampleSoFar, valuePossibilities, depth + 1);
            if (Object.keys(sample).length !== 0) {
              return sample;
            }
          } else {
            return sampleSoFar;
          }
          bannedValues.push(sampleValue);
        } while (sampleValue);
        return {};
      }
      /**
       * Sets the conditional probability distributions of this network's nodes to match the given data.
       * @param dataframe A Danfo.js dataframe containing the data.
       */
      setProbabilitiesAccordingToData(data) {
        this.nodesInSamplingOrder.forEach((node, i) => {
          console.log(`${i}/${this.nodesInSamplingOrder.length} Setting probabilities for node ${node.name}`);
          const possibleParentValues = {};
          for (const parentName of node.parentNames) {
            possibleParentValues[parentName] = this.nodesByName[parentName].possibleValues;
          }
          node.setProbabilitiesAccordingToData(data, possibleParentValues);
        });
      }
      /**
       * Saves the network definition to the specified file path to be used later.
       * @param networkDefinitionFilePath File path where the network definition should be saved.
       */
      saveNetworkDefinition({ path: path3 }) {
        const network = {
          nodes: this.nodesInSamplingOrder
        };
        const zip = new AdmZip();
        zip.addFile("network.json", Buffer.from(JSON.stringify(network), "utf8"));
        zip.writeZip(path3);
      }
    };
    exports.BayesianNetwork = BayesianNetwork;
  }
});

// node_modules/generative-bayesian-network/utils.js
var require_utils3 = __commonJS({
  "node_modules/generative-bayesian-network/utils.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.arrayIntersection = arrayIntersection;
    exports.arrayUnion = arrayUnion;
    exports.arrayZip = arrayZip;
    exports.getConstraintClosure = getConstraintClosure;
    function arrayIntersection(a, b) {
      return a.filter((x) => b.includes(x));
    }
    function arrayUnion(a, b) {
      return [...a, ...b.filter((x) => !a.includes(x))];
    }
    function arrayZip(a, b, f) {
      return a.map((x, i) => f(x, b[i]));
    }
    function getConstraintClosure(network, possibleValues) {
      function undeeper(obj) {
        if (typeof obj !== "object" || obj === null)
          return obj;
        const result = {};
        for (const key of Object.keys(obj)) {
          if (key === "skip")
            continue;
          if (key === "deeper") {
            Object.assign(result, undeeper(obj[key]));
            continue;
          }
          result[key] = undeeper(obj[key]);
        }
        return result;
      }
      function filterByLastLevelKeys(tree, validKeys) {
        let foundPaths = [];
        const dfs = (t, acc) => {
          for (const key of Object.keys(t)) {
            if (typeof t[key] !== "object" || !t[key]) {
              if (validKeys.includes(key)) {
                foundPaths = foundPaths.length === 0 ? acc.map((x) => [x]) : arrayZip(foundPaths, acc.map((x) => [x]), (a, b) => [.../* @__PURE__ */ new Set([...a, ...b])]);
              }
              continue;
            } else {
              dfs(t[key], [...acc, key]);
            }
          }
        };
        dfs(tree, []);
        return foundPaths;
      }
      const sets = [];
      let foundMatchingValues = false;
      for (const key of Object.keys(possibleValues)) {
        if (!Array.isArray(possibleValues[key]))
          continue;
        if (possibleValues[key].length === 0) {
          throw new Error(`The current constraints are too restrictive. 
No possible values can be found for the given constraints.`);
        }
        const node = network["nodesByName"][key]["nodeDefinition"];
        const tree = undeeper(node.conditionalProbabilities);
        const zippedValues = filterByLastLevelKeys(tree, possibleValues[key]);
        if (zippedValues.length > 0) {
          foundMatchingValues = true;
        }
        sets.push({
          ...Object.fromEntries(zippedValues.map((x, i) => [node.parentNames[i], x])),
          [key]: possibleValues[key]
        });
      }
      if (!foundMatchingValues) {
        return {};
      }
      return sets.reduce((acc, x) => {
        for (const key of Object.keys(x)) {
          acc[key] = acc[key] ? arrayIntersection(acc[key], x[key]) : x[key];
          if (acc[key].length === 0) {
            throw new Error(`The current constraints are too restrictive. 
No possible values can be found for the given constraints.`);
          }
        }
        return acc;
      }, {});
    }
  }
});

// node_modules/generative-bayesian-network/index.js
var require_generative_bayesian_network = __commonJS({
  "node_modules/generative-bayesian-network/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.utils = exports.BayesianNetwork = void 0;
    var tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
    var bayesian_network_1 = require_bayesian_network();
    Object.defineProperty(exports, "BayesianNetwork", { enumerable: true, get: function() {
      return bayesian_network_1.BayesianNetwork;
    } });
    exports.utils = tslib_1.__importStar(require_utils3());
  }
});

// node_modules/callsites/index.js
var require_callsites = __commonJS({
  "node_modules/callsites/index.js"(exports, module) {
    "use strict";
    var callsites = () => {
      const _prepareStackTrace = Error.prepareStackTrace;
      Error.prepareStackTrace = (_, stack2) => stack2;
      const stack = new Error().stack.slice(1);
      Error.prepareStackTrace = _prepareStackTrace;
      return stack;
    };
    module.exports = callsites;
    module.exports.default = callsites;
  }
});

// node_modules/ow/dist/utils/is-valid-identifier.js
var require_is_valid_identifier = __commonJS({
  "node_modules/ow/dist/utils/is-valid-identifier.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var identifierRegex = /^[a-z$_][$\w]*$/i;
    var reservedSet = /* @__PURE__ */ new Set([
      "undefined",
      "null",
      "true",
      "false",
      "super",
      "this",
      "Infinity",
      "NaN"
    ]);
    exports.default = (string) => string && !reservedSet.has(string) && identifierRegex.test(string);
  }
});

// node_modules/ow/dist/utils/node/is-node.js
var require_is_node = __commonJS({
  "node_modules/ow/dist/utils/node/is-node.js"(exports) {
    "use strict";
    var _a;
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Boolean((_a = process === null || process === void 0 ? void 0 : process.versions) === null || _a === void 0 ? void 0 : _a.node);
  }
});

// node_modules/ow/dist/utils/infer-label.js
var require_infer_label = __commonJS({
  "node_modules/ow/dist/utils/infer-label.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.inferLabel = void 0;
    var fs2 = __require("fs");
    var is_valid_identifier_1 = require_is_valid_identifier();
    var is_node_1 = require_is_node();
    var labelRegex = /^.*?\((?<label>.*?)[,)]/;
    var inferLabel = (callsites) => {
      var _a;
      if (!is_node_1.default) {
        return;
      }
      const functionCallStackFrame = callsites[1];
      if (!functionCallStackFrame) {
        return;
      }
      const fileName = functionCallStackFrame.getFileName();
      const lineNumber = functionCallStackFrame.getLineNumber();
      const columnNumber = functionCallStackFrame.getColumnNumber();
      if (fileName === null || lineNumber === null || columnNumber === null) {
        return;
      }
      let content = [];
      try {
        content = fs2.readFileSync(fileName, "utf8").split("\n");
      } catch {
        return;
      }
      let line = content[lineNumber - 1];
      if (!line) {
        return;
      }
      line = line.slice(columnNumber - 1);
      const match = labelRegex.exec(line);
      if (!((_a = match === null || match === void 0 ? void 0 : match.groups) === null || _a === void 0 ? void 0 : _a.label)) {
        return;
      }
      const token = match.groups.label;
      if ((0, is_valid_identifier_1.default)(token) || (0, is_valid_identifier_1.default)(token.split(".").pop())) {
        return token;
      }
      return;
    };
    exports.inferLabel = inferLabel;
  }
});

// node_modules/@sindresorhus/is/dist/index.js
var require_dist = __commonJS({
  "node_modules/@sindresorhus/is/dist/index.js"(exports, module) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var typedArrayTypeNames = [
      "Int8Array",
      "Uint8Array",
      "Uint8ClampedArray",
      "Int16Array",
      "Uint16Array",
      "Int32Array",
      "Uint32Array",
      "Float32Array",
      "Float64Array",
      "BigInt64Array",
      "BigUint64Array"
    ];
    function isTypedArrayName(name) {
      return typedArrayTypeNames.includes(name);
    }
    var objectTypeNames = [
      "Function",
      "Generator",
      "AsyncGenerator",
      "GeneratorFunction",
      "AsyncGeneratorFunction",
      "AsyncFunction",
      "Observable",
      "Array",
      "Buffer",
      "Blob",
      "Object",
      "RegExp",
      "Date",
      "Error",
      "Map",
      "Set",
      "WeakMap",
      "WeakSet",
      "ArrayBuffer",
      "SharedArrayBuffer",
      "DataView",
      "Promise",
      "URL",
      "FormData",
      "URLSearchParams",
      "HTMLElement",
      ...typedArrayTypeNames
    ];
    function isObjectTypeName(name) {
      return objectTypeNames.includes(name);
    }
    var primitiveTypeNames = [
      "null",
      "undefined",
      "string",
      "number",
      "bigint",
      "boolean",
      "symbol"
    ];
    function isPrimitiveTypeName(name) {
      return primitiveTypeNames.includes(name);
    }
    function isOfType(type) {
      return (value) => typeof value === type;
    }
    var { toString } = Object.prototype;
    var getObjectType = (value) => {
      const objectTypeName = toString.call(value).slice(8, -1);
      if (/HTML\w+Element/.test(objectTypeName) && is.domElement(value)) {
        return "HTMLElement";
      }
      if (isObjectTypeName(objectTypeName)) {
        return objectTypeName;
      }
      return void 0;
    };
    var isObjectOfType = (type) => (value) => getObjectType(value) === type;
    function is(value) {
      if (value === null) {
        return "null";
      }
      switch (typeof value) {
        case "undefined":
          return "undefined";
        case "string":
          return "string";
        case "number":
          return "number";
        case "boolean":
          return "boolean";
        case "function":
          return "Function";
        case "bigint":
          return "bigint";
        case "symbol":
          return "symbol";
        default:
      }
      if (is.observable(value)) {
        return "Observable";
      }
      if (is.array(value)) {
        return "Array";
      }
      if (is.buffer(value)) {
        return "Buffer";
      }
      const tagType = getObjectType(value);
      if (tagType) {
        return tagType;
      }
      if (value instanceof String || value instanceof Boolean || value instanceof Number) {
        throw new TypeError("Please don't use object wrappers for primitive types");
      }
      return "Object";
    }
    is.undefined = isOfType("undefined");
    is.string = isOfType("string");
    var isNumberType = isOfType("number");
    is.number = (value) => isNumberType(value) && !is.nan(value);
    is.bigint = isOfType("bigint");
    is.function_ = isOfType("function");
    is.null_ = (value) => value === null;
    is.class_ = (value) => is.function_(value) && value.toString().startsWith("class ");
    is.boolean = (value) => value === true || value === false;
    is.symbol = isOfType("symbol");
    is.numericString = (value) => is.string(value) && !is.emptyStringOrWhitespace(value) && !Number.isNaN(Number(value));
    is.array = (value, assertion) => {
      if (!Array.isArray(value)) {
        return false;
      }
      if (!is.function_(assertion)) {
        return true;
      }
      return value.every(assertion);
    };
    is.buffer = (value) => {
      var _a, _b, _c, _d;
      return (_d = (_c = (_b = (_a = value) === null || _a === void 0 ? void 0 : _a.constructor) === null || _b === void 0 ? void 0 : _b.isBuffer) === null || _c === void 0 ? void 0 : _c.call(_b, value)) !== null && _d !== void 0 ? _d : false;
    };
    is.blob = (value) => isObjectOfType("Blob")(value);
    is.nullOrUndefined = (value) => is.null_(value) || is.undefined(value);
    is.object = (value) => !is.null_(value) && (typeof value === "object" || is.function_(value));
    is.iterable = (value) => {
      var _a;
      return is.function_((_a = value) === null || _a === void 0 ? void 0 : _a[Symbol.iterator]);
    };
    is.asyncIterable = (value) => {
      var _a;
      return is.function_((_a = value) === null || _a === void 0 ? void 0 : _a[Symbol.asyncIterator]);
    };
    is.generator = (value) => {
      var _a, _b;
      return is.iterable(value) && is.function_((_a = value) === null || _a === void 0 ? void 0 : _a.next) && is.function_((_b = value) === null || _b === void 0 ? void 0 : _b.throw);
    };
    is.asyncGenerator = (value) => is.asyncIterable(value) && is.function_(value.next) && is.function_(value.throw);
    is.nativePromise = (value) => isObjectOfType("Promise")(value);
    var hasPromiseAPI = (value) => {
      var _a, _b;
      return is.function_((_a = value) === null || _a === void 0 ? void 0 : _a.then) && is.function_((_b = value) === null || _b === void 0 ? void 0 : _b.catch);
    };
    is.promise = (value) => is.nativePromise(value) || hasPromiseAPI(value);
    is.generatorFunction = isObjectOfType("GeneratorFunction");
    is.asyncGeneratorFunction = (value) => getObjectType(value) === "AsyncGeneratorFunction";
    is.asyncFunction = (value) => getObjectType(value) === "AsyncFunction";
    is.boundFunction = (value) => is.function_(value) && !value.hasOwnProperty("prototype");
    is.regExp = isObjectOfType("RegExp");
    is.date = isObjectOfType("Date");
    is.error = isObjectOfType("Error");
    is.map = (value) => isObjectOfType("Map")(value);
    is.set = (value) => isObjectOfType("Set")(value);
    is.weakMap = (value) => isObjectOfType("WeakMap")(value);
    is.weakSet = (value) => isObjectOfType("WeakSet")(value);
    is.int8Array = isObjectOfType("Int8Array");
    is.uint8Array = isObjectOfType("Uint8Array");
    is.uint8ClampedArray = isObjectOfType("Uint8ClampedArray");
    is.int16Array = isObjectOfType("Int16Array");
    is.uint16Array = isObjectOfType("Uint16Array");
    is.int32Array = isObjectOfType("Int32Array");
    is.uint32Array = isObjectOfType("Uint32Array");
    is.float32Array = isObjectOfType("Float32Array");
    is.float64Array = isObjectOfType("Float64Array");
    is.bigInt64Array = isObjectOfType("BigInt64Array");
    is.bigUint64Array = isObjectOfType("BigUint64Array");
    is.arrayBuffer = isObjectOfType("ArrayBuffer");
    is.sharedArrayBuffer = isObjectOfType("SharedArrayBuffer");
    is.dataView = isObjectOfType("DataView");
    is.enumCase = (value, targetEnum) => Object.values(targetEnum).includes(value);
    is.directInstanceOf = (instance, class_) => Object.getPrototypeOf(instance) === class_.prototype;
    is.urlInstance = (value) => isObjectOfType("URL")(value);
    is.urlString = (value) => {
      if (!is.string(value)) {
        return false;
      }
      try {
        new URL(value);
        return true;
      } catch (_a) {
        return false;
      }
    };
    is.truthy = (value) => Boolean(value);
    is.falsy = (value) => !value;
    is.nan = (value) => Number.isNaN(value);
    is.primitive = (value) => is.null_(value) || isPrimitiveTypeName(typeof value);
    is.integer = (value) => Number.isInteger(value);
    is.safeInteger = (value) => Number.isSafeInteger(value);
    is.plainObject = (value) => {
      if (toString.call(value) !== "[object Object]") {
        return false;
      }
      const prototype = Object.getPrototypeOf(value);
      return prototype === null || prototype === Object.getPrototypeOf({});
    };
    is.typedArray = (value) => isTypedArrayName(getObjectType(value));
    var isValidLength = (value) => is.safeInteger(value) && value >= 0;
    is.arrayLike = (value) => !is.nullOrUndefined(value) && !is.function_(value) && isValidLength(value.length);
    is.inRange = (value, range) => {
      if (is.number(range)) {
        return value >= Math.min(0, range) && value <= Math.max(range, 0);
      }
      if (is.array(range) && range.length === 2) {
        return value >= Math.min(...range) && value <= Math.max(...range);
      }
      throw new TypeError(`Invalid range: ${JSON.stringify(range)}`);
    };
    var NODE_TYPE_ELEMENT = 1;
    var DOM_PROPERTIES_TO_CHECK = [
      "innerHTML",
      "ownerDocument",
      "style",
      "attributes",
      "nodeValue"
    ];
    is.domElement = (value) => {
      return is.object(value) && value.nodeType === NODE_TYPE_ELEMENT && is.string(value.nodeName) && !is.plainObject(value) && DOM_PROPERTIES_TO_CHECK.every((property) => property in value);
    };
    is.observable = (value) => {
      var _a, _b, _c, _d;
      if (!value) {
        return false;
      }
      if (value === ((_b = (_a = value)[Symbol.observable]) === null || _b === void 0 ? void 0 : _b.call(_a))) {
        return true;
      }
      if (value === ((_d = (_c = value)["@@observable"]) === null || _d === void 0 ? void 0 : _d.call(_c))) {
        return true;
      }
      return false;
    };
    is.nodeStream = (value) => is.object(value) && is.function_(value.pipe) && !is.observable(value);
    is.infinite = (value) => value === Infinity || value === -Infinity;
    var isAbsoluteMod2 = (remainder) => (value) => is.integer(value) && Math.abs(value % 2) === remainder;
    is.evenInteger = isAbsoluteMod2(0);
    is.oddInteger = isAbsoluteMod2(1);
    is.emptyArray = (value) => is.array(value) && value.length === 0;
    is.nonEmptyArray = (value) => is.array(value) && value.length > 0;
    is.emptyString = (value) => is.string(value) && value.length === 0;
    var isWhiteSpaceString = (value) => is.string(value) && !/\S/.test(value);
    is.emptyStringOrWhitespace = (value) => is.emptyString(value) || isWhiteSpaceString(value);
    is.nonEmptyString = (value) => is.string(value) && value.length > 0;
    is.nonEmptyStringAndNotWhitespace = (value) => is.string(value) && !is.emptyStringOrWhitespace(value);
    is.emptyObject = (value) => is.object(value) && !is.map(value) && !is.set(value) && Object.keys(value).length === 0;
    is.nonEmptyObject = (value) => is.object(value) && !is.map(value) && !is.set(value) && Object.keys(value).length > 0;
    is.emptySet = (value) => is.set(value) && value.size === 0;
    is.nonEmptySet = (value) => is.set(value) && value.size > 0;
    is.emptyMap = (value) => is.map(value) && value.size === 0;
    is.nonEmptyMap = (value) => is.map(value) && value.size > 0;
    is.propertyKey = (value) => is.any([is.string, is.number, is.symbol], value);
    is.formData = (value) => isObjectOfType("FormData")(value);
    is.urlSearchParams = (value) => isObjectOfType("URLSearchParams")(value);
    var predicateOnArray = (method, predicate, values) => {
      if (!is.function_(predicate)) {
        throw new TypeError(`Invalid predicate: ${JSON.stringify(predicate)}`);
      }
      if (values.length === 0) {
        throw new TypeError("Invalid number of values");
      }
      return method.call(values, predicate);
    };
    is.any = (predicate, ...values) => {
      const predicates = is.array(predicate) ? predicate : [predicate];
      return predicates.some((singlePredicate) => predicateOnArray(Array.prototype.some, singlePredicate, values));
    };
    is.all = (predicate, ...values) => predicateOnArray(Array.prototype.every, predicate, values);
    var assertType = (condition, description, value, options = {}) => {
      if (!condition) {
        const { multipleValues } = options;
        const valuesMessage = multipleValues ? `received values of types ${[
          ...new Set(value.map((singleValue) => `\`${is(singleValue)}\``))
        ].join(", ")}` : `received value of type \`${is(value)}\``;
        throw new TypeError(`Expected value which is \`${description}\`, ${valuesMessage}.`);
      }
    };
    exports.assert = {
      // Unknowns.
      undefined: (value) => assertType(is.undefined(value), "undefined", value),
      string: (value) => assertType(is.string(value), "string", value),
      number: (value) => assertType(is.number(value), "number", value),
      bigint: (value) => assertType(is.bigint(value), "bigint", value),
      // eslint-disable-next-line @typescript-eslint/ban-types
      function_: (value) => assertType(is.function_(value), "Function", value),
      null_: (value) => assertType(is.null_(value), "null", value),
      class_: (value) => assertType(is.class_(value), "Class", value),
      boolean: (value) => assertType(is.boolean(value), "boolean", value),
      symbol: (value) => assertType(is.symbol(value), "symbol", value),
      numericString: (value) => assertType(is.numericString(value), "string with a number", value),
      array: (value, assertion) => {
        const assert = assertType;
        assert(is.array(value), "Array", value);
        if (assertion) {
          value.forEach(assertion);
        }
      },
      buffer: (value) => assertType(is.buffer(value), "Buffer", value),
      blob: (value) => assertType(is.blob(value), "Blob", value),
      nullOrUndefined: (value) => assertType(is.nullOrUndefined(value), "null or undefined", value),
      object: (value) => assertType(is.object(value), "Object", value),
      iterable: (value) => assertType(is.iterable(value), "Iterable", value),
      asyncIterable: (value) => assertType(is.asyncIterable(value), "AsyncIterable", value),
      generator: (value) => assertType(is.generator(value), "Generator", value),
      asyncGenerator: (value) => assertType(is.asyncGenerator(value), "AsyncGenerator", value),
      nativePromise: (value) => assertType(is.nativePromise(value), "native Promise", value),
      promise: (value) => assertType(is.promise(value), "Promise", value),
      generatorFunction: (value) => assertType(is.generatorFunction(value), "GeneratorFunction", value),
      asyncGeneratorFunction: (value) => assertType(is.asyncGeneratorFunction(value), "AsyncGeneratorFunction", value),
      // eslint-disable-next-line @typescript-eslint/ban-types
      asyncFunction: (value) => assertType(is.asyncFunction(value), "AsyncFunction", value),
      // eslint-disable-next-line @typescript-eslint/ban-types
      boundFunction: (value) => assertType(is.boundFunction(value), "Function", value),
      regExp: (value) => assertType(is.regExp(value), "RegExp", value),
      date: (value) => assertType(is.date(value), "Date", value),
      error: (value) => assertType(is.error(value), "Error", value),
      map: (value) => assertType(is.map(value), "Map", value),
      set: (value) => assertType(is.set(value), "Set", value),
      weakMap: (value) => assertType(is.weakMap(value), "WeakMap", value),
      weakSet: (value) => assertType(is.weakSet(value), "WeakSet", value),
      int8Array: (value) => assertType(is.int8Array(value), "Int8Array", value),
      uint8Array: (value) => assertType(is.uint8Array(value), "Uint8Array", value),
      uint8ClampedArray: (value) => assertType(is.uint8ClampedArray(value), "Uint8ClampedArray", value),
      int16Array: (value) => assertType(is.int16Array(value), "Int16Array", value),
      uint16Array: (value) => assertType(is.uint16Array(value), "Uint16Array", value),
      int32Array: (value) => assertType(is.int32Array(value), "Int32Array", value),
      uint32Array: (value) => assertType(is.uint32Array(value), "Uint32Array", value),
      float32Array: (value) => assertType(is.float32Array(value), "Float32Array", value),
      float64Array: (value) => assertType(is.float64Array(value), "Float64Array", value),
      bigInt64Array: (value) => assertType(is.bigInt64Array(value), "BigInt64Array", value),
      bigUint64Array: (value) => assertType(is.bigUint64Array(value), "BigUint64Array", value),
      arrayBuffer: (value) => assertType(is.arrayBuffer(value), "ArrayBuffer", value),
      sharedArrayBuffer: (value) => assertType(is.sharedArrayBuffer(value), "SharedArrayBuffer", value),
      dataView: (value) => assertType(is.dataView(value), "DataView", value),
      enumCase: (value, targetEnum) => assertType(is.enumCase(value, targetEnum), "EnumCase", value),
      urlInstance: (value) => assertType(is.urlInstance(value), "URL", value),
      urlString: (value) => assertType(is.urlString(value), "string with a URL", value),
      truthy: (value) => assertType(is.truthy(value), "truthy", value),
      falsy: (value) => assertType(is.falsy(value), "falsy", value),
      nan: (value) => assertType(is.nan(value), "NaN", value),
      primitive: (value) => assertType(is.primitive(value), "primitive", value),
      integer: (value) => assertType(is.integer(value), "integer", value),
      safeInteger: (value) => assertType(is.safeInteger(value), "integer", value),
      plainObject: (value) => assertType(is.plainObject(value), "plain object", value),
      typedArray: (value) => assertType(is.typedArray(value), "TypedArray", value),
      arrayLike: (value) => assertType(is.arrayLike(value), "array-like", value),
      domElement: (value) => assertType(is.domElement(value), "HTMLElement", value),
      observable: (value) => assertType(is.observable(value), "Observable", value),
      nodeStream: (value) => assertType(is.nodeStream(value), "Node.js Stream", value),
      infinite: (value) => assertType(is.infinite(value), "infinite number", value),
      emptyArray: (value) => assertType(is.emptyArray(value), "empty array", value),
      nonEmptyArray: (value) => assertType(is.nonEmptyArray(value), "non-empty array", value),
      emptyString: (value) => assertType(is.emptyString(value), "empty string", value),
      emptyStringOrWhitespace: (value) => assertType(is.emptyStringOrWhitespace(value), "empty string or whitespace", value),
      nonEmptyString: (value) => assertType(is.nonEmptyString(value), "non-empty string", value),
      nonEmptyStringAndNotWhitespace: (value) => assertType(is.nonEmptyStringAndNotWhitespace(value), "non-empty string and not whitespace", value),
      emptyObject: (value) => assertType(is.emptyObject(value), "empty object", value),
      nonEmptyObject: (value) => assertType(is.nonEmptyObject(value), "non-empty object", value),
      emptySet: (value) => assertType(is.emptySet(value), "empty set", value),
      nonEmptySet: (value) => assertType(is.nonEmptySet(value), "non-empty set", value),
      emptyMap: (value) => assertType(is.emptyMap(value), "empty map", value),
      nonEmptyMap: (value) => assertType(is.nonEmptyMap(value), "non-empty map", value),
      propertyKey: (value) => assertType(is.propertyKey(value), "PropertyKey", value),
      formData: (value) => assertType(is.formData(value), "FormData", value),
      urlSearchParams: (value) => assertType(is.urlSearchParams(value), "URLSearchParams", value),
      // Numbers.
      evenInteger: (value) => assertType(is.evenInteger(value), "even integer", value),
      oddInteger: (value) => assertType(is.oddInteger(value), "odd integer", value),
      // Two arguments.
      directInstanceOf: (instance, class_) => assertType(is.directInstanceOf(instance, class_), "T", instance),
      inRange: (value, range) => assertType(is.inRange(value, range), "in range", value),
      // Variadic functions.
      any: (predicate, ...values) => {
        return assertType(is.any(predicate, ...values), "predicate returns truthy for any value", values, { multipleValues: true });
      },
      all: (predicate, ...values) => assertType(is.all(predicate, ...values), "predicate returns truthy for all values", values, { multipleValues: true })
    };
    Object.defineProperties(is, {
      class: {
        value: is.class_
      },
      function: {
        value: is.function_
      },
      null: {
        value: is.null_
      }
    });
    Object.defineProperties(exports.assert, {
      class: {
        value: exports.assert.class_
      },
      function: {
        value: exports.assert.function_
      },
      null: {
        value: exports.assert.null_
      }
    });
    exports.default = is;
    module.exports = is;
    module.exports.default = is;
    module.exports.assert = exports.assert;
  }
});

// node_modules/ow/dist/utils/generate-stack.js
var require_generate_stack = __commonJS({
  "node_modules/ow/dist/utils/generate-stack.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.generateStackTrace = void 0;
    var generateStackTrace = () => {
      const stack = new RangeError("INTERNAL_OW_ERROR").stack;
      return stack;
    };
    exports.generateStackTrace = generateStackTrace;
  }
});

// node_modules/ow/dist/argument-error.js
var require_argument_error = __commonJS({
  "node_modules/ow/dist/argument-error.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ArgumentError = void 0;
    var generate_stack_1 = require_generate_stack();
    var wrapStackTrace = (error, stack) => `${error.name}: ${error.message}
${stack}`;
    var ArgumentError = class extends Error {
      constructor(message, context2, errors = /* @__PURE__ */ new Map()) {
        super(message);
        Object.defineProperty(this, "validationErrors", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: void 0
        });
        this.name = "ArgumentError";
        if (Error.captureStackTrace) {
          Error.captureStackTrace(this, context2);
        } else {
          this.stack = wrapStackTrace(this, (0, generate_stack_1.generateStackTrace)());
        }
        this.validationErrors = errors;
      }
    };
    exports.ArgumentError = ArgumentError;
  }
});

// node_modules/ow/dist/utils/random-id.js
var require_random_id = __commonJS({
  "node_modules/ow/dist/utils/random-id.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = () => Math.random().toString(16).slice(2);
  }
});

// node_modules/ow/dist/operators/not.js
var require_not = __commonJS({
  "node_modules/ow/dist/operators/not.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.not = void 0;
    var random_id_1 = require_random_id();
    var predicate_1 = require_predicate();
    var not = (predicate) => {
      const originalAddValidator = predicate.addValidator;
      predicate.addValidator = (validator) => {
        const { validator: fn, message, negatedMessage } = validator;
        const placeholder = (0, random_id_1.default)();
        validator.message = (value, label) => negatedMessage ? negatedMessage(value, label) : message(value, placeholder).replace(/ to /, "$&not ").replace(placeholder, label);
        validator.validator = (value) => !fn(value);
        predicate[predicate_1.validatorSymbol].push(validator);
        predicate.addValidator = originalAddValidator;
        return predicate;
      };
      return predicate;
    };
    exports.not = not;
  }
});

// node_modules/ow/dist/predicates/base-predicate.js
var require_base_predicate = __commonJS({
  "node_modules/ow/dist/predicates/base-predicate.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.isPredicate = exports.testSymbol = void 0;
    exports.testSymbol = /* @__PURE__ */ Symbol("test");
    var isPredicate = (value) => Boolean(value[exports.testSymbol]);
    exports.isPredicate = isPredicate;
  }
});

// node_modules/ow/dist/utils/generate-argument-error-message.js
var require_generate_argument_error_message = __commonJS({
  "node_modules/ow/dist/utils/generate-argument-error-message.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.generateArgumentErrorMessage = void 0;
    var generateArgumentErrorMessage = (errors, isAny = false) => {
      const message = [];
      const errorArray = [...errors.entries()];
      const anyErrorWithoutOneItemOnly = errorArray.some(([, array]) => array.size !== 1);
      if (errorArray.length === 1) {
        const [, returnedErrors] = errorArray[0];
        if (!isAny && returnedErrors.size === 1) {
          const [errorMessage] = returnedErrors;
          return errorMessage;
        }
        for (const entry of returnedErrors) {
          message.push(`${isAny ? "  - " : ""}${entry}`);
        }
        return message.join("\n");
      }
      if (!anyErrorWithoutOneItemOnly) {
        return errorArray.map(([, [item]]) => `  - ${item}`).join("\n");
      }
      for (const [key, value] of errorArray) {
        message.push(`Errors from the "${key}" predicate:`);
        for (const entry of value) {
          message.push(`  - ${entry}`);
        }
      }
      return message.join("\n");
    };
    exports.generateArgumentErrorMessage = generateArgumentErrorMessage;
  }
});

// node_modules/ow/dist/predicates/predicate.js
var require_predicate = __commonJS({
  "node_modules/ow/dist/predicates/predicate.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Predicate = exports.validatorSymbol = void 0;
    var is_1 = require_dist();
    var argument_error_1 = require_argument_error();
    var not_1 = require_not();
    var base_predicate_1 = require_base_predicate();
    var generate_argument_error_message_1 = require_generate_argument_error_message();
    exports.validatorSymbol = /* @__PURE__ */ Symbol("validators");
    var Predicate = class {
      constructor(type, options = {}) {
        Object.defineProperty(this, "type", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: type
        });
        Object.defineProperty(this, "options", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: options
        });
        Object.defineProperty(this, "context", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: {
            validators: []
          }
        });
        this.context = {
          ...this.context,
          ...this.options
        };
        const typeString = this.type.charAt(0).toLowerCase() + this.type.slice(1);
        this.addValidator({
          message: (value, label) => {
            const label_ = label === null || label === void 0 ? void 0 : label.slice(this.type.length + 1);
            return `Expected ${label_ || "argument"} to be of type \`${this.type}\` but received type \`${(0, is_1.default)(value)}\``;
          },
          validator: (value) => is_1.default[typeString](value)
        });
      }
      /**
      @hidden
      */
      [base_predicate_1.testSymbol](value, main, label, idLabel) {
        const errors = /* @__PURE__ */ new Map();
        for (const { validator, message } of this.context.validators) {
          if (this.options.optional === true && value === void 0) {
            continue;
          }
          let result;
          try {
            result = validator(value);
          } catch (error) {
            result = error;
          }
          if (result === true) {
            continue;
          }
          const label2 = is_1.default.function_(label) ? label() : label;
          const labelWithTick = label2 && idLabel ? `\`${label2}\`` : label2;
          const label_ = labelWithTick ? `${this.type} ${labelWithTick}` : this.type;
          const mapKey = label2 || this.type;
          const currentErrors = errors.get(mapKey);
          const errorMessage = message(value, label_, result);
          if (currentErrors) {
            currentErrors.add(errorMessage);
          } else {
            errors.set(mapKey, /* @__PURE__ */ new Set([errorMessage]));
          }
        }
        if (errors.size > 0) {
          const message = (0, generate_argument_error_message_1.generateArgumentErrorMessage)(errors);
          throw new argument_error_1.ArgumentError(message, main, errors);
        }
      }
      /**
      @hidden
      */
      get [exports.validatorSymbol]() {
        return this.context.validators;
      }
      /**
      Invert the following validators.
      */
      get not() {
        return (0, not_1.not)(this);
      }
      /**
          Test if the value matches a custom validation function. The validation function should return an object containing a `validator` and `message`. If the `validator` is `false`, the validation fails and the `message` will be used as error message. If the `message` is a function, the function is invoked with the `label` as argument to let you further customize the error message.
      
          @param customValidator - Custom validation function.
          */
      validate(customValidator) {
        return this.addValidator({
          message: (_, label, error) => typeof error === "string" ? `(${label}) ${error}` : error(label),
          validator: (value) => {
            const { message, validator } = customValidator(value);
            if (validator) {
              return true;
            }
            return message;
          }
        });
      }
      /**
          Test if the value matches a custom validation function. The validation function should return `true` if the value passes the function. If the function either returns `false` or a string, the function fails and the string will be used as error message.
      
          @param validator - Validation function.
          */
      is(validator) {
        return this.addValidator({
          message: (value, label, error) => error ? `(${label}) ${error}` : `Expected ${label} \`${value}\` to pass custom validation function`,
          validator
        });
      }
      /**
          Provide a new error message to be thrown when the validation fails.
      
          @param newMessage - Either a string containing the new message or a function returning the new message.
      
          @example
          ```
          ow('🌈', 'unicorn', ow.string.equals('🦄').message('Expected unicorn, got rainbow'));
          //=> ArgumentError: Expected unicorn, got rainbow
          ```
      
          @example
          ```
          ow('🌈', ow.string.minLength(5).message((value, label) => `Expected ${label}, to have a minimum length of 5, got \`${value}\``));
          //=> ArgumentError: Expected string, to be have a minimum length of 5, got `🌈`
          ```
          */
      message(newMessage) {
        const { validators } = this.context;
        validators[validators.length - 1].message = (value, label) => {
          if (typeof newMessage === "function") {
            return newMessage(value, label);
          }
          return newMessage;
        };
        return this;
      }
      /**
          Register a new validator.
      
          @param validator - Validator to register.
          */
      addValidator(validator) {
        this.context.validators.push(validator);
        return this;
      }
    };
    exports.Predicate = Predicate;
  }
});

// node_modules/vali-date/index.js
var require_vali_date = __commonJS({
  "node_modules/vali-date/index.js"(exports, module) {
    "use strict";
    module.exports = function(str) {
      return !isNaN(Date.parse(str));
    };
  }
});

// node_modules/ow/dist/predicates/string.js
var require_string2 = __commonJS({
  "node_modules/ow/dist/predicates/string.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.StringPredicate = void 0;
    var is_1 = require_dist();
    var valiDate = require_vali_date();
    var predicate_1 = require_predicate();
    var StringPredicate = class extends predicate_1.Predicate {
      /**
      @hidden
      */
      constructor(options) {
        super("string", options);
      }
      /**
          Test a string to have a specific length.
      
          @param length - The length of the string.
          */
      length(length) {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to have length \`${length}\`, got \`${value}\``,
          validator: (value) => value.length === length
        });
      }
      /**
          Test a string to have a minimum length.
      
          @param length - The minimum length of the string.
          */
      minLength(length) {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to have a minimum length of \`${length}\`, got \`${value}\``,
          validator: (value) => value.length >= length,
          negatedMessage: (value, label) => `Expected ${label} to have a maximum length of \`${length - 1}\`, got \`${value}\``
        });
      }
      /**
          Test a string to have a maximum length.
      
          @param length - The maximum length of the string.
          */
      maxLength(length) {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to have a maximum length of \`${length}\`, got \`${value}\``,
          validator: (value) => value.length <= length,
          negatedMessage: (value, label) => `Expected ${label} to have a minimum length of \`${length + 1}\`, got \`${value}\``
        });
      }
      /**
          Test a string against a regular expression.
      
          @param regex - The regular expression to match the value with.
          */
      matches(regex) {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to match \`${regex}\`, got \`${value}\``,
          validator: (value) => regex.test(value)
        });
      }
      /**
          Test a string to start with a specific value.
      
          @param searchString - The value that should be the start of the string.
          */
      startsWith(searchString) {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to start with \`${searchString}\`, got \`${value}\``,
          validator: (value) => value.startsWith(searchString)
        });
      }
      /**
          Test a string to end with a specific value.
      
          @param searchString - The value that should be the end of the string.
          */
      endsWith(searchString) {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to end with \`${searchString}\`, got \`${value}\``,
          validator: (value) => value.endsWith(searchString)
        });
      }
      /**
          Test a string to include a specific value.
      
          @param searchString - The value that should be included in the string.
          */
      includes(searchString) {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to include \`${searchString}\`, got \`${value}\``,
          validator: (value) => value.includes(searchString)
        });
      }
      /**
          Test if the string is an element of the provided list.
      
          @param list - List of possible values.
          */
      oneOf(list) {
        return this.addValidator({
          message: (value, label) => {
            let printedList = JSON.stringify(list);
            if (list.length > 10) {
              const overflow = list.length - 10;
              printedList = JSON.stringify(list.slice(0, 10)).replace(/]$/, `,\u2026+${overflow} more]`);
            }
            return `Expected ${label} to be one of \`${printedList}\`, got \`${value}\``;
          },
          validator: (value) => list.includes(value)
        });
      }
      /**
      Test a string to be empty.
      */
      get empty() {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to be empty, got \`${value}\``,
          validator: (value) => value === ""
        });
      }
      /**
      Test a string to be not empty.
      */
      get nonEmpty() {
        return this.addValidator({
          message: (_, label) => `Expected ${label} to not be empty`,
          validator: (value) => value !== ""
        });
      }
      /**
          Test a string to be equal to a specified string.
      
          @param expected - Expected value to match.
          */
      equals(expected) {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to be equal to \`${expected}\`, got \`${value}\``,
          validator: (value) => value === expected
        });
      }
      /**
      Test a string to be alphanumeric.
      */
      get alphanumeric() {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to be alphanumeric, got \`${value}\``,
          validator: (value) => /^[a-z\d]+$/i.test(value)
        });
      }
      /**
      Test a string to be alphabetical.
      */
      get alphabetical() {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to be alphabetical, got \`${value}\``,
          validator: (value) => /^[a-z]+$/gi.test(value)
        });
      }
      /**
      Test a string to be numeric.
      */
      get numeric() {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to be numeric, got \`${value}\``,
          validator: (value) => /^[+-]?\d+$/i.test(value)
        });
      }
      /**
      Test a string to be a valid date.
      */
      get date() {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to be a date, got \`${value}\``,
          validator: valiDate
        });
      }
      /**
      Test a non-empty string to be lowercase. Matching both alphabetical & numbers.
      */
      get lowercase() {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to be lowercase, got \`${value}\``,
          validator: (value) => value.trim() !== "" && value === value.toLowerCase()
        });
      }
      /**
      Test a non-empty string to be uppercase. Matching both alphabetical & numbers.
      */
      get uppercase() {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to be uppercase, got \`${value}\``,
          validator: (value) => value.trim() !== "" && value === value.toUpperCase()
        });
      }
      /**
      Test a string to be a valid URL.
      */
      get url() {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to be a URL, got \`${value}\``,
          validator: is_1.default.urlString
        });
      }
    };
    exports.StringPredicate = StringPredicate;
  }
});

// node_modules/ow/dist/predicates/number.js
var require_number2 = __commonJS({
  "node_modules/ow/dist/predicates/number.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.NumberPredicate = void 0;
    var is_1 = require_dist();
    var predicate_1 = require_predicate();
    var NumberPredicate = class extends predicate_1.Predicate {
      /**
      @hidden
      */
      constructor(options) {
        super("number", options);
      }
      /**
          Test a number to be in a specified range.
      
          @param start - Start of the range.
          @param end - End of the range.
          */
      inRange(start, end) {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to be in range [${start}..${end}], got ${value}`,
          validator: (value) => is_1.default.inRange(value, [start, end])
        });
      }
      /**
          Test a number to be greater than the provided value.
      
          @param number - Minimum value.
          */
      greaterThan(number) {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to be greater than ${number}, got ${value}`,
          validator: (value) => value > number
        });
      }
      /**
          Test a number to be greater than or equal to the provided value.
      
          @param number - Minimum value.
          */
      greaterThanOrEqual(number) {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to be greater than or equal to ${number}, got ${value}`,
          validator: (value) => value >= number
        });
      }
      /**
          Test a number to be less than the provided value.
      
          @param number - Maximum value.
          */
      lessThan(number) {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to be less than ${number}, got ${value}`,
          validator: (value) => value < number
        });
      }
      /**
          Test a number to be less than or equal to the provided value.
      
          @param number - Minimum value.
          */
      lessThanOrEqual(number) {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to be less than or equal to ${number}, got ${value}`,
          validator: (value) => value <= number
        });
      }
      /**
          Test a number to be equal to a specified number.
      
          @param expected - Expected value to match.
          */
      equal(expected) {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to be equal to ${expected}, got ${value}`,
          validator: (value) => value === expected
        });
      }
      /**
          Test if a number is an element of the provided list.
      
          @param list - List of possible values.
          */
      oneOf(list) {
        return this.addValidator({
          message: (value, label) => {
            let printedList = JSON.stringify(list);
            if (list.length > 10) {
              const overflow = list.length - 10;
              printedList = JSON.stringify(list.slice(0, 10)).replace(/]$/, `,\u2026+${overflow} more]`);
            }
            return `Expected ${label} to be one of \`${printedList}\`, got ${value}`;
          },
          validator: (value) => list.includes(value)
        });
      }
      /**
      Test a number to be an integer.
      */
      get integer() {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to be an integer, got ${value}`,
          validator: (value) => is_1.default.integer(value)
        });
      }
      /**
      Test a number to be finite.
      */
      get finite() {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to be finite, got ${value}`,
          validator: (value) => !is_1.default.infinite(value)
        });
      }
      /**
      Test a number to be infinite.
      */
      get infinite() {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to be infinite, got ${value}`,
          validator: (value) => is_1.default.infinite(value)
        });
      }
      /**
      Test a number to be positive.
      */
      get positive() {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to be positive, got ${value}`,
          validator: (value) => value > 0
        });
      }
      /**
      Test a number to be negative.
      */
      get negative() {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to be negative, got ${value}`,
          validator: (value) => value < 0
        });
      }
      /**
      Test a number to be an integer or infinite.
      */
      get integerOrInfinite() {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to be an integer or infinite, got ${value}`,
          validator: (value) => is_1.default.integer(value) || is_1.default.infinite(value)
        });
      }
      /**
      Test a number to be in a valid range for a 8-bit unsigned integer.
      */
      get uint8() {
        return this.integer.inRange(0, 255);
      }
      /**
      Test a number to be in a valid range for a 16-bit unsigned integer.
      */
      get uint16() {
        return this.integer.inRange(0, 65535);
      }
      /**
      Test a number to be in a valid range for a 32-bit unsigned integer.
      */
      get uint32() {
        return this.integer.inRange(0, 4294967295);
      }
      /**
      Test a number to be in a valid range for a 8-bit signed integer.
      */
      get int8() {
        return this.integer.inRange(-128, 127);
      }
      /**
      Test a number to be in a valid range for a 16-bit signed integer.
      */
      get int16() {
        return this.integer.inRange(-32768, 32767);
      }
      /**
      Test a number to be in a valid range for a 32-bit signed integer.
      */
      get int32() {
        return this.integer.inRange(-2147483648, 2147483647);
      }
    };
    exports.NumberPredicate = NumberPredicate;
  }
});

// node_modules/ow/dist/predicates/bigint.js
var require_bigint = __commonJS({
  "node_modules/ow/dist/predicates/bigint.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.BigIntPredicate = void 0;
    var predicate_1 = require_predicate();
    var BigIntPredicate = class extends predicate_1.Predicate {
      /**
      @hidden
      */
      constructor(options) {
        super("bigint", options);
      }
    };
    exports.BigIntPredicate = BigIntPredicate;
  }
});

// node_modules/ow/dist/predicates/boolean.js
var require_boolean2 = __commonJS({
  "node_modules/ow/dist/predicates/boolean.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.BooleanPredicate = void 0;
    var predicate_1 = require_predicate();
    var BooleanPredicate = class extends predicate_1.Predicate {
      /**
      @hidden
      */
      constructor(options) {
        super("boolean", options);
      }
      /**
      Test a boolean to be true.
      */
      get true() {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to be true, got ${value}`,
          validator: (value) => value
        });
      }
      /**
      Test a boolean to be false.
      */
      get false() {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to be false, got ${value}`,
          validator: (value) => !value
        });
      }
    };
    exports.BooleanPredicate = BooleanPredicate;
  }
});

// node_modules/lodash.isequal/index.js
var require_lodash = __commonJS({
  "node_modules/lodash.isequal/index.js"(exports, module) {
    var LARGE_ARRAY_SIZE = 200;
    var HASH_UNDEFINED = "__lodash_hash_undefined__";
    var COMPARE_PARTIAL_FLAG = 1;
    var COMPARE_UNORDERED_FLAG = 2;
    var MAX_SAFE_INTEGER = 9007199254740991;
    var argsTag = "[object Arguments]";
    var arrayTag = "[object Array]";
    var asyncTag = "[object AsyncFunction]";
    var boolTag = "[object Boolean]";
    var dateTag = "[object Date]";
    var errorTag = "[object Error]";
    var funcTag = "[object Function]";
    var genTag = "[object GeneratorFunction]";
    var mapTag = "[object Map]";
    var numberTag = "[object Number]";
    var nullTag = "[object Null]";
    var objectTag = "[object Object]";
    var promiseTag = "[object Promise]";
    var proxyTag = "[object Proxy]";
    var regexpTag = "[object RegExp]";
    var setTag = "[object Set]";
    var stringTag = "[object String]";
    var symbolTag = "[object Symbol]";
    var undefinedTag = "[object Undefined]";
    var weakMapTag = "[object WeakMap]";
    var arrayBufferTag = "[object ArrayBuffer]";
    var dataViewTag = "[object DataView]";
    var float32Tag = "[object Float32Array]";
    var float64Tag = "[object Float64Array]";
    var int8Tag = "[object Int8Array]";
    var int16Tag = "[object Int16Array]";
    var int32Tag = "[object Int32Array]";
    var uint8Tag = "[object Uint8Array]";
    var uint8ClampedTag = "[object Uint8ClampedArray]";
    var uint16Tag = "[object Uint16Array]";
    var uint32Tag = "[object Uint32Array]";
    var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;
    var reIsHostCtor = /^\[object .+?Constructor\]$/;
    var reIsUint = /^(?:0|[1-9]\d*)$/;
    var typedArrayTags = {};
    typedArrayTags[float32Tag] = typedArrayTags[float64Tag] = typedArrayTags[int8Tag] = typedArrayTags[int16Tag] = typedArrayTags[int32Tag] = typedArrayTags[uint8Tag] = typedArrayTags[uint8ClampedTag] = typedArrayTags[uint16Tag] = typedArrayTags[uint32Tag] = true;
    typedArrayTags[argsTag] = typedArrayTags[arrayTag] = typedArrayTags[arrayBufferTag] = typedArrayTags[boolTag] = typedArrayTags[dataViewTag] = typedArrayTags[dateTag] = typedArrayTags[errorTag] = typedArrayTags[funcTag] = typedArrayTags[mapTag] = typedArrayTags[numberTag] = typedArrayTags[objectTag] = typedArrayTags[regexpTag] = typedArrayTags[setTag] = typedArrayTags[stringTag] = typedArrayTags[weakMapTag] = false;
    var freeGlobal = typeof global == "object" && global && global.Object === Object && global;
    var freeSelf = typeof self == "object" && self && self.Object === Object && self;
    var root = freeGlobal || freeSelf || Function("return this")();
    var freeExports = typeof exports == "object" && exports && !exports.nodeType && exports;
    var freeModule = freeExports && typeof module == "object" && module && !module.nodeType && module;
    var moduleExports = freeModule && freeModule.exports === freeExports;
    var freeProcess = moduleExports && freeGlobal.process;
    var nodeUtil = (function() {
      try {
        return freeProcess && freeProcess.binding && freeProcess.binding("util");
      } catch (e) {
      }
    })();
    var nodeIsTypedArray = nodeUtil && nodeUtil.isTypedArray;
    function arrayFilter(array, predicate) {
      var index = -1, length = array == null ? 0 : array.length, resIndex = 0, result = [];
      while (++index < length) {
        var value = array[index];
        if (predicate(value, index, array)) {
          result[resIndex++] = value;
        }
      }
      return result;
    }
    function arrayPush(array, values) {
      var index = -1, length = values.length, offset = array.length;
      while (++index < length) {
        array[offset + index] = values[index];
      }
      return array;
    }
    function arraySome(array, predicate) {
      var index = -1, length = array == null ? 0 : array.length;
      while (++index < length) {
        if (predicate(array[index], index, array)) {
          return true;
        }
      }
      return false;
    }
    function baseTimes(n, iteratee) {
      var index = -1, result = Array(n);
      while (++index < n) {
        result[index] = iteratee(index);
      }
      return result;
    }
    function baseUnary(func) {
      return function(value) {
        return func(value);
      };
    }
    function cacheHas(cache, key) {
      return cache.has(key);
    }
    function getValue(object, key) {
      return object == null ? void 0 : object[key];
    }
    function mapToArray(map) {
      var index = -1, result = Array(map.size);
      map.forEach(function(value, key) {
        result[++index] = [key, value];
      });
      return result;
    }
    function overArg(func, transform) {
      return function(arg) {
        return func(transform(arg));
      };
    }
    function setToArray(set) {
      var index = -1, result = Array(set.size);
      set.forEach(function(value) {
        result[++index] = value;
      });
      return result;
    }
    var arrayProto = Array.prototype;
    var funcProto = Function.prototype;
    var objectProto = Object.prototype;
    var coreJsData = root["__core-js_shared__"];
    var funcToString = funcProto.toString;
    var hasOwnProperty2 = objectProto.hasOwnProperty;
    var maskSrcKey = (function() {
      var uid = /[^.]+$/.exec(coreJsData && coreJsData.keys && coreJsData.keys.IE_PROTO || "");
      return uid ? "Symbol(src)_1." + uid : "";
    })();
    var nativeObjectToString = objectProto.toString;
    var reIsNative = RegExp(
      "^" + funcToString.call(hasOwnProperty2).replace(reRegExpChar, "\\$&").replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, "$1.*?") + "$"
    );
    var Buffer2 = moduleExports ? root.Buffer : void 0;
    var Symbol2 = root.Symbol;
    var Uint8Array2 = root.Uint8Array;
    var propertyIsEnumerable = objectProto.propertyIsEnumerable;
    var splice = arrayProto.splice;
    var symToStringTag = Symbol2 ? Symbol2.toStringTag : void 0;
    var nativeGetSymbols = Object.getOwnPropertySymbols;
    var nativeIsBuffer = Buffer2 ? Buffer2.isBuffer : void 0;
    var nativeKeys = overArg(Object.keys, Object);
    var DataView = getNative(root, "DataView");
    var Map2 = getNative(root, "Map");
    var Promise2 = getNative(root, "Promise");
    var Set2 = getNative(root, "Set");
    var WeakMap = getNative(root, "WeakMap");
    var nativeCreate = getNative(Object, "create");
    var dataViewCtorString = toSource(DataView);
    var mapCtorString = toSource(Map2);
    var promiseCtorString = toSource(Promise2);
    var setCtorString = toSource(Set2);
    var weakMapCtorString = toSource(WeakMap);
    var symbolProto = Symbol2 ? Symbol2.prototype : void 0;
    var symbolValueOf = symbolProto ? symbolProto.valueOf : void 0;
    function Hash(entries) {
      var index = -1, length = entries == null ? 0 : entries.length;
      this.clear();
      while (++index < length) {
        var entry = entries[index];
        this.set(entry[0], entry[1]);
      }
    }
    function hashClear() {
      this.__data__ = nativeCreate ? nativeCreate(null) : {};
      this.size = 0;
    }
    function hashDelete(key) {
      var result = this.has(key) && delete this.__data__[key];
      this.size -= result ? 1 : 0;
      return result;
    }
    function hashGet(key) {
      var data = this.__data__;
      if (nativeCreate) {
        var result = data[key];
        return result === HASH_UNDEFINED ? void 0 : result;
      }
      return hasOwnProperty2.call(data, key) ? data[key] : void 0;
    }
    function hashHas(key) {
      var data = this.__data__;
      return nativeCreate ? data[key] !== void 0 : hasOwnProperty2.call(data, key);
    }
    function hashSet(key, value) {
      var data = this.__data__;
      this.size += this.has(key) ? 0 : 1;
      data[key] = nativeCreate && value === void 0 ? HASH_UNDEFINED : value;
      return this;
    }
    Hash.prototype.clear = hashClear;
    Hash.prototype["delete"] = hashDelete;
    Hash.prototype.get = hashGet;
    Hash.prototype.has = hashHas;
    Hash.prototype.set = hashSet;
    function ListCache(entries) {
      var index = -1, length = entries == null ? 0 : entries.length;
      this.clear();
      while (++index < length) {
        var entry = entries[index];
        this.set(entry[0], entry[1]);
      }
    }
    function listCacheClear() {
      this.__data__ = [];
      this.size = 0;
    }
    function listCacheDelete(key) {
      var data = this.__data__, index = assocIndexOf(data, key);
      if (index < 0) {
        return false;
      }
      var lastIndex = data.length - 1;
      if (index == lastIndex) {
        data.pop();
      } else {
        splice.call(data, index, 1);
      }
      --this.size;
      return true;
    }
    function listCacheGet(key) {
      var data = this.__data__, index = assocIndexOf(data, key);
      return index < 0 ? void 0 : data[index][1];
    }
    function listCacheHas(key) {
      return assocIndexOf(this.__data__, key) > -1;
    }
    function listCacheSet(key, value) {
      var data = this.__data__, index = assocIndexOf(data, key);
      if (index < 0) {
        ++this.size;
        data.push([key, value]);
      } else {
        data[index][1] = value;
      }
      return this;
    }
    ListCache.prototype.clear = listCacheClear;
    ListCache.prototype["delete"] = listCacheDelete;
    ListCache.prototype.get = listCacheGet;
    ListCache.prototype.has = listCacheHas;
    ListCache.prototype.set = listCacheSet;
    function MapCache(entries) {
      var index = -1, length = entries == null ? 0 : entries.length;
      this.clear();
      while (++index < length) {
        var entry = entries[index];
        this.set(entry[0], entry[1]);
      }
    }
    function mapCacheClear() {
      this.size = 0;
      this.__data__ = {
        "hash": new Hash(),
        "map": new (Map2 || ListCache)(),
        "string": new Hash()
      };
    }
    function mapCacheDelete(key) {
      var result = getMapData(this, key)["delete"](key);
      this.size -= result ? 1 : 0;
      return result;
    }
    function mapCacheGet(key) {
      return getMapData(this, key).get(key);
    }
    function mapCacheHas(key) {
      return getMapData(this, key).has(key);
    }
    function mapCacheSet(key, value) {
      var data = getMapData(this, key), size = data.size;
      data.set(key, value);
      this.size += data.size == size ? 0 : 1;
      return this;
    }
    MapCache.prototype.clear = mapCacheClear;
    MapCache.prototype["delete"] = mapCacheDelete;
    MapCache.prototype.get = mapCacheGet;
    MapCache.prototype.has = mapCacheHas;
    MapCache.prototype.set = mapCacheSet;
    function SetCache(values) {
      var index = -1, length = values == null ? 0 : values.length;
      this.__data__ = new MapCache();
      while (++index < length) {
        this.add(values[index]);
      }
    }
    function setCacheAdd(value) {
      this.__data__.set(value, HASH_UNDEFINED);
      return this;
    }
    function setCacheHas(value) {
      return this.__data__.has(value);
    }
    SetCache.prototype.add = SetCache.prototype.push = setCacheAdd;
    SetCache.prototype.has = setCacheHas;
    function Stack(entries) {
      var data = this.__data__ = new ListCache(entries);
      this.size = data.size;
    }
    function stackClear() {
      this.__data__ = new ListCache();
      this.size = 0;
    }
    function stackDelete(key) {
      var data = this.__data__, result = data["delete"](key);
      this.size = data.size;
      return result;
    }
    function stackGet(key) {
      return this.__data__.get(key);
    }
    function stackHas(key) {
      return this.__data__.has(key);
    }
    function stackSet(key, value) {
      var data = this.__data__;
      if (data instanceof ListCache) {
        var pairs = data.__data__;
        if (!Map2 || pairs.length < LARGE_ARRAY_SIZE - 1) {
          pairs.push([key, value]);
          this.size = ++data.size;
          return this;
        }
        data = this.__data__ = new MapCache(pairs);
      }
      data.set(key, value);
      this.size = data.size;
      return this;
    }
    Stack.prototype.clear = stackClear;
    Stack.prototype["delete"] = stackDelete;
    Stack.prototype.get = stackGet;
    Stack.prototype.has = stackHas;
    Stack.prototype.set = stackSet;
    function arrayLikeKeys(value, inherited) {
      var isArr = isArray(value), isArg = !isArr && isArguments(value), isBuff = !isArr && !isArg && isBuffer(value), isType = !isArr && !isArg && !isBuff && isTypedArray(value), skipIndexes = isArr || isArg || isBuff || isType, result = skipIndexes ? baseTimes(value.length, String) : [], length = result.length;
      for (var key in value) {
        if ((inherited || hasOwnProperty2.call(value, key)) && !(skipIndexes && // Safari 9 has enumerable `arguments.length` in strict mode.
        (key == "length" || // Node.js 0.10 has enumerable non-index properties on buffers.
        isBuff && (key == "offset" || key == "parent") || // PhantomJS 2 has enumerable non-index properties on typed arrays.
        isType && (key == "buffer" || key == "byteLength" || key == "byteOffset") || // Skip index properties.
        isIndex(key, length)))) {
          result.push(key);
        }
      }
      return result;
    }
    function assocIndexOf(array, key) {
      var length = array.length;
      while (length--) {
        if (eq(array[length][0], key)) {
          return length;
        }
      }
      return -1;
    }
    function baseGetAllKeys(object, keysFunc, symbolsFunc) {
      var result = keysFunc(object);
      return isArray(object) ? result : arrayPush(result, symbolsFunc(object));
    }
    function baseGetTag(value) {
      if (value == null) {
        return value === void 0 ? undefinedTag : nullTag;
      }
      return symToStringTag && symToStringTag in Object(value) ? getRawTag(value) : objectToString(value);
    }
    function baseIsArguments(value) {
      return isObjectLike(value) && baseGetTag(value) == argsTag;
    }
    function baseIsEqual(value, other, bitmask, customizer, stack) {
      if (value === other) {
        return true;
      }
      if (value == null || other == null || !isObjectLike(value) && !isObjectLike(other)) {
        return value !== value && other !== other;
      }
      return baseIsEqualDeep(value, other, bitmask, customizer, baseIsEqual, stack);
    }
    function baseIsEqualDeep(object, other, bitmask, customizer, equalFunc, stack) {
      var objIsArr = isArray(object), othIsArr = isArray(other), objTag = objIsArr ? arrayTag : getTag(object), othTag = othIsArr ? arrayTag : getTag(other);
      objTag = objTag == argsTag ? objectTag : objTag;
      othTag = othTag == argsTag ? objectTag : othTag;
      var objIsObj = objTag == objectTag, othIsObj = othTag == objectTag, isSameTag = objTag == othTag;
      if (isSameTag && isBuffer(object)) {
        if (!isBuffer(other)) {
          return false;
        }
        objIsArr = true;
        objIsObj = false;
      }
      if (isSameTag && !objIsObj) {
        stack || (stack = new Stack());
        return objIsArr || isTypedArray(object) ? equalArrays(object, other, bitmask, customizer, equalFunc, stack) : equalByTag(object, other, objTag, bitmask, customizer, equalFunc, stack);
      }
      if (!(bitmask & COMPARE_PARTIAL_FLAG)) {
        var objIsWrapped = objIsObj && hasOwnProperty2.call(object, "__wrapped__"), othIsWrapped = othIsObj && hasOwnProperty2.call(other, "__wrapped__");
        if (objIsWrapped || othIsWrapped) {
          var objUnwrapped = objIsWrapped ? object.value() : object, othUnwrapped = othIsWrapped ? other.value() : other;
          stack || (stack = new Stack());
          return equalFunc(objUnwrapped, othUnwrapped, bitmask, customizer, stack);
        }
      }
      if (!isSameTag) {
        return false;
      }
      stack || (stack = new Stack());
      return equalObjects(object, other, bitmask, customizer, equalFunc, stack);
    }
    function baseIsNative(value) {
      if (!isObject(value) || isMasked(value)) {
        return false;
      }
      var pattern = isFunction(value) ? reIsNative : reIsHostCtor;
      return pattern.test(toSource(value));
    }
    function baseIsTypedArray(value) {
      return isObjectLike(value) && isLength(value.length) && !!typedArrayTags[baseGetTag(value)];
    }
    function baseKeys(object) {
      if (!isPrototype(object)) {
        return nativeKeys(object);
      }
      var result = [];
      for (var key in Object(object)) {
        if (hasOwnProperty2.call(object, key) && key != "constructor") {
          result.push(key);
        }
      }
      return result;
    }
    function equalArrays(array, other, bitmask, customizer, equalFunc, stack) {
      var isPartial = bitmask & COMPARE_PARTIAL_FLAG, arrLength = array.length, othLength = other.length;
      if (arrLength != othLength && !(isPartial && othLength > arrLength)) {
        return false;
      }
      var stacked = stack.get(array);
      if (stacked && stack.get(other)) {
        return stacked == other;
      }
      var index = -1, result = true, seen = bitmask & COMPARE_UNORDERED_FLAG ? new SetCache() : void 0;
      stack.set(array, other);
      stack.set(other, array);
      while (++index < arrLength) {
        var arrValue = array[index], othValue = other[index];
        if (customizer) {
          var compared = isPartial ? customizer(othValue, arrValue, index, other, array, stack) : customizer(arrValue, othValue, index, array, other, stack);
        }
        if (compared !== void 0) {
          if (compared) {
            continue;
          }
          result = false;
          break;
        }
        if (seen) {
          if (!arraySome(other, function(othValue2, othIndex) {
            if (!cacheHas(seen, othIndex) && (arrValue === othValue2 || equalFunc(arrValue, othValue2, bitmask, customizer, stack))) {
              return seen.push(othIndex);
            }
          })) {
            result = false;
            break;
          }
        } else if (!(arrValue === othValue || equalFunc(arrValue, othValue, bitmask, customizer, stack))) {
          result = false;
          break;
        }
      }
      stack["delete"](array);
      stack["delete"](other);
      return result;
    }
    function equalByTag(object, other, tag, bitmask, customizer, equalFunc, stack) {
      switch (tag) {
        case dataViewTag:
          if (object.byteLength != other.byteLength || object.byteOffset != other.byteOffset) {
            return false;
          }
          object = object.buffer;
          other = other.buffer;
        case arrayBufferTag:
          if (object.byteLength != other.byteLength || !equalFunc(new Uint8Array2(object), new Uint8Array2(other))) {
            return false;
          }
          return true;
        case boolTag:
        case dateTag:
        case numberTag:
          return eq(+object, +other);
        case errorTag:
          return object.name == other.name && object.message == other.message;
        case regexpTag:
        case stringTag:
          return object == other + "";
        case mapTag:
          var convert = mapToArray;
        case setTag:
          var isPartial = bitmask & COMPARE_PARTIAL_FLAG;
          convert || (convert = setToArray);
          if (object.size != other.size && !isPartial) {
            return false;
          }
          var stacked = stack.get(object);
          if (stacked) {
            return stacked == other;
          }
          bitmask |= COMPARE_UNORDERED_FLAG;
          stack.set(object, other);
          var result = equalArrays(convert(object), convert(other), bitmask, customizer, equalFunc, stack);
          stack["delete"](object);
          return result;
        case symbolTag:
          if (symbolValueOf) {
            return symbolValueOf.call(object) == symbolValueOf.call(other);
          }
      }
      return false;
    }
    function equalObjects(object, other, bitmask, customizer, equalFunc, stack) {
      var isPartial = bitmask & COMPARE_PARTIAL_FLAG, objProps = getAllKeys(object), objLength = objProps.length, othProps = getAllKeys(other), othLength = othProps.length;
      if (objLength != othLength && !isPartial) {
        return false;
      }
      var index = objLength;
      while (index--) {
        var key = objProps[index];
        if (!(isPartial ? key in other : hasOwnProperty2.call(other, key))) {
          return false;
        }
      }
      var stacked = stack.get(object);
      if (stacked && stack.get(other)) {
        return stacked == other;
      }
      var result = true;
      stack.set(object, other);
      stack.set(other, object);
      var skipCtor = isPartial;
      while (++index < objLength) {
        key = objProps[index];
        var objValue = object[key], othValue = other[key];
        if (customizer) {
          var compared = isPartial ? customizer(othValue, objValue, key, other, object, stack) : customizer(objValue, othValue, key, object, other, stack);
        }
        if (!(compared === void 0 ? objValue === othValue || equalFunc(objValue, othValue, bitmask, customizer, stack) : compared)) {
          result = false;
          break;
        }
        skipCtor || (skipCtor = key == "constructor");
      }
      if (result && !skipCtor) {
        var objCtor = object.constructor, othCtor = other.constructor;
        if (objCtor != othCtor && ("constructor" in object && "constructor" in other) && !(typeof objCtor == "function" && objCtor instanceof objCtor && typeof othCtor == "function" && othCtor instanceof othCtor)) {
          result = false;
        }
      }
      stack["delete"](object);
      stack["delete"](other);
      return result;
    }
    function getAllKeys(object) {
      return baseGetAllKeys(object, keys, getSymbols);
    }
    function getMapData(map, key) {
      var data = map.__data__;
      return isKeyable(key) ? data[typeof key == "string" ? "string" : "hash"] : data.map;
    }
    function getNative(object, key) {
      var value = getValue(object, key);
      return baseIsNative(value) ? value : void 0;
    }
    function getRawTag(value) {
      var isOwn = hasOwnProperty2.call(value, symToStringTag), tag = value[symToStringTag];
      try {
        value[symToStringTag] = void 0;
        var unmasked = true;
      } catch (e) {
      }
      var result = nativeObjectToString.call(value);
      if (unmasked) {
        if (isOwn) {
          value[symToStringTag] = tag;
        } else {
          delete value[symToStringTag];
        }
      }
      return result;
    }
    var getSymbols = !nativeGetSymbols ? stubArray : function(object) {
      if (object == null) {
        return [];
      }
      object = Object(object);
      return arrayFilter(nativeGetSymbols(object), function(symbol) {
        return propertyIsEnumerable.call(object, symbol);
      });
    };
    var getTag = baseGetTag;
    if (DataView && getTag(new DataView(new ArrayBuffer(1))) != dataViewTag || Map2 && getTag(new Map2()) != mapTag || Promise2 && getTag(Promise2.resolve()) != promiseTag || Set2 && getTag(new Set2()) != setTag || WeakMap && getTag(new WeakMap()) != weakMapTag) {
      getTag = function(value) {
        var result = baseGetTag(value), Ctor = result == objectTag ? value.constructor : void 0, ctorString = Ctor ? toSource(Ctor) : "";
        if (ctorString) {
          switch (ctorString) {
            case dataViewCtorString:
              return dataViewTag;
            case mapCtorString:
              return mapTag;
            case promiseCtorString:
              return promiseTag;
            case setCtorString:
              return setTag;
            case weakMapCtorString:
              return weakMapTag;
          }
        }
        return result;
      };
    }
    function isIndex(value, length) {
      length = length == null ? MAX_SAFE_INTEGER : length;
      return !!length && (typeof value == "number" || reIsUint.test(value)) && (value > -1 && value % 1 == 0 && value < length);
    }
    function isKeyable(value) {
      var type = typeof value;
      return type == "string" || type == "number" || type == "symbol" || type == "boolean" ? value !== "__proto__" : value === null;
    }
    function isMasked(func) {
      return !!maskSrcKey && maskSrcKey in func;
    }
    function isPrototype(value) {
      var Ctor = value && value.constructor, proto2 = typeof Ctor == "function" && Ctor.prototype || objectProto;
      return value === proto2;
    }
    function objectToString(value) {
      return nativeObjectToString.call(value);
    }
    function toSource(func) {
      if (func != null) {
        try {
          return funcToString.call(func);
        } catch (e) {
        }
        try {
          return func + "";
        } catch (e) {
        }
      }
      return "";
    }
    function eq(value, other) {
      return value === other || value !== value && other !== other;
    }
    var isArguments = baseIsArguments(/* @__PURE__ */ (function() {
      return arguments;
    })()) ? baseIsArguments : function(value) {
      return isObjectLike(value) && hasOwnProperty2.call(value, "callee") && !propertyIsEnumerable.call(value, "callee");
    };
    var isArray = Array.isArray;
    function isArrayLike(value) {
      return value != null && isLength(value.length) && !isFunction(value);
    }
    var isBuffer = nativeIsBuffer || stubFalse;
    function isEqual(value, other) {
      return baseIsEqual(value, other);
    }
    function isFunction(value) {
      if (!isObject(value)) {
        return false;
      }
      var tag = baseGetTag(value);
      return tag == funcTag || tag == genTag || tag == asyncTag || tag == proxyTag;
    }
    function isLength(value) {
      return typeof value == "number" && value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
    }
    function isObject(value) {
      var type = typeof value;
      return value != null && (type == "object" || type == "function");
    }
    function isObjectLike(value) {
      return value != null && typeof value == "object";
    }
    var isTypedArray = nodeIsTypedArray ? baseUnary(nodeIsTypedArray) : baseIsTypedArray;
    function keys(object) {
      return isArrayLike(object) ? arrayLikeKeys(object) : baseKeys(object);
    }
    function stubArray() {
      return [];
    }
    function stubFalse() {
      return false;
    }
    module.exports = isEqual;
  }
});

// node_modules/ow/dist/test.js
var require_test = __commonJS({
  "node_modules/ow/dist/test.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var base_predicate_1 = require_base_predicate();
    function test(value, label, predicate, idLabel = true) {
      predicate[base_predicate_1.testSymbol](value, test, label, idLabel);
    }
    exports.default = test;
  }
});

// node_modules/ow/dist/utils/match-shape.js
var require_match_shape = __commonJS({
  "node_modules/ow/dist/utils/match-shape.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.exact = exports.partial = void 0;
    var is_1 = require_dist();
    var test_1 = require_test();
    var base_predicate_1 = require_base_predicate();
    function partial(object, shape, parent) {
      try {
        for (const key of Object.keys(shape)) {
          const label = parent ? `${parent}.${key}` : key;
          if ((0, base_predicate_1.isPredicate)(shape[key])) {
            (0, test_1.default)(object[key], label, shape[key]);
          } else if (is_1.default.plainObject(shape[key])) {
            const result = partial(object[key], shape[key], label);
            if (result !== true) {
              return result;
            }
          }
        }
        return true;
      } catch (error) {
        return error.message;
      }
    }
    exports.partial = partial;
    function exact(object, shape, parent, isArray) {
      try {
        const objectKeys = new Set(Object.keys(object));
        for (const key of Object.keys(shape)) {
          objectKeys.delete(key);
          const label = parent ? `${parent}.${key}` : key;
          if ((0, base_predicate_1.isPredicate)(shape[key])) {
            (0, test_1.default)(object[key], label, shape[key]);
          } else if (is_1.default.plainObject(shape[key])) {
            if (!Object.prototype.hasOwnProperty.call(object, key)) {
              return `Expected \`${label}\` to exist`;
            }
            const result = exact(object[key], shape[key], label);
            if (result !== true) {
              return result;
            }
          }
        }
        if (objectKeys.size > 0) {
          const firstKey = [...objectKeys.keys()][0];
          const label = parent ? `${parent}.${firstKey}` : firstKey;
          return `Did not expect ${isArray ? "element" : "property"} \`${label}\` to exist, got \`${object[firstKey]}\``;
        }
        return true;
      } catch (error) {
        return error.message;
      }
    }
    exports.exact = exact;
  }
});

// node_modules/ow/dist/utils/of-type.js
var require_of_type = __commonJS({
  "node_modules/ow/dist/utils/of-type.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var test_1 = require_test();
    exports.default = (source, name, predicate) => {
      try {
        for (const item of source) {
          (0, test_1.default)(item, name, predicate, false);
        }
        return true;
      } catch (error) {
        return error.message;
      }
    };
  }
});

// node_modules/ow/dist/predicates/array.js
var require_array2 = __commonJS({
  "node_modules/ow/dist/predicates/array.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ArrayPredicate = void 0;
    var isEqual = require_lodash();
    var predicate_1 = require_predicate();
    var match_shape_1 = require_match_shape();
    var of_type_1 = require_of_type();
    var ArrayPredicate = class extends predicate_1.Predicate {
      /**
      @hidden
      */
      constructor(options) {
        super("array", options);
      }
      /**
          Test an array to have a specific length.
      
          @param length - The length of the array.
          */
      length(length) {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to have length \`${length}\`, got \`${value.length}\``,
          validator: (value) => value.length === length
        });
      }
      /**
          Test an array to have a minimum length.
      
          @param length - The minimum length of the array.
          */
      minLength(length) {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to have a minimum length of \`${length}\`, got \`${value.length}\``,
          validator: (value) => value.length >= length,
          negatedMessage: (value, label) => `Expected ${label} to have a maximum length of \`${length - 1}\`, got \`${value.length}\``
        });
      }
      /**
          Test an array to have a maximum length.
      
          @param length - The maximum length of the array.
          */
      maxLength(length) {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to have a maximum length of \`${length}\`, got \`${value.length}\``,
          validator: (value) => value.length <= length,
          negatedMessage: (value, label) => `Expected ${label} to have a minimum length of \`${length + 1}\`, got \`${value.length}\``
        });
      }
      /**
          Test an array to start with a specific value. The value is tested by identity, not structure.
      
          @param searchElement - The value that should be the start of the array.
          */
      startsWith(searchElement) {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to start with \`${searchElement}\`, got \`${value[0]}\``,
          validator: (value) => value[0] === searchElement
        });
      }
      /**
          Test an array to end with a specific value. The value is tested by identity, not structure.
      
          @param searchElement - The value that should be the end of the array.
          */
      endsWith(searchElement) {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to end with \`${searchElement}\`, got \`${value[value.length - 1]}\``,
          validator: (value) => value[value.length - 1] === searchElement
        });
      }
      /**
          Test an array to include all the provided elements. The values are tested by identity, not structure.
      
          @param searchElements - The values that should be included in the array.
          */
      includes(...searchElements) {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to include all elements of \`${JSON.stringify(searchElements)}\`, got \`${JSON.stringify(value)}\``,
          validator: (value) => searchElements.every((element) => value.includes(element))
        });
      }
      /**
          Test an array to include any of the provided elements. The values are tested by identity, not structure.
      
          @param searchElements - The values that should be included in the array.
          */
      includesAny(...searchElements) {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to include any element of \`${JSON.stringify(searchElements)}\`, got \`${JSON.stringify(value)}\``,
          validator: (value) => searchElements.some((element) => value.includes(element))
        });
      }
      /**
      Test an array to be empty.
      */
      get empty() {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to be empty, got \`${JSON.stringify(value)}\``,
          validator: (value) => value.length === 0
        });
      }
      /**
      Test an array to be not empty.
      */
      get nonEmpty() {
        return this.addValidator({
          message: (_, label) => `Expected ${label} to not be empty`,
          validator: (value) => value.length > 0
        });
      }
      /**
          Test an array to be deeply equal to the provided array.
      
          @param expected - Expected value to match.
          */
      deepEqual(expected) {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to be deeply equal to \`${JSON.stringify(expected)}\`, got \`${JSON.stringify(value)}\``,
          validator: (value) => isEqual(value, expected)
        });
      }
      /**
          Test all elements in the array to match to provided predicate.
      
          @param predicate - The predicate that should be applied against every individual item.
      
          @example
          ```
          ow(['a', 1], ow.array.ofType(ow.any(ow.string, ow.number)));
          ```
          */
      ofType(predicate) {
        return this.addValidator({
          message: (_, label, error) => `(${label}) ${error}`,
          validator: (value) => (0, of_type_1.default)(value, "values", predicate)
        });
      }
      /**
          Test if the elements in the array exactly matches the elements placed at the same indices in the predicates array.
      
          @param predicates - Predicates to test the array against. Describes what the tested array should look like.
      
          @example
          ```
          ow(['1', 2], ow.array.exactShape([ow.string, ow.number]));
          ```
          */
      exactShape(predicates) {
        const shape = predicates;
        return this.addValidator({
          message: (_, label, message) => `${message.replace("Expected", "Expected element")} in ${label}`,
          validator: (object) => (0, match_shape_1.exact)(object, shape, void 0, true)
        });
      }
    };
    exports.ArrayPredicate = ArrayPredicate;
  }
});

// node_modules/is-obj/index.js
var require_is_obj = __commonJS({
  "node_modules/is-obj/index.js"(exports, module) {
    "use strict";
    module.exports = (value) => {
      const type = typeof value;
      return value !== null && (type === "object" || type === "function");
    };
  }
});

// node_modules/dot-prop/index.js
var require_dot_prop = __commonJS({
  "node_modules/dot-prop/index.js"(exports, module) {
    "use strict";
    var isObj = require_is_obj();
    var disallowedKeys = /* @__PURE__ */ new Set([
      "__proto__",
      "prototype",
      "constructor"
    ]);
    var isValidPath = (pathSegments) => !pathSegments.some((segment) => disallowedKeys.has(segment));
    function getPathSegments(path3) {
      const pathArray = path3.split(".");
      const parts = [];
      for (let i = 0; i < pathArray.length; i++) {
        let p = pathArray[i];
        while (p[p.length - 1] === "\\" && pathArray[i + 1] !== void 0) {
          p = p.slice(0, -1) + ".";
          p += pathArray[++i];
        }
        parts.push(p);
      }
      if (!isValidPath(parts)) {
        return [];
      }
      return parts;
    }
    module.exports = {
      get(object, path3, value) {
        if (!isObj(object) || typeof path3 !== "string") {
          return value === void 0 ? object : value;
        }
        const pathArray = getPathSegments(path3);
        if (pathArray.length === 0) {
          return;
        }
        for (let i = 0; i < pathArray.length; i++) {
          object = object[pathArray[i]];
          if (object === void 0 || object === null) {
            if (i !== pathArray.length - 1) {
              return value;
            }
            break;
          }
        }
        return object === void 0 ? value : object;
      },
      set(object, path3, value) {
        if (!isObj(object) || typeof path3 !== "string") {
          return object;
        }
        const root = object;
        const pathArray = getPathSegments(path3);
        for (let i = 0; i < pathArray.length; i++) {
          const p = pathArray[i];
          if (!isObj(object[p])) {
            object[p] = {};
          }
          if (i === pathArray.length - 1) {
            object[p] = value;
          }
          object = object[p];
        }
        return root;
      },
      delete(object, path3) {
        if (!isObj(object) || typeof path3 !== "string") {
          return false;
        }
        const pathArray = getPathSegments(path3);
        for (let i = 0; i < pathArray.length; i++) {
          const p = pathArray[i];
          if (i === pathArray.length - 1) {
            delete object[p];
            return true;
          }
          object = object[p];
          if (!isObj(object)) {
            return false;
          }
        }
      },
      has(object, path3) {
        if (!isObj(object) || typeof path3 !== "string") {
          return false;
        }
        const pathArray = getPathSegments(path3);
        if (pathArray.length === 0) {
          return false;
        }
        for (let i = 0; i < pathArray.length; i++) {
          if (isObj(object)) {
            if (!(pathArray[i] in object)) {
              return false;
            }
            object = object[pathArray[i]];
          } else {
            return false;
          }
        }
        return true;
      }
    };
  }
});

// node_modules/ow/dist/utils/has-items.js
var require_has_items = __commonJS({
  "node_modules/ow/dist/utils/has-items.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = (source, items, maxValues = 5) => {
      const missingValues = [];
      for (const value of items) {
        if (source.has(value)) {
          continue;
        }
        missingValues.push(value);
        if (missingValues.length === maxValues) {
          return missingValues;
        }
      }
      return missingValues.length === 0 ? true : missingValues;
    };
  }
});

// node_modules/ow/dist/utils/of-type-deep.js
var require_of_type_deep = __commonJS({
  "node_modules/ow/dist/utils/of-type-deep.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var is_1 = require_dist();
    var test_1 = require_test();
    var ofTypeDeep = (object, predicate) => {
      if (!is_1.default.plainObject(object)) {
        (0, test_1.default)(object, "deep values", predicate, false);
        return true;
      }
      return Object.values(object).every((value) => ofTypeDeep(value, predicate));
    };
    exports.default = (object, predicate) => {
      try {
        return ofTypeDeep(object, predicate);
      } catch (error) {
        return error.message;
      }
    };
  }
});

// node_modules/ow/dist/predicates/object.js
var require_object = __commonJS({
  "node_modules/ow/dist/predicates/object.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ObjectPredicate = void 0;
    var is_1 = require_dist();
    var dotProp = require_dot_prop();
    var isEqual = require_lodash();
    var has_items_1 = require_has_items();
    var of_type_1 = require_of_type();
    var of_type_deep_1 = require_of_type_deep();
    var match_shape_1 = require_match_shape();
    var predicate_1 = require_predicate();
    var ObjectPredicate = class extends predicate_1.Predicate {
      /**
      @hidden
      */
      constructor(options) {
        super("object", options);
      }
      /**
      Test if an Object is a plain object.
      */
      get plain() {
        return this.addValidator({
          message: (_, label) => `Expected ${label} to be a plain object`,
          validator: (object) => is_1.default.plainObject(object)
        });
      }
      /**
      Test an object to be empty.
      */
      get empty() {
        return this.addValidator({
          message: (object, label) => `Expected ${label} to be empty, got \`${JSON.stringify(object)}\``,
          validator: (object) => Object.keys(object).length === 0
        });
      }
      /**
      Test an object to be not empty.
      */
      get nonEmpty() {
        return this.addValidator({
          message: (_, label) => `Expected ${label} to not be empty`,
          validator: (object) => Object.keys(object).length > 0
        });
      }
      /**
          Test all the values in the object to match the provided predicate.
      
          @param predicate - The predicate that should be applied against every value in the object.
          */
      valuesOfType(predicate) {
        return this.addValidator({
          message: (_, label, error) => `(${label}) ${error}`,
          validator: (object) => (0, of_type_1.default)(Object.values(object), "values", predicate)
        });
      }
      /**
          Test all the values in the object deeply to match the provided predicate.
      
          @param predicate - The predicate that should be applied against every value in the object.
          */
      deepValuesOfType(predicate) {
        return this.addValidator({
          message: (_, label, error) => `(${label}) ${error}`,
          validator: (object) => (0, of_type_deep_1.default)(object, predicate)
        });
      }
      /**
          Test an object to be deeply equal to the provided object.
      
          @param expected - Expected object to match.
          */
      deepEqual(expected) {
        return this.addValidator({
          message: (object, label) => `Expected ${label} to be deeply equal to \`${JSON.stringify(expected)}\`, got \`${JSON.stringify(object)}\``,
          validator: (object) => isEqual(object, expected)
        });
      }
      /**
          Test an object to be of a specific instance type.
      
          @param instance - The expected instance type of the object.
          */
      instanceOf(instance) {
        return this.addValidator({
          message: (object, label) => {
            var _a;
            let { name } = (_a = object === null || object === void 0 ? void 0 : object.constructor) !== null && _a !== void 0 ? _a : {};
            if (!name || name === "Object") {
              name = JSON.stringify(object);
            }
            return `Expected ${label} \`${name}\` to be of type \`${instance.name}\``;
          },
          validator: (object) => object instanceof instance
        });
      }
      /**
          Test an object to include all the provided keys. You can use [dot-notation](https://github.com/sindresorhus/dot-prop) in a key to access nested properties.
      
          @param keys - The keys that should be present in the object.
          */
      hasKeys(...keys) {
        return this.addValidator({
          message: (_, label, missingKeys) => `Expected ${label} to have keys \`${JSON.stringify(missingKeys)}\``,
          validator: (object) => (0, has_items_1.default)({
            has: (item) => dotProp.has(object, item)
          }, keys)
        });
      }
      /**
          Test an object to include any of the provided keys. You can use [dot-notation](https://github.com/sindresorhus/dot-prop) in a key to access nested properties.
      
          @param keys - The keys that could be a key in the object.
          */
      hasAnyKeys(...keys) {
        return this.addValidator({
          message: (_, label) => `Expected ${label} to have any key of \`${JSON.stringify(keys)}\``,
          validator: (object) => keys.some((key) => dotProp.has(object, key))
        });
      }
      /**
          Test an object to match the `shape` partially. This means that it ignores unexpected properties. The shape comparison is deep.
      
          The shape is an object which describes how the tested object should look like. The keys are the same as the source object and the values are predicates.
      
          @param shape - Shape to test the object against.
      
          @example
          ```
          import ow from 'ow';
      
          const object = {
              unicorn: '🦄',
              rainbow: '🌈'
          };
      
          ow(object, ow.object.partialShape({
              unicorn: ow.string
          }));
          ```
          */
      partialShape(shape) {
        return this.addValidator({
          // TODO: Improve this when message handling becomes smarter
          message: (_, label, message) => `${message.replace("Expected", "Expected property")} in ${label}`,
          validator: (object) => (0, match_shape_1.partial)(object, shape)
        });
      }
      /**
          Test an object to match the `shape` exactly. This means that will fail if it comes across unexpected properties. The shape comparison is deep.
      
          The shape is an object which describes how the tested object should look like. The keys are the same as the source object and the values are predicates.
      
          @param shape - Shape to test the object against.
      
          @example
          ```
          import ow from 'ow';
      
          ow({unicorn: '🦄'}, ow.object.exactShape({
              unicorn: ow.string
          }));
          ```
          */
      exactShape(shape) {
        return this.addValidator({
          // TODO: Improve this when message handling becomes smarter
          message: (_, label, message) => `${message.replace("Expected", "Expected property")} in ${label}`,
          validator: (object) => (0, match_shape_1.exact)(object, shape)
        });
      }
    };
    exports.ObjectPredicate = ObjectPredicate;
  }
});

// node_modules/ow/dist/predicates/date.js
var require_date = __commonJS({
  "node_modules/ow/dist/predicates/date.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.DatePredicate = void 0;
    var predicate_1 = require_predicate();
    var DatePredicate = class extends predicate_1.Predicate {
      /**
      @hidden
      */
      constructor(options) {
        super("date", options);
      }
      /**
          Test a date to be before another date.
      
          @param date - Maximum value.
          */
      before(date) {
        return this.addValidator({
          message: (value, label) => `Expected ${label} ${value.toISOString()} to be before ${date.toISOString()}`,
          validator: (value) => value.getTime() < date.getTime()
        });
      }
      /**
          Test a date to be before another date.
      
          @param date - Minimum value.
          */
      after(date) {
        return this.addValidator({
          message: (value, label) => `Expected ${label} ${value.toISOString()} to be after ${date.toISOString()}`,
          validator: (value) => value.getTime() > date.getTime()
        });
      }
    };
    exports.DatePredicate = DatePredicate;
  }
});

// node_modules/ow/dist/predicates/error.js
var require_error = __commonJS({
  "node_modules/ow/dist/predicates/error.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ErrorPredicate = void 0;
    var predicate_1 = require_predicate();
    var ErrorPredicate = class extends predicate_1.Predicate {
      /**
      @hidden
      */
      constructor(options) {
        super("error", options);
      }
      /**
          Test an error to have a specific name.
      
          @param expected - Expected name of the Error.
          */
      name(expected) {
        return this.addValidator({
          message: (error, label) => `Expected ${label} to have name \`${expected}\`, got \`${error.name}\``,
          validator: (error) => error.name === expected
        });
      }
      /**
          Test an error to have a specific message.
      
          @param expected - Expected message of the Error.
          */
      message(expected) {
        return this.addValidator({
          message: (error, label) => `Expected ${label} message to be \`${expected}\`, got \`${error.message}\``,
          validator: (error) => error.message === expected
        });
      }
      /**
          Test the error message to include a specific message.
      
          @param message - Message that should be included in the error.
          */
      messageIncludes(message) {
        return this.addValidator({
          message: (error, label) => `Expected ${label} message to include \`${message}\`, got \`${error.message}\``,
          validator: (error) => error.message.includes(message)
        });
      }
      /**
          Test the error object to have specific keys.
      
          @param keys - One or more keys which should be part of the error object.
          */
      hasKeys(...keys) {
        return this.addValidator({
          message: (_, label) => `Expected ${label} message to have keys \`${keys.join("`, `")}\``,
          validator: (error) => keys.every((key) => Object.prototype.hasOwnProperty.call(error, key))
        });
      }
      /**
          Test an error to be of a specific instance type.
      
          @param instance - The expected instance type of the error.
          */
      instanceOf(instance) {
        return this.addValidator({
          message: (error, label) => `Expected ${label} \`${error.name}\` to be of type \`${instance.name}\``,
          validator: (error) => error instanceof instance
        });
      }
      /**
      Test an Error to be a TypeError.
      */
      get typeError() {
        return this.instanceOf(TypeError);
      }
      /**
      Test an Error to be an EvalError.
      */
      get evalError() {
        return this.instanceOf(EvalError);
      }
      /**
      Test an Error to be a RangeError.
      */
      get rangeError() {
        return this.instanceOf(RangeError);
      }
      /**
      Test an Error to be a ReferenceError.
      */
      get referenceError() {
        return this.instanceOf(ReferenceError);
      }
      /**
      Test an Error to be a SyntaxError.
      */
      get syntaxError() {
        return this.instanceOf(SyntaxError);
      }
      /**
      Test an Error to be a URIError.
      */
      get uriError() {
        return this.instanceOf(URIError);
      }
    };
    exports.ErrorPredicate = ErrorPredicate;
  }
});

// node_modules/ow/dist/predicates/map.js
var require_map = __commonJS({
  "node_modules/ow/dist/predicates/map.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.MapPredicate = void 0;
    var isEqual = require_lodash();
    var has_items_1 = require_has_items();
    var of_type_1 = require_of_type();
    var predicate_1 = require_predicate();
    var MapPredicate = class extends predicate_1.Predicate {
      /**
      @hidden
      */
      constructor(options) {
        super("Map", options);
      }
      /**
          Test a Map to have a specific size.
      
          @param size - The size of the Map.
          */
      size(size) {
        return this.addValidator({
          message: (map, label) => `Expected ${label} to have size \`${size}\`, got \`${map.size}\``,
          validator: (map) => map.size === size
        });
      }
      /**
          Test an Map to have a minimum size.
      
          @param size - The minimum size of the Map.
          */
      minSize(size) {
        return this.addValidator({
          message: (map, label) => `Expected ${label} to have a minimum size of \`${size}\`, got \`${map.size}\``,
          validator: (map) => map.size >= size,
          negatedMessage: (map, label) => `Expected ${label} to have a maximum size of \`${size - 1}\`, got \`${map.size}\``
        });
      }
      /**
          Test an Map to have a maximum size.
      
          @param size - The maximum size of the Map.
          */
      maxSize(size) {
        return this.addValidator({
          message: (map, label) => `Expected ${label} to have a maximum size of \`${size}\`, got \`${map.size}\``,
          validator: (map) => map.size <= size,
          negatedMessage: (map, label) => `Expected ${label} to have a minimum size of \`${size + 1}\`, got \`${map.size}\``
        });
      }
      /**
          Test a Map to include all the provided keys. The keys are tested by identity, not structure.
      
          @param keys - The keys that should be a key in the Map.
          */
      hasKeys(...keys) {
        return this.addValidator({
          message: (_, label, missingKeys) => `Expected ${label} to have keys \`${JSON.stringify(missingKeys)}\``,
          validator: (map) => (0, has_items_1.default)(map, keys)
        });
      }
      /**
          Test a Map to include any of the provided keys. The keys are tested by identity, not structure.
      
          @param keys - The keys that could be a key in the Map.
          */
      hasAnyKeys(...keys) {
        return this.addValidator({
          message: (_, label) => `Expected ${label} to have any key of \`${JSON.stringify(keys)}\``,
          validator: (map) => keys.some((key) => map.has(key))
        });
      }
      /**
          Test a Map to include all the provided values. The values are tested by identity, not structure.
      
          @param values - The values that should be a value in the Map.
          */
      hasValues(...values) {
        return this.addValidator({
          message: (_, label, missingValues) => `Expected ${label} to have values \`${JSON.stringify(missingValues)}\``,
          validator: (map) => (0, has_items_1.default)(new Set(map.values()), values)
        });
      }
      /**
          Test a Map to include any of the provided values. The values are tested by identity, not structure.
      
          @param values - The values that could be a value in the Map.
          */
      hasAnyValues(...values) {
        return this.addValidator({
          message: (_, label) => `Expected ${label} to have any value of \`${JSON.stringify(values)}\``,
          validator: (map) => {
            const valueSet = new Set(map.values());
            return values.some((key) => valueSet.has(key));
          }
        });
      }
      /**
          Test all the keys in the Map to match the provided predicate.
      
          @param predicate - The predicate that should be applied against every key in the Map.
          */
      keysOfType(predicate) {
        return this.addValidator({
          message: (_, label, error) => `(${label}) ${error}`,
          validator: (map) => (0, of_type_1.default)(map.keys(), "keys", predicate)
        });
      }
      /**
          Test all the values in the Map to match the provided predicate.
      
          @param predicate - The predicate that should be applied against every value in the Map.
          */
      valuesOfType(predicate) {
        return this.addValidator({
          message: (_, label, error) => `(${label}) ${error}`,
          validator: (map) => (0, of_type_1.default)(map.values(), "values", predicate)
        });
      }
      /**
      Test a Map to be empty.
      */
      get empty() {
        return this.addValidator({
          message: (map, label) => `Expected ${label} to be empty, got \`${JSON.stringify([...map])}\``,
          validator: (map) => map.size === 0
        });
      }
      /**
      Test a Map to be not empty.
      */
      get nonEmpty() {
        return this.addValidator({
          message: (_, label) => `Expected ${label} to not be empty`,
          validator: (map) => map.size > 0
        });
      }
      /**
          Test a Map to be deeply equal to the provided Map.
      
          @param expected - Expected Map to match.
          */
      deepEqual(expected) {
        return this.addValidator({
          message: (map, label) => `Expected ${label} to be deeply equal to \`${JSON.stringify([...expected])}\`, got \`${JSON.stringify([...map])}\``,
          validator: (map) => isEqual(map, expected)
        });
      }
    };
    exports.MapPredicate = MapPredicate;
  }
});

// node_modules/ow/dist/predicates/weak-map.js
var require_weak_map = __commonJS({
  "node_modules/ow/dist/predicates/weak-map.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.WeakMapPredicate = void 0;
    var has_items_1 = require_has_items();
    var predicate_1 = require_predicate();
    var WeakMapPredicate = class extends predicate_1.Predicate {
      /**
      @hidden
      */
      constructor(options) {
        super("WeakMap", options);
      }
      /**
          Test a WeakMap to include all the provided keys. The keys are tested by identity, not structure.
      
          @param keys - The keys that should be a key in the WeakMap.
          */
      hasKeys(...keys) {
        return this.addValidator({
          message: (_, label, missingKeys) => `Expected ${label} to have keys \`${JSON.stringify(missingKeys)}\``,
          validator: (map) => (0, has_items_1.default)(map, keys)
        });
      }
      /**
          Test a WeakMap to include any of the provided keys. The keys are tested by identity, not structure.
      
          @param keys - The keys that could be a key in the WeakMap.
          */
      hasAnyKeys(...keys) {
        return this.addValidator({
          message: (_, label) => `Expected ${label} to have any key of \`${JSON.stringify(keys)}\``,
          validator: (map) => keys.some((key) => map.has(key))
        });
      }
    };
    exports.WeakMapPredicate = WeakMapPredicate;
  }
});

// node_modules/ow/dist/predicates/set.js
var require_set = __commonJS({
  "node_modules/ow/dist/predicates/set.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.SetPredicate = void 0;
    var isEqual = require_lodash();
    var has_items_1 = require_has_items();
    var of_type_1 = require_of_type();
    var predicate_1 = require_predicate();
    var SetPredicate = class extends predicate_1.Predicate {
      /**
      @hidden
      */
      constructor(options) {
        super("Set", options);
      }
      /**
          Test a Set to have a specific size.
      
          @param size - The size of the Set.
          */
      size(size) {
        return this.addValidator({
          message: (set, label) => `Expected ${label} to have size \`${size}\`, got \`${set.size}\``,
          validator: (set) => set.size === size
        });
      }
      /**
          Test a Set to have a minimum size.
      
          @param size - The minimum size of the Set.
          */
      minSize(size) {
        return this.addValidator({
          message: (set, label) => `Expected ${label} to have a minimum size of \`${size}\`, got \`${set.size}\``,
          validator: (set) => set.size >= size,
          negatedMessage: (set, label) => `Expected ${label} to have a maximum size of \`${size - 1}\`, got \`${set.size}\``
        });
      }
      /**
          Test a Set to have a maximum size.
      
          @param size - The maximum size of the Set.
          */
      maxSize(size) {
        return this.addValidator({
          message: (set, label) => `Expected ${label} to have a maximum size of \`${size}\`, got \`${set.size}\``,
          validator: (set) => set.size <= size,
          negatedMessage: (set, label) => `Expected ${label} to have a minimum size of \`${size + 1}\`, got \`${set.size}\``
        });
      }
      /**
          Test a Set to include all the provided items. The items are tested by identity, not structure.
      
          @param items - The items that should be a item in the Set.
          */
      has(...items) {
        return this.addValidator({
          message: (_, label, missingItems) => `Expected ${label} to have items \`${JSON.stringify(missingItems)}\``,
          validator: (set) => (0, has_items_1.default)(set, items)
        });
      }
      /**
          Test a Set to include any of the provided items. The items are tested by identity, not structure.
      
          @param items - The items that could be a item in the Set.
          */
      hasAny(...items) {
        return this.addValidator({
          message: (_, label) => `Expected ${label} to have any item of \`${JSON.stringify(items)}\``,
          validator: (set) => items.some((item) => set.has(item))
        });
      }
      /**
          Test all the items in the Set to match the provided predicate.
      
          @param predicate - The predicate that should be applied against every item in the Set.
          */
      ofType(predicate) {
        return this.addValidator({
          message: (_, label, error) => `(${label}) ${error}`,
          validator: (set) => (0, of_type_1.default)(set, "values", predicate)
        });
      }
      /**
      Test a Set to be empty.
      */
      get empty() {
        return this.addValidator({
          message: (set, label) => `Expected ${label} to be empty, got \`${JSON.stringify([...set])}\``,
          validator: (set) => set.size === 0
        });
      }
      /**
      Test a Set to be not empty.
      */
      get nonEmpty() {
        return this.addValidator({
          message: (_, label) => `Expected ${label} to not be empty`,
          validator: (set) => set.size > 0
        });
      }
      /**
          Test a Set to be deeply equal to the provided Set.
      
          @param expected - Expected Set to match.
          */
      deepEqual(expected) {
        return this.addValidator({
          message: (set, label) => `Expected ${label} to be deeply equal to \`${JSON.stringify([...expected])}\`, got \`${JSON.stringify([...set])}\``,
          validator: (set) => isEqual(set, expected)
        });
      }
    };
    exports.SetPredicate = SetPredicate;
  }
});

// node_modules/ow/dist/predicates/weak-set.js
var require_weak_set = __commonJS({
  "node_modules/ow/dist/predicates/weak-set.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.WeakSetPredicate = void 0;
    var has_items_1 = require_has_items();
    var predicate_1 = require_predicate();
    var WeakSetPredicate = class extends predicate_1.Predicate {
      /**
      @hidden
      */
      constructor(options) {
        super("WeakSet", options);
      }
      /**
          Test a WeakSet to include all the provided items. The items are tested by identity, not structure.
      
          @param items - The items that should be a item in the WeakSet.
          */
      has(...items) {
        return this.addValidator({
          message: (_, label, missingItems) => `Expected ${label} to have items \`${JSON.stringify(missingItems)}\``,
          validator: (set) => (0, has_items_1.default)(set, items)
        });
      }
      /**
          Test a WeakSet to include any of the provided items. The items are tested by identity, not structure.
      
          @param items - The items that could be a item in the WeakSet.
          */
      hasAny(...items) {
        return this.addValidator({
          message: (_, label) => `Expected ${label} to have any item of \`${JSON.stringify(items)}\``,
          validator: (set) => items.some((item) => set.has(item))
        });
      }
    };
    exports.WeakSetPredicate = WeakSetPredicate;
  }
});

// node_modules/ow/dist/predicates/typed-array.js
var require_typed_array = __commonJS({
  "node_modules/ow/dist/predicates/typed-array.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.TypedArrayPredicate = void 0;
    var predicate_1 = require_predicate();
    var TypedArrayPredicate = class extends predicate_1.Predicate {
      /**
          Test a typed array to have a specific byte length.
      
          @param byteLength - The byte length of the typed array.
          */
      byteLength(byteLength) {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to have byte length of \`${byteLength}\`, got \`${value.byteLength}\``,
          validator: (value) => value.byteLength === byteLength
        });
      }
      /**
          Test a typed array to have a minimum byte length.
      
          @param byteLength - The minimum byte length of the typed array.
          */
      minByteLength(byteLength) {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to have a minimum byte length of \`${byteLength}\`, got \`${value.byteLength}\``,
          validator: (value) => value.byteLength >= byteLength,
          negatedMessage: (value, label) => `Expected ${label} to have a maximum byte length of \`${byteLength - 1}\`, got \`${value.byteLength}\``
        });
      }
      /**
          Test a typed array to have a minimum byte length.
      
          @param length - The minimum byte length of the typed array.
          */
      maxByteLength(byteLength) {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to have a maximum byte length of \`${byteLength}\`, got \`${value.byteLength}\``,
          validator: (value) => value.byteLength <= byteLength,
          negatedMessage: (value, label) => `Expected ${label} to have a minimum byte length of \`${byteLength + 1}\`, got \`${value.byteLength}\``
        });
      }
      /**
          Test a typed array to have a specific length.
      
          @param length - The length of the typed array.
          */
      length(length) {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to have length \`${length}\`, got \`${value.length}\``,
          validator: (value) => value.length === length
        });
      }
      /**
          Test a typed array to have a minimum length.
      
          @param length - The minimum length of the typed array.
          */
      minLength(length) {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to have a minimum length of \`${length}\`, got \`${value.length}\``,
          validator: (value) => value.length >= length,
          negatedMessage: (value, label) => `Expected ${label} to have a maximum length of \`${length - 1}\`, got \`${value.length}\``
        });
      }
      /**
          Test a typed array to have a maximum length.
      
          @param length - The maximum length of the typed array.
          */
      maxLength(length) {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to have a maximum length of \`${length}\`, got \`${value.length}\``,
          validator: (value) => value.length <= length,
          negatedMessage: (value, label) => `Expected ${label} to have a minimum length of \`${length + 1}\`, got \`${value.length}\``
        });
      }
    };
    exports.TypedArrayPredicate = TypedArrayPredicate;
  }
});

// node_modules/ow/dist/predicates/array-buffer.js
var require_array_buffer = __commonJS({
  "node_modules/ow/dist/predicates/array-buffer.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ArrayBufferPredicate = void 0;
    var predicate_1 = require_predicate();
    var ArrayBufferPredicate = class extends predicate_1.Predicate {
      /**
          Test an array buffer to have a specific byte length.
      
          @param byteLength - The byte length of the array buffer.
          */
      byteLength(byteLength) {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to have byte length of \`${byteLength}\`, got \`${value.byteLength}\``,
          validator: (value) => value.byteLength === byteLength
        });
      }
      /**
          Test an array buffer to have a minimum byte length.
      
          @param byteLength - The minimum byte length of the array buffer.
          */
      minByteLength(byteLength) {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to have a minimum byte length of \`${byteLength}\`, got \`${value.byteLength}\``,
          validator: (value) => value.byteLength >= byteLength,
          negatedMessage: (value, label) => `Expected ${label} to have a maximum byte length of \`${byteLength - 1}\`, got \`${value.byteLength}\``
        });
      }
      /**
          Test an array buffer to have a minimum byte length.
      
          @param length - The minimum byte length of the array buffer.
          */
      maxByteLength(byteLength) {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to have a maximum byte length of \`${byteLength}\`, got \`${value.byteLength}\``,
          validator: (value) => value.byteLength <= byteLength,
          negatedMessage: (value, label) => `Expected ${label} to have a minimum byte length of \`${byteLength + 1}\`, got \`${value.byteLength}\``
        });
      }
    };
    exports.ArrayBufferPredicate = ArrayBufferPredicate;
  }
});

// node_modules/ow/dist/predicates/data-view.js
var require_data_view = __commonJS({
  "node_modules/ow/dist/predicates/data-view.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.DataViewPredicate = void 0;
    var predicate_1 = require_predicate();
    var DataViewPredicate = class extends predicate_1.Predicate {
      /**
      @hidden
      */
      constructor(options) {
        super("DataView", options);
      }
      /**
          Test a DataView to have a specific byte length.
      
          @param byteLength - The byte length of the DataView.
          */
      byteLength(byteLength) {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to have byte length of \`${byteLength}\`, got \`${value.byteLength}\``,
          validator: (value) => value.byteLength === byteLength
        });
      }
      /**
          Test a DataView to have a minimum byte length.
      
          @param byteLength - The minimum byte length of the DataView.
          */
      minByteLength(byteLength) {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to have a minimum byte length of \`${byteLength}\`, got \`${value.byteLength}\``,
          validator: (value) => value.byteLength >= byteLength,
          negatedMessage: (value, label) => `Expected ${label} to have a maximum byte length of \`${byteLength - 1}\`, got \`${value.byteLength}\``
        });
      }
      /**
          Test a DataView to have a minimum byte length.
      
          @param length - The minimum byte length of the DataView.
          */
      maxByteLength(byteLength) {
        return this.addValidator({
          message: (value, label) => `Expected ${label} to have a maximum byte length of \`${byteLength}\`, got \`${value.byteLength}\``,
          validator: (value) => value.byteLength <= byteLength,
          negatedMessage: (value, label) => `Expected ${label} to have a minimum byte length of \`${byteLength + 1}\`, got \`${value.byteLength}\``
        });
      }
    };
    exports.DataViewPredicate = DataViewPredicate;
  }
});

// node_modules/ow/dist/predicates/any.js
var require_any = __commonJS({
  "node_modules/ow/dist/predicates/any.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.AnyPredicate = void 0;
    var argument_error_1 = require_argument_error();
    var base_predicate_1 = require_base_predicate();
    var generate_argument_error_message_1 = require_generate_argument_error_message();
    var AnyPredicate = class {
      constructor(predicates, options = {}) {
        Object.defineProperty(this, "predicates", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: predicates
        });
        Object.defineProperty(this, "options", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: options
        });
      }
      [base_predicate_1.testSymbol](value, main, label, idLabel) {
        const errors = /* @__PURE__ */ new Map();
        for (const predicate of this.predicates) {
          try {
            main(value, label, predicate, idLabel);
            return;
          } catch (error) {
            if (value === void 0 && this.options.optional === true) {
              return;
            }
            if (error instanceof argument_error_1.ArgumentError) {
              for (const [key, value2] of error.validationErrors.entries()) {
                const alreadyPresent = errors.get(key);
                errors.set(key, /* @__PURE__ */ new Set([...alreadyPresent !== null && alreadyPresent !== void 0 ? alreadyPresent : [], ...value2]));
              }
            }
          }
        }
        if (errors.size > 0) {
          const message = (0, generate_argument_error_message_1.generateArgumentErrorMessage)(errors, true);
          throw new argument_error_1.ArgumentError(`Any predicate failed with the following errors:
${message}`, main, errors);
        }
      }
    };
    exports.AnyPredicate = AnyPredicate;
  }
});

// node_modules/ow/dist/predicates.js
var require_predicates = __commonJS({
  "node_modules/ow/dist/predicates.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.AnyPredicate = exports.DataViewPredicate = exports.ArrayBufferPredicate = exports.TypedArrayPredicate = exports.WeakSetPredicate = exports.SetPredicate = exports.WeakMapPredicate = exports.MapPredicate = exports.ErrorPredicate = exports.DatePredicate = exports.ObjectPredicate = exports.ArrayPredicate = exports.BooleanPredicate = exports.BigIntPredicate = exports.NumberPredicate = exports.StringPredicate = void 0;
    var string_1 = require_string2();
    Object.defineProperty(exports, "StringPredicate", { enumerable: true, get: function() {
      return string_1.StringPredicate;
    } });
    var number_1 = require_number2();
    Object.defineProperty(exports, "NumberPredicate", { enumerable: true, get: function() {
      return number_1.NumberPredicate;
    } });
    var bigint_1 = require_bigint();
    Object.defineProperty(exports, "BigIntPredicate", { enumerable: true, get: function() {
      return bigint_1.BigIntPredicate;
    } });
    var boolean_1 = require_boolean2();
    Object.defineProperty(exports, "BooleanPredicate", { enumerable: true, get: function() {
      return boolean_1.BooleanPredicate;
    } });
    var predicate_1 = require_predicate();
    var array_1 = require_array2();
    Object.defineProperty(exports, "ArrayPredicate", { enumerable: true, get: function() {
      return array_1.ArrayPredicate;
    } });
    var object_1 = require_object();
    Object.defineProperty(exports, "ObjectPredicate", { enumerable: true, get: function() {
      return object_1.ObjectPredicate;
    } });
    var date_1 = require_date();
    Object.defineProperty(exports, "DatePredicate", { enumerable: true, get: function() {
      return date_1.DatePredicate;
    } });
    var error_1 = require_error();
    Object.defineProperty(exports, "ErrorPredicate", { enumerable: true, get: function() {
      return error_1.ErrorPredicate;
    } });
    var map_1 = require_map();
    Object.defineProperty(exports, "MapPredicate", { enumerable: true, get: function() {
      return map_1.MapPredicate;
    } });
    var weak_map_1 = require_weak_map();
    Object.defineProperty(exports, "WeakMapPredicate", { enumerable: true, get: function() {
      return weak_map_1.WeakMapPredicate;
    } });
    var set_1 = require_set();
    Object.defineProperty(exports, "SetPredicate", { enumerable: true, get: function() {
      return set_1.SetPredicate;
    } });
    var weak_set_1 = require_weak_set();
    Object.defineProperty(exports, "WeakSetPredicate", { enumerable: true, get: function() {
      return weak_set_1.WeakSetPredicate;
    } });
    var typed_array_1 = require_typed_array();
    Object.defineProperty(exports, "TypedArrayPredicate", { enumerable: true, get: function() {
      return typed_array_1.TypedArrayPredicate;
    } });
    var array_buffer_1 = require_array_buffer();
    Object.defineProperty(exports, "ArrayBufferPredicate", { enumerable: true, get: function() {
      return array_buffer_1.ArrayBufferPredicate;
    } });
    var data_view_1 = require_data_view();
    Object.defineProperty(exports, "DataViewPredicate", { enumerable: true, get: function() {
      return data_view_1.DataViewPredicate;
    } });
    var any_1 = require_any();
    Object.defineProperty(exports, "AnyPredicate", { enumerable: true, get: function() {
      return any_1.AnyPredicate;
    } });
    exports.default = (object, options) => {
      Object.defineProperties(object, {
        string: {
          get: () => new string_1.StringPredicate(options)
        },
        number: {
          get: () => new number_1.NumberPredicate(options)
        },
        bigint: {
          get: () => new bigint_1.BigIntPredicate(options)
        },
        boolean: {
          get: () => new boolean_1.BooleanPredicate(options)
        },
        undefined: {
          get: () => new predicate_1.Predicate("undefined", options)
        },
        null: {
          get: () => new predicate_1.Predicate("null", options)
        },
        nullOrUndefined: {
          get: () => new predicate_1.Predicate("nullOrUndefined", options)
        },
        nan: {
          get: () => new predicate_1.Predicate("nan", options)
        },
        symbol: {
          get: () => new predicate_1.Predicate("symbol", options)
        },
        array: {
          get: () => new array_1.ArrayPredicate(options)
        },
        object: {
          get: () => new object_1.ObjectPredicate(options)
        },
        date: {
          get: () => new date_1.DatePredicate(options)
        },
        error: {
          get: () => new error_1.ErrorPredicate(options)
        },
        map: {
          get: () => new map_1.MapPredicate(options)
        },
        weakMap: {
          get: () => new weak_map_1.WeakMapPredicate(options)
        },
        set: {
          get: () => new set_1.SetPredicate(options)
        },
        weakSet: {
          get: () => new weak_set_1.WeakSetPredicate(options)
        },
        function: {
          get: () => new predicate_1.Predicate("Function", options)
        },
        buffer: {
          get: () => new predicate_1.Predicate("Buffer", options)
        },
        regExp: {
          get: () => new predicate_1.Predicate("RegExp", options)
        },
        promise: {
          get: () => new predicate_1.Predicate("Promise", options)
        },
        typedArray: {
          get: () => new typed_array_1.TypedArrayPredicate("TypedArray", options)
        },
        int8Array: {
          get: () => new typed_array_1.TypedArrayPredicate("Int8Array", options)
        },
        uint8Array: {
          get: () => new typed_array_1.TypedArrayPredicate("Uint8Array", options)
        },
        uint8ClampedArray: {
          get: () => new typed_array_1.TypedArrayPredicate("Uint8ClampedArray", options)
        },
        int16Array: {
          get: () => new typed_array_1.TypedArrayPredicate("Int16Array", options)
        },
        uint16Array: {
          get: () => new typed_array_1.TypedArrayPredicate("Uint16Array", options)
        },
        int32Array: {
          get: () => new typed_array_1.TypedArrayPredicate("Int32Array", options)
        },
        uint32Array: {
          get: () => new typed_array_1.TypedArrayPredicate("Uint32Array", options)
        },
        float32Array: {
          get: () => new typed_array_1.TypedArrayPredicate("Float32Array", options)
        },
        float64Array: {
          get: () => new typed_array_1.TypedArrayPredicate("Float64Array", options)
        },
        arrayBuffer: {
          get: () => new array_buffer_1.ArrayBufferPredicate("ArrayBuffer", options)
        },
        sharedArrayBuffer: {
          get: () => new array_buffer_1.ArrayBufferPredicate("SharedArrayBuffer", options)
        },
        dataView: {
          get: () => new data_view_1.DataViewPredicate(options)
        },
        iterable: {
          get: () => new predicate_1.Predicate("Iterable", options)
        },
        any: {
          value: (...predicates) => new any_1.AnyPredicate(predicates, options)
        }
      });
      return object;
    };
  }
});

// node_modules/ow/dist/modifiers.js
var require_modifiers = __commonJS({
  "node_modules/ow/dist/modifiers.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var predicates_1 = require_predicates();
    exports.default = (object) => {
      Object.defineProperties(object, {
        optional: {
          get: () => (0, predicates_1.default)({}, { optional: true })
        }
      });
      return object;
    };
  }
});

// node_modules/ow/dist/index.js
var require_dist2 = __commonJS({
  "node_modules/ow/dist/index.js"(exports) {
    "use strict";
    var __createBinding2 = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __exportStar2 = exports && exports.__exportStar || function(m, exports2) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding2(exports2, m, p);
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.ArgumentError = exports.Predicate = void 0;
    var callsites_1 = require_callsites();
    var infer_label_1 = require_infer_label();
    var predicate_1 = require_predicate();
    Object.defineProperty(exports, "Predicate", { enumerable: true, get: function() {
      return predicate_1.Predicate;
    } });
    var base_predicate_1 = require_base_predicate();
    var modifiers_1 = require_modifiers();
    var predicates_1 = require_predicates();
    var test_1 = require_test();
    var ow = (value, labelOrPredicate, predicate) => {
      if (!(0, base_predicate_1.isPredicate)(labelOrPredicate) && typeof labelOrPredicate !== "string") {
        throw new TypeError(`Expected second argument to be a predicate or a string, got \`${typeof labelOrPredicate}\``);
      }
      if ((0, base_predicate_1.isPredicate)(labelOrPredicate)) {
        const stackFrames = (0, callsites_1.default)();
        (0, test_1.default)(value, () => (0, infer_label_1.inferLabel)(stackFrames), labelOrPredicate);
        return;
      }
      (0, test_1.default)(value, labelOrPredicate, predicate);
    };
    Object.defineProperties(ow, {
      isValid: {
        value: (value, predicate) => {
          try {
            (0, test_1.default)(value, "", predicate);
            return true;
          } catch {
            return false;
          }
        }
      },
      create: {
        value: (labelOrPredicate, predicate) => (value, label) => {
          if ((0, base_predicate_1.isPredicate)(labelOrPredicate)) {
            const stackFrames = (0, callsites_1.default)();
            (0, test_1.default)(value, label !== null && label !== void 0 ? label : (() => (0, infer_label_1.inferLabel)(stackFrames)), labelOrPredicate);
            return;
          }
          (0, test_1.default)(value, label !== null && label !== void 0 ? label : labelOrPredicate, predicate);
        }
      }
    });
    var _ow = (0, predicates_1.default)((0, modifiers_1.default)(ow));
    exports.default = _ow;
    __exportStar2(require_predicates(), exports);
    var argument_error_1 = require_argument_error();
    Object.defineProperty(exports, "ArgumentError", { enumerable: true, get: function() {
      return argument_error_1.ArgumentError;
    } });
  }
});

// node_modules/header-generator/constants.js
var require_constants2 = __commonJS({
  "node_modules/header-generator/constants.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.HTTP2_SEC_FETCH_ATTRIBUTES = exports.HTTP1_SEC_FETCH_ATTRIBUTES = exports.MISSING_VALUE_DATASET_TOKEN = exports.DEVICE_NODE_NAME = exports.OPERATING_SYSTEM_NODE_NAME = exports.BROWSER_HTTP_NODE_NAME = exports.SUPPORTED_HTTP_VERSIONS = exports.SUPPORTED_DEVICES = exports.SUPPORTED_OPERATING_SYSTEMS = exports.SUPPORTED_BROWSERS = void 0;
    exports.SUPPORTED_BROWSERS = [
      "chrome",
      "firefox",
      "safari",
      "edge"
    ];
    exports.SUPPORTED_OPERATING_SYSTEMS = [
      "windows",
      "macos",
      "linux",
      "android",
      "ios"
    ];
    exports.SUPPORTED_DEVICES = ["desktop", "mobile"];
    exports.SUPPORTED_HTTP_VERSIONS = ["1", "2"];
    exports.BROWSER_HTTP_NODE_NAME = "*BROWSER_HTTP";
    exports.OPERATING_SYSTEM_NODE_NAME = "*OPERATING_SYSTEM";
    exports.DEVICE_NODE_NAME = "*DEVICE";
    exports.MISSING_VALUE_DATASET_TOKEN = "*MISSING_VALUE*";
    exports.HTTP1_SEC_FETCH_ATTRIBUTES = {
      mode: "Sec-Fetch-Mode",
      dest: "Sec-Fetch-Dest",
      site: "Sec-Fetch-Site",
      user: "Sec-Fetch-User"
    };
    exports.HTTP2_SEC_FETCH_ATTRIBUTES = {
      mode: "sec-fetch-mode",
      dest: "sec-fetch-dest",
      site: "sec-fetch-site",
      user: "sec-fetch-user"
    };
  }
});

// node_modules/node-releases/data/processed/envs.json
var require_envs = __commonJS({
  "node_modules/node-releases/data/processed/envs.json"(exports, module) {
    module.exports = [{ name: "nodejs", version: "0.2.0", date: "2011-08-26", lts: false, security: false, v8: "2.3.8.0" }, { name: "nodejs", version: "0.3.0", date: "2011-08-26", lts: false, security: false, v8: "2.5.1.0" }, { name: "nodejs", version: "0.4.0", date: "2011-08-26", lts: false, security: false, v8: "3.1.2.0" }, { name: "nodejs", version: "0.5.0", date: "2011-08-26", lts: false, security: false, v8: "3.1.8.25" }, { name: "nodejs", version: "0.6.0", date: "2011-11-04", lts: false, security: false, v8: "3.6.6.6" }, { name: "nodejs", version: "0.7.0", date: "2012-01-17", lts: false, security: false, v8: "3.8.6.0" }, { name: "nodejs", version: "0.8.0", date: "2012-06-22", lts: false, security: false, v8: "3.11.10.10" }, { name: "nodejs", version: "0.9.0", date: "2012-07-20", lts: false, security: false, v8: "3.11.10.15" }, { name: "nodejs", version: "0.10.0", date: "2013-03-11", lts: false, security: false, v8: "3.14.5.8" }, { name: "nodejs", version: "0.11.0", date: "2013-03-28", lts: false, security: false, v8: "3.17.13.0" }, { name: "nodejs", version: "0.12.0", date: "2015-02-06", lts: false, security: false, v8: "3.28.73.0" }, { name: "nodejs", version: "4.0.0", date: "2015-09-08", lts: false, security: false, v8: "4.5.103.30" }, { name: "nodejs", version: "4.1.0", date: "2015-09-17", lts: false, security: false, v8: "4.5.103.33" }, { name: "nodejs", version: "4.2.0", date: "2015-10-12", lts: "Argon", security: false, v8: "4.5.103.35" }, { name: "nodejs", version: "4.3.0", date: "2016-02-09", lts: "Argon", security: false, v8: "4.5.103.35" }, { name: "nodejs", version: "4.4.0", date: "2016-03-08", lts: "Argon", security: false, v8: "4.5.103.35" }, { name: "nodejs", version: "4.5.0", date: "2016-08-16", lts: "Argon", security: false, v8: "4.5.103.37" }, { name: "nodejs", version: "4.6.0", date: "2016-09-27", lts: "Argon", security: true, v8: "4.5.103.37" }, { name: "nodejs", version: "4.7.0", date: "2016-12-06", lts: "Argon", security: false, v8: "4.5.103.43" }, { name: "nodejs", version: "4.8.0", date: "2017-02-21", lts: "Argon", security: false, v8: "4.5.103.45" }, { name: "nodejs", version: "4.9.0", date: "2018-03-28", lts: "Argon", security: true, v8: "4.5.103.53" }, { name: "nodejs", version: "5.0.0", date: "2015-10-29", lts: false, security: false, v8: "4.6.85.28" }, { name: "nodejs", version: "5.1.0", date: "2015-11-17", lts: false, security: false, v8: "4.6.85.31" }, { name: "nodejs", version: "5.2.0", date: "2015-12-09", lts: false, security: false, v8: "4.6.85.31" }, { name: "nodejs", version: "5.3.0", date: "2015-12-15", lts: false, security: false, v8: "4.6.85.31" }, { name: "nodejs", version: "5.4.0", date: "2016-01-06", lts: false, security: false, v8: "4.6.85.31" }, { name: "nodejs", version: "5.5.0", date: "2016-01-21", lts: false, security: false, v8: "4.6.85.31" }, { name: "nodejs", version: "5.6.0", date: "2016-02-09", lts: false, security: false, v8: "4.6.85.31" }, { name: "nodejs", version: "5.7.0", date: "2016-02-23", lts: false, security: false, v8: "4.6.85.31" }, { name: "nodejs", version: "5.8.0", date: "2016-03-09", lts: false, security: false, v8: "4.6.85.31" }, { name: "nodejs", version: "5.9.0", date: "2016-03-16", lts: false, security: false, v8: "4.6.85.31" }, { name: "nodejs", version: "5.10.0", date: "2016-04-01", lts: false, security: false, v8: "4.6.85.31" }, { name: "nodejs", version: "5.11.0", date: "2016-04-21", lts: false, security: false, v8: "4.6.85.31" }, { name: "nodejs", version: "5.12.0", date: "2016-06-23", lts: false, security: false, v8: "4.6.85.32" }, { name: "nodejs", version: "6.0.0", date: "2016-04-26", lts: false, security: false, v8: "5.0.71.35" }, { name: "nodejs", version: "6.1.0", date: "2016-05-05", lts: false, security: false, v8: "5.0.71.35" }, { name: "nodejs", version: "6.2.0", date: "2016-05-17", lts: false, security: false, v8: "5.0.71.47" }, { name: "nodejs", version: "6.3.0", date: "2016-07-06", lts: false, security: false, v8: "5.0.71.52" }, { name: "nodejs", version: "6.4.0", date: "2016-08-12", lts: false, security: false, v8: "5.0.71.60" }, { name: "nodejs", version: "6.5.0", date: "2016-08-26", lts: false, security: false, v8: "5.1.281.81" }, { name: "nodejs", version: "6.6.0", date: "2016-09-14", lts: false, security: false, v8: "5.1.281.83" }, { name: "nodejs", version: "6.7.0", date: "2016-09-27", lts: false, security: true, v8: "5.1.281.83" }, { name: "nodejs", version: "6.8.0", date: "2016-10-12", lts: false, security: false, v8: "5.1.281.84" }, { name: "nodejs", version: "6.9.0", date: "2016-10-18", lts: "Boron", security: false, v8: "5.1.281.84" }, { name: "nodejs", version: "6.10.0", date: "2017-02-21", lts: "Boron", security: false, v8: "5.1.281.93" }, { name: "nodejs", version: "6.11.0", date: "2017-06-06", lts: "Boron", security: false, v8: "5.1.281.102" }, { name: "nodejs", version: "6.12.0", date: "2017-11-06", lts: "Boron", security: false, v8: "5.1.281.108" }, { name: "nodejs", version: "6.13.0", date: "2018-02-10", lts: "Boron", security: false, v8: "5.1.281.111" }, { name: "nodejs", version: "6.14.0", date: "2018-03-28", lts: "Boron", security: true, v8: "5.1.281.111" }, { name: "nodejs", version: "6.15.0", date: "2018-11-27", lts: "Boron", security: true, v8: "5.1.281.111" }, { name: "nodejs", version: "6.16.0", date: "2018-12-26", lts: "Boron", security: false, v8: "5.1.281.111" }, { name: "nodejs", version: "6.17.0", date: "2019-02-28", lts: "Boron", security: true, v8: "5.1.281.111" }, { name: "nodejs", version: "7.0.0", date: "2016-10-25", lts: false, security: false, v8: "5.4.500.36" }, { name: "nodejs", version: "7.1.0", date: "2016-11-08", lts: false, security: false, v8: "5.4.500.36" }, { name: "nodejs", version: "7.2.0", date: "2016-11-22", lts: false, security: false, v8: "5.4.500.43" }, { name: "nodejs", version: "7.3.0", date: "2016-12-20", lts: false, security: false, v8: "5.4.500.45" }, { name: "nodejs", version: "7.4.0", date: "2017-01-04", lts: false, security: false, v8: "5.4.500.45" }, { name: "nodejs", version: "7.5.0", date: "2017-01-31", lts: false, security: false, v8: "5.4.500.48" }, { name: "nodejs", version: "7.6.0", date: "2017-02-21", lts: false, security: false, v8: "5.5.372.40" }, { name: "nodejs", version: "7.7.0", date: "2017-02-28", lts: false, security: false, v8: "5.5.372.41" }, { name: "nodejs", version: "7.8.0", date: "2017-03-29", lts: false, security: false, v8: "5.5.372.43" }, { name: "nodejs", version: "7.9.0", date: "2017-04-11", lts: false, security: false, v8: "5.5.372.43" }, { name: "nodejs", version: "7.10.0", date: "2017-05-02", lts: false, security: false, v8: "5.5.372.43" }, { name: "nodejs", version: "8.0.0", date: "2017-05-30", lts: false, security: false, v8: "5.8.283.41" }, { name: "nodejs", version: "8.1.0", date: "2017-06-08", lts: false, security: false, v8: "5.8.283.41" }, { name: "nodejs", version: "8.2.0", date: "2017-07-19", lts: false, security: false, v8: "5.8.283.41" }, { name: "nodejs", version: "8.3.0", date: "2017-08-08", lts: false, security: false, v8: "6.0.286.52" }, { name: "nodejs", version: "8.4.0", date: "2017-08-15", lts: false, security: false, v8: "6.0.286.52" }, { name: "nodejs", version: "8.5.0", date: "2017-09-12", lts: false, security: false, v8: "6.0.287.53" }, { name: "nodejs", version: "8.6.0", date: "2017-09-26", lts: false, security: false, v8: "6.0.287.53" }, { name: "nodejs", version: "8.7.0", date: "2017-10-11", lts: false, security: false, v8: "6.1.534.42" }, { name: "nodejs", version: "8.8.0", date: "2017-10-24", lts: false, security: false, v8: "6.1.534.42" }, { name: "nodejs", version: "8.9.0", date: "2017-10-31", lts: "Carbon", security: false, v8: "6.1.534.46" }, { name: "nodejs", version: "8.10.0", date: "2018-03-06", lts: "Carbon", security: false, v8: "6.2.414.50" }, { name: "nodejs", version: "8.11.0", date: "2018-03-28", lts: "Carbon", security: true, v8: "6.2.414.50" }, { name: "nodejs", version: "8.12.0", date: "2018-09-10", lts: "Carbon", security: false, v8: "6.2.414.66" }, { name: "nodejs", version: "8.13.0", date: "2018-11-20", lts: "Carbon", security: false, v8: "6.2.414.72" }, { name: "nodejs", version: "8.14.0", date: "2018-11-27", lts: "Carbon", security: true, v8: "6.2.414.72" }, { name: "nodejs", version: "8.15.0", date: "2018-12-26", lts: "Carbon", security: false, v8: "6.2.414.75" }, { name: "nodejs", version: "8.16.0", date: "2019-04-16", lts: "Carbon", security: false, v8: "6.2.414.77" }, { name: "nodejs", version: "8.17.0", date: "2019-12-17", lts: "Carbon", security: true, v8: "6.2.414.78" }, { name: "nodejs", version: "9.0.0", date: "2017-10-31", lts: false, security: false, v8: "6.2.414.32" }, { name: "nodejs", version: "9.1.0", date: "2017-11-07", lts: false, security: false, v8: "6.2.414.32" }, { name: "nodejs", version: "9.2.0", date: "2017-11-14", lts: false, security: false, v8: "6.2.414.44" }, { name: "nodejs", version: "9.3.0", date: "2017-12-12", lts: false, security: false, v8: "6.2.414.46" }, { name: "nodejs", version: "9.4.0", date: "2018-01-10", lts: false, security: false, v8: "6.2.414.46" }, { name: "nodejs", version: "9.5.0", date: "2018-01-31", lts: false, security: false, v8: "6.2.414.46" }, { name: "nodejs", version: "9.6.0", date: "2018-02-21", lts: false, security: false, v8: "6.2.414.46" }, { name: "nodejs", version: "9.7.0", date: "2018-03-01", lts: false, security: false, v8: "6.2.414.46" }, { name: "nodejs", version: "9.8.0", date: "2018-03-07", lts: false, security: false, v8: "6.2.414.46" }, { name: "nodejs", version: "9.9.0", date: "2018-03-21", lts: false, security: false, v8: "6.2.414.46" }, { name: "nodejs", version: "9.10.0", date: "2018-03-28", lts: false, security: true, v8: "6.2.414.46" }, { name: "nodejs", version: "9.11.0", date: "2018-04-04", lts: false, security: false, v8: "6.2.414.46" }, { name: "nodejs", version: "10.0.0", date: "2018-04-24", lts: false, security: false, v8: "6.6.346.24" }, { name: "nodejs", version: "10.1.0", date: "2018-05-08", lts: false, security: false, v8: "6.6.346.27" }, { name: "nodejs", version: "10.2.0", date: "2018-05-23", lts: false, security: false, v8: "6.6.346.32" }, { name: "nodejs", version: "10.3.0", date: "2018-05-29", lts: false, security: false, v8: "6.6.346.32" }, { name: "nodejs", version: "10.4.0", date: "2018-06-06", lts: false, security: false, v8: "6.7.288.43" }, { name: "nodejs", version: "10.5.0", date: "2018-06-20", lts: false, security: false, v8: "6.7.288.46" }, { name: "nodejs", version: "10.6.0", date: "2018-07-04", lts: false, security: false, v8: "6.7.288.46" }, { name: "nodejs", version: "10.7.0", date: "2018-07-18", lts: false, security: false, v8: "6.7.288.49" }, { name: "nodejs", version: "10.8.0", date: "2018-08-01", lts: false, security: false, v8: "6.7.288.49" }, { name: "nodejs", version: "10.9.0", date: "2018-08-15", lts: false, security: false, v8: "6.8.275.24" }, { name: "nodejs", version: "10.10.0", date: "2018-09-06", lts: false, security: false, v8: "6.8.275.30" }, { name: "nodejs", version: "10.11.0", date: "2018-09-19", lts: false, security: false, v8: "6.8.275.32" }, { name: "nodejs", version: "10.12.0", date: "2018-10-10", lts: false, security: false, v8: "6.8.275.32" }, { name: "nodejs", version: "10.13.0", date: "2018-10-30", lts: "Dubnium", security: false, v8: "6.8.275.32" }, { name: "nodejs", version: "10.14.0", date: "2018-11-27", lts: "Dubnium", security: true, v8: "6.8.275.32" }, { name: "nodejs", version: "10.15.0", date: "2018-12-26", lts: "Dubnium", security: false, v8: "6.8.275.32" }, { name: "nodejs", version: "10.16.0", date: "2019-05-28", lts: "Dubnium", security: false, v8: "6.8.275.32" }, { name: "nodejs", version: "10.17.0", date: "2019-10-22", lts: "Dubnium", security: false, v8: "6.8.275.32" }, { name: "nodejs", version: "10.18.0", date: "2019-12-17", lts: "Dubnium", security: true, v8: "6.8.275.32" }, { name: "nodejs", version: "10.19.0", date: "2020-02-05", lts: "Dubnium", security: true, v8: "6.8.275.32" }, { name: "nodejs", version: "10.20.0", date: "2020-03-26", lts: "Dubnium", security: false, v8: "6.8.275.32" }, { name: "nodejs", version: "10.21.0", date: "2020-06-02", lts: "Dubnium", security: true, v8: "6.8.275.32" }, { name: "nodejs", version: "10.22.0", date: "2020-07-21", lts: "Dubnium", security: false, v8: "6.8.275.32" }, { name: "nodejs", version: "10.23.0", date: "2020-10-27", lts: "Dubnium", security: false, v8: "6.8.275.32" }, { name: "nodejs", version: "10.24.0", date: "2021-02-23", lts: "Dubnium", security: true, v8: "6.8.275.32" }, { name: "nodejs", version: "11.0.0", date: "2018-10-23", lts: false, security: false, v8: "7.0.276.28" }, { name: "nodejs", version: "11.1.0", date: "2018-10-30", lts: false, security: false, v8: "7.0.276.32" }, { name: "nodejs", version: "11.2.0", date: "2018-11-15", lts: false, security: false, v8: "7.0.276.38" }, { name: "nodejs", version: "11.3.0", date: "2018-11-27", lts: false, security: true, v8: "7.0.276.38" }, { name: "nodejs", version: "11.4.0", date: "2018-12-07", lts: false, security: false, v8: "7.0.276.38" }, { name: "nodejs", version: "11.5.0", date: "2018-12-18", lts: false, security: false, v8: "7.0.276.38" }, { name: "nodejs", version: "11.6.0", date: "2018-12-26", lts: false, security: false, v8: "7.0.276.38" }, { name: "nodejs", version: "11.7.0", date: "2019-01-17", lts: false, security: false, v8: "7.0.276.38" }, { name: "nodejs", version: "11.8.0", date: "2019-01-24", lts: false, security: false, v8: "7.0.276.38" }, { name: "nodejs", version: "11.9.0", date: "2019-01-30", lts: false, security: false, v8: "7.0.276.38" }, { name: "nodejs", version: "11.10.0", date: "2019-02-14", lts: false, security: false, v8: "7.0.276.38" }, { name: "nodejs", version: "11.11.0", date: "2019-03-05", lts: false, security: false, v8: "7.0.276.38" }, { name: "nodejs", version: "11.12.0", date: "2019-03-14", lts: false, security: false, v8: "7.0.276.38" }, { name: "nodejs", version: "11.13.0", date: "2019-03-28", lts: false, security: false, v8: "7.0.276.38" }, { name: "nodejs", version: "11.14.0", date: "2019-04-10", lts: false, security: false, v8: "7.0.276.38" }, { name: "nodejs", version: "11.15.0", date: "2019-04-30", lts: false, security: false, v8: "7.0.276.38" }, { name: "nodejs", version: "12.0.0", date: "2019-04-23", lts: false, security: false, v8: "7.4.288.21" }, { name: "nodejs", version: "12.1.0", date: "2019-04-29", lts: false, security: false, v8: "7.4.288.21" }, { name: "nodejs", version: "12.2.0", date: "2019-05-07", lts: false, security: false, v8: "7.4.288.21" }, { name: "nodejs", version: "12.3.0", date: "2019-05-21", lts: false, security: false, v8: "7.4.288.27" }, { name: "nodejs", version: "12.4.0", date: "2019-06-04", lts: false, security: false, v8: "7.4.288.27" }, { name: "nodejs", version: "12.5.0", date: "2019-06-26", lts: false, security: false, v8: "7.5.288.22" }, { name: "nodejs", version: "12.6.0", date: "2019-07-03", lts: false, security: false, v8: "7.5.288.22" }, { name: "nodejs", version: "12.7.0", date: "2019-07-23", lts: false, security: false, v8: "7.5.288.22" }, { name: "nodejs", version: "12.8.0", date: "2019-08-06", lts: false, security: false, v8: "7.5.288.22" }, { name: "nodejs", version: "12.9.0", date: "2019-08-20", lts: false, security: false, v8: "7.6.303.29" }, { name: "nodejs", version: "12.10.0", date: "2019-09-04", lts: false, security: false, v8: "7.6.303.29" }, { name: "nodejs", version: "12.11.0", date: "2019-09-25", lts: false, security: false, v8: "7.7.299.11" }, { name: "nodejs", version: "12.12.0", date: "2019-10-11", lts: false, security: false, v8: "7.7.299.13" }, { name: "nodejs", version: "12.13.0", date: "2019-10-21", lts: "Erbium", security: false, v8: "7.7.299.13" }, { name: "nodejs", version: "12.14.0", date: "2019-12-17", lts: "Erbium", security: true, v8: "7.7.299.13" }, { name: "nodejs", version: "12.15.0", date: "2020-02-05", lts: "Erbium", security: true, v8: "7.7.299.13" }, { name: "nodejs", version: "12.16.0", date: "2020-02-11", lts: "Erbium", security: false, v8: "7.8.279.23" }, { name: "nodejs", version: "12.17.0", date: "2020-05-26", lts: "Erbium", security: false, v8: "7.8.279.23" }, { name: "nodejs", version: "12.18.0", date: "2020-06-02", lts: "Erbium", security: true, v8: "7.8.279.23" }, { name: "nodejs", version: "12.19.0", date: "2020-10-06", lts: "Erbium", security: false, v8: "7.8.279.23" }, { name: "nodejs", version: "12.20.0", date: "2020-11-24", lts: "Erbium", security: false, v8: "7.8.279.23" }, { name: "nodejs", version: "12.21.0", date: "2021-02-23", lts: "Erbium", security: true, v8: "7.8.279.23" }, { name: "nodejs", version: "12.22.0", date: "2021-03-30", lts: "Erbium", security: false, v8: "7.8.279.23" }, { name: "nodejs", version: "13.0.0", date: "2019-10-22", lts: false, security: false, v8: "7.8.279.17" }, { name: "nodejs", version: "13.1.0", date: "2019-11-05", lts: false, security: false, v8: "7.8.279.17" }, { name: "nodejs", version: "13.2.0", date: "2019-11-21", lts: false, security: false, v8: "7.9.317.23" }, { name: "nodejs", version: "13.3.0", date: "2019-12-03", lts: false, security: false, v8: "7.9.317.25" }, { name: "nodejs", version: "13.4.0", date: "2019-12-17", lts: false, security: true, v8: "7.9.317.25" }, { name: "nodejs", version: "13.5.0", date: "2019-12-18", lts: false, security: false, v8: "7.9.317.25" }, { name: "nodejs", version: "13.6.0", date: "2020-01-07", lts: false, security: false, v8: "7.9.317.25" }, { name: "nodejs", version: "13.7.0", date: "2020-01-21", lts: false, security: false, v8: "7.9.317.25" }, { name: "nodejs", version: "13.8.0", date: "2020-02-05", lts: false, security: true, v8: "7.9.317.25" }, { name: "nodejs", version: "13.9.0", date: "2020-02-18", lts: false, security: false, v8: "7.9.317.25" }, { name: "nodejs", version: "13.10.0", date: "2020-03-04", lts: false, security: false, v8: "7.9.317.25" }, { name: "nodejs", version: "13.11.0", date: "2020-03-12", lts: false, security: false, v8: "7.9.317.25" }, { name: "nodejs", version: "13.12.0", date: "2020-03-26", lts: false, security: false, v8: "7.9.317.25" }, { name: "nodejs", version: "13.13.0", date: "2020-04-14", lts: false, security: false, v8: "7.9.317.25" }, { name: "nodejs", version: "13.14.0", date: "2020-04-29", lts: false, security: false, v8: "7.9.317.25" }, { name: "nodejs", version: "14.0.0", date: "2020-04-21", lts: false, security: false, v8: "8.1.307.30" }, { name: "nodejs", version: "14.1.0", date: "2020-04-29", lts: false, security: false, v8: "8.1.307.31" }, { name: "nodejs", version: "14.2.0", date: "2020-05-05", lts: false, security: false, v8: "8.1.307.31" }, { name: "nodejs", version: "14.3.0", date: "2020-05-19", lts: false, security: false, v8: "8.1.307.31" }, { name: "nodejs", version: "14.4.0", date: "2020-06-02", lts: false, security: true, v8: "8.1.307.31" }, { name: "nodejs", version: "14.5.0", date: "2020-06-30", lts: false, security: false, v8: "8.3.110.9" }, { name: "nodejs", version: "14.6.0", date: "2020-07-20", lts: false, security: false, v8: "8.4.371.19" }, { name: "nodejs", version: "14.7.0", date: "2020-07-29", lts: false, security: false, v8: "8.4.371.19" }, { name: "nodejs", version: "14.8.0", date: "2020-08-11", lts: false, security: false, v8: "8.4.371.19" }, { name: "nodejs", version: "14.9.0", date: "2020-08-27", lts: false, security: false, v8: "8.4.371.19" }, { name: "nodejs", version: "14.10.0", date: "2020-09-08", lts: false, security: false, v8: "8.4.371.19" }, { name: "nodejs", version: "14.11.0", date: "2020-09-15", lts: false, security: true, v8: "8.4.371.19" }, { name: "nodejs", version: "14.12.0", date: "2020-09-22", lts: false, security: false, v8: "8.4.371.19" }, { name: "nodejs", version: "14.13.0", date: "2020-09-29", lts: false, security: false, v8: "8.4.371.19" }, { name: "nodejs", version: "14.14.0", date: "2020-10-15", lts: false, security: false, v8: "8.4.371.19" }, { name: "nodejs", version: "14.15.0", date: "2020-10-27", lts: "Fermium", security: false, v8: "8.4.371.19" }, { name: "nodejs", version: "14.16.0", date: "2021-02-23", lts: "Fermium", security: true, v8: "8.4.371.19" }, { name: "nodejs", version: "14.17.0", date: "2021-05-11", lts: "Fermium", security: false, v8: "8.4.371.23" }, { name: "nodejs", version: "14.18.0", date: "2021-09-28", lts: "Fermium", security: false, v8: "8.4.371.23" }, { name: "nodejs", version: "14.19.0", date: "2022-02-01", lts: "Fermium", security: false, v8: "8.4.371.23" }, { name: "nodejs", version: "14.20.0", date: "2022-07-07", lts: "Fermium", security: true, v8: "8.4.371.23" }, { name: "nodejs", version: "14.21.0", date: "2022-11-01", lts: "Fermium", security: false, v8: "8.4.371.23" }, { name: "nodejs", version: "15.0.0", date: "2020-10-20", lts: false, security: false, v8: "8.6.395.16" }, { name: "nodejs", version: "15.1.0", date: "2020-11-04", lts: false, security: false, v8: "8.6.395.17" }, { name: "nodejs", version: "15.2.0", date: "2020-11-10", lts: false, security: false, v8: "8.6.395.17" }, { name: "nodejs", version: "15.3.0", date: "2020-11-24", lts: false, security: false, v8: "8.6.395.17" }, { name: "nodejs", version: "15.4.0", date: "2020-12-09", lts: false, security: false, v8: "8.6.395.17" }, { name: "nodejs", version: "15.5.0", date: "2020-12-22", lts: false, security: false, v8: "8.6.395.17" }, { name: "nodejs", version: "15.6.0", date: "2021-01-14", lts: false, security: false, v8: "8.6.395.17" }, { name: "nodejs", version: "15.7.0", date: "2021-01-25", lts: false, security: false, v8: "8.6.395.17" }, { name: "nodejs", version: "15.8.0", date: "2021-02-02", lts: false, security: false, v8: "8.6.395.17" }, { name: "nodejs", version: "15.9.0", date: "2021-02-18", lts: false, security: false, v8: "8.6.395.17" }, { name: "nodejs", version: "15.10.0", date: "2021-02-23", lts: false, security: true, v8: "8.6.395.17" }, { name: "nodejs", version: "15.11.0", date: "2021-03-03", lts: false, security: false, v8: "8.6.395.17" }, { name: "nodejs", version: "15.12.0", date: "2021-03-17", lts: false, security: false, v8: "8.6.395.17" }, { name: "nodejs", version: "15.13.0", date: "2021-03-31", lts: false, security: false, v8: "8.6.395.17" }, { name: "nodejs", version: "15.14.0", date: "2021-04-06", lts: false, security: false, v8: "8.6.395.17" }, { name: "nodejs", version: "16.0.0", date: "2021-04-20", lts: false, security: false, v8: "9.0.257.17" }, { name: "nodejs", version: "16.1.0", date: "2021-05-04", lts: false, security: false, v8: "9.0.257.24" }, { name: "nodejs", version: "16.2.0", date: "2021-05-19", lts: false, security: false, v8: "9.0.257.25" }, { name: "nodejs", version: "16.3.0", date: "2021-06-03", lts: false, security: false, v8: "9.0.257.25" }, { name: "nodejs", version: "16.4.0", date: "2021-06-23", lts: false, security: false, v8: "9.1.269.36" }, { name: "nodejs", version: "16.5.0", date: "2021-07-14", lts: false, security: false, v8: "9.1.269.38" }, { name: "nodejs", version: "16.6.0", date: "2021-07-29", lts: false, security: true, v8: "9.2.230.21" }, { name: "nodejs", version: "16.7.0", date: "2021-08-18", lts: false, security: false, v8: "9.2.230.21" }, { name: "nodejs", version: "16.8.0", date: "2021-08-25", lts: false, security: false, v8: "9.2.230.21" }, { name: "nodejs", version: "16.9.0", date: "2021-09-07", lts: false, security: false, v8: "9.3.345.16" }, { name: "nodejs", version: "16.10.0", date: "2021-09-22", lts: false, security: false, v8: "9.3.345.19" }, { name: "nodejs", version: "16.11.0", date: "2021-10-08", lts: false, security: false, v8: "9.4.146.19" }, { name: "nodejs", version: "16.12.0", date: "2021-10-20", lts: false, security: false, v8: "9.4.146.19" }, { name: "nodejs", version: "16.13.0", date: "2021-10-26", lts: "Gallium", security: false, v8: "9.4.146.19" }, { name: "nodejs", version: "16.14.0", date: "2022-02-08", lts: "Gallium", security: false, v8: "9.4.146.24" }, { name: "nodejs", version: "16.15.0", date: "2022-04-26", lts: "Gallium", security: false, v8: "9.4.146.24" }, { name: "nodejs", version: "16.16.0", date: "2022-07-07", lts: "Gallium", security: true, v8: "9.4.146.24" }, { name: "nodejs", version: "16.17.0", date: "2022-08-16", lts: "Gallium", security: false, v8: "9.4.146.26" }, { name: "nodejs", version: "16.18.0", date: "2022-10-12", lts: "Gallium", security: false, v8: "9.4.146.26" }, { name: "nodejs", version: "16.19.0", date: "2022-12-13", lts: "Gallium", security: false, v8: "9.4.146.26" }, { name: "nodejs", version: "16.20.0", date: "2023-03-28", lts: "Gallium", security: false, v8: "9.4.146.26" }, { name: "nodejs", version: "17.0.0", date: "2021-10-19", lts: false, security: false, v8: "9.5.172.21" }, { name: "nodejs", version: "17.1.0", date: "2021-11-09", lts: false, security: false, v8: "9.5.172.25" }, { name: "nodejs", version: "17.2.0", date: "2021-11-30", lts: false, security: false, v8: "9.6.180.14" }, { name: "nodejs", version: "17.3.0", date: "2021-12-17", lts: false, security: false, v8: "9.6.180.15" }, { name: "nodejs", version: "17.4.0", date: "2022-01-18", lts: false, security: false, v8: "9.6.180.15" }, { name: "nodejs", version: "17.5.0", date: "2022-02-10", lts: false, security: false, v8: "9.6.180.15" }, { name: "nodejs", version: "17.6.0", date: "2022-02-22", lts: false, security: false, v8: "9.6.180.15" }, { name: "nodejs", version: "17.7.0", date: "2022-03-09", lts: false, security: false, v8: "9.6.180.15" }, { name: "nodejs", version: "17.8.0", date: "2022-03-22", lts: false, security: false, v8: "9.6.180.15" }, { name: "nodejs", version: "17.9.0", date: "2022-04-07", lts: false, security: false, v8: "9.6.180.15" }, { name: "nodejs", version: "18.0.0", date: "2022-04-18", lts: false, security: false, v8: "10.1.124.8" }, { name: "nodejs", version: "18.1.0", date: "2022-05-03", lts: false, security: false, v8: "10.1.124.8" }, { name: "nodejs", version: "18.2.0", date: "2022-05-17", lts: false, security: false, v8: "10.1.124.8" }, { name: "nodejs", version: "18.3.0", date: "2022-06-02", lts: false, security: false, v8: "10.2.154.4" }, { name: "nodejs", version: "18.4.0", date: "2022-06-16", lts: false, security: false, v8: "10.2.154.4" }, { name: "nodejs", version: "18.5.0", date: "2022-07-06", lts: false, security: true, v8: "10.2.154.4" }, { name: "nodejs", version: "18.6.0", date: "2022-07-13", lts: false, security: false, v8: "10.2.154.13" }, { name: "nodejs", version: "18.7.0", date: "2022-07-26", lts: false, security: false, v8: "10.2.154.13" }, { name: "nodejs", version: "18.8.0", date: "2022-08-24", lts: false, security: false, v8: "10.2.154.13" }, { name: "nodejs", version: "18.9.0", date: "2022-09-07", lts: false, security: false, v8: "10.2.154.15" }, { name: "nodejs", version: "18.10.0", date: "2022-09-28", lts: false, security: false, v8: "10.2.154.15" }, { name: "nodejs", version: "18.11.0", date: "2022-10-13", lts: false, security: false, v8: "10.2.154.15" }, { name: "nodejs", version: "18.12.0", date: "2022-10-25", lts: "Hydrogen", security: false, v8: "10.2.154.15" }, { name: "nodejs", version: "18.13.0", date: "2023-01-05", lts: "Hydrogen", security: false, v8: "10.2.154.23" }, { name: "nodejs", version: "18.14.0", date: "2023-02-01", lts: "Hydrogen", security: false, v8: "10.2.154.23" }, { name: "nodejs", version: "18.15.0", date: "2023-03-05", lts: "Hydrogen", security: false, v8: "10.2.154.26" }, { name: "nodejs", version: "18.16.0", date: "2023-04-12", lts: "Hydrogen", security: false, v8: "10.2.154.26" }, { name: "nodejs", version: "18.17.0", date: "2023-07-18", lts: "Hydrogen", security: false, v8: "10.2.154.26" }, { name: "nodejs", version: "18.18.0", date: "2023-09-18", lts: "Hydrogen", security: false, v8: "10.2.154.26" }, { name: "nodejs", version: "18.19.0", date: "2023-11-29", lts: "Hydrogen", security: false, v8: "10.2.154.26" }, { name: "nodejs", version: "18.20.0", date: "2024-03-26", lts: "Hydrogen", security: false, v8: "10.2.154.26" }, { name: "nodejs", version: "19.0.0", date: "2022-10-17", lts: false, security: false, v8: "10.7.193.13" }, { name: "nodejs", version: "19.1.0", date: "2022-11-14", lts: false, security: false, v8: "10.7.193.20" }, { name: "nodejs", version: "19.2.0", date: "2022-11-29", lts: false, security: false, v8: "10.8.168.20" }, { name: "nodejs", version: "19.3.0", date: "2022-12-14", lts: false, security: false, v8: "10.8.168.21" }, { name: "nodejs", version: "19.4.0", date: "2023-01-05", lts: false, security: false, v8: "10.8.168.25" }, { name: "nodejs", version: "19.5.0", date: "2023-01-24", lts: false, security: false, v8: "10.8.168.25" }, { name: "nodejs", version: "19.6.0", date: "2023-02-01", lts: false, security: false, v8: "10.8.168.25" }, { name: "nodejs", version: "19.7.0", date: "2023-02-21", lts: false, security: false, v8: "10.8.168.25" }, { name: "nodejs", version: "19.8.0", date: "2023-03-14", lts: false, security: false, v8: "10.8.168.25" }, { name: "nodejs", version: "19.9.0", date: "2023-04-10", lts: false, security: false, v8: "10.8.168.25" }, { name: "nodejs", version: "20.0.0", date: "2023-04-17", lts: false, security: false, v8: "11.3.244.4" }, { name: "nodejs", version: "20.1.0", date: "2023-05-03", lts: false, security: false, v8: "11.3.244.8" }, { name: "nodejs", version: "20.2.0", date: "2023-05-16", lts: false, security: false, v8: "11.3.244.8" }, { name: "nodejs", version: "20.3.0", date: "2023-06-08", lts: false, security: false, v8: "11.3.244.8" }, { name: "nodejs", version: "20.4.0", date: "2023-07-04", lts: false, security: false, v8: "11.3.244.8" }, { name: "nodejs", version: "20.5.0", date: "2023-07-19", lts: false, security: false, v8: "11.3.244.8" }, { name: "nodejs", version: "20.6.0", date: "2023-08-23", lts: false, security: false, v8: "11.3.244.8" }, { name: "nodejs", version: "20.7.0", date: "2023-09-18", lts: false, security: false, v8: "11.3.244.8" }, { name: "nodejs", version: "20.8.0", date: "2023-09-28", lts: false, security: false, v8: "11.3.244.8" }, { name: "nodejs", version: "20.9.0", date: "2023-10-24", lts: "Iron", security: false, v8: "11.3.244.8" }, { name: "nodejs", version: "20.10.0", date: "2023-11-22", lts: "Iron", security: false, v8: "11.3.244.8" }, { name: "nodejs", version: "20.11.0", date: "2024-01-09", lts: "Iron", security: false, v8: "11.3.244.8" }, { name: "nodejs", version: "20.12.0", date: "2024-03-26", lts: "Iron", security: false, v8: "11.3.244.8" }, { name: "nodejs", version: "20.13.0", date: "2024-05-07", lts: "Iron", security: false, v8: "11.3.244.8" }, { name: "nodejs", version: "20.14.0", date: "2024-05-28", lts: "Iron", security: false, v8: "11.3.244.8" }, { name: "nodejs", version: "20.15.0", date: "2024-06-20", lts: "Iron", security: false, v8: "11.3.244.8" }, { name: "nodejs", version: "20.16.0", date: "2024-07-24", lts: "Iron", security: false, v8: "11.3.244.8" }, { name: "nodejs", version: "20.17.0", date: "2024-08-21", lts: "Iron", security: false, v8: "11.3.244.8" }, { name: "nodejs", version: "20.18.0", date: "2024-10-03", lts: "Iron", security: false, v8: "11.3.244.8" }, { name: "nodejs", version: "21.0.0", date: "2023-10-17", lts: false, security: false, v8: "11.8.172.13" }, { name: "nodejs", version: "21.1.0", date: "2023-10-24", lts: false, security: false, v8: "11.8.172.15" }, { name: "nodejs", version: "21.2.0", date: "2023-11-14", lts: false, security: false, v8: "11.8.172.17" }, { name: "nodejs", version: "21.3.0", date: "2023-11-30", lts: false, security: false, v8: "11.8.172.17" }, { name: "nodejs", version: "21.4.0", date: "2023-12-05", lts: false, security: false, v8: "11.8.172.17" }, { name: "nodejs", version: "21.5.0", date: "2023-12-19", lts: false, security: false, v8: "11.8.172.17" }, { name: "nodejs", version: "21.6.0", date: "2024-01-14", lts: false, security: false, v8: "11.8.172.17" }, { name: "nodejs", version: "21.7.0", date: "2024-03-06", lts: false, security: false, v8: "11.8.172.17" }, { name: "nodejs", version: "22.0.0", date: "2024-04-24", lts: false, security: false, v8: "12.4.254.14" }, { name: "nodejs", version: "22.1.0", date: "2024-05-02", lts: false, security: false, v8: "12.4.254.14" }, { name: "nodejs", version: "22.2.0", date: "2024-05-15", lts: false, security: false, v8: "12.4.254.14" }, { name: "nodejs", version: "22.3.0", date: "2024-06-11", lts: false, security: false, v8: "12.4.254.20" }, { name: "nodejs", version: "22.4.0", date: "2024-07-02", lts: false, security: false, v8: "12.4.254.21" }, { name: "nodejs", version: "22.5.0", date: "2024-07-17", lts: false, security: false, v8: "12.4.254.21" }, { name: "nodejs", version: "22.6.0", date: "2024-08-06", lts: false, security: false, v8: "12.4.254.21" }, { name: "nodejs", version: "22.7.0", date: "2024-08-21", lts: false, security: false, v8: "12.4.254.21" }, { name: "nodejs", version: "22.8.0", date: "2024-09-03", lts: false, security: false, v8: "12.4.254.21" }, { name: "nodejs", version: "22.9.0", date: "2024-09-17", lts: false, security: false, v8: "12.4.254.21" }, { name: "nodejs", version: "22.10.0", date: "2024-10-16", lts: false, security: false, v8: "12.4.254.21" }, { name: "nodejs", version: "22.11.0", date: "2024-10-29", lts: "Jod", security: false, v8: "12.4.254.21" }, { name: "nodejs", version: "22.12.0", date: "2024-12-02", lts: "Jod", security: false, v8: "12.4.254.21" }, { name: "nodejs", version: "23.0.0", date: "2024-10-16", lts: false, security: false, v8: "12.9.202.26" }, { name: "nodejs", version: "23.1.0", date: "2024-10-24", lts: false, security: false, v8: "12.9.202.28" }, { name: "nodejs", version: "23.2.0", date: "2024-11-11", lts: false, security: false, v8: "12.9.202.28" }, { name: "nodejs", version: "23.3.0", date: "2024-11-20", lts: false, security: false, v8: "12.9.202.28" }];
  }
});

// node_modules/caniuse-lite/data/browsers.js
var require_browsers = __commonJS({
  "node_modules/caniuse-lite/data/browsers.js"(exports, module) {
    module.exports = { A: "ie", B: "edge", C: "firefox", D: "chrome", E: "safari", F: "opera", G: "ios_saf", H: "op_mini", I: "android", J: "bb", K: "op_mob", L: "and_chr", M: "and_ff", N: "ie_mob", O: "and_uc", P: "samsung", Q: "and_qq", R: "baidu", S: "kaios" };
  }
});

// node_modules/caniuse-lite/dist/unpacker/browsers.js
var require_browsers2 = __commonJS({
  "node_modules/caniuse-lite/dist/unpacker/browsers.js"(exports, module) {
    module.exports.browsers = require_browsers();
  }
});

// node_modules/caniuse-lite/data/browserVersions.js
var require_browserVersions = __commonJS({
  "node_modules/caniuse-lite/data/browserVersions.js"(exports, module) {
    module.exports = { "0": "117", "1": "20", "2": "21", "3": "22", "4": "23", "5": "24", "6": "25", "7": "26", "8": "27", "9": "118", A: "10", B: "11", C: "12", D: "7", E: "8", F: "9", G: "15", H: "80", I: "135", J: "4", K: "6", L: "13", M: "14", N: "16", O: "17", P: "18", Q: "79", R: "81", S: "83", T: "84", U: "85", V: "86", W: "87", X: "88", Y: "89", Z: "90", a: "91", b: "92", c: "93", d: "94", e: "95", f: "96", g: "97", h: "98", i: "99", j: "100", k: "101", l: "102", m: "103", n: "104", o: "105", p: "106", q: "107", r: "108", s: "109", t: "110", u: "111", v: "112", w: "113", x: "114", y: "115", z: "116", AB: "119", BB: "120", CB: "121", DB: "122", EB: "123", FB: "124", GB: "125", HB: "126", IB: "127", JB: "128", KB: "129", LB: "130", MB: "131", NB: "132", OB: "133", PB: "134", QB: "136", RB: "5", SB: "19", TB: "28", UB: "29", VB: "30", WB: "31", XB: "32", YB: "33", ZB: "34", aB: "35", bB: "36", cB: "37", dB: "38", eB: "39", fB: "40", gB: "41", hB: "42", iB: "43", jB: "44", kB: "45", lB: "46", mB: "47", nB: "48", oB: "49", pB: "50", qB: "51", rB: "52", sB: "53", tB: "54", uB: "55", vB: "56", wB: "57", xB: "58", yB: "60", zB: "62", "0B": "63", "1B": "64", "2B": "65", "3B": "66", "4B": "67", "5B": "68", "6B": "69", "7B": "70", "8B": "71", "9B": "72", AC: "73", BC: "74", CC: "75", DC: "76", EC: "77", FC: "78", GC: "137", HC: "11.1", IC: "12.1", JC: "15.5", KC: "16.0", LC: "17.0", MC: "18.0", NC: "3", OC: "59", PC: "61", QC: "82", RC: "138", SC: "139", TC: "3.2", UC: "10.1", VC: "15.2-15.3", WC: "15.4", XC: "16.1", YC: "16.2", ZC: "16.3", aC: "16.4", bC: "16.5", cC: "17.1", dC: "17.2", eC: "17.3", fC: "17.4", gC: "17.5", hC: "18.1", iC: "18.2", jC: "18.3", kC: "18.4", lC: "18.5", mC: "11.5", nC: "4.2-4.3", oC: "5.5", pC: "2", qC: "140", rC: "141", sC: "3.5", tC: "3.6", uC: "3.1", vC: "5.1", wC: "6.1", xC: "7.1", yC: "9.1", zC: "13.1", "0C": "14.1", "1C": "15.1", "2C": "15.6", "3C": "16.6", "4C": "17.6", "5C": "TP", "6C": "9.5-9.6", "7C": "10.0-10.1", "8C": "10.5", "9C": "10.6", AD: "11.6", BD: "4.0-4.1", CD: "5.0-5.1", DD: "6.0-6.1", ED: "7.0-7.1", FD: "8.1-8.4", GD: "9.0-9.2", HD: "9.3", ID: "10.0-10.2", JD: "10.3", KD: "11.0-11.2", LD: "11.3-11.4", MD: "12.0-12.1", ND: "12.2-12.5", OD: "13.0-13.1", PD: "13.2", QD: "13.3", RD: "13.4-13.7", SD: "14.0-14.4", TD: "14.5-14.8", UD: "15.0-15.1", VD: "15.6-15.8", WD: "16.6-16.7", XD: "17.6-17.7", YD: "all", ZD: "2.1", aD: "2.2", bD: "2.3", cD: "4.1", dD: "4.4", eD: "4.4.3-4.4.4", fD: "5.0-5.4", gD: "6.2-6.4", hD: "7.2-7.4", iD: "8.2", jD: "9.2", kD: "11.1-11.2", lD: "12.0", mD: "13.0", nD: "14.0", oD: "15.0", pD: "19.0", qD: "14.9", rD: "13.52", sD: "2.5", tD: "3.0-3.1" };
  }
});

// node_modules/caniuse-lite/dist/unpacker/browserVersions.js
var require_browserVersions2 = __commonJS({
  "node_modules/caniuse-lite/dist/unpacker/browserVersions.js"(exports, module) {
    module.exports.browserVersions = require_browserVersions();
  }
});

// node_modules/caniuse-lite/data/agents.js
var require_agents = __commonJS({
  "node_modules/caniuse-lite/data/agents.js"(exports, module) {
    module.exports = { A: { A: { K: 0, D: 0, E: 0, F: 0.0324821, A: 0, B: 0.438508, oC: 0 }, B: "ms", C: ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "oC", "K", "D", "E", "F", "A", "B", "", "", ""], E: "IE", F: { oC: 962323200, K: 998870400, D: 1161129600, E: 1237420800, F: 1300060800, A: 1346716800, B: 1381968e3 } }, B: { A: { "0": 3623e-6, "9": 3623e-6, C: 0, L: 0, M: 0, G: 0, N: 0, O: 0, P: 0.097821, Q: 0, H: 0, R: 0, S: 0, T: 0, U: 0, V: 0, W: 0, X: 0, Y: 0, Z: 0, a: 0, b: 0.010869, c: 0, d: 0, e: 0, f: 0, g: 0, h: 0, i: 0, j: 0, k: 0, l: 0, m: 0, n: 0, o: 0, p: 0, q: 0, r: 3623e-6, s: 0.047099, t: 0, u: 0, v: 0, w: 7246e-6, x: 0.014492, y: 7246e-6, z: 0, AB: 3623e-6, BB: 0.03623, CB: 7246e-6, DB: 0.014492, EB: 7246e-6, FB: 7246e-6, GB: 7246e-6, HB: 0.021738, IB: 0.014492, JB: 0.014492, KB: 0.014492, LB: 0.025361, MB: 0.065214, NB: 0.079706, OB: 1.34051, PB: 3.0252, I: 0, QB: 0 }, B: "webkit", C: ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "C", "L", "M", "G", "N", "O", "P", "Q", "H", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z", "0", "9", "AB", "BB", "CB", "DB", "EB", "FB", "GB", "HB", "IB", "JB", "KB", "LB", "MB", "NB", "OB", "PB", "I", "QB", "", ""], E: "Edge", F: { "0": 1694649600, "9": 1697155200, C: 1438128e3, L: 1447286400, M: 1470096e3, G: 1491868800, N: 1508198400, O: 1525046400, P: 1542067200, Q: 1579046400, H: 1581033600, R: 1586736e3, S: 1590019200, T: 1594857600, U: 1598486400, V: 1602201600, W: 1605830400, X: 161136e4, Y: 1614816e3, Z: 1618358400, a: 1622073600, b: 1626912e3, c: 1630627200, d: 1632441600, e: 1634774400, f: 1637539200, g: 1641427200, h: 1643932800, i: 1646265600, j: 1649635200, k: 1651190400, l: 1653955200, m: 1655942400, n: 1659657600, o: 1661990400, p: 1664755200, q: 1666915200, r: 1670198400, s: 1673481600, t: 1675900800, u: 1678665600, v: 1680825600, w: 1683158400, x: 1685664e3, y: 1689897600, z: 1692576e3, AB: 1698969600, BB: 1701993600, CB: 1706227200, DB: 1708732800, EB: 1711152e3, FB: 1713398400, GB: 1715990400, HB: 1718841600, IB: 1721865600, JB: 1724371200, KB: 1726704e3, LB: 1729123200, MB: 1731542400, NB: 1737417600, OB: 1740614400, PB: 1741219200, I: 1743984e3, QB: null }, D: { C: "ms", L: "ms", M: "ms", G: "ms", N: "ms", O: "ms", P: "ms" } }, C: { A: { "0": 0, "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0, "8": 0, "9": 0.094198, pC: 7246e-6, NC: 0, J: 0, RB: 0, K: 0, D: 0, E: 0, F: 0, A: 0, B: 0.025361, C: 0, L: 0, M: 0, G: 0, N: 0, O: 0, P: 0, SB: 0, TB: 0, UB: 0, VB: 0, WB: 0, XB: 0, YB: 0, ZB: 0, aB: 0, bB: 0, cB: 0, dB: 0, eB: 0, fB: 0, gB: 0, hB: 0, iB: 0, jB: 3623e-6, kB: 0, lB: 0, mB: 0, nB: 0, oB: 0, pB: 0, qB: 0, rB: 0.028984, sB: 0.014492, tB: 0, uB: 7246e-6, vB: 7246e-6, wB: 0, xB: 0, OC: 7246e-6, yB: 0, PC: 0, zB: 0, "0B": 0, "1B": 0, "2B": 0, "3B": 0, "4B": 0, "5B": 0, "6B": 0, "7B": 0, "8B": 0, "9B": 3623e-6, AC: 0, BC: 0, CC: 0, DC: 0, EC: 0, FC: 0.010869, Q: 0, H: 0, R: 0, QC: 0, S: 0, T: 0, U: 0, V: 0, W: 0, X: 7246e-6, Y: 0, Z: 0, a: 0, b: 0, c: 0, d: 3623e-6, e: 0, f: 0, g: 0, h: 0, i: 0, j: 0, k: 0, l: 0, m: 0, n: 0, o: 0, p: 0, q: 0, r: 0, s: 3623e-6, t: 0, u: 0, v: 0, w: 3623e-6, x: 0, y: 0.213757, z: 0, AB: 0, BB: 3623e-6, CB: 0, DB: 0, EB: 0, FB: 0, GB: 0.014492, HB: 0, IB: 7246e-6, JB: 0.083329, KB: 0, LB: 0, MB: 3623e-6, NB: 7246e-6, OB: 0.018115, PB: 0.025361, I: 0.347808, QB: 1.11951, GC: 7246e-6, RC: 0, SC: 0, qC: 0, rC: 0, sC: 0, tC: 0 }, B: "moz", C: ["pC", "NC", "sC", "tC", "J", "RB", "K", "D", "E", "F", "A", "B", "C", "L", "M", "G", "N", "O", "P", "SB", "1", "2", "3", "4", "5", "6", "7", "8", "TB", "UB", "VB", "WB", "XB", "YB", "ZB", "aB", "bB", "cB", "dB", "eB", "fB", "gB", "hB", "iB", "jB", "kB", "lB", "mB", "nB", "oB", "pB", "qB", "rB", "sB", "tB", "uB", "vB", "wB", "xB", "OC", "yB", "PC", "zB", "0B", "1B", "2B", "3B", "4B", "5B", "6B", "7B", "8B", "9B", "AC", "BC", "CC", "DC", "EC", "FC", "Q", "H", "R", "QC", "S", "T", "U", "V", "W", "X", "Y", "Z", "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z", "0", "9", "AB", "BB", "CB", "DB", "EB", "FB", "GB", "HB", "IB", "JB", "KB", "LB", "MB", "NB", "OB", "PB", "I", "QB", "GC", "RC", "SC", "qC", "rC"], E: "Firefox", F: { "0": 1693267200, "1": 1361232e3, "2": 1364860800, "3": 1368489600, "4": 1372118400, "5": 1375747200, "6": 1379376e3, "7": 1386633600, "8": 1391472e3, "9": 1695686400, pC: 1161648e3, NC: 1213660800, sC: 124632e4, tC: 1264032e3, J: 1300752e3, RB: 1308614400, K: 1313452800, D: 1317081600, E: 1317081600, F: 1320710400, A: 1324339200, B: 1327968e3, C: 1331596800, L: 1335225600, M: 1338854400, G: 1342483200, N: 1346112e3, O: 1349740800, P: 1353628800, SB: 1357603200, TB: 1395100800, UB: 1398729600, VB: 1402358400, WB: 1405987200, XB: 1409616e3, YB: 1413244800, ZB: 1417392e3, aB: 1421107200, bB: 1424736e3, cB: 1428278400, dB: 1431475200, eB: 1435881600, fB: 1439251200, gB: 144288e4, hB: 1446508800, iB: 1450137600, jB: 1453852800, kB: 1457395200, lB: 1461628800, mB: 1465257600, nB: 1470096e3, oB: 1474329600, pB: 1479168e3, qB: 1485216e3, rB: 1488844800, sB: 149256e4, tB: 1497312e3, uB: 1502150400, vB: 1506556800, wB: 1510617600, xB: 1516665600, OC: 1520985600, yB: 1525824e3, PC: 1529971200, zB: 1536105600, "0B": 1540252800, "1B": 1544486400, "2B": 154872e4, "3B": 1552953600, "4B": 1558396800, "5B": 1562630400, "6B": 1567468800, "7B": 1571788800, "8B": 1575331200, "9B": 1578355200, AC: 1581379200, BC: 1583798400, CC: 1586304e3, DC: 1588636800, EC: 1591056e3, FC: 1593475200, Q: 1595894400, H: 1598313600, R: 1600732800, QC: 1603152e3, S: 1605571200, T: 1607990400, U: 1611619200, V: 1614038400, W: 1616457600, X: 1618790400, Y: 1622505600, Z: 1626134400, a: 1628553600, b: 1630972800, c: 1633392e3, d: 1635811200, e: 1638835200, f: 1641859200, g: 1644364800, h: 1646697600, i: 1649116800, j: 1651536e3, k: 1653955200, l: 1656374400, m: 1658793600, n: 1661212800, o: 1663632e3, p: 1666051200, q: 1668470400, r: 1670889600, s: 1673913600, t: 1676332800, u: 1678752e3, v: 1681171200, w: 1683590400, x: 1686009600, y: 1688428800, z: 1690848e3, AB: 1698105600, BB: 1700524800, CB: 1702944e3, DB: 1705968e3, EB: 1708387200, FB: 1710806400, GB: 1713225600, HB: 1715644800, IB: 1718064e3, JB: 1720483200, KB: 1722902400, LB: 1725321600, MB: 1727740800, NB: 173016e4, OB: 1732579200, PB: 1736208e3, I: 1738627200, QB: 1741046400, GC: 1743465600, RC: 1745884800, SC: null, qC: null, rC: null } }, D: { A: { "0": 0.094198, "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0, "8": 0, "9": 0.057968, J: 0, RB: 0, K: 0, D: 0, E: 0, F: 0, A: 0, B: 0, C: 0, L: 0, M: 0, G: 0, N: 0, O: 0, P: 0, SB: 0, TB: 0, UB: 0, VB: 0, WB: 0, XB: 0, YB: 0, ZB: 0, aB: 0, bB: 0, cB: 0, dB: 3623e-6, eB: 7246e-6, fB: 3623e-6, gB: 7246e-6, hB: 7246e-6, iB: 7246e-6, jB: 7246e-6, kB: 7246e-6, lB: 3623e-6, mB: 7246e-6, nB: 0.018115, oB: 0.018115, pB: 7246e-6, qB: 7246e-6, rB: 0.010869, sB: 7246e-6, tB: 7246e-6, uB: 7246e-6, vB: 0.014492, wB: 7246e-6, xB: 0.010869, OC: 7246e-6, yB: 7246e-6, PC: 0, zB: 0, "0B": 0, "1B": 0, "2B": 0, "3B": 0.021738, "4B": 0, "5B": 0, "6B": 0.010869, "7B": 0.010869, "8B": 0, "9B": 0, AC: 7246e-6, BC: 3623e-6, CC: 7246e-6, DC: 3623e-6, EC: 0.014492, FC: 0.010869, Q: 0.068837, H: 0.010869, R: 0.014492, S: 0.028984, T: 3623e-6, U: 0.010869, V: 0.014492, W: 0.057968, X: 0.014492, Y: 3623e-6, Z: 7246e-6, a: 0.03623, b: 0.010869, c: 0.014492, d: 0.028984, e: 7246e-6, f: 7246e-6, g: 0.018115, h: 0.03623, i: 0.010869, j: 0.028984, k: 0.014492, l: 0.014492, m: 0.076083, n: 0.050722, o: 0.010869, p: 0.021738, q: 0.025361, r: 0.039853, s: 0.912996, t: 0.018115, u: 0.03623, v: 0.03623, w: 0.10869, x: 0.054345, y: 0.032607, z: 0.101444, AB: 0.03623, BB: 0.086952, CB: 0.094198, DB: 0.076083, EB: 0.086952, FB: 0.123182, GB: 0.344185, HB: 0.152166, IB: 0.101444, JB: 0.130428, KB: 0.101444, LB: 0.152166, MB: 1.17747, NB: 0.815175, OB: 5.89462, PB: 9.91615, I: 0.021738, QB: 0.014492, GC: 0, RC: 0, SC: 0 }, B: "webkit", C: ["", "", "", "", "", "", "", "J", "RB", "K", "D", "E", "F", "A", "B", "C", "L", "M", "G", "N", "O", "P", "SB", "1", "2", "3", "4", "5", "6", "7", "8", "TB", "UB", "VB", "WB", "XB", "YB", "ZB", "aB", "bB", "cB", "dB", "eB", "fB", "gB", "hB", "iB", "jB", "kB", "lB", "mB", "nB", "oB", "pB", "qB", "rB", "sB", "tB", "uB", "vB", "wB", "xB", "OC", "yB", "PC", "zB", "0B", "1B", "2B", "3B", "4B", "5B", "6B", "7B", "8B", "9B", "AC", "BC", "CC", "DC", "EC", "FC", "Q", "H", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z", "0", "9", "AB", "BB", "CB", "DB", "EB", "FB", "GB", "HB", "IB", "JB", "KB", "LB", "MB", "NB", "OB", "PB", "I", "QB", "GC", "RC", "SC"], E: "Chrome", F: { "0": 1694476800, "1": 133704e4, "2": 1340668800, "3": 1343692800, "4": 1348531200, "5": 1352246400, "6": 1357862400, "7": 1361404800, "8": 1364428800, "9": 1696896e3, J: 1264377600, RB: 1274745600, K: 1283385600, D: 1287619200, E: 1291248e3, F: 1296777600, A: 1299542400, B: 1303862400, C: 1307404800, L: 1312243200, M: 1316131200, G: 1316131200, N: 1319500800, O: 1323734400, P: 1328659200, SB: 1332892800, TB: 1369094400, UB: 1374105600, VB: 1376956800, WB: 1384214400, XB: 1389657600, YB: 1392940800, ZB: 1397001600, aB: 1400544e3, bB: 1405468800, cB: 1409011200, dB: 141264e4, eB: 1416268800, fB: 1421798400, gB: 1425513600, hB: 1429401600, iB: 143208e4, jB: 1437523200, kB: 1441152e3, lB: 1444780800, mB: 1449014400, nB: 1453248e3, oB: 1456963200, pB: 1460592e3, qB: 1464134400, rB: 1469059200, sB: 1472601600, tB: 1476230400, uB: 1480550400, vB: 1485302400, wB: 1489017600, xB: 149256e4, OC: 1496707200, yB: 1500940800, PC: 1504569600, zB: 1508198400, "0B": 1512518400, "1B": 1516752e3, "2B": 1520294400, "3B": 1523923200, "4B": 1527552e3, "5B": 1532390400, "6B": 1536019200, "7B": 1539648e3, "8B": 1543968e3, "9B": 154872e4, AC: 1552348800, BC: 1555977600, CC: 1559606400, DC: 1564444800, EC: 1568073600, FC: 1571702400, Q: 1575936e3, H: 1580860800, R: 1586304e3, S: 1589846400, T: 1594684800, U: 1598313600, V: 1601942400, W: 1605571200, X: 1611014400, Y: 1614556800, Z: 1618272e3, a: 1621987200, b: 1626739200, c: 1630368e3, d: 1632268800, e: 1634601600, f: 1637020800, g: 1641340800, h: 1643673600, i: 1646092800, j: 1648512e3, k: 1650931200, l: 1653350400, m: 1655769600, n: 1659398400, o: 1661817600, p: 1664236800, q: 1666656e3, r: 166968e4, s: 1673308800, t: 1675728e3, u: 1678147200, v: 1680566400, w: 1682985600, x: 1685404800, y: 1689724800, z: 1692057600, AB: 1698710400, BB: 1701993600, CB: 1705968e3, DB: 1708387200, EB: 1710806400, FB: 1713225600, GB: 1715644800, HB: 1718064e3, IB: 1721174400, JB: 1724112e3, KB: 1726531200, LB: 1728950400, MB: 1731369600, NB: 1736812800, OB: 1738627200, PB: 1741046400, I: 1743465600, QB: 1745884800, GC: null, RC: null, SC: null } }, E: { A: { J: 0, RB: 0, K: 0, D: 0, E: 0, F: 0, A: 0, B: 0, C: 0, L: 0, M: 0.014492, G: 3623e-6, uC: 0, TC: 0, vC: 0, wC: 0, xC: 0, yC: 0, UC: 0, HC: 7246e-6, IC: 7246e-6, zC: 0.032607, "0C": 0.043476, "1C": 0.014492, VC: 3623e-6, WC: 0.010869, JC: 0.014492, "2C": 0.148543, KC: 0.032607, XC: 0.021738, YC: 0.018115, ZC: 0.039853, aC: 0.014492, bC: 0.025361, "3C": 0.199265, LC: 0.010869, cC: 0.123182, dC: 0.018115, eC: 0.021738, fC: 0.050722, gC: 0.086952, "4C": 0.264479, MC: 0.03623, hC: 0.115936, iC: 0.057968, jC: 1.4021, kC: 0.018115, lC: 0, "5C": 0 }, B: "webkit", C: ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "uC", "TC", "J", "RB", "vC", "K", "wC", "D", "xC", "E", "F", "yC", "A", "UC", "B", "HC", "C", "IC", "L", "zC", "M", "0C", "G", "1C", "VC", "WC", "JC", "2C", "KC", "XC", "YC", "ZC", "aC", "bC", "3C", "LC", "cC", "dC", "eC", "fC", "gC", "4C", "MC", "hC", "iC", "jC", "kC", "lC", "5C", ""], E: "Safari", F: { uC: 1205798400, TC: 1226534400, J: 1244419200, RB: 1275868800, vC: 131112e4, K: 1343174400, wC: 13824e5, D: 13824e5, xC: 1410998400, E: 1413417600, F: 1443657600, yC: 1458518400, A: 1474329600, UC: 1490572800, B: 1505779200, HC: 1522281600, C: 1537142400, IC: 1553472e3, L: 1568851200, zC: 1585008e3, M: 1600214400, "0C": 1619395200, G: 1632096e3, "1C": 1635292800, VC: 1639353600, WC: 1647216e3, JC: 1652745600, "2C": 1658275200, KC: 1662940800, XC: 1666569600, YC: 1670889600, ZC: 1674432e3, aC: 1679875200, bC: 1684368e3, "3C": 1690156800, LC: 1695686400, cC: 1698192e3, dC: 1702252800, eC: 1705881600, fC: 1709596800, gC: 1715558400, "4C": 1722211200, MC: 1726444800, hC: 1730073600, iC: 1733875200, jC: 1737936e3, kC: 1743379200, lC: null, "5C": null } }, F: { A: { "0": 0.684747, "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0, "8": 0, F: 0, B: 0, C: 0, G: 0, N: 0, O: 0, P: 0, SB: 0, TB: 0, UB: 0, VB: 0, WB: 0, XB: 0, YB: 0, ZB: 0, aB: 0, bB: 0, cB: 0, dB: 0, eB: 0, fB: 3623e-6, gB: 0, hB: 0, iB: 0, jB: 0, kB: 0, lB: 0.010869, mB: 0, nB: 0, oB: 0, pB: 0, qB: 0, rB: 0, sB: 0, tB: 0, uB: 0, vB: 0, wB: 0, xB: 0, yB: 0, zB: 0, "0B": 0, "1B": 0, "2B": 0, "3B": 0, "4B": 0, "5B": 0, "6B": 0, "7B": 0, "8B": 0, "9B": 0, AC: 0, BC: 0, CC: 0, DC: 0, EC: 0, FC: 0, Q: 0, H: 0, R: 0, QC: 0, S: 0, T: 0, U: 0, V: 0, W: 0.025361, X: 7246e-6, Y: 0, Z: 0, a: 0, b: 0, c: 0, d: 0, e: 0.032607, f: 0, g: 0, h: 0, i: 0, j: 0, k: 0, l: 0.018115, m: 0, n: 0, o: 0, p: 0, q: 0, r: 0, s: 0, t: 0, u: 0, v: 0, w: 0, x: 3623e-6, y: 0, z: 0.202888, "6C": 0, "7C": 0, "8C": 0, "9C": 0, HC: 0, mC: 0, AD: 0, IC: 0 }, B: "webkit", C: ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "F", "6C", "7C", "8C", "9C", "B", "HC", "mC", "AD", "C", "IC", "G", "N", "O", "P", "SB", "1", "2", "3", "4", "5", "6", "7", "8", "TB", "UB", "VB", "WB", "XB", "YB", "ZB", "aB", "bB", "cB", "dB", "eB", "fB", "gB", "hB", "iB", "jB", "kB", "lB", "mB", "nB", "oB", "pB", "qB", "rB", "sB", "tB", "uB", "vB", "wB", "xB", "yB", "zB", "0B", "1B", "2B", "3B", "4B", "5B", "6B", "7B", "8B", "9B", "AC", "BC", "CC", "DC", "EC", "FC", "Q", "H", "R", "QC", "S", "T", "U", "V", "W", "X", "Y", "Z", "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z", "0", "", "", ""], E: "Opera", F: { "0": 1739404800, "1": 1393891200, "2": 1399334400, "3": 1401753600, "4": 1405987200, "5": 1409616e3, "6": 1413331200, "7": 1417132800, "8": 1422316800, F: 1150761600, "6C": 1223424e3, "7C": 1251763200, "8C": 1267488e3, "9C": 1277942400, B: 1292457600, HC: 1302566400, mC: 1309219200, AD: 1323129600, C: 1323129600, IC: 1352073600, G: 1372723200, N: 1377561600, O: 1381104e3, P: 1386288e3, SB: 1390867200, TB: 1425945600, UB: 1430179200, VB: 1433808e3, WB: 1438646400, XB: 1442448e3, YB: 1445904e3, ZB: 1449100800, aB: 1454371200, bB: 1457308800, cB: 146232e4, dB: 1465344e3, eB: 1470096e3, fB: 1474329600, gB: 1477267200, hB: 1481587200, iB: 1486425600, jB: 1490054400, kB: 1494374400, lB: 1498003200, mB: 1502236800, nB: 1506470400, oB: 1510099200, pB: 1515024e3, qB: 1517961600, rB: 1521676800, sB: 1525910400, tB: 1530144e3, uB: 1534982400, vB: 1537833600, wB: 1543363200, xB: 1548201600, yB: 1554768e3, zB: 1561593600, "0B": 1566259200, "1B": 1570406400, "2B": 1573689600, "3B": 1578441600, "4B": 1583971200, "5B": 1587513600, "6B": 1592956800, "7B": 1595894400, "8B": 1600128e3, "9B": 1603238400, AC: 161352e4, BC: 1612224e3, CC: 1616544e3, DC: 1619568e3, EC: 1623715200, FC: 1627948800, Q: 1631577600, H: 1633392e3, R: 1635984e3, QC: 1638403200, S: 1642550400, T: 1644969600, U: 1647993600, V: 1650412800, W: 1652745600, X: 1654646400, Y: 1657152e3, Z: 1660780800, a: 1663113600, b: 1668816e3, c: 1668643200, d: 1671062400, e: 1675209600, f: 1677024e3, g: 1679529600, h: 1681948800, i: 1684195200, j: 1687219200, k: 1690329600, l: 1692748800, m: 1696204800, n: 169992e4, o: 169992e4, p: 1702944e3, q: 1707264e3, r: 1710115200, s: 1711497600, t: 1716336e3, u: 1719273600, v: 1721088e3, w: 1724284800, x: 1727222400, y: 1732665600, z: 1736294400 }, D: { F: "o", B: "o", C: "o", "6C": "o", "7C": "o", "8C": "o", "9C": "o", HC: "o", mC: "o", AD: "o", IC: "o" } }, G: { A: { E: 0, TC: 0, BD: 0, nC: 289898e-8, CD: 0, DD: 869695e-8, ED: 724746e-8, FD: 0, GD: 434848e-8, HD: 0.0202929, ID: 144949e-8, JD: 0.0333383, KD: 0.153646, LD: 0.0101464, MD: 579797e-8, ND: 0.14205, OD: 289898e-8, PD: 579797e-8, QD: 579797e-8, RD: 0.0202929, SD: 0.124656, TD: 0.0608787, UD: 0.0333383, VC: 0.0333383, WC: 0.0405858, JC: 0.0463837, VD: 0.568201, KC: 0.0797221, XC: 0.165242, YC: 0.08552, ZC: 0.150747, aC: 0.0333383, bC: 0.0623282, WD: 0.672564, LC: 0.0405858, cC: 0.0724746, dC: 0.0550807, eC: 0.0768231, fC: 0.153646, gC: 0.340631, XD: 0.988554, MC: 0.276853, hC: 0.905933, iC: 0.405858, jC: 8.46503, kC: 0.126106, lC: 0 }, B: "webkit", C: ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "TC", "BD", "nC", "CD", "DD", "ED", "E", "FD", "GD", "HD", "ID", "JD", "KD", "LD", "MD", "ND", "OD", "PD", "QD", "RD", "SD", "TD", "UD", "VC", "WC", "JC", "VD", "KC", "XC", "YC", "ZC", "aC", "bC", "WD", "LC", "cC", "dC", "eC", "fC", "gC", "XD", "MC", "hC", "iC", "jC", "kC", "lC", "", ""], E: "Safari on iOS", F: { TC: 1270252800, BD: 1283904e3, nC: 1299628800, CD: 1331078400, DD: 1359331200, ED: 1394409600, E: 1410912e3, FD: 1413763200, GD: 1442361600, HD: 1458518400, ID: 1473724800, JD: 1490572800, KD: 1505779200, LD: 1522281600, MD: 1537142400, ND: 1553472e3, OD: 1568851200, PD: 1572220800, QD: 1580169600, RD: 1585008e3, SD: 1600214400, TD: 1619395200, UD: 1632096e3, VC: 1639353600, WC: 1647216e3, JC: 1652659200, VD: 1658275200, KC: 1662940800, XC: 1666569600, YC: 1670889600, ZC: 1674432e3, aC: 1679875200, bC: 1684368e3, WD: 1690156800, LC: 1694995200, cC: 1698192e3, dC: 1702252800, eC: 1705881600, fC: 1709596800, gC: 1715558400, XD: 1722211200, MC: 1726444800, hC: 1730073600, iC: 1733875200, jC: 1737936e3, kC: 1743379200, lC: null } }, H: { A: { YD: 0.05 }, B: "o", C: ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "YD", "", "", ""], E: "Opera Mini", F: { YD: 1426464e3 } }, I: { A: { NC: 0, J: 0, I: 0.871727, ZD: 0, aD: 0, bD: 0, cD: 0, nC: 262095e-9, dD: 0, eD: 961014e-9 }, B: "webkit", C: ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "ZD", "aD", "bD", "NC", "J", "cD", "nC", "dD", "eD", "I", "", "", ""], E: "Android Browser", F: { ZD: 1256515200, aD: 1274313600, bD: 1291593600, NC: 1298332800, J: 1318896e3, cD: 1341792e3, nC: 1374624e3, dD: 1386547200, eD: 1401667200, I: 1743379200 } }, J: { A: { D: 0, A: 0 }, B: "webkit", C: ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "D", "A", "", "", ""], E: "Blackberry Browser", F: { D: 1325376e3, A: 1359504e3 } }, K: { A: { A: 0, B: 0, C: 0, H: 1.04047, HC: 0, mC: 0, IC: 0 }, B: "o", C: ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "A", "B", "HC", "mC", "C", "IC", "H", "", "", ""], E: "Opera Mobile", F: { A: 1287100800, B: 1300752e3, HC: 1314835200, mC: 1318291200, C: 1330300800, IC: 1349740800, H: 1709769600 }, D: { H: "webkit" } }, L: { A: { I: 44.6783 }, B: "webkit", C: ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "I", "", "", ""], E: "Chrome for Android", F: { I: 1743379200 } }, M: { A: { GC: 0.350735 }, B: "moz", C: ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "GC", "", "", ""], E: "Firefox for Android", F: { GC: 1743465600 } }, N: { A: { A: 0, B: 0 }, B: "ms", C: ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "A", "B", "", "", ""], E: "IE Mobile", F: { A: 1340150400, B: 1353456e3 } }, O: { A: { JC: 0.848141 }, B: "webkit", C: ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "JC", "", "", ""], E: "UC Browser for Android", F: { JC: 1710115200 }, D: { JC: "webkit" } }, P: { A: { "1": 0, "2": 0.0219344, "3": 0.0219344, "4": 0.0329016, "5": 0.0438688, "6": 0.0438688, "7": 0.0877377, "8": 1.96313, J: 0.0329016, fD: 0, gD: 0, hD: 0.0109672, iD: 0, jD: 0, UC: 0, kD: 0, lD: 0, mD: 0, nD: 0, oD: 0, KC: 0, LC: 0.0109672, MC: 0, pD: 0 }, B: "webkit", C: ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "J", "fD", "gD", "hD", "iD", "jD", "UC", "kD", "lD", "mD", "nD", "oD", "KC", "LC", "MC", "pD", "1", "2", "3", "4", "5", "6", "7", "8", "", "", ""], E: "Samsung Internet", F: { "1": 1677369600, "2": 1684454400, "3": 1689292800, "4": 1697587200, "5": 1711497600, "6": 1715126400, "7": 1717718400, "8": 1725667200, J: 1461024e3, fD: 1481846400, gD: 1509408e3, hD: 1528329600, iD: 1546128e3, jD: 1554163200, UC: 1567900800, kD: 1582588800, lD: 1593475200, mD: 1605657600, nD: 1618531200, oD: 1629072e3, KC: 1640736e3, LC: 1651708800, MC: 1659657600, pD: 1667260800 } }, Q: { A: { qD: 0.229572 }, B: "webkit", C: ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "qD", "", "", ""], E: "QQ Browser", F: { qD: 1710288e3 } }, R: { A: { rD: 0 }, B: "webkit", C: ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "rD", "", "", ""], E: "Baidu Browser", F: { rD: 1710201600 } }, S: { A: { sD: 0.012754, tD: 0 }, B: "moz", C: ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "sD", "tD", "", "", ""], E: "KaiOS Browser", F: { sD: 1527811200, tD: 1631664e3 } } };
  }
});

// node_modules/caniuse-lite/dist/unpacker/agents.js
var require_agents2 = __commonJS({
  "node_modules/caniuse-lite/dist/unpacker/agents.js"(exports, module) {
    "use strict";
    var browsers = require_browsers2().browsers;
    var versions = require_browserVersions2().browserVersions;
    var agentsData = require_agents();
    function unpackBrowserVersions(versionsData) {
      return Object.keys(versionsData).reduce((usage, version) => {
        usage[versions[version]] = versionsData[version];
        return usage;
      }, {});
    }
    module.exports.agents = Object.keys(agentsData).reduce((map, key) => {
      let versionsData = agentsData[key];
      map[browsers[key]] = Object.keys(versionsData).reduce((data, entry) => {
        if (entry === "A") {
          data.usage_global = unpackBrowserVersions(versionsData[entry]);
        } else if (entry === "C") {
          data.versions = versionsData[entry].reduce((list, version) => {
            if (version === "") {
              list.push(null);
            } else {
              list.push(versions[version]);
            }
            return list;
          }, []);
        } else if (entry === "D") {
          data.prefix_exceptions = unpackBrowserVersions(versionsData[entry]);
        } else if (entry === "E") {
          data.browser = versionsData[entry];
        } else if (entry === "F") {
          data.release_date = Object.keys(versionsData[entry]).reduce(
            (map2, key2) => {
              map2[versions[key2]] = versionsData[entry][key2];
              return map2;
            },
            {}
          );
        } else {
          data.prefix = versionsData[entry];
        }
        return data;
      }, {});
      return map;
    }, {});
  }
});

// node_modules/electron-to-chromium/versions.js
var require_versions = __commonJS({
  "node_modules/electron-to-chromium/versions.js"(exports, module) {
    module.exports = {
      "0.20": "39",
      "0.21": "41",
      "0.22": "41",
      "0.23": "41",
      "0.24": "41",
      "0.25": "42",
      "0.26": "42",
      "0.27": "43",
      "0.28": "43",
      "0.29": "43",
      "0.30": "44",
      "0.31": "45",
      "0.32": "45",
      "0.33": "45",
      "0.34": "45",
      "0.35": "45",
      "0.36": "47",
      "0.37": "49",
      "1.0": "49",
      "1.1": "50",
      "1.2": "51",
      "1.3": "52",
      "1.4": "53",
      "1.5": "54",
      "1.6": "56",
      "1.7": "58",
      "1.8": "59",
      "2.0": "61",
      "2.1": "61",
      "3.0": "66",
      "3.1": "66",
      "4.0": "69",
      "4.1": "69",
      "4.2": "69",
      "5.0": "73",
      "6.0": "76",
      "6.1": "76",
      "7.0": "78",
      "7.1": "78",
      "7.2": "78",
      "7.3": "78",
      "8.0": "80",
      "8.1": "80",
      "8.2": "80",
      "8.3": "80",
      "8.4": "80",
      "8.5": "80",
      "9.0": "83",
      "9.1": "83",
      "9.2": "83",
      "9.3": "83",
      "9.4": "83",
      "10.0": "85",
      "10.1": "85",
      "10.2": "85",
      "10.3": "85",
      "10.4": "85",
      "11.0": "87",
      "11.1": "87",
      "11.2": "87",
      "11.3": "87",
      "11.4": "87",
      "11.5": "87",
      "12.0": "89",
      "12.1": "89",
      "12.2": "89",
      "13.0": "91",
      "13.1": "91",
      "13.2": "91",
      "13.3": "91",
      "13.4": "91",
      "13.5": "91",
      "13.6": "91",
      "14.0": "93",
      "14.1": "93",
      "14.2": "93",
      "15.0": "94",
      "15.1": "94",
      "15.2": "94",
      "15.3": "94",
      "15.4": "94",
      "15.5": "94",
      "16.0": "96",
      "16.1": "96",
      "16.2": "96",
      "17.0": "98",
      "17.1": "98",
      "17.2": "98",
      "17.3": "98",
      "17.4": "98",
      "18.0": "100",
      "18.1": "100",
      "18.2": "100",
      "18.3": "100",
      "19.0": "102",
      "19.1": "102",
      "20.0": "104",
      "20.1": "104",
      "20.2": "104",
      "20.3": "104",
      "21.0": "106",
      "21.1": "106",
      "21.2": "106",
      "21.3": "106",
      "21.4": "106",
      "22.0": "108",
      "22.1": "108",
      "22.2": "108",
      "22.3": "108",
      "23.0": "110",
      "23.1": "110",
      "23.2": "110",
      "23.3": "110",
      "24.0": "112",
      "24.1": "112",
      "24.2": "112",
      "24.3": "112",
      "24.4": "112",
      "24.5": "112",
      "24.6": "112",
      "24.7": "112",
      "24.8": "112",
      "25.0": "114",
      "25.1": "114",
      "25.2": "114",
      "25.3": "114",
      "25.4": "114",
      "25.5": "114",
      "25.6": "114",
      "25.7": "114",
      "25.8": "114",
      "25.9": "114",
      "26.0": "116",
      "26.1": "116",
      "26.2": "116",
      "26.3": "116",
      "26.4": "116",
      "26.5": "116",
      "26.6": "116",
      "27.0": "118",
      "27.1": "118",
      "27.2": "118",
      "27.3": "118",
      "28.0": "120",
      "28.1": "120",
      "28.2": "120",
      "28.3": "120",
      "29.0": "122",
      "29.1": "122",
      "29.2": "122",
      "29.3": "122",
      "29.4": "122",
      "30.0": "124",
      "30.1": "124",
      "30.2": "124",
      "30.3": "124",
      "30.4": "124",
      "30.5": "124",
      "31.0": "126",
      "31.1": "126",
      "31.2": "126",
      "31.3": "126",
      "31.4": "126",
      "31.5": "126",
      "31.6": "126",
      "31.7": "126",
      "32.0": "128",
      "32.1": "128",
      "32.2": "128",
      "32.3": "128",
      "33.0": "130",
      "33.1": "130",
      "33.2": "130",
      "33.3": "130",
      "33.4": "130",
      "34.0": "132",
      "34.1": "132",
      "34.2": "132",
      "34.3": "132",
      "34.4": "132",
      "34.5": "132",
      "35.0": "134",
      "35.1": "134",
      "35.2": "134",
      "36.0": "136",
      "36.1": "136",
      "37.0": "138"
    };
  }
});

// node_modules/node-releases/data/release-schedule/release-schedule.json
var require_release_schedule = __commonJS({
  "node_modules/node-releases/data/release-schedule/release-schedule.json"(exports, module) {
    module.exports = { "v0.8": { start: "2012-06-25", end: "2014-07-31" }, "v0.10": { start: "2013-03-11", end: "2016-10-31" }, "v0.12": { start: "2015-02-06", end: "2016-12-31" }, v4: { start: "2015-09-08", lts: "2015-10-12", maintenance: "2017-04-01", end: "2018-04-30", codename: "Argon" }, v5: { start: "2015-10-29", maintenance: "2016-04-30", end: "2016-06-30" }, v6: { start: "2016-04-26", lts: "2016-10-18", maintenance: "2018-04-30", end: "2019-04-30", codename: "Boron" }, v7: { start: "2016-10-25", maintenance: "2017-04-30", end: "2017-06-30" }, v8: { start: "2017-05-30", lts: "2017-10-31", maintenance: "2019-01-01", end: "2019-12-31", codename: "Carbon" }, v9: { start: "2017-10-01", maintenance: "2018-04-01", end: "2018-06-30" }, v10: { start: "2018-04-24", lts: "2018-10-30", maintenance: "2020-05-19", end: "2021-04-30", codename: "Dubnium" }, v11: { start: "2018-10-23", maintenance: "2019-04-22", end: "2019-06-01" }, v12: { start: "2019-04-23", lts: "2019-10-21", maintenance: "2020-11-30", end: "2022-04-30", codename: "Erbium" }, v13: { start: "2019-10-22", maintenance: "2020-04-01", end: "2020-06-01" }, v14: { start: "2020-04-21", lts: "2020-10-27", maintenance: "2021-10-19", end: "2023-04-30", codename: "Fermium" }, v15: { start: "2020-10-20", maintenance: "2021-04-01", end: "2021-06-01" }, v16: { start: "2021-04-20", lts: "2021-10-26", maintenance: "2022-10-18", end: "2023-09-11", codename: "Gallium" }, v17: { start: "2021-10-19", maintenance: "2022-04-01", end: "2022-06-01" }, v18: { start: "2022-04-19", lts: "2022-10-25", maintenance: "2023-10-18", end: "2025-04-30", codename: "Hydrogen" }, v19: { start: "2022-10-18", maintenance: "2023-04-01", end: "2023-06-01" }, v20: { start: "2023-04-18", lts: "2023-10-24", maintenance: "2024-10-22", end: "2026-04-30", codename: "Iron" }, v21: { start: "2023-10-17", maintenance: "2024-04-01", end: "2024-06-01" }, v22: { start: "2024-04-24", lts: "2024-10-29", maintenance: "2025-10-21", end: "2027-04-30", codename: "Jod" }, v23: { start: "2024-10-16", maintenance: "2025-04-01", end: "2025-06-01" }, v24: { start: "2025-04-22", lts: "2025-10-28", maintenance: "2026-10-20", end: "2028-04-30", codename: "" } };
  }
});

// node_modules/browserslist/error.js
var require_error2 = __commonJS({
  "node_modules/browserslist/error.js"(exports, module) {
    function BrowserslistError(message) {
      this.name = "BrowserslistError";
      this.message = message;
      this.browserslist = true;
      if (Error.captureStackTrace) {
        Error.captureStackTrace(this, BrowserslistError);
      }
    }
    BrowserslistError.prototype = Error.prototype;
    module.exports = BrowserslistError;
  }
});

// node_modules/caniuse-lite/dist/lib/statuses.js
var require_statuses = __commonJS({
  "node_modules/caniuse-lite/dist/lib/statuses.js"(exports, module) {
    module.exports = {
      1: "ls",
      // WHATWG Living Standard
      2: "rec",
      // W3C Recommendation
      3: "pr",
      // W3C Proposed Recommendation
      4: "cr",
      // W3C Candidate Recommendation
      5: "wd",
      // W3C Working Draft
      6: "other",
      // Non-W3C, but reputable
      7: "unoff"
      // Unofficial, Editor's Draft or W3C "Note"
    };
  }
});

// node_modules/caniuse-lite/dist/lib/supported.js
var require_supported = __commonJS({
  "node_modules/caniuse-lite/dist/lib/supported.js"(exports, module) {
    module.exports = {
      y: 1 << 0,
      n: 1 << 1,
      a: 1 << 2,
      p: 1 << 3,
      u: 1 << 4,
      x: 1 << 5,
      d: 1 << 6
    };
  }
});

// node_modules/caniuse-lite/dist/unpacker/feature.js
var require_feature = __commonJS({
  "node_modules/caniuse-lite/dist/unpacker/feature.js"(exports, module) {
    "use strict";
    var statuses = require_statuses();
    var supported = require_supported();
    var browsers = require_browsers2().browsers;
    var versions = require_browserVersions2().browserVersions;
    var MATH2LOG = Math.log(2);
    function unpackSupport(cipher) {
      let stats = Object.keys(supported).reduce((list, support) => {
        if (cipher & supported[support]) list.push(support);
        return list;
      }, []);
      let notes = cipher >> 7;
      let notesArray = [];
      while (notes) {
        let note = Math.floor(Math.log(notes) / MATH2LOG) + 1;
        notesArray.unshift(`#${note}`);
        notes -= Math.pow(2, note - 1);
      }
      return stats.concat(notesArray).join(" ");
    }
    function unpackFeature(packed) {
      let unpacked = {
        status: statuses[packed.B],
        title: packed.C,
        shown: packed.D
      };
      unpacked.stats = Object.keys(packed.A).reduce((browserStats, key) => {
        let browser = packed.A[key];
        browserStats[browsers[key]] = Object.keys(browser).reduce(
          (stats, support) => {
            let packedVersions = browser[support].split(" ");
            let unpacked2 = unpackSupport(support);
            packedVersions.forEach((v) => stats[versions[v]] = unpacked2);
            return stats;
          },
          {}
        );
        return browserStats;
      }, {});
      return unpacked;
    }
    module.exports = unpackFeature;
    module.exports.default = unpackFeature;
  }
});

// node_modules/caniuse-lite/dist/unpacker/region.js
var require_region = __commonJS({
  "node_modules/caniuse-lite/dist/unpacker/region.js"(exports, module) {
    "use strict";
    var browsers = require_browsers2().browsers;
    function unpackRegion(packed) {
      return Object.keys(packed).reduce((list, browser) => {
        let data = packed[browser];
        list[browsers[browser]] = Object.keys(data).reduce((memo, key) => {
          let stats = data[key];
          if (key === "_") {
            stats.split(" ").forEach((version) => memo[version] = null);
          } else {
            memo[key] = stats;
          }
          return memo;
        }, {});
        return list;
      }, {});
    }
    module.exports = unpackRegion;
    module.exports.default = unpackRegion;
  }
});

// node_modules/browserslist/node.js
var require_node = __commonJS({
  "node_modules/browserslist/node.js"(exports, module) {
    var feature = require_feature().default;
    var region = require_region().default;
    var fs2 = __require("fs");
    var path3 = __require("path");
    var BrowserslistError = require_error2();
    var IS_SECTION = /^\s*\[(.+)]\s*$/;
    var CONFIG_PATTERN = /^browserslist-config-/;
    var SCOPED_CONFIG__PATTERN = /@[^/]+(?:\/[^/]+)?\/browserslist-config(?:-|$|\/)/;
    var FORMAT = "Browserslist config should be a string or an array of strings with browser queries";
    var dataTimeChecked = false;
    var statCache = {};
    var configPathCache = {};
    var parseConfigCache = {};
    function checkExtend(name) {
      var use = " Use `dangerousExtend` option to disable.";
      if (!CONFIG_PATTERN.test(name) && !SCOPED_CONFIG__PATTERN.test(name)) {
        throw new BrowserslistError(
          "Browserslist config needs `browserslist-config-` prefix. " + use
        );
      }
      if (name.replace(/^@[^/]+\//, "").indexOf(".") !== -1) {
        throw new BrowserslistError(
          "`.` not allowed in Browserslist config name. " + use
        );
      }
      if (name.indexOf("node_modules") !== -1) {
        throw new BrowserslistError(
          "`node_modules` not allowed in Browserslist config." + use
        );
      }
    }
    function isFile(file) {
      return fs2.existsSync(file) && fs2.statSync(file).isFile();
    }
    function isDirectory(dir) {
      return fs2.existsSync(dir) && fs2.statSync(dir).isDirectory();
    }
    function eachParent(file, callback, cache) {
      var loc = path3.resolve(file);
      var pathsForCacheResult = [];
      var result;
      do {
        if (!pathInRoot(loc)) {
          break;
        }
        if (cache && loc in cache) {
          result = cache[loc];
          break;
        }
        pathsForCacheResult.push(loc);
        if (!isDirectory(loc)) {
          continue;
        }
        var locResult = callback(loc);
        if (typeof locResult !== "undefined") {
          result = locResult;
          break;
        }
      } while (loc !== (loc = path3.dirname(loc)));
      if (cache && !process.env.BROWSERSLIST_DISABLE_CACHE) {
        pathsForCacheResult.forEach(function(cachePath) {
          cache[cachePath] = result;
        });
      }
      return result;
    }
    function pathInRoot(p) {
      if (!process.env.BROWSERSLIST_ROOT_PATH) return true;
      var rootPath = path3.resolve(process.env.BROWSERSLIST_ROOT_PATH);
      if (path3.relative(rootPath, p).substring(0, 2) === "..") {
        return false;
      }
      return true;
    }
    function check(section) {
      if (Array.isArray(section)) {
        for (var i = 0; i < section.length; i++) {
          if (typeof section[i] !== "string") {
            throw new BrowserslistError(FORMAT);
          }
        }
      } else if (typeof section !== "string") {
        throw new BrowserslistError(FORMAT);
      }
    }
    function pickEnv(config2, opts) {
      if (typeof config2 !== "object") return config2;
      var name;
      if (typeof opts.env === "string") {
        name = opts.env;
      } else if (process.env.BROWSERSLIST_ENV) {
        name = process.env.BROWSERSLIST_ENV;
      } else if (process.env.NODE_ENV) {
        name = process.env.NODE_ENV;
      } else {
        name = "production";
      }
      if (opts.throwOnMissing) {
        if (name && name !== "defaults" && !config2[name]) {
          throw new BrowserslistError(
            "Missing config for Browserslist environment `" + name + "`"
          );
        }
      }
      return config2[name] || config2.defaults;
    }
    function parsePackage(file) {
      var text = fs2.readFileSync(file).toString().replace(/^\uFEFF/m, "");
      var list;
      if (text.indexOf('"browserslist"') >= 0) {
        list = JSON.parse(text).browserslist;
      } else if (text.indexOf('"browserlist"') >= 0) {
        var config2 = JSON.parse(text);
        if (config2.browserlist && !config2.browserslist) {
          throw new BrowserslistError(
            "`browserlist` key instead of `browserslist` in " + file
          );
        }
      }
      if (Array.isArray(list) || typeof list === "string") {
        list = { defaults: list };
      }
      for (var i in list) {
        check(list[i]);
      }
      return list;
    }
    function parsePackageOrReadConfig(file) {
      if (file in parseConfigCache) {
        return parseConfigCache[file];
      }
      var isPackage = path3.basename(file) === "package.json";
      var result = isPackage ? parsePackage(file) : module.exports.readConfig(file);
      if (!process.env.BROWSERSLIST_DISABLE_CACHE) {
        parseConfigCache[file] = result;
      }
      return result;
    }
    function latestReleaseTime(agents) {
      var latest = 0;
      for (var name in agents) {
        var dates = agents[name].releaseDate || {};
        for (var key in dates) {
          if (latest < dates[key]) {
            latest = dates[key];
          }
        }
      }
      return latest * 1e3;
    }
    function getMonthsPassed(date) {
      var now = /* @__PURE__ */ new Date();
      var past = new Date(date);
      var years = now.getFullYear() - past.getFullYear();
      var months = now.getMonth() - past.getMonth();
      return years * 12 + months;
    }
    function normalizeStats(data, stats) {
      if (!data) {
        data = {};
      }
      if (stats && "dataByBrowser" in stats) {
        stats = stats.dataByBrowser;
      }
      if (typeof stats !== "object") return void 0;
      var normalized = {};
      for (var i in stats) {
        var versions = Object.keys(stats[i]);
        if (versions.length === 1 && data[i] && data[i].versions.length === 1) {
          var normal = data[i].versions[0];
          normalized[i] = {};
          normalized[i][normal] = stats[i][versions[0]];
        } else {
          normalized[i] = stats[i];
        }
      }
      return normalized;
    }
    function normalizeUsageData(usageData, data) {
      for (var browser in usageData) {
        var browserUsage = usageData[browser];
        if ("0" in browserUsage) {
          var versions = data[browser].versions;
          browserUsage[versions[versions.length - 1]] = browserUsage[0];
          delete browserUsage[0];
        }
      }
    }
    module.exports = {
      loadQueries: function loadQueries(ctx, name) {
        if (!ctx.dangerousExtend && !process.env.BROWSERSLIST_DANGEROUS_EXTEND) {
          checkExtend(name);
        }
        var queries = __require(__require.resolve(name, { paths: [".", ctx.path] }));
        if (typeof queries === "object" && queries !== null && queries.__esModule) {
          queries = queries.default;
        }
        if (queries) {
          if (Array.isArray(queries)) {
            return queries;
          } else if (typeof queries === "object") {
            if (!queries.defaults) queries.defaults = [];
            return pickEnv(queries, ctx, name);
          }
        }
        throw new BrowserslistError(
          "`" + name + "` config exports not an array of queries or an object of envs"
        );
      },
      loadStat: function loadStat(ctx, name, data) {
        if (!ctx.dangerousExtend && !process.env.BROWSERSLIST_DANGEROUS_EXTEND) {
          checkExtend(name);
        }
        var stats = __require(__require.resolve(
          path3.join(name, "browserslist-stats.json"),
          { paths: ["."] }
        ));
        return normalizeStats(data, stats);
      },
      getStat: function getStat(opts, data) {
        var stats;
        if (opts.stats) {
          stats = opts.stats;
        } else if (process.env.BROWSERSLIST_STATS) {
          stats = process.env.BROWSERSLIST_STATS;
        } else if (opts.path && path3.resolve && fs2.existsSync) {
          stats = eachParent(
            opts.path,
            function(dir) {
              var file = path3.join(dir, "browserslist-stats.json");
              return isFile(file) ? file : void 0;
            },
            statCache
          );
        }
        if (typeof stats === "string") {
          try {
            stats = JSON.parse(fs2.readFileSync(stats));
          } catch (e) {
            throw new BrowserslistError("Can't read " + stats);
          }
        }
        return normalizeStats(data, stats);
      },
      loadConfig: function loadConfig(opts) {
        if (process.env.BROWSERSLIST) {
          return process.env.BROWSERSLIST;
        } else if (opts.config || process.env.BROWSERSLIST_CONFIG) {
          var file = opts.config || process.env.BROWSERSLIST_CONFIG;
          return pickEnv(parsePackageOrReadConfig(file), opts);
        } else if (opts.path) {
          return pickEnv(module.exports.findConfig(opts.path), opts);
        } else {
          return void 0;
        }
      },
      loadCountry: function loadCountry(usage, country, data) {
        var code = country.replace(/[^\w-]/g, "");
        if (!usage[code]) {
          var compressed;
          try {
            compressed = __require("caniuse-lite/data/regions/" + code + ".js");
          } catch (e) {
            throw new BrowserslistError("Unknown region name `" + code + "`.");
          }
          var usageData = region(compressed);
          normalizeUsageData(usageData, data);
          usage[country] = {};
          for (var i in usageData) {
            for (var j in usageData[i]) {
              usage[country][i + " " + j] = usageData[i][j];
            }
          }
        }
      },
      loadFeature: function loadFeature(features, name) {
        name = name.replace(/[^\w-]/g, "");
        if (features[name]) return;
        var compressed;
        try {
          compressed = __require("caniuse-lite/data/features/" + name + ".js");
        } catch (e) {
          throw new BrowserslistError("Unknown feature name `" + name + "`.");
        }
        var stats = feature(compressed).stats;
        features[name] = {};
        for (var i in stats) {
          features[name][i] = {};
          for (var j in stats[i]) {
            features[name][i][j] = stats[i][j];
          }
        }
      },
      parseConfig: function parseConfig(string) {
        var result = { defaults: [] };
        var sections = ["defaults"];
        string.toString().replace(/#[^\n]*/g, "").split(/\n|,/).map(function(line) {
          return line.trim();
        }).filter(function(line) {
          return line !== "";
        }).forEach(function(line) {
          if (IS_SECTION.test(line)) {
            sections = line.match(IS_SECTION)[1].trim().split(" ");
            sections.forEach(function(section) {
              if (result[section]) {
                throw new BrowserslistError(
                  "Duplicate section " + section + " in Browserslist config"
                );
              }
              result[section] = [];
            });
          } else {
            sections.forEach(function(section) {
              result[section].push(line);
            });
          }
        });
        return result;
      },
      readConfig: function readConfig(file) {
        if (!isFile(file)) {
          throw new BrowserslistError("Can't read " + file + " config");
        }
        return module.exports.parseConfig(fs2.readFileSync(file));
      },
      findConfigFile: function findConfigFile(from) {
        return eachParent(
          from,
          function(dir) {
            var config2 = path3.join(dir, "browserslist");
            var pkg = path3.join(dir, "package.json");
            var rc = path3.join(dir, ".browserslistrc");
            var pkgBrowserslist;
            if (isFile(pkg)) {
              try {
                pkgBrowserslist = parsePackage(pkg);
              } catch (e) {
                if (e.name === "BrowserslistError") throw e;
                console.warn(
                  "[Browserslist] Could not parse " + pkg + ". Ignoring it."
                );
              }
            }
            if (isFile(config2) && pkgBrowserslist) {
              throw new BrowserslistError(
                dir + " contains both browserslist and package.json with browsers"
              );
            } else if (isFile(rc) && pkgBrowserslist) {
              throw new BrowserslistError(
                dir + " contains both .browserslistrc and package.json with browsers"
              );
            } else if (isFile(config2) && isFile(rc)) {
              throw new BrowserslistError(
                dir + " contains both .browserslistrc and browserslist"
              );
            } else if (isFile(config2)) {
              return config2;
            } else if (isFile(rc)) {
              return rc;
            } else if (pkgBrowserslist) {
              return pkg;
            }
          },
          configPathCache
        );
      },
      findConfig: function findConfig(from) {
        var configFile = this.findConfigFile(from);
        return configFile ? parsePackageOrReadConfig(configFile) : void 0;
      },
      clearCaches: function clearCaches() {
        dataTimeChecked = false;
        statCache = {};
        configPathCache = {};
        parseConfigCache = {};
        this.cache = {};
      },
      oldDataWarning: function oldDataWarning(agentsObj) {
        if (dataTimeChecked) return;
        dataTimeChecked = true;
        if (process.env.BROWSERSLIST_IGNORE_OLD_DATA) return;
        var latest = latestReleaseTime(agentsObj);
        var monthsPassed = getMonthsPassed(latest);
        if (latest !== 0 && monthsPassed >= 6) {
          var months = monthsPassed + " " + (monthsPassed > 1 ? "months" : "month");
          console.warn(
            "Browserslist: browsers data (caniuse-lite) is " + months + " old. Please run:\n  npx update-browserslist-db@latest\n  Why you should do it regularly: https://github.com/browserslist/update-db#readme"
          );
        }
      },
      currentNode: function currentNode() {
        return "node " + process.versions.node;
      },
      env: process.env
    };
  }
});

// node_modules/browserslist/parse.js
var require_parse = __commonJS({
  "node_modules/browserslist/parse.js"(exports, module) {
    var AND_REGEXP = /^\s+and\s+(.*)/i;
    var OR_REGEXP = /^(?:,\s*|\s+or\s+)(.*)/i;
    function flatten(array) {
      if (!Array.isArray(array)) return [array];
      return array.reduce(function(a, b) {
        return a.concat(flatten(b));
      }, []);
    }
    function find(string, predicate) {
      for (var max = string.length, n = 1; n <= max; n++) {
        var parsed = string.substr(-n, n);
        if (predicate(parsed, n, max)) {
          return string.slice(0, -n);
        }
      }
      return "";
    }
    function matchQuery(all, query) {
      var node = { query };
      if (query.indexOf("not ") === 0) {
        node.not = true;
        query = query.slice(4);
      }
      for (var name in all) {
        var type = all[name];
        var match = query.match(type.regexp);
        if (match) {
          node.type = name;
          for (var i = 0; i < type.matches.length; i++) {
            node[type.matches[i]] = match[i + 1];
          }
          return node;
        }
      }
      node.type = "unknown";
      return node;
    }
    function matchBlock(all, string, qs) {
      var node;
      return find(string, function(parsed, n, max) {
        if (AND_REGEXP.test(parsed)) {
          node = matchQuery(all, parsed.match(AND_REGEXP)[1]);
          node.compose = "and";
          qs.unshift(node);
          return true;
        } else if (OR_REGEXP.test(parsed)) {
          node = matchQuery(all, parsed.match(OR_REGEXP)[1]);
          node.compose = "or";
          qs.unshift(node);
          return true;
        } else if (n === max) {
          node = matchQuery(all, parsed.trim());
          node.compose = "or";
          qs.unshift(node);
          return true;
        }
        return false;
      });
    }
    module.exports = function parse(all, queries) {
      if (!Array.isArray(queries)) queries = [queries];
      return flatten(
        queries.map(function(block) {
          var qs = [];
          do {
            block = matchBlock(all, block, qs);
          } while (block);
          return qs;
        })
      );
    };
  }
});

// node_modules/browserslist/index.js
var require_browserslist = __commonJS({
  "node_modules/browserslist/index.js"(exports, module) {
    var jsReleases = require_envs();
    var agents = require_agents2().agents;
    var e2c = require_versions();
    var jsEOL = require_release_schedule();
    var path3 = __require("path");
    var BrowserslistError = require_error2();
    var env2 = require_node();
    var parseWithoutCache = require_parse();
    var YEAR = 365.259641 * 24 * 60 * 60 * 1e3;
    var ANDROID_EVERGREEN_FIRST = "37";
    var OP_MOB_BLINK_FIRST = 14;
    function isVersionsMatch(versionA, versionB) {
      return (versionA + ".").indexOf(versionB + ".") === 0;
    }
    function isEolReleased(name) {
      var version = name.slice(1);
      return browserslist.nodeVersions.some(function(i) {
        return isVersionsMatch(i, version);
      });
    }
    function normalize(versions) {
      return versions.filter(function(version) {
        return typeof version === "string";
      });
    }
    function normalizeElectron(version) {
      var versionToUse = version;
      if (version.split(".").length === 3) {
        versionToUse = version.split(".").slice(0, -1).join(".");
      }
      return versionToUse;
    }
    function nameMapper(name) {
      return function mapName(version) {
        return name + " " + version;
      };
    }
    function getMajor(version) {
      return parseInt(version.split(".")[0]);
    }
    function getMajorVersions(released, number) {
      if (released.length === 0) return [];
      var majorVersions = uniq(released.map(getMajor));
      var minimum = majorVersions[majorVersions.length - number];
      if (!minimum) {
        return released;
      }
      var selected = [];
      for (var i = released.length - 1; i >= 0; i--) {
        if (minimum > getMajor(released[i])) break;
        selected.unshift(released[i]);
      }
      return selected;
    }
    function uniq(array) {
      var filtered = [];
      for (var i = 0; i < array.length; i++) {
        if (filtered.indexOf(array[i]) === -1) filtered.push(array[i]);
      }
      return filtered;
    }
    function fillUsage(result, name, data) {
      for (var i in data) {
        result[name + " " + i] = data[i];
      }
    }
    function generateFilter(sign, version) {
      version = parseFloat(version);
      if (sign === ">") {
        return function(v) {
          return parseLatestFloat(v) > version;
        };
      } else if (sign === ">=") {
        return function(v) {
          return parseLatestFloat(v) >= version;
        };
      } else if (sign === "<") {
        return function(v) {
          return parseFloat(v) < version;
        };
      } else {
        return function(v) {
          return parseFloat(v) <= version;
        };
      }
      function parseLatestFloat(v) {
        return parseFloat(v.split("-")[1] || v);
      }
    }
    function generateSemverFilter(sign, version) {
      version = version.split(".").map(parseSimpleInt);
      version[1] = version[1] || 0;
      version[2] = version[2] || 0;
      if (sign === ">") {
        return function(v) {
          v = v.split(".").map(parseSimpleInt);
          return compareSemver(v, version) > 0;
        };
      } else if (sign === ">=") {
        return function(v) {
          v = v.split(".").map(parseSimpleInt);
          return compareSemver(v, version) >= 0;
        };
      } else if (sign === "<") {
        return function(v) {
          v = v.split(".").map(parseSimpleInt);
          return compareSemver(version, v) > 0;
        };
      } else {
        return function(v) {
          v = v.split(".").map(parseSimpleInt);
          return compareSemver(version, v) >= 0;
        };
      }
    }
    function parseSimpleInt(x) {
      return parseInt(x);
    }
    function compare(a, b) {
      if (a < b) return -1;
      if (a > b) return 1;
      return 0;
    }
    function compareSemver(a, b) {
      return compare(parseInt(a[0]), parseInt(b[0])) || compare(parseInt(a[1] || "0"), parseInt(b[1] || "0")) || compare(parseInt(a[2] || "0"), parseInt(b[2] || "0"));
    }
    function semverFilterLoose(operator, range) {
      range = range.split(".").map(parseSimpleInt);
      if (typeof range[1] === "undefined") {
        range[1] = "x";
      }
      switch (operator) {
        case "<=":
          return function(version) {
            version = version.split(".").map(parseSimpleInt);
            return compareSemverLoose(version, range) <= 0;
          };
        case ">=":
        default:
          return function(version) {
            version = version.split(".").map(parseSimpleInt);
            return compareSemverLoose(version, range) >= 0;
          };
      }
    }
    function compareSemverLoose(version, range) {
      if (version[0] !== range[0]) {
        return version[0] < range[0] ? -1 : 1;
      }
      if (range[1] === "x") {
        return 0;
      }
      if (version[1] !== range[1]) {
        return version[1] < range[1] ? -1 : 1;
      }
      return 0;
    }
    function resolveVersion(data, version) {
      if (data.versions.indexOf(version) !== -1) {
        return version;
      } else if (browserslist.versionAliases[data.name][version]) {
        return browserslist.versionAliases[data.name][version];
      } else {
        return false;
      }
    }
    function normalizeVersion(data, version) {
      var resolved = resolveVersion(data, version);
      if (resolved) {
        return resolved;
      } else if (data.versions.length === 1) {
        return data.versions[0];
      } else {
        return false;
      }
    }
    function filterByYear(since, context2) {
      since = since / 1e3;
      return Object.keys(agents).reduce(function(selected, name) {
        var data = byName(name, context2);
        if (!data) return selected;
        var versions = Object.keys(data.releaseDate).filter(function(v) {
          var date = data.releaseDate[v];
          return date !== null && date >= since;
        });
        return selected.concat(versions.map(nameMapper(data.name)));
      }, []);
    }
    function cloneData(data) {
      return {
        name: data.name,
        versions: data.versions,
        released: data.released,
        releaseDate: data.releaseDate
      };
    }
    function byName(name, context2) {
      name = name.toLowerCase();
      name = browserslist.aliases[name] || name;
      if (context2.mobileToDesktop && browserslist.desktopNames[name]) {
        var desktop = browserslist.data[browserslist.desktopNames[name]];
        if (name === "android") {
          return normalizeAndroidData(cloneData(browserslist.data[name]), desktop);
        } else {
          var cloned = cloneData(desktop);
          cloned.name = name;
          return cloned;
        }
      }
      return browserslist.data[name];
    }
    function normalizeAndroidVersions(androidVersions, chromeVersions) {
      var iFirstEvergreen = chromeVersions.indexOf(ANDROID_EVERGREEN_FIRST);
      return androidVersions.filter(function(version) {
        return /^(?:[2-4]\.|[34]$)/.test(version);
      }).concat(chromeVersions.slice(iFirstEvergreen));
    }
    function copyObject(obj) {
      var copy = {};
      for (var key in obj) {
        copy[key] = obj[key];
      }
      return copy;
    }
    function normalizeAndroidData(android, chrome) {
      android.released = normalizeAndroidVersions(android.released, chrome.released);
      android.versions = normalizeAndroidVersions(android.versions, chrome.versions);
      android.releaseDate = copyObject(android.releaseDate);
      android.released.forEach(function(v) {
        if (android.releaseDate[v] === void 0) {
          android.releaseDate[v] = chrome.releaseDate[v];
        }
      });
      return android;
    }
    function checkName(name, context2) {
      var data = byName(name, context2);
      if (!data) throw new BrowserslistError("Unknown browser " + name);
      return data;
    }
    function unknownQuery(query) {
      return new BrowserslistError(
        "Unknown browser query `" + query + "`. Maybe you are using old Browserslist or made typo in query."
      );
    }
    function filterJumps(list, name, nVersions, context2) {
      var jump = 1;
      switch (name) {
        case "android":
          if (context2.mobileToDesktop) return list;
          var released = browserslist.data.chrome.released;
          jump = released.length - released.indexOf(ANDROID_EVERGREEN_FIRST);
          break;
        case "op_mob":
          var latest = browserslist.data.op_mob.released.slice(-1)[0];
          jump = getMajor(latest) - OP_MOB_BLINK_FIRST + 1;
          break;
        default:
          return list;
      }
      if (nVersions <= jump) {
        return list.slice(-1);
      }
      return list.slice(jump - 1 - nVersions);
    }
    function isSupported(flags, withPartial) {
      return typeof flags === "string" && (flags.indexOf("y") >= 0 || withPartial && flags.indexOf("a") >= 0);
    }
    function resolve(queries, context2) {
      return parseQueries(queries).reduce(function(result, node, index) {
        if (node.not && index === 0) {
          throw new BrowserslistError(
            "Write any browsers query (for instance, `defaults`) before `" + node.query + "`"
          );
        }
        var type = QUERIES[node.type];
        var array = type.select.call(browserslist, context2, node).map(function(j) {
          var parts = j.split(" ");
          if (parts[1] === "0") {
            return parts[0] + " " + byName(parts[0], context2).versions[0];
          } else {
            return j;
          }
        });
        if (node.compose === "and") {
          if (node.not) {
            return result.filter(function(j) {
              return array.indexOf(j) === -1;
            });
          } else {
            return result.filter(function(j) {
              return array.indexOf(j) !== -1;
            });
          }
        } else {
          if (node.not) {
            var filter = {};
            array.forEach(function(j) {
              filter[j] = true;
            });
            return result.filter(function(j) {
              return !filter[j];
            });
          }
          return result.concat(array);
        }
      }, []);
    }
    function prepareOpts(opts) {
      if (typeof opts === "undefined") opts = {};
      if (typeof opts.path === "undefined") {
        opts.path = path3.resolve ? path3.resolve(".") : ".";
      }
      return opts;
    }
    function prepareQueries(queries, opts) {
      if (typeof queries === "undefined" || queries === null) {
        var config2 = browserslist.loadConfig(opts);
        if (config2) {
          queries = config2;
        } else {
          queries = browserslist.defaults;
        }
      }
      return queries;
    }
    function checkQueries(queries) {
      if (!(typeof queries === "string" || Array.isArray(queries))) {
        throw new BrowserslistError(
          "Browser queries must be an array or string. Got " + typeof queries + "."
        );
      }
    }
    var cache = {};
    var parseCache = {};
    function browserslist(queries, opts) {
      opts = prepareOpts(opts);
      queries = prepareQueries(queries, opts);
      checkQueries(queries);
      var needsPath = parseQueries(queries).some(function(node) {
        return QUERIES[node.type].needsPath;
      });
      var context2 = {
        ignoreUnknownVersions: opts.ignoreUnknownVersions,
        dangerousExtend: opts.dangerousExtend,
        mobileToDesktop: opts.mobileToDesktop,
        env: opts.env
      };
      if (needsPath) {
        context2.path = opts.path;
      }
      env2.oldDataWarning(browserslist.data);
      var stats = env2.getStat(opts, browserslist.data);
      if (stats) {
        context2.customUsage = {};
        for (var browser in stats) {
          fillUsage(context2.customUsage, browser, stats[browser]);
        }
      }
      var cacheKey = JSON.stringify([queries, context2]);
      if (cache[cacheKey]) return cache[cacheKey];
      var result = uniq(resolve(queries, context2)).sort(function(name1, name2) {
        name1 = name1.split(" ");
        name2 = name2.split(" ");
        if (name1[0] === name2[0]) {
          var version1 = name1[1].split("-")[0];
          var version2 = name2[1].split("-")[0];
          return compareSemver(version2.split("."), version1.split("."));
        } else {
          return compare(name1[0], name2[0]);
        }
      });
      if (!env2.env.BROWSERSLIST_DISABLE_CACHE) {
        cache[cacheKey] = result;
      }
      return result;
    }
    function parseQueries(queries) {
      var cacheKey = JSON.stringify(queries);
      if (cacheKey in parseCache) return parseCache[cacheKey];
      var result = parseWithoutCache(QUERIES, queries);
      if (!env2.env.BROWSERSLIST_DISABLE_CACHE) {
        parseCache[cacheKey] = result;
      }
      return result;
    }
    browserslist.parse = function(queries, opts) {
      opts = prepareOpts(opts);
      queries = prepareQueries(queries, opts);
      checkQueries(queries);
      return parseQueries(queries);
    };
    browserslist.cache = {};
    browserslist.data = {};
    browserslist.usage = {
      global: {},
      custom: null
    };
    browserslist.defaults = ["> 0.5%", "last 2 versions", "Firefox ESR", "not dead"];
    browserslist.aliases = {
      fx: "firefox",
      ff: "firefox",
      ios: "ios_saf",
      explorer: "ie",
      blackberry: "bb",
      explorermobile: "ie_mob",
      operamini: "op_mini",
      operamobile: "op_mob",
      chromeandroid: "and_chr",
      firefoxandroid: "and_ff",
      ucandroid: "and_uc",
      qqandroid: "and_qq"
    };
    browserslist.desktopNames = {
      and_chr: "chrome",
      and_ff: "firefox",
      ie_mob: "ie",
      android: "chrome"
      // has extra processing logic
    };
    browserslist.versionAliases = {};
    browserslist.clearCaches = env2.clearCaches;
    browserslist.parseConfig = env2.parseConfig;
    browserslist.readConfig = env2.readConfig;
    browserslist.findConfigFile = env2.findConfigFile;
    browserslist.findConfig = env2.findConfig;
    browserslist.loadConfig = env2.loadConfig;
    browserslist.coverage = function(browsers, stats) {
      var data;
      if (typeof stats === "undefined") {
        data = browserslist.usage.global;
      } else if (stats === "my stats") {
        var opts = {};
        opts.path = path3.resolve ? path3.resolve(".") : ".";
        var customStats = env2.getStat(opts);
        if (!customStats) {
          throw new BrowserslistError("Custom usage statistics was not provided");
        }
        data = {};
        for (var browser in customStats) {
          fillUsage(data, browser, customStats[browser]);
        }
      } else if (typeof stats === "string") {
        if (stats.length > 2) {
          stats = stats.toLowerCase();
        } else {
          stats = stats.toUpperCase();
        }
        env2.loadCountry(browserslist.usage, stats, browserslist.data);
        data = browserslist.usage[stats];
      } else {
        if ("dataByBrowser" in stats) {
          stats = stats.dataByBrowser;
        }
        data = {};
        for (var name in stats) {
          for (var version in stats[name]) {
            data[name + " " + version] = stats[name][version];
          }
        }
      }
      return browsers.reduce(function(all, i) {
        var usage = data[i];
        if (usage === void 0) {
          usage = data[i.replace(/ \S+$/, " 0")];
        }
        return all + (usage || 0);
      }, 0);
    };
    function nodeQuery(context2, node) {
      var matched = browserslist.nodeVersions.filter(function(i) {
        return isVersionsMatch(i, node.version);
      });
      if (matched.length === 0) {
        if (context2.ignoreUnknownVersions) {
          return [];
        } else {
          throw new BrowserslistError(
            "Unknown version " + node.version + " of Node.js"
          );
        }
      }
      return ["node " + matched[matched.length - 1]];
    }
    function sinceQuery(context2, node) {
      var year = parseInt(node.year);
      var month = parseInt(node.month || "01") - 1;
      var day = parseInt(node.day || "01");
      return filterByYear(Date.UTC(year, month, day, 0, 0, 0), context2);
    }
    function coverQuery(context2, node) {
      var coverage = parseFloat(node.coverage);
      var usage = browserslist.usage.global;
      if (node.place) {
        if (node.place.match(/^my\s+stats$/i)) {
          if (!context2.customUsage) {
            throw new BrowserslistError("Custom usage statistics was not provided");
          }
          usage = context2.customUsage;
        } else {
          var place;
          if (node.place.length === 2) {
            place = node.place.toUpperCase();
          } else {
            place = node.place.toLowerCase();
          }
          env2.loadCountry(browserslist.usage, place, browserslist.data);
          usage = browserslist.usage[place];
        }
      }
      var versions = Object.keys(usage).sort(function(a, b) {
        return usage[b] - usage[a];
      });
      var coveraged = 0;
      var result = [];
      var version;
      for (var i = 0; i < versions.length; i++) {
        version = versions[i];
        if (usage[version] === 0) break;
        coveraged += usage[version];
        result.push(version);
        if (coveraged >= coverage) break;
      }
      return result;
    }
    var QUERIES = {
      last_major_versions: {
        matches: ["versions"],
        regexp: /^last\s+(\d+)\s+major\s+versions?$/i,
        select: function(context2, node) {
          return Object.keys(agents).reduce(function(selected, name) {
            var data = byName(name, context2);
            if (!data) return selected;
            var list = getMajorVersions(data.released, node.versions);
            list = list.map(nameMapper(data.name));
            list = filterJumps(list, data.name, node.versions, context2);
            return selected.concat(list);
          }, []);
        }
      },
      last_versions: {
        matches: ["versions"],
        regexp: /^last\s+(\d+)\s+versions?$/i,
        select: function(context2, node) {
          return Object.keys(agents).reduce(function(selected, name) {
            var data = byName(name, context2);
            if (!data) return selected;
            var list = data.released.slice(-node.versions);
            list = list.map(nameMapper(data.name));
            list = filterJumps(list, data.name, node.versions, context2);
            return selected.concat(list);
          }, []);
        }
      },
      last_electron_major_versions: {
        matches: ["versions"],
        regexp: /^last\s+(\d+)\s+electron\s+major\s+versions?$/i,
        select: function(context2, node) {
          var validVersions = getMajorVersions(Object.keys(e2c), node.versions);
          return validVersions.map(function(i) {
            return "chrome " + e2c[i];
          });
        }
      },
      last_node_major_versions: {
        matches: ["versions"],
        regexp: /^last\s+(\d+)\s+node\s+major\s+versions?$/i,
        select: function(context2, node) {
          return getMajorVersions(browserslist.nodeVersions, node.versions).map(
            function(version) {
              return "node " + version;
            }
          );
        }
      },
      last_browser_major_versions: {
        matches: ["versions", "browser"],
        regexp: /^last\s+(\d+)\s+(\w+)\s+major\s+versions?$/i,
        select: function(context2, node) {
          var data = checkName(node.browser, context2);
          var validVersions = getMajorVersions(data.released, node.versions);
          var list = validVersions.map(nameMapper(data.name));
          list = filterJumps(list, data.name, node.versions, context2);
          return list;
        }
      },
      last_electron_versions: {
        matches: ["versions"],
        regexp: /^last\s+(\d+)\s+electron\s+versions?$/i,
        select: function(context2, node) {
          return Object.keys(e2c).slice(-node.versions).map(function(i) {
            return "chrome " + e2c[i];
          });
        }
      },
      last_node_versions: {
        matches: ["versions"],
        regexp: /^last\s+(\d+)\s+node\s+versions?$/i,
        select: function(context2, node) {
          return browserslist.nodeVersions.slice(-node.versions).map(function(version) {
            return "node " + version;
          });
        }
      },
      last_browser_versions: {
        matches: ["versions", "browser"],
        regexp: /^last\s+(\d+)\s+(\w+)\s+versions?$/i,
        select: function(context2, node) {
          var data = checkName(node.browser, context2);
          var list = data.released.slice(-node.versions).map(nameMapper(data.name));
          list = filterJumps(list, data.name, node.versions, context2);
          return list;
        }
      },
      unreleased_versions: {
        matches: [],
        regexp: /^unreleased\s+versions$/i,
        select: function(context2) {
          return Object.keys(agents).reduce(function(selected, name) {
            var data = byName(name, context2);
            if (!data) return selected;
            var list = data.versions.filter(function(v) {
              return data.released.indexOf(v) === -1;
            });
            list = list.map(nameMapper(data.name));
            return selected.concat(list);
          }, []);
        }
      },
      unreleased_electron_versions: {
        matches: [],
        regexp: /^unreleased\s+electron\s+versions?$/i,
        select: function() {
          return [];
        }
      },
      unreleased_browser_versions: {
        matches: ["browser"],
        regexp: /^unreleased\s+(\w+)\s+versions?$/i,
        select: function(context2, node) {
          var data = checkName(node.browser, context2);
          return data.versions.filter(function(v) {
            return data.released.indexOf(v) === -1;
          }).map(nameMapper(data.name));
        }
      },
      last_years: {
        matches: ["years"],
        regexp: /^last\s+(\d*.?\d+)\s+years?$/i,
        select: function(context2, node) {
          return filterByYear(Date.now() - YEAR * node.years, context2);
        }
      },
      since_y: {
        matches: ["year"],
        regexp: /^since (\d+)$/i,
        select: sinceQuery
      },
      since_y_m: {
        matches: ["year", "month"],
        regexp: /^since (\d+)-(\d+)$/i,
        select: sinceQuery
      },
      since_y_m_d: {
        matches: ["year", "month", "day"],
        regexp: /^since (\d+)-(\d+)-(\d+)$/i,
        select: sinceQuery
      },
      popularity: {
        matches: ["sign", "popularity"],
        regexp: /^(>=?|<=?)\s*(\d+|\d+\.\d+|\.\d+)%$/,
        select: function(context2, node) {
          var popularity = parseFloat(node.popularity);
          var usage = browserslist.usage.global;
          return Object.keys(usage).reduce(function(result, version) {
            if (node.sign === ">") {
              if (usage[version] > popularity) {
                result.push(version);
              }
            } else if (node.sign === "<") {
              if (usage[version] < popularity) {
                result.push(version);
              }
            } else if (node.sign === "<=") {
              if (usage[version] <= popularity) {
                result.push(version);
              }
            } else if (usage[version] >= popularity) {
              result.push(version);
            }
            return result;
          }, []);
        }
      },
      popularity_in_my_stats: {
        matches: ["sign", "popularity"],
        regexp: /^(>=?|<=?)\s*(\d+|\d+\.\d+|\.\d+)%\s+in\s+my\s+stats$/,
        select: function(context2, node) {
          var popularity = parseFloat(node.popularity);
          if (!context2.customUsage) {
            throw new BrowserslistError("Custom usage statistics was not provided");
          }
          var usage = context2.customUsage;
          return Object.keys(usage).reduce(function(result, version) {
            var percentage = usage[version];
            if (percentage == null) {
              return result;
            }
            if (node.sign === ">") {
              if (percentage > popularity) {
                result.push(version);
              }
            } else if (node.sign === "<") {
              if (percentage < popularity) {
                result.push(version);
              }
            } else if (node.sign === "<=") {
              if (percentage <= popularity) {
                result.push(version);
              }
            } else if (percentage >= popularity) {
              result.push(version);
            }
            return result;
          }, []);
        }
      },
      popularity_in_config_stats: {
        matches: ["sign", "popularity", "config"],
        regexp: /^(>=?|<=?)\s*(\d+|\d+\.\d+|\.\d+)%\s+in\s+(\S+)\s+stats$/,
        select: function(context2, node) {
          var popularity = parseFloat(node.popularity);
          var stats = env2.loadStat(context2, node.config, browserslist.data);
          if (stats) {
            context2.customUsage = {};
            for (var browser in stats) {
              fillUsage(context2.customUsage, browser, stats[browser]);
            }
          }
          if (!context2.customUsage) {
            throw new BrowserslistError("Custom usage statistics was not provided");
          }
          var usage = context2.customUsage;
          return Object.keys(usage).reduce(function(result, version) {
            var percentage = usage[version];
            if (percentage == null) {
              return result;
            }
            if (node.sign === ">") {
              if (percentage > popularity) {
                result.push(version);
              }
            } else if (node.sign === "<") {
              if (percentage < popularity) {
                result.push(version);
              }
            } else if (node.sign === "<=") {
              if (percentage <= popularity) {
                result.push(version);
              }
            } else if (percentage >= popularity) {
              result.push(version);
            }
            return result;
          }, []);
        }
      },
      popularity_in_place: {
        matches: ["sign", "popularity", "place"],
        regexp: /^(>=?|<=?)\s*(\d+|\d+\.\d+|\.\d+)%\s+in\s+((alt-)?\w\w)$/,
        select: function(context2, node) {
          var popularity = parseFloat(node.popularity);
          var place = node.place;
          if (place.length === 2) {
            place = place.toUpperCase();
          } else {
            place = place.toLowerCase();
          }
          env2.loadCountry(browserslist.usage, place, browserslist.data);
          var usage = browserslist.usage[place];
          return Object.keys(usage).reduce(function(result, version) {
            var percentage = usage[version];
            if (percentage == null) {
              return result;
            }
            if (node.sign === ">") {
              if (percentage > popularity) {
                result.push(version);
              }
            } else if (node.sign === "<") {
              if (percentage < popularity) {
                result.push(version);
              }
            } else if (node.sign === "<=") {
              if (percentage <= popularity) {
                result.push(version);
              }
            } else if (percentage >= popularity) {
              result.push(version);
            }
            return result;
          }, []);
        }
      },
      cover: {
        matches: ["coverage"],
        regexp: /^cover\s+(\d+|\d+\.\d+|\.\d+)%$/i,
        select: coverQuery
      },
      cover_in: {
        matches: ["coverage", "place"],
        regexp: /^cover\s+(\d+|\d+\.\d+|\.\d+)%\s+in\s+(my\s+stats|(alt-)?\w\w)$/i,
        select: coverQuery
      },
      supports: {
        matches: ["supportType", "feature"],
        regexp: /^(?:(fully|partially)\s+)?supports\s+([\w-]+)$/,
        select: function(context2, node) {
          env2.loadFeature(browserslist.cache, node.feature);
          var withPartial = node.supportType !== "fully";
          var features = browserslist.cache[node.feature];
          var result = [];
          for (var name in features) {
            var data = byName(name, context2);
            var iMax = data.released.length - 1;
            while (iMax >= 0) {
              if (data.released[iMax] in features[name]) break;
              iMax--;
            }
            var checkDesktop = context2.mobileToDesktop && name in browserslist.desktopNames && isSupported(features[name][data.released[iMax]], withPartial);
            data.versions.forEach(function(version) {
              var flags = features[name][version];
              if (flags === void 0 && checkDesktop) {
                flags = features[browserslist.desktopNames[name]][version];
              }
              if (isSupported(flags, withPartial)) {
                result.push(name + " " + version);
              }
            });
          }
          return result;
        }
      },
      electron_range: {
        matches: ["from", "to"],
        regexp: /^electron\s+([\d.]+)\s*-\s*([\d.]+)$/i,
        select: function(context2, node) {
          var fromToUse = normalizeElectron(node.from);
          var toToUse = normalizeElectron(node.to);
          var from = parseFloat(node.from);
          var to = parseFloat(node.to);
          if (!e2c[fromToUse]) {
            throw new BrowserslistError("Unknown version " + from + " of electron");
          }
          if (!e2c[toToUse]) {
            throw new BrowserslistError("Unknown version " + to + " of electron");
          }
          return Object.keys(e2c).filter(function(i) {
            var parsed = parseFloat(i);
            return parsed >= from && parsed <= to;
          }).map(function(i) {
            return "chrome " + e2c[i];
          });
        }
      },
      node_range: {
        matches: ["from", "to"],
        regexp: /^node\s+([\d.]+)\s*-\s*([\d.]+)$/i,
        select: function(context2, node) {
          return browserslist.nodeVersions.filter(semverFilterLoose(">=", node.from)).filter(semverFilterLoose("<=", node.to)).map(function(v) {
            return "node " + v;
          });
        }
      },
      browser_range: {
        matches: ["browser", "from", "to"],
        regexp: /^(\w+)\s+([\d.]+)\s*-\s*([\d.]+)$/i,
        select: function(context2, node) {
          var data = checkName(node.browser, context2);
          var from = parseFloat(normalizeVersion(data, node.from) || node.from);
          var to = parseFloat(normalizeVersion(data, node.to) || node.to);
          function filter(v) {
            var parsed = parseFloat(v);
            return parsed >= from && parsed <= to;
          }
          return data.released.filter(filter).map(nameMapper(data.name));
        }
      },
      electron_ray: {
        matches: ["sign", "version"],
        regexp: /^electron\s*(>=?|<=?)\s*([\d.]+)$/i,
        select: function(context2, node) {
          var versionToUse = normalizeElectron(node.version);
          return Object.keys(e2c).filter(generateFilter(node.sign, versionToUse)).map(function(i) {
            return "chrome " + e2c[i];
          });
        }
      },
      node_ray: {
        matches: ["sign", "version"],
        regexp: /^node\s*(>=?|<=?)\s*([\d.]+)$/i,
        select: function(context2, node) {
          return browserslist.nodeVersions.filter(generateSemverFilter(node.sign, node.version)).map(function(v) {
            return "node " + v;
          });
        }
      },
      browser_ray: {
        matches: ["browser", "sign", "version"],
        regexp: /^(\w+)\s*(>=?|<=?)\s*([\d.]+)$/,
        select: function(context2, node) {
          var version = node.version;
          var data = checkName(node.browser, context2);
          var alias = browserslist.versionAliases[data.name][version];
          if (alias) version = alias;
          return data.released.filter(generateFilter(node.sign, version)).map(function(v) {
            return data.name + " " + v;
          });
        }
      },
      firefox_esr: {
        matches: [],
        regexp: /^(firefox|ff|fx)\s+esr$/i,
        select: function() {
          return ["firefox 128"];
        }
      },
      opera_mini_all: {
        matches: [],
        regexp: /(operamini|op_mini)\s+all/i,
        select: function() {
          return ["op_mini all"];
        }
      },
      electron_version: {
        matches: ["version"],
        regexp: /^electron\s+([\d.]+)$/i,
        select: function(context2, node) {
          var versionToUse = normalizeElectron(node.version);
          var chrome = e2c[versionToUse];
          if (!chrome) {
            throw new BrowserslistError(
              "Unknown version " + node.version + " of electron"
            );
          }
          return ["chrome " + chrome];
        }
      },
      node_major_version: {
        matches: ["version"],
        regexp: /^node\s+(\d+)$/i,
        select: nodeQuery
      },
      node_minor_version: {
        matches: ["version"],
        regexp: /^node\s+(\d+\.\d+)$/i,
        select: nodeQuery
      },
      node_patch_version: {
        matches: ["version"],
        regexp: /^node\s+(\d+\.\d+\.\d+)$/i,
        select: nodeQuery
      },
      current_node: {
        matches: [],
        regexp: /^current\s+node$/i,
        select: function(context2) {
          return [env2.currentNode(resolve, context2)];
        }
      },
      maintained_node: {
        matches: [],
        regexp: /^maintained\s+node\s+versions$/i,
        select: function(context2) {
          var now = Date.now();
          var queries = Object.keys(jsEOL).filter(function(key) {
            return now < Date.parse(jsEOL[key].end) && now > Date.parse(jsEOL[key].start) && isEolReleased(key);
          }).map(function(key) {
            return "node " + key.slice(1);
          });
          return resolve(queries, context2);
        }
      },
      phantomjs_1_9: {
        matches: [],
        regexp: /^phantomjs\s+1.9$/i,
        select: function() {
          return ["safari 5"];
        }
      },
      phantomjs_2_1: {
        matches: [],
        regexp: /^phantomjs\s+2.1$/i,
        select: function() {
          return ["safari 6"];
        }
      },
      browser_version: {
        matches: ["browser", "version"],
        regexp: /^(\w+)\s+(tp|[\d.]+)$/i,
        select: function(context2, node) {
          var version = node.version;
          if (/^tp$/i.test(version)) version = "TP";
          var data = checkName(node.browser, context2);
          var alias = normalizeVersion(data, version);
          if (alias) {
            version = alias;
          } else {
            if (version.indexOf(".") === -1) {
              alias = version + ".0";
            } else {
              alias = version.replace(/\.0$/, "");
            }
            alias = normalizeVersion(data, alias);
            if (alias) {
              version = alias;
            } else if (context2.ignoreUnknownVersions) {
              return [];
            } else {
              throw new BrowserslistError(
                "Unknown version " + version + " of " + node.browser
              );
            }
          }
          return [data.name + " " + version];
        }
      },
      browserslist_config: {
        matches: [],
        regexp: /^browserslist config$/i,
        needsPath: true,
        select: function(context2) {
          return browserslist(void 0, context2);
        }
      },
      extends: {
        matches: ["config"],
        regexp: /^extends (.+)$/i,
        needsPath: true,
        select: function(context2, node) {
          return resolve(env2.loadQueries(context2, node.config), context2);
        }
      },
      defaults: {
        matches: [],
        regexp: /^defaults$/i,
        select: function(context2) {
          return resolve(browserslist.defaults, context2);
        }
      },
      dead: {
        matches: [],
        regexp: /^dead$/i,
        select: function(context2) {
          var dead = [
            "Baidu >= 0",
            "ie <= 11",
            "ie_mob <= 11",
            "bb <= 10",
            "op_mob <= 12.1",
            "samsung 4"
          ];
          return resolve(dead, context2);
        }
      },
      unknown: {
        matches: [],
        regexp: /^(\w+)$/i,
        select: function(context2, node) {
          if (byName(node.query, context2)) {
            throw new BrowserslistError(
              "Specify versions in Browserslist query for browser " + node.query
            );
          } else {
            throw unknownQuery(node.query);
          }
        }
      }
    };
    (function() {
      for (var name in agents) {
        var browser = agents[name];
        browserslist.data[name] = {
          name,
          versions: normalize(agents[name].versions),
          released: normalize(agents[name].versions.slice(0, -3)),
          releaseDate: agents[name].release_date
        };
        fillUsage(browserslist.usage.global, name, browser.usage_global);
        browserslist.versionAliases[name] = {};
        for (var i = 0; i < browser.versions.length; i++) {
          var full = browser.versions[i];
          if (!full) continue;
          if (full.indexOf("-") !== -1) {
            var interval = full.split("-");
            for (var j = 0; j < interval.length; j++) {
              browserslist.versionAliases[name][interval[j]] = full;
            }
          }
        }
      }
      browserslist.nodeVersions = jsReleases.map(function(release) {
        return release.version;
      });
    })();
    module.exports = browserslist;
  }
});

// node_modules/header-generator/utils.js
var require_utils4 = __commonJS({
  "node_modules/header-generator/utils.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.shuffleArray = exports.getBrowsersFromQuery = exports.getBrowser = exports.getUserAgent = void 0;
    var tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
    var browserslist_1 = tslib_1.__importDefault(require_browserslist());
    var constants_1 = require_constants2();
    var getUserAgent = (headers2) => {
      for (const [header, value] of Object.entries(headers2)) {
        if (header.toLowerCase() === "user-agent") {
          return value;
        }
      }
      return void 0;
    };
    exports.getUserAgent = getUserAgent;
    var getBrowser = (userAgent) => {
      if (!userAgent) {
        return void 0;
      }
      let browser;
      if (userAgent.includes("Firefox")) {
        browser = "firefox";
      } else if (userAgent.includes("Chrome")) {
        browser = "chrome";
      } else {
        browser = "safari";
      }
      return browser;
    };
    exports.getBrowser = getBrowser;
    var getBrowsersWithVersions = (browserList) => {
      const browsersWithVersions = {};
      for (const browserDefinition of browserList) {
        const [browserSplit, versionString] = browserDefinition.split(" ");
        const browser = browserSplit;
        const version = parseInt(versionString, 10);
        if (!constants_1.SUPPORTED_BROWSERS.includes(browser)) {
          continue;
        }
        if (browsersWithVersions[browser]) {
          browsersWithVersions[browser].push(version);
        } else {
          browsersWithVersions[browser] = [version];
        }
      }
      return browsersWithVersions;
    };
    var getOptimizedVersionDistribution = (browsersWithVersions) => {
      const finalOptimizedBrowsers = [];
      Object.entries(browsersWithVersions).forEach(([browser, versions]) => {
        const sortedVersions = versions.sort((a, b) => a - b);
        let lowestVersionSoFar = sortedVersions[0];
        sortedVersions.forEach((version, index) => {
          const nextVersion = sortedVersions[index + 1];
          const isLast = index === sortedVersions.length - 1;
          const isNextVersionGap = nextVersion - version > 1;
          if (isNextVersionGap || isLast) {
            finalOptimizedBrowsers.push({
              name: browser,
              minVersion: lowestVersionSoFar,
              maxVersion: version
            });
            lowestVersionSoFar = nextVersion;
          }
        });
      });
      return finalOptimizedBrowsers;
    };
    var getBrowsersFromQuery = (browserListQuery) => {
      const browserList = (0, browserslist_1.default)(browserListQuery);
      const browsersWithVersions = getBrowsersWithVersions(browserList);
      return getOptimizedVersionDistribution(browsersWithVersions);
    };
    exports.getBrowsersFromQuery = getBrowsersFromQuery;
    var shuffleArray = (array) => {
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
      }
      return array;
    };
    exports.shuffleArray = shuffleArray;
  }
});

// node_modules/header-generator/header-generator.js
var require_header_generator = __commonJS({
  "node_modules/header-generator/header-generator.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.HeaderGenerator = exports.headerGeneratorOptionsShape = void 0;
    var tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
    var fs_1 = __require("fs");
    var generative_bayesian_network_1 = require_generative_bayesian_network();
    var ow_1 = tslib_1.__importDefault(require_dist2());
    var constants_1 = require_constants2();
    var utils_1 = require_utils4();
    var browserSpecificationShape = {
      name: ow_1.default.string,
      minVersion: ow_1.default.optional.number,
      maxVersion: ow_1.default.optional.number,
      httpVersion: ow_1.default.optional.string
    };
    exports.headerGeneratorOptionsShape = {
      browsers: ow_1.default.optional.array.ofType(ow_1.default.any(ow_1.default.object.exactShape(browserSpecificationShape), ow_1.default.string.oneOf(constants_1.SUPPORTED_BROWSERS))),
      operatingSystems: ow_1.default.optional.array.ofType(ow_1.default.string.oneOf(constants_1.SUPPORTED_OPERATING_SYSTEMS)),
      devices: ow_1.default.optional.array.ofType(ow_1.default.string.oneOf(constants_1.SUPPORTED_DEVICES)),
      locales: ow_1.default.optional.array.ofType(ow_1.default.string),
      httpVersion: ow_1.default.optional.string.oneOf(constants_1.SUPPORTED_HTTP_VERSIONS),
      browserListQuery: ow_1.default.optional.string,
      strict: ow_1.default.optional.boolean
    };
    var HeaderGenerator = class {
      /**
       * @param options Default header generation options used - unless overridden.
       */
      constructor(options = {}) {
        Object.defineProperty(this, "globalOptions", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: void 0
        });
        Object.defineProperty(this, "browserListQuery", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: void 0
        });
        Object.defineProperty(this, "inputGeneratorNetwork", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: void 0
        });
        Object.defineProperty(this, "headerGeneratorNetwork", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: void 0
        });
        Object.defineProperty(this, "uniqueBrowsers", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: void 0
        });
        Object.defineProperty(this, "headersOrder", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: void 0
        });
        Object.defineProperty(this, "relaxationOrder", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: [
            "locales",
            "devices",
            "operatingSystems",
            "browsers",
            "browserListQuery"
          ]
        });
        (0, ow_1.default)(options, "HeaderGeneratorOptions", ow_1.default.object.partialShape(exports.headerGeneratorOptionsShape));
        const { browsers = constants_1.SUPPORTED_BROWSERS, operatingSystems = constants_1.SUPPORTED_OPERATING_SYSTEMS, devices = ["desktop"], locales = ["en-US"], httpVersion = "2", browserListQuery = "", strict = false } = options;
        this.globalOptions = {
          browsers: this._prepareBrowsersConfig(browsers, browserListQuery, httpVersion),
          operatingSystems,
          devices,
          locales,
          httpVersion,
          browserListQuery,
          strict
        };
        this.uniqueBrowsers = [];
        this.headersOrder = JSON.parse((0, fs_1.readFileSync)(`${__dirname}/data_files/headers-order.json`).toString());
        const uniqueBrowserStrings = JSON.parse((0, fs_1.readFileSync)(`${__dirname}/data_files/browser-helper-file.json`, "utf8").toString());
        for (const browserString of uniqueBrowserStrings) {
          if (browserString !== constants_1.MISSING_VALUE_DATASET_TOKEN) {
            this.uniqueBrowsers.push(this.prepareHttpBrowserObject(browserString));
          }
        }
        this.inputGeneratorNetwork = new generative_bayesian_network_1.BayesianNetwork({
          path: `${__dirname}/data_files/input-network-definition.zip`
        });
        this.headerGeneratorNetwork = new generative_bayesian_network_1.BayesianNetwork({
          path: `${__dirname}/data_files/header-network-definition.zip`
        });
      }
      /**
       * Generates a single set of ordered headers using a combination of the default options specified in the constructor
       * and their possible overrides provided here.
       * @param options Specifies options that should be overridden for this one call.
       * @param requestDependentHeaders Specifies known values of headers dependent on the particular request.
       */
      getHeaders(options = {}, requestDependentHeaders = {}, userAgentValues) {
        (0, ow_1.default)(options, "HeaderGeneratorOptions", ow_1.default.object.partialShape(exports.headerGeneratorOptionsShape));
        for (const [key, value] of Object.entries(options)) {
          if (!value) {
            delete options[key];
          }
        }
        const headerOptions = { ...this.globalOptions, ...options };
        const possibleAttributeValues = this._getPossibleAttributeValues(headerOptions);
        const [http1Constraints, http2Constraints] = userAgentValues ? [
          generative_bayesian_network_1.utils.getConstraintClosure(this.headerGeneratorNetwork, {
            "User-Agent": userAgentValues
          }),
          generative_bayesian_network_1.utils.getConstraintClosure(this.headerGeneratorNetwork, {
            "user-agent": userAgentValues
          })
        ] : [null, null];
        const inputConstraints = Object.entries(possibleAttributeValues).reduce((acc, [key, value]) => {
          if (key === "*BROWSER_HTTP") {
            acc[key] = value.filter((x) => {
              const [browserName, httpVersion] = x.split("|");
              let httpValues = http2Constraints;
              if (httpVersion === "1" || !http2Constraints || Object.keys(http2Constraints).length === 0) {
                httpValues = http1Constraints;
              }
              return httpValues?.["*BROWSER"].includes(browserName) ?? true;
            });
            return acc;
          }
          acc[key] = value.filter((x) => (http1Constraints?.[key]?.includes(x) || http2Constraints?.[key]?.includes(x)) ?? true);
          return acc;
        }, {});
        const inputSample = this.inputGeneratorNetwork.generateConsistentSampleWhenPossible(inputConstraints);
        if (Object.keys(inputSample).length === 0) {
          if (headerOptions.httpVersion === "1") {
            const headers2 = this.getHeaders({
              ...options,
              httpVersion: "2"
            }, requestDependentHeaders, userAgentValues);
            const pascalize = (name) => {
              return name.split("-").map((part) => {
                return part[0].toUpperCase() + part.slice(1).toLowerCase();
              }).join("-");
            };
            const converted2to1 = Object.fromEntries(Object.entries(headers2).map(([name, value]) => {
              if (name.startsWith("sec-ch-ua")) {
                return [name, value];
              }
              if (["dnt", "rtt", "ect"].includes(name)) {
                return [name.toUpperCase(), value];
              }
              return [pascalize(name), value];
            }));
            return this.orderHeaders(converted2to1);
          }
          const relaxationIndex = this.relaxationOrder.findIndex((key) => options[key] !== void 0);
          if (options.strict || relaxationIndex === -1) {
            throw new Error("No headers based on this input can be generated. Please relax or change some of the requirements you specified.");
          }
          const relaxedOptions = { ...options };
          const relaxationKey = this.relaxationOrder[relaxationIndex];
          delete relaxedOptions[relaxationKey];
          return this.getHeaders(relaxedOptions, requestDependentHeaders, userAgentValues);
        }
        const generatedSample = this.headerGeneratorNetwork.generateSample(inputSample);
        const generatedHttpAndBrowser = this.prepareHttpBrowserObject(generatedSample[constants_1.BROWSER_HTTP_NODE_NAME]);
        let secFetchAttributeNames = constants_1.HTTP2_SEC_FETCH_ATTRIBUTES;
        let acceptLanguageFieldName = "accept-language";
        if (generatedHttpAndBrowser.httpVersion !== "2") {
          acceptLanguageFieldName = "Accept-Language";
          secFetchAttributeNames = constants_1.HTTP1_SEC_FETCH_ATTRIBUTES;
        }
        generatedSample[acceptLanguageFieldName] = this._getAcceptLanguageField(headerOptions.locales);
        const isChrome = generatedHttpAndBrowser.name === "chrome";
        const isFirefox = generatedHttpAndBrowser.name === "firefox";
        const isEdge = generatedHttpAndBrowser.name === "edge";
        const hasSecFetch = isChrome && generatedHttpAndBrowser.version[0] >= 76 || isFirefox && generatedHttpAndBrowser.version[0] >= 90 || isEdge && generatedHttpAndBrowser.version[0] >= 79;
        if (hasSecFetch) {
          generatedSample[secFetchAttributeNames.site] = "same-site";
          generatedSample[secFetchAttributeNames.mode] = "navigate";
          generatedSample[secFetchAttributeNames.user] = "?1";
          generatedSample[secFetchAttributeNames.dest] = "document";
        }
        for (const attribute of Object.keys(generatedSample)) {
          if (attribute.toLowerCase() === "connection" && generatedSample[attribute] === "close")
            delete generatedSample[attribute];
          if (attribute.startsWith("*") || generatedSample[attribute] === constants_1.MISSING_VALUE_DATASET_TOKEN)
            delete generatedSample[attribute];
        }
        return this.orderHeaders({
          ...generatedSample,
          ...requestDependentHeaders
        }, this.headersOrder[generatedHttpAndBrowser.name]);
      }
      /**
       * Returns a new object that contains ordered headers.
       * @param headers Specifies known values of headers dependent on the particular request.
       * @param order An array of ordered header names, optional (will be deducted from `user-agent`).
       */
      orderHeaders(headers2, order = this.getOrderFromUserAgent(headers2)) {
        const orderedSample = {};
        for (const attribute of order) {
          if (attribute in headers2) {
            orderedSample[attribute] = headers2[attribute];
          }
        }
        for (const attribute of Object.keys(headers2)) {
          if (!order.includes(attribute)) {
            orderedSample[attribute] = headers2[attribute];
          }
        }
        return orderedSample;
      }
      _prepareBrowsersConfig(browsers, browserListQuery, httpVersion) {
        let finalBrowsers = browsers;
        if (browserListQuery) {
          finalBrowsers = (0, utils_1.getBrowsersFromQuery)(browserListQuery);
        }
        return finalBrowsers.map((browser) => {
          if (typeof browser === "string") {
            return { name: browser, httpVersion };
          }
          browser.httpVersion = httpVersion;
          return browser;
        });
      }
      _getBrowserHttpOptions(browsers) {
        const browserHttpOptions = [];
        for (const browser of browsers) {
          for (const browserOption of this.uniqueBrowsers) {
            if (browser.name === browserOption.name) {
              const browserMajorVersion = browserOption.version[0];
              if ((!browser.minVersion || browser.minVersion <= browserMajorVersion) && (!browser.maxVersion || browser.maxVersion >= browserMajorVersion) && browser.httpVersion === browserOption.httpVersion) {
                browserHttpOptions.push(browserOption.completeString);
              }
            }
          }
        }
        return browserHttpOptions;
      }
      _getPossibleAttributeValues(headerOptions) {
        const { browsers: optionsBrowser, browserListQuery, httpVersion, operatingSystems } = headerOptions;
        const browsers = this._prepareBrowsersConfig(optionsBrowser, browserListQuery, httpVersion);
        const browserHttpOptions = this._getBrowserHttpOptions(browsers);
        const possibleAttributeValues = {};
        possibleAttributeValues[constants_1.BROWSER_HTTP_NODE_NAME] = browserHttpOptions;
        possibleAttributeValues[constants_1.OPERATING_SYSTEM_NODE_NAME] = operatingSystems;
        if (headerOptions.devices) {
          possibleAttributeValues[constants_1.DEVICE_NODE_NAME] = headerOptions.devices;
        }
        return possibleAttributeValues;
      }
      _getAcceptLanguageField(localesFromOptions) {
        let locales = localesFromOptions;
        let highLevelLocales = [];
        for (const locale of locales) {
          if (!locale.includes("-")) {
            highLevelLocales.push(locale);
          }
        }
        for (const locale of locales) {
          if (!highLevelLocales.includes(locale)) {
            let highLevelEquivalentPresent = false;
            for (const highLevelLocale of highLevelLocales) {
              if (locale.includes(highLevelLocale)) {
                highLevelEquivalentPresent = true;
                break;
              }
            }
            if (!highLevelEquivalentPresent)
              highLevelLocales.push(locale);
          }
        }
        highLevelLocales = (0, utils_1.shuffleArray)(highLevelLocales);
        locales = (0, utils_1.shuffleArray)(locales);
        const localesInAddingOrder = [];
        for (const highLevelLocale of highLevelLocales) {
          for (const locale of locales) {
            if (locale.includes(highLevelLocale) && !highLevelLocales.includes(locale)) {
              localesInAddingOrder.push(locale);
            }
          }
          localesInAddingOrder.push(highLevelLocale);
        }
        let acceptLanguageFieldValue = localesInAddingOrder[0];
        for (let x = 1; x < localesInAddingOrder.length; x++) {
          acceptLanguageFieldValue += `,${localesInAddingOrder[x]};q=${1 - x * 0.1}`;
        }
        return acceptLanguageFieldValue;
      }
      /**
       * Extract structured information about a browser and http version in the form of an object from httpBrowserString.
       * @param httpBrowserString A string containing the browser name, version and http version, such as `chrome/88.0.4324.182|2`.
       */
      prepareHttpBrowserObject(httpBrowserString) {
        const [browserString, httpVersion] = httpBrowserString.split("|");
        let browserObject;
        if (browserString === constants_1.MISSING_VALUE_DATASET_TOKEN) {
          browserObject = { name: constants_1.MISSING_VALUE_DATASET_TOKEN };
        } else {
          browserObject = this.prepareBrowserObject(browserString);
        }
        return {
          ...browserObject,
          httpVersion,
          completeString: httpBrowserString
        };
      }
      /**
       * Extract structured information about a browser in the form of an object from browserString.
       * @param browserString A string containing the browser name and version, e.g. `chrome/88.0.4324.182`.
       */
      prepareBrowserObject(browserString) {
        const nameVersionSplit = browserString.split("/");
        const versionSplit = nameVersionSplit[1].split(".");
        const preparedVersion = [];
        for (const versionPart of versionSplit) {
          preparedVersion.push(parseInt(versionPart, 10));
        }
        return {
          name: nameVersionSplit[0],
          version: preparedVersion,
          completeString: browserString
        };
      }
      /**
       * Returns a new object containing header names ordered by their appearance in the given browser.
       * @param headers Non-normalized request headers
       * @returns Correct header order for the given browser.
       */
      getOrderFromUserAgent(headers2) {
        const userAgent = (0, utils_1.getUserAgent)(headers2);
        const browser = (0, utils_1.getBrowser)(userAgent);
        if (!browser) {
          return [];
        }
        return this.headersOrder[browser] ?? [];
      }
    };
    exports.HeaderGenerator = HeaderGenerator;
  }
});

// node_modules/header-generator/presets.js
var require_presets = __commonJS({
  "node_modules/header-generator/presets.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.MODERN_ANDROID = exports.MODERN_MACOS_CHROME = exports.MODERN_MACOS_FIREFOX = exports.MODERN_MACOS = exports.MODERN_WINDOWS_CHROME = exports.MODERN_WINDOWS_FIREFOX = exports.MODERN_WINDOWS = exports.MODERN_LINUX_CHROME = exports.MODERN_LINUX_FIREFOX = exports.MODERN_LINUX = exports.MODERN_MOBILE = exports.MODERN_DESKTOP = void 0;
    exports.MODERN_DESKTOP = {
      browserListQuery: "last 5 versions"
    };
    exports.MODERN_MOBILE = {
      ...exports.MODERN_DESKTOP,
      devices: ["mobile"]
    };
    exports.MODERN_LINUX = {
      ...exports.MODERN_DESKTOP,
      operatingSystems: ["linux"]
    };
    exports.MODERN_LINUX_FIREFOX = {
      browserListQuery: "last 5 firefox versions",
      operatingSystems: ["linux"]
    };
    exports.MODERN_LINUX_CHROME = {
      browserListQuery: "last 5 chrome versions",
      operatingSystems: ["linux"]
    };
    exports.MODERN_WINDOWS = {
      ...exports.MODERN_DESKTOP,
      operatingSystems: ["windows"]
    };
    exports.MODERN_WINDOWS_FIREFOX = {
      browserListQuery: "last 5 firefox versions",
      operatingSystems: ["windows"]
    };
    exports.MODERN_WINDOWS_CHROME = {
      browserListQuery: "last 5 chrome versions",
      operatingSystems: ["windows"]
    };
    exports.MODERN_MACOS = {
      ...exports.MODERN_DESKTOP,
      operatingSystems: ["macos"]
    };
    exports.MODERN_MACOS_FIREFOX = {
      browserListQuery: "last 5 firefox versions",
      operatingSystems: ["macos"]
    };
    exports.MODERN_MACOS_CHROME = {
      browserListQuery: "last 5 chrome versions",
      operatingSystems: ["macos"]
    };
    exports.MODERN_ANDROID = {
      ...exports.MODERN_MOBILE,
      operatingSystems: ["android"]
    };
  }
});

// node_modules/header-generator/index.js
var require_header_generator2 = __commonJS({
  "node_modules/header-generator/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.PRESETS = void 0;
    var tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
    tslib_1.__exportStar(require_header_generator(), exports);
    exports.PRESETS = tslib_1.__importStar(require_presets());
  }
});

// node_modules/fingerprint-generator/constants.js
var require_constants3 = __commonJS({
  "node_modules/fingerprint-generator/constants.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.MISSING_VALUE_DATASET_TOKEN = exports.STRINGIFIED_PREFIX = void 0;
    exports.STRINGIFIED_PREFIX = "*STRINGIFIED*";
    exports.MISSING_VALUE_DATASET_TOKEN = "*MISSING_VALUE*";
  }
});

// node_modules/fingerprint-generator/fingerprint-generator.js
var require_fingerprint_generator = __commonJS({
  "node_modules/fingerprint-generator/fingerprint-generator.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.FingerprintGenerator = void 0;
    var generative_bayesian_network_1 = require_generative_bayesian_network();
    var header_generator_1 = require_header_generator2();
    var constants_1 = require_constants3();
    var FingerprintGenerator2 = class extends header_generator_1.HeaderGenerator {
      /**
       * @param options Default header generation options used - unless overridden.
       */
      constructor(options = {}) {
        super(options);
        Object.defineProperty(this, "fingerprintGeneratorNetwork", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: void 0
        });
        Object.defineProperty(this, "fingerprintGlobalOptions", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: void 0
        });
        this.fingerprintGlobalOptions = {
          screen: options.screen,
          mockWebRTC: options.mockWebRTC,
          slim: options.slim
        };
        this.fingerprintGeneratorNetwork = new generative_bayesian_network_1.BayesianNetwork({
          path: `${__dirname}/data_files/fingerprint-network-definition.zip`
        });
      }
      /**
       * Generates a fingerprint and a matching set of ordered headers using a combination of the default options specified in the constructor
       * and their possible overrides provided here.
       * @param options Overrides default `FingerprintGenerator` options.
       * @param requestDependentHeaders Specifies known values of headers dependent on the particular request.
       */
      getFingerprint(options = {}, requestDependentHeaders = {}) {
        const filteredValues = {};
        for (const [key, value] of Object.entries(options)) {
          if (!value) {
            delete options[key];
          }
        }
        options = {
          ...this.fingerprintGlobalOptions,
          ...options
        };
        const partialCSP = (() => {
          const extensiveScreen = options.screen && Object.keys(options.screen).length !== 0;
          const shouldUseExtensiveConstraints = extensiveScreen;
          if (!shouldUseExtensiveConstraints)
            return void 0;
          filteredValues.screen = extensiveScreen ? this.fingerprintGeneratorNetwork.nodesByName.screen.possibleValues.filter((screenString) => {
            const screen = JSON.parse(screenString.split(constants_1.STRINGIFIED_PREFIX)[1]);
            return screen.width >= (options.screen?.minWidth ?? 0) && screen.width <= (options.screen?.maxWidth ?? 1e5) && screen.height >= (options.screen?.minHeight ?? 0) && screen.height <= (options.screen?.maxHeight ?? 1e5);
          }) : void 0;
          try {
            return generative_bayesian_network_1.utils.getConstraintClosure(this.fingerprintGeneratorNetwork, filteredValues);
          } catch (e) {
            if (options?.strict)
              throw e;
            delete filteredValues.screen;
            return void 0;
          }
        })();
        for (let generateRetries = 0; generateRetries < 10; generateRetries++) {
          const headers2 = super.getHeaders(options, requestDependentHeaders, partialCSP?.userAgent);
          const userAgent = "User-Agent" in headers2 ? headers2["User-Agent"] : headers2["user-agent"];
          const fingerprint2 = this.fingerprintGeneratorNetwork.generateConsistentSampleWhenPossible({
            ...filteredValues,
            userAgent: [userAgent]
          });
          for (const attribute of Object.keys(fingerprint2)) {
            if (fingerprint2[attribute] === constants_1.MISSING_VALUE_DATASET_TOKEN) {
              fingerprint2[attribute] = null;
            } else if (fingerprint2[attribute].startsWith(constants_1.STRINGIFIED_PREFIX)) {
              fingerprint2[attribute] = JSON.parse(fingerprint2[attribute].slice(constants_1.STRINGIFIED_PREFIX.length));
            }
          }
          if (!fingerprint2.screen)
            continue;
          const acceptLanguageHeaderValue = "Accept-Language" in headers2 ? headers2["Accept-Language"] : headers2["accept-language"];
          const acceptedLanguages = [];
          for (const locale of acceptLanguageHeaderValue.split(",")) {
            acceptedLanguages.push(locale.split(";")[0]);
          }
          fingerprint2.languages = acceptedLanguages;
          return {
            fingerprint: {
              ...this.transformFingerprint(fingerprint2),
              mockWebRTC: options.mockWebRTC ?? this.fingerprintGlobalOptions.mockWebRTC ?? false,
              slim: options.slim ?? this.fingerprintGlobalOptions.slim ?? false
            },
            headers: headers2
          };
        }
        throw new Error("Failed to generate a consistent fingerprint after 10 attempts");
      }
      /**
       * Transforms fingerprint to the final scheme, more suitable for fingerprint manipulation and injection.
       * This schema is used in the `fingerprint-injector`.
       * @param fingerprint Fingerprint to be transformed.
       * @returns Transformed fingerprint.
       */
      transformFingerprint(fingerprint2) {
        const { userAgent, userAgentData, doNotTrack, appCodeName, appName, appVersion, oscpu, webdriver, languages, platform, deviceMemory, hardwareConcurrency, product, productSub, vendor, vendorSub, maxTouchPoints, extraProperties, screen, pluginsData, audioCodecs, videoCodecs, battery, videoCard, multimediaDevices, fonts } = fingerprint2;
        const parsedMemory = parseInt(deviceMemory, 10);
        const parsedTouchPoints = parseInt(maxTouchPoints, 10);
        const navigator = {
          userAgent,
          userAgentData,
          language: languages[0],
          languages,
          platform,
          deviceMemory: Number.isNaN(parsedMemory) ? null : parsedMemory,
          // Firefox does not have deviceMemory available
          hardwareConcurrency: parseInt(hardwareConcurrency, 10),
          maxTouchPoints: Number.isNaN(parsedTouchPoints) ? 0 : parsedTouchPoints,
          product,
          productSub,
          vendor,
          vendorSub,
          doNotTrack,
          appCodeName,
          appName,
          appVersion,
          oscpu,
          extraProperties,
          webdriver
        };
        return {
          screen,
          navigator,
          audioCodecs,
          videoCodecs,
          pluginsData,
          battery,
          videoCard,
          multimediaDevices,
          fonts
        };
      }
    };
    exports.FingerprintGenerator = FingerprintGenerator2;
  }
});

// node_modules/fingerprint-generator/index.js
var require_fingerprint_generator2 = __commonJS({
  "node_modules/fingerprint-generator/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.PRESETS = void 0;
    var tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
    tslib_1.__exportStar(require_fingerprint_generator(), exports);
    var header_generator_1 = require_header_generator2();
    Object.defineProperty(exports, "PRESETS", { enumerable: true, get: function() {
      return header_generator_1.PRESETS;
    } });
  }
});

// node_modules/fingerprint-injector/fingerprint-injector.js
var require_fingerprint_injector = __commonJS({
  "node_modules/fingerprint-injector/fingerprint-injector.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.FingerprintInjector = void 0;
    exports.newInjectedContext = newInjectedContext2;
    exports.newInjectedPage = newInjectedPage2;
    var fs_1 = __require("fs");
    var fingerprint_generator_1 = require_fingerprint_generator2();
    var FingerprintInjector2 = class {
      constructor() {
        Object.defineProperty(this, "utilsJs", {
          enumerable: true,
          configurable: true,
          writable: true,
          value: this._loadUtils()
        });
      }
      /**
       * Some HTTP headers depend on the request (for example Accept (with values application/json, image/png) etc.).
       *  This function filters out those headers and leaves only the browser-wide ones.
       * @param headers Headers to be filtered.
       * @returns Filtered headers.
       */
      onlyInjectableHeaders(headers2, browserName) {
        const requestHeaders = [
          "accept-encoding",
          "accept",
          "cache-control",
          "pragma",
          "sec-fetch-dest",
          "sec-fetch-mode",
          "sec-fetch-site",
          "sec-fetch-user",
          "upgrade-insecure-requests"
        ];
        const filteredHeaders = { ...headers2 };
        requestHeaders.forEach((header) => {
          delete filteredHeaders[header];
        });
        if (!(browserName?.toLowerCase().includes("firefox") ?? false)) {
          delete filteredHeaders.te;
        }
        return filteredHeaders;
      }
      /**
       * Adds init script to the browser context, so the fingerprint is changed before every document creation.
       * DISCLAIMER: Since Playwright does not support changing viewport and `user-agent` after the context is created,
       * you have to set it manually when the context is created. Check the Playwright usage example for more details.
       * @param browserContext Playwright browser context to be injected with the fingerprint.
       * @param fingerprint Browser fingerprint from [`fingerprint-generator`](https://github.com/apify/fingerprint-generator).
       */
      async attachFingerprintToPlaywright(browserContext, browserFingerprintWithHeaders) {
        const { fingerprint: fingerprint2, headers: headers2 } = browserFingerprintWithHeaders;
        const enhancedFingerprint = this._enhanceFingerprint(fingerprint2);
        const content = this.getInjectableFingerprintFunction(enhancedFingerprint);
        const browserName = browserContext.browser()?.browserType().name();
        await browserContext.setExtraHTTPHeaders(this.onlyInjectableHeaders(headers2, browserName));
        browserContext.on("page", (page2) => {
          page2.emulateMedia({ colorScheme: "dark" }).catch(() => {
          });
        });
        await browserContext.addInitScript({
          content
        });
      }
      /**
       * Adds script that is evaluated before every document creation.
       * Sets User-Agent and viewport using native puppeteer interface
       * @param page Puppeteer `Page` object to be injected with the fingerprint.
       * @param fingerprint Fingerprint from [`fingerprint-generator`](https://github.com/apify/fingerprint-generator).
       */
      async attachFingerprintToPuppeteer(page2, browserFingerprintWithHeaders) {
        const { fingerprint: fingerprint2, headers: headers2 } = browserFingerprintWithHeaders;
        const enhancedFingerprint = this._enhanceFingerprint(fingerprint2);
        const { screen, userAgent } = enhancedFingerprint;
        await page2.setUserAgent(userAgent);
        const browserVersion = await page2.browser().version();
        if (!browserVersion.toLowerCase().includes("firefox")) {
          await (await page2.target().createCDPSession()).send("Page.setDeviceMetricsOverride", {
            screenHeight: screen.height,
            screenWidth: screen.width,
            width: screen.width,
            height: screen.height,
            mobile: /phone|android|mobile/i.test(userAgent),
            screenOrientation: screen.height > screen.width ? { angle: 0, type: "portraitPrimary" } : { angle: 90, type: "landscapePrimary" },
            deviceScaleFactor: screen.devicePixelRatio
          });
          await page2.setExtraHTTPHeaders(this.onlyInjectableHeaders(headers2, browserVersion));
          await page2.emulateMediaFeatures([
            { name: "prefers-color-scheme", value: "dark" }
          ]);
        }
        await page2.evaluateOnNewDocument(this.getInjectableFingerprintFunction(enhancedFingerprint));
      }
      /**
       * Gets the override script that should be evaluated in the browser.
       */
      getInjectableScript(browserFingerprintWithHeaders) {
        const { fingerprint: fingerprint2 } = browserFingerprintWithHeaders;
        const enhancedFingerprint = this._enhanceFingerprint(fingerprint2);
        return this.getInjectableFingerprintFunction(enhancedFingerprint);
      }
      /**
       * Create injection function string.
       * @param fingerprint Enhanced fingerprint.
       * @returns Script overriding browser fingerprint.
       */
      getInjectableFingerprintFunction(fingerprint2) {
        function inject() {
          const {
            battery,
            navigator: { extraProperties, userAgentData, webdriver, ...navigatorProps },
            screen: allScreenProps,
            videoCard,
            historyLength,
            audioCodecs,
            videoCodecs,
            mockWebRTC,
            slim
            // @ts-expect-error internal browser code
          } = fp;
          const {
            // window screen props
            outerHeight,
            outerWidth,
            devicePixelRatio,
            innerWidth,
            innerHeight,
            screenX,
            pageXOffset,
            pageYOffset,
            // Document screen props
            clientWidth,
            clientHeight,
            // Ignore hdr for now.
            hasHDR,
            // window.screen props
            ...newScreen
          } = allScreenProps;
          const windowScreenProps = {
            innerHeight,
            outerHeight,
            outerWidth,
            innerWidth,
            screenX,
            pageXOffset,
            pageYOffset,
            devicePixelRatio
          };
          const documentScreenProps = {
            clientHeight,
            clientWidth
          };
          runHeadlessFixes();
          if (mockWebRTC)
            blockWebRTC();
          if (slim) {
            window["slim"] = true;
          }
          overrideIntlAPI(navigatorProps.language);
          overrideStatic();
          if (userAgentData) {
            overrideUserAgentData(userAgentData);
          }
          if (window.navigator.webdriver) {
            navigatorProps.webdriver = false;
          }
          overrideInstancePrototype(window.navigator, navigatorProps);
          overrideInstancePrototype(window.screen, newScreen);
          overrideWindowDimensionsProps(windowScreenProps);
          overrideDocumentDimensionsProps(documentScreenProps);
          overrideInstancePrototype(window.history, {
            length: historyLength
          });
          overrideWebGl(videoCard);
          overrideCodecs(audioCodecs, videoCodecs);
          overrideBattery(battery);
        }
        const mainFunctionString = inject.toString();
        return `(()=>{${this.utilsJs}; const fp=${JSON.stringify(fingerprint2)}; (${mainFunctionString})()})()`;
      }
      _enhanceFingerprint(fingerprint2) {
        const { navigator, ...rest } = fingerprint2;
        return {
          ...rest,
          navigator,
          userAgent: navigator.userAgent,
          historyLength: this._randomInRange(2, 6)
        };
      }
      /**
       * Loads the contents of the `utils.js` file, which contains the helper functions for the fingerprinting script.
       *
       * Loading this file dynamically bypasses the TypeScript compiler, which would otherwise mangle the code,
       * causing errors when executing it in the browser.
       */
      _loadUtils() {
        const utilsJs = (0, fs_1.readFileSync)(`${__dirname}/utils.js`);
        return `
${utilsJs}
`;
      }
      _randomInRange(min, max) {
        return Math.floor(Math.random() * (max - min) + min);
      }
    };
    exports.FingerprintInjector = FingerprintInjector2;
    async function newInjectedContext2(browser, options) {
      const generator = new fingerprint_generator_1.FingerprintGenerator();
      const fingerprintWithHeaders = options?.fingerprint ?? generator.getFingerprint(options?.fingerprintOptions ?? {});
      const { fingerprint: fingerprint2, headers: headers2 } = fingerprintWithHeaders;
      const context2 = await browser.newContext({
        userAgent: fingerprint2.navigator.userAgent,
        colorScheme: "dark",
        ...options?.newContextOptions,
        viewport: {
          width: fingerprint2.screen.width,
          height: fingerprint2.screen.height,
          ...options?.newContextOptions?.viewport
        },
        extraHTTPHeaders: {
          "accept-language": headers2["accept-language"],
          ...options?.newContextOptions?.extraHTTPHeaders
        }
      });
      const injector = new FingerprintInjector2();
      await injector.attachFingerprintToPlaywright(context2, fingerprintWithHeaders);
      return context2;
    }
    async function newInjectedPage2(browser, options) {
      const generator = new fingerprint_generator_1.FingerprintGenerator();
      const fingerprintWithHeaders = options?.fingerprint ?? generator.getFingerprint(options?.fingerprintOptions ?? {});
      const page2 = await browser.newPage();
      const injector = new FingerprintInjector2();
      await injector.attachFingerprintToPuppeteer(page2, fingerprintWithHeaders);
      return page2;
    }
  }
});

// node_modules/fingerprint-injector/index.js
var require_fingerprint_injector2 = __commonJS({
  "node_modules/fingerprint-injector/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var tslib_1 = (init_tslib_es6(), __toCommonJS(tslib_es6_exports));
    tslib_1.__exportStar(require_fingerprint_injector(), exports);
  }
});

// src/browser.js
import fs from "fs";
import path from "path";
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
      else await new Promise((resolve) => setTimeout(resolve, 200));
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
    const lockFile = path.resolve(cfg2.dir.browser, "SingletonLock");
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

// src/util.js
import path2 from "node:path";
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
        await new Promise((resolve) => setTimeout(resolve, delayMs));
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
    this.#nextPromise ||= new Promise((resolve, reject) => {
      this.#next = [resolve, reject];
    });
    return new Promise((resolve, reject) => {
      this.#nextPromise?.then(resolve).catch(reject);
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
var __dirname2 = path2.dirname(__filename);
var dataDir = (s) => path2.resolve(__dirname2, "..", "data", s);
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
  enquirer2.on("prompt", (prompt2) => {
    const t = setTimeout(() => {
      prompt2.hint = () => "timeout";
      prompt2.cancel();
    }, timeout);
    prompt2.on("submit", (_) => clearTimeout(t));
    prompt2.on("cancel", (_) => clearTimeout(t));
  });
};
enquirer.use(timeoutPlugin(cfg.login_timeout));
var prompt = (o) => enquirer.prompt({ name: "name", type: "input", message: "Enter value", ...o }).then((r) => r.name).catch((_) => {
});
var confirm = (o) => prompt({ type: "confirm", message: "Continue?", ...o });
var notify = (html) => new Promise((resolve, reject) => {
  if (!cfg.notify) {
    if (cfg.debug) console.debug("notify: NOTIFY is not set!");
    return resolve();
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
    resolve();
  });
});
var escapeHtml = (unsafe) => unsafe.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
var html_game_list = (games, statsSummary = null) => {
  const list = games.map((g) => `- <a href="${g.url}">${escapeHtml(g.title)}</a> (${g.status}${g.price ? ` - $${g.price}` : ""})`).join("<br>");
  return statsSummary ? `${list}<br><br><b>${escapeHtml(statsSummary)}</b>` : list;
};

// node_modules/chalk/source/vendor/ansi-styles/index.js
var ANSI_BACKGROUND_OFFSET = 10;
var wrapAnsi16 = (offset = 0) => (code) => `\x1B[${code + offset}m`;
var wrapAnsi256 = (offset = 0) => (code) => `\x1B[${38 + offset};5;${code}m`;
var wrapAnsi16m = (offset = 0) => (red, green, blue) => `\x1B[${38 + offset};2;${red};${green};${blue}m`;
var styles = {
  modifier: {
    reset: [0, 0],
    // 21 isn't widely supported and 22 does the same thing
    bold: [1, 22],
    dim: [2, 22],
    italic: [3, 23],
    underline: [4, 24],
    overline: [53, 55],
    inverse: [7, 27],
    hidden: [8, 28],
    strikethrough: [9, 29]
  },
  color: {
    black: [30, 39],
    red: [31, 39],
    green: [32, 39],
    yellow: [33, 39],
    blue: [34, 39],
    magenta: [35, 39],
    cyan: [36, 39],
    white: [37, 39],
    // Bright color
    blackBright: [90, 39],
    gray: [90, 39],
    // Alias of `blackBright`
    grey: [90, 39],
    // Alias of `blackBright`
    redBright: [91, 39],
    greenBright: [92, 39],
    yellowBright: [93, 39],
    blueBright: [94, 39],
    magentaBright: [95, 39],
    cyanBright: [96, 39],
    whiteBright: [97, 39]
  },
  bgColor: {
    bgBlack: [40, 49],
    bgRed: [41, 49],
    bgGreen: [42, 49],
    bgYellow: [43, 49],
    bgBlue: [44, 49],
    bgMagenta: [45, 49],
    bgCyan: [46, 49],
    bgWhite: [47, 49],
    // Bright color
    bgBlackBright: [100, 49],
    bgGray: [100, 49],
    // Alias of `bgBlackBright`
    bgGrey: [100, 49],
    // Alias of `bgBlackBright`
    bgRedBright: [101, 49],
    bgGreenBright: [102, 49],
    bgYellowBright: [103, 49],
    bgBlueBright: [104, 49],
    bgMagentaBright: [105, 49],
    bgCyanBright: [106, 49],
    bgWhiteBright: [107, 49]
  }
};
var modifierNames = Object.keys(styles.modifier);
var foregroundColorNames = Object.keys(styles.color);
var backgroundColorNames = Object.keys(styles.bgColor);
var colorNames = [...foregroundColorNames, ...backgroundColorNames];
function assembleStyles() {
  const codes = /* @__PURE__ */ new Map();
  for (const [groupName, group] of Object.entries(styles)) {
    for (const [styleName, style] of Object.entries(group)) {
      styles[styleName] = {
        open: `\x1B[${style[0]}m`,
        close: `\x1B[${style[1]}m`
      };
      group[styleName] = styles[styleName];
      codes.set(style[0], style[1]);
    }
    Object.defineProperty(styles, groupName, {
      value: group,
      enumerable: false
    });
  }
  Object.defineProperty(styles, "codes", {
    value: codes,
    enumerable: false
  });
  styles.color.close = "\x1B[39m";
  styles.bgColor.close = "\x1B[49m";
  styles.color.ansi = wrapAnsi16();
  styles.color.ansi256 = wrapAnsi256();
  styles.color.ansi16m = wrapAnsi16m();
  styles.bgColor.ansi = wrapAnsi16(ANSI_BACKGROUND_OFFSET);
  styles.bgColor.ansi256 = wrapAnsi256(ANSI_BACKGROUND_OFFSET);
  styles.bgColor.ansi16m = wrapAnsi16m(ANSI_BACKGROUND_OFFSET);
  Object.defineProperties(styles, {
    rgbToAnsi256: {
      value(red, green, blue) {
        if (red === green && green === blue) {
          if (red < 8) {
            return 16;
          }
          if (red > 248) {
            return 231;
          }
          return Math.round((red - 8) / 247 * 24) + 232;
        }
        return 16 + 36 * Math.round(red / 255 * 5) + 6 * Math.round(green / 255 * 5) + Math.round(blue / 255 * 5);
      },
      enumerable: false
    },
    hexToRgb: {
      value(hex) {
        const matches = /[a-f\d]{6}|[a-f\d]{3}/i.exec(hex.toString(16));
        if (!matches) {
          return [0, 0, 0];
        }
        let [colorString] = matches;
        if (colorString.length === 3) {
          colorString = [...colorString].map((character) => character + character).join("");
        }
        const integer = Number.parseInt(colorString, 16);
        return [
          /* eslint-disable no-bitwise */
          integer >> 16 & 255,
          integer >> 8 & 255,
          integer & 255
          /* eslint-enable no-bitwise */
        ];
      },
      enumerable: false
    },
    hexToAnsi256: {
      value: (hex) => styles.rgbToAnsi256(...styles.hexToRgb(hex)),
      enumerable: false
    },
    ansi256ToAnsi: {
      value(code) {
        if (code < 8) {
          return 30 + code;
        }
        if (code < 16) {
          return 90 + (code - 8);
        }
        let red;
        let green;
        let blue;
        if (code >= 232) {
          red = ((code - 232) * 10 + 8) / 255;
          green = red;
          blue = red;
        } else {
          code -= 16;
          const remainder = code % 36;
          red = Math.floor(code / 36) / 5;
          green = Math.floor(remainder / 6) / 5;
          blue = remainder % 6 / 5;
        }
        const value = Math.max(red, green, blue) * 2;
        if (value === 0) {
          return 30;
        }
        let result = 30 + (Math.round(blue) << 2 | Math.round(green) << 1 | Math.round(red));
        if (value === 2) {
          result += 60;
        }
        return result;
      },
      enumerable: false
    },
    rgbToAnsi: {
      value: (red, green, blue) => styles.ansi256ToAnsi(styles.rgbToAnsi256(red, green, blue)),
      enumerable: false
    },
    hexToAnsi: {
      value: (hex) => styles.ansi256ToAnsi(styles.hexToAnsi256(hex)),
      enumerable: false
    }
  });
  return styles;
}
var ansiStyles = assembleStyles();
var ansi_styles_default = ansiStyles;

// node_modules/chalk/source/vendor/supports-color/index.js
import process2 from "node:process";
import os from "node:os";
import tty from "node:tty";
function hasFlag(flag, argv = globalThis.Deno ? globalThis.Deno.args : process2.argv) {
  const prefix = flag.startsWith("-") ? "" : flag.length === 1 ? "-" : "--";
  const position = argv.indexOf(prefix + flag);
  const terminatorPosition = argv.indexOf("--");
  return position !== -1 && (terminatorPosition === -1 || position < terminatorPosition);
}
var { env } = process2;
var flagForceColor;
if (hasFlag("no-color") || hasFlag("no-colors") || hasFlag("color=false") || hasFlag("color=never")) {
  flagForceColor = 0;
} else if (hasFlag("color") || hasFlag("colors") || hasFlag("color=true") || hasFlag("color=always")) {
  flagForceColor = 1;
}
function envForceColor() {
  if ("FORCE_COLOR" in env) {
    if (env.FORCE_COLOR === "true") {
      return 1;
    }
    if (env.FORCE_COLOR === "false") {
      return 0;
    }
    return env.FORCE_COLOR.length === 0 ? 1 : Math.min(Number.parseInt(env.FORCE_COLOR, 10), 3);
  }
}
function translateLevel(level) {
  if (level === 0) {
    return false;
  }
  return {
    level,
    hasBasic: true,
    has256: level >= 2,
    has16m: level >= 3
  };
}
function _supportsColor(haveStream, { streamIsTTY, sniffFlags = true } = {}) {
  const noFlagForceColor = envForceColor();
  if (noFlagForceColor !== void 0) {
    flagForceColor = noFlagForceColor;
  }
  const forceColor = sniffFlags ? flagForceColor : noFlagForceColor;
  if (forceColor === 0) {
    return 0;
  }
  if (sniffFlags) {
    if (hasFlag("color=16m") || hasFlag("color=full") || hasFlag("color=truecolor")) {
      return 3;
    }
    if (hasFlag("color=256")) {
      return 2;
    }
  }
  if ("TF_BUILD" in env && "AGENT_NAME" in env) {
    return 1;
  }
  if (haveStream && !streamIsTTY && forceColor === void 0) {
    return 0;
  }
  const min = forceColor || 0;
  if (env.TERM === "dumb") {
    return min;
  }
  if (process2.platform === "win32") {
    const osRelease = os.release().split(".");
    if (Number(osRelease[0]) >= 10 && Number(osRelease[2]) >= 10586) {
      return Number(osRelease[2]) >= 14931 ? 3 : 2;
    }
    return 1;
  }
  if ("CI" in env) {
    if (["GITHUB_ACTIONS", "GITEA_ACTIONS", "CIRCLECI"].some((key) => key in env)) {
      return 3;
    }
    if (["TRAVIS", "APPVEYOR", "GITLAB_CI", "BUILDKITE", "DRONE"].some((sign) => sign in env) || env.CI_NAME === "codeship") {
      return 1;
    }
    return min;
  }
  if ("TEAMCITY_VERSION" in env) {
    return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(env.TEAMCITY_VERSION) ? 1 : 0;
  }
  if (env.COLORTERM === "truecolor") {
    return 3;
  }
  if (env.TERM === "xterm-kitty") {
    return 3;
  }
  if ("TERM_PROGRAM" in env) {
    const version = Number.parseInt((env.TERM_PROGRAM_VERSION || "").split(".")[0], 10);
    switch (env.TERM_PROGRAM) {
      case "iTerm.app": {
        return version >= 3 ? 3 : 2;
      }
      case "Apple_Terminal": {
        return 2;
      }
    }
  }
  if (/-256(color)?$/i.test(env.TERM)) {
    return 2;
  }
  if (/^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(env.TERM)) {
    return 1;
  }
  if ("COLORTERM" in env) {
    return 1;
  }
  return min;
}
function createSupportsColor(stream, options = {}) {
  const level = _supportsColor(stream, {
    streamIsTTY: stream && stream.isTTY,
    ...options
  });
  return translateLevel(level);
}
var supportsColor = {
  stdout: createSupportsColor({ isTTY: tty.isatty(1) }),
  stderr: createSupportsColor({ isTTY: tty.isatty(2) })
};
var supports_color_default = supportsColor;

// node_modules/chalk/source/utilities.js
function stringReplaceAll(string, substring, replacer) {
  let index = string.indexOf(substring);
  if (index === -1) {
    return string;
  }
  const substringLength = substring.length;
  let endIndex = 0;
  let returnValue = "";
  do {
    returnValue += string.slice(endIndex, index) + substring + replacer;
    endIndex = index + substringLength;
    index = string.indexOf(substring, endIndex);
  } while (index !== -1);
  returnValue += string.slice(endIndex);
  return returnValue;
}
function stringEncaseCRLFWithFirstIndex(string, prefix, postfix, index) {
  let endIndex = 0;
  let returnValue = "";
  do {
    const gotCR = string[index - 1] === "\r";
    returnValue += string.slice(endIndex, gotCR ? index - 1 : index) + prefix + (gotCR ? "\r\n" : "\n") + postfix;
    endIndex = index + 1;
    index = string.indexOf("\n", endIndex);
  } while (index !== -1);
  returnValue += string.slice(endIndex);
  return returnValue;
}

// node_modules/chalk/source/index.js
var { stdout: stdoutColor, stderr: stderrColor } = supports_color_default;
var GENERATOR = /* @__PURE__ */ Symbol("GENERATOR");
var STYLER = /* @__PURE__ */ Symbol("STYLER");
var IS_EMPTY = /* @__PURE__ */ Symbol("IS_EMPTY");
var levelMapping = [
  "ansi",
  "ansi",
  "ansi256",
  "ansi16m"
];
var styles2 = /* @__PURE__ */ Object.create(null);
var applyOptions = (object, options = {}) => {
  if (options.level && !(Number.isInteger(options.level) && options.level >= 0 && options.level <= 3)) {
    throw new Error("The `level` option should be an integer from 0 to 3");
  }
  const colorLevel = stdoutColor ? stdoutColor.level : 0;
  object.level = options.level === void 0 ? colorLevel : options.level;
};
var chalkFactory = (options) => {
  const chalk2 = (...strings) => strings.join(" ");
  applyOptions(chalk2, options);
  Object.setPrototypeOf(chalk2, createChalk.prototype);
  return chalk2;
};
function createChalk(options) {
  return chalkFactory(options);
}
Object.setPrototypeOf(createChalk.prototype, Function.prototype);
for (const [styleName, style] of Object.entries(ansi_styles_default)) {
  styles2[styleName] = {
    get() {
      const builder = createBuilder(this, createStyler(style.open, style.close, this[STYLER]), this[IS_EMPTY]);
      Object.defineProperty(this, styleName, { value: builder });
      return builder;
    }
  };
}
styles2.visible = {
  get() {
    const builder = createBuilder(this, this[STYLER], true);
    Object.defineProperty(this, "visible", { value: builder });
    return builder;
  }
};
var getModelAnsi = (model, level, type, ...arguments_) => {
  if (model === "rgb") {
    if (level === "ansi16m") {
      return ansi_styles_default[type].ansi16m(...arguments_);
    }
    if (level === "ansi256") {
      return ansi_styles_default[type].ansi256(ansi_styles_default.rgbToAnsi256(...arguments_));
    }
    return ansi_styles_default[type].ansi(ansi_styles_default.rgbToAnsi(...arguments_));
  }
  if (model === "hex") {
    return getModelAnsi("rgb", level, type, ...ansi_styles_default.hexToRgb(...arguments_));
  }
  return ansi_styles_default[type][model](...arguments_);
};
var usedModels = ["rgb", "hex", "ansi256"];
for (const model of usedModels) {
  styles2[model] = {
    get() {
      const { level } = this;
      return function(...arguments_) {
        const styler = createStyler(getModelAnsi(model, levelMapping[level], "color", ...arguments_), ansi_styles_default.color.close, this[STYLER]);
        return createBuilder(this, styler, this[IS_EMPTY]);
      };
    }
  };
  const bgModel = "bg" + model[0].toUpperCase() + model.slice(1);
  styles2[bgModel] = {
    get() {
      const { level } = this;
      return function(...arguments_) {
        const styler = createStyler(getModelAnsi(model, levelMapping[level], "bgColor", ...arguments_), ansi_styles_default.bgColor.close, this[STYLER]);
        return createBuilder(this, styler, this[IS_EMPTY]);
      };
    }
  };
}
var proto = Object.defineProperties(() => {
}, {
  ...styles2,
  level: {
    enumerable: true,
    get() {
      return this[GENERATOR].level;
    },
    set(level) {
      this[GENERATOR].level = level;
    }
  }
});
var createStyler = (open, close, parent) => {
  let openAll;
  let closeAll;
  if (parent === void 0) {
    openAll = open;
    closeAll = close;
  } else {
    openAll = parent.openAll + open;
    closeAll = close + parent.closeAll;
  }
  return {
    open,
    close,
    openAll,
    closeAll,
    parent
  };
};
var createBuilder = (self2, _styler, _isEmpty) => {
  const builder = (...arguments_) => applyStyle(builder, arguments_.length === 1 ? "" + arguments_[0] : arguments_.join(" "));
  Object.setPrototypeOf(builder, proto);
  builder[GENERATOR] = self2;
  builder[STYLER] = _styler;
  builder[IS_EMPTY] = _isEmpty;
  return builder;
};
var applyStyle = (self2, string) => {
  if (self2.level <= 0 || !string) {
    return self2[IS_EMPTY] ? "" : string;
  }
  let styler = self2[STYLER];
  if (styler === void 0) {
    return string;
  }
  const { openAll, closeAll } = styler;
  if (string.includes("\x1B")) {
    while (styler !== void 0) {
      string = stringReplaceAll(string, styler.close, styler.open);
      styler = styler.parent;
    }
  }
  const lfIndex = string.indexOf("\n");
  if (lfIndex !== -1) {
    string = stringEncaseCRLFWithFirstIndex(string, closeAll, openAll, lfIndex);
  }
  return openAll + string + closeAll;
};
Object.defineProperties(createChalk.prototype, styles2);
var chalk = createChalk();
var chalkStderr = createChalk({ level: stderrColor ? stderrColor.level : 0 });
var source_default = chalk;

// node_modules/fingerprint-injector/index.mjs
var import_index = __toESM(require_fingerprint_injector2(), 1);
var FingerprintInjector = import_index.default.FingerprintInjector;
var newInjectedContext = import_index.default.newInjectedContext;
var newInjectedPage = import_index.default.newInjectedPage;

// node_modules/fingerprint-generator/index.mjs
var import_index2 = __toESM(require_fingerprint_generator2(), 1);
var FingerprintGenerator = import_index2.default.FingerprintGenerator;
var PRESETS = import_index2.default.PRESETS;

// steam.js
var lavender = source_default.hex("#b57edc");
var pastelGreen = source_default.hex("#77dd77");
console.log(datetime(), "started checking steam");
var db = await jsonDb("steam.json", {});
var URL_STORE = "https://store.steampowered.com/?cc=us&l=english";
var URL_LOGIN = "https://store.steampowered.com/login/";
var URL_FREE = "https://store.steampowered.com/search/?sort_by=Reviews_DESC&maxprice=free&specials=1&hidef2p=1&ndl=1&category1=998&cc=us&l=english";
var { fingerprint, headers } = new FingerprintGenerator().getFingerprint({
  devices: ["desktop"],
  operatingSystems: ["windows"]
});
var context = await launchContext(cfg, {
  channel: "chrome",
  headless: cfg.headless,
  locale: "en-US",
  // ignore OS locale to be sure to have english text for locators -> done via /en in URL
  userAgent: fingerprint.navigator.userAgent,
  viewport: {
    width: fingerprint.screen.width,
    height: fingerprint.screen.height
  },
  extraHTTPHeaders: {
    "accept-language": headers["accept-language"]
  },
  recordVideo: cfg.record ? { dir: "data/record/", size: { width: cfg.width, height: cfg.height } } : void 0,
  // will record a .webm video for each page navigated; without size, video would be scaled down to fit 800x800
  recordHar: cfg.record ? { path: `data/record/steam-${filenamify(datetime())}.har` } : void 0,
  // will record a HAR file with network requests and responses; can be imported in Chrome devtools
  handleSIGINT: false
  // have to handle ourselves and call context.close(), otherwise recordings from above won't be saved
});
handleSIGINT(context);
await new FingerprintInjector().attachFingerprintToPlaywright(context, { fingerprint, headers });
if (!cfg.debug) context.setDefaultTimeout(cfg.timeout);
var page = context.pages().length ? context.pages()[0] : await context.newPage();
var isSignedIn = async () => await page.locator("#account_pulldown").count() > 0;
var signIn = async () => {
  console.error("Not signed in anymore.");
  await page.goto(URL_LOGIN, { waitUntil: "domcontentloaded" });
  if (!cfg.debug) context.setDefaultTimeout(cfg.login_timeout);
  console.info(`Login timeout is ${cfg.login_timeout / 1e3} seconds!`);
  if (cfg.steam_username && cfg.steam_password) console.info("Using account name and password from environment.");
  else console.info("Press ESC to skip the prompts if you want to login in the browser (not possible in headless mode).");
  const username = cfg.steam_username || await prompt({ message: "Enter Steam account name" });
  const password = username && (cfg.steam_password || await prompt({ type: "password", message: "Enter password" }));
  if (!password) {
    console.log("Waiting for you to login in the browser.");
    await notify("steam: no longer signed in and not enough options set for automatic login.");
  } else {
    await page.getByLabel(/account name/i).fill(username);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    console.log("Waiting for Steam Guard: approve the logon in your Steam mobile app, or enter the code if Steam asks for one.");
    await Promise.any([
      page.locator("#authcode").waitFor({ state: "visible" }),
      page.locator("#twofactorcode_entry").waitFor({ state: "visible" }),
      page.locator("#account_pulldown").waitFor({ state: "attached" })
      // no Steam Guard required
    ]).catch((_) => {
    });
    const twoFactor = page.locator("#twofactorcode_entry");
    const emailCode = page.locator("#authcode");
    if (await twoFactor.isVisible().catch((_) => false) || await emailCode.isVisible().catch((_) => false)) {
      const useEmailCode = !await twoFactor.isVisible().catch((_) => false);
      console.log(useEmailCode ? "Steam Guard - Enter the code sent to your email." : "Steam Guard - Enter the code from your mobile authenticator.");
      const code = await prompt({ message: "Enter Steam Guard code" });
      const field = useEmailCode ? emailCode : twoFactor;
      await field.fill(code);
      await field.press("Enter");
    } else if (!await isSignedIn()) {
      console.log("No code requested - approve the logon in your Steam mobile app. Waiting until signed in...");
    }
  }
  await page.waitForSelector("#account_pulldown", { timeout: cfg.login_timeout }).catch((_) => {
  });
};
try {
  await page.goto(URL_STORE, { waitUntil: "domcontentloaded" });
  if (!await isSignedIn()) await signIn();
  if (!await isSignedIn()) throw new Error("Steam: not signed in.");
  const user = (await page.locator("#account_pulldown").innerText()).trim();
  console.log(`Signed in as ${user}`);
  db.data[user] ||= {};
  await page.goto(URL_FREE, { waitUntil: "domcontentloaded" });
  const rows = page.locator("a.search_result_row");
  await rows.first().waitFor().catch((_) => {
  });
  const games = [];
  for (const row of await rows.all()) {
    const discount = await row.locator(".discount_pct").first().innerText().catch((_) => "");
    if (!discount.includes("-100%")) continue;
    games.push({
      appid: (await row.getAttribute("data-ds-appid") || "").split(",")[0],
      // may hold several ids for bundles
      title: (await row.locator(".title").first().innerText()).trim(),
      url: await row.getAttribute("href")
    });
  }
  console.log("Free to keep games:", games.length);
  const notify_games = [];
  for (const game of games) {
    console.log("Current free game:", lavender(game.title));
    if (db.data[user][game.title]?.status == "claimed") {
      console.log("  Already claimed.");
      continue;
    }
    const notify_game = { title: game.title, url: game.url, status: "failed: not claimed" };
    notify_games.push(notify_game);
    await page.goto(game.url, { waitUntil: "domcontentloaded" });
    if (cfg.debug) await page.pause();
    const claim = page.locator('.btn_addtocart a[href*="addToCart"], #add_to_cart');
    if (!await claim.count()) {
      console.log(pastelGreen("  Already in library! Nothing to claim."));
      notify_game.status = "existed";
      continue;
    }
    const claimText = (await claim.first().innerText()).trim();
    console.log("  Claim button:", claimText);
    if (!/add to account/i.test(claimText)) {
      notify_game.status = "failed: not free to keep anymore";
      continue;
    }
    if (cfg.dryrun) {
      notify_game.status = "skipped (dryrun)";
      continue;
    }
    if (cfg.interactive && !await confirm({ message: `Claim "${game.title}"?` })) {
      notify_game.status = "skipped (interactive)";
      continue;
    }
    const response = page.waitForResponse((r) => r.url().includes("/checkout/addfreelicense/"), { timeout: cfg.timeout }).catch((_) => null);
    await claim.first().click();
    const result = await response;
    if (result) {
      const json = await result.json().catch((_) => null);
      console.log("  Response:", JSON.stringify(json));
      notify_game.status = json?.success == 1 ? "claimed" : `failed: ${JSON.stringify(json)}`;
    } else {
      notify_game.status = "failed: no response from addfreelicense";
    }
  }
  if (notify_games.length) await notify(html_game_list(notify_games));
  for (const g of notify_games) db.data[user][g.title] = { title: g.title, time: datetime(), url: g.url, status: g.status };
} catch (error) {
  process.exitCode ||= 1;
  console.error("--- Exception:");
  console.error(error);
} finally {
  await db.write();
}
if (page.video()) console.log("Recorded video:", await page.video().path());
await context.close();
