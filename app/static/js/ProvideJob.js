// Current user role from server-side template
const CURRENT_USER_ROLE = "{{ 'worker' if current_user.is_worker else 'giver' }}";

window.addEventListener('DOMContentLoaded', () => {
    const mapBtn = document.getElementById('map-btn');

    if (mapBtn) {  // ✅ Check if element exists
        if (CURRENT_USER_ROLE === 'worker') {
            mapBtn.style.display = 'inline-block';
        } else {
            mapBtn.style.display = 'none';
        }
    }
});


let locationRetryInterval = null;

async function fetchLocationAndUpdate() {
  if (!navigator.geolocation) {
    document.getElementById("location-display").textContent = "❌ Not supported";
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async pos => {
      // ✅ Clear any retry interval if location works
      if (locationRetryInterval) {
        clearInterval(locationRetryInterval);
        locationRetryInterval = null;
      }
      document.getElementById("location-error").style.display = "none";

      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;

      const res = await fetch('/get_location_details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude: lat, longitude: lon })
      });

      if (res.ok) {
        const loc = await res.json();
        document.getElementById("location-display").textContent = `${loc.state}, ${loc.zipcode}`;

        await fetch('/update_location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ latitude: lat, longitude: lon, state: loc.state, zipcode: loc.zipcode })
        });
      }
    },
    error => {
      console.warn("Location error:", error);

      // ❌ Show warning and retry option
      document.getElementById("location-error").style.display = "block";

      if (!locationRetryInterval) {
        // 🔁 Auto retry every 10s until available
        locationRetryInterval = setInterval(fetchLocationAndUpdate, 10000);
      }
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

// Manual retry button
function retryLocation() {
  fetchLocationAndUpdate();
}


// Toggle save location form
document.getElementById("show-save-location").addEventListener("click", () => {
  const form = document.getElementById("save-location-form");
  form.style.display = form.style.display === "none" ? "block" : "none";
});

// Save location
document.getElementById("save-location-btn").addEventListener("click", async () => {
  const placeInput = document.getElementById("place-name-input");
  let placeName = placeInput.value.trim();

  if (!placeName) {
    document.getElementById("save-location-msg").style.color = "red";
    document.getElementById("save-location-msg").textContent = "⚠ Please enter a place name";
    return;
  }

  if (!navigator.geolocation) return alert("Geolocation not supported");

  navigator.geolocation.getCurrentPosition(async pos => {
    const lat = pos.coords.latitude, lon = pos.coords.longitude;

    // Get state + zipcode
    const res = await fetch('/get_location_details', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ latitude: lat, longitude: lon })
    });
    const loc = await res.json();

    // Final formatted name
    const finalName = `${placeName} (${loc.zipcode})`;

    // Save to DB
    await fetch('/save_location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latitude: lat,
        longitude: lon,
        state: loc.state,
        zipcode: loc.zipcode,
        name: finalName
      })
    });

    // ✅ Success handling
    document.getElementById("save-location-msg").style.color = "green";
    document.getElementById("save-location-msg").textContent = `✅ Saved as ${finalName}`;
    placeInput.value = ""; // clear input

    // Hide the form again after 1 second
    setTimeout(() => {
      document.getElementById("save-location-form").style.display = "none";
      document.getElementById("save-location-msg").textContent = ""; // clear success text
    }, 1000);
  });
});



document.getElementById("change-location-btn").addEventListener("click", async () => {
  try {
    const res = await fetch('/get_saved_locations');
    if (!res.ok) throw new Error("Failed to fetch saved locations");
    const data = await res.json();
    const list = document.getElementById("saved-locations-list");
    list.innerHTML = "";

    if (!data || data.length === 0) {
      list.innerHTML = "<p class='text-muted'>No saved locations yet. Save one first!</p>";
    } else {
      data.forEach(loc => {
        const div = document.createElement("div");
        div.className = "location-option";
        div.textContent = `${loc.name} (${loc.state || "Unknown"}, ${loc.zipcode || "Unknown"})`;

        div.onclick = async () => {
          try {
            const updateRes = await fetch('/set_current_location', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(loc)
            });

            const result = await updateRes.json();
            if (updateRes.ok && result.success) {
              // Display the full saved name
              document.getElementById("location-display").textContent = loc.name;
              document.getElementById("change-location-box").style.display = "none";
            } else {
              console.error("Failed to set current location:", result);
              alert("Failed to update location. Try again.");
            }
          } catch (err) {
            console.error("Error updating location:", err);
            alert("Error updating location. See console for details.");
          }
        };


        list.appendChild(div);
      });
    }

    // Show the custom popup
    document.getElementById("change-location-box").style.display = "block";

  } catch (err) {
    console.error("Error fetching saved locations:", err);
    alert("Failed to load saved locations. See console for details.");
  }
});

// Close button
document.getElementById("close-change-location").addEventListener("click", () => {
  document.getElementById("change-location-box").style.display = "none";
});

// Use live location
document.getElementById("use-live-location").addEventListener("click", async () => {
  await fetchLocationAndUpdate(); // existing function
  document.getElementById("change-location-box").style.display = "none";
});




const chatBox = document.getElementById("chat-box");
const chatInput = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-chat-btn");

function appendMessage(sender, text) {
    const msgDiv = document.createElement("div");
    msgDiv.innerHTML = `<strong>${sender}:</strong> ${text}`;
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}



async function checkPendingPayment() {
  const res = await fetch('/check_pending_payment');
  const data = await res.json();
  if (data.redirect_url) setTimeout(() => window.location.href = data.redirect_url, 1000);
}

