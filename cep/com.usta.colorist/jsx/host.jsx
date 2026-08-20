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
    if (a === b || a.indexOf(b) >= 0 || b.indexOf(a) >= 0) return true;
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
  if (USTA_setParam(comp, ["Saturation", "Doygunluk"], g.sat)) n++;
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

function USTA_grade() {
  var g;
  try {
    g = { t: 4, i: -2, e: 0.12, c: 16, h: -14, s: 8, w: 6, b: -11, sat: 7, v: 8 };
    return USTA_run([g]);
  } catch (e) {
    return "ERR grade: " + e;
  }
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

function USTA_exportFrames() {
  var seq, track, folder, i, clip, t, out, ok;
  try {
    if (!app.project || !app.project.activeSequence) return "ERR: sekans yok";
    seq = app.project.activeSequence;
    track = seq.videoTracks[0];
    folder = Folder.selectDialog("USTA kare klasoru");
    if (!folder) return "iptal";
    ok = 0;
    try {
      app.enableQE();
    } catch (eQ) {}
    for (i = 0; i < track.clips.numItems; i++) {
      clip = track.clips[i];
      t = clip.start.seconds + clip.duration.seconds * 0.35;
      try {
        seq.setPlayerPosition(Math.round(t * 254016000000).toString());
      } catch (ePos) {}
      out = new File(folder.fsName + "/usta_" + ("00" + (i + 1)).slice(-3) + ".png");
      try {
        if (seq.exportFramePNG) {
          seq.exportFramePNG(seq.getPlayerPosition(), out.fsName);
          ok++;
        } else {
          qe.project.getActiveSequence().player.exportFrame(out.fsName, 1);
          ok++;
        }
      } catch (eExp) {}
    }
    return "OK " + ok + " kare -> " + folder.fsName;
  } catch (e) {
    return "ERR export: " + e;
  }
}
