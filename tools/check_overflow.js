// Overflow check for the current screen. Paste into the browser pane console or load via tools/build_ui_harness.mjs.
// window.checkOverflow() returns violations: {kind, el, detail}. Zero violations is the pass condition.
//   clipped-x   content wider than its box (scrollWidth > clientWidth + 1) without an ellipsis/line-clamp rule
//   clipped-y   overflow:hidden box whose text is cut off vertically (no line-clamp)
//   off-window  element sticks out of the window width
//   tiny-text   text rendered smaller than 12 px
// Opt out a node on purpose with the attribute data-overflow-ok (canvas backdrops, decorative layers).
(function () {
  var MIN_FONT_PX = 12;

  function visible(el) {
    var r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    var cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0;
  }

  function label(el) {
    var parts = [];
    for (var n = el, i = 0; n && n.nodeType === 1 && i < 4; n = n.parentElement, i++) {
      var s = n.tagName.toLowerCase();
      if (n.id) s += '#' + n.id;
      else if (typeof n.className === 'string' && n.className.trim()) s += '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.');
      parts.unshift(s);
    }
    return parts.join(' > ');
  }

  function clipsText(cs) {
    return cs.textOverflow === 'ellipsis' || cs.webkitLineClamp !== 'none' && cs.webkitLineClamp !== '';
  }

  function ownText(el) {
    for (var c = el.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3 && c.nodeValue.trim()) return c.nodeValue.trim();
    }
    return '';
  }

  window.checkOverflow = function () {
    var found = [];
    var vw = document.documentElement.clientWidth;
    var all = document.body.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (/^(SCRIPT|STYLE|CANVAS|SVG|PATH|IMG|BR)$/i.test(el.tagName) || el.closest('[data-overflow-ok]') || !visible(el)) continue;
      var cs = getComputedStyle(el);
      var text = ownText(el);
      if (text && parseFloat(cs.fontSize) < MIN_FONT_PX - 0.01) {
        found.push({ kind: 'tiny-text', el: label(el), detail: cs.fontSize + ' "' + text.slice(0, 40) + '"' });
      }
      if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && !clipsText(cs) && cs.display !== 'inline') {
        found.push({ kind: 'clipped-x', el: label(el), detail: el.scrollWidth + ' > ' + el.clientWidth + ' overflow-x:' + cs.overflowX + ' "' + el.textContent.trim().replace(/\s+/g, ' ').slice(0, 40) + '"' });
      }
      if (cs.overflowY === 'hidden' && el.scrollHeight > el.clientHeight + 1 && el.clientHeight > 0 && text && !clipsText(cs)) {
        found.push({ kind: 'clipped-y', el: label(el), detail: el.scrollHeight + ' > ' + el.clientHeight + ' "' + text.slice(0, 40) + '"' });
      }
      var r = el.getBoundingClientRect();
      if (r.right > vw + 1 || r.left < -1) {
        // inside a scroll/clip container the element is reachable or hidden by design; only report if no ancestor clips it
        var clipped = false;
        for (var p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          var pcs = getComputedStyle(p);
          if (pcs.overflowX !== 'visible') { clipped = true; break; }
        }
        if (!clipped) found.push({ kind: 'off-window', el: label(el), detail: Math.round(r.left) + '..' + Math.round(r.right) + ' of ' + vw });
      }
    }
    return found;
  };

  var SCREENS = ['dashboard', 'shelf', 'giveaways', 'dimmer', 'settings'];
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // Visits every main tab, then the help modal; returns {screen: violations[]}. One call = one cell of the lang x scale x size matrix.
  window.checkOverflowAllScreens = async function () {
    var out = {};
    var tabs = document.querySelectorAll('.deck-tabs .tab-btn');
    for (var i = 0; i < SCREENS.length && i < tabs.length; i++) {
      tabs[i].click();
      await sleep(600);
      out[SCREENS[i]] = window.checkOverflow();
    }
    var help = document.querySelector('.help-btn');
    if (help) {
      help.click();
      await sleep(600);
      out.help = window.checkOverflow();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await sleep(300);
    }
    return out;
  };
})();
