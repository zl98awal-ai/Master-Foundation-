/* Tabs + private materials panel (db + assets capabilities). */
(function () {
  "use strict";

  /* ---------- Tabs ---------- */
  var tabD = document.getElementById("tab-dasbor");
  var tabM = document.getElementById("tab-materi");
  var viewD = document.getElementById("view-dasbor");
  var viewM = document.getElementById("view-materi");
  function show(which) {
    var m = which === "materi";
    tabD.setAttribute("aria-selected", String(!m));
    tabM.setAttribute("aria-selected", String(m));
    viewD.hidden = m; viewM.hidden = !m;
  }
  tabD.addEventListener("click", function () { show("dasbor"); try { history.replaceState(null, "", "#dasbor"); } catch (e) {} });
  tabM.addEventListener("click", function () { show("materi"); try { history.replaceState(null, "", "#materi"); } catch (e) {} });
  if (location.hash === "#materi") show("materi");

  /* ---------- Reference data ---------- */
  var COURSES = {
    uib: ["Bahasa Inggris I · Foundation", "Lainnya"],
    uis: ["Bahasa Inggris I", "Bahasa Inggris K3", "Lainnya"]
  };
  var CAMPUS_NAME = { uib: "UIB", uis: "UIS" };
  var TYPE_BY_EXT = {
    pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
    webp: "image/webp", svg: "image/svg+xml", mp4: "video/mp4", webm: "video/webm",
    csv: "text/csv", md: "text/markdown", json: "application/json", txt: "text/plain"
  };
  var OFFICE = /\.(pptx?|docx?|xlsx?|key|pages|numbers)$/i;
  var MAX = 20 * 1024 * 1024;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fmtSize(b) { if (!b) return ""; return b < 1024 * 1024 ? Math.max(1, Math.round(b / 1024)) + " KB" : (b / 1024 / 1024).toFixed(1) + " MB"; }
  function ext(name) { var m = /\.([a-z0-9]+)$/i.exec(name || ""); return m ? m[1].toLowerCase() : ""; }
  function safeUrl(u) { return /^https?:\/\//i.test(u || "") ? u : ""; }
  function fmtDate(iso) {
    try { return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }); }
    catch (e) { return ""; }
  }

  /* ---------- Form wiring (works without the platform too) ---------- */
  var fCampus = $("f-campus"), fCourse = $("f-course"), fMeeting = $("f-meeting");
  function fillCourses() {
    fCourse.innerHTML = COURSES[fCampus.value].map(function (c) { return "<option>" + esc(c) + "</option>"; }).join("");
  }
  fCampus.addEventListener("change", fillCourses);
  fillCourses();
  fMeeting.innerHTML = '<option value="0">Umum (semua pertemuan)</option>' +
    Array.apply(null, Array(16)).map(function (_, i) { return '<option value="' + (i + 1) + '">Pertemuan ' + (i + 1) + "</option>"; }).join("");

  var kind = "file";
  var kindBox = $("f-kind");
  kindBox.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-kind]"); if (!b) return;
    kind = b.getAttribute("data-kind");
    Array.prototype.forEach.call(kindBox.children, function (x) { x.setAttribute("aria-pressed", String(x === b)); });
    document.querySelectorAll("[data-for]").forEach(function (el) { el.hidden = el.getAttribute("data-for") !== kind; });
    setStatus("");
  });

  var picked = [];
  var fileInput = $("f-file"), drop = $("drop");
  function setPicked(list) {
    picked = Array.prototype.slice.call(list || []);
    $("file-picked").textContent = picked.length
      ? picked.map(function (f) { return f.name + " (" + fmtSize(f.size) + ")"; }).join(", ")
      : "PDF, gambar, video MP4/WebM, CSV, TXT, Markdown · maks. 20 MB per file";
    if (picked.length === 1 && !$("f-title").value) $("f-title").value = picked[0].name.replace(/\.[^.]+$/, "");
  }
  fileInput.addEventListener("change", function () { setPicked(fileInput.files); });
  ["dragenter", "dragover"].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add("over"); }); });
  ["dragleave", "drop"].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove("over"); }); });
  drop.addEventListener("drop", function (e) { if (e.dataTransfer && e.dataTransfer.files) setPicked(e.dataTransfer.files); });

  function setStatus(msg, cls) { var s = $("f-status"); s.textContent = msg; s.className = "status" + (cls ? " " + cls : ""); }

  /* ---------- Platform ---------- */
  var db = null, assets = null, rows = [], filterCampus = "all", query = "";

  function start() {
    var c = window.claude;
    if (!c || typeof c.use !== "function") { offline(); return; }
    Promise.all([c.use("db"), c.use("assets"), c.use("user")]).then(function (r) {
      db = r[0]; assets = r[1];
      var user = r[2];
      if (!db) { offline(); return; }
      var owner = user && typeof user.isOwner === "function" ? user.isOwner() : null;
      Promise.resolve(owner).then(function (isOwner) {
        if (isOwner === false) { offline("Panel ini hanya untuk pemilik dasbor."); return; }
        $("panel-on").hidden = false;
        if (!assets) {
          // Reader view or assets unavailable: links and notes still work.
          $("drop").parentNode.querySelector("p.hint").textContent = "Unggah file tidak tersedia di tampilan ini. Tautan dan catatan tetap bisa disimpan.";
          fileInput.disabled = true;
        }
        subscribe();
        refreshMeter();
      });
    }, function () { offline(); });
  }
  function offline(msg) {
    $("panel-on").hidden = true;
    var o = $("panel-off"); o.hidden = false;
    if (msg) o.textContent = msg;
  }

  function subscribe() {
    db.collection("materials").orderBy("createdAt", "desc").limit(1000).onSnapshot(function (snap) {
      rows = snap.docs.map(function (d) { var x = d.data() || {}; return Object.assign({ _id: d.id }, x); });
      render();
    }, function (err) {
      $("list").innerHTML = '<div class="empty">Materi tidak bisa dimuat (' + esc(err && err.code) + "). Muat ulang halaman.</div>";
    });
  }

  function refreshMeter() {
    if (!assets) return;
    assets.list().then(function (r) {
      var u = r.usage || {}; if (!u.maxBytes) return;
      $("meter").hidden = false;
      $("meter-fill").style.width = Math.min(100, (u.bytes / u.maxBytes) * 100).toFixed(1) + "%";
      $("meter-text").textContent = fmtSize(u.bytes || 0) + " dari " + fmtSize(u.maxBytes) + " terpakai";
    }, function () {});
  }

  /* ---------- Save ---------- */
  function baseDoc(title) {
    var meeting = parseInt(fMeeting.value, 10) || 0;
    return {
      campus: fCampus.value, course: fCourse.value, meeting: meeting, category: $("f-cat").value,
      title: (title || "").trim().slice(0, 160), createdAt: new Date().toISOString()
    };
  }
  var saving = false;
  $("add-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (saving || !db) return;
    var title = $("f-title").value.trim();

    if (kind === "link") {
      var url = $("f-url").value.trim();
      if (!safeUrl(url)) { setStatus("Masukkan alamat lengkap yang diawali https://", "err"); return; }
      var d = baseDoc(title || url); d.kind = "link"; d.url = url;
      return save([d]);
    }
    if (kind === "note") {
      var note = $("f-note").value.trim();
      if (!note) { setStatus("Catatan masih kosong.", "err"); return; }
      var n = baseDoc(title || note.split("\n")[0].slice(0, 60)); n.kind = "note"; n.note = note.slice(0, 5000);
      return save([n]);
    }
    // files
    if (!assets) { setStatus("Unggah file tidak tersedia di tampilan ini.", "err"); return; }
    if (!picked.length) { setStatus("Pilih file dulu.", "err"); return; }
    var bad = picked.filter(function (f) { return OFFICE.test(f.name); });
    if (bad.length) { setStatus(bad[0].name + ": file PowerPoint/Word/Excel belum bisa disimpan langsung. Ekspor ke PDF, atau tambahkan tautan Google Drive-nya.", "err"); return; }
    var big = picked.filter(function (f) { return f.size > MAX; });
    if (big.length) { setStatus(big[0].name + " lebih dari 20 MB. Kompres dulu, atau simpan di Drive dan tambahkan sebagai tautan.", "err"); return; }
    uploadAll(title);
  });

  function save(docs) {
    saving = true; $("f-save").disabled = true; setStatus("Menyimpan…");
    var chain = Promise.resolve();
    docs.forEach(function (d) { chain = chain.then(function () { return db.collection("materials").add(d); }); });
    chain.then(function () {
      setStatus(docs.length > 1 ? docs.length + " materi tersimpan." : "Tersimpan.", "ok");
      resetInputs();
    }, function (err) {
      setStatus(err && err.code === "quota_exceeded" ? "Penyimpanan data penuh. Hapus beberapa materi lama." : "Gagal menyimpan (" + esc(err && err.code) + "). Coba lagi.", "err");
    }).then(function () { saving = false; $("f-save").disabled = false; });
  }

  function uploadAll(title) {
    saving = true; $("f-save").disabled = true;
    var files = picked.slice(), done = 0, failed = [];
    var chain = Promise.resolve();
    files.forEach(function (f, i) {
      chain = chain.then(function () {
        setStatus("Mengunggah " + (i + 1) + " dari " + files.length + ": " + f.name + "…");
        var type = TYPE_BY_EXT[ext(f.name)];
        var opts = type && f.type !== type ? { type: type } : undefined;
        return assets.upload(f, opts).then(function (res) {
          var d = baseDoc(files.length === 1 && title ? title : f.name.replace(/\.[^.]+$/, ""));
          d.kind = "file"; d.assetId = res.id; d.fileName = f.name; d.contentType = res.contentType; d.sizeBytes = res.sizeBytes;
          return db.collection("materials").add(d).then(function () { done++; });
        }).catch(function (err) {
          var code = err && err.code;
          var why = code === "unsupported_type" ? "format tidak didukung"
            : code === "too_large" ? "lebih dari 20 MB"
            : code === "quota_or_state" ? "kuota penyimpanan penuh"
            : code === "rate_limited" ? "terlalu cepat, coba lagi sebentar"
            : "gagal (" + (code || "error") + ")";
          failed.push(f.name + ": " + why);
        });
      });
    });
    chain.then(function () {
      if (failed.length) setStatus((done ? done + " file tersimpan. " : "") + "Tidak tersimpan: " + failed.join("; "), "err");
      else { setStatus(done + " file tersimpan.", "ok"); }
      if (done) resetInputs();
      refreshMeter();
      saving = false; $("f-save").disabled = false;
    });
  }

  function resetInputs() {
    $("f-title").value = ""; $("f-url").value = ""; $("f-note").value = "";
    fileInput.value = ""; setPicked([]);
  }

  /* ---------- Filters ---------- */
  $("filter-campus").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-v]"); if (!b) return;
    filterCampus = b.getAttribute("data-v");
    Array.prototype.forEach.call(this.children, function (x) { x.setAttribute("aria-pressed", String(x === b)); });
    render();
  });
  var qTimer;
  $("q").addEventListener("input", function () {
    clearTimeout(qTimer); var v = this.value;
    qTimer = setTimeout(function () { query = v.trim().toLowerCase(); render(); }, 150);
  });

  /* ---------- Render ---------- */
  function icon(r) {
    if (r.kind === "link") return '<span class="ico link">LINK</span>';
    if (r.kind === "note") return '<span class="ico note">NOTE</span>';
    var e = ext(r.fileName).toUpperCase() || "FILE";
    return '<span class="ico">' + esc(e.slice(0, 4)) + "</span>";
  }
  function href(r) {
    if (r.kind === "file" && r.assetId && /^[0-9a-f]{32}$/i.test(r.assetId)) return "/_blob/" + r.assetId;
    if (r.kind === "link") return safeUrl(r.url);
    return "";
  }
  function render() {
    var list = $("list");
    var shown = rows.filter(function (r) {
      if (filterCampus !== "all" && r.campus !== filterCampus) return false;
      if (!query) return true;
      return [r.title, r.category, r.course, r.note, r.fileName].join(" ").toLowerCase().indexOf(query) !== -1;
    });
    if (!rows.length) { list.innerHTML = '<div class="empty">Belum ada materi. Tambahkan file, tautan atau catatan pertama lewat formulir di atas.</div>'; return; }
    if (!shown.length) { list.innerHTML = '<div class="empty">Tidak ada materi yang cocok dengan filter ini.</div>'; return; }

    var groups = {};
    shown.forEach(function (r) {
      var k = (r.campus || "lain") + "|" + (r.course || "Lainnya");
      (groups[k] = groups[k] || []).push(r);
    });
    var keys = Object.keys(groups).sort(function (a, b) {
      var ca = a.split("|")[0], cb = b.split("|")[0];
      if (ca !== cb) return ca === "uib" ? -1 : 1;
      return a.localeCompare(b);
    });
    list.innerHTML = keys.map(function (k) {
      var campus = k.split("|")[0], course = k.split("|")[1];
      var items = groups[k].slice().sort(function (a, b) {
        return (a.meeting || 99) - (b.meeting || 99) || String(b.createdAt).localeCompare(String(a.createdAt));
      });
      return '<div class="group"><div class="group-head"><span class="tag ' + esc(campus) + '">' + esc(CAMPUS_NAME[campus] || campus) +
        "</span><h3>" + esc(course) + '</h3><span class="count">' + items.length + " materi</span></div><div class=\"items\">" +
        items.map(function (r) {
          var h = href(r);
          var meta = [r.meeting ? "Pertemuan " + r.meeting : "Umum", r.category, r.sizeBytes ? fmtSize(r.sizeBytes) : "", fmtDate(r.createdAt)].filter(Boolean).join(" · ");
          return '<div class="item">' + icon(r) + '<div><div class="t">' + esc(r.title || r.fileName || "Tanpa judul") + '</div><div class="m">' + esc(meta) + "</div>" +
            (r.kind === "note" ? '<div class="body">' + esc(r.note) + "</div>" : "") + "</div>" +
            '<div class="acts">' + (h ? '<a class="chip" href="' + esc(h) + '" target="_blank" rel="noopener noreferrer">Buka</a>' : "") +
            '<button type="button" class="chip danger" data-del="' + esc(r._id) + '">Hapus</button></div></div>';
        }).join("") + "</div></div>";
    }).join("");
  }

  /* Two-step delete (dialogs are not available in the viewer) */
  var armed = null, armTimer;
  $("list").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-del]"); if (!b || !db) return;
    var id = b.getAttribute("data-del");
    if (armed !== id) {
      document.querySelectorAll(".chip.danger.armed").forEach(function (x) { x.classList.remove("armed"); x.textContent = "Hapus"; });
      armed = id; b.classList.add("armed"); b.textContent = "Yakin hapus?";
      clearTimeout(armTimer); armTimer = setTimeout(function () { armed = null; b.classList.remove("armed"); b.textContent = "Hapus"; }, 4000);
      return;
    }
    armed = null; clearTimeout(armTimer);
    b.disabled = true; b.textContent = "Menghapus…";
    var row = rows.filter(function (r) { return r._id === id; })[0];
    var p = db.doc("materials/" + id).delete();
    if (row && row.kind === "file" && row.assetId && assets) {
      p = p.then(function () { return assets.delete(row.assetId).catch(function () {}); });
    }
    p.then(refreshMeter, function (err) {
      b.disabled = false; b.textContent = "Hapus";
      setStatus("Gagal menghapus (" + esc(err && err.code) + ").", "err");
    });
  });

  start();
})();
