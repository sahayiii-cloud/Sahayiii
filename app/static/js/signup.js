/* Maintain animation (top-left) */
lottie.loadAnimation({
  container: document.getElementById('maintainAnim'),
  renderer: 'svg',
  loop: true,
  autoplay: true,
  path: '/static/lottie/Maintenance_icon.json'
}).setSpeed(0.8);

/* Home repair walking animation */
lottie.loadAnimation({
  container: document.getElementById('homeRepairAnim'),
  renderer: 'svg',
  loop: true,
  autoplay: true,
  path: '/static/lottie/man_at_work.json'
}).setSpeed(0.9);





/* ----------------------
   Helpers & UI refs
   ---------------------- */
function showStep(id) {
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function buildPhone(val){ return '+91' + val.replace(/\D/g,'').slice(-10); }

const phoneInput = document.getElementById('phoneInput');
const sendOtpBtn = document.getElementById('sendOtpBtn');
const phoneError = document.getElementById('phoneError');
const displayPhone = document.getElementById('displayPhone');

const otpInputs = Array.from(document.querySelectorAll('.otp-input'));
const verifyOtpBtn = document.getElementById('verifyOtpBtn');
const otpError = document.getElementById('otpError');
const resendBtn = document.getElementById('resendBtn');
const editPhone = document.getElementById('editPhone');

const nameInput = document.getElementById('nameInput');
const passwordInput = document.getElementById('passwordInput');
const createAccountBtn = document.getElementById('createAccountBtn');
const credError = document.getElementById('credError');

let currentPhone = null;
let resendCooldown = 0;
let resendTimer = null;

/* ----------------------
   Step 1: Send OTP
   ---------------------- */
sendOtpBtn.addEventListener('click', async () => {
  phoneError.textContent = '';
  const raw = phoneInput.value.trim();
  if (!/^\d{10}$/.test(raw)) { phoneError.textContent = 'Enter a valid 10-digit Indian mobile number.'; return; }
  const phone = buildPhone(raw);
  sendOtpBtn.disabled = true;
  sendOtpBtn.innerHTML = 'Sending <span class="spinner-border spinner-border-sm" role="status"></span>';
  try {
    const res = await fetch('/send_phone_otp', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      credentials: 'same-origin',            // <- send cookies
      body: JSON.stringify({phone})
    });
    const data = await res.json();
    if (data.success) {
      currentPhone = phone;
      displayPhone.textContent = phone;
      // clear previous otp boxes
      otpInputs.forEach(i=>i.value='');
      showStep('step-otp');
      otpInputs[0].focus();
      startResendCooldown(60);
      console.log('[send_phone_otp] success:', data.message);
    } else {
      phoneError.textContent = data.message || 'Failed to send OTP';
    }
  } catch (err) {
    console.error(err);
    phoneError.textContent = 'Network error. Try again.';
  } finally {
    sendOtpBtn.disabled = false;
    sendOtpBtn.innerHTML = 'Next — Send OTP';
  }
});

/* ----------------------
   OTP input behavior
   ---------------------- */
otpInputs.forEach((input, idx) => {
  input.addEventListener('input', (e) => {
    const v = e.target.value.replace(/\D/g,'').slice(0,1);
    e.target.value = v;
    if (v && idx < otpInputs.length-1) otpInputs[idx+1].focus();
    if (otpInputs.every(i=>i.value.trim().length===1)) verifyOtp();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && !e.target.value && idx>0) otpInputs[idx-1].focus();
  });
  input.addEventListener('paste', (e) => {
    const text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g,'').slice(0,6);
    if (!text) return;
    e.preventDefault();
    for (let i=0;i<6;i++){ otpInputs[i].value = text[i]||''; }
    if (text.length>=6) verifyOtp();
  });
});

/* ----------------------
   Step 2: Verify OTP
   ---------------------- */
