function isSahayiFromHome(val) {
  if (!val) return false;
  return val.trim().toLowerCase() === 'sahayi from home';
}


function addSkill() {
  const container = document.getElementById('skills-section');
  const index = container.querySelectorAll('.skill-group-outer').length + 1;

  const outer = document.createElement('div');
  outer.className = 'skill-group-outer';
  outer.innerHTML = `
    <div class="skill-chip-label">Skill ${index}</div>
    <div class="row g-2 align-items-center skill-group">
      <div class="col-md-3 col-6">
        <input type="text" name="skills" class="form-control form-control-sm" placeholder="Skill name" required>
      </div>

      <div class="col-md-3 col-6">
        <select class="form-select form-select-sm wf-category-select" name="categories" required>
          <option value="" selected disabled>Category</option>
          <option>Plumbing</option>
          <option>Electrical</option>
          <option>Cleaning</option>
          <option>Carpentry</option>
          <option>Construction</option>
          <option>Cooking</option>
          <option>Fitness</option>
          <option>Sahayi From Home</option>
          <option>Other</option>
        </select>
      </div>

      <div class="col-md-2 col-6">
        <input type="number" name="rates" class="form-control form-control-sm wf-rate-input" placeholder="Rate ₹">
      </div>

      <div class="col-md-3 col-6">
        <select class="form-select form-select-sm wf-rate-type" name="rate_types">
          <option value="per hour">₹ / Hour</option>
          <option value="per job">₹ / Job</option>
          <option value="per kilogram">₹ / Kilogram</option>
          <option value="custom">₹ / Custom</option>
        </select>
      </div>

      <div class="col-md-1 col-12 text-end mt-1 mt-md-0">
        <button type="button" class="btn btn-outline-danger btn-sm" onclick="removeSkill(this)">✕</button>
      </div>

      <div class="col-12">
        <div class="wf-options" style="display:none; margin-top:8px;">
          <select class="form-select form-select-sm wf-mode-select" name="wf_mode">
            <option value="everywhere" selected>Everywhere</option>
            <option value="radius">Custom km</option>
          </select>
          <input type="number" class="form-control form-control-sm wf-radius-input mt-1" name="wf_radius"
               placeholder="km" min="0" style="display:none;">
          <input type="hidden" class="wf-scope" name="wf_scope" value="">
        </div>
      </div>
    </div>
  `;

  container.appendChild(outer);
  setupWFHForRow(outer);
  outer.scrollIntoView({ behavior: 'smooth', block: 'center' });
}


// ---------------------------
// Work-from-home behaviour
// ---------------------------
function setupWFHForRow(outerOrRow) {
  const row = outerOrRow.querySelector ? outerOrRow : outerOrRow;
  if (!row) return;

  const cat = row.querySelector('.wf-category-select');
  const rate = row.querySelector('.wf-rate-input');
  const rateType = row.querySelector('.wf-rate-type');
  const wfhOptions = row.querySelector('.wf-options');
  const wfModeSelect = row.querySelector('.wf-mode-select');
  const wfRadiusInput = row.querySelector('.wf-radius-input');
  const wfScopeHidden = row.querySelector('.wf-scope');

  function updateVisibility() {
    const val = cat ? cat.value : '';
    const isWF = isSahayiFromHome(val);
    if (isWF) {
      if (rate) { rate.style.display = 'none'; rate.removeAttribute('required'); rate.value = ''; }
      if (rateType) { rateType.style.display = 'none'; rateType.removeAttribute('required'); rateType.value = ''; }
      if (wfhOptions) { wfhOptions.style.display = 'block'; }
    } else {
      if (rate) { rate.style.display = ''; rate.setAttribute('required',''); }
      if (rateType) { rateType.style.display = ''; rateType.setAttribute('required',''); }
      if (wfhOptions) { wfhOptions.style.display = 'none'; }
      if (wfScopeHidden) wfScopeHidden.value = '';
      if (wfRadiusInput) { wfRadiusInput.style.display = 'none'; wfRadiusInput.value = ''; }
      if (wfModeSelect) wfModeSelect.value = 'everywhere';
    }
    updateWfScope();
  }

  function updateWfScope() {
    if (!wfScopeHidden) return;
    if (!wfhOptions || wfhOptions.style.display === 'none') {
      wfScopeHidden.value = '';
      return;
    }
    const mode = wfModeSelect ? wfModeSelect.value : 'everywhere';
    if (mode === 'radius') {
      const val = wfRadiusInput && wfRadiusInput.value ? String(wfRadiusInput.value) : '';
      wfScopeHidden.value = val || '';
      if (wfRadiusInput) wfRadiusInput.style.display = '';
    } else {
      wfScopeHidden.value = 'everywhere';
      if (wfRadiusInput) wfRadiusInput.style.display = 'none';
    }
  }

  if (cat) cat.addEventListener('change', updateVisibility);
  if (wfModeSelect) wfModeSelect.addEventListener('change', () => {
    if (wfModeSelect.value === 'radius') {
      if (wfRadiusInput) wfRadiusInput.style.display = '';
    } else {
      if (wfRadiusInput) { wfRadiusInput.style.display = 'none'; wfRadiusInput.value = ''; }
    }
    updateWfScope();
  });
  if (wfRadiusInput) wfRadiusInput.addEventListener('input', updateWfScope);

  // initialize
  updateVisibility();
}

