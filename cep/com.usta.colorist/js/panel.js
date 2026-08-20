(function () {
  var logEl = document.getElementById("log");
  function log(msg) {
    logEl.textContent = msg;
  }
  function evalScript(code, cb) {
    if (window.__adobe_cep__ && window.__adobe_cep__.evalScript) {
      window.__adobe_cep__.evalScript(code, cb || function () {});
      return;
    }
    log("Panel Premiere CEP içinde açılmalı.");
  }
  function extPath() {
    if (!window.__adobe_cep__) return "";
    var path = decodeURI(window.__adobe_cep__.getSystemPath("extension"));
    if (navigator.platform.indexOf("Win") >= 0) path = path.replace("file:///", "");
    else path = path.replace("file://", "");
    return path;
  }
  function evalFile(rel) {
    var p = extPath().replace(/\\/g, "/") + rel;
    evalScript('$.evalFile("' + p + '")', function (r) {
      log(r && r !== "undefined" ? String(r) : "Tamam.");
    });
  }
  document.getElementById("grade").onclick = function () {
    log("Grade uygulanıyor…");
    evalScript("USTA_grade()", function (r) {
      log(r && r !== "undefined" ? String(r) : "Tamam.");
    });
  };
  document.getElementById("frames").onclick = function () {
    log("Kare aktarımı…");
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
      log(r && r !== "undefined" ? String(r) : "JSON uygulandı.");
    });
  };
  if (window.__adobe_cep__) {
    var p = extPath().replace(/\\/g, "/") + "/jsx/host.jsx";
    evalScript('$.evalFile("' + p + '")');
  }
})();
