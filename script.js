const frameCount = 270;
const framePath = (index) =>
  `ezgif-38873a8ef8fd9200-jpg/ezgif-frame-${String(index).padStart(3, "0")}.jpg`;

const canvas = document.querySelector("#sequence");
const context = canvas.getContext("2d");
const stage = document.querySelector(".scroll-stage");
const sticky = document.querySelector(".sticky-frame");
const loader = document.querySelector("#loader");
const loaderBar = document.querySelector("#loader-bar");
const loaderCount = document.querySelector("#loader-count");
const images = [];
let loadedFrames = 0;
let targetProgress = 0;
let easedProgress = 0;
let lastFrame = -1;
let lastDrawnImage = null;
const releasePoint = 0.96;
const easingStrength = 0.075;
let loaderFinished = false;

context.imageSmoothingEnabled = true;
context.imageSmoothingQuality = "high";

function fitImage(image) {
  const scale = Math.max(canvas.width / image.width, canvas.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  const x = (canvas.width - width) / 2;
  const y = (canvas.height - height) / 2;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, x, y, width, height);
}

function sizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * ratio);
  canvas.height = Math.round(window.innerHeight * ratio);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  if (images[lastFrame]?.complete) {
    fitImage(images[lastFrame]);
  }
}

function scrollState() {
  const rect = stage.getBoundingClientRect();
  const distance = stage.offsetHeight - window.innerHeight;
  const raw = Math.min(Math.max(-rect.top / distance, 0), 1);
  const sequence = Math.min(raw / releasePoint, 1);

  return { raw, sequence };
}

function drawFrame(progress) {
  const exactFrame = progress * (frameCount - 1);
  const preferredFrame = Math.min(frameCount - 1, Math.max(0, Math.round(exactFrame)));
  let frame = preferredFrame;
  let image = images[frame];

  if (!image?.complete) {
    for (let offset = 1; offset < 8; offset += 1) {
      const before = images[preferredFrame - offset];
      const after = images[preferredFrame + offset];

      if (before?.complete) {
        frame = preferredFrame - offset;
        image = before;
        break;
      }

      if (after?.complete) {
        frame = preferredFrame + offset;
        image = after;
        break;
      }
    }
  }

  if (frame !== lastFrame && image?.complete) {
    fitImage(image);
    lastFrame = frame;
    lastDrawnImage = image;
  }

  sticky.style.setProperty("--progress", progress.toFixed(4));
  sticky.style.setProperty("--lift", Math.min(progress * 1.6, 1).toFixed(4));
  sticky.style.setProperty("--copy-opacity", Math.max(1 - progress * 2.2, 0).toFixed(4));
}

function tick() {
  const state = scrollState();
  targetProgress = state.sequence;
  const velocityAwareEase = targetProgress === 1 ? 0.18 : easingStrength;
  easedProgress += (targetProgress - easedProgress) * velocityAwareEase;

  if (targetProgress === 1 || Math.abs(targetProgress - easedProgress) < 0.0008) {
    easedProgress = targetProgress;
  }

  drawFrame(easedProgress);
  sticky.style.setProperty("--scroll-progress", state.raw.toFixed(4));
  requestAnimationFrame(tick);
}

function preloadFrames() {
  for (let i = 1; i <= frameCount; i += 1) {
    const img = new Image();
    img.src = framePath(i);
    const markLoaded = () => {
      loadedFrames += 1;
      updateLoader();
      if (loadedFrames === 1) {
        fitImage(img);
        lastDrawnImage = img;
      }
    };
    img.onload = markLoaded;
    img.onerror = markLoaded;
    img.decoding = "async";
    images.push(img);
  }
}

function updateLoader() {
  const percent = Math.min(Math.round((loadedFrames / frameCount) * 100), 100);
  loaderBar.style.setProperty("--load-progress", `${percent}%`);
  loaderCount.textContent = `${percent}%`;

  if (percent >= 100 && !loaderFinished) {
    loaderFinished = true;
    window.setTimeout(() => {
      loader.classList.add("is-done");
      document.body.classList.remove("loading");
    }, 260);
  }
}

window.addEventListener("resize", sizeCanvas, { passive: true });
window.addEventListener("orientationchange", sizeCanvas, { passive: true });

document
  .querySelectorAll(".feature-card, .spec-card, .finish-card, .digital-section, .cta, .footer")
  .forEach((element) => element.classList.add("reveal"));

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.16 }
);

document.querySelectorAll(".reveal").forEach((element) => revealObserver.observe(element));

const modalLayer = document.querySelector("#modal-layer");
const modalClose = document.querySelector(".modal-close");
const toast = document.querySelector("#toast");
const formsByModal = [...document.querySelectorAll("[data-modal]")];
const cartSummary = document.querySelector("#cart-summary");
const dealerResults = document.querySelector("#dealer-results");
const newsletterForm = document.querySelector("#newsletter-form");
const testDriveForm = document.querySelector("#test-drive-form");
const buildForm = document.querySelector("#build-form");
const dealerForm = document.querySelector("#dealer-form");
let toastTimer;
const submissionsKey = "miniSubmissions";