async function checkBookingStatusAndShowChat() {
  const res = await fetch('/get_booking_details', { method: 'POST' });
  const data = await res.json();

  if (!data || !data.booking_id) return;

      // If server already knows arrival / OTP verified, mark arrival locally (hide warn button)
  if (data.arrival_confirmed || data.otp_verified) {
    try {
      markArrivalConfirmed();
    } catch (e) {
      console.warn("markArrivalConfirmed() error:", e);
    }
    // defensive: hide warn button and clear timer for giver as well
    const warnBtn = document.getElementById("warn-sahayi-btn");
    if (warnBtn) warnBtn.style.display = "none";
    if (warnTimerHandle) {
      clearTimeout(warnTimerHandle);
      warnTimerHandle = null;
    }
  }


   if (data.completed) {
    const chatPanel = document.getElementById("chat-direction-panel");

    chatPanel.style.display = "block";

    chatPanel.innerHTML = `
      <h5>✅ Work Completed</h5>
      <p><strong>Partner:</strong> ${data.giver_name}</p>
      <p>✅ Your work has been marked as complete.</p>
      <a href="${data.chat_url}" target="_blank" class="btn btn-primary mt-2">💬 View Chat</a>
      <a href="${data.map_url}" target="_blank" class="btn btn-success mt-2">📍 Get Directions</a>
      <button class="btn btn-secondary mt-3" onclick="document.getElementById('chat-direction-panel').style.display='none'">Close</button>
    `;
    window._warnTimerStartedFor = null;
    return;
  }



  const chatPanel = document.getElementById("chat-direction-panel");
  const otpDisplay = document.getElementById("otp-display");
  const generatedOtp = document.getElementById("generated-otp");
  const otpInputSection = document.getElementById("otp-input-section");
  const chatInput = document.getElementById("chat-input");
  const chatTimer = document.getElementById("chat-timer");

  chatPanel.style.display = "block";

    // ✅ Start drive timer only for JOB GIVER side
    if (CURRENT_USER_ROLE === "giver" && data.booking_id) {
      if (window._warnTimerStartedFor !== data.booking_id) {
        arrivalConfirmed = false;
        if (warnTimerHandle) clearTimeout(warnTimerHandle);
        warnTimerHandle = null;
        startDriveTimer(data.drive_seconds || 0, data.booking_id);
        window._warnTimerStartedFor = data.booking_id;
      }
    }






  if (data.show) {
    // 🆕 Final OTP logic
    const finalOTPDisplay = document.getElementById("final-otp-display");
    const finalOTPInput = document.getElementById("final-otp-input-section");

    if (data.final_otp_code) {
      finalOTPDisplay.style.display = "block";
      document.getElementById("final-otp-code").textContent = data.final_otp_code;
    } else {
      finalOTPDisplay.style.display = "none";
    }

    if (data.show_final_otp_input) {
      finalOTPInput.style.display = "block";
    } else {
      finalOTPInput.style.display = "none";
    }

  // Extra OTP display for giver
    const extraOtpDisplay = document.getElementById("extra-otp-display");
    const extraOtpCodeEl = document.getElementById("extra-otp-code");
    const extraOtpInputSection = document.getElementById("extra-otp-input-section");

    if (data.extra_otp_code) {
      extraOtpDisplay.style.display = "block";
      extraOtpCodeEl.textContent = data.extra_otp_code;
    } else {
      extraOtpDisplay.style.display = "none";
    }

    if (data.show_extra_otp_input) {
      extraOtpInputSection.style.display = "block";
    } else {
      extraOtpInputSection.style.display = "none";
    }


    document.getElementById("partner-name").textContent = data.giver_name;
    document.getElementById("chat-link").href = data.chat_url;
    // Show "Request Extra Time" button if allowed
    if (data.show_extra_timer_button) {
      document.getElementById("request-extra-btn").style.display = "inline-block";
    } else {
      document.getElementById("request-extra-btn").style.display = "none";
    }

    // Handle pending extra timer state
    if (data.extra_timer_pending) {
      chatInput.disabled = true;
      chatTimer.textContent = data.message || "⏳ Extra timer will start shortly.";
    }

    // Handle extra timer running
    if (data.extra_timer_running) {
  clearInterval(window.chatCountdown);  // ⛔ Stop normal timer
  chatInput.disabled = false;
  document.getElementById("send-chat-btn").disabled = false;

  let extraTimeElapsed = Math.floor(data.extra_duration_seconds || 0);

    clearInterval(window.extraChatCountdown);
    window.extraChatCountdown = setInterval(() => {
      const mins = Math.floor(extraTimeElapsed / 60);
      const secs = extraTimeElapsed % 60;

      chatTimer.textContent = `⏱ Extra Chat Time: ${mins}m ${secs}s`;

      extraTimeElapsed++;

    }, 1000);



  if (CURRENT_USER_ROLE === "worker") {
    document.getElementById("map-btn").style.display = "inline-block";
  } else {
    document.getElementById("map-btn").style.display = "none";
  }


  if (!data.stop_confirmed) {
    document.getElementById("stop-extra-btn").style.display = "inline-block";
  } else {
    document.getElementById("stop-extra-btn").style.display = "none";
  }
}

// If stop was clicked but not yet confirmed
if (data.extra_timer_stopped && data.show_confirm_stop_button) {
  document.getElementById("confirm-stop-btn").style.display = "inline-block";
  document.getElementById("stop-extra-btn").style.display = "none"; // hide stop
} else {
  document.getElementById("confirm-stop-btn").style.display = "none";
}




    document.getElementById("partner-name").textContent = data.giver_name;
    document.getElementById("chat-link").href = data.chat_url;
    localStorage.setItem("mapUrl", data.map_url);

    otpDisplay.style.display = data.otp_code ? "block" : "none";
    document.getElementById("generated-otp").textContent = data.otp_code || "";

    if (data.show_reached_slider) {
        document.getElementById("reached-location-section").style.display = "block";
        document.getElementById("otp-input-section").style.display = "none";
    } else if (data.show_otp_input) {
        document.getElementById("reached-location-section").style.display = "none";
        document.getElementById("otp-input-section").style.display = "block";
    }


    if (!data.otp_verified) {
      chatInput.disabled = false;
      chatTimer.textContent = "🔒 Please verify OTP ";
    } else if (data.chat_active && data.time_left > 0) {
      let timeLeft = Math.floor(data.time_left);
      chatInput.disabled = false;
      document.getElementById("send-chat-btn").disabled = false;


      // Show chat & map buttons
      if (CURRENT_USER_ROLE === "worker") {
        document.getElementById("map-btn").style.display = "inline-block";
      } else {
        document.getElementById("map-btn").style.display = "none";
      }


      clearInterval(window.chatCountdown);
      window.chatCountdown = setInterval(() => {
        if (timeLeft <= 0) {
          clearInterval(window.chatCountdown);

          if (data.extra_timer_pending) {
            // Let the server handle it — do NOT mark expired
            chatTimer.textContent = data.message || "⏳ Waiting for Extra OTP verification.";
            return;
          }

          // ❌ Only run this if extra timer not requested
          chatInput.disabled = true;
          chatTimer.textContent = "⛔ Chat time expired.";
          document.getElementById("chat-link").style.display = "none";
          document.getElementById("map-btn").style.display = "none";
          fetch("/end_booking", { method: "POST" });
          return;
        }

        const mins = Math.floor(timeLeft / 60);
        const secs = timeLeft % 60;
        chatTimer.textContent = `🕒 Chat will expire in ${mins}m ${secs}s`;
        timeLeft--;
      }, 1000);
    } else if (data.rate_type !== 'per hour' && data.chat_active) {
      // ✅ For per job/kilo/km type (manual tracking)
      chatInput.disabled = false;
      document.getElementById("send-chat-btn").disabled = false;


      if (CURRENT_USER_ROLE === "worker") {
        document.getElementById("map-btn").style.display = "inline-block";
      } else {
        document.getElementById("map-btn").style.display = "none";
      }


      document.getElementById("quantity-count").textContent = `${data.completed_quantity} / ${data.quantity}`;
      chatTimer.textContent = `✅ Chat open until work is marked complete.`;

      // Only show update input to the worker
      if (data.debug && data.debug.is_worker) {
        document.getElementById("completed-input").style.display = "block";
        document.getElementById("submit-completed").style.display = "inline-block";
      } else {
        document.getElementById("completed-input").style.display = "none";
        document.getElementById("submit-completed").style.display = "none";
      }

      document.getElementById("quantity-tracker").style.display = "block";

    } else {
      chatInput.disabled = true;
      chatTimer.textContent = "⛔ Chat time expired.";
      document.getElementById("chat-link").style.display = "none";
      document.getElementById("map-btn").style.display = "none";
    }


  } else {
    chatPanel.style.display = "none";
  }
}

