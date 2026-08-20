/* USTA frame analyzer + per-clip Lumetri (CEP Chromium, ES5) */
(function (root) {
  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }
  function log2(x) {
    return Math.log(x) / Math.LN2;
  }
  function cbrt(x) {
    return Math.pow(x, 1 / 3);
  }
  function round1(n) {
    return Math.round(n * 10) / 10;
  }
  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  var LOOKS = {
    notr: {
      contrast: 1.04,
      sat: 0.99,
      warm: 0,
      shadowLift: 0.004,
      highlightComp: 0.05,
      fadedFilm: 8,
      vignette: -5,
      vibrance: 0.03,
      shadowLuma: -2,
      highlightLuma: -6
    },
    belgesel: {
      contrast: 1.06,
      sat: 0.97,
      warm: 0.016,
      shadowLift: 0.006,
      highlightComp: 0.08,
      fadedFilm: 20,
      vignette: -8,
      vibrance: 0.045,
      shadowLuma: -3,
      highlightLuma: -10
    },
    kultur: {
      contrast: 1.08,
      sat: 0.99,
      warm: 0.022,
      shadowLift: 0.006,
      highlightComp: 0.07,
      fadedFilm: 16,
      vignette: -7,
      vibrance: 0.05,
      shadowLuma: -2,
      highlightLuma: -8
    }
  };

  function isSkin(r, g, b) {
    var y = 0.299 * r + 0.587 * g + 0.114 * b;
    var cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    var cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    return cr > 133 && cr < 177 && cb > 77 && cb < 127 && y > 45 && y < 230 && r > g + 8 && g > b * 0.72;
  }

  function percentile(hist, total, p) {
    var target = Math.max(1, p * total);
    var acc = 0;
    var i;
    for (i = 0; i < 256; i++) {
      acc += hist[i];
      if (acc >= target) return i / 255;
    }
    return 1;
  }

  function analyzeImageData(data) {
    var width = data.width;
    var height = data.height;
    var px = data.data;
    var lumaHist = [];
    var i;
    for (i = 0; i < 256; i++) lumaHist[i] = 0;
    var meanR = 0, meanG = 0, meanB = 0, meanLuma = 0, meanSat = 0;
    var crushed = 0, clipped = 0, skinN = 0, skinR = 0, skinG = 0, skinB = 0;
    var wbR = 0, wbG = 0, wbB = 0, wbN = 0;
    var n = width * height;
    var r8, g8, b8, r, g, b, y, max, min;
    for (i = 0; i < px.length; i += 4) {
      r8 = px[i];
      g8 = px[i + 1];
      b8 = px[i + 2];
      r = r8 / 255;
      g = g8 / 255;
      b = b8 / 255;
      y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      lumaHist[(y * 255) | 0]++;
      meanR += r;
      meanG += g;
      meanB += b;
      meanLuma += y;
      max = r > g ? (r > b ? r : b) : g > b ? g : b;
      min = r < g ? (r < b ? r : b) : g < b ? g : b;
      meanSat += max === 0 ? 0 : (max - min) / max;
      if (y < 0.02) crushed++;
      if (y > 0.98) clipped++;
      if (isSkin(r8, g8, b8)) {
        skinN++;
        skinR += r;
        skinG += g;
        skinB += b;
      }
      if (y > 0.12 && y < 0.88) {
        wbN++;
        wbR += r;
        wbG += g;
        wbB += b;
      }
    }
    var inv = 1 / Math.max(1, n);
    meanR *= inv;
    meanG *= inv;
    meanB *= inv;
    meanLuma *= inv;
    meanSat *= inv;
    var wr = wbN ? wbR / wbN : meanR;
    var wg = wbN ? wbG / wbN : meanG;
    var wb = wbN ? wbB / wbN : meanB;
    return {
      blackPoint: percentile(lumaHist, n, 0.005),
      whitePoint: percentile(lumaHist, n, 0.995),
      meanLuma: meanLuma,
      meanR: meanR,
      meanG: meanG,
      meanB: meanB,
      meanSat: meanSat,
      crushedPct: (crushed / n) * 100,
      clippedPct: (clipped / n) * 100,
      skinPct: (skinN / n) * 100,
      skinMeanR: skinN ? skinR / skinN : 0,
      skinMeanG: skinN ? skinG / skinN : 0,
      skinMeanB: skinN ? skinB / skinN : 0,
      tempHint: clamp(((wr - wb) / Math.max(0.04, wg)) * 55, -80, 80)
    };
  }

  function heroScore(a) {
    var exp = 1 - Math.min(1, Math.abs(a.meanLuma - 0.42) * 2.4);
    var range = clamp((a.whitePoint - a.blackPoint) / 0.85, 0, 1);
    var clean = 1 - Math.min(1, (a.crushedPct + a.clippedPct) / 12);
    var skin = clamp(a.skinPct / 8, 0, 1);
    return exp * 0.35 + range * 0.2 + clean * 0.25 + skin * 0.2;
  }

  function wbGains(a) {
    var rGain = a.meanG / Math.max(a.meanR, 0.02);
    var gGain = 1;
    var bGain = a.meanG / Math.max(a.meanB, 0.02);
    if (a.skinPct > 2.2 && a.skinMeanG > 0.05) {
      var curRG = a.skinMeanR / a.skinMeanG;
      var curBG = a.skinMeanB / a.skinMeanG;
      var skinR = 1.22 / Math.max(0.4, curRG);
      var skinB = 0.78 / Math.max(0.4, curBG);
      var w = clamp(a.skinPct / 10, 0.25, 0.7);
      rGain = rGain * (1 - w) + skinR * w;
      bGain = bGain * (1 - w) + skinB * w;
    }
    var gmean = cbrt(Math.max(1e-6, rGain * gGain * bGain));
    rGain /= gmean;
    gGain /= gmean;
    bGain /= gmean;
    var limit = 1.35;
    return {
      rGain: clamp(rGain, 1 / limit, limit),
      gGain: clamp(gGain, 1 / limit, limit),
      bGain: clamp(bGain, 1 / limit, limit)
    };
  }

  function estimateMean(a, t) {
    var spanIn = Math.max(0.08, t.whiteIn - t.blackIn);
    var mapped =
      ((clamp(a.meanLuma, t.blackIn, t.whiteIn) - t.blackIn) / spanIn) * (t.whiteOut - t.blackOut) + t.blackOut;
    var exposed = mapped * Math.pow(2, t.exposure);
    return clamp(t.pivot + (exposed - t.pivot) * (t.contrast * t.lookContrast), 0, 1);
  }

  function toLumetri(a, t) {
    var sat = clamp((t.saturation - 1) * 100, -30, 40);
    return {
      temperature: round1(clamp(((t.rGain - t.bGain) / 0.28) * 50 + t.warm * 180, -80, 80)),
      tint: round1(clamp(((t.gGain - 1) / 0.18) * -40, -50, 50)),
      exposure: round2(t.exposure),
      contrast: round1(clamp((t.lookContrast - 1) * 95, -20, 40)),
      highlights: round1(clamp(-t.highlightComp * 280 - a.clippedPct * 1.1, -60, 15)),
      shadows: round1(clamp(t.shadowLift * 420 + (a.crushedPct > 1 ? 6 : 0), -20, 40)),
      whites: round1(clamp((t.whiteIn - 0.92) * -180 + (1 - t.whiteIn) * 40, -30, 40)),
      blacks: round1(clamp((0.04 - t.blackIn) * 220, -40, 25)),
      saturation: round1(sat),
      vibrance: round1(t.vibrance * 80),
      fadedFilm: t.fadedFilm,
      vignette: t.vignette,
      shadowLuma: t.shadowLuma,
      highlightLuma: t.highlightLuma
    };
  }

  function buildClip(a, look, hero, matchStrength) {
    var t = {
      rGain: 1,
      gGain: 1,
      bGain: 1,
      blackIn: 0,
      whiteIn: 1,
      blackOut: 0.018,
      whiteOut: 0.962,
      exposure: 0,
      contrast: 1,
      pivot: 0.43,
      highlightComp: look.highlightComp,
      shadowLift: look.shadowLift,
      saturation: 1,
      vibrance: 0,
      warm: look.warm,
      lookContrast: look.contrast
    };
    var wb = wbGains(a);
    t.rGain = wb.rGain;
    t.gGain = wb.gGain;
    t.bGain = wb.bGain;
    t.blackIn = clamp(a.blackPoint - 0.004, 0, 0.25);
    t.whiteIn = clamp(a.whitePoint + 0.01, t.blackIn + 0.35, 1);
    var after =
      ((clamp(a.meanLuma, t.blackIn, t.whiteIn) - t.blackIn) / Math.max(0.08, t.whiteIn - t.blackIn)) *
        (t.whiteOut - t.blackOut) +
      t.blackOut;
    t.exposure = clamp(log2(0.36 / Math.max(0.05, after)), -1.0, 0.8);
    t.highlightComp = look.highlightComp + clamp(a.clippedPct / 50, 0, 0.12);
    t.shadowLift = look.shadowLift + (a.crushedPct > 1.5 ? 0.008 : 0);
    t.lookContrast = look.contrast;
    t.saturation = look.sat;
    t.vibrance = look.vibrance;
    t.warm = look.warm;
    t.fadedFilm = look.fadedFilm;
    t.vignette = look.vignette;
    t.shadowLuma = look.shadowLuma;
    t.highlightLuma = look.highlightLuma;
    if (hero && matchStrength > 0.01) {
      var selfMean = estimateMean(a, t);
      var heroWb = wbGains(hero);
      var heroT = {
        rGain: heroWb.rGain,
        gGain: heroWb.gGain,
        bGain: heroWb.bGain,
        blackIn: clamp(hero.blackPoint - 0.004, 0, 0.25),
        whiteIn: 1,
        blackOut: 0.018,
        whiteOut: 0.962,
        exposure: 0,
        contrast: 1,
        pivot: 0.43,
        lookContrast: look.contrast
      };
      heroT.whiteIn = clamp(hero.whitePoint + 0.01, heroT.blackIn + 0.35, 1);
      var afterHero =
        ((clamp(hero.meanLuma, heroT.blackIn, heroT.whiteIn) - heroT.blackIn) /
          Math.max(0.08, heroT.whiteIn - heroT.blackIn)) *
          (heroT.whiteOut - heroT.blackOut) +
        heroT.blackOut;
      heroT.exposure = clamp(log2(0.36 / Math.max(0.05, afterHero)), -1.0, 0.8);
      var heroMean = estimateMean(hero, heroT);
      var m = matchStrength;
      t.exposure += log2(Math.max(0.08, heroMean) / Math.max(0.08, selfMean)) * m;
      t.rGain = t.rGain * (1 - m) + heroWb.rGain * m;
      t.gGain = t.gGain * (1 - m) + heroWb.gGain * m;
      t.bGain = t.bGain * (1 - m) + heroWb.bGain * m;
    }
    return toLumetri(a, t);
  }

  function unifyLook(list, heroIndex) {
    var hero = list[heroIndex] || list[0];
    var i, g, out = [];
    for (i = 0; i < list.length; i++) {
      g = list[i];
      out.push({
        temperature: clamp(hero.temperature * 0.78 + g.temperature * 0.22, hero.temperature - 6, hero.temperature + 6),
        tint: clamp(hero.tint * 0.78 + g.tint * 0.22, hero.tint - 3, hero.tint + 3),
        exposure: clamp(hero.exposure * 0.72 + g.exposure * 0.28, hero.exposure - 0.18, hero.exposure + 0.18),
        contrast: hero.contrast,
        highlights: g.highlights,
        shadows: g.shadows,
        whites: g.whites,
        blacks: g.blacks,
        saturation: hero.saturation,
        vibrance: hero.vibrance,
        fadedFilm: hero.fadedFilm,
        vignette: hero.vignette,
        shadowLuma: hero.shadowLuma,
        highlightLuma: hero.highlightLuma
      });
    }
    return out;
  }

  function gradeAll(analyses, lookId, matchStrength) {
    var look = LOOKS[lookId] || LOOKS.belgesel;
    var i, best = -1e9, hero = analyses[0], s, heroIndex = 0;
    if (matchStrength == null) matchStrength = 0.9;
    for (i = 0; i < analyses.length; i++) {
      s = heroScore(analyses[i]);
      if (s > best) {
        best = s;
        hero = analyses[i];
        heroIndex = i;
      }
    }
    var out = [];
    for (i = 0; i < analyses.length; i++) {
      out.push(buildClip(analyses[i], look, hero, matchStrength));
    }
    return { lumetri: unifyLook(out, heroIndex), heroIndex: heroIndex };
  }

  root.USTAEngine = {
    analyzeImageData: analyzeImageData,
    gradeAll: gradeAll,
    LOOKS: LOOKS
  };
})(this);
