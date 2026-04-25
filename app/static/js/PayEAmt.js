   const form = document.getElementById("payment-form");
    const popup = document.getElementById("popup");

    form.addEventListener("submit", function (e) {
      const userTokens = parseFloat(document.getElementById("user_tokens").value);
      const totalTokens = parseFloat(document.getElementById("total_tokens").value);

      if (userTokens < totalTokens) {
        e.preventDefault();
        document.getElementById("required-tokens").textContent = totalTokens;
        document.getElementById("available-tokens").textContent = userTokens;
        popup.style.display = "flex";
      }
    });

    function closePopup() {
      popup.style.display = "none";
    }