document.getElementById("map-btn").addEventListener("click", () => {
  const mapUrl = localStorage.getItem("mapUrl");
  if (mapUrl) window.open(mapUrl, "_blank");
});

document.getElementById("submit-otp").addEventListener("click", async () => {
  const otp = document.getElementById("otp-input").value;
  const res = await fetch("/verify_otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ otp })
  });
  const result = await res.json();
  if (result.success) {
      document.getElementById("otp-input-section").style.display = "none";
      document.getElementById("otp-status").textContent = "✅ OTP Verified!";
      document.getElementById("otp-status").style.color = "green";

      // ✅ Directly enable chat input & send button
      document.getElementById("chat-input").disabled = false;
      document.getElementById("send-chat-btn").disabled = false;


      markArrivalConfirmed();

      checkBookingStatusAndShowChat(); // refresh panel
  } else {
    document.getElementById("otp-status").textContent = result.message || "Invalid OTP.";
    document.getElementById("otp-status").style.color = "red";
  }
});
document.getElementById("submit-completed").addEventListener("click", async () => {
  const completed = parseInt(document.getElementById("completed-input").value);
  const res = await fetch("/update_completed_quantity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completed_quantity: completed })
  });

  const result = await res.json();
  const statusEl = document.getElementById("completed-status");

  if (result.success) {
    statusEl.textContent = "✅ Updated!";
    statusEl.style.color = "green";

    // ✅ 🛑 Don't immediately re-fetch the chat here.
    // ✅ 🆕 Show a delay, or user confirmation before refresh
    if (completed >= parseInt(document.getElementById("quantity-count").textContent.split('/')[1])) {
      statusEl.textContent = "✅ Work marked complete! Waiting for confirmation...";
      setTimeout(() => {
        checkBookingStatusAndShowChat(); // Then update after short delay
      }, 3000);
    } else {
      checkBookingStatusAndShowChat(); // still update if not yet done
    }
  } else {
    statusEl.textContent = result.message || "❌ Update failed.";
    statusEl.style.color = "red";
  }
});

document.getElementById("submit-final-otp").addEventListener("click", async () => {
  const finalOtp = document.getElementById("final-otp-input").value;
  const res = await fetch("/verify_final_otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ otp: finalOtp })
  });

  const result = await res.json();
  const statusEl = document.getElementById("final-otp-status");

  if (result.success) {
    statusEl.textContent = "✅ Job marked complete!";
    statusEl.style.color = "green";
    document.getElementById("final-otp-input-section").style.display = "none";
    setTimeout(() => {
      window.location.reload();
    }, 2000);
  } else {
    statusEl.textContent = result.message || "❌ Invalid OTP.";
    statusEl.style.color = "red";
  }
});

document.getElementById("request-extra-btn").addEventListener("click", async () => {
  const confirmed = confirm("Request extra time?");
  if (!confirmed) return;
  const res = await fetch("/request_extra_time", { method: "POST" });
  const data = await res.json();
  if (data.success) {
    alert("OTP sent to job giver. Ask them to enter it.");
  } else {
    alert(data.message || "Failed to request extra time.");
  }
});

document.getElementById("stop-extra-btn").addEventListener("click", async () => {
  const confirmed = confirm("Stop the extra timer?");
  if (!confirmed) return;
  const res = await fetch("/stop_extra_timer", { method: "POST" });
  const data = await res.json();
  if (data.success) {
    alert("Waiting for job giver to confirm stop.");
  } else {
    alert(data.message || "Stop request failed.");
  }
});

