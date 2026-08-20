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

function USTA_setParam(comp, names, value) {
  var i, k, p, nm;
  if (!comp || !comp.properties) return false;
  for (i = 0; i < names.length; i++) {
    nm = names[i];
    try {
      p = comp.properties.getParamForDisplayName(nm);
      if (p) {
        p.setValue(value, 1);
        return true;
      }
    } catch (e0) {}
    try {
      for (k = 0; k < comp.properties.numItems; k++) {
        p = comp.properties[k];
        if (p && ("" + p.displayName) === nm) {
          p.setValue(value, 1);
          return true;
        }
      }
    } catch (e1) {}
  }
  return false;
}

function USTA_applyToComponent(comp, g) {
  USTA_setParam(comp, ["Temperature", "Sicaklik", "Sıcaklık"], g.t);
  USTA_setParam(comp, ["Tint", "Ton"], g.i);
  USTA_setParam(comp, ["Exposure", "Pozlama"], g.e);
  USTA_setParam(comp, ["Contrast", "Kontrast"], g.c);
  USTA_setParam(comp, ["Highlights", "Acik Tonlar", "Açık Tonlar"], g.h);
  USTA_setParam(comp, ["Shadows", "Golgelar", "Gölgeler"], g.s);
  USTA_setParam(comp, ["Whites", "Beyazlar"], g.w);
  USTA_setParam(comp, ["Blacks", "Siyahlar"], g.b);
  USTA_setParam(comp, ["Saturation", "Doygunluk"], g.sat);
  USTA_setParam(comp, ["Vibrance", "Canlilik", "Canlılık"], g.v);
}

function USTA_addFxToQeClip(qeItem, names) {
  var fx = USTA_getFx(names);
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
  if (!app.project || !app.project.activeSequence) {
    alert("USTA: Aktif sekans yok. Duplicate V1 sekanisini ac.");
    return "sekans yok";
  }
  app.enableQE();
  app.beginUndoGroup("USTA TRT-2 Grade");
  var seq = app.project.activeSequence;
  var track = seq.videoTracks[0];
  var qeTrack = qe.project.getActiveSequence().getVideoTrackAt(0);
  var applied = 0;
  var bcOk = 0;
  var i, clip, g, qeItem, lum, bc;
  try {
    for (i = 0; i < track.clips.numItems; i++) {
      clip = track.clips[i];
      g = grades[i];
      if (!g) g = grades[grades.length - 1];
      if (!g) continue;
      qeItem = USTA_qeItemAt(qeTrack, i);
      lum = USTA_findLumetri(clip);
      if (!lum && qeItem) {
        USTA_addFxToQeClip(qeItem, ["Lumetri Color", "Lumetri Rengi", "Lumetri"]);
        lum = USTA_findLumetri(clip);
      }
      if (lum) {
        USTA_applyToComponent(lum, g);
        applied++;
      }
      bc = USTA_findComp(clip, "broadcast") || USTA_findComp(clip, "yayin") || USTA_findComp(clip, "limiter");
      if (!bc && qeItem) {
        if (USTA_addFxToQeClip(qeItem, ["Broadcast Colors", "Yayin Renkleri", "Yayın Renkleri", "Video Limiter"])) {
          bcOk++;
        }
      } else if (bc) {
        bcOk++;
      }
    }
  } catch (eRun) {
    app.endUndoGroup();
    alert("USTA hata: " + eRun);
    return String(eRun);
  }
  app.endUndoGroup();
  return applied + " Lumetri / " + bcOk + " legalizer";
}

function USTA_grade() {
  var g = { t: 4, i: -2, e: 0.12, c: 16, h: -14, s: 8, w: 6, b: -11, sat: 7, v: 8 };
  return USTA_run([g]);
}

function USTA_applyJson(raw) {
  var data = eval("(" + raw + ")");
  var list = [];
  var i, c, L, g;
  var clips = data.clips || [];
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
  if (!list.length) {
    alert("USTA: JSON icinde lumetri yok.");
    return "json bos";
  }
  return USTA_run(list);
}

function USTA_exportFrames() {
  if (!app.project || !app.project.activeSequence) {
    alert("USTA: Aktif sekans yok.");
    return "sekans yok";
  }
  var seq = app.project.activeSequence;
  var track = seq.videoTracks[0];
  var folder = Folder.selectDialog("USTA kare klasoru");
  if (!folder) return "iptal";
  var i, clip, t, out, ok;
  ok = 0;
  app.enableQE();
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
  alert("USTA: " + ok + " kare\n" + folder.fsName);
  return String(ok);
}
