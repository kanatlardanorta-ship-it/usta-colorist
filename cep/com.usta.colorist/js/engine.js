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
    var centerLuma = 0, centerN = 0, cornerLuma = 0, cornerN = 0;
    var n = width * height;
    var r8, g8, b8, r, g, b, y, max, min, pix, x, yx, dx, dy, d2;
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
      pix = (i / 4) | 0;
      x = pix % width;
      yx = (pix / width) | 0;
      dx = x / width - 0.5;
      dy = yx / height - 0.5;
      d2 = dx * dx + dy * dy;
      if (d2 < 0.045) {
        centerLuma += y;
        centerN++;
      } else if (d2 > 0.32) {
        cornerLuma += y;
        cornerN++;
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
      centerLuma: centerN ? centerLuma / centerN : meanLuma,
      cornerLuma: cornerN ? cornerLuma / cornerN : meanLuma,
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
    var rGain, gGain, bGain, curRG, curBG;
    gGain = 1;
    if (a.skinPct > 2.0 && a.skinMeanG > 0.04) {
      curRG = a.skinMeanR / a.skinMeanG;
      curBG = a.skinMeanB / a.skinMeanG;
      rGain = 1.16 / Math.max(0.55, curRG);
      bGain = 0.84 / Math.max(0.4, curBG);
    } else {
      rGain = a.meanG / Math.max(a.meanR, 0.02);
      bGain = a.meanG / Math.max(a.meanB, 0.02);
    }
    var gmean = cbrt(Math.max(1e-6, rGain * gGain * bGain));
    rGain /= gmean;
    gGain /= gmean;
    bGain /= gmean;
    var limit = a.skinPct > 2 ? 1.12 : 1.22;
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
    var sat = clamp((t.saturation - 1) * 100, -12, 8);
    var tLim = a.skinPct > 2 ? 12 : 20;
    return {
      temperature: round1(clamp(((t.rGain - t.bGain) / 0.28) * 50 + t.warm * 180, -tLim, tLim)),
      tint: round1(clamp(((t.gGain - 1) / 0.18) * -40, -8, 8)),
      exposure: round2(clamp(t.exposure, -0.32, 0.28)),
      contrast: round1(clamp((t.lookContrast - 1) * 95, -8, 14)),
      highlights: round1(clamp(-t.highlightComp * 220 - a.clippedPct * 0.8, -32, 6)),
      shadows: round1(clamp(t.shadowLift * 320 + (a.crushedPct > 1 ? 4 : 0), -10, 14)),
      whites: round1(clamp((t.whiteIn - 0.95) * -100, -18, 8)),
      blacks: round1(clamp((0.045 - t.blackIn) * 160, -16, 8)),
      saturation: round1(sat),
      vibrance: 0,
      fadedFilm: 0,
      vignette: 0,
      shadowLuma: 0,
      highlightLuma: 0
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
    var span = a.whitePoint - a.blackPoint;
    var after =
      ((clamp(a.meanLuma, t.blackIn, t.whiteIn) - t.blackIn) / Math.max(0.08, t.whiteIn - t.blackIn)) *
        (t.whiteOut - t.blackOut) +
      t.blackOut;
    t.exposure = clamp(log2(0.36 / Math.max(0.05, after)), -1.0, 0.8);
    t.highlightComp = look.highlightComp + clamp(a.clippedPct / 50, 0, 0.12);
    t.shadowLift = look.shadowLift + (a.crushedPct > 1.5 ? 0.008 : 0);
    t.lookContrast = 1 + (look.contrast - 1) * 0.4 * (span > 0.82 ? 0.5 : span < 0.52 ? 1.35 : 1);
    t.saturation = 1 + (look.sat - 1) * 0.35;
    if (a.meanSat > 0.42) t.saturation *= 0.97;
    else if (a.meanSat < 0.17) t.saturation *= 1.02;
    t.vibrance = 0;
    t.warm = look.warm * 0.35;
    t.fadedFilm = 0;
    t.vignette = 0;
    t.shadowLuma = 0;
    t.highlightLuma = 0;
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

  function medianNum(arr) {
    var a = arr.slice().sort(function (x, y) {
      return x - y;
    });
    return a[(a.length / 2) | 0];
  }

  function medianAnalyses(list) {
    var clean = [];
    var i, k, keys, out, pick, vals;
    for (i = 0; i < list.length; i++) if (list[i]) clean.push(list[i]);
    if (!clean.length) return null;
    if (clean.length === 1) return clean[0];
    keys = [
      "blackPoint",
      "whitePoint",
      "meanLuma",
      "meanR",
      "meanG",
      "meanB",
      "meanSat",
      "crushedPct",
      "clippedPct",
      "skinPct",
      "tempHint",
      "centerLuma",
      "cornerLuma"
    ];
    out = {};
    for (k = 0; k < keys.length; k++) {
      vals = [];
      for (i = 0; i < clean.length; i++) vals.push(clean[i][keys[k]] || 0);
      out[keys[k]] = medianNum(vals);
    }
    pick = clean[0];
    for (i = 1; i < clean.length; i++) if ((clean[i].skinPct || 0) > (pick.skinPct || 0)) pick = clean[i];
    out.skinMeanR = pick.skinMeanR;
    out.skinMeanG = pick.skinMeanG;
    out.skinMeanB = pick.skinMeanB;
    return out;
  }

  function clusterScenes(analyses) {
    var scenes = [];
    var cur = [0];
    var i, dL, dT;
    for (i = 1; i < analyses.length; i++) {
      dL = Math.abs((analyses[i].meanLuma || 0) - (analyses[i - 1].meanLuma || 0));
      dT = Math.abs((analyses[i].tempHint || 0) - (analyses[i - 1].tempHint || 0));
      if (dL > 0.13 || dT > 20) {
        scenes.push(cur);
        cur = [i];
      } else cur.push(i);
    }
    scenes.push(cur);
    return scenes;
  }

  function makePrint(look) {
    return {
      temperature: round1(look.warm * 140),
      tint: 0,
      exposure: -0.05,
      contrast: round1((look.contrast - 1) * 85),
      highlights: round1(-look.highlightComp * 180),
      shadows: 3,
      whites: -6,
      blacks: -2,
      saturation: round1((look.sat - 1) * 100),
      vibrance: round1(look.vibrance * 80),
      fadedFilm: look.fadedFilm,
      vignette: look.vignette,
      shadowLuma: look.shadowLuma,
      highlightLuma: look.highlightLuma
    };
  }

  function lockScene(list, members) {
    var i, idx, medT, medE, medW, temps, exps, whites;
    if (members.length < 2) return;
    temps = [];
    exps = [];
    whites = [];
    for (i = 0; i < members.length; i++) {
      temps.push(list[members[i]].temperature);
      exps.push(list[members[i]].exposure);
      whites.push(list[members[i]].whites);
    }
    medT = medianNum(temps);
    medE = medianNum(exps);
    medW = medianNum(whites);
    for (i = 0; i < members.length; i++) {
      idx = members[i];
      list[idx].temperature = round1(clamp(list[idx].temperature * 0.3 + medT * 0.7, medT - 6, medT + 6));
      list[idx].tint = round1(clamp(list[idx].tint, -6, 6));
      list[idx].exposure = round2(clamp(list[idx].exposure * 0.4 + medE * 0.6, medE - 0.16, medE + 0.16));
      list[idx].whites = round1(clamp(list[idx].whites, -16, 8));
      list[idx].blacks = round1(clamp(list[idx].blacks, -14, 8));
    }
  }

  function sceneOfFrom(scenes, n) {
    var i, j, out = [];
    for (i = 0; i < n; i++) out[i] = 0;
    for (i = 0; i < scenes.length; i++) {
      for (j = 0; j < scenes[i].length; j++) out[scenes[i][j]] = i;
    }
    return out;
  }

  function flagClips(lumetri, analyses, sceneOf) {
    var i, L, a, flags, reasons, medT, j, temps;
    flags = [];
    for (i = 0; i < lumetri.length; i++) {
      L = lumetri[i];
      a = analyses[i] || {};
      reasons = [];
      temps = [];
      for (j = 0; j < lumetri.length; j++) if (sceneOf[j] === sceneOf[i]) temps.push(lumetri[j].temperature);
      medT = temps.length ? medianNum(temps) : 0;
      if (Math.abs(L.temperature) > 14) reasons.push("T" + L.temperature);
      if (Math.abs(L.temperature - medT) > 7) reasons.push("sahneT");
      if (L.whites > 10) reasons.push("whites" + L.whites);
      if (L.blacks > 8) reasons.push("blacks");
      if (Math.abs(L.exposure) > 0.3) reasons.push("E" + L.exposure);
      if ((a.skinPct || 0) > 2 && L.temperature < -10) reasons.push("tenSoguk");
      if (reasons.length) flags.push({ i: i, reasons: reasons });
    }
    return flags;
  }

  function qcPicture(a, sceneMedLuma, L) {
    var reasons = [];
    if (!a) return reasons;
    if ((a.skinPct || 0) > 2 && a.skinMeanB > a.skinMeanR * 0.98) reasons.push("tenMavi");
    if (sceneMedLuma != null && Math.abs(a.meanLuma - sceneMedLuma) > 0.14) reasons.push("luma");
    if (L && Math.abs(L.temperature) > 14) reasons.push("T");
    return reasons;
  }

  function repairClip(L, sceneMed) {
    return {
      temperature: round1(L.temperature * 0.15 + sceneMed.temperature * 0.85),
      tint: round1(L.tint * 0.25 + sceneMed.tint * 0.75),
      exposure: round2(clamp(L.exposure * 0.3 + sceneMed.exposure * 0.7, -0.22, 0.2)),
      contrast: L.contrast,
      highlights: clamp(L.highlights, -28, 4),
      shadows: L.shadows,
      whites: round1(clamp(L.whites * 0.3 + sceneMed.whites * 0.7, -14, 6)),
      blacks: round1(clamp(L.blacks, -12, 6)),
      saturation: L.saturation,
      vibrance: 0,
      fadedFilm: 0,
      vignette: 0,
      shadowLuma: 0,
      highlightLuma: 0
    };
  }

  function sceneMedian(list, members) {
    var i, k, keys, vals, out;
    keys = ["temperature", "tint", "exposure", "whites", "blacks", "highlights", "contrast", "saturation"];
    out = {};
    for (k = 0; k < keys.length; k++) {
      vals = [];
      for (i = 0; i < members.length; i++) vals.push(list[members[i]][keys[k]]);
      out[keys[k]] = medianNum(vals);
    }
    return out;
  }

  function gradeAll(analyses, lookId, matchStrength) {
    var look = LOOKS[lookId] || LOOKS.belgesel;
    var scenes = clusterScenes(analyses);
    var out = [];
    var s, members, hero, j, idx, best, sc, heroIndex = 0;
    var sceneOf;
    if (matchStrength == null) matchStrength = 0.88;
    for (s = 0; s < scenes.length; s++) {
      members = scenes[s];
      best = -1e9;
      hero = analyses[members[0]];
      for (j = 0; j < members.length; j++) {
        sc = heroScore(analyses[members[j]]);
        if (sc > best) {
          best = sc;
          hero = analyses[members[j]];
          if (s === 0) heroIndex = members[j];
        }
      }
      for (j = 0; j < members.length; j++) {
        idx = members[j];
        out[idx] = buildClip(analyses[idx], look, hero, matchStrength);
      }
      lockScene(out, members);
    }
    sceneOf = sceneOfFrom(scenes, analyses.length);
    return {
      lumetri: out,
      print: makePrint(look),
      scenes: scenes.length,
      sceneLists: scenes,
      sceneOf: sceneOf,
      flags: flagClips(out, analyses, sceneOf),
      heroIndex: heroIndex
    };
  }

  root.USTAEngine = {
    analyzeImageData: analyzeImageData,
    medianAnalyses: medianAnalyses,
    gradeAll: gradeAll,
    flagClips: flagClips,
    qcPicture: qcPicture,
    repairClip: repairClip,
    sceneMedian: sceneMedian,
    LOOKS: LOOKS
  };
})(this);
