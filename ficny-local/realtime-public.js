/* Public website real-time + resilient form submissions.
 * - Stamps every form submission with its source page.
 * - Queues + retries submissions that fail (so nothing is lost).
 * - Reloads the page within ~1.5s when an admin changes content (SSE).
 * Loaded in <head> so the XHR patch is in place before the app runs.
 */

/* Keep the selected location across navigations. The app stores it in localStorage
   ("CenterID"/"CenterName") but WIPES it on every page unload, so the
   "Select your Location" popup reappears on each navigation. Mirror valid
   selections to a backup that survives the wipe, and restore it on load — so the
   popup only shows on a genuinely fresh visit (or when the user opens it from the
   location button). Runs in <head> before the app mounts. */
(function () {
  var KEYS = ["CenterID", "CenterName"];
  function valid(v) { return v && v !== "null" && v !== "undefined"; }
  function restore() {
    try {
      for (var i = 0; i < KEYS.length; i++) {
        var b = localStorage.getItem("fic_bk_" + KEYS[i]);
        if (!valid(localStorage.getItem(KEYS[i])) && valid(b)) localStorage.setItem(KEYS[i], b);
      }
    } catch (e) {}
  }
  try {
    var orig = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function (k, v) {
      if (KEYS.indexOf(k) > -1 && valid(v)) { try { orig("fic_bk_" + k, v); } catch (e) {} }
      return orig(k, v);
    };
  } catch (e) {}
  restore();
  // Back/forward cache: "back" restores a frozen snapshot (taken after the app
  // wiped the location), so the popup can reappear without our load code re-running.
  // If a location was chosen, hide the popup on that restore.
  function hidePopup() {
    try {
      var p = document.querySelector(".popup_content, .readio_btn_gropu");
      if (!p) return;
      var modal = p.closest && p.closest(".modal");
      if (modal) modal.style.display = "none";
      var bd = document.querySelectorAll(".modal-backdrop");
      for (var i = 0; i < bd.length; i++) bd[i].style.display = "none";
      document.body.classList.remove("modal-open");
      document.body.style.overflow = ""; document.body.style.paddingRight = "";
    } catch (e) {}
  }
  function restoreNavName() {
    try {
      var nm = localStorage.getItem("fic_bk_CenterName");
      if (!valid(nm)) return;
      var name = JSON.parse(nm);
      if (!name) return;
      var els = document.querySelectorAll(".center_show_main p, .center_show_main > p");
      for (var i = 0; i < els.length; i++) if (!els[i].textContent.trim()) els[i].textContent = name;
    } catch (e) {}
  }
  try {
    window.addEventListener("pageshow", function (e) {
      if (e.persisted && valid(localStorage.getItem("fic_bk_CenterID"))) {
        restore();
        [0, 250, 600, 1100].forEach(function (ms) { setTimeout(function () { hidePopup(); restoreNavName(); }, ms); });
      }
    });
  } catch (e) {}
})();

