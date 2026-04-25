 // ✅ Search + Filter (works across all tabs)
  const searchInput = document.getElementById("searchInput");
  const statusFilter = document.getElementById("statusFilter");
  const clearBtn = document.getElementById("clearBtn");

  function applyFilters(){
    const q = (searchInput.value || "").toLowerCase().trim();
    const section = statusFilter.value;

    document.querySelectorAll(".jobItem").forEach(item=>{
      const text = item.getAttribute("data-search") || "";
      const sec = item.getAttribute("data-section") || "";

      const matchSearch = q === "" || text.includes(q);
      const matchSection = section === "all" || sec === section;

      item.style.display = (matchSearch && matchSection) ? "" : "none";
    });
  }

  searchInput.addEventListener("input", applyFilters);
  statusFilter.addEventListener("change", applyFilters);

  clearBtn.addEventListener("click", ()=>{
    searchInput.value = "";
    statusFilter.value = "all";
    applyFilters();
  });

  // ✅ Tabs: filter + clean history
  document.querySelectorAll('[data-bs-toggle="tab"]').forEach(btn=>{
    btn.addEventListener("shown.bs.tab", (e)=>{
      applyFilters();

      const target = e.target.getAttribute("data-bs-target");
      if (target) history.replaceState(null, "", target);
    });
  });

  // ✅ Open correct tab if URL has hash
  window.addEventListener("DOMContentLoaded", ()=>{
    if (location.hash) {
      const tabBtn = document.querySelector(`[data-bs-target="${location.hash}"]`);
      if (tabBtn) new bootstrap.Tab(tabBtn).show();
    }
    applyFilters();
  });