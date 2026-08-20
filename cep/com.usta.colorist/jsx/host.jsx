function USTA_ping() {
  var msg, seq, n;
  msg = "PPro " + app.version;
  try {
    app.enableQE();
    msg += " | QE ok";
  } catch (e0) {
    msg += " | QE FAIL";
  }
  try {
    if (!app.project || !app.project.activeSequence) {
      return msg + " | no sequence";
    }
    seq = app.project.activeSequence;
    n = 0;
    try {
      n = seq.videoTracks[0].clips.numItems;
    } catch (e1) {}
    return msg + " | " + seq.name + " | V1 " + n + " clips";
  } catch (e2) {
    return msg + " | seq ERR";
  }
}

function USTA_beginUndo(name) {
  try {
    if (typeof app.beginUndoGroup === "function") app.beginUndoGroup(name);
  } catch (e) {}
}

function USTA_endUndo() {
  try {
    if (typeof app.endUndoGroup === "function") app.endUndoGroup();
  } catch (e) {}
}

function USTA_getFx(nameList) {
  var i, fx;
  for (i = 0; i < nameList.length; i++) {
    try {
      fx = qe.project.getVideoEffectByName(nameList[i]);
      if (fx) return fx;
    } catch (e) {}
  }
  return null;
}

function USTA_findComp(clip, needle) {
  var i, c, name;
  if (!clip || !clip.components) return null;
  needle = ("" + needle).toLowerCase();
  for (i = 0; i < clip.components.numItems; i++) {
    c = clip.components[i];
    name = ("" + c.displayName).toLowerCase();
    if (name.indexOf(needle) >= 0) return c;
  }
  return null;
}

function USTA_findLumetri(clip) {
  return USTA_findComp(clip, "lumetri");
}

function USTA_hitName(display, names) {
  var i, a, b;
  a = ("" + display).toLowerCase();
  for (i = 0; i < names.length; i++) {
    b = ("" + names[i]).toLowerCase();
    if (a === b) return true;
  }
  return false;
}

function USTA_writeProp(p, value) {
  try {
    p.setValue(value, 1);
    return true;
  } catch (e0) {
    try {
      p.setValue(value, true);
      return true;
    } catch (e1) {
      try {
        p.setValue(value);
        return true;
      } catch (e2) {
        return false;
      }
    }
  }
}

function USTA_walkSet(props, names, value, depth) {
  var i, p;
  if (!props || depth > 5) return false;
  try {
    if (props.getParamForDisplayName) {
      for (i = 0; i < names.length; i++) {
        try {
          p = props.getParamForDisplayName(names[i]);
          if (p && USTA_writeProp(p, value)) return true;
        } catch (eG) {}
      }
    }
  } catch (e0) {}
  try {
    for (i = 0; i < props.numItems; i++) {
      p = props[i];
      if (!p) continue;
      if (USTA_hitName(p.displayName, names)) {
        if (USTA_writeProp(p, value)) return true;
      }
      if (p.properties && p.properties.numItems) {
        if (USTA_walkSet(p.properties, names, value, depth + 1)) return true;
      }
    }
  } catch (e1) {}
  return false;
}

function USTA_setParam(comp, names, value) {
  if (!comp || !comp.properties) return false;
  return USTA_walkSet(comp.properties, names, value, 0);
}

function USTA_dumpProps(comp, prefix, acc, depth) {
  var i, p, n;
  if (!comp || !comp.properties || depth > 4 || acc.length > 40) return;
  try {
    for (i = 0; i < comp.properties.numItems; i++) {
      p = comp.properties[i];
      n = prefix + (p ? p.displayName : "?");
      acc.push(n);
      if (p && p.properties && p.properties.numItems) {
        USTA_dumpProps(p, n + "/", acc, depth + 1);
      }
    }
  } catch (e) {}
}

