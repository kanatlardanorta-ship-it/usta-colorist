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
    function fail() {
      try {
        if (window.cep && window.cep.fs && window.cep.fs.readFile) {
          var winPath = String(path).replace(/\//g, "\\");
          var r = window.cep.fs.readFile(winPath, "Base64");
          if (r && r.err === 0 && r.data) {
            img.onload = function () {
              cb(null, img);
            };
            img.onerror = function () {
              cb("b64 " + path);
            };
            img.src = "data:image/png;base64," + r.data;
            return;
          }
        }
      } catch (eC) {}
      cb("img " + path);
    }
    img.onload = function () {
      cb(null, img);
    };
    img.onerror = fail;
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
    log("Hazirlik...");
    evalScript("USTA_beginExport()", function (r) {
      var info;
      try {
        info = JSON.parse(String(r || "{}"));
      } catch (eP) {
        busy = false;
        log("begin JSON hatasi: " + r);
        return;
      }
      if (!info.ok || !info.count) {
        busy = false;
        log("V1 bos veya sekans yok. " + (info.err || r));
        return;
      }
      var i = 0;
      var analyses = [];
      var names = [];
      var exported = 0;
      function finish() {
        var okN = 0;
        var k;
        for (k = 0; k < analyses.length; k++) if (analyses[k]) okN++;
        if (!fillMissing(analyses)) {
          busy = false;
          log(
            "Hic PNG okunamadi (" +
              exported +
              "/" +
              info.count +
              "). Premiere kare vermedi.\nTemp: " +
              info.folder
          );
          return;
        }
        var look = document.getElementById("look").value || "belgesel";
        var graded = window.USTAEngine.gradeAll(analyses, look, 0.9);
        var lines = [];
        lines.push(
          "Analiz " +
            okN +
            "/" +
            info.count +
            " PNG " +
            exported +
            "  look " +
            look +
            "  hero #" +
            (graded.heroIndex + 1)
        );
        for (k = 0; k < graded.lumetri.length; k++) {
          var g = graded.lumetri[k];
          var nm = names[k] || "#" + (k + 1);
          lines.push(
            k +
              1 +
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
      }
      function next() {
        if (i >= info.count) {
          finish();
          return;
        }
        log(
          "Kare " +
            (i + 1) +
            "/" +
            info.count +
            " aktar + analiz..."
        );
        evalScript("USTA_exportOne(" + i + ")", function (res) {
          var one;
          try {
            one = JSON.parse(String(res || "{}"));
          } catch (e1) {
            names[i] = "";
            analyses[i] = null;
            i++;
            next();
            return;
          }
          if (i < 3) {
            log(
              "Kare " +
                (i + 1) +
                " method=" +
                (one.method || "-") +
                " exists=" +
                one.exists +
                " nfiles=" +
                one.nfiles +
                " tc=" +
                (one.tc || "") +
                " cti=" +
                (one.cti || "") +
                " fps=" +
                one.fps +
                " listed=" +
                (one.listed || "") +
                " methods=" +
                (one.methods || "") +
                " err=" +
                (one.err || "")
            );
          }
          if (i >= 2 && exported === 0 && !one.exists) {
            busy = false;
            log(
              "Ilk 3 kare yazilmadi, durdu.\n" +
                "method=" +
                (one.method || "-") +
                "\nerr=" +
                (one.err || res) +
                "\nTemp: " +
                info.folder +
                "\nBu metni gonder."
            );
            return;
          }
          names[i] = one.name || "";
          if (!one.exists) {
            analyses[i] = null;
            i++;
            next();
            return;
          }
          exported++;
          loadImage(one.path, function (err, img) {
            if (err || !img) analyses[i] = null;
            else {
              try {
                analyses[i] = analyzeImg(img);
              } catch (eA) {
                analyses[i] = null;
              }
            }
            i++;
            next();
          });
        });
      }
      next();
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
    log("Temp kare klasoru aciliyor...");
    evalScript("USTA_openTemp()", function (r) {
      log("Klasor: " + r + "\nKare aktarimi Analiz butonunda kare kare olur. Bu buton sadece klasoru acar.");
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