async function verifyOtp(){
  otpError.textContent='';
  if (!currentPhone) { otpError.textContent = 'Phone missing. Go back and enter phone again.'; return; }
  const code = otpInputs.map(i=>i.value).join('');
  if (code.length !== 6) { otpError.textContent = 'Enter the 6-digit OTP'; return; }
  verifyOtpBtn.disabled = true;
  verifyOtpBtn.innerHTML = 'Verifying <span class="spinner-border spinner-border-sm" role="status"></span>';
  try {
    const res = await fetch('/verify_phone_otp', {
      method:'POST',
      headers:{'Content-Type': 'application/json'},
      credentials: 'same-origin',            // <- send cookies
      body: JSON.stringify({phone: currentPhone, otp: code})
    });
    const data = await res.json();
    if (data.success) {
      showStep('step-credentials');
      nameInput.focus();
      console.log('[verify_phone_otp] success:', data.message);
    } else {
      otpError.textContent = data.message || 'Invalid OTP';
    }
  } catch (err) {
    console.error(err);
    otpError.textContent = 'Network error. Try again.';
  } finally {
    verifyOtpBtn.disabled = false;
    verifyOtpBtn.innerHTML = 'Verify';
  }
}
verifyOtpBtn.addEventListener('click', verifyOtp);

/* ----------------------
   Resend OTP
   ---------------------- */
resendBtn.addEventListener('click', async () => {
  if (resendCooldown>0 || !currentPhone) return;
  resendBtn.disabled = true;
  resendBtn.innerText = 'Resending...';
  try {
    const res = await fetch('/send_phone_otp', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      credentials: 'same-origin',            // <- send cookies
      body: JSON.stringify({phone: currentPhone})
    });
    const data = await res.json();
    if (data.success) {
      startResendCooldown(60);
    } else {
      otpError.textContent = data.message || 'Failed to resend OTP';
      resendBtn.disabled = false;
      resendBtn.innerText = 'Resend';
    }
  } catch (err) {
    console.error(err);
    otpError.textContent = 'Network error. Try again.';
    resendBtn.disabled = false;
    resendBtn.innerText = 'Resend';
  }
});

function startResendCooldown(seconds){
  resendCooldown = seconds;
  resendBtn.disabled = true;
  resendBtn.innerText = `Resend (${resendCooldown}s)`;
  clearInterval(resendTimer);
  resendTimer = setInterval(()=> {
    resendCooldown--;
    if (resendCooldown <= 0) {
      clearInterval(resendTimer);
      resendBtn.disabled = false;
      resendBtn.innerText = 'Resend';
    } else {
      resendBtn.innerText = `Resend (${resendCooldown}s)`;
    }
  },1000);
}

/* allow editing phone and going back */
editPhone.addEventListener('click', () => { showStep('step-phone'); });

/* ----------------------
   Step 3: Create account
   ---------------------- */
createAccountBtn.addEventListener('click', async () => {
  credError.textContent = '';
  const name = nameInput.value.trim();
  const pw = passwordInput.value;
  if (!name) { credError.textContent = 'Enter your name'; return; }
  if (!pw || pw.length < 6) { credError.textContent = 'Password must be at least 6 characters'; return; }
  createAccountBtn.disabled = true;
  createAccountBtn.innerHTML = 'Creating <span class="spinner-border spinner-border-sm" role="status"></span>';
  try {
    const payload = new URLSearchParams();
    payload.append('phone', currentPhone);
    payload.append('name', name);
    payload.append('password', pw);

    const res = await fetch('/sign_up', {
      method: 'POST',
      credentials: 'same-origin',            // <- send cookies
      body: payload
    });

    // debug-friendly: log status & raw response if not JSON
    console.log('sign_up status:', res.status, res.statusText);
    const raw = await res.text();
    console.log('sign_up raw response:', raw);

    let data = null;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      credError.textContent = 'Server returned unexpected response. See console (raw response).';
      return;
    }

    if (data.success) {
      // redirect to welcome (server should have logged-in user)
      window.location.href = '/welcome';
    } else {
      credError.textContent = data.message || 'Signup failed';
    }
  } catch (err) {
    console.error('Network/fetch error during sign_up:', err);
    credError.textContent = 'Network error. Try again.';
  } finally {
    createAccountBtn.disabled = false;
    createAccountBtn.innerHTML = 'Create account';
  }
});

/* accessibility: Enter to verify OTP boxes */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const active = document.querySelector('.step.active');
    if (active && active.id === 'step-otp') {
      e.preventDefault();
      verifyOtp();
    }
    if (active && active.id === 'step-credentials') {
      // pressing Enter triggers create account
      e.preventDefault();
      createAccountBtn.click();
    }
  }
});