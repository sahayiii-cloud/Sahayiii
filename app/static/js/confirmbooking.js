/* ============================
   Confirm Booking JS (Final Fixed)
   ============================ */

/* Prevent double init */
if (window.__CONFIRM_BOOKING_INIT__) {
  console.warn("Confirm booking already initialized");
} else {
  window.__CONFIRM_BOOKING_INIT__ = true;
}

/* Read backend config */
const config = window.APP_CONFIG || {};

const isCustom    = !!config.customJob;
const agreedPrice = config.agreedPrice ?? null;
const isWFH       = !!config.isWFH;


/* ============================
   Popup Helpers
   ============================ */

function showPopup(message, type = "error") {
  const popup = document.getElementById("popupCard");
  const body = document.getElementById("popupBody");
  const msg = document.getElementById("popupMessage");

  if (!popup || !body || !msg) return;

  body.className =
    "card-body text-white d-flex justify-content-between align-items-center rounded";

  if (type === "success") body.classList.add("bg-success");
  else if (type === "warning") body.classList.add("bg-warning", "text-dark");
  else if (type === "error") body.classList.add("bg-danger");
  else body.classList.add("bg-secondary");

  msg.textContent = message;

  popup.style.display = "block";

  setTimeout(() => popup.classList.add("show"), 10);
  setTimeout(hidePopup, 3000);
}

function hidePopup() {
  const popup = document.getElementById("popupCard");
  if (!popup) return;

  popup.classList.remove("show");

  setTimeout(() => {
    popup.style.display = "none";
  }, 200);
}


/* ============================
   Main Logic
   ============================ */

document.addEventListener("DOMContentLoaded", () => {

  const form = document.getElementById("bookingForm");

  const rateType = document
    .querySelector("#bookingForm #rate_type")
    ?.value
    ?.toLowerCase() || "";

  const dynamicInput = document.getElementById("dynamicInput");

  if (!form || !dynamicInput) {
    console.warn("Booking form elements missing");
    return;
  }


  /* ============================
     1️⃣ WFH → No Dynamic UI
     ============================ */

  if (isWFH) {
    dynamicInput.innerHTML = "";
    return;
  }


  /* ============================
     2️⃣ Custom Job
     ============================ */

  if (rateType === "custom" || rateType === "per custom") {

    const submitBtn = form.querySelector('button[type="submit"]');

    if (agreedPrice == null) {

      dynamicInput.innerHTML = `
        <div class="alert alert-danger mb-0">
          Agreed price is missing. Please complete negotiation.
        </div>
      `;

      if (submitBtn) submitBtn.disabled = true;
      return;
    }

    dynamicInput.innerHTML = `
      <div class="metric-section">

        <div class="metric-chip mb-1">
          <span>💰</span> Agreed price
        </div>

        <input
          type="text"
          class="form-control mt-2"
          value="₹${agreedPrice}"
          disabled
        >

        <input
          type="hidden"
          name="agreed_price"
          value="${agreedPrice}"
        >

      </div>
    `;

    return;
  }


  /* ============================
     3️⃣ Per Hour (Duration)
     ============================ */

  if (rateType === "per hour") {

    dynamicInput.innerHTML = `
      <div class="metric-section">

        <div class="duration-pill">
          <span>⏱</span> Duration
        </div>

        <div class="time-input-group">

          <div class="modern-input">
            <label>Hours</label>
            <input
              type="number"
              id="hours-input"
              name="hours"
              min="0"
              max="24"
              value="0"
              class="form-control step-input"
              required
            >
          </div>

          <div class="modern-input">
            <label>Minutes</label>
            <input
              type="number"
              id="minutes-input"
              name="minutes"
              min="0"
              max="59"
              value="0"
              class="form-control step-input"
              required
            >
          </div>

        </div>

        <div id="duration-total" class="duration-total">
          Total: <span>0h 0m</span>
        </div>

      </div>
    `;

    const h = document.getElementById("hours-input");
    const m = document.getElementById("minutes-input");
    const t = document.querySelector("#duration-total span");

    function update() {
      const hh = Math.max(0, Math.min(24, parseInt(h.value || 0)));
      const mm = Math.max(0, Math.min(59, parseInt(m.value || 0)));

      h.value = hh;
      m.value = mm;

      t.textContent = `${hh}h ${mm}m`;
    }

    h.addEventListener("input", update);
    m.addEventListener("input", update);

    update();
    return;
  }


  /* ============================
     4️⃣ Quantity Based
     ============================ */

  if (
    rateType === "per job" ||
    rateType === "per kilogram" ||
    rateType === "per unit"
  ) {

    dynamicInput.innerHTML = `
      <div class="metric-section">

        <div class="metric-chip">
          <span>📊</span> Quantity
        </div>

        <input
          type="number"
          name="quantity"
          min="1"
          step="1"
          class="form-control mt-2"
          required
          placeholder="Enter quantity"
        >

      </div>
    `;

    return;
  }


  /* ============================
     5️⃣ Fallback
     ============================ */

  console.warn("Unknown rate type:", rateType);

  dynamicInput.innerHTML = `
    <div class="alert alert-warning mb-0">
      Unable to determine pricing type. Please refresh.
    </div>
  `;
});


/* ============================
   Submit Handler
   ============================ */

document.addEventListener("submit", async (e) => {

  const form = e.target;

  if (!form || form.id !== "bookingForm") return;

  e.preventDefault();

  const btn = form.querySelector('button[type="submit"]');

  if (btn) {
    btn.disabled = true;
    btn.textContent = "Booking…";
  }

  try {

    const res = await fetch(window.location.href, {
      method: "POST",
      body: new FormData(form)
    });

    if (!res.headers.get("content-type")?.includes("json")) {
      window.location.href = res.url;
      return;
    }

    const data = await res.json();

    if (data.redirect) {
      window.location.href = data.redirect;
    }

  } catch (err) {

    console.error(err);
    showPopup("Booking failed. Try again.");

  } finally {

    if (btn) {
      btn.disabled = false;
      btn.textContent = "✅ Confirm & Book";
    }
  }
});


/* ============================
   Debug
   ============================ */

console.log("Confirm Booking Config:", {
  isCustom,
  agreedPrice,
  isWFH
});
