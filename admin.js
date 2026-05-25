const submissionsBody = document.querySelector("#submissions");
const refreshButton = document.querySelector("#refresh");
const filterSelect = document.querySelector("#filter");
const toast = document.querySelector("#admin-toast");
let submissions = [];
let toastTimer;
const submissionsKey = "miniSubmissions";

const labels = {
  test_drives: "Test drive",
  builds: "Build",
  newsletters: "Newsletter",
  dealer_searches: "Dealer search",
};

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

function setCounts(counts) {
  document.querySelector("#count-test-drives").textContent = counts.test_drives || 0;
  document.querySelector("#count-builds").textContent = counts.builds || 0;
  document.querySelector("#count-newsletters").textContent = counts.newsletters || 0;
  document.querySelector("#count-dealers").textContent = counts.dealer_searches || 0;
}

function countSubmissions(items) {
  return items.reduce(
    (counts, item) => {
      counts[item.kind] = (counts[item.kind] || 0) + 1;
      return counts;
    },
    { test_drives: 0, builds: 0, newsletters: 0, dealer_searches: 0 }
  );
}

function formatDate(value) {
  return new Date(value).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (match) => {
    const chars = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return chars[match];
  });
}

function renderDetails(payload) {
  return Object.entries(payload)
    .map(
      ([key, value]) =>
        `<span><strong>${escapeHtml(key.replaceAll("_", " "))}:</strong> ${escapeHtml(value || "Not specified")}</span>`
    )
    .join("");
}

function renderTable() {
  const selected = filterSelect.value;
  const visible = selected === "all" ? submissions : submissions.filter((item) => item.kind === selected);

  if (!visible.length) {
    submissionsBody.innerHTML = '<tr><td colspan="3">No submissions found.</td></tr>';
    return;
  }

  submissionsBody.innerHTML = visible
    .map(
      (item) => `
        <tr>
          <td><span class="tag">${labels[item.kind] || item.kind}</span></td>
          <td>${formatDate(item.created_at)}</td>
          <td><div class="details">${renderDetails(item.payload)}</div></td>
        </tr>
      `
    )
    .join("");
}

function loadSubmissions() {
  refreshButton.disabled = true;
  refreshButton.textContent = "Loading";

  try {
    submissions = JSON.parse(localStorage.getItem(submissionsKey) || "[]");
    setCounts(countSubmissions(submissions));
    renderTable();
    showToast("Local dashboard updated.");
  } catch (error) {
    submissionsBody.innerHTML = `<tr><td colspan="3">${error.message}</td></tr>`;
    showToast(error.message);
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = "Refresh";
  }
}

refreshButton.addEventListener("click", loadSubmissions);
filterSelect.addEventListener("change", renderTable);
loadSubmissions();
