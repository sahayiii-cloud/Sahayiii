
const APP = window.APP_CTX || {};

const USER_ID    = APP.userId;
const JOB_ID     = APP.jobId;
const PROFILE_ID = APP.profileId;
const IS_CUSTOM  = !!APP.isCustom;

  // === Custom-price negotiation state ===
  const isCustomJob = IS_CUSTOM;
  const bookBtn = document.getElementById('bookBtn');
  const priceBox = document.getElementById('giver-price');
  const priceStatus = document.getElementById('price-status');
  const priceConfirmBtn = document.getElementById('price-confirm');  // ✅ ADD THIS


  let negotiationId = null;
  let pricePollTimer = null;

  let callCooldownTimer = null;
  const callBtn = document.getElementById('callBtn');

  function setCallButton(enabled, msg) {
    if (!callBtn) return;
    if (enabled) {
      callBtn.disabled = false;
      callBtn.textContent = msg || '📞 Call Sahayi';
      callBtn.classList.remove('btn-secondary');
      callBtn.classList.add('btn-warning');
    }   else {
      callBtn.disabled = true;
      callBtn.textContent = msg || '⏳ Please wait...';
      callBtn.classList.remove('btn-warning');
      callBtn.classList.add('btn-secondary');
    }
  }


  // === Reconnect negotiation on page reload ===
  document.addEventListener('DOMContentLoaded', async () => {
    if (!isCustomJob) return; // only for custom jobs

    try {
      const res = await fetch(`/negotiation/check?worker_id=${USER_ID}&job_id=${JOB_ID}`);
      const data = await res.json();

      if (data.ok && data.found) {
        // If it was cancelled already, DO NOT resume polling—just resume cooldown.
        if (data.status === 'cancelled') {
          negotiationId = null;
          document.getElementById('custom-price-wrap')?.style && (document.getElementById('custom-price-wrap').style.display = 'none');

          const meta = cdGetMeta();
          if (meta && meta.negotiation_id === data.negotiation_id) {
            // We've seen this exact cancellation before
            if (!meta.consumed && meta.end_ts && Date.now() < meta.end_ts) {
              // still running – just resume UI
              cdSetEnd(meta.end_ts);
              runCooldown();
            } else {
              // finished or consumed – do NOT restart
              localStorage.removeItem(cdCanonicalKey());
              setCallButton(true, '📞 Call Sahayi');
            }
            return;
          }

          // First time seeing THIS cancelled negotiation – seed once
          startCooldownFromCancelledAt(data.cancelled_at || new Date().toISOString(), 300, data.negotiation_id);

          return;
        }


        negotiationId = data.negotiation_id;
        console.log("🔁 Resumed negotiation:", negotiationId);

        const wrap = document.getElementById('custom-price-wrap');
        if (wrap) wrap.style.display = 'block';

        // Start price polling again
        startPricePolling();

        // Restore status text from current prices
        const giver = data.giver_price ? Number(data.giver_price).toFixed(2) : null;
        const worker = data.worker_price ? Number(data.worker_price).toFixed(2) : null;

        if (data.status === 'confirmed') {
          priceStatus.textContent = `✅ Price matched at ₹${giver || worker}. You can book now.`;
          setBookEnabled(true);
        } else if (giver && worker && giver !== worker) {
          priceStatus.textContent = `You offered ₹${giver}. Worker offered ₹${worker}. Waiting to match…`;
          setBookEnabled(false);
        } else if (giver && !worker) {
          priceStatus.textContent = `You offered ₹${giver}. Waiting for worker to respond…`;
        } else if (!giver && worker) {
          priceStatus.textContent = `Worker offered ₹${worker}. Enter your price to match.`;
        } else {
          priceStatus.textContent = 'Enter your price to start negotiation.';
        }
      }
    } catch (err) {
      console.error('Negotiation check error:', err);
    }
  });


  function setBookEnabled(enabled) {
    if (!bookBtn) return;
    if (enabled) {
      bookBtn.style.pointerEvents = 'auto';
      bookBtn.style.opacity = '1';
      bookBtn.removeAttribute('aria-disabled');
    } else {
      bookBtn.style.pointerEvents = 'none';
      bookBtn.style.opacity = '.6';
      bookBtn.setAttribute('aria-disabled', 'true');
    }
  }

  function handleNegotiationStatus(d) {
    if (!d || !d.ok) return;
    if (d.status === 'confirmed') {
      if (priceStatus) priceStatus.textContent = '✅ Price matched. You can book now.';
      setBookEnabled(true);
      if (pricePollTimer) { clearInterval(pricePollTimer); pricePollTimer = null; }
    } else if (d.status === 'open') {
      if (priceStatus) priceStatus.textContent = 'Waiting for both sides to enter the same amount…';
      setBookEnabled(false);
    } else if (d.status === 'cancelled') {
      if (priceStatus) priceStatus.textContent = '❌ Negotiation cancelled.';
      setBookEnabled(false);
      if (pricePollTimer) { clearInterval(pricePollTimer); pricePollTimer = null; }
    }
  }

  // ✅ FIXED pollNegotiation() with persistent cooldown integration
  async function pollNegotiation() {
    if (!negotiationId) return;
    try {
      const r = await fetch('/negotiation/status?negotiation_id=' + negotiationId);
      const d = await r.json();
      if (!d || !d.ok) return;

      const giver = d.giver_price ? Number(d.giver_price).toFixed(2) : null;
      const worker = d.worker_price ? Number(d.worker_price).toFixed(2) : null;

      if (d.status === 'confirmed') {
        // ✅ Both prices matched
        if (priceStatus)
          priceStatus.textContent = `✅ Price matched at ₹${giver || worker}. You can book now.`;
        setBookEnabled(true);
        clearInterval(pricePollTimer);
        pricePollTimer = null;

      } else if (d.status === 'cancelled') {
        // ❌ Worker cancelled the negotiation
        if (priceStatus)
          priceStatus.textContent = '❌ Negotiation cancelled by worker.';
        setBookEnabled(false);

        // Hide price input box
        const wrap = document.getElementById('custom-price-wrap');
        if (wrap) wrap.style.display = 'none';

        clearInterval(pricePollTimer);
        pricePollTimer = null;
        negotiationId = null;

        // 🔁 Start persistent 5-minute cooldown (300 seconds), but seed only once per negotiation
        const meta = cdGetMeta();
        if (meta && meta.negotiation_id === d.negotiation_id && !meta.consumed) {
          // Already seeded for this cancellation — just resume if still running
          if (meta.end_ts && Date.now() < meta.end_ts) {
            cdSetEnd(meta.end_ts);
            runCooldown();
          } else {
            localStorage.removeItem(cdCanonicalKey());
            setCallButton(true, '📞 Call Sahayi');
          }
        } else {
          startCooldownFromCancelledAt(d.cancelled_at, 300, d.negotiation_id);
        }



      } else {
        // --- OPEN negotiation state ---
        if (giver && worker && giver !== worker) {
          priceStatus.textContent = `You offered ₹${giver}. Worker offered ₹${worker}. Waiting to match…`;
        } else if (giver && !worker) {
          priceStatus.textContent = `You offered ₹${giver}. Waiting for worker to respond…`;
        } else if (!giver && worker) {
          priceStatus.textContent = `Worker offered ₹${worker}. Enter your price to match.`;
        } else {
          priceStatus.textContent = 'Enter your price to start negotiation.';
        }
        setBookEnabled(false);
      }

    } catch (e) {
      console.error('Negotiation poll error:', e);
    }
  }



  function startPricePolling() {
    if (!negotiationId) return;
    if (pricePollTimer) clearInterval(pricePollTimer);
    pollNegotiation(); // immediate
    pricePollTimer = setInterval(pollNegotiation, 2000);
  }