(function () {
  "use strict";
  var FORM_RE = /\/user\/(add-contactus|add-subscriber|partnerhip-form|partnership-form|volunteer-form|contact-us)\b/;
  var QKEY = "fic_submit_queue_v1";

  // ---- stamp source page + capture failures (axios uses XHR) ----
  var open0 = XMLHttpRequest.prototype.open, send0 = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__m = m; this.__u = u; return open0.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (body) {
    var u = this.__u || "";
    if (FORM_RE.test(u)) {
      if (typeof body === "string") {
        try { var o = JSON.parse(body); if (!o.sourcePage) o.sourcePage = location.pathname; o.sourceUrl = location.href; body = JSON.stringify(o); } catch (e) {}
      }
      try { this.setRequestHeader("x-source-page", location.pathname); } catch (e) {}
      var self = this, sentBody = body, url = u;
      this.addEventListener("loadend", function () {
        var failed = (self.status === 0 || self.status >= 500);
        if (failed) { enqueue(self.__m || "POST", url, sentBody); }
      });
    }
    return send0.call(this, body);
  };

  function enqueue(method, url, body) {
    try {
      var q = JSON.parse(localStorage.getItem(QKEY) || "[]");
      q.push({ method: method, url: url, body: body, ts: Date.now() });
      localStorage.setItem(QKEY, JSON.stringify(q));
      toast("Network issue — your submission was saved and will retry automatically.");
    } catch (e) {}
  }
  function flush() {
    var q; try { q = JSON.parse(localStorage.getItem(QKEY) || "[]"); } catch (e) { q = []; }
    if (!q.length) return;
    var rest = [], left = q.length;
    q.forEach(function (it) {
      fetch(it.url, { method: it.method || "POST", headers: { "Content-Type": "application/json", "x-source-page": "retry" }, body: it.body })
        .then(function (r) { if (!r.ok) rest.push(it); })
        .catch(function () { rest.push(it); })
        .then(function () { if (--left === 0) { localStorage.setItem(QKEY, JSON.stringify(rest)); if (rest.length < q.length) toast("Saved submission(s) delivered."); } });
    });
  }
  window.addEventListener("online", flush);

  // ---- real-time content refresh (admin edits -> website updates) ----
  var t;
  function scheduleReload() {
    var a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return; // don't interrupt typing
    clearTimeout(t); t = setTimeout(function () { location.reload(); }, 1500);
  }
  function connect() {
    try {
      var es = new EventSource("/api/v1/stream");
      es.addEventListener("content-changed", scheduleReload);
      es.onerror = function () { /* EventSource auto-reconnects */ };
    } catch (e) {}
  }

  function toast(msg) {
    if (!document.body) { return; }
    var d = document.createElement("div");
    d.textContent = msg;
    d.style.cssText = "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#198754;color:#fff;padding:12px 18px;border-radius:8px;z-index:2147483647;font:14px/1.4 sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.3);max-width:90vw";
    document.body.appendChild(d); setTimeout(function () { d.remove(); }, 5000);
  }

  function start() { flush(); connect(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();

/* Dynamic location picker: feed admin-managed centers into the website's
   "Select your Location" popup (reads window.__FIC_CENTERS, hardcoded fallback).
   Non-blocking: read last-known centers from localStorage synchronously (instant,
   no network) so the popup has them on every load after the first, then refresh
   in the background for next time. NEVER block page load. */
(function () {
  var KEY = "ficCenters";
  try {
    var cached = localStorage.getItem(KEY);
    if (cached) { var arr = JSON.parse(cached); if (arr && arr.length) window.__FIC_CENTERS = arr; }
  } catch (e) {}
  try {
    fetch("/api/v1/user/centers", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && Array.isArray(j.data) && j.data.length) {
          window.__FIC_CENTERS = j.data;
          try { localStorage.setItem(KEY, JSON.stringify(j.data)); } catch (e) {}
          ficApplyMap(); ficApplyPopupMap();
        }
      })
      .catch(function () {});
  } catch (e) {}
})();

/* Real interactive map: replace the static map picture (.map_image_box) with a
   live Google Maps embed of the selected center's address (admin-managed). Runs
   after hydration and re-applies on DOM changes, so it survives React renders. */
function ficCenters() { return window.__FIC_CENTERS || []; }
function ficCenterByLabel(name) {
  if (!name) return null;
  name = name.trim().toLowerCase();
  var cs = ficCenters();
  for (var i = 0; i < cs.length; i++) {
    var lbl = (cs[i].label || "").trim().toLowerCase();
    if (lbl && (lbl === name || name.indexOf(lbl) > -1 || lbl.indexOf(name) > -1)) return cs[i];
  }
  return null;
}
function ficSelectedCenter() {
  // 1) The center shown in the nav reflects the live selection (Harlem/Mobile/…).
  var el = document.querySelector(".center_show_main p, .center_show_main > p");
  var c = el ? ficCenterByLabel(el.textContent) : null;
  if (c) return c;
  // 2) Stored selection, matched back to a known center.
  try {
    var sel = JSON.parse(localStorage.getItem("selectedLocation") || "null");
    if (sel) {
      var hit = ficCenters().filter(function (x) { return x.id === sel.id || x.id === sel.centerID; })[0];
      if (hit) return hit;
      if (sel.address) return sel;
    }
  } catch (e) {}
  // 3) Primary center.
  return ficCenters()[0] || null;
}
function ficMapHeight(box) {
  var vw = window.innerWidth || 1024;
  // Phones: a fixed, sensible height (the stacked layout makes the panel very
  // tall, so don't match it). Desktop: match the form panel, clamped.
  if (vw <= 768) return Math.max(220, Math.min(300, Math.round((window.innerHeight || 600) * 0.42)));
  var ref = box.closest ? (box.closest(".Contact_us_sections_map_div") || box.closest(".Contact_us_inner_div")) : null;
  var h = ref ? ref.clientHeight : 0;
  if (!h || h < 320) h = Math.round((window.innerHeight || 700) * 0.6);
  return Math.max(360, Math.min(h, 620));
}
function ficApplyMap() {
  var c = ficSelectedCenter();
  if (!c || !c.address) return;
  var addr = c.address;
  var ci = addr.indexOf(":");                 // strip "Harlem: " label prefix for the query
  var q = (ci > -1 ? addr.slice(ci + 1) : addr).trim();
  var boxes = document.querySelectorAll(".map_image_box");
  for (var i = 0; i < boxes.length; i++) {
    var box = boxes[i];
    // Give the box a definite pixel height (the CSS % height doesn't resolve here,
    // which left the map tiny) so the absolutely-positioned iframe fills it.
    box.style.position = "relative";
    box.style.height = ficMapHeight(box) + "px";
    if (box.getAttribute("data-fic-q") !== q) {
      box.setAttribute("data-fic-q", q);
      box.innerHTML =
        '<iframe title="Center location" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;display:block" ' +
        'loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen ' +
        'src="https://maps.google.com/maps?q=' + encodeURIComponent(q) + '&z=15&output=embed"></iframe>';
    }
  }
  // The contact card has a half-black background gradient; drop it so the map
  // sits on a clean white card (no black showing around it).
  var inner = document.querySelector(".Contact_us_inner_div");
  if (inner && inner.getAttribute("data-fic-bg") !== "1") {
    inner.setAttribute("data-fic-bg", "1");
    inner.style.background = "#fff";
  }
  var det = document.querySelector(".conact_details_main_div p");
  if (det && det.getAttribute("data-fic-addr") !== addr) {
    det.setAttribute("data-fic-addr", addr);
    det.textContent = "Address :- " + addr;
  }
  // Any other address block on the site (footer / contact cards) -> admin address.
  var addrEls = document.querySelectorAll(".address");
  for (var j = 0; j < addrEls.length; j++) {
    if (addrEls[j].getAttribute("data-fic-addr") !== addr) {
      addrEls[j].setAttribute("data-fic-addr", addr);
      addrEls[j].textContent = addr;
    }
  }
}
/* The "Select your Location" popup's map (.image_div_of_map) is also a static
   picture. Replace it with a live map of the option currently selected in the
   popup (the checked radio), so it moves as you pick Harlem / Mobile / Ahmeek. */
function ficApplyPopupMap() {
  var boxes = document.querySelectorAll(".image_div_of_map");
  if (!boxes.length) return;
  var center = null;
  var checked = document.querySelector('input[name="location"]:checked');
  if (checked && checked.value) {
    var cs = ficCenters();
    for (var k = 0; k < cs.length; k++) { if (cs[k].id === checked.value) { center = cs[k]; break; } }
  }
  if (!center) center = ficSelectedCenter();
  if (!center || !center.address) return;
  var addr = center.address;
  var ci = addr.indexOf(":");
  var q = (ci > -1 ? addr.slice(ci + 1) : addr).trim();
  for (var i = 0; i < boxes.length; i++) {
    var box = boxes[i];
    if (box.getAttribute("data-fic-q") === q) continue;
    var h = box.clientHeight; if (!h || h < 120) h = 360;
    box.setAttribute("data-fic-q", q);
    box.style.position = "relative";
    box.style.height = h + "px";
    box.innerHTML =
      '<iframe title="Center location" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;display:block" ' +
      'loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen ' +
      'src="https://maps.google.com/maps?q=' + encodeURIComponent(q) + '&z=14&output=embed"></iframe>';
  }
}

/* Live Mosque prayer board: show the CLOSEST available mosque for the selected
   location, using a snapshot of Live Mosque's whole directory
   (/livemosque-directory.json — every registered mosque + coordinates). If a
   FUTA-owned mosque is nearby (<=60km) use that (the org's own board), otherwise
   the geographically closest mosque from the directory. */
var FIC_DIR = null;
(function () {
  try {
    fetch("/livemosque-directory.json", { cache: "force-cache" })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (Array.isArray(d) && d.length) { FIC_DIR = d; ficApplyPrayerBoard(); } })
      .catch(function () {});
  } catch (e) {}
})();
function ficKm(la1, lo1, la2, lo2) {
  function r(x) { return x * Math.PI / 180; }
  var R = 6371, dla = r(la2 - la1), dlo = r(lo2 - lo1);
  var s = Math.sin(dla / 2) * Math.sin(dla / 2) +
    Math.cos(r(la1)) * Math.cos(r(la2)) * Math.sin(dlo / 2) * Math.sin(dlo / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
function ficPrayerEntry(c) {
  // When a center has no usable coords, pick its FUTA board by name: Harlem ->
  // the Harlem board, anything else (e.g. Bronx) -> FUTA ISLAMIC CENTER INC.
  var nm = ((c && (c.label || c.city || c.address)) || "").toUpperCase();
  var FALLBACK = nm.indexOf("HARLEM") >= 0 ? "FUTA ISLAMIC CENTER HARLEM" : "FUTA ISLAMIC CENTER INC";
  if (!FIC_DIR || !FIC_DIR.length) return FALLBACK;
  var lat = c ? parseFloat(c.latitude) : NaN, lng = c ? parseFloat(c.longitude) : NaN;
  // bad/missing coords (e.g. Harlem's lng==lat in the data) -> the org's Harlem board
  if (!isFinite(lat) || !isFinite(lng) || lat === lng) return FALLBACK;
  var bf = null, bfd = Infinity, bm = null, bmd = Infinity, i, d;
  for (i = 0; i < FIC_DIR.length; i++) {
    d = ficKm(lat, lng, FIC_DIR[i].a, FIC_DIR[i].o);
    if (d < bmd) { bmd = d; bm = FIC_DIR[i]; }                  // nearest mosque overall
    if (FIC_DIR[i].f && d < bfd) { bfd = d; bf = FIC_DIR[i]; }  // nearest FUTA-owned mosque
  }
  if (bf && bfd <= 60) return bf.n;                             // org's own board if nearby
  return bm ? bm.n : FALLBACK;
}
function ficApplyPrayerBoard() {
  var frames = document.querySelectorAll('iframe[src*="livemosque.live/mosque.html"]');
  if (!frames.length) return;
  var name = ficPrayerEntry(ficSelectedCenter());
  if (!name) return;
  for (var i = 0; i < frames.length; i++) {
    if (frames[i].getAttribute("data-fic-lm") === name) continue;
    frames[i].setAttribute("data-fic-lm", name);
    frames[i].src = "https://www.livemosque.live/mosque.html?mosque=" + encodeURIComponent(name);
  }
}
// Fit the Live Mosque board into its box. The board has a fixed natural width
// (and a 6th "Jummah" card on Fridays) that overflows a narrower box. Render the
// iframe at that natural width and scale it to the measured box width, so the
// board fills the box exactly with every card visible — at any screen size.
// Natural width per board (raise if a card is cut, lower if a gap). The INC board
// has 7 cards (extra "Jummah2") so it's wider than Harlem's 6-card board.
var FIC_BOARD_HARLEM = 1400;
var FIC_BOARD_INC = 1560;
function ficFitPrayerBoard() {
  try {
    var frames = document.querySelectorAll(".iframe-container iframe[src*='livemosque']");
    for (var i = 0; i < frames.length; i++) {
      var f = frames[i], box = (f.closest && f.closest(".iframe-container")) || f.parentElement;
      if (!box) continue;
      var cw = box.clientWidth, ch = box.clientHeight;
      if (!cw || !ch) continue;
      var src = f.getAttribute("src") || "";
      var BOARD = /CENTER%20INC|CENTER INC/i.test(src) ? FIC_BOARD_INC : FIC_BOARD_HARLEM;
      if (cw >= BOARD || cw < 700) { // box already wide enough, or mobile: leave default
        f.style.width = "100%"; f.style.height = "100%"; f.style.transform = "";
        continue;
      }
      var scale = cw / BOARD;
      f.style.transformOrigin = "top left";
      f.style.width = BOARD + "px";
      f.style.height = Math.round(ch / scale) + "px";
      f.style.transform = "scale(" + scale + ")";
    }
  } catch (e) {}
}
// Recent Activities gallery: make videos play inline on mobile (no forced
// fullscreen / black frame) and show a poster frame.
function ficFixGallery() {
  try {
    var v = document.querySelectorAll(".gallery-video");
    for (var i = 0; i < v.length; i++) {
      if (!v[i].hasAttribute("playsinline")) {
        v[i].setAttribute("playsinline", "");
        v[i].setAttribute("webkit-playsinline", "");
        v[i].setAttribute("preload", "metadata");
      }
    }
  } catch (e) {}
}
// Donate page: present the "Make Your Donation" selection as a full-page view
// (CSS handles the look), require an explicit One-time/Monthly choice, and show
// validation for type/amount/frequency on the screen instead of a fading toast.
window.__ficDonationFreq = window.__ficDonationFreq || null;
(function () {
  var f0 = window.fetch;
  if (f0 && !f0.__ficWrapped) {
    var wrapped = function (input, init) {
      try {
        var url = typeof input === "string" ? input : (input && input.url) || "";
        if (/\/payment\/create-checkout-session/.test(url) && init && typeof init.body === "string") {
          var b = JSON.parse(init.body);
          b.frequency = window.__ficDonationFreq || "one-time";
          init.body = JSON.stringify(b);
        }
      } catch (e) {}
      return f0.apply(this, arguments);
    };
    wrapped.__ficWrapped = true;
    window.fetch = wrapped;
  }
})();
function ficShowDonateErrors(list) {
  var modal = document.querySelector(".donation_modal_overlay"); if (!modal) return;
  var box = modal.querySelector("#fic-donate-errors");
  if (!box) {
    box = document.createElement("div");
    box.id = "fic-donate-errors"; box.className = "fic-donate-error";
    var host = modal.querySelector(".donation_modal_content") || modal.querySelector(".donation_modal_container") || modal;
    host.insertBefore(box, host.firstChild);
  }
  box.innerHTML = "Please complete the following:<ul style='margin:6px 0 0 18px;padding:0'>" +
    list.map(function (m) { return "<li>" + m + "</li>"; }).join("") + "</ul>";
  box.style.display = "block";
  box.scrollIntoView({ behavior: "smooth", block: "center" });
}
function ficClearDonateErrors() {
  var box = document.querySelector("#fic-donate-errors");
  if (box) box.style.display = "none";
}
function ficApplyDonationFrequency() {
  try {
    if (!/\/donate(\b|\/|$)/.test(location.pathname)) return;
    if (document.getElementById("fic-freq")) return;
    var amount = document.querySelector('input[placeholder="0.00"]');
    var anchor = document.querySelector(".donation_quick_amounts") ||
      (amount && (amount.closest(".donation_amount_section") || amount.parentElement));
    if (!anchor || !anchor.parentElement) return;
    var wrap = document.createElement("div");
    wrap.id = "fic-freq";
    wrap.style.cssText = "margin:18px 0";
    var lbl = document.createElement("div");
    lbl.innerHTML = "Frequency <span style='color:#c62828'>*</span>";
    lbl.style.cssText = "font-weight:600;margin-bottom:8px";
    wrap.appendChild(lbl);
    var row = document.createElement("div");
    row.style.cssText = "display:flex;gap:10px;flex-wrap:wrap";
    wrap.appendChild(row);
    [["one-time", "One-time"], ["monthly", "Monthly"]].forEach(function (o) {
      var b = document.createElement("button");
      b.type = "button"; b.setAttribute("data-freq", o[0]); b.textContent = o[1];
      b.style.cssText = "padding:9px 22px;border-radius:999px;border:2px solid #2e7d32;cursor:pointer;font-weight:600;background:#fff;color:#2e7d32";
      b.addEventListener("click", function () {
        window.__ficDonationFreq = o[0];
        var bs = row.querySelectorAll("button");
        for (var i = 0; i < bs.length; i++) {
          var on = bs[i].getAttribute("data-freq") === o[0];
          bs[i].style.background = on ? "#2e7d32" : "#fff";
          bs[i].style.color = on ? "#fff" : "#2e7d32";
        }
        ficClearDonateErrors();
      });
      row.appendChild(b);
    });
    anchor.parentElement.insertBefore(wrap, anchor.nextSibling);
    if (window.__ficDonationFreq) {
      var cur = row.querySelector('button[data-freq="' + window.__ficDonationFreq + '"]');
      if (cur) cur.click();
    }
  } catch (e) {}
}
// Validate on the Proceed button (capture phase) so we can block the Stripe call
// and show the requirement errors on screen. Also keep the full-page view from
// closing on a stray background click (close only via the X).
document.addEventListener("click", function (e) {
  var modal = e.target.closest && e.target.closest(".donation_modal_overlay");
  if (!modal) return;
  if (e.target === modal) { e.stopPropagation(); return; } // background click: stay open
  var btn = e.target.closest("button");
  if (!btn || btn.classList.contains("donation_modal_close")) return;
  var txt = (btn.textContent || "").toLowerCase();
  if (txt.indexOf("proceed") < 0 && txt.indexOf("donate") < 0) return;
  var errs = [];
  if (!modal.querySelector(".donation_type_card.selected")) errs.push("Select a donation type.");
  var amtEl = modal.querySelector('input[placeholder="0.00"]');
  var amt = amtEl ? parseFloat(amtEl.value) : NaN;
  if (!(amt > 0)) errs.push("Enter a valid amount.");
  if (!window.__ficDonationFreq) errs.push("Choose One-time or Monthly.");
  if (errs.length) { e.stopPropagation(); e.preventDefault(); ficShowDonateErrors(errs); }
  else ficClearDonateErrors();
}, true);
(function () {
  function applyAll() { ficApplyMap(); ficApplyPopupMap(); ficApplyPrayerBoard(); ficFitPrayerBoard(); ficFixGallery(); ficApplyDonationFrequency(); }
  function init() {
    // formatting fix: contact address/email gap; AND keep the Recent Activities
    // gallery items from collapsing on mobile (some mobile browsers ignore
    // aspect-ratio -> 0 height -> images/videos hidden).
    try {
      var s = document.createElement("style");
      s.textContent =
        ".conact_details_main_div{flex-wrap:wrap;gap:.5rem 2.5rem;align-items:flex-start}" +
        ".conact_details_main_div>p{margin:0;word-break:break-word}" +
        "@media (max-width:600px){" +
        ".gallery-item{min-height:240px}" +
        ".gallery-item .video-container,.gallery-item .gallery-video,.gallery-item .gallery-image{height:240px;min-height:240px;object-fit:cover;width:100%}" +
        "}" +
        // Donation selection: render as a full-page view instead of a centered popup.
        ".donation_modal_overlay{position:fixed;inset:0;background:#fff;display:block;overflow:auto;z-index:99999;padding:24px 14px}" +
        ".donation_modal_container{max-width:680px;width:100%;margin:0 auto;max-height:none;box-shadow:none;border-radius:0;background:#fff}" +
        ".fic-donate-error{color:#b71c1c;font-weight:600;margin:0 0 16px;padding:12px 16px;background:#fdecea;border:1px solid #f5c6cb;border-radius:10px}" +
        "#fic-freq button{min-width:120px}" +
        // mobile: tighter padding, single-column type grid, full-width toggle/buttons
        "@media (max-width:600px){" +
        ".donation_modal_overlay{padding:10px 6px}" +
        ".donation_modal_content{padding:1.25rem}" +
        ".donation_modal_header{padding:1.5rem 1rem 1.25rem}" +
        ".donation_types_grid{grid-template-columns:1fr;gap:1rem}" +
        ".fic-donate-error{font-size:14px;padding:10px 12px}" +
        "#fic-freq{margin:14px 0}#fic-freq>div:last-child{display:flex}#fic-freq button{flex:1 1 0}" +
        "}";
      (document.head || document.documentElement).appendChild(s);
    } catch (e) {}
    applyAll();
    try { new MutationObserver(applyAll).observe(document.body, { childList: true, subtree: true }); } catch (e) {}
    window.addEventListener("resize", applyAll);
    // popup selection changes are class/checked changes (not childList), so listen directly
    document.addEventListener("change", function (e) {
      if (e.target && e.target.name === "location") ficApplyPopupMap();
    }, true);
    document.addEventListener("click", function (e) {
      if (e.target && e.target.closest && e.target.closest(".first_redio_btn, .readio_btn_gropu")) setTimeout(ficApplyPopupMap, 0);
    }, true);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