function USTA_applyToComponent(comp, g) {
  var n = 0;
  if (USTA_setParam(comp, ["Temperature", "Sicaklik", "Sıcaklık"], g.t)) n++;
  if (USTA_setParam(comp, ["Tint", "Ton"], g.i)) n++;
  if (USTA_setParam(comp, ["Exposure", "Pozlama"], g.e)) n++;
  if (USTA_setParam(comp, ["Contrast", "Kontrast"], g.c)) n++;
  if (USTA_setParam(comp, ["Highlights", "Acik Tonlar", "Açık Tonlar"], g.h)) n++;
  if (USTA_setParam(comp, ["Shadows", "Golgeler", "Gölgeler"], g.s)) n++;
  if (USTA_setParam(comp, ["Whites", "Beyazlar"], g.w)) n++;
  if (USTA_setParam(comp, ["Blacks", "Siyahlar"], g.b)) n++;
  if (USTA_setParam(comp, ["Saturation", "Doygunluk"], 100 + g.sat)) n++;
  if (USTA_setParam(comp, ["Vibrance", "Canlilik", "Canlılık"], g.v)) n++;
  return n;
}

function USTA_addFxToQeClip(qeItem, names) {
  var fx;
  if (!qeItem) return false;
  fx = USTA_getFx(names);
  if (!fx) return false;
  try {
    qeItem.addVideoEffect(fx);
    return true;
  } catch (e) {
    return false;
  }
}

function USTA_qeItemAt(qeTrack, index) {
  try {
    return qeTrack.getItemAt(index);
  } catch (e) {
    return null;
  }
}

function USTA_run(grades) {
  var seq, track, qeTrack, applied, bcOk, paramOk, i, clip, g, qeItem, lum, bc, wrote, dump;
  if (!app.project || !app.project.activeSequence) {
    return "ERR: aktif sekans yok";
  }
  try {
    app.enableQE();
  } catch (eQE) {
    return "ERR: QE acilamadi";
  }
  USTA_beginUndo("USTA TRT-2 Grade");
  applied = 0;
  bcOk = 0;
  paramOk = 0;
  dump = [];
  try {
    seq = app.project.activeSequence;
    track = seq.videoTracks[0];
    try {
      qeTrack = qe.project.getActiveSequence().getVideoTrackAt(0);
    } catch (eT) {
      qeTrack = null;
    }
    for (i = 0; i < track.clips.numItems; i++) {
      clip = track.clips[i];
      g = grades[i];
      if (!g) g = grades[grades.length - 1];
      if (!g) continue;
      qeItem = qeTrack ? USTA_qeItemAt(qeTrack, i) : null;
      lum = USTA_findLumetri(clip);
      if (!lum && qeItem) {
        USTA_addFxToQeClip(qeItem, ["Lumetri Color", "Lumetri Rengi", "Lumetri"]);
        lum = USTA_findLumetri(clip);
      }
      if (lum) {
        wrote = USTA_applyToComponent(lum, g);
        applied++;
        paramOk += wrote;
        if (wrote === 0 && dump.length === 0) {
          USTA_dumpProps(lum, "", dump, 0);
        }
      }
      bc = USTA_findComp(clip, "broadcast") || USTA_findComp(clip, "limiter") || USTA_findComp(clip, "legal");
      if (!bc && qeItem) {
        if (USTA_addFxToQeClip(qeItem, ["Broadcast Colors", "Yayin Renkleri", "Yayın Renkleri", "Video Limiter"])) {
          bcOk++;
        }
      } else if (bc) {
        bcOk++;
      }
    }
  } catch (eRun) {
    USTA_endUndo();
    return "ERR: " + eRun;
  }
  USTA_endUndo();
  if (applied === 0) return "ERR: V1'de klip/Lumetri yok";
  if (paramOk === 0) {
    return "OK " + applied + " Lumetri bulundu ama parametre yazilamadi. Props: " + dump.join(", ");
  }
  return "OK " + applied + " Lumetri / " + paramOk + " param / " + bcOk + " legalizer";
}