(function() {
  // Terminal statuses from Twilio
  const TERMINAL_STATUSES = ['completed','failed','busy','no-answer','canceled'];

  const callBtn = document.getElementById('callBtn');
  const floating = document.getElementById('callFloatingCard');
  const statusText = document.getElementById('callStatusText');
  const title = document.getElementById('callTitle');
  const detail = document.getElementById('callDetail');
  const endCallBtn = document.getElementById('endCallBtn');

  let pollTimer = null;
  let currentSid = null;

  function showFloating() {
    floating.style.display = 'block';
  }
  function hideFloating() {
    floating.style.display = 'none';
  }
  function updateStatusLine(line) {
    statusText.textContent = line;
  }
  function setDetail(line) {
    detail.style.display = line ? 'block' : 'none';
    detail.textContent = line || '';
  }

  // End-call button will request server to cancel the call
  endCallBtn?.addEventListener('click', function() {
    if (!currentSid) return;
    updateStatusLine('Requesting hangup...');
    fetch('/call_cancel/' + encodeURIComponent(currentSid), { method: 'POST' })
      .then(r => r.json())
      .then(j => {
        if (j.status === 'success') {
          updateStatusLine('Hangup requested — finishing...');
        } else {
          updateStatusLine('Hangup request failed: ' + (j.message || 'unknown'));
        }
      })
      .catch(err => {
        console.error(err);
        updateStatusLine('Network error while requesting hangup');
      });
  });

  function startPolling(sid) {
    currentSid = sid;
    showFloating();
    updateStatusLine('Connecting...');
    setDetail('Call id: ' + sid);

    // Poll immediately, then every 2.5s
    async function doPoll() {
      try {
        const res = await fetch('/call_status/' + encodeURIComponent(sid));
        const json = await res.json();
        if (!json || !json.status) {
          updateStatusLine('No status returned');
          return;
        }
        const st = json.status;
        updateStatusLine(st.replace(/_/g,' '));

        if (json.to || json.from) {
          setDetail(`To: ${json.to || ''} · From: ${json.from || ''}`);
        }

        if (TERMINAL_STATUSES.includes(st)) {
          // stop polling and hide after a short delay
          clearInterval(pollTimer);
          pollTimer = null;
          setTimeout(() => {
            hideFloating();
            currentSid = null;
            setDetail('');
          }, 1400);
        }
      } catch (err) {
        console.error('call_status error', err);
        updateStatusLine('Error fetching status');
      }
    }

    // kick off
    doPoll();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(doPoll, 2500);
  }

  // ✅ FIXED call button handler with cooldown prevention
  callBtn?.addEventListener('click', function() {
    // 🚫 Block call if cooldown active
    const end = cdGetEnd();
    if (end && Date.now() < end) {
      const remaining = Math.max(0, Math.floor((end - Date.now()) / 1000));
      alert(`⏳ Please wait ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')} minutes before calling again.`);
      return;
    }


    if (!confirm('Do you want to call this worker?')) return;

    fetch(`/call_worker/${PROFILE_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_id: JOB_ID })
    })
    .then(async res => {
      const data = await res.json().catch(() => ({ status: 'error', message: 'Invalid JSON response' }));
      if (data.status === 'success') {
        if (data.twilio_sid) {
          startPolling(data.twilio_sid);
        } else {
          showFloating();
          updateStatusLine('Call initiated (no sid returned)');
        }

        // ★ Open/get negotiation row for CUSTOM jobs
        if (isCustomJob) {
          fetch('/negotiation/open', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              worker_user_id: USER_ID,
              job_id: JOB_ID
            })
          })
          .then(r => r.json())
          .then(j => {
            if (j.ok) {
              negotiationId = j.negotiation_id;
              startPricePolling();

              // 👇 Show price input section for job giver
              const wrap = document.getElementById('custom-price-wrap');
              if (wrap) {
                wrap.style.display = 'block';
                document.getElementById('giver-price')?.focus();
              }
            } else {
              console.warn('negotiation/open failed', j);
            }
          })
        .catch(err => console.error('negotiation/open error', err));
        }
      } else {
        alert('Error: ' + (data.message || 'Unknown error'));
        console.error('call_worker response', data);
      }
    })
    .catch(err => {
      alert('Network/server error; check console.');
      console.error(err);
    });
  });


})();

  // When the job giver clicks Confirm, send the offer
  if (isCustomJob && priceBox && priceConfirmBtn) {
    priceConfirmBtn.addEventListener('click', async () => {
      if (!negotiationId) {
        alert('Negotiation not started yet.');
        return;
      }
      const val = priceBox.value;
      if (!val) {
        priceBox.focus();
        return;
      }
      try {
        const res = await fetch('/negotiation/offer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            negotiation_id: negotiationId,
            role: 'giver',
            price: val
          })
        });
        const data = await res.json();

        const giver = Number(val).toFixed(2);
        const worker = data.worker_price ? Number(data.worker_price).toFixed(2) : null;

        if (data.status === 'confirmed') {
          priceStatus.textContent = `✅ Price matched at ₹${giver}. You can book now.`;
          setBookEnabled(true);
        } else if (worker) {
          priceStatus.textContent = `You offered ₹${giver}. Worker offered ₹${worker}. Waiting to match…`;
          setBookEnabled(false);
        } else {
          priceStatus.textContent = `You offered ₹${giver}. Waiting for worker to enter price…`;
          setBookEnabled(false);
        }
      } catch (e) {
        console.error('Negotiation offer error:', e);
        priceStatus.textContent = 'Network error. Try again.';
      }
    });
  }


(function(){
  // Only run for signed-in workers (no harm if others see it; nothing will show)
  let negId = null;
  let pollTimer = null;
  const overlay  = document.getElementById('neg-overlay');
  const titleEl  = document.getElementById('neg-title');
  const subEl    = document.getElementById('neg-subtitle');
  const priceEl  = document.getElementById('neg-worker-price');
  const msgEl    = document.getElementById('neg-msg');
  const btnOK    = document.getElementById('neg-confirm');
  const btnCancel= document.getElementById('neg-cancel');

  function showPopup(data){
    negId = data.id;
    titleEl.textContent = 'Custom price confirmation';
    subEl.textContent = `From: ${data.giver_name || 'Job Giver'} • Job: ${data.job_title || 'Custom job'}`;
    priceEl.value = '';
    msgEl.textContent = 'Enter your price. Booking unlocks when prices match.';
    overlay.style.display = 'flex';
    priceEl.focus();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(checkStatus, 2000);
  }

  function hidePopup(){
    overlay.style.display = 'none';
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    negId = null;
  }

  async function checkInbox(){
    if (negId) return; // already handling a negotiation
    try{
      const r = await fetch('/negotiation/pending', {credentials:'same-origin'});
      const j = await r.json();
      if (j && j.ok && j.negotiation) showPopup(j.negotiation);
    }catch(e){ /* ignore */ }
  }

  async function checkStatus() {
    if (!negId) return;
    try {
      const r = await fetch('/negotiation/status?negotiation_id=' + negId, { credentials: 'same-origin' });
      const d = await r.json();
      if (!d || !d.ok) return;

      const giver = d.giver_price ? Number(d.giver_price).toFixed(2) : null;
      const worker = d.worker_price ? Number(d.worker_price).toFixed(2) : null;

      // === dynamic UI messages ===
      if (d.status === 'confirmed') {
        msgEl.textContent = `✅ Price matched at ₹${giver || worker}. You can book now.`;
        setTimeout(hidePopup, 1000);
      } else if (d.status === 'cancelled') {
        msgEl.textContent = '❌ Negotiation cancelled.';
        setTimeout(hidePopup, 800);
      } else {
        // Status: open
        if (worker && !giver) {
          msgEl.textContent = `Your offer: ₹${worker}. Waiting for job giver to respond…`;
        } else if (giver && !worker) {
          msgEl.textContent = `Job giver offered ₹${giver}. Enter your price to match.`;
        } else if (giver && worker && giver !== worker) {
          msgEl.textContent = `You: ₹${worker} • Job giver: ₹${giver} — amounts must match.`;
        } else {
          msgEl.textContent = 'Enter your price. Booking unlocks when prices match.';
        }
      }
    } catch (e) {
      console.error('Negotiation polling error', e);
    }
  }


  btnOK?.addEventListener('click', async () => {
    if (!negId) return;
    const val = priceEl.value;
    if (!val) {
      priceEl.focus();
      return;
    }
    try {
      const r = await fetch('/negotiation/offer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          negotiation_id: negId,
          role: 'worker',
          price: val
        })
      });
      const d = await r.json();

      const worker = Number(val).toFixed(2);
      const giver = d.giver_price ? Number(d.giver_price).toFixed(2) : null;

      // === update the message immediately ===
      if (d.status === 'confirmed') {
        msgEl.textContent = `✅ Price matched at ₹${giver || worker}. You can book now.`;
        setTimeout(hidePopup, 1000);
      } else if (giver) {
        msgEl.textContent = `Your offer: ₹${worker}. Job giver offered ₹${giver}. Amounts must match.`;
      } else {
        msgEl.textContent = `Your offer: ₹${worker}. Waiting for job giver to enter price…`;
      }
    } catch (e) {
      console.error('Negotiation offer error', e);
      msgEl.textContent = 'Network error. Try again.';
    }
  });


  btnCancel?.addEventListener('click', async ()=> {
    if (!negId) return hidePopup();

    const endTs = Date.now() + 300 * 1000;
    cdSetMeta({ negotiation_id: negId, cancelled_at: new Date().toISOString(), end_ts: endTs, consumed: false });
    startCooldown(300);

    try{
      await fetch('/negotiation/cancel', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ negotiation_id: negId })
      });
    } catch(e) {
      // If you want, you could roll back the cooldown here on error.
      // But usually the cancel succeeds; keeping it is fine.
    }
    hidePopup();
  });


  // Start polling inbox every 3 seconds, and once immediately.
  setInterval(checkInbox, 3000);
  checkInbox();
})();

// === Cooldown persistence (stable, job-agnostic) ============================
// We store cooldown under a canonical worker-only key, but also read & migrate
// from older keys that included job_id so reloads across pages still work.

function cdCanonicalKey() {
  return `callCooldownEnd:worker=${USER_ID}`;
}


function cdLegacyKeys() {
  const worker = USER_ID;
  const jobPart = JOB_ID ?? 'null';
  return [
    `callCooldownEnd:worker=${worker}:job=${jobPart}`,
    `callCooldownEnd:worker=${worker}:job=null`,
  ];
}

function cdGetEnd() {
  const keys = [cdCanonicalKey(), ...cdLegacyKeys()];
  let maxEnd = 0;
  for (const k of keys) {
    const v = parseInt(localStorage.getItem(k) || '0', 10);
    if (v > maxEnd) maxEnd = v;
  }
  return maxEnd;
}

function cdSetEnd(tsMs) {
  const k = cdCanonicalKey();
  const existing = parseInt(localStorage.getItem(k) || '0', 10);
  if (!existing || tsMs > existing) {
    localStorage.setItem(k, String(tsMs));
  }
  // optional cleanup
  for (const lk of cdLegacyKeys()) {
    if (lk !== k) localStorage.removeItem(lk);
  }
}

// === Meta about which cancellation seeded the current/last cooldown ==========
function cdMetaKey() {return `callCooldownMeta:worker=${USER_ID}`;}
function cdGetMeta() { try { return JSON.parse(localStorage.getItem(cdMetaKey()) || 'null'); } catch { return null; } }
function cdSetMeta(meta) { localStorage.setItem(cdMetaKey(), JSON.stringify(meta)); }
function cdClearMeta() { localStorage.removeItem(cdMetaKey()); }



function startCooldown(seconds) {
  const targetEnd = Date.now() + Math.ceil(seconds) * 1000;
  const cur = cdGetEnd();
  cdSetEnd(Math.max(targetEnd, cur));
  runCooldown();
}

function runCooldown() {
  const end = cdGetEnd();
  if (!end) return;

  const tick = () => {
    const now = Date.now();
    const remaining = Math.max(0, Math.floor((end - now) / 1000));
    if (remaining <= 0) {
      clearInterval(callCooldownTimer);
      callCooldownTimer = null;
      localStorage.removeItem(cdCanonicalKey());
      const m = cdGetMeta();
      if (m) { m.consumed = true; cdSetMeta(m); }
      setCallButton(true, '📞 Call Sahayi');
      return;
    }
    setCallButton(false, `⏳ Wait ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')} min`);
  };

  clearInterval(callCooldownTimer);
  tick();
  callCooldownTimer = setInterval(tick, 1000);
}

function startCooldownFromCancelledAt(cancelled_at, totalSeconds = 300, negotiation_id = null) {
  let endTs;

  // ✅ Fallback to NOW if server didn't send cancelled_at
  if (!cancelled_at) {
    endTs = Date.now() + Math.ceil(totalSeconds) * 1000;
  } else {
    let cancelMs = Date.parse(cancelled_at);
    if (isNaN(cancelMs)) cancelMs = Date.parse(cancelled_at + 'Z'); // tolerate missing TZ
    endTs = cancelMs + Math.ceil(totalSeconds) * 1000;
  }

  // If we already have an equal or later end, just resume UI
  const existingEnd = cdGetEnd();
  if (existingEnd && existingEnd >= endTs) {
    runCooldown();
    return;
  }

  // Record meta and set the end once
  cdSetMeta({
    negotiation_id,
    cancelled_at: cancelled_at || new Date().toISOString(),
    end_ts: endTs,
    consumed: false
  });
  cdSetEnd(endTs);

  // Resume or finish immediately
  if (endTs > Date.now()) {
    runCooldown();
  } else {
    localStorage.removeItem(cdCanonicalKey());
    setCallButton(true, '📞 Call Sahayi');
  }
}


// Simple smooth-scroll for Overview / Showcase / Reviews nav pills
document.addEventListener('DOMContentLoaded', function () {
  const navLinks = document.querySelectorAll('.profile-nav a[href^="#"]');

  navLinks.forEach(link => {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      const targetId = this.getAttribute('href');
      const targetEl = document.querySelector(targetId);
      if (!targetEl) return;

      // Smooth scroll
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

      // Update active state
      navLinks.forEach(a => a.classList.remove('active'));
      this.classList.add('active');
    });
  });
});

// --- Star rating modal behaviour ---
document.addEventListener('DOMContentLoaded', function () {
  const container = document.getElementById('starRatingControl');
  if (!container) return;

  const stars = container.querySelectorAll('.star-btn');
  const hiddenInput = document.getElementById('rating-stars-input');
  const help = document.getElementById('rating-stars-help');
  const form = document.getElementById('ratingForm');  ;

  function applyVisual(value) {
    stars.forEach(st => {
      const v = Number(st.dataset.value);
      st.classList.toggle('active', v <= value);
    });
    if (help) {
      help.textContent = value
        ? `You selected ${value} star${value > 1 ? 's' : ''}.`
        : 'Click on a star to rate (1–5).';
    }
  }

  function setRating(value) {
    hiddenInput.value = value || '';
    applyVisual(value || 0);
  }

  // click to select rating
  stars.forEach(st => {
    st.addEventListener('click', function () {
      const value = Number(this.dataset.value);
      setRating(value);
    });

    // preview on hover
    st.addEventListener('mouseenter', function () {
      const value = Number(this.dataset.value);
      applyVisual(value);
    });
  });

  // restore selection on mouse leave
  container.addEventListener('mouseleave', function () {
    const current = Number(hiddenInput.value || 0);
    applyVisual(current);
  });

  // force user to pick at least 1 star
  form?.addEventListener('submit', function (e) {
    if (!hiddenInput.value) {
      e.preventDefault();
      alert('Please select a star rating before submitting.');
    }
  });

  // when modal opens, reset stars
  const ratingModalEl = document.getElementById('ratingModal');
  if (ratingModalEl) {
    ratingModalEl.addEventListener('show.bs.modal', () => {
      setRating(0);
      if (form) form.reset();
    });
  }
});