(function () {
  var root = document.documentElement;

  // Language: the head script picks the browser's language unless the URL names one; the buttons switch
  // in place and record the choice in the URL, so a reload or a shared link keeps it.
  function setLang(lang, record) {
    root.dataset.lang = lang;
    root.lang = lang === "zh" ? "zh-CN" : "en";
    document.title = root.dataset[lang === "zh" ? "titleZh" : "titleEn"];
    document.querySelectorAll("[data-set-lang]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.setLang === lang));
    });
    if (record) {
      var url = new URL(location.href);
      url.searchParams.set("lang", lang);
      history.replaceState(null, "", url);
    }
  }
  document.querySelectorAll("[data-set-lang]").forEach(function (b) {
    b.addEventListener("click", function () { setLang(b.dataset.setLang, true); });
  });
  setLang(root.dataset.lang, false);

  // Theme: dark from 18:00 to 07:00 on the visitor's clock. The head script sets it before the first paint;
  // a page left open switches at the boundary, and a tab coming back from sleep catches up at once.
  var setTheme = function () {
    var hr = new Date().getHours();
    root.dataset.theme = hr >= 18 || hr < 7 ? "dark" : "light";
  };
  setInterval(setTheme, 60000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) setTheme(); });

  // Section tabs: arrow keys move between tabs, and the selected section is recorded in the URL hash, so
  // a reload or a shared link (#performance) opens the same one.
  var tabs = Array.prototype.slice.call(document.querySelectorAll('[role="tab"]'));
  var selectTab = function (tab, focus) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).classList.toggle("is-active", on);
    });
    if (focus) tab.focus();
  };
  var tabFor = function (id) {
    return tabs.find(function (t) { return t.getAttribute("aria-controls") === id; });
  };
  // A click whose panel opens below the lower part of the window scrolls the tabs to the top, so the
  // change is visible; the browser already does this for a hash in the URL.
  var tabRow = document.querySelector(".tabs");
  var reveal = function (panel) {
    if (panel.getBoundingClientRect().top < window.innerHeight * 0.6) return;
    var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    tabRow.scrollIntoView({ block: "start", behavior: still ? "auto" : "smooth" });
  };
  tabs.forEach(function (t, i) {
    t.addEventListener("click", function () {
      selectTab(t);
      reveal(document.getElementById(t.getAttribute("aria-controls")));
      var url = new URL(location.href);
      url.hash = t.getAttribute("aria-controls");
      history.replaceState(null, "", url);
    });
    t.addEventListener("keydown", function (e) {
      var j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (j === undefined) return;
      e.preventDefault();
      tabs[(j + tabs.length) % tabs.length].click();
      tabs[(j + tabs.length) % tabs.length].focus();
    });
  });
  var fromHash = function () {
    var t = tabFor(location.hash.slice(1));
    if (t) selectTab(t);
  };
  window.addEventListener("hashchange", fromHash);
  fromHash();

  // Figure viewer: a native modal dialog that shows the figure in the active language at a larger size.
  var viewer = document.querySelector(".viewer");
  var vimg = viewer.querySelector("img");
  var vcap = viewer.querySelector(".viewer-caption");
  var closeMs = parseFloat(getComputedStyle(root).getPropertyValue("--close-dur")) || 150;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var trigger = null;

  document.querySelectorAll(".plate-open").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var fig = btn.closest("figure");
      trigger = btn;
      var img = Array.prototype.find.call(fig.querySelectorAll("img"), function (i) { return i.offsetParent !== null; });
      // The viewer shows the full caption; the page shows the short one.
      var cap = fig.querySelector('.cap-full[lang="' + root.lang + '"]');
      vimg.src = img.src;
      vimg.alt = img.alt;
      viewer.style.setProperty("--zoom", (fig.dataset.zoom || 1200) + "px");
      vcap.innerHTML = cap ? cap.innerHTML : "";
      viewer.classList.remove("is-closing");
      setZoom(false);
      viewer.showModal();
      viewer.querySelector(".viewer-scroll").scrollTo(0, 0);
    });
  });

  function closeViewer() {
    if (!viewer.open || viewer.classList.contains("is-closing")) return;
    if (reduce.matches) { viewer.close(); return; }
    viewer.classList.add("is-closing");
    setTimeout(function () { viewer.classList.remove("is-closing"); viewer.close(); }, closeMs);
  }
  var zoomBtn = viewer.querySelector(".viewer-zoom");
  function setZoom(on) {
    viewer.classList.toggle("is-zoomed", on);
    zoomBtn.setAttribute("aria-pressed", String(on));
  }
  vimg.addEventListener("click", function () { setZoom(!viewer.classList.contains("is-zoomed")); });
  zoomBtn.addEventListener("click", function () { setZoom(!viewer.classList.contains("is-zoomed")); });
  viewer.querySelector(".viewer-close").addEventListener("click", closeViewer);
  viewer.addEventListener("click", function (e) { if (e.target === viewer) closeViewer(); });
  viewer.addEventListener("cancel", function (e) { e.preventDefault(); closeViewer(); });
  viewer.addEventListener("close", function () { if (trigger) trigger.focus({ preventScroll: true }); });


  // Figure 1 is a looping video (one second per model day). The slider under it scrubs model time; with reduced motion the video waits on its poster until played. The left-panel
  // switch swaps in a second video, rendered frame for frame alongside the first, at the same model time.
  var flowFrame = document.querySelector(".flow-frame");
  if (flowFrame) {
    var flowFig = flowFrame.closest("figure"), vids = {};
    flowFrame.querySelectorAll(".flow-video").forEach(function (v) { vids[v.dataset.panel] = v; });
    var active = vids.mit, switching = false, warmed = false;
    var scrub = flowFig.querySelector(".flow-scrub"), flowBtn = flowFig.querySelector(".flow-toggle");
    var panelBtns = flowFig.querySelectorAll("[data-flow-panel]");
    var wasPlaying = false, dragging = false;
    var label = function () {
      flowBtn.querySelector('[lang="zh-CN"]').textContent = active.paused ? "播放" : "暂停";
      flowBtn.querySelector('[lang="en"]').textContent = active.paused ? "Play" : "Pause";
    };
    var toggleVideo = function () { if (active.paused) active.play(); else active.pause(); };
    if (reduce.matches) {
      active.removeAttribute("autoplay");
      active.pause();
    }
    scrub.hidden = flowBtn.hidden = flowFig.querySelector(".flow-panel").hidden = false;
    Object.keys(vids).forEach(function (k) {
      var v = vids[k];
      v.addEventListener("play", function () { if (v === active) label(); });
      v.addEventListener("pause", function () { if (v === active) label(); });
      v.addEventListener("click", toggleVideo);
      v.addEventListener("timeupdate", function () {
        if (v === active && !dragging && v.duration) scrub.value = v.currentTime / v.duration * scrub.max;
      });
    });
    flowBtn.addEventListener("click", toggleVideo);
    scrub.addEventListener("pointerdown", function () { dragging = true; wasPlaying = !active.paused; active.pause(); });
    scrub.addEventListener("input", function () {
      if (active.duration) active.currentTime = scrub.value / scrub.max * active.duration;
    });
    scrub.addEventListener("change", function () {
      if (dragging && wasPlaying) active.play();
      dragging = false;
    });

    // The difference video loads only when the switch is approached or used.
    var warm = function () {
      if (warmed || vids.diff.readyState > 0) return;
      warmed = true;
      vids.diff.preload = "auto";
      vids.diff.load();
    };
    var pressed = function (name) {
      panelBtns.forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.flowPanel === name)); });
    };
    var showPanel = function (name) {
      var next = vids[name], prev = active;
      if (next === prev || switching) return;
      switching = true;
      pressed(name);
      var playing = !prev.paused, time = prev.currentTime;
      prev.pause();
      flowFrame.setAttribute("aria-busy", "true");
      var onSeeked = function () { done(true); }, onError = function () { done(false); };
      var done = function (ok) {
        next.removeEventListener("seeked", onSeeked);
        next.removeEventListener("error", onError);
        flowFrame.removeAttribute("aria-busy");
        switching = false;
        if (!ok) { pressed(prev.dataset.panel); if (playing) prev.play(); return; }
        next.classList.remove("is-off");
        prev.classList.add("is-off");
        next.removeAttribute("aria-hidden");
        prev.setAttribute("aria-hidden", "true");
        flowFig.classList.toggle("is-diff", name === "diff");
        active = next;
        if (playing) next.play();
        label();
      };
      var seek = function () {
        next.addEventListener("seeked", onSeeked);
        next.currentTime = time;
      };
      next.addEventListener("error", onError);
      if (next.readyState > 0) seek();
      else { next.addEventListener("loadedmetadata", seek, { once: true }); warm(); }
    };
    panelBtns.forEach(function (b) {
      b.addEventListener("click", function () { showPanel(b.dataset.flowPanel); });
    });
    var panelGroup = flowFig.querySelector(".flow-panel");
    panelGroup.addEventListener("pointerenter", warm);
    panelGroup.addEventListener("focusin", warm);
    // Once the first video has finished or paused its download, fetch the second one so the first
    // switch is immediate. A cached video may be loaded before this script runs, so playback checks too.
    var loadEvents = ["suspend", "canplaythrough", "timeupdate"];
    var afterFirst = function () {
      if (vids.mit.readyState < 3 || vids.mit.networkState === vids.mit.NETWORK_LOADING) return;
      loadEvents.forEach(function (e) { vids.mit.removeEventListener(e, afterFirst); });
      warm();
    };
    if (!(navigator.connection && navigator.connection.saveData)) {
      loadEvents.forEach(function (e) { vids.mit.addEventListener(e, afterFirst); });
      afterFirst();
    }
    label();
  }

  // Narrow screens: the masthead is a top bar whose menu opens the education, interests and contacts.
  var rail = document.querySelector(".rail"), menu = document.querySelector(".rail-menu");
  var setMenu = function (open) {
    rail.classList.toggle("is-open", open);
    menu.setAttribute("aria-expanded", String(open));
  };
  menu.addEventListener("click", function () { setMenu(!rail.classList.contains("is-open")); });
  rail.querySelectorAll(".rail-body a").forEach(function (a) {
    a.addEventListener("click", function () { setMenu(false); });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && rail.classList.contains("is-open")) { setMenu(false); menu.focus(); }
  });
})();