function USTA_applyJson(raw) {
  var data, list, i, c, L, g, clips;
  try {
    data = eval("(" + raw + ")");
    list = [];
    clips = data.clips || [];
    for (i = 0; i < clips.length; i++) {
      c = clips[i];
      L = c.lumetri;
      if (!L) continue;
      g = {
        t: L.temperature,
        i: L.tint,
        e: L.exposure,
        c: L.contrast,
        h: L.highlights,
        s: L.shadows,
        w: L.whites,
        b: L.blacks,
        sat: L.saturation,
        v: L.vibrance
      };
      list.push(g);
    }
    if (!list.length) return "ERR: JSON lumetri yok";
    return USTA_run(list);
  } catch (e) {
    return "ERR json: " + e;
  }
}

function USTA_esc(s) {
  return ("" + s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function USTA_pad(n) {
  var s = "0000" + n;
  return s.substring(s.length - 4);
}

function USTA_pad2(n) {
  n = Math.floor(Math.abs(n));
  return n < 10 ? "0" + n : "" + n;
}

function USTA_fps(seq) {
  var fps = 25;
  try {
    fps = Math.round(1 / seq.getSettings().videoFrameRate.seconds);
  } catch (e0) {
    try {
      fps = Math.round(seq.framerate);
    } catch (e1) {}
  }
  if (!fps || fps < 1 || fps > 120) fps = 25;
  return fps;
}

function USTA_timecode(seconds, fps) {
  var total, ff, ss, mm, hh;
  total = Math.round(seconds * fps);
  ff = total % fps;
  ss = Math.floor(total / fps);
  mm = Math.floor(ss / 60);
  ss = ss % 60;
  hh = Math.floor(mm / 60);
  mm = mm % 60;
  return USTA_pad2(hh) + ":" + USTA_pad2(mm) + ":" + USTA_pad2(ss) + ":" + USTA_pad2(ff);
}

function USTA_methods(obj) {
  var k, n, s;
  s = [];
  try {
    for (k in obj) {
      n = ("" + k).toLowerCase();
      if (
        n.indexOf("export") >= 0 ||
        n.indexOf("frame") >= 0 ||
        n.indexOf("png") >= 0 ||
        n.indexOf("cti") >= 0 ||
        n.indexOf("player") >= 0
      ) {
        s.push(k);
      }
    }
  } catch (e) {}
  return s.join("|");
}


function USTA_sep() {
  return Folder.fs === "Macintosh" ? "/" : "\\";
}

function USTA_stem(folder, index) {
  return folder.fsName + USTA_sep() + "usta_" + USTA_pad(index + 1);
}

function USTA_resolvePng(stem) {
  var a, i, f;
  a = [stem + ".png", stem + ".png.png", stem];
  for (i = 0; i < a.length; i++) {
    try {
      f = new File(a[i]);
      if (f.exists && f.length > 200) return f.fsName.replace(/\\/g, "/");
    } catch (e) {}
  }
  return "";
}

function USTA_tryWritePng(seq, qeSeq, stem, seconds) {
  var err = "";
  var fps, tc, cti, found, hit;
  fps = USTA_fps(seq);
  tc = USTA_timecode(seconds, fps);
  cti = "";
  try {
    if (qeSeq && qeSeq.CTI) cti = "" + qeSeq.CTI.timecode;
  } catch (eC) {
    err += "cti:" + eC + ";";
  }

  function after(tag) {
    found = USTA_resolvePng(stem);
    if (found) return { m: tag, err: err, tc: tc, fps: fps, cti: cti, path: found };
    return null;
  }

  function call(tag, a, b) {
    try {
      qeSeq.exportFramePNG(a, b);
      return after(tag);
    } catch (e) {
      err += tag + ":" + e + ";";
      return null;
    }
  }

  if (!qeSeq) {
    err += "noQE;";
    return { m: "", err: err, tc: tc, fps: fps, cti: cti, path: "", methods: "noqe" };
  }

  if (cti) {
    hit = call("cti.noext", cti, stem);
    if (hit) return hit;
    hit = call("cti.png", cti, stem + ".png");
    if (hit) return hit;
  }
  if (tc) {
    hit = call("tc.noext", tc, stem);
    if (hit) return hit;
    hit = call("tc.png", tc, stem + ".png");
    if (hit) return hit;
  }
  try {
    hit = call("ticks.noext", seq.getPlayerPosition().ticks, stem);
    if (hit) return hit;
  } catch (eT) {
    err += "ticks:" + eT + ";";
  }

  return {
    m: "",
    err: err,
    tc: tc,
    fps: fps,
    cti: cti,
    path: "",
    methods: USTA_methods(qeSeq)
  };
}

function USTA_beginExport() {
  var seq, track, folder, i, old;
  try {
    if (!app.project || !app.project.activeSequence) return '{"ok":0,"err":"sekans yok"}';
    seq = app.project.activeSequence;
    track = seq.videoTracks[0];
    folder = new Folder(Folder.desktop.fsName + USTA_sep() + "USTA_frames");
    if (!folder.exists) folder.create();
    try {
      old = folder.getFiles("usta_*");
      for (i = 0; i < old.length; i++) {
        try { old[i].remove(); } catch (eRm) {}
      }
    } catch (eOld) {}
    try { app.enableQE(); } catch (eQ) {}
    return '{"ok":1,"folder":"' + USTA_esc(folder.fsName.replace(/\\/g, "/")) + '","count":' + track.clips.numItems + "}";
  } catch (e) {
    return '{"ok":0,"err":"' + USTA_esc(e) + '"}';
  }
}

function USTA_exportOne(index) {
  var seq, track, clip, t, ticks, folder, qeSeq, name, wrote, nfiles, listed, stem;
  try {
    index = parseInt(index, 10);
    if (!app.project || !app.project.activeSequence) return '{"ok":0,"err":"sekans yok"}';
    seq = app.project.activeSequence;
    track = seq.videoTracks[0];
    if (index < 0 || index >= track.clips.numItems) return '{"ok":0,"err":"index"}';
    clip = track.clips[index];
    name = clip.name;
    t = clip.start.seconds + clip.duration.seconds * 0.35;
    ticks = Math.round(t * 254016000000).toString();
    try { seq.setPlayerPosition(ticks); } catch (ePos) {}
    try { app.enableQE(); } catch (eQ) {}
    try { qeSeq = qe.project.getActiveSequence(); } catch (eQs) { qeSeq = null; }
    try { $.sleep(180); } catch (eSl) {}
    folder = new Folder(Folder.desktop.fsName + USTA_sep() + "USTA_frames");
    if (!folder.exists) folder.create();
    stem = USTA_stem(folder, index);
    wrote = USTA_tryWritePng(seq, qeSeq, stem, t);
    nfiles = 0;
    listed = "";
    try {
      nfiles = folder.getFiles("*").length;
      if (nfiles) listed = folder.getFiles("*")[0].name;
    } catch (eN) {}
    return '{"ok":1,"i":' + index +
      ',"name":"' + USTA_esc(name) +
      '","path":"' + USTA_esc(wrote.path || "") +
      '","exists":' + (wrote.path ? 1 : 0) +
      ',"method":"' + USTA_esc(wrote.m) +
      '","err":"' + USTA_esc(wrote.err) +
      '","tc":"' + USTA_esc(wrote.tc) +
      '","cti":"' + USTA_esc(wrote.cti) +
      '","fps":' + (wrote.fps || 0) +
      ',"nfiles":' + nfiles +
      ',"listed":"' + USTA_esc(listed) +
      '","methods":"' + USTA_esc(wrote.methods) + '"}';
  } catch (e) {
    return '{"ok":0,"err":"' + USTA_esc(e) + '"}';
  }
}

function USTA_openTemp() {
  try {
    var folder = new Folder(Folder.desktop.fsName + USTA_sep() + "USTA_frames");
    if (!folder.exists) folder.create();
    folder.execute();
    return folder.fsName;
  } catch (e) {
    return "ERR " + e;
  }
}