document.getElementById("submit-extra-otp").addEventListener("click", async () => {
  const otp = document.getElementById("extra-otp-input").value;
  const res = await fetch("/verify_extra_timer_otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ otp })
  });

  const result = await res.json();
  const statusEl = document.getElementById("extra-otp-status");

  if (result.success) {
    statusEl.textContent = "✅ Extra OTP Verified!";
    statusEl.style.color = "green";

    // Start the extra timer
    await fetch("/start_extra_timer", { method: "POST" });

    // Refresh chat panel
    checkBookingStatusAndShowChat();
  } else {
    statusEl.textContent = result.message || "❌ Invalid OTP.";
    statusEl.style.color = "red";
  }
});


document.getElementById("confirm-stop-btn").addEventListener("click", async () => {
  const confirmed = confirm("Confirm stop of extra chat?");
  if (!confirmed) return;

  const res = await fetch("/confirm_stop_extra_timer", { method: "POST" });
  const data = await res.json();

  if (data.success) {
    alert("Extra timer ended. Payment page will open.");
    if (data.redirect_url) {
      window.location.href = data.redirect_url;
    } else {
      checkBookingStatusAndShowChat(); // fallback refresh
    }
  } else {
    alert("❌ Failed to confirm stop.");
  }
});

function getDistanceFromLatLon(lat1, lon1, lat2, lon2) {
  function deg2rad(deg) { return deg * (Math.PI / 180); }
  const R = 6371; // Earth radius in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 1000; // return distance in meters
}


let currentBookingId = null; // global booking id

window.addEventListener("DOMContentLoaded", () => {
    const sendBtn = document.getElementById("send-chat-btn");
    const chatInput = document.getElementById("chat-input");
    const chatBox = document.getElementById("chat-box");

    // Restore booking ID and messages from localStorage instantly
    const savedBookingId = localStorage.getItem("currentBookingId");
    if (savedBookingId) {
        currentBookingId = parseInt(savedBookingId);
        console.log("Restored booking ID:", currentBookingId);

        // restore warn timer/button state for this booking
        restoreWarnTimerForBooking(currentBookingId);

        // Load messages from localStorage instantly
        const savedMessages = JSON.parse(localStorage.getItem(`chatMessages_${currentBookingId}`) || "[]");
        savedMessages.forEach(m => appendMessage(m.sender, m.text));

        sendBtn.disabled = false;
        chatInput.disabled = false;

        // Fetch updated messages from backend
        loadMessages();
    }


    // Fetch booking details from backend (payment-guarded)
    function loadBookingDetails() {
      fetch("/get_booking_details", { method: "POST" })
        .then(res => res.json())
        .then(data => {
          // DOM elements (always resolve here)
          const chatPanel = document.getElementById("chat-direction-panel");
          const chatBox = document.getElementById("chat-box");
          const sendBtn = document.getElementById("send-chat-btn");
          const chatInput = document.getElementById("chat-input");

          // Payment guard
          if (data.payment_required && !data.payment_completed) {
            if (chatPanel) chatPanel.style.display = "none";
            if (chatBox) chatBox.innerHTML = "<p>Payment pending.</p>";
            if (sendBtn) sendBtn.disabled = true;
            if (chatInput) { chatInput.disabled = true; chatInput.value = ""; }

            if (currentBookingId) {
              localStorage.removeItem(`chatMessages_${currentBookingId}`);
              localStorage.removeItem("currentBookingId");
              currentBookingId = null;
            }
            window._warnTimerStartedFor = null;
            return;
          }

          // Normal flow
          showOrHideChatPanel(data);
          console.log("Booking details received:", data);

          if (data.show && data.booking_id) {
            if (currentBookingId !== data.booking_id) {
              if (currentBookingId) localStorage.removeItem(`chatMessages_${currentBookingId}`);
              window._warnTimerStartedFor = null;
              currentBookingId = data.booking_id;
              localStorage.setItem("currentBookingId", currentBookingId);

              // restore warn timer / shown state for the newly active booking
              restoreWarnTimerForBooking(currentBookingId);
              if (chatBox) chatBox.innerHTML = "";
              loadMessages();
            }
            if (sendBtn) sendBtn.disabled = false;
            if (chatInput) chatInput.disabled = false;
          } else {
            if (currentBookingId) localStorage.removeItem(`chatMessages_${currentBookingId}`);
            localStorage.removeItem("currentBookingId");
            currentBookingId = null;
            if (sendBtn) sendBtn.disabled = true;
            if (chatInput) chatInput.disabled = true;
            if (chatBox) chatBox.innerHTML = "<p>No active booking or payment not completed.</p>";
            window._warnTimerStartedFor = null;
          }
        })
        .catch(err => console.error("Error fetching booking details:", err));
    }




    // Load messages from server & store locally
    function loadMessages() {
        if (!currentBookingId) return;

        fetch(`/get_messages/${currentBookingId}`)
            .then(res => res.json())
            .then(messages => {
                // Convert backend data
                const backendMessages = messages.map(msg => ({
                    sender: msg.sender_id === CURRENT_USER_ID ? "Me" : "Partner",
                    text: msg.text
                }));

                // Merge with stored local messages
                let stored = JSON.parse(localStorage.getItem(`chatMessages_${currentBookingId}`) || "[]");
                const merged = mergeMessages(stored, backendMessages);

                // Save merged messages back to localStorage
                localStorage.setItem(`chatMessages_${currentBookingId}`, JSON.stringify(merged));

                // Render merged chat
                renderMessages(merged);
            })
            .catch(err => console.error("Error loading messages:", err));
    }

    // Merge arrays without duplicates
    function mergeMessages(localMsgs, backendMsgs) {
        const seen = new Set(localMsgs.map(m => m.sender + m.text));
        backendMsgs.forEach(m => {
            const key = m.sender + m.text;
            if (!seen.has(key)) {
                localMsgs.push(m);
                seen.add(key);
            }
        });
        return localMsgs;
    }

    // Render all messages
    function renderMessages(messages) {
        chatBox.innerHTML = "";
        messages.forEach(m => appendMessage(m.sender, m.text));
    }

    // Append a single message
    function appendMessage(sender, text) {
    const msgElem = document.createElement("div");
    msgElem.classList.add("chat-message");

    if (sender === "Me") {
        msgElem.classList.add("me");
    } else {
        msgElem.classList.add("partner");
    }

    msgElem.innerHTML = `<span class="sender">${sender}:</span> ${text}`;
    chatBox.appendChild(msgElem);
    chatBox.scrollTop = chatBox.scrollHeight;
}


    // Send a message
    function sendMessage() {
        const text = chatInput.value.trim();
        if (!text) return;
        if (!currentBookingId) {
            alert("Booking ID is not set yet.");
            return;
        }

        // Show immediately
        appendMessage("Me", text);

        // Save to localStorage immediately
        let stored = JSON.parse(localStorage.getItem(`chatMessages_${currentBookingId}`) || "[]");
        stored.push({ sender: "Me", text: text });
        localStorage.setItem(`chatMessages_${currentBookingId}`, JSON.stringify(stored));

        // Clear input
        chatInput.value = "";

        // Send to backend
        fetch("/send_message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            message: text,
            booking_id: currentBookingId,
            sender_id: CURRENT_USER_ID  // ✅ Ensure backend knows who sent it
        })
    })

        .then(res => res.json())
        .then(() => {
            // Wait a moment for DB commit, then reload messages
            setTimeout(() => loadMessages(), 800);
        })
        .catch(err => console.error("Error sending message:", err));
    }

    // Event listeners
    sendBtn.addEventListener("click", sendMessage);
    fetchLocationAndUpdate();
    chatInput.addEventListener("keydown", e => {
        if (e.key === "Enter") {
            e.preventDefault();
            sendMessage();
        }
    });

    // Poll messages every 2 seconds
    setInterval(() => {
        if (currentBookingId) loadMessages();
    }, 2000);

    // Initial booking load
    // Initial booking load
    loadBookingDetails();
    checkBookingStatusAndShowChat();   // ✅ Always run once on page load

    // Other periodic checks
    setInterval(checkPendingPayment, 20000);

    // ✅ Always check booking/chat status every 5s (not only if panel is visible)
    setInterval(checkBookingStatusAndShowChat, 5000);

});

