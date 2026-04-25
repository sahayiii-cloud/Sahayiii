// =======================
// Scroll to Submitted Work
// =======================

const jumpBtn = document.getElementById("jumpUpdatesBtn");

if (jumpBtn) {
  jumpBtn.addEventListener("click", () => {

    const target = document.getElementById("submittedWork");
    if (!target) return;

    target.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

    const baseUrl = location.pathname + location.search;
    history.replaceState(null, "", baseUrl + "#submittedWork");
  });
}

window.addEventListener("popstate", () => {
  if (location.hash === "#submittedWork") {
    history.replaceState(null, "", location.pathname + location.search);
  }
});


// =======================
// Payment
// =======================

async function startPayment() {

  const res = await fetch(`/razorpay/create_order/${window.BOOKING_TOKEN}`, {
    method: "POST"
  });

  const data = await res.json();

  new Razorpay({
    key: data.key_id,
    amount: data.amount,
    currency: data.currency,
    name: "WFH Job",
    order_id: data.order_id,

    handler: async function (response) {

      const verify = await fetch("/razorpay/verify_payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({
          ...response,
          token: window.BOOKING_TOKEN
        })
      });

      const result = await verify.json();

      if (result.success) {
        location.reload();
      }
    }

  }).open();
}


// =======================
// Polling
// =======================

const bookingId = window.BOOKING_ID;

let stopped = false;


async function pollBookingStatus() {

  if (stopped) return;

  try {

    const res = await fetch(`/wfh/booking/${bookingId}/status`);

    if (!res.ok) return;

    const data = await res.json();


    // Update status
    const el = document.getElementById("booking-status");
    if (el) el.innerText = data.status;


    // Stop polling on final states
    if (["WFH_DISPUTED", "WFH_CANCELLED", "WFH_COMPLETED"].includes(data.status)) {

      stopped = true;

      clearInterval(window.__poller);
      clearInterval(window.__uiRefresh);

      console.log("Polling stopped");
    }

  } catch (e) {
    console.error(e);
  }
}


window.__poller = setInterval(pollBookingStatus, 5000);
pollBookingStatus();


// =======================
// UI Refresh
// =======================

async function refreshSections() {

  if (stopped) return;

  try {

    const res = await fetch(`/wfh/giver/booking/${bookingId}`, {
      headers: { "X-UI-REFRESH": "1" }
    });

    if (!res.ok) return;

    const html = await res.text();

    const doc = new DOMParser().parseFromString(html, "text/html");


    function replaceSection(id) {

      const newEl = doc.querySelector(`#${id}`);
      const oldEl = document.querySelector(`#${id}`);

      if (newEl && oldEl) {
        oldEl.innerHTML = newEl.innerHTML;
      }
    }


    replaceSection("submittedWork");
    replaceSection("paymentActions");
    replaceSection("disputeCenter");


  } catch (err) {
    console.log("Refresh error:", err);
  }
}


window.__uiRefresh = setInterval(refreshSections, 5000);
refreshSections();


// =======================
// AJAX Forms
// =======================

document.addEventListener("submit", async function (e) {

  const form = e.target;

  if (!form.classList.contains("ajax-form")) return;

  e.preventDefault();


  // Confirm support
  if (form.dataset.confirm) {
    if (!confirm(form.dataset.confirm)) return;
  }


  const btn = form.querySelector("button[type='submit']");

  if (btn) {
    btn.disabled = true;
    btn.dataset.oldText = btn.innerText;
    btn.innerText = "Processing...";
  }


  try {

    const res = await fetch(form.action, {
      method: form.method || "POST",
      body: new FormData(form)
    });


    if (!res.ok) {
      alert("Action failed");
      return;
    }


    if (res.redirected) {
      location.href = res.url;
      return;
    }


    await refreshSections();


  } catch (err) {

    console.error(err);
    alert("Network error");

  } finally {

    if (btn) {
      btn.disabled = false;
      btn.innerText = btn.dataset.oldText || "Submit";
    }

  }

});
