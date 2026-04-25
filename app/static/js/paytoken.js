// ================= DATA FROM BACKEND =================

const bookingToken = window.BOOKING_TOKEN;
const TIME_LEFT = window.TIME_LEFT || 0;

const payBtn = document.getElementById("payBtn");


if (!bookingToken) {
  console.error("❌ Booking token missing!");
}



// ================= PAYMENT =================

payBtn.addEventListener("click", async () => {

  payBtn.disabled = true;

  try {

    // 1️⃣ Create order
    const res = await fetch(`/razorpay/create_order/${bookingToken}`, {
      method: "POST",
      credentials: "same-origin"
    });


    if (!res.ok) {

      const t = await res.text();

      alert("Could not create order: " + t);

      payBtn.disabled = false;

      return;
    }


    const data = await res.json();


    // 2️⃣ Open Razorpay
    const rzp = new Razorpay({

      key: data.key_id,

      amount: data.amount,

      currency: data.currency || "INR",

      name: "Sahayi",

      description: "Booking payment",

      order_id: data.order_id,


      prefill: {
        name: window.CURRENT_USER_NAME || "",
        email: window.CURRENT_USER_EMAIL || ""
      },


      handler: async function (resp) {

        // 3️⃣ Verify payment
        const verifyRes = await fetch("/razorpay/verify_payment", {

          method: "POST",

          headers: {
            "Content-Type": "application/json"
          },

          credentials: "same-origin",

          body: JSON.stringify({

            token: bookingToken,

            razorpay_payment_id: resp.razorpay_payment_id,

            razorpay_order_id: resp.razorpay_order_id,

            razorpay_signature: resp.razorpay_signature
          })

        });


        const v = await verifyRes.json();


        if (verifyRes.ok && v.success) {

          // ✅ Success popup
          const overlay = document.getElementById("successOverlay");
          const btn = document.getElementById("successBtn");

          overlay.classList.remove("hidden");


          btn.onclick = () => {
            window.location.replace("/welcome");
          };


        } else {

          alert(
            "Payment verification failed: " +
            (v.detail || v.message || "Unknown error")
          );

          payBtn.disabled = false;
        }
      }

    });


    rzp.open();


  } catch (e) {

    console.error(e);

    alert("Something went wrong while starting payment.");

    payBtn.disabled = false;
  }

});



// ================= COUNTDOWN =================

if (TIME_LEFT > 0) {

  (function () {

    let left = TIME_LEFT;

    const el = document.getElementById("countdown");

    if (!el) return;


    const tick = () => {

      if (left <= 0) {

        location.reload();

        return;
      }


      const m = Math.floor(left / 60);
      const s = left % 60;

      el.textContent = `${m}m ${s}s`;

      left--;

    };


    tick();

    setInterval(tick, 1000);

  })();

}