const workerToggle = document.getElementById("worker-status-toggle");
const workerStatusLabel = document.getElementById("worker-status-label");
if (workerToggle && workerStatusLabel) {
  workerToggle.addEventListener("change", async () => {
    const isOnline = workerToggle.checked;
    const res = await fetch("/update_worker_status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ online: isOnline })
    });
    if (res.ok) {
      workerStatusLabel.innerHTML = isOnline
        ? "<span style='color:green;'>🟢 Online</span>"
        : "<span style='color:red;'>🔴 Offline</span>";
    }
  });
}

function showOrHideChatPanel(data) {
  const chatPanel = document.getElementById("chat-direction-panel");
  if (!chatPanel) return;



  // Only show when server explicitly allows and payment completed
  if (data.show && data.booking_id && data.payment_completed) {
    chatPanel.style.display = "block";
    checkBookingStatusAndShowChat();
  } else {
    chatPanel.style.display = "none";
  }
}




    document.getElementById("call-btn").addEventListener("click", async () => {
  if (!currentBookingId) {
    alert("No active booking to call.");
    return;
  }

  try {
    const res = await fetch(`/initiate_call/${currentBookingId}`, { method: "POST" });
    const data = await res.json();
    if (data.status === "success") {
      alert("📞 Call initiated! Please wait for your phone to ring.");
    } else {
      alert("❌ " + (data.message || "Failed to initiate call."));
    }
  } catch (err) {
    alert("⚠️ Error while initiating call.");
    console.error(err);
  }
});

const slider = document.getElementById("reached-slider");
slider.addEventListener("change", async () => {
  if (slider.value == 100) {  // only when fully slid
    if (!navigator.geolocation) {
      alert("❌ Geolocation not supported");
      return;
    }

    navigator.geolocation.getCurrentPosition(async pos => {
      const lat = pos.coords.latitude, lon = pos.coords.longitude;

      const res = await fetch(`/verify_worker_location/${currentBookingId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: lat, longitude: lon })
      });

      const data = await res.json();
      const msgEl = document.getElementById("reached-msg");

      if (data.allow_otp) {
        msgEl.style.color = "green";
        msgEl.textContent = "✅ You are at the job location!";
        setTimeout(() => { msgEl.textContent = ""; }, 2000);

        // Show OTP input box
        document.getElementById("otp-input-section").style.display = "block";
        document.getElementById("reached-location-section").style.display = "none";

        markArrivalConfirmed(); // ✅ cancel warn timer when worker confirms arrival

          try {
            await fetch(`/worker_arrived/${currentBookingId}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ arrived: true })
            });
            // no need to await response body; server should persist and subsequent /get_booking_details will include arrival_confirmed
          } catch (err) {
            console.warn("Failed to notify server about arrival:", err);
          }

      } else {
        msgEl.style.color = "red";
        msgEl.textContent = data.message;
        setTimeout(() => { msgEl.textContent = ""; }, 3000);
        slider.value = 0; // reset slider
      }
    });
  }
});


// Toggle profile dropdown
document.getElementById("profile-btn").addEventListener("click", () => {
  const box = document.getElementById("profile-box");
  box.style.display = (box.style.display === "none" || box.style.display === "") ? "block" : "none";
});

// Close if clicked outside
document.addEventListener("click", (e) => {
  if (!e.target.closest("#profile-btn") && !e.target.closest("#profile-box")) {
    document.getElementById("profile-box").style.display = "none";
  }
});


