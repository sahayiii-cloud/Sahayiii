async function addMoney(){
  const v = parseInt(document.getElementById('amt').value || '0', 10);
  if (!v || v <= 0) return alert('Enter a valid amount');

  const r = await fetch('/wallet/create_order', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    credentials: 'same-origin',
    body: JSON.stringify({ amount_rupees: v })
  });
  const d = await r.json();
  if (!r.ok) return alert(d.detail || 'Failed to create order');

  const rz = new Razorpay({
    key: d.key_id,
    amount: d.amount,
    currency: d.currency || 'INR',
    name: 'Sahayi',
    description: 'Wallet top-up',
    order_id: d.order_id,
    handler: async function(resp){
      const vr = await fetch('/wallet/verify_topup', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        credentials: 'same-origin',
        body: JSON.stringify({
          amount_rupees: v,
          razorpay_payment_id: resp.razorpay_payment_id,
          razorpay_order_id: resp.razorpay_order_id,
          razorpay_signature: resp.razorpay_signature
        })
      });
      const vv = await vr.json();
      if (vr.ok && vv.success) {
        alert('✅ Added to wallet');
        location.reload();
      } else {
        alert(vv.detail || 'Verification failed');
      }
    }
  });
  rz.open();
}

async function payExtra(bookingId, minutes){
  const r = await fetch(`/razorpay/create_order_for_extra/${bookingId}`, {
    method: 'POST',
    headers:{'Content-Type':'application/json'},
    credentials:'same-origin',
    body: JSON.stringify({ extra_minutes: minutes })
  });
  const d = await r.json();
  if (!r.ok) { alert(d.detail || d.message || 'Failed to create order'); return; }

  const rz = new Razorpay({
    key: d.key_id,
    amount: d.amount,
    currency: d.currency || 'INR',
    order_id: d.order_id,
    name: 'Sahayi',
    description: `Extra time (${minutes} min)`,
    handler: async function(resp){
      const vr = await fetch('/razorpay/verify_extra_payment', {
        method: 'POST',
        headers:{'Content-Type':'application/json'},
        credentials:'same-origin',
        body: JSON.stringify({
          booking_id: bookingId,
          extra_minutes: minutes,
          razorpay_payment_id: resp.razorpay_payment_id,
          razorpay_order_id: resp.razorpay_order_id,
          razorpay_signature: resp.razorpay_signature
        })
      });
      const vv = await vr.json();
      if (vr.ok && vv.success){
        alert('✅ Extra time paid and wallet credited');
        location.reload();
      } else {
        alert(vv.detail || vv.message || 'Verification failed; will be processed by webhook if delivered.');
      }
    }
  });
  rz.open();
}

async function withdraw(){
  const v = parseInt(document.getElementById('wd').value || '0', 10);
  if (!v || v <= 0) return alert('Enter a valid amount');
  const r = await fetch('/wallet/request_withdraw', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    credentials: 'same-origin',
    body: JSON.stringify({ amount_rupees: v })
  });
  const d = await r.json();
  if (r.ok && d.success) alert('✅ Withdrawal request submitted');
  else alert(d.detail || 'Failed to submit request');
}

document.getElementById('addBtn').addEventListener('click', addMoney);
document.getElementById('wdBtn').addEventListener('click', withdraw);