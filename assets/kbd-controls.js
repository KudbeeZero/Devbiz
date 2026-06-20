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
    if (!bubble) { bubble = document.createElement('span'); bubble.className = 'kbd-bubble'; field.appendChild(bubble); }

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

    function down() { field.classList.add('active'); slider.classList.add('dragging'); }
    function up() { field.classList.remove('active'); slider.classList.remove('dragging'); }

    slider.addEventListener('input', update);
    slider.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    slider.addEventListener('focus', function () { field.classList.add('active'); });
    slider.addEventListener('blur', function () { field.classList.remove('active'); });

    update();
  }

  function init() {
    var els = document.querySelectorAll('input[type="range"].kbd-slider');
    for (var i = 0; i < els.length; i++) enhance(els[i]);
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