function toggleBookingUI(isBookingLive) {
  const heroActions = document.getElementById("hero-actions");
  const chatPanel = document.getElementById("chat-direction-panel");

  if (isBookingLive) {
    heroActions.style.display = "none";
    chatPanel.style.display = "block";
  } else {
    heroActions.style.display = "block";
    chatPanel.style.display = "none";
  }
}

// Example: check from backend if booking is live
async function checkBookingStatus() {
  try {
    const res = await fetch("/check_booking_status");
    const data = await res.json();
    toggleBookingUI(data.live);
  } catch (err) {
    console.error("Booking status check failed:", err);
  }
}

// Run immediately and poll every 10 seconds
checkBookingStatus();
setInterval(checkBookingStatus, 10000);

function updateMapButtonVisibility() {
    const mapBtn = document.getElementById('map-btn');
    const CURRENT_USER_ROLE = "{{ 'worker' if current_user.is_worker else 'giver' }}";

    if (CURRENT_USER_ROLE === 'worker') {
        mapBtn.style.display = 'inline-block';
    } else {
        mapBtn.style.display = 'none';
    }
}


/* 🕒 Improved Warn Sahayi Timer Logic (full functions) */
let warnTimerHandle = null;
let arrivalConfirmed = false;

/**
 * startDriveTimer: schedule the warn button and persist expiry.
 * - driveSeconds: ETA seconds (number)
 * - bookingId: booking identifier (string/number)
 */
async function startDriveTimer(driveSeconds, bookingId) {
  // Cancel any previous in-memory timer
  if (warnTimerHandle) {
    clearTimeout(warnTimerHandle);
    warnTimerHandle = null;
  }

  // Only the GIVER should see or manage the warn timer
  if (CURRENT_USER_ROLE !== 'giver') {
    const warnBtnOnly = document.getElementById('warn-sahayi-btn');
    if (warnBtnOnly) warnBtnOnly.style.display = 'none';
    // remove persisted entries for non-giver if present
    if (bookingId) {
      try {
        localStorage.removeItem(`warn_expiry_${bookingId}`);
        localStorage.removeItem(`warn_shown_${bookingId}`);
      } catch (e) { /* ignore */ }
    }
    window._warnTimerStartedFor = null;
    return;
  }

  const warnBtn = document.getElementById('warn-sahayi-btn');
  if (warnBtn) warnBtn.style.display = 'none';

  // Compute expiry timestamp (ms). If driveSeconds invalid, fallback later.
  let expiryTs = null;
  if (typeof driveSeconds === 'number' && driveSeconds > 0) {
    expiryTs = Date.now() + driveSeconds * 1000;
  }

  // If no expiry computed yet and bookingId provided, try ETA endpoint
  if (!expiryTs && bookingId) {
    try {
      const res = await fetch(`/get_estimated_drive_time_by_booking?booking_id=${encodeURIComponent(bookingId)}`);
      if (res.ok) {
        const j = await res.json();
        if (j?.seconds && j.seconds > 0) {
          expiryTs = Date.now() + j.seconds * 1000;
        }
      }
    } catch (err) {
      console.warn('ETA API fallback failed:', err);
    }
  }

  // Final fallback: 60 seconds
  if (!expiryTs) expiryTs = Date.now() + 60 * 1000;

  // Persist expiry so reload can restore it
  if (bookingId) {
    try {
      localStorage.setItem(`warn_expiry_${bookingId}`, String(expiryTs));
      localStorage.setItem('warn_booking_id', String(bookingId)); // optional
    } catch (e) {
      console.warn('Failed to persist warn expiry:', e);
    }
  }

  // Compute remaining delay
  const delay = Math.max(0, expiryTs - Date.now());

  // If already expired, show immediately and persist shown flag
  if (delay === 0) {
    if (warnBtn) warnBtn.style.display = 'inline-block';
    if (bookingId) {
      try { localStorage.setItem(`warn_shown_${bookingId}`, '1'); } catch (e) { /* ignore */ }
    }
    warnTimerHandle = null;
    window._warnTimerStartedFor = bookingId;
    return;
  }

  // Otherwise schedule a timeout for remaining time
  warnTimerHandle = setTimeout(() => {
    // If arrival already confirmed, do nothing
    if (arrivalConfirmed) {
      warnTimerHandle = null;
      return;
    }

    if (warnBtn) warnBtn.style.display = 'inline-block';

    // Persist that warn button was shown for this booking
    if (bookingId) {
      try {
        localStorage.setItem(`warn_shown_${bookingId}`, '1');
      } catch (e) {
        console.warn("Failed to persist warn_shown flag:", e);
      }
    }

    // timeout fired, clear handle
    warnTimerHandle = null;
  }, delay);

  // Remember which booking the timer belongs to
  window._warnTimerStartedFor = bookingId;
}


/**
 * restoreWarnTimerForBooking: call on DOMContentLoaded and whenever booking changes.
 * Keeps the warn button visible across reloads if it was already shown.
 */
