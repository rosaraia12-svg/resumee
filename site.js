/* ------------------------------------------------------------------ *
 * site.js — EN / IT switch.
 *
 * Every translatable bit exists twice in the markup, tagged
 * data-lang="en" / data-lang="it"; CSS shows the pair matching <html lang>.
 * The inline script in <head> sets the starting language before first
 * paint; this just flips it and remembers the choice.
 * ------------------------------------------------------------------ */
(function () {
  "use strict";

  var root = document.documentElement;
  var btn = document.getElementById("langToggle");

  function setLang(l) {
    root.lang = l;
    try { localStorage.setItem("lang", l); } catch (e) {}
    document.dispatchEvent(new CustomEvent("langchange", { detail: l }));
  }

  btn.addEventListener("click", function () {
    setLang(root.lang === "it" ? "en" : "it");
  });

  /* ---------- expandable project cards ---------- *
   * The panel animates grid-template-rows 0fr -> 1fr; while closed it is
   * inert so its links and text stay out of the tab order / screen readers. */
  Array.prototype.forEach.call(document.querySelectorAll(".project-toggle"), function (toggle) {
    var panel = document.getElementById(toggle.getAttribute("aria-controls"));
    if (!panel) return;
    toggle.addEventListener("click", function () {
      var open = toggle.getAttribute("aria-expanded") !== "true";
      toggle.setAttribute("aria-expanded", String(open));
      panel.classList.toggle("is-open", open);
      if (open) panel.removeAttribute("inert");
      else {
        panel.setAttribute("inert", "");
        // closing a tall panel from below would leave the reader stranded mid-page
        var card = toggle.closest(".project");
        if (card && card.getBoundingClientRect().top < 0) card.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });

  Array.prototype.forEach.call(document.querySelectorAll(".project-close"), function (close) {
    close.addEventListener("click", function () {
      var toggle = document.querySelector('.project-toggle[aria-controls="' + close.getAttribute("data-closes") + '"]');
      if (toggle) { toggle.click(); toggle.focus({ preventScroll: true }); }
    });
  });
})();