// Initialize WFH behaviour for all existing skill groups on page load
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.skill-group-outer').forEach(row => setupWFHForRow(row));
});


function removeSkill(btn) {
    const group = btn.closest('.skill-group-outer');
    if (group) group.remove();
}

// Ensure wf_scope and fallback rate values are populated before building FormData
document.getElementById('editForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    // Populate defaults for any Work From Home rows
    document.querySelectorAll('.skill-group-outer').forEach(row => {
        const catEl = row.querySelector('.wf-category-select');
        const wfScopeHidden = row.querySelector('.wf-scope');
        const wfModeSelect = row.querySelector('.wf-mode-select');
        const wfRadiusInput = row.querySelector('.wf-radius-input');

        const rateEl = row.querySelector('input[name="rates"]') || row.querySelector('.wf-rate-input');
        const rateTypeEl = row.querySelector('select[name="rate_types"]') || row.querySelector('.wf-rate-type');

        if (catEl && isSahayiFromHome(catEl.value)) {
            // set wf_scope
            if (wfModeSelect && wfModeSelect.value === 'radius') {
                if (wfRadiusInput && wfRadiusInput.value) {
                    wfScopeHidden.value = String(wfRadiusInput.value);
                } else {
                    // radius mode chosen but empty radius -> leave empty so server can validate
                    wfScopeHidden.value = '';
                }
            } else {
                wfScopeHidden.value = 'everywhere';
            }

            // Provide fallback rate/rate_type so backend doesn't skip/validate-out the skill
            // Use "0" as numeric fallback and "wfh" as a special rate_type
            if (rateEl && (!rateEl.value || String(rateEl.value).trim() === '')) {
                rateEl.value = '0';
            }
            if (rateTypeEl && (!rateTypeEl.value || String(rateTypeEl.value).trim() === '')) {
                // add option if necessary
                try {
                  if (!Array.from(rateTypeEl.options).some(o=>o.value==='wfh')) {
                    const opt = document.createElement('option');
                    opt.value = 'wfh';
                    opt.text = 'WFH';
                    rateTypeEl.appendChild(opt);
                  }
                } catch(e){}
                rateTypeEl.value = 'wfh';
            }

        } else {
            // not WFH -> clear hidden fields
            if (wfScopeHidden) wfScopeHidden.value = '';
        }
    });

    const form = e.target;
    const formData = new FormData(form);

    const response = await fetch('/edit_worker_profile', {
        method: 'POST',
        body: formData,
        credentials: 'same-origin'
    });

    const result = await response.json();

    if (result.success) {
        location.replace(result.redirect);
    } else {
        alert("Profile update failed: " + (result.error || "Unknown error"));
    }
});


/* Negotiation overlay JS – unchanged from your version */
(function(){
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
    if (negId) return;
    try{
      const r = await fetch('/negotiation/pending', {credentials:'same-origin'});
      const j = await r.json();
      if (j && j.ok && j.negotiation) showPopup(j.negotiation);
    }catch(e){}
  }

  async function checkStatus() {
    if (!negId) return;
    try {
      const r = await fetch('/negotiation/status?negotiation_id=' + negId, { credentials: 'same-origin' });
      const d = await r.json();
      if (!d || !d.ok) return;

      const giver = d.giver_price ? Number(d.giver_price).toFixed(2) : null;
      const worker = d.worker_price ? Number(d.worker_price).toFixed(2) : null;

      if (d.status === 'confirmed') {
        msgEl.textContent = `✅ Price matched at ₹${giver || worker}. You can book now.`;
        setTimeout(hidePopup, 1000);
      } else if (d.status === 'cancelled') {
        msgEl.textContent = '❌ Negotiation cancelled.';
        setTimeout(hidePopup, 800);
      } else {
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
    if (!val) { priceEl.focus(); return; }
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
    try{
      await fetch('/negotiation/cancel', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ negotiation_id: negId })
      });
    }catch(e){}
    hidePopup();
  });

  setInterval(checkInbox, 3000);
  checkInbox();
})();

document.addEventListener("DOMContentLoaded", () => {

  if (!window.IS_LIMITED) return;

  const form = document.getElementById("editForm");

  if (!form) return;

  form.querySelectorAll("input, textarea, select, button").forEach(el => {
    el.disabled = true;
  });

});
