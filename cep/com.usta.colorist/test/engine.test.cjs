/* node test/engine.test.js */
var fs = require("fs");
var vm = require("vm");
var path = require("path");
var ctx = { console: console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/engine.js"), "utf8"), ctx);
var E = ctx.USTAEngine;
if (!E) throw new Error("USTAEngine missing");

function img(w, h, fn) {
  var data = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  var i, x, y, c;
  for (y = 0; y < h; y++) {
    for (x = 0; x < w; x++) {
      c = fn(x, y, w, h);
      i = (y * w + x) * 4;
      data.data[i] = c[0];
      data.data[i + 1] = c[1];
      data.data[i + 2] = c[2];
      data.data[i + 3] = 255;
    }
  }
  return data;
}

var fail = 0;
function assert(cond, msg) {
  if (!cond) {
    fail++;
    console.log("FAIL", msg);
  } else console.log("ok", msg);
}

var gray = E.analyzeImageData(
  img(64, 48, function () {
    return [128, 128, 128];
  })
);
assert(Math.abs(gray.meanLuma - 0.5) < 0.04, "gray mean ~0.5 got " + gray.meanLuma);
assert(gray.grayN > 100, "gray pixels collected " + gray.grayN);

var grass = E.analyzeImageData(
  img(64, 48, function () {
    return [40, 180, 40];
  })
);
var g = E.gradeAll([grass, grass], "belgesel", 0.88);
assert(Math.abs(g.lumetri[0].temperature) < 12, "green scene must not slam WB T=" + g.lumetri[0].temperature);

var skin = E.analyzeImageData(
  img(64, 48, function (x, y) {
    if (x > 16 && x < 48 && y > 10 && y < 38) return [190, 140, 110];
    return [30, 30, 35];
  })
);
assert(skin.skinPct > 1, "skin detected " + skin.skinPct);
var gs = E.gradeAll([skin], "belgesel", 0.88);
assert(Math.abs(gs.lumetri[0].temperature) <= 12, "skin T clamped " + gs.lumetri[0].temperature);

var dark = E.analyzeImageData(
  img(32, 32, function () {
    return [80, 50, 35];
  })
);
assert(typeof dark.minIRE === "number", "IRE present");

var a1 = E.analyzeImageData(
  img(32, 32, function () {
    return [200, 200, 200];
  })
);
var a2 = E.analyzeImageData(
  img(32, 32, function () {
    return [20, 20, 20];
  })
);
var a3 = E.analyzeImageData(
  img(32, 32, function () {
    return [198, 198, 198];
  })
);
var cl = E.gradeAll([a1, a2, a3], "belgesel", 0.5);
assert(cl.scenes >= 1, "scenes " + cl.scenes);
assert(cl.print.vignette < 0, "print vignette " + cl.print.vignette);
assert(cl.lumetri[0].vignette === 0, "clip trim has no vignette");

if (fail) {
  console.log(fail + " failed");
  process.exit(1);
}
console.log("all passed");
