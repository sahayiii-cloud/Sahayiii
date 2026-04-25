 let currentStep = 0;
  const steps = document.querySelectorAll(".step-container");
  const progress = document.getElementById("progressBar");

  function showStep(index) {
    steps.forEach((step, i) => {
      step.classList.toggle("active", i === index);
    });
    progress.style.width = ((index + 1) / steps.length) * 100 + "%";
  }

  document.querySelectorAll(".next").forEach(btn => {
    btn.addEventListener("click", () => {
      if (currentStep < steps.length - 1) {
        currentStep++;
        showStep(currentStep);
      }
    });
  });

  document.querySelectorAll(".prev").forEach(btn => {
    btn.addEventListener("click", () => {
      if (currentStep > 0) {
        currentStep--;
        showStep(currentStep);
      }
    });
  });

  function isSahayiFromHome(val) {
    if (!val) return false;
    return val.trim().toLowerCase() === 'sahayi from home';
  }

  // ---------------------------
  // Work-from-home behaviour
  // ---------------------------
  function setupWFHForRow(row) {
    if (!row) return;
    const cat = row.querySelector('.wf-category-select');
    const rate = row.querySelector('.wf-rate-input');
    const rateType = row.querySelector('.wf-rate-type');
    const wfhOptions = row.querySelector('.wf-options');
    const wfModeSelect = row.querySelector('.wf-mode-select');
    const wfRadiusInput = row.querySelector('.wf-radius-input');
    const wfScopeHidden = row.querySelector('.wf-scope');

    function updateVisibility() {
      const isWF = cat && isSahayiFromHome(cat.value);
      if (isWF) {
        // hide rate inputs
        if (rate) { rate.style.display = 'none'; rate.removeAttribute('required'); rate.value = ''; }
        if (rateType) { rateType.style.display = 'none'; rateType.removeAttribute('required'); rateType.value = ''; }
        if (wfhOptions) { wfhOptions.style.display = 'block'; }
      } else {
        // show rate inputs
        if (rate) { rate.style.display = ''; rate.setAttribute('required',''); }
        if (rateType) { rateType.style.display = ''; rateType.setAttribute('required',''); }
        if (wfhOptions) { wfhOptions.style.display = 'none'; }
        if (wfScopeHidden) wfScopeHidden.value = '';
        if (wfRadiusInput) wfRadiusInput.style.display = 'none';
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
        if (wfRadiusInput) wfRadiusInput.style.display = val === '' ? '' : ''; // ensure visible when radius mode selected
      } else {
        wfScopeHidden.value = 'everywhere';
        if (wfRadiusInput) wfRadiusInput.style.display = 'none';
      }
    }

    // listeners
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

    // initialize from current values
    updateVisibility();
  }

  // Run setup for existing rows on DOM ready
  document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.skill-row').forEach(r => setupWFHForRow(r));
  });

  // Ensure wf_scope and fallback rate values are populated before submit
  document.getElementById('createProfileForm').addEventListener('submit', function (e) {
    // For every skill row, if category is Work From Home:
    //  - ensure wf_scope[] is set (default "everywhere")
    //  - ensure rates[] has a fallback ("0")
    //  - ensure rate_types[] has a fallback ("wfh")
    document.querySelectorAll('.skill-row').forEach(row => {
      const cat = row.querySelector('.wf-category-select');
      const wfScopeHidden = row.querySelector('.wf-scope');
      const wfModeSelect = row.querySelector('.wf-mode-select');
      const wfRadiusInput = row.querySelector('.wf-radius-input');

      // form inputs (may be hidden)
      const rateEl = row.querySelector('input[name="rates[]"]') || row.querySelector('.wf-rate-input');
      const rateTypeEl = row.querySelector('select[name="rate_types[]"]') || row.querySelector('.wf-rate-type');

      if (!cat) return;

      const isWF = isSahayiFromHome(cat.value);

      if (isWF) {
        // wf_scope logic: prefer explicit radius when in radius mode
        if (wfScopeHidden) {
          if (wfModeSelect && wfModeSelect.value === 'radius') {
            if (wfRadiusInput && wfRadiusInput.value) {
              wfScopeHidden.value = String(wfRadiusInput.value).trim();
            } else {
              // radius selected but empty -> leave blank so backend can validate; still set fallback values below
              wfScopeHidden.value = '';
            }
          } else {
            wfScopeHidden.value = 'everywhere';
          }
        }

        // fallback for rates[] and rate_types[] so backend's `if n and r` doesn't skip the entry
        if (rateEl && (!rateEl.value || String(rateEl.value).trim() === '')) {
          rateEl.value = '0';
        }
        if (rateTypeEl && (!rateTypeEl.value || String(rateTypeEl.value).trim() === '')) {
          // add option 'wfh' if not present
          try {
            if (!Array.from(rateTypeEl.options).some(opt => opt.value === 'wfh')) {
              const opt = document.createElement('option');
              opt.value = 'wfh';
              opt.text = 'WFH';
              rateTypeEl.appendChild(opt);
            }
          } catch (err) {
            // ignore if rateTypeEl isn't a <select>
          }
          try { rateTypeEl.value = 'wfh'; } catch(e) {}
        }

        // additionally hide rate/ratetype in DOM in case browser validation runs
        if (rateEl) rateEl.removeAttribute('required');
        if (rateTypeEl) rateTypeEl.removeAttribute('required');

      } else {
        // Not WFH: ensure wf_scope hidden is empty to avoid confusion
        if (wfScopeHidden) wfScopeHidden.value = '';
        // ensure normal required attributes exist
        if (rateEl) rateEl.setAttribute('required','');
        if (rateTypeEl) rateTypeEl.setAttribute('required','');
      }
    });

    // allow the submission to continue (no e.preventDefault())
  });


  // ---------------------------
  // addSkill (dynamic rows)
  // ---------------------------
  function addSkill() {
    const container = document.getElementById("skills-section");
    const row = document.createElement("div");
    row.className = "skill-row d-flex gap-2 mt-2 align-items-start";
    row.innerHTML = `
      <input type="text" class="form-control" name="skills[]" placeholder="Skill" required>
      <select class="form-select wf-category-select" name="skill_categories[]" required>
        <option value="" selected disabled>Select category</option>
        <option>Plumbing</option>
        <option>Electrical</option>
        <option>Cleaning</option>
        <option>Carpentry</option>
        <option>Construction</option>
        <option>Cooking</option>
        <option>Fitness</option>
        <option>Sahayi from Home</option>
        <option>Other</option>
      </select>
      <input type="number" class="form-control wf-rate-input" name="rates[]" placeholder="Rate (₹)" required min="0">
      <select class="form-select wf-rate-type" name="rate_types[]" required>
        <option value="per hour">₹/Hour</option>
        <option value="per job">₹/Job</option>
        <option value="per kilogram">₹/Kilogram</option>
        <option value="custom">₹/Custom</option>
      </select>
      <div class="wf-options" style="display:none;">
        <select class="form-select wf-mode-select" name="wf_mode[]">
          <option value="everywhere" selected>Everywhere</option>
          <option value="radius">Custom km</option>
        </select>
        <input type="number" class="form-control wf-radius-input mt-1" name="wf_radius[]" placeholder="km" min="0" style="display:none;">
        <input type="hidden" class="wf-scope" name="wf_scope[]" value="">
      </div>
      <button type="button" class="btn btn-danger" onclick="this.parentElement.remove()">✖</button>
    `;
    container.appendChild(row);
    // initialize WFH behaviour for this dynamic row
    setupWFHForRow(row);
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // expose addSkill globally
  window.addSkill = addSkill;

  // initialize first step visibility
  showStep(currentStep);