function showToast(message, isError = false) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle("is-error", isError);
  toast.classList.add("is-visible");

  toastTimer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 3400);
}

function setLoading(form, loading) {
  const button = form.querySelector('button[type="submit"]');
  if (!button) return;

  button.disabled = loading;
  button.dataset.originalText ||= button.textContent;
  button.textContent = loading ? "Please wait..." : button.dataset.originalText;
}

function formPayload(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function loadSubmissions() {
  return JSON.parse(localStorage.getItem(submissionsKey) || "[]");
}

function saveSubmission(kind, payload) {
  const submissions = loadSubmissions();
  const entry = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    kind,
    created_at: new Date().toISOString(),
    payload,
  };

  submissions.unshift(entry);
  localStorage.setItem(submissionsKey, JSON.stringify(submissions));
  return entry;
}

function demoDealers(city) {
  const place = city.trim() || "Mumbai";
  return [
    {
      name: `MINI ${place} Studio`,
      address: `12 Performance Avenue, ${place}`,
      phone: "+91 90000 12001",
    },
    {
      name: `MINI ${place} Service Hub`,
      address: `48 Cooper Road, ${place}`,
      phone: "+91 90000 12002",
    },
  ];
}

function openModal(name) {
  formsByModal.forEach((element) => {
    element.classList.toggle("is-active", element.dataset.modal === name);
  });

  if (name === "cart") {
    renderCart();
  }

  modalLayer.classList.add("is-open");
  modalLayer.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  modalLayer.querySelector(".is-active input, .is-active select, .is-active button")?.focus();
}

function closeModal() {
  modalLayer.classList.remove("is-open");
  modalLayer.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function renderCart() {
  const saved = JSON.parse(localStorage.getItem("miniConfiguration") || "null");

  if (!saved) {
    cartSummary.innerHTML = "<span>No configuration saved yet.</span>";
    return;
  }

  const safe = Object.fromEntries(
    Object.entries(saved).map(([key, value]) => [key, String(value).replace(/[&<>"']/g, (match) => {
      const chars = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
      return chars[match];
    })])
  );

  cartSummary.innerHTML = `
    <dl>
      <dt>Variant</dt><dd>${safe.variant}</dd>
      <dt>Color</dt><dd>${safe.color}</dd>
      <dt>Mode</dt><dd>${safe.mode}</dd>
      <dt>Budget</dt><dd>${safe.budget || "Not specified"}</dd>
    </dl>
  `;
}

document.querySelectorAll("[data-open-modal]").forEach((trigger) => {
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    openModal(trigger.dataset.openModal);
  });
});

modalClose.addEventListener("click", closeModal);
modalLayer.addEventListener("click", (event) => {
  if (event.target === modalLayer) {
    closeModal();
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && modalLayer.classList.contains("is-open")) {
    closeModal();
  }
});

testDriveForm.querySelector('input[name="date"]').min = new Date().toISOString().split("T")[0];

testDriveForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setLoading(testDriveForm, true);

  try {
    saveSubmission("test_drives", formPayload(testDriveForm));
    testDriveForm.reset();
    closeModal();
    showToast("Demo request saved locally. Your Vercel frontend is ready.");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setLoading(testDriveForm, false);
  }
});

buildForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = formPayload(buildForm);
  setLoading(buildForm, true);

  try {
    saveSubmission("builds", payload);
    localStorage.setItem("miniConfiguration", JSON.stringify(payload));
    closeModal();
    showToast("Configuration saved to your garage.");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setLoading(buildForm, false);
  }
});

dealerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setLoading(dealerForm, true);
  dealerResults.innerHTML = "";

  try {
    const payload = formPayload(dealerForm);
    const dealers = demoDealers(payload.city);
    saveSubmission("dealer_searches", payload);
    const fragment = document.createDocumentFragment();
    dealers.forEach((dealer) => {
      const card = document.createElement("article");
      const name = document.createElement("strong");
      const address = document.createElement("span");
      const phone = document.createElement("span");

      card.className = "result-card";
      name.textContent = dealer.name;
      address.textContent = dealer.address;
      phone.textContent = dealer.phone;
      card.append(name, address, phone);
      fragment.append(card);
    });
    dealerResults.append(fragment);
    showToast("Dealer results loaded.");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setLoading(dealerForm, false);
  }
});

newsletterForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setLoading(newsletterForm, true);

  try {
    saveSubmission("newsletters", formPayload(newsletterForm));
    newsletterForm.reset();
    showToast("Demo subscription saved locally.");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setLoading(newsletterForm, false);
  }
});

sizeCanvas();
preloadFrames();
tick();