function restoreWarnTimerForBooking(bookingId) {
  if (!bookingId || CURRENT_USER_ROLE !== 'giver') {
    // if not giver or no booking, ensure warn button hidden
    const warnBtn = document.getElementById('warn-sahayi-btn');
    if (warnBtn) warnBtn.style.display = 'none';
    return;
  }

  // clear any existing in-memory timer
  if (warnTimerHandle) {
    clearTimeout(warnTimerHandle);
    warnTimerHandle = null;
  }

  const warnBtn = document.getElementById('warn-sahayi-btn');
  const expiryRaw = localStorage.getItem(`warn_expiry_${bookingId}`);
  const shownFlag = localStorage.getItem(`warn_shown_${bookingId}`);

  // If warn was already shown (persisted), keep it visible until arrival confirmed
  if (shownFlag === '1') {
    if (warnBtn) warnBtn.style.display = 'inline-block';
    window._warnTimerStartedFor = bookingId;
    // do NOT remove the shown flag here — it remains until markArrivalConfirmed()
    return;
  }

  // If there's no expiry stored, keep warn hidden for now
  if (!expiryRaw) {
    if (warnBtn) warnBtn.style.display = 'none';
    return;
  }

  const expiryTs = parseInt(expiryRaw, 10);
  if (isNaN(expiryTs)) {
    // invalid stored value: cleanup and hide
    localStorage.removeItem(`warn_expiry_${bookingId}`);
    if (warnBtn) warnBtn.style.display = 'none';
    return;
  }

  const remaining = expiryTs - Date.now();

  if (remaining <= 0) {
    // expired already → show warn button immediately and persist shown flag
    if (warnBtn) warnBtn.style.display = 'inline-block';
    try { localStorage.setItem(`warn_shown_${bookingId}`, '1'); } catch (e) { /* ignore */ }
    window._warnTimerStartedFor = bookingId;
    return;
  }

  // schedule a timeout for remaining ms
  warnTimerHandle = setTimeout(() => {
    if (!arrivalConfirmed && warnBtn) warnBtn.style.display = 'inline-block';
    // persist shown flag
    try { localStorage.setItem(`warn_shown_${bookingId}`, '1'); } catch (e) { /* ignore */ }
    warnTimerHandle = null;
  }, remaining);

  window._warnTimerStartedFor = bookingId;
}


/**
 * markArrivalConfirmed: cancels timer, hides button, and removes persisted flags.
 * Call this when OTP verified / arrival confirmed by server or user.
 */
function markArrivalConfirmed() {
  arrivalConfirmed = true;

  if (warnTimerHandle) {
    clearTimeout(warnTimerHandle);
    warnTimerHandle = null;
  }

  const warnBtn = document.getElementById("warn-sahayi-btn");
  if (warnBtn) {
    warnBtn.style.display = "none";
  }

  console.log("✅ Arrival confirmed → Warn button hidden");

  // cleanup persisted expiry & shown flag for the booking
  const id = window._warnTimerStartedFor || currentBookingId;
  if (id) {
    try {
      localStorage.removeItem(`warn_expiry_${id}`);
      localStorage.removeItem(`warn_shown_${id}`);
      localStorage.removeItem('warn_booking_id');
    } catch (e) {
      console.warn("Failed to remove persisted warn keys:", e);
    }
    window._warnTimerStartedFor = null;
  } else if (currentBookingId) {
    // extra fallback cleanup
    try {
      localStorage.removeItem(`warn_expiry_${currentBookingId}`);
      localStorage.removeItem(`warn_shown_${currentBookingId}`);
    } catch (e) { /* ignore */ }
  }
}

/*
  Warn flow (client-side):
  - Giver: clicking warn will call /issue_warning and schedule next warn timer locally
  - Worker: polls /worker_check_warning every 3s, shows modal + sound when a warning appears
  - Final stage triggers /cancel_booking_by_giver (giver's click) which cancels booking on server
*/

const WARN_DELAYS_MIN = [20, 10, 5]; // minutes for stage 1,2,3 wait AFTER a warn is pressed
// stage index: 0 => after first warn (20), 1 => after second (10), 2 => after third (5), 3 => final cancel

// Helper: booking id global (your page already sets currentBookingId variable)
function getBookingId() {
  return window.currentBookingId || parseInt(localStorage.getItem('currentBookingId') || '0') || null;
}

/* ---------- GIVER SIDE ---------- */
const warnBtn = document.getElementById('warn-sahayi-btn');
if (warnBtn) {
  warnBtn.addEventListener('click', async () => {
    const bookingId = getBookingId();
    if (!bookingId) return alert('No active booking.');

    // Determine current stage stored locally (0 initial). We'll increment.
    let stageKey = `warn_stage_${bookingId}`;
    let stage = parseInt(localStorage.getItem(stageKey) || '0', 10);

    // If stage already reached 3 (meaning 3 warnings sent) then send cancel request immediately
    if (stage >= 3) {
      if (!confirm('This will cancel the booking due to repeated delays. Proceed?')) return;
      // send cancel request
      try {
        const resp = await fetch('/cancel_booking_by_giver', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ booking_id: bookingId })
        });
        const j = await resp.json();
        if (j.success) {
          alert('Booking cancelled and refund will be credited.');
          // clear local warn state
          localStorage.removeItem(stageKey);
          localStorage.removeItem(`warn_timer_ts_${bookingId}`);
          // hide button
          warnBtn.style.display = 'none';
        } else {
          alert(j.message || 'Failed to cancel booking.');
        }
      } catch (err) {
        console.error(err);
        alert('Error cancelling booking.');
      }
      return;
    }

    // increment stage and send issue_warning
    const newStage = stage + 1;
    const remainingChances = 3 - stage; // 3 -> first warn shows "3 chances left"
    try {
      const res = await fetch('/issue_warning', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          booking_id: bookingId,
          stage: newStage,
          remaining: remainingChances
        })
      });
      const data = await res.json();
      if (!data.success) {
        alert(data.message || 'Failed to send warning.');
        return;
      }

      // hide warn button until next timer fires
      warnBtn.style.display = 'none';

      // persist stage locally
      localStorage.setItem(stageKey, String(newStage));

      // schedule next timer (if not final)
      if (newStage <= WARN_DELAYS_MIN.length) {
        const delayMin = WARN_DELAYS_MIN[newStage - 1];
        const nextTs = Date.now() + delayMin * 60 * 1000;
        localStorage.setItem(`warn_timer_ts_${bookingId}`, String(nextTs));

        // set a timeout in this tab (best-effort)
        setTimeout(() => {
          // show the warn button again (unless arrival confirmed)
          const arrivalConfirmed = localStorage.getItem(`arrival_confirmed_${bookingId}`) === '1';
          if (!arrivalConfirmed) warnBtn.style.display = 'inline-block';
        }, delayMin * 60 * 1000);
      } else {
        // newStage > WARN_DELAYS_MIN -> this route means next click will cancel (handled above)
      }

      alert('Warning sent to the worker.');
    } catch (err) {
      console.error('issue_warning error', err);
      alert('Network error sending warning.');
    }
  });
}

