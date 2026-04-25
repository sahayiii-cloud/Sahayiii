const APP = window.APP_CTX || {};

const bookingId = APP.bookingId;

if (!bookingId) {
  console.error("Missing bookingId in APP_CTX");
}

let stopped = false;

async function pollBookingStatus() {
  if (stopped) return;

  try {
    const res = await fetch(`/wfh/booking/${bookingId}/status`);
    if (!res.ok) return;

    const data = await res.json();

    const el = document.getElementById("booking-status");
    if (el) el.innerText = data.status;

    // ✅ Stop polling when completed/cancelled - DO NOT reload again
    if (["WFH_CANCELLED", "WFH_COMPLETED", "WFH_DISPUTED"].includes(data.status)) {
      stopped = true;
      clearInterval(window.__poller);
      clearInterval(window.__uiRefresher)

      // Optional: show a nice message
      if (data.status === "WFH_COMPLETED") {
        console.log("Job completed. Polling stopped.");
      }
    }

  } catch (e) {
    console.error(e);
  }
}

window.__poller = setInterval(pollBookingStatus, 3000);
pollBookingStatus();

async function refreshUISections() {
  if (stopped) return;

  try {
    // ✅ fetch the FULL booking page HTML
    const res = await fetch(`/wfh/booking/${bookingId}?partial=1`, {
      headers: { "X-UI-REFRESH": "1" }
    });

    if (!res.ok) return;

    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");

    // ✅ Refresh Submitted Work timeline
    const newWork = doc.querySelector("#submittedWork");
    const oldWork = document.querySelector("#submittedWork");

    if (newWork && oldWork) {
      oldWork.innerHTML = newWork.innerHTML;
    }

    // ✅ Refresh Dispute Center
    const newDispute = doc.querySelector("#disputeCenter");
    const oldDispute = document.querySelector("#disputeCenter");

    if (newDispute && oldDispute) {
      oldDispute.innerHTML = newDispute.innerHTML;
    }

  } catch (err) {
    console.log("UI Refresh Error:", err);
  }
}

// ✅ Update UI every 3 seconds
window.__uiRefresher = setInterval(refreshUISections, 3000);
refreshUISections();

  // ✅ If any hash navigation happens, don't create extra history entries
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener("click", (e) => {
      const id = link.getAttribute("href").slice(1);
      const target = document.getElementById(id);
      if (!target) return;

      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });

      history.replaceState(null, "", location.pathname + location.search + "#" + id);
    });
  });

  // ✅ When user presses back, remove hash once (avoid multiple back presses)
  window.addEventListener("popstate", () => {
    if (location.hash) {
      history.replaceState(null, "", location.pathname + location.search);
    }
  });

document.addEventListener("submit", async function (e) {
  const form = e.target;
  if (!form.classList.contains("ajax-form")) return;

  e.preventDefault();

  const confirmMsg = form.dataset.confirm;
  if (confirmMsg) {
    const ok = confirm(confirmMsg);
    if (!ok) return;
  }

  const url = form.action;
  const method = (form.method || "POST").toUpperCase();

  const btn = form.querySelector("button[type='submit']");
  if (btn) {
    btn.disabled = true;
    btn.dataset.oldText = btn.innerText;
    btn.innerText = "Processing...";
  }

  try {
    const formData = new FormData(form);

    const res = await fetch(url, {
      method: method,
      headers: { "X-Requested-With": "XMLHttpRequest" },
      body: formData
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Request failed:", errText);
      alert("Action failed. Please try again.");
      return;
    }

    // ✅ If backend sends redirect, follow it
    if (res.redirected) {
      window.location.href = res.url;
      return;
    }

    // ✅ Refresh UI blocks
    if (typeof refreshUISections === "function") {
      await refreshUISections();
    }

  } catch (err) {
    console.error(err);
    alert("Network error. Try again.");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerText = btn.dataset.oldText || "Submit";
    }
  }
});