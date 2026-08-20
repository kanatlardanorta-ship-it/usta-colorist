(function () {
  var logEl = document.getElementById("log");
  var hostReady = false;
  var busy = false;
  var lastJob = null;
  var cancelFlag = false;
  var logLines = [];

  function log(msg) {
    logLines.push(String(msg == null ? "" : msg));
    if (logLines.length > 48) logLines = logLines.slice(-48);
    logEl.textContent = logLines.join("\n");
  }

  function logReset(msg) {
    logLines = [String(msg == null ? "" : msg)];
    logEl.textContent = logLines[0];
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
    if (p.charAt(0) !== "/") p = "/" + p;
    return "file://" + encodeURI(p);
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
    cancelFlag = false;
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
          log("Hic PNG okunamadi (" + exported + "/" + info.count + ").");
          return;
        }
        var look = document.getElementById("look").value || "belgesel";
        var match = (parseInt(document.getElementById("match").value, 10) || 88) / 100;
        var graded = window.USTAEngine.gradeAll(analyses, look, match);
        var lines = [];
        lines.push(
          "Analiz " + okN + "/" + info.count + "  look " + look + "  sahneler " + graded.scenes + "  V1=trim V2=print"
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
              " H" +
              g.highlights +
              " Sat" +
              (100 + g.saturation)
          );
        }
        logReset(lines.join("\n") + "\nV1+V2 yaziliyor (tek undo)...");
        var clips = [];
        for (k = 0; k < graded.lumetri.length; k++) clips.push({ lumetri: graded.lumetri[k] });
        var trimRaw = JSON.stringify({ clips: clips });
        var printRaw = JSON.stringify(graded.print);
        evalScript(
          'USTA_gradeAllJson("' +
            trimRaw.replace(/\\/g, "\\\\").replace(/"/g, '\\"') +
            '","' +
            printRaw.replace(/\\/g, "\\\\").replace(/"/g, '\\"') +
            '")',
          function (res) {
            lastJob = {
              lumetri: graded.lumetri,
              print: graded.print,
              sceneLists: graded.sceneLists,
              sceneOf: graded.sceneOf,
              flags: graded.flags || [],
              names: names.slice(),
              analyses: analyses,
              count: info.count
            };
            var flagTxt = "";
            if (lastJob.flags.length) {
              flagTxt =
                "\nSlider QC: " +
                lastJob.flags.length +
                " supheli\n" +
                lastJob.flags
                  .slice(0, 15)
                  .map(function (f) {
                    return "#" + (f.i + 1) + " " + (f.reasons || []).join(",");
                  })
                  .join("\n");
            }
            logReset(
              lines.join("\n") +
                "\n" +
                (res && res !== "undefined" ? res : "yazildi") +
                flagTxt +
                "\nKontrol (grade sonrasi kare)..."
            );
            runPictureQc();
          }
        );
      }
      function next() {
        if (cancelFlag) {
          busy = false;
          log("iptal");
          return;
        }
        if (i >= info.count) {
          finish();
          return;
        }
        var fracs = [0.2, 0.42, 0.72];
        var samples = [];
        var fi = 0;
        function nextFrac() {
          if (fi >= fracs.length) {
            analyses[i] = window.USTAEngine.medianAnalyses
              ? window.USTAEngine.medianAnalyses(samples)
              : samples[0] || null;
            i++;
            next();
            return;
          }
          log("Kare " + (i + 1) + "/" + info.count + " f" + (fi + 1) + "/" + fracs.length);
          evalScript("USTA_exportOne(" + i + "," + fracs[fi] + ")", function (res) {
            var one;
            try {
              one = JSON.parse(String(res || "{}"));
            } catch (e1) {
              fi++;
              nextFrac();
              return;
            }
            if (i === 0 && fi === 0) {
              log("probe method=" + (one.method || "-") + " exists=" + one.exists + " err=" + (one.err || ""));
            }
            if (i >= 2 && exported === 0 && !one.exists && fi === 0) {
              busy = false;
              log("Ilk kareler yazilmadi.\nerr=" + (one.err || res));
              return;
            }
            names[i] = one.name || names[i] || "";
            if (one.dur && one.dur < 1.4) fracs = [fracs[0]];
            if (!one.exists) {
              fi++;
              nextFrac();
              return;
            }
            exported++;
            loadImage(one.path, function (err, img) {
              if (!err && img) {
                try {
                  samples.push(analyzeImg(img));
                } catch (eA) {}
              }
              fi++;
              nextFrac();
            });
          });
        }
        nextFrac();
      }
      next();
    });
  }

  function runPictureQc() {
    if (!lastJob) {
      log("Once grade et.");
      return;
    }
    busy = true;
    var i = 0;
    var extra = [];
    function done() {
      var f, seen, k;
      seen = {};
      for (k = 0; k < lastJob.flags.length; k++) seen[lastJob.flags[k].i] = true;
      for (k = 0; k < extra.length; k++) {
        if (!seen[extra[k].i]) lastJob.flags.push(extra[k]);
        else {
          f = lastJob.flags.filter(function (x) {
            return x.i === extra[k].i;
          })[0];
          if (f) f.reasons = f.reasons.concat(extra[k].reasons);
        }
      }
      busy = false;
      if (!lastJob.flags.length) {
        log("Kontrol: hatali klip yok.");
        return;
      }
      log(
        "Kontrol bitti. " +
          lastJob.flags.length +
          " hatali klip.\n" +
          lastJob.flags
            .slice(0, 25)
            .map(function (fl) {
              return "#" + (fl.i + 1) + " " + (lastJob.names[fl.i] || "") + " " + fl.reasons.join(",");
            })
            .join("\n") +
          (lastJob.flags.length > 25 ? "\n..." : "") +
          "\nHatalari duzelt'e bas."
      );
    }
    function next() {
      if (cancelFlag) {
        busy = false;
        log("iptal");
        return;
      }
      if (i >= lastJob.count) {
        done();
        return;
      }
      log("Kontrol " + (i + 1) + "/" + lastJob.count);
      evalScript("USTA_exportOne(" + i + ",0.42)", function (res) {
        var one;
        try {
          one = JSON.parse(String(res || "{}"));
        } catch (e1) {
          i++;
          next();
          return;
        }
        if (!one.exists) {
          i++;
          next();
          return;
        }
        loadImage(one.path, function (err, img) {
          var a, reasons, members, medL, j;
          if (!err && img) {
            try {
              a = analyzeImg(img);
              members = [];
              for (j = 0; j < lastJob.sceneOf.length; j++) if (lastJob.sceneOf[j] === lastJob.sceneOf[i]) members.push(j);
              medL = 0;
              for (j = 0; j < members.length; j++) medL += (lastJob.analyses[members[j]] || {}).meanLuma || 0;
              medL = members.length ? medL / members.length : 0.36;
              reasons = window.USTAEngine.qcPicture(a, medL, lastJob.lumetri[i]);
              if (reasons.length) extra.push({ i: i, reasons: reasons });
            } catch (eA) {}
          }
          i++;
          next();
        });
      });
    }
    next();
  }

  function runFix() {
    if (!lastJob || !lastJob.flags.length) {
      log("Duzeltilecek hata yok.");
      return;
    }
    if (busy) return;
    busy = true;
    var queue = lastJob.flags.slice();
    var report = [];
    function nextFix() {
      var f, members, med, fixed, raw, escaped, j;
      if (!queue.length) {
        lastJob.flags = [];
        busy = false;
        log("Duzeltildi:\n" + report.join("\n"));
        return;
      }
      f = queue.shift();
      members = [];
      for (j = 0; j < lastJob.sceneOf.length; j++) if (lastJob.sceneOf[j] === lastJob.sceneOf[f.i]) members.push(j);
      med = window.USTAEngine.sceneMedian(lastJob.lumetri, members);
      fixed = window.USTAEngine.repairClip(lastJob.lumetri[f.i], med);
      lastJob.lumetri[f.i] = fixed;
      log("Duzeltiliyor " + (f.i + 1) + " " + (lastJob.names[f.i] || "") + " T" + fixed.temperature);
      raw = JSON.stringify({ lumetri: fixed });
      escaped = raw.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      evalScript("USTA_applyOne(" + f.i + ',"' + escaped + '")', function (r) {
        report.push("#" + (f.i + 1) + " T" + fixed.temperature + " E" + fixed.exposure + " " + r);
        nextFix();
      });
    }
    nextFix();
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
      evalScript(variants[i], function (r) {
        if (r && String(r).indexOf("EvalScript error") < 0 && String(r).indexOf("IOError") < 0) {
          done(true, r);
          return;
        }
        i++;
        next();
      });
    }
    next();
  }

  function loadHost() {
    var xhr;
    var href = extPath() + "/jsx/host.jsx";
    try {
      xhr = new XMLHttpRequest();
      xhr.open("GET", "jsx/host.jsx", true);
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300)) {
          evalScript(xhr.responseText, function () {
            evalScript("USTA_ping()", function (p) {
              hostReady = true;
              log("host " + p);
            });
          });
        } else {
          evalFileFallbacks(function (ok, msg) {
            if (ok) {
              evalScript("USTA_ping()", function (p) {
                hostReady = true;
                log("host " + p);
              });
            } else log(msg);
          });
        }
      };
      xhr.send();
    } catch (eX) {
      evalFileFallbacks(function (ok, msg) {
        log(ok ? msg : String(eX));
      });
    }
  }

  document.getElementById("grade").onclick = function () {
    runAnalyzeGrade();
  };
  document.getElementById("cancel").onclick = function () {
    cancelFlag = true;
    log("iptal istendi...");
  };
  document.getElementById("qc").onclick = function () {
    runPictureQc();
  };
  document.getElementById("fix").onclick = function () {
    runFix();
  };
  document.getElementById("frames").onclick = function () {
    log("Temp kare klasoru aciliyor...");
    evalScript("USTA_openTemp()", function (r) {
      log("Klasor: " + r);
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
