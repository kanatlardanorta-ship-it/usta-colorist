(function () {
  var logEl = document.getElementById("log");
  var hostReady = false;
  var busy = false;

  function log(msg) {
    logEl.textContent = String(msg == null ? "" : msg);
  }

  function evalScript(code, cb) {
    if (!window.__adobe_cep__ || !window.__adobe_cep__.evalScript) {
      log("CEP yok — bu pencere Premiere panelinde acilmali.");
      return;
    }
    window.__adobe_cep__.evalScript(code, function (r) {
      if (cb) cb(r);
    });
  }

  function extPath() {
    var path;
    if (!window.__adobe_cep__) return "";
    path = window.__adobe_cep__.getSystemPath("extension");
    try {
      path = decodeURI(path);
    } catch (e) {}
    path = String(path).replace(/^file:\/\//, "");
    if (/^\/[A-Za-z]:\//.test(path)) path = path.substr(1);
    path = path.replace(/\\/g, "/");
    return path;
  }

  function fileUrl(p) {
    p = String(p).replace(/\\/g, "/");
    if (/^[A-Za-z]:\//.test(p)) return "file:///" + p;
    if (p.indexOf("file:") === 0) return p;
    return "file://" + p;
  }

  function pad4(n) {
    var s = "0000" + n;
    return s.substring(s.length - 4);
  }

  function loadImage(path, cb) {
    var img = new Image();
    img.onload = function () {
      cb(null, img);
    };
    img.onerror = function () {
      cb("img " + path);
    };
    img.src = fileUrl(path);
  }

  function analyzeImg(img) {
    var maxW = 480;
    var scale = Math.min(1, maxW / img.width);
    var c = document.createElement("canvas");
    c.width = Math.max(2, Math.round(img.width * scale));
    c.height = Math.max(2, Math.round(img.height * scale));
    var ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return window.USTAEngine.analyzeImageData(ctx.getImageData(0, 0, c.width, c.height));
  }

  function analyzeFolder(folder, count, names, onDone) {
    var analyses = [];
    var i = 0;
    function next() {
      if (i >= count) {
        onDone(null, analyses);
        return;
      }
      var idx = i;
      var path = folder + "/usta_" + pad4(idx + 1) + ".png";
      log("Analiz " + (idx + 1) + "/" + count + "  " + (names[idx] || ""));
      loadImage(path, function (err, img) {
        if (err || !img) {
          analyses[idx] = null;
          i++;
          next();
          return;
        }
        try {
          analyses[idx] = analyzeImg(img);
        } catch (eA) {
          analyses[idx] = null;
        }
        i++;
        next();
      });
    }
    next();
  }

  function applyList(lumetriList, cb) {
    var clips = [];
    var i, L;
    for (i = 0; i < lumetriList.length; i++) {
      L = lumetriList[i];
      clips.push({ lumetri: L });
    }
    var raw = JSON.stringify({ clips: clips });
    var escaped = raw.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    evalScript('USTA_applyJson("' + escaped + '")', cb);
  }

  function fillMissing(analyses) {
    var i, j, found;
    found = null;
    for (i = 0; i < analyses.length; i++) {
      if (analyses[i]) {
        found = analyses[i];
        break;
      }
    }
    if (!found) return false;
    for (i = 0; i < analyses.length; i++) {
      if (!analyses[i]) {
        for (j = i; j < analyses.length; j++) {
          if (analyses[j]) {
            analyses[i] = analyses[j];
            break;
          }
        }
        if (!analyses[i]) analyses[i] = found;
      }
    }
    return true;
  }

  function runAnalyzeGrade() {
    if (busy) return;
    if (!window.USTAEngine) {
      log("engine.js yok");
      return;
    }
    busy = true;
    log("Kareler aktariliyor (V1 orta kare, LUT'lu program)...");
    evalScript("USTA_exportSilent()", function (r) {
      var info;
      try {
        info = JSON.parse(String(r || "{}"));
      } catch (eP) {
        busy = false;
        log("Export JSON hatasi: " + r);
        return;
      }
      if (!info.ok) {
        busy = false;
        log("Export basarisiz: " + (info.err || r));
        return;
      }
      if (!info.exported) {
        busy = false;
        log("PNG yazilamadi. File > Scripts ile kare aktar, ya da Premiere surumunu kontrol et.");
        return;
      }
      log(info.exported + "/" + info.count + " kare. Analiz basliyor...");
      analyzeFolder(info.folder, info.count, info.names || [], function (err, analyses) {
        var okN = 0;
        var k;
        for (k = 0; k < analyses.length; k++) if (analyses[k]) okN++;
        if (!fillMissing(analyses)) {
          busy = false;
          log("Hic kare okunamadi. Klasor: " + info.folder);
          return;
        }
        var look = document.getElementById("look").value || "belgesel";
        var graded = window.USTAEngine.gradeAll(analyses, look, 0.78);
        var lines = [];
        lines.push("Analiz " + okN + "/" + info.count + "  look " + look + "  hero #" + (graded.heroIndex + 1));
        for (k = 0; k < graded.lumetri.length; k++) {
          var g = graded.lumetri[k];
          var nm = (info.names && info.names[k]) || "#" + (k + 1);
          lines.push(
            (k + 1) +
              " " +
              nm +
              "  T" +
              g.temperature +
              " E" +
              g.exposure +
              " C" +
              g.contrast +
              " B" +
              g.blacks +
              " Sat" +
              (100 + g.saturation)
          );
        }
        log(lines.join("\n") + "\nLumetri yaziliyor...");
        applyList(graded.lumetri, function (res) {
          busy = false;
          log(lines.join("\n") + "\n" + (res && res !== "undefined" ? res : "yazildi"));
        });
      });
    });
  }

  function evalFileFallbacks(done) {
    var base = extPath();
    var variants = [
      '$.evalFile("' + base + '/jsx/host.jsx")',
      '$.evalFile(new File("' + base + '/jsx/host.jsx"))'
    ];
    var i = 0;
    function next() {
      if (i >= variants.length) {
        done(false, "host.jsx yuklenemedi");
        return;
      }
      var code = variants[i++];
      evalScript(code, function (r) {
        var s = String(r || "");
        if (s.indexOf("EvalScript") >= 0 || s.indexOf("Error") >= 0) {
          next();
          return;
        }
        done(true, s);
      });
    }
    next();
  }

  function afterHost(ok, detail) {
    if (!ok) {
      log(detail || "host yuklenemedi");
      return;
    }
    evalScript("USTA_ping()", function (p) {
      var s = String(p || "");
      if (s.indexOf("EvalScript") >= 0) {
        hostReady = false;
        log("host yok: " + s);
        return;
      }
      hostReady = true;
      log(s + "\nHazir. Analiz et = klibe ozel grade.");
    });
  }

  function loadHost() {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", "jsx/host.jsx", true);
    try {
      xhr.overrideMimeType("text/plain; charset=utf-8");
    } catch (eM) {}
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      var src = xhr.responseText || "";
      if (src.length < 40) {
        evalFileFallbacks(afterHost);
        return;
      }
      evalScript(src, function (r) {
        var s = String(r || "");
        if (s.indexOf("EvalScript") >= 0) {
          evalFileFallbacks(afterHost);
          return;
        }
        afterHost(true, s);
      });
    };
    xhr.onerror = function () {
      evalFileFallbacks(afterHost);
    };
    xhr.send();
  }

  document.getElementById("grade").onclick = function () {
    runAnalyzeGrade();
  };
  document.getElementById("frames").onclick = function () {
    log("Kare aktarimi...");
    evalScript("USTA_exportFrames()", function (r) {
      log(r && r !== "undefined" ? String(r) : "Tamam.");
    });
  };

  evalScript("app.version", function (v) {
    if (!v || String(v).indexOf("EvalScript") >= 0) {
      log("EvalScript kopuk. Premiere'i kapatip paneli tekrar ac.");
      return;
    }
    loadHost();
  });
})();
