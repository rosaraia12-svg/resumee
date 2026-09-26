/* ------------------------------------------------------------------ *
 * hero.js — character hero for Rosa Raia's portfolio.
 *
 * The 8s source clip (24fps) was stabilised and split into WebP frames,
 * named by source frame number (frames/b_NNN.webp), full frame rate:
 *
 *    0 - 12   looks at the visitor, settles into work   (intro)
 *   12 - 60   typing, eyes on the laptop                (idle loop)
 *  102 - 136  looks at the visitor, waves      (voice 110-130)
 *  137 - 168  smiles, points down to the portfolio (voice 137-182)
 *  168 - 190  back to the laptop
 *
 * Same experience on every device: she greets once on load, again on
 * click / tap, and again when the visitor scrolls back up to her.
 *
 * One <canvas>, one requestAnimationFrame loop. Frames are pre-decoded to
 * ImageBitmaps so drawing never waits on the decoder; the playhead is a
 * float and neighbouring frames are blended; jumps between clips are
 * covered by a short crossfade. The soft edge fade is baked into the
 * canvas instead of a CSS mask, so the compositor has less to redo.
 * ------------------------------------------------------------------ */
(function () {
  "use strict";

  /* ---------- frame inventory ---------- */
  var LIST = [];
  var i;
  for (i = 0; i <= 60; i++) LIST.push(i);
  for (i = 102; i <= 190; i++) LIST.push(i);
  var NATIVE_W = 720, NATIVE_H = 1280;
  var FPS = 24;          // the clip's real speed, in source frames per second

  var stage  = document.getElementById("stage");
  var canvas = document.getElementById("character");
  var msgEl  = document.getElementById("msg");
  var ctx    = canvas.getContext("2d");

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var frames = {};      // src number -> ImageBitmap | HTMLImageElement
  var avail  = [];      // sorted src numbers ready to draw

  /* ---------- helpers ---------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function inOutSine(t) { return -(Math.cos(Math.PI * t) - 1) / 2; }
  function linear(t) { return t; }

  function insertSorted(arr, v) {
    var k = arr.length;
    while (k > 0 && arr[k - 1] > v) k--;
    arr.splice(k, 0, v);
  }

  /* nearest ready frames either side of pos */
  function bracket(pos) {
    var a = avail, n = a.length;
    if (!n) return null;
    if (pos <= a[0]) return { lo: a[0], hi: a[0], t: 0 };
    if (pos >= a[n - 1]) return { lo: a[n - 1], hi: a[n - 1], t: 0 };
    var lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      var mid = (lo + hi) >> 1;
      if (a[mid] <= pos) lo = mid; else hi = mid;
    }
    var f0 = a[lo], f1 = a[hi];
    // a wide gap means "not loaded yet" (or a clip boundary): snap, don't smear
    if (f1 - f0 > 2) return pos - f0 < f1 - pos ? { lo: f0, hi: f0, t: 0 } : { lo: f1, hi: f1, t: 0 };
    return { lo: f0, hi: f1, t: (pos - f0) / (f1 - f0) };
  }

  /* ---------- loading: intro + idle first, then the greeting ---------- */
  var IDLE_READY = 61;   // frames 0-60

  function load() {
    var next = 0, inflight = 0, MAX = 6;
    function pump() {
      while (inflight < MAX && next < LIST.length) {
        loadOne(LIST[next++]);
      }
    }
    function loadOne(f) {
      inflight++;
      var img = new Image();
      img.decoding = "async";
      img.src = "./frames/b_" + String(f).padStart(3, "0") + ".webp";
      var ready = function (bmp) {
        inflight--;
        frames[f] = bmp;
        insertSorted(avail, f);
        dirty = true;
        if (f === 0) onFirstFrame();
        if (avail.length === IDLE_READY) onIdleReady();
        if (avail.length === LIST.length) greetReady = true;
        pump();
      };
      var fail = function () { inflight--; pump(); };
      img.onload = function () {
        if (window.createImageBitmap) {
          createImageBitmap(img).then(ready, function () { ready(img); });
        } else ready(img);
      };
      img.onerror = fail;
    }
    pump();
  }

  /* ---------- canvas ---------- */
  var W = 0, H = 0;
  var fadeCanvas = document.createElement("canvas");
  var fctx = fadeCanvas.getContext("2d");
  var maskCanvas = document.createElement("canvas");
  var painted = false;

  /* soft edges: sides fade over 11%, top 3.5%, bottom 6% */
  function buildMask() {
    maskCanvas.width = W; maskCanvas.height = H;
    var m = maskCanvas.getContext("2d");
    var gx = m.createLinearGradient(0, 0, W, 0);
    gx.addColorStop(0, "rgba(0,0,0,0)");
    gx.addColorStop(0.11, "rgba(0,0,0,1)");
    gx.addColorStop(0.89, "rgba(0,0,0,1)");
    gx.addColorStop(1, "rgba(0,0,0,0)");
    m.fillStyle = gx;
    m.fillRect(0, 0, W, H);
    var gy = m.createLinearGradient(0, 0, 0, H);
    gy.addColorStop(0, "rgba(0,0,0,0)");
    gy.addColorStop(0.035, "rgba(0,0,0,1)");
    gy.addColorStop(0.94, "rgba(0,0,0,1)");
    gy.addColorStop(1, "rgba(0,0,0,0)");
    m.globalCompositeOperation = "destination-in";
    m.fillStyle = gy;
    m.fillRect(0, 0, W, H);
  }

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = canvas.clientWidth * dpr;
    var h = canvas.clientHeight * dpr;
    // never draw bigger than the frames themselves: no gain, just more pixels to push
    if (h > NATIVE_H) { w = w * NATIVE_H / h; h = NATIVE_H; }
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    if (w === W && h === H) return;
    W = canvas.width = fadeCanvas.width = w;
    H = canvas.height = fadeCanvas.height = h;
    ctx.imageSmoothingQuality = "high";
    buildMask();
    fade = null;
    dirty = true;
  }

  function paint(now) {
    var br = bracket(cur.pos);
    if (!br || !W) return;
    ctx.globalCompositeOperation = "copy";
    ctx.globalAlpha = 1;
    ctx.drawImage(frames[br.lo], 0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
    if (br.hi !== br.lo && br.t > 0.02) {
      ctx.globalAlpha = br.t;
      ctx.drawImage(frames[br.hi], 0, 0, W, H);
    }
    if (fade) {
      var ft = clamp((now - fade.t0) / fade.dur, 0, 1);
      if (ft >= 1) fade = null;
      else {
        ctx.globalAlpha = 1 - inOutSine(ft);
        ctx.drawImage(fadeCanvas, 0, 0);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(maskCanvas, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    if (!painted) { painted = true; canvas.style.background = "none"; }
  }

  /* ---------- playhead + step sequencer ---------- *
   * steps:  xf    crossfade to pos over dur (runs under the next step)
   *         play  pos -> to; without dur it runs at the clip's real 24fps
   *         bounce  ping-pong between a..b at a constant 24fps for dur
   *                 (constant speed: no slow-motion at the turnarounds)
   *         loop  bounce 12..60 forever (the working idle)
   *         wait  stay put for dur
   *         call  run fn
   */
  var cur = { pos: 0 };
  var fade = null;
  var steps = [], step = null;
  var dirty = true;

  function run(list, now) {
    steps = list.slice();
    nextStep(now || performance.now());
  }

  function nextStep(now) {
    step = steps.shift() || { k: "loop", dir: 1 };
    step.t0 = step.last = now;
    step.from = cur.pos;
    if (step.k === "play" && !step.dur) step.dur = Math.max(1, Math.abs(step.to - step.from) / FPS * 1000);
    if (step.k === "loop") { step.a = 12; step.b = 60; step.dur = Infinity; }
    if (step.k === "bounce" || step.k === "loop") step.dir = step.dir || 1;
  }

  function advance(now) {        // true when the step is finished
    var t;
    switch (step.k) {
      case "xf":
        if (painted) { fctx.clearRect(0, 0, W, H); fctx.drawImage(canvas, 0, 0); fade = { t0: now, dur: step.dur }; }
        cur.pos = step.pos;
        return true;
      case "call":
        step.fn(now);
        return true;
      case "wait":
        return now - step.t0 >= step.dur;
      case "play":
        if (reduce) { cur.pos = step.to; return true; }
        t = clamp((now - step.t0) / step.dur, 0, 1);
        cur.pos = step.from + (step.to - step.from) * (step.ease || linear)(t);
        return t >= 1;
      case "bounce":
      case "loop":
        if (!reduce) {
          var p = cur.pos + step.dir * FPS * Math.min(now - step.last, 50) / 1000;
          if (p > step.b) { p = 2 * step.b - p; step.dir = -1; }
          if (p < step.a) { p = 2 * step.a - p; step.dir = 1; }
          cur.pos = clamp(p, step.a, step.b);
        }
        step.last = now;
        return now - step.t0 >= step.dur;
    }
    return true;
  }

  /* ---------- message pill (follows the EN / IT switch) ---------- */
  var LINES = {
    en: { hey: "Hey hallo there", look: "Take a look at my portfolio right down here" },
    it: { hey: "Ehi, ciao!",      look: "Dai un'occhiata al mio portfolio, proprio qui sotto" }
  };
  function line(key) {
    return (LINES[document.documentElement.lang] || LINES.en)[key];
  }

  var msgText = "", msgTimer = 0;   // msgText holds the line key
  function say(key) {
    if (key === msgText) return;
    msgText = key;
    clearTimeout(msgTimer);
    var swap = function () {
      if (!msgText) return;
      msgEl.textContent = line(msgText);
      msgEl.classList.add("on");
    };
    if (msgEl.classList.contains("on")) {
      msgEl.classList.remove("on");
      msgTimer = setTimeout(swap, 220);
    } else swap();
  }
  function hush() {
    msgText = "";
    clearTimeout(msgTimer);
    msgEl.classList.remove("on");
  }

  document.addEventListener("langchange", function () {
    if (msgText) msgEl.textContent = line(msgText);
  });

  /* ---------- the greeting ---------- */
  var state = "intro";   // intro | idle | greet
  var greetReady = false;
  var lastGreet = -1e9;

  function greet(now) {
    state = "greet";
    // The clip plays straight through at its real speed; only the bubbles
    // are timed. Cues come from the original video's voice track: she
    // speaks over frames 110-130 and 137-182. Each bubble starts fading in
    // a couple of frames early and leaves just after her voice stops.
    run([
      { k: "xf", pos: 102, dur: reduce ? 200 : 340 },
      { k: "play", to: 108 },
      { k: "call", fn: function () { say("hey"); } },
      { k: "play", to: 132 },
      // swapping fades the first line out, then the second in ~5 frames later, at 137
      { k: "call", fn: function () { say("look"); } },
      { k: "play", to: 184 },
      { k: "call", fn: hush },
      { k: "play", to: 190 },
      { k: "xf", pos: 12, dur: reduce ? 200 : 480 },
      { k: "call", fn: function () { state = "idle"; } },
      { k: "loop", dir: 1 }
    ], now);
  }

  function requestGreet() {
    var now = performance.now();
    if (state !== "idle" || !greetReady || now - lastGreet < 1500) return;
    lastGreet = now;
    greet(now);
    wake();
  }

  stage.addEventListener("click", requestGreet);
  stage.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); requestGreet(); }
  });

  /* ---------- start-up ---------- */
  function onFirstFrame() { resize(); wake(); }

  function onIdleReady() {
    // intro: she glances at the visitor (frame 0), settles into work, then says hi
    run([
      { k: "wait", dur: 500 },
      { k: "play", to: 12 },
      { k: "call", fn: function () {
          state = "idle";
          (function tryGreet() {
            if (greetReady) setTimeout(requestGreet, 400);
            else setTimeout(tryGreet, 150);
          })();
        } },
      { k: "loop", dir: 1 }
    ]);
    wake();
  }

  /* ---------- rAF loop, paused when the hero is off-screen ---------- */
  var raf = 0, visible = true, seenAway = false;

  function tick(now) {
    raf = 0;
    if (step) {
      var guard = 0;
      while (advance(now) && guard++ < 20) nextStep(now);
      dirty = true;
    }
    if (dirty || fade) { dirty = false; paint(now); }
    if (visible && !document.hidden) raf = requestAnimationFrame(tick);
  }
  function wake() { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(tick); }

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      var e = entries[0];
      visible = e.isIntersecting;
      if (!visible) { seenAway = true; return; }
      wake();
      // coming back up to the hero earns another hello
      if (seenAway && e.intersectionRatio > 0.55) { seenAway = false; requestGreet(); }
    }, { threshold: [0, 0.55] }).observe(stage);
  }
  document.addEventListener("visibilitychange", wake);

  if ("ResizeObserver" in window) new ResizeObserver(function () { resize(); wake(); }).observe(canvas);
  else window.addEventListener("resize", function () { resize(); wake(); });

  load();
})();
