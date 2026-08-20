(function () {
  var logEl = document.getElementById("log");
  var hostReady = false;

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

  function evalFileFallbacks(done) {
    var base = extPath();
    var variants = [
      '$.evalFile("' + base + '/jsx/host.jsx")',
      '$.evalFile(new File("' + base + '/jsx/host.jsx"))',
      '$.evalFile("' + base.replace(/\//g, "\\\\") + '\\\\jsx\\\\host.jsx")'
    ];
    var i = 0;
    function next() {
      if (i >= variants.length) {
        done(false, "host.jsx yuklenemedi. Path: " + base);
        return;
      }
      var code = variants[i++];
      evalScript(code, function (r) {
        var s = String(r || "");
        if (s.indexOf("EvalScript") >= 0 || s.indexOf("error") >= 0 || s.indexOf("Error") >= 0) {
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
        log("host yuklu degil. Premiere kapat, jsx/host.jsx dosyasini degistir, tekrar ac.\n" + s);
        hostReady = false;
        return;
      }
      hostReady = true;
      log(s);
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
    log("Grade...");
    evalScript("USTA_grade()", function (r) {
      log(r && r !== "undefined" ? String(r) : "Tamam.");
    });
  };
  document.getElementById("frames").onclick = function () {
    log("Kare aktarimi...");
    evalScript("USTA_exportFrames()", function (r) {
      log(r && r !== "undefined" ? String(r) : "Tamam.");
    });
  };
  document.getElementById("fromjson").onclick = function () {
    var raw = document.getElementById("json").value;
    if (!raw.trim()) {
      log("JSON yok.");
      return;
    }
    var escaped = raw.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "\\n");
    evalScript('USTA_applyJson("' + escaped + '")', function (r) {
      log(r && r !== "undefined" ? String(r) : "JSON uygulandi.");
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
