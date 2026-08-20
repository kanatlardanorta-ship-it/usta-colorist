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
  alert("USTA: " + ok + " kare\\n" + folder.fsName);
  return String(ok);
}

USTA_exportFrames();
