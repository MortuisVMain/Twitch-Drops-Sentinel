// Computed-colour contrast check for the current screen. Paste into the browser pane console or load via tools/build_ui_harness.mjs.
// window.checkTextContrast() returns text nodes whose computed colour has < 4.5:1 (3:1 for large text) against the
// surface really painted behind them (nearest ancestors with a solid/translucent background, composited over each other).
// Catches what tools/check_contrast.py cannot: a hard-coded or wrongly inherited colour. Zero violations is the pass condition.
// Gradients and images are resolved to the base colour of the nearest solid ancestor; opt a node out with data-contrast-ok. Disabled controls are exempt (WCAG 1.4.3).
(function () {
  function parse(c) {
    var m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    var p = m[1].split(/[,\s/]+/).filter(Boolean).map(parseFloat);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  function over(fg, bg) {
    var a = fg[3];
    return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
  }
  function lum(c) {
    var ch = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2]);
  }
  function ratio(a, b) {
    var x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  function surface(el) {
    var layers = [];
    for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
      var bg = parse(getComputedStyle(n).backgroundColor);
      if (bg && bg[3] > 0) { layers.push(bg); if (bg[3] >= 1) break; }
    }
    var base = [255, 255, 255, 1];
    for (var i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return base;
  }
  function visible(el) {
    var r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    var cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  }
  function label(el) {
    var parts = [];
    for (var n = el, i = 0; n && n.nodeType === 1 && i < 3; n = n.parentElement, i++) {
      var s = n.tagName.toLowerCase();
      if (n.id) s += '#' + n.id;
      else if (typeof n.className === 'string' && n.className.trim()) s += '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.');
      parts.unshift(s);
    }
    return parts.join(' > ');
  }
  window.checkTextContrast = function () {
    var out = [];
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (var t = walker.nextNode(); t; t = walker.nextNode()) {
      if (!t.nodeValue.trim()) continue;
      var el = t.parentElement;
      if (!el || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(el.tagName) || el.closest('[data-contrast-ok], :disabled, [aria-disabled="true"]') || !visible(el)) continue;
      var cs = getComputedStyle(el);
      var fg = parse(cs.color);
      if (!fg) continue;
      var op = 1;
      for (var n = el; n && n.nodeType === 1; n = n.parentElement) op *= Number(getComputedStyle(n).opacity);
      if (op < 0.05) continue;
      var bg = surface(el);
      var text = over([fg[0], fg[1], fg[2], fg[3] * op], bg);
      var size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight, 10) >= 700;
      var need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
      var r = ratio(text, bg);
      if (r < need) out.push({ el: label(el), text: t.nodeValue.trim().slice(0, 40), color: cs.color, surface: 'rgb(' + bg.slice(0, 3).map(Math.round) + ')', ratio: Math.round(r * 100) / 100, need: need });
    }
    return out;
  };
})();
