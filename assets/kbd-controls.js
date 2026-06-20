/* ============================================================================
 * Kudbee Controls — progressive enhancement for .kbd-slider range inputs.
 * Adds: gradient fill (--val), a live value bubble with decimal precision, a
 * "dragging/active" state for the throb glow + sheen, and aria-valuetext.
 * No build step; safe to load on any page. Sliders still work without JS.
 *
 * Markup:  <span class="kbd-field">
 *            <input type="range" class="kbd-slider" min=".." max=".." step=".."
 *                   data-unit="%" data-dp="1"
 *                   data-display-min="0" data-display-max="100">
 *          </span>
 * data-display-min/max optionally remap the raw min..max onto a friendly range
 * (e.g. a 0..1000 scrubber shown as 0..100%).
 * ========================================================================== */
(function () {
  'use strict';

  function enhance(slider) {
    var field = slider.closest('.kbd-field');
    if (!field) { field = slider.parentNode; field.classList.add('kbd-field'); }

    var bubble = field.querySelector('.kbd-bubble');
    if (!bubble) { bubble = document.createElement('span'); bubble.className = 'kbd-bubble'; bubble.setAttribute('aria-hidden', 'true'); field.appendChild(bubble); }

    var dp = parseInt(slider.getAttribute('data-dp') || '0', 10);
    var unit = slider.getAttribute('data-unit') || '';
    var dispMin = slider.getAttribute('data-display-min');
    var dispMax = slider.getAttribute('data-display-max');

    function pct() {
      var min = parseFloat(slider.min) || 0;
      var max = parseFloat(slider.max);
      if (isNaN(max)) max = 100;
      var span = (max - min) || 1;
      return ((parseFloat(slider.value) - min) / span) * 100;
    }
    function displayValue() {
      var v = parseFloat(slider.value);
      if (dispMin !== null && dispMax !== null) {
        var min = parseFloat(slider.min) || 0, max = parseFloat(slider.max);
        if (isNaN(max)) max = 100;
        var span = (max - min) || 1;
        v = parseFloat(dispMin) + ((v - min) / span) * (parseFloat(dispMax) - parseFloat(dispMin));
      }
      return v.toFixed(dp) + unit;
    }
    function update() {
      var p = Math.max(0, Math.min(100, pct()));
      slider.style.setProperty('--val', p + '%');
      bubble.style.left = p + '%';
      var txt = displayValue();
      bubble.textContent = txt;
      slider.setAttribute('aria-valuetext', txt);
    }

    slider.addEventListener('input', update);
    // Lets a page refresh the fill/bubble after a *programmatic* value change
    // (e.g. an auto-playing scrubber) WITHOUT firing the page's own 'input' handler.
    slider.kbdRefresh = update;
    slider.addEventListener('kbd:refresh', update);
    slider.addEventListener('pointerdown', function () { field.classList.add('active'); slider.classList.add('dragging'); });
    slider.addEventListener('focus', function () { field.classList.add('active'); });
    slider.addEventListener('blur', function () { if (!slider.classList.contains('dragging')) field.classList.remove('active'); });

    update();
  }

  // One delegated pointer-release handler clears drag state for whichever slider
  // was being dragged (avoids a per-slider global listener).
  function clearDrag() {
    var dragging = document.querySelectorAll('.kbd-slider.dragging');
    for (var i = 0; i < dragging.length; i++) {
      var s = dragging[i]; s.classList.remove('dragging');
      var f = s.closest('.kbd-field'); if (f && document.activeElement !== s) f.classList.remove('active');
    }
  }

  function init() {
    var els = document.querySelectorAll('input[type="range"].kbd-slider');
    for (var i = 0; i < els.length; i++) enhance(els[i]);
    document.addEventListener('pointerup', clearDrag);
    document.addEventListener('pointercancel', clearDrag);
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