// On load, restore warn button visibility if timer expired
(function restoreGiverWarnFromStorage() {
  const bookingId = getBookingId();
  if (!bookingId || !warnBtn) return;

  const arrivalConfirmed = localStorage.getItem(`arrival_confirmed_${bookingId}`) === '1';
  if (arrivalConfirmed) {
    warnBtn.style.display = 'none';
    return;
  }

  const shownFlag = localStorage.getItem(`warn_shown_${bookingId}`);
  const timerTs = parseInt(localStorage.getItem(`warn_timer_ts_${bookingId}`) || '0', 10);
  const now = Date.now();

  if (shownFlag === '1') {
    warnBtn.style.display = 'inline-block';
  } else if (timerTs && timerTs <= now) {
    warnBtn.style.display = 'inline-block';
    localStorage.setItem(`warn_shown_${bookingId}`, '1');
  } else {
    // not yet; schedule show if timer exists
    if (timerTs && timerTs > now) {
      setTimeout(() => {
        const arrivalConfirmed2 = localStorage.getItem(`arrival_confirmed_${bookingId}`) === '1';
        if (!arrivalConfirmed2) warnBtn.style.display = 'inline-block';
        localStorage.setItem(`warn_shown_${bookingId}`, '1');
      }, Math.max(0, timerTs - now));
    }
  }
})();

/* When arrival is confirmed anywhere in your flow, call this to cleanup (your existing markArrivalConfirmed does it).
   We set a local flag too so giver timers won't reappear. */
function markArrivalConfirmedLocal(bookingId) {
  if (!bookingId) bookingId = getBookingId();
  if (!bookingId) return;
  localStorage.setItem(`arrival_confirmed_${bookingId}`, '1');
  localStorage.removeItem(`warn_timer_ts_${bookingId}`);
  localStorage.removeItem(`warn_shown_${bookingId}`);
  localStorage.removeItem(`warn_stage_${bookingId}`);
  const wb = document.getElementById('warn-sahayi-btn');
  if (wb) wb.style.display = 'none';
}
// Hook into existing markArrivalConfirmed
window.markArrivalConfirmed = function() {
  try {
    markArrivalConfirmedLocal(getBookingId());
  } catch (e) {}
  // preserve existing behavior (if you defined it earlier)
  if (typeof window.__original_markArrivalConfirmed === 'function') {
    window.__original_markArrivalConfirmed();
  }
};

/* ---------- WORKER SIDE (polling + modal) ---------- */
const workerModal = document.getElementById('worker-warn-modal');
const workerWarnMsg = document.getElementById('worker-warn-msg');
const workerWarnChances = document.getElementById('worker-warn-chances');
const workerWarnClose = document.getElementById('worker-warn-close');
const workerWarnAck = document.getElementById('worker-warn-ack');
const warnSound = document.getElementById('warn-sound');

let lastShownWarningId = null;

async function pollForWarnings() {
  const bookingId = getBookingId();
  if (!bookingId) {
    setTimeout(pollForWarnings, 3000);
    return;
  }

  try {
    const res = await fetch(`/worker_check_warning?booking_id=${encodeURIComponent(bookingId)}`);
    if (!res.ok) throw new Error('network');
    const j = await res.json();
    if (j && j.warning) {
      const w = j.warning;
      if (w.id !== lastShownWarningId) {
        lastShownWarningId = w.id;
        showWorkerWarningPopup(w);
      }
    }
  } catch (err) {
    console.warn('Warning poll error', err);
  } finally {
    setTimeout(pollForWarnings, 3000); // keep polling every 3s
  }
}

function showWorkerWarningPopup(warning) {
  workerWarnMsg.textContent = warning.message || 'Your partner has warned you for delay in arriving.';
  const remaining = (typeof warning.remaining !== 'undefined') ? warning.remaining : (3 - (warning.stage || 1) + 1);
  workerWarnChances.textContent = `You have ${remaining} chance${remaining !== 1 ? 's' : ''} left.`;

  // ✅ Play continuous sound
  try {
    warnSound.loop = true;
    warnSound.volume = 1.0;
    warnSound.currentTime = 0;
    warnSound.play().catch(() => {});
  } catch (e) { /* ignore */ }

  workerModal.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  workerWarnClose.onclick = () => {
    workerModal.style.display = 'none';
    document.body.style.overflow = '';
    warnSound.pause();
    warnSound.currentTime = 0;
  };

  workerWarnAck.onclick = async () => {
    try {
      const bookingId = getBookingId();
      const resp = await fetch('/ack_warning', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ booking_id: bookingId, warning_id: warning.id })
      });
      const j = await resp.json();
      if (j.success) {
        workerModal.style.display = 'none';
        document.body.style.overflow = '';
        warnSound.pause();
        warnSound.currentTime = 0;
      } else {
        alert(j.message || 'Failed to acknowledge warning.');
      }
    } catch (err) {
      alert('Network error.');
    }
  };
}


// Start polling only if current user is a worker (server template sets CURRENT_USER_ROLE)
if (typeof CURRENT_USER_ROLE !== 'undefined' && CURRENT_USER_ROLE === 'worker') {
  setTimeout(pollForWarnings, 1000);
}

/* ---------- Cleanup on booking change ---------- */
(function observeBookingChangeForCleanup() {
  // If booking resets/changes in localStorage, clear lastShownWarningId to allow new warnings for new booking
  window.addEventListener('storage', (ev) => {
    if (ev.key === 'currentBookingId') {
      lastShownWarningId = null;
    }
  });
})();

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


  btnCancel?.addEventListener('click', async ()=>{
    if (!negId) return hidePopup();
    try{
      await fetch('/negotiation/cancel', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ negotiation_id: negId })
      });
    }catch(e){}
    hidePopup();
  });

  // Start polling inbox every 3 seconds, and once immediately.
  setInterval(checkInbox, 3000);
  checkInbox();
})();