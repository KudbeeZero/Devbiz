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

    // Optional shared link: a slider with data-kbd-name round-trips with any
    // knob/stepper sharing that name. Backward-compatible — no-op without it.
    var linkName = slider.getAttribute('data-kbd-name');
    if (linkName) {
      var linkApplying = false;
      slider.addEventListener('input', function () { if (!linkApplying) linkBroadcast(linkName, parseFloat(slider.value), slider); });
      linkRegister(linkName, { setValue: function (v) {
        linkApplying = true;
        slider.value = v; update();
        // Fire input so the host page's own slider handler (charts, etc.) reacts,
        // but linkApplying suppresses the re-broadcast above to avoid loops.
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        linkApplying = false;
      } });
    }

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

  /* ==========================================================================
   * Shared linking bus — lets a knob/stepper/slider sharing a data-kbd-name
   * round-trip their value. Each control registers a setter; peers update
   * without re-broadcasting (the `silent` flag prevents loops).
   * ======================================================================== */
  var linkGroups = {};
  function linkRegister(name, control) {
    if (!name) return;
    (linkGroups[name] || (linkGroups[name] = [])).push(control);
  }
  function linkBroadcast(name, value, source) {
    var group = linkGroups[name];
    if (!group) return;
    for (var i = 0; i < group.length; i++) {
      if (group[i] !== source && group[i].setValue) group[i].setValue(value, true);
    }
  }

  // Shared numeric helpers.
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function roundToStep(v, min, step) {
    if (!step) return v;
    var n = Math.round((v - min) / step);
    return min + n * step;
  }
  function fmt(v, dp, unit) { return (parseFloat(v) || 0).toFixed(dp) + (unit || ''); }

  /* ==========================================================================
   * .kbd-knob — rotary control. Builds an SVG arc + cap, wires pointer/wheel/
   * keys. The arc sweeps 270deg (from -135deg to +135deg), matching the notch.
   * ======================================================================== */
  var ARC_START = -135, ARC_SWEEP = 270; // degrees
  function enhanceKnob(knob) {
    if (knob.dataset.kbdReady) return;
    knob.dataset.kbdReady = '1';

    var min = parseFloat(knob.getAttribute('data-min'));
    var max = parseFloat(knob.getAttribute('data-max'));
    if (isNaN(min)) min = 0;
    if (isNaN(max)) max = 100;
    var step = parseFloat(knob.getAttribute('data-step')); if (isNaN(step) || step <= 0) step = (max - min) / 100;
    var dp = parseInt(knob.getAttribute('data-dp') || '0', 10);
    var unit = knob.getAttribute('data-unit') || '';
    var label = knob.getAttribute('data-label') || '';
    var name = knob.getAttribute('data-kbd-name') || '';
    var value = parseFloat(knob.getAttribute('data-value'));
    if (isNaN(value)) value = min;
    value = clamp(value, min, max);

    // Geometry: viewBox 0..100, circle r=42 centred at 50,50.
    var R = 42, CX = 50, CY = 50;
    var CIRC = 2 * Math.PI * R;
    var arcLen = CIRC * (ARC_SWEEP / 360);

    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'kbd-knob__svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('aria-hidden', 'true');
    var defs = document.createElementNS(svgNS, 'defs');
    var grad = document.createElementNS(svgNS, 'linearGradient');
    grad.setAttribute('id', 'kbdKnobGrad'); grad.setAttribute('x1', '0'); grad.setAttribute('y1', '0'); grad.setAttribute('x2', '1'); grad.setAttribute('y2', '1');
    var s1 = document.createElementNS(svgNS, 'stop'); s1.setAttribute('offset', '0%'); s1.setAttribute('stop-color', 'var(--cyan, #39e6ff)');
    var s2 = document.createElementNS(svgNS, 'stop'); s2.setAttribute('offset', '100%'); s2.setAttribute('stop-color', 'var(--accent, #6f5bff)');
    grad.appendChild(s1); grad.appendChild(s2); defs.appendChild(grad); svg.appendChild(defs);

    // Both arcs share dash geometry; rotate so the gap sits at the bottom.
    function makeArc(cls) {
      var p = document.createElementNS(svgNS, 'circle');
      p.setAttribute('class', cls);
      p.setAttribute('cx', CX); p.setAttribute('cy', CY); p.setAttribute('r', R);
      p.setAttribute('transform', 'rotate(' + (90 + (360 - ARC_SWEEP) / 2) + ' ' + CX + ' ' + CY + ')');
      return p;
    }
    var track = makeArc('kbd-knob__track');
    track.setAttribute('stroke-dasharray', arcLen + ' ' + CIRC);
    var arc = makeArc('kbd-knob__arc');
    arc.setAttribute('stroke-dasharray', arcLen + ' ' + CIRC);
    svg.appendChild(track); svg.appendChild(arc);

    var cap = document.createElement('div'); cap.className = 'kbd-knob__cap';
    var valEl = document.createElement('div'); valEl.className = 'kbd-knob__val';
    cap.appendChild(valEl);
    if (label) { var lbl = document.createElement('div'); lbl.className = 'kbd-knob__label'; lbl.textContent = label; cap.appendChild(lbl); }

    knob.appendChild(svg);
    knob.appendChild(cap);

    // ARIA / focus.
    knob.setAttribute('role', 'slider');
    if (!knob.hasAttribute('tabindex')) knob.setAttribute('tabindex', '0');
    knob.setAttribute('aria-valuemin', String(min));
    knob.setAttribute('aria-valuemax', String(max));
    if (!knob.hasAttribute('aria-label') && label) knob.setAttribute('aria-label', label);

    function frac() { return (value - min) / ((max - min) || 1); }
    function render() {
      var f = clamp(frac(), 0, 1);
      arc.setAttribute('stroke-dashoffset', String(arcLen * (1 - f)));
      knob.style.setProperty('--kbd-angle', (ARC_START + f * ARC_SWEEP) + 'deg');
      var txt = fmt(value, dp, unit);
      valEl.textContent = txt;
      knob.setAttribute('aria-valuenow', String(value));
      knob.setAttribute('aria-valuetext', txt);
    }
    function setValue(v, silent) {
      v = clamp(roundToStep(v, min, step), min, max);
      v = parseFloat(v.toFixed(6)); // guard fp drift off the rounded grid
      if (v === value) { render(); return; }
      value = v; render();
      if (!silent && name) linkBroadcast(name, value, knob);
    }
    knob.kbdSetValue = setValue;
    linkRegister(name, { setValue: setValue });

    // ---- Pointer drag: vertical movement drives the value. ----
    var dragging = false, lastY = 0;
    var dragSpan = 180; // px of vertical travel for the full min..max range
    function onPointerDown(e) {
      dragging = true; lastY = e.clientY;
      knob.classList.add('dragging');
      knob.focus();
      try { knob.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
    }
    function onPointerMove(e) {
      if (!dragging) return;
      var dy = lastY - e.clientY; lastY = e.clientY;
      setValue(value + (dy / dragSpan) * (max - min));
      e.preventDefault();
    }
    function onPointerUp(e) {
      if (!dragging) return;
      dragging = false; knob.classList.remove('dragging');
      try { knob.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    knob.addEventListener('pointerdown', onPointerDown);
    knob.addEventListener('pointermove', onPointerMove);
    knob.addEventListener('pointerup', onPointerUp);
    knob.addEventListener('pointercancel', onPointerUp);

    // ---- Wheel ----
    knob.addEventListener('wheel', function (e) {
      e.preventDefault();
      setValue(value + (e.deltaY < 0 ? step : -step));
    }, { passive: false });

    // ---- Keyboard ----
    knob.addEventListener('keydown', function (e) {
      var big = Math.max(step, (max - min) / 10);
      switch (e.key) {
        case 'ArrowUp': case 'ArrowRight': setValue(value + step); break;
        case 'ArrowDown': case 'ArrowLeft': setValue(value - step); break;
        case 'PageUp': setValue(value + big); break;
        case 'PageDown': setValue(value - big); break;
        case 'Home': setValue(min); break;
        case 'End': setValue(max); break;
        default: return;
      }
      e.preventDefault();
    });

    render();
  }

  /* ==========================================================================
   * .kbd-stepper — number input + −/+ buttons, optional shared link.
   * ======================================================================== */
  function enhanceStepper(stepper) {
    if (stepper.dataset.kbdReady) return;
    stepper.dataset.kbdReady = '1';

    var min = parseFloat(stepper.getAttribute('data-min'));
    var max = parseFloat(stepper.getAttribute('data-max'));
    if (isNaN(min)) min = 0;
    if (isNaN(max)) max = 100;
    var step = parseFloat(stepper.getAttribute('data-step')); if (isNaN(step) || step <= 0) step = 1;
    var dp = parseInt(stepper.getAttribute('data-dp') || '0', 10);
    var unit = stepper.getAttribute('data-unit') || '';
    var label = stepper.getAttribute('data-label') || stepper.getAttribute('aria-label') || 'Value';
    var name = stepper.getAttribute('data-kbd-name') || '';
    var value = parseFloat(stepper.getAttribute('data-value'));
    if (isNaN(value)) value = min;
    value = clamp(roundToStep(value, min, step), min, max);

    // Build structure (reuse author-provided children if present).
    var dec = stepper.querySelector('[data-kbd-dec]');
    var inc = stepper.querySelector('[data-kbd-inc]');
    var input = stepper.querySelector('.kbd-stepper__input');
    var hadAll = dec && inc && input;
    if (!dec) { dec = document.createElement('button'); dec.className = 'kbd-stepper__btn'; dec.setAttribute('data-kbd-dec', ''); dec.textContent = '−'; }
    if (!inc) { inc = document.createElement('button'); inc.className = 'kbd-stepper__btn'; inc.setAttribute('data-kbd-inc', ''); inc.textContent = '+'; }
    if (!input) { input = document.createElement('input'); input.className = 'kbd-stepper__input'; }
    dec.type = 'button'; inc.type = 'button';
    input.type = 'text';
    input.setAttribute('inputmode', dp > 0 ? 'decimal' : 'numeric');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('aria-label', label);
    dec.setAttribute('aria-label', 'Decrease ' + label);
    inc.setAttribute('aria-label', 'Increase ' + label);

    if (!hadAll) {
      stepper.textContent = '';
      stepper.appendChild(dec); stepper.appendChild(input); stepper.appendChild(inc);
    }

    function render() {
      input.value = fmt(value, dp, unit);
      dec.disabled = value <= min + 1e-9;
      inc.disabled = value >= max - 1e-9;
    }
    function setValue(v, silent) {
      v = clamp(roundToStep(v, min, step), min, max);
      v = parseFloat(v.toFixed(6));
      var changed = v !== value;
      value = v; render();
      if (changed && !silent && name) linkBroadcast(name, value, stepper);
    }
    stepper.kbdSetValue = setValue;
    linkRegister(name, { setValue: setValue });

    dec.addEventListener('click', function () { setValue(value - step); input.focus(); });
    inc.addEventListener('click', function () { setValue(value + step); input.focus(); });

    function commit() {
      var raw = parseFloat(String(input.value).replace(/[^0-9eE+.\-]/g, ''));
      if (isNaN(raw)) { render(); return; }
      setValue(raw);
    }
    input.addEventListener('change', commit);
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowUp') { setValue(value + step); e.preventDefault(); }
      else if (e.key === 'ArrowDown') { setValue(value - step); e.preventDefault(); }
      else if (e.key === 'Enter') { commit(); }
    });

    render();
  }

  function init() {
    var els = document.querySelectorAll('input[type="range"].kbd-slider');
    for (var i = 0; i < els.length; i++) enhance(els[i]);
    var knobs = document.querySelectorAll('.kbd-knob');
    for (var k = 0; k < knobs.length; k++) enhanceKnob(knobs[k]);
    var steppers = document.querySelectorAll('.kbd-stepper');
    for (var s = 0; s < steppers.length; s++) enhanceStepper(steppers[s]);
    document.addEventListener('pointerup', clearDrag);
    document.addEventListener('pointercancel', clearDrag);
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
