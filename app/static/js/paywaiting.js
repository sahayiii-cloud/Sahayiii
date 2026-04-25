const token = window.BOOKING_TOKEN || null;
let remainingTime = window.REMAINING_TIME || 0;

const timerDisplay = document.getElementById('timer');


    function formatTime(seconds) {
      const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
      const secs = (seconds % 60).toString().padStart(2, '0');
      return `${minutes}:${secs}`;
    }

    timerDisplay.textContent = formatTime(remainingTime);

    const timerInterval = setInterval(() => {
      if (remainingTime > 0) {
        remainingTime--;
        timerDisplay.textContent = formatTime(remainingTime);
      } else {
        clearInterval(timerInterval);
        timerDisplay.textContent = "⛔ Time expired";
        timerDisplay.style.color = "red";
      }
    }, 1000);

    // Poll every 5 seconds to check payment status
    const checkInterval = setInterval(() => {
      fetch(`/check_token_status/${token}`)
        .then(res => res.json())
        .then(data => {
          if (data.paid) {
            clearInterval(checkInterval);
            clearInterval(timerInterval);

            const modal = new bootstrap.Modal(document.getElementById('tokenReceivedModal'));
            modal.show();
          }
        })
        .catch(err => console.error("Error checking token status:", err));
    }, 5000);