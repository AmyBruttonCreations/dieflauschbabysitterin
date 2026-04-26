import { quoteStay } from "./pricingEngine.js";
import { addLedgerEntry, addStay, getAccountSnapshot, getCustomerByCodeword, redeemReward, upsertCustomer } from "./storage.js";

const byId = (id) => document.getElementById(id);
const LEGACY_PET_PROFILES = {
  borja: 30,
  bubbles: 35,
  snoepje: 30,
  quantum: 35,
  sam: 40
};
const DISCOUNT_CODE_BASELINES = {
  friend35: 35,
  friend30: 30
};
const DEFAULT_PET_PROFILE_DETAILS = {
  borja: {
    profileImage: "./borja-profile.png"
  },
  bubbles: {
    profileImage: "./bubbles-profile.png",
    petDisplayName: "Bubbles",
    ageReferenceYears: 4,
    ageReferenceDate: "2026-04-24T00:00:00.000Z",
    likes: "Dogs who look like her",
    dislikes: "Dogs who don't",
    allergies: "None",
    defaultCompanyNeed: false,
    medicalHistory: "Claw issues",
    medicalNeeds: "None",
    vetAddress: "Pending from Asli",
    customerName: "Asli",
    stays: [
      {
        id: "bubbles-2026-04-18",
        start: "2026-04-18T09:30:00.000Z",
        end: "2026-04-24T17:30:00.000Z",
        status: "completed",
        notes: "Spring stay",
        createdAt: "2026-04-24T17:31:00.000Z"
      },
      {
        id: "bubbles-2026-05-04",
        start: "2026-05-04T09:30:00.000Z",
        end: "2026-05-08T17:30:00.000Z",
        status: "planned",
        notes: "Upcoming May stay",
        createdAt: "2026-04-24T19:40:00.000Z"
      }
    ]
  }
};
const ADMIN_PASSCODE = "amy-admin";
const UI_STATE_KEY = "flausch_ui_state";
let isAdmin = false;
let activePetCodeword = "";

function fmtMoney(n) {
  return `${Number(n).toFixed(2)} EUR`;
}

function fmtDate(d) {
  return d.toLocaleString();
}

function daysBetween(a, b) {
  return (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24);
}

function computeCurrentAge(customer) {
  const baseAge = Number(customer?.ageReferenceYears);
  const refRaw = customer?.ageReferenceDate;
  if (!Number.isFinite(baseAge) || !refRaw) return "Unknown";
  const ref = new Date(refRaw);
  if (Number.isNaN(ref.getTime())) return String(baseAge);
  const now = new Date();
  let years = now.getFullYear() - ref.getFullYear();
  const passedAnniversary =
    now.getMonth() > ref.getMonth() ||
    (now.getMonth() === ref.getMonth() && now.getDate() >= ref.getDate());
  if (!passedAnniversary) years -= 1;
  return String(baseAge + Math.max(0, years));
}

function escAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function hydrateCustomerProfile(customer, codeword) {
  const key = (codeword || customer?.petCodeword || "").toLowerCase();
  const defaults = DEFAULT_PET_PROFILE_DETAILS[key] || {};
  const fromSaved = (customer && String(customer.profileImage || "").trim()) || "";
  return {
    ...defaults,
    ...(customer || {}),
    petCodeword: key || customer?.petCodeword || "",
    petDisplayName: customer?.petDisplayName || defaults.petDisplayName || key || "Pet",
    customerName: customer?.customerName || defaults.customerName || "Unknown pet parent",
    profileImage: fromSaved || (defaults.profileImage && String(defaults.profileImage).trim()) || ""
  };
}

function readUiState() {
  try {
    return JSON.parse(localStorage.getItem(UI_STATE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeUiState(patch) {
  const current = readUiState();
  localStorage.setItem(UI_STATE_KEY, JSON.stringify({ ...current, ...patch }));
}

async function hasKnownPetProfile(codewordRaw) {
  const key = (codewordRaw || "").trim().toLowerCase();
  if (!key) return false;
  const customer = await getCustomerByCodeword(key);
  return Boolean(customer || DEFAULT_PET_PROFILE_DETAILS[key] || LEGACY_PET_PROFILES[key]);
}

function setAdminFormValues(customer) {
  byId("customerName").value = customer?.customerName || "";
  byId("petCodeword").value = customer?.petCodeword || "";
  byId("petDisplayName").value = customer?.petDisplayName || "";
  byId("baseProfile").value = String(customer?.baseProfile ?? 40);
  byId("petAgeYears").value = Number.isFinite(Number(customer?.ageReferenceYears))
    ? String(customer.ageReferenceYears)
    : "";
  byId("defaultCompanyNeed").checked = Boolean(customer?.defaultCompanyNeed);
  byId("ownerEmail").value = customer?.ownerEmail || "";
  byId("ownerPhone").value = customer?.ownerPhone || "";
  byId("emergencyPhone").value = customer?.emergencyPhone || "";
  byId("vetAddress").value = customer?.vetAddress || "";
  byId("petLikes").value = customer?.likes || "";
  byId("petDislikes").value = customer?.dislikes || "";
  byId("petAllergies").value = customer?.allergies || "";
  byId("petFriends").value = customer?.friends || "";
  byId("petMedicalNeeds").value = customer?.medicalNeeds || "";
  byId("petMedicalHistory").value = customer?.medicalHistory || "";
  byId("petProfileImage").value = customer?.profileImage || "";
}

function resolveCurrentPetCodeword() {
  const petFromHash = window.location.hash.replace(/^#pet\//, "").trim();
  if (petFromHash) return decodeURIComponent(petFromHash).toLowerCase();
  const typed = byId("petName")?.value?.trim().toLowerCase();
  if (typed) return typed;
  if (activePetCodeword) return activePetCodeword;
  const ui = readUiState();
  return (ui.lastPetCodeword || "").toLowerCase();
}

async function prefillAdminFormForCurrentPet() {
  const codeword = resolveCurrentPetCodeword();
  if (!codeword) {
    setAdminFormValues(null);
    return;
  }
  const saved = await getCustomerByCodeword(codeword);
  const hydrated = hydrateCustomerProfile(
    saved || { petCodeword: codeword, customerName: "" },
    codeword
  );
  setAdminFormValues(hydrated);
}

async function renderAccount(codeword) {
  const snap = await getAccountSnapshot(codeword);
  byId("accountOutput").textContent = JSON.stringify(snap, null, 2);
}

async function updatePetAccountButton(petNameRaw) {
  const petName = (petNameRaw || "").trim();
  const customer = await getCustomerByCodeword(petName);
  const accountBtn = byId("viewPetAccountBtn");

  if (await hasKnownPetProfile(petName)) {
    activePetCodeword = (customer?.petCodeword || petName).toLowerCase();
    accountBtn.textContent = `Check out ${activePetCodeword}'s account`;
    accountBtn.classList.remove("hidden");
    return;
  }

  activePetCodeword = "";
  accountBtn.classList.add("hidden");
}

async function updateCompanyQuestionVisibility(petNameRaw) {
  const petName = (petNameRaw || "").trim();
  const knownProfile = await hasKnownPetProfile(petName);
  const question = byId("companyNeedQuestion");
  const knownNote = byId("companyNeedKnownNote");
  question.classList.toggle("hidden", knownProfile);
  knownNote.classList.toggle("hidden", !knownProfile);
}

async function syncCalculatorOwnerFromPet(petNameRaw) {
  const petName = (petNameRaw || "").trim();
  const ownerField = byId("petParentName");
  const customer = await getCustomerByCodeword(petName);
  if (customer) {
    ownerField.value = customer.customerName || "";
    ownerField.readOnly = true;
    ownerField.title = "Autofilled from saved pet profile";
  } else {
    if (ownerField.readOnly) ownerField.value = "";
    ownerField.readOnly = false;
    ownerField.title = "";
  }
}

function togglePetPageMode(showPetPage) {
  const sections = Array.from(document.querySelectorAll("main > section.card"));
  sections.forEach((section) => {
    if (section.id === "petAccountPage") return;
    section.classList.toggle("hidden", showPetPage);
  });
  byId("petAccountPage").classList.toggle("hidden", !showPetPage);
}

async function openPetAccountPage(codewordRaw, pushHash = true) {
  const codeword = (codewordRaw || "").trim().toLowerCase();
  if (!codeword || !(await hasKnownPetProfile(codeword))) return;
  activePetCodeword = codeword;
  writeUiState({ lastPetCodeword: codeword });

  const snap = await getAccountSnapshot(activePetCodeword);
  const customer = hydrateCustomerProfile(
    snap.customer || { customerName: "Unknown pet parent", petCodeword: activePetCodeword },
    activePetCodeword
  );
  const displayName = (customer.petDisplayName || customer.petCodeword || "").toUpperCase();
  const profileSrc = (customer.profileImage || "").trim();
  const avatarBlock = profileSrc
    ? `<img class="account-avatar" src="${escAttr(profileSrc)}" alt="${escAttr(
        customer.petDisplayName || customer.petCodeword || "Pet"
      )} portrait" />`
    : '<div class="account-avatar" aria-hidden="true">🐾</div>';
  const currentAge = computeCurrentAge(customer);
  const detailRows = [
    { label: "Age", value: currentAge === "Unknown" ? "Unknown" : `${currentAge} years` },
    { label: "Likes", value: customer.likes || "Not listed yet" },
    { label: "Dislikes", value: customer.dislikes || "Not listed yet" },
    { label: "Allergies", value: customer.allergies || "None listed" },
    { label: "Friends", value: customer.friends || "None listed" },
    { label: "Constant company", value: customer.defaultCompanyNeed ? "Yes" : "No" },
    { label: "Vet address", value: customer.vetAddress || "Not listed yet" },
    { label: "Medical needs", value: customer.medicalNeeds || "None listed" },
    { label: "Medical history", value: customer.medicalHistory || "None listed" }
  ];
  if (isAdmin) {
    detailRows.push(
      { label: "Owner phone", value: customer.ownerPhone || "Not listed yet" },
      { label: "Emergency contact", value: customer.emergencyPhone || "Not listed yet" }
    );
  }
  const detailsHtml = detailRows.map((row) => `<div class="metric-card"><span>${row.label}</span><strong>${row.value}</strong></div>`).join("");

  const timelineStartTs = new Date("2026-01-01T00:00:00.000Z").getTime();
  const mergedStays = [...(DEFAULT_PET_PROFILE_DETAILS[codeword]?.stays || []), ...(snap.stays || [])];
  const uniqueStayMap = new Map();
  mergedStays.forEach((stay) => uniqueStayMap.set(stay.id || `${stay.start}-${stay.end}`, stay));
  const filteredStays = [...uniqueStayMap.values()].filter((stay) => new Date(stay.end || stay.start).getTime() >= timelineStartTs);

  const stayEvents = filteredStays.map((stay) => ({
    ts: new Date(stay.start || stay.createdAt || Date.now()).getTime(),
    chip: stay.status === "planned" ? "Planned stay" : "Completed stay",
    html: `
      <article class="timeline-card">
        <div class="feed-card-header">
          <strong>${stay.status === "planned" ? "Planned stay" : "Completed stay"}</strong>
          <span>${new Date(stay.start).toLocaleString()}</span>
        </div>
        <div>${new Date(stay.start).toLocaleString()} -> ${new Date(stay.end).toLocaleString()}</div>
        ${stay.notes ? `<div>Notes: ${stay.notes}</div>` : ""}
        <div class="timeline-photo-row">
          <div class="timeline-photo-placeholder">PHOTO</div>
          <div class="timeline-photo-placeholder">PHOTO</div>
          <div class="timeline-photo-placeholder">PHOTO</div>
        </div>
      </article>
    `
  }));
  const ledgerEvents = (snap.ledger || [])
    .filter((entry) => new Date(entry.at).getTime() >= timelineStartTs)
    .map((entry) => ({
    ts: new Date(entry.at).getTime(),
    chip: "Payment",
    html: `
      <article class="timeline-card">
        <div class="feed-card-header">
          <strong>Payment update</strong>
          <span>${new Date(entry.at).toLocaleString()}</span>
        </div>
        <div>Invoice: ${fmtMoney(entry.invoiceAmount)} | Paid: ${fmtMoney(entry.paidAmount)}</div>
        <div>Balance change: ${fmtMoney(entry.delta)} | Running balance: ${fmtMoney(entry.balanceAfter)}</div>
      </article>
    `
  }));
  const timelineEvents = [...stayEvents, ...ledgerEvents].sort((a, b) => a.ts - b.ts);
  const laneMap = new Map();
  for (const event of timelineEvents) {
    const d = new Date(event.ts);
    const year = d.getFullYear();
    const half = d.getMonth() < 6 ? 1 : 2;
    const key = `${year}-H${half}`;
    if (!laneMap.has(key)) {
      const laneStart = new Date(year, half === 1 ? 0 : 6, 1).getTime();
      const laneEnd = new Date(year, half === 1 ? 6 : 12, 1).getTime();
      laneMap.set(key, { key, year, half, laneStart, laneEnd, items: [] });
    }
    laneMap.get(key).items.push(event);
  }

  const laneHtml = [...laneMap.values()]
    .sort((a, b) => a.laneStart - b.laneStart)
    .map((lane) => {
      const ticks = lane.half === 1
        ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]
        : ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const cards = lane.items.map((event) => {
        const percent = ((event.ts - lane.laneStart) / (lane.laneEnd - lane.laneStart)) * 100;
        const left = Math.max(0, Math.min(98, percent));
        const eventId = `evt-${Math.round(event.ts)}-${Math.random().toString(36).slice(2, 6)}`;
        return `
          <div class="timeline-h-event" style="left:${left}%;">
            <div class="timeline-h-dot"></div>
            <button class="timeline-chip" type="button" data-event-id="${eventId}">${event.chip}</button>
            <div class="timeline-h-card hidden" id="${eventId}">${event.html}</div>
          </div>
        `;
      }).join("");

      return `
        <div class="timeline-h-lane">
          <div class="timeline-h-label">${lane.year} H${lane.half}</div>
          <div class="timeline-h-track-wrap">
            <div class="timeline-h-track"></div>
            <div class="timeline-h-ticks">
              ${ticks.map((t) => `<span>${t}</span>`).join("")}
            </div>
            <div class="timeline-h-events">${cards}</div>
          </div>
        </div>
      `;
    }).join("");

  byId("petAccountPageContent").innerHTML = `
    <div class="account-header">
      ${avatarBlock}
      <div class="account-header-body">
        <h2 class="account-name-title title-blue">${displayName}</h2>
        <p>Pet parent: ${customer.customerName}</p>
      </div>
    </div>
    <h3 class="title-standard title-blue">Profile</h3>
    <div class="account-metrics">${detailsHtml}</div>
    <h3 class="title-standard title-orange">Timeline</h3>
    <div class="timeline-shell">
      <div class="timeline-start-label">Timeline start: 01 Jan 2026</div>
      ${laneHtml || '<article class="timeline-card"><p>No timeline events recorded yet.</p></article>'}
    </div>
  `;

  togglePetPageMode(true);
  if (pushHash) window.location.hash = `pet/${encodeURIComponent(codeword)}`;

  byId("petAccountPageContent").querySelectorAll(".timeline-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const id = chip.getAttribute("data-event-id");
      const card = byId(id);
      if (!card) return;
      card.classList.toggle("hidden");
    });
  });
}

function closePetAccountPage(pushHash = true) {
  togglePetPageMode(false);
  if (pushHash) window.location.hash = "";
}

byId("calcBtn").addEventListener("click", async () => {
  const petName = byId("petName").value.trim();
  const ownerInput = byId("petParentName").value.trim();
  const discountCode = byId("discountCode").value.trim().toLowerCase();
  const customer = await getCustomerByCodeword(petName);
  const hydrated = hydrateCustomerProfile(customer || { petCodeword: petName }, petName);
  const knownProfile = await hasKnownPetProfile(petName);
  const ownerName = customer?.customerName || ownerInput;
  const baseline =
    hydrated?.baseProfile ||
    LEGACY_PET_PROFILES[petName.toLowerCase()] ||
    DISCOUNT_CODE_BASELINES[discountCode] ||
    40;
  const dropoff = new Date(byId("dropoff").value);
  const pickup = new Date(byId("pickup").value);
  const constantCompany = knownProfile
    ? Boolean(hydrated.defaultCompanyNeed)
    : Boolean(byId("companyChoiceC")?.checked);
  const now = new Date();
  const isFutureEstimate = dropoff > now && pickup > now;
  const daysUntilStart = isFutureEstimate ? daysBetween(now, dropoff) : Infinity;
  const withinFortyEightHours = isFutureEstimate && daysUntilStart <= 2;
  const withinSevenDays = isFutureEstimate && daysUntilStart <= 7;
  const lastMinuteSurcharge = withinFortyEightHours ? 10 : (withinSevenDays ? 5 : 0);
  const calcModeMessage = byId("calcModeMessage");
  const bookRequestBtn = byId("bookRequestBtn");
  const bookingFormWrap = byId("bookingRequestFormWrap");

  try {
    const quote = quoteStay({ dropoff, pickup, baseline, constantCompany });
    const greetingName = ownerName || "pet parent";
    const lines = [
      `Hi ${greetingName}, here is the breakdown for ${petName || "your pet"}'s stay.`,
      "",
      `Drop-off: ${fmtDate(dropoff)}`,
      `Pick-up: ${fmtDate(pickup)}`,
      "",
      "Blocks:"
    ];
    if (isAdmin) lines.splice(1, 0, `Profile baseline: ${fmtMoney(baseline)}`);
    quote.plan.items.forEach((item) => {
      lines.push(`- ${item.type}: ${fmtDate(item.start)} -> ${fmtDate(item.end)} = ${fmtMoney(item.cost)}`);
    });
    lines.push(
      "",
      `Early surcharge: ${fmtMoney(quote.surcharges.early)}`,
      `Late drop-off surcharge: ${fmtMoney(quote.surcharges.lateDropoff)}`,
      `Seasonal surcharge: ${fmtMoney(quote.surcharges.seasonal)}`,
      `Constant-company surcharge: ${fmtMoney(quote.surcharges.constantCompanyFee)}`,
      `Last-minute surcharge: ${fmtMoney(lastMinuteSurcharge)}`,
      `Total: ${fmtMoney(quote.total + lastMinuteSurcharge)}`,
      "",
      knownProfile && petName
        ? `Thanks for trusting me with caring for ${petName}.`
        : ownerName
          ? `Thanks for your interest in my services, ${ownerName}.`
          : "Thanks for your interest in my services.",
      "Amy"
    );
    byId("quoteOutput").textContent = lines.join("\n");
    byId("quoteOutput").classList.remove("hidden");
    if (isFutureEstimate) {
      calcModeMessage.textContent = withinFortyEightHours
        ? "This is a future estimate and includes a last-minute booking surcharge (+10 EUR) because the stay starts within 48 hours."
        : withinSevenDays
          ? "This is a future estimate and includes a short-notice surcharge (+5 EUR) because the stay starts within 7 days."
          : "This is a future estimate. If you would like to proceed, send a booking request.";
      bookRequestBtn.classList.remove("hidden");
      bookRequestBtn.onclick = () => {
        bookingFormWrap.classList.remove("hidden");
        bookRequestBtn.classList.add("hidden");
        byId("quoteOutput").classList.add("hidden");
        byId("bookingName").value = ownerName;
        byId("bookingEmail").value = customer?.ownerEmail || "";
        byId("bookingPet").value = petName || "";
        byId("bookingDropoff").value = fmtDate(dropoff);
        byId("bookingPickup").value = fmtDate(pickup);
        byId("bookingEstimate").value = fmtMoney(quote.total + lastMinuteSurcharge);
        byId("bookingMessage").value = [
          "Hi Amy,",
          "",
          `I'd like to book a stay for ${petName || "my pet"}.`,
          `Drop-off: ${fmtDate(dropoff)}`,
          `Pick-up: ${fmtDate(pickup)}`,
          "",
          "Thank you!"
        ].join("\n");
        bookingFormWrap.scrollIntoView({ behavior: "smooth", block: "start" });
      };
    } else {
      calcModeMessage.textContent = "This calculation is treated as payment-oriented for a past/current stay.";
      bookRequestBtn.classList.add("hidden");
      bookRequestBtn.onclick = null;
      bookingFormWrap.classList.add("hidden");
      byId("quoteOutput").classList.remove("hidden");
    }

    await updatePetAccountButton(petName);
  } catch (err) {
    byId("quoteOutput").textContent = `Error: ${err.message}`;
    byId("quoteOutput").classList.remove("hidden");
    calcModeMessage.textContent = "";
    bookRequestBtn.classList.add("hidden");
    bookRequestBtn.onclick = null;
    bookingFormWrap.classList.add("hidden");
  }
});

byId("backToEstimateBtn").addEventListener("click", () => {
  byId("bookingRequestFormWrap").classList.add("hidden");
  byId("quoteOutput").classList.remove("hidden");
  if (byId("calcModeMessage").textContent.toLowerCase().includes("future estimate")) {
    byId("bookRequestBtn").classList.remove("hidden");
  }
  byId("quoteOutput").scrollIntoView({ behavior: "smooth", block: "start" });
});

byId("viewPetAccountBtn").addEventListener("click", async () => {
  if (!activePetCodeword) return;
  await openPetAccountPage(activePetCodeword, true);
});

byId("closePetAccountBtn").addEventListener("click", () => {
  closePetAccountPage(true);
  byId("calculator").scrollIntoView({ behavior: "smooth", block: "start" });
});

byId("saveCustomerBtn").addEventListener("click", async () => {
  const customerName = byId("customerName").value.trim();
  const petCodeword = byId("petCodeword").value.trim();
  const petDisplayName = byId("petDisplayName").value.trim();
  const baseProfile = byId("baseProfile").value;
  const ageYears = byId("petAgeYears").value;
  const defaultCompanyNeed = byId("defaultCompanyNeed").checked;
  const ownerEmail = byId("ownerEmail").value.trim();
  const ownerPhone = byId("ownerPhone").value.trim();
  const emergencyPhone = byId("emergencyPhone").value.trim();
  const vetAddress = byId("vetAddress").value.trim();
  const likes = byId("petLikes").value.trim();
  const dislikes = byId("petDislikes").value.trim();
  const allergies = byId("petAllergies").value.trim();
  const friends = byId("petFriends").value.trim();
  const medicalNeeds = byId("petMedicalNeeds").value.trim();
  const medicalHistory = byId("petMedicalHistory").value.trim();
  const profileImage = byId("petProfileImage").value.trim();
  if (!customerName || !petCodeword) {
    byId("accountOutput").textContent = "Please provide customer name and pet codeword.";
    return;
  }
  await upsertCustomer({
    customerName,
    petCodeword,
    petDisplayName,
    baseProfile,
    ageYears,
    defaultCompanyNeed,
    ownerEmail,
    ownerPhone,
    emergencyPhone,
    vetAddress,
    likes,
    dislikes,
    allergies,
    friends,
    medicalNeeds,
    medicalHistory,
    profileImage
  });
  writeUiState({ lastPetCodeword: petCodeword.toLowerCase() });
  await renderAccount(petCodeword);
});

byId("addLedgerBtn").addEventListener("click", async () => {
  const petCodeword = byId("petCodeword").value.trim() || byId("petName").value.trim();
  const invoiceAmount = Number(byId("invoiceAmount").value);
  const paidAmount = Number(byId("paidAmount").value);
  if (!petCodeword || Number.isNaN(invoiceAmount) || Number.isNaN(paidAmount)) {
    byId("accountOutput").textContent = "Provide codeword + numeric invoice and paid amounts.";
    return;
  }
  await addLedgerEntry(petCodeword, invoiceAmount, paidAmount);
  await renderAccount(petCodeword);
});

byId("addStayBtn").addEventListener("click", async () => {
  const petCodeword = byId("petCodeword").value.trim() || byId("petName").value.trim();
  const start = byId("stayStart").value;
  const end = byId("stayEnd").value;
  const status = byId("stayStatus").value;
  const notes = byId("stayNotes").value.trim();
  if (!petCodeword || !start || !end) {
    byId("accountOutput").textContent = "Provide pet codeword, stay start and stay end.";
    return;
  }
  await addStay(petCodeword, {
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    status,
    notes
  });
  byId("accountOutput").textContent = `Stay added for ${petCodeword}.`;
  if (activePetCodeword && activePetCodeword === petCodeword.toLowerCase() && !byId("petAccountPage").classList.contains("hidden")) {
    await openPetAccountPage(activePetCodeword, false);
  }
});

byId("redeemPortraitBtn").addEventListener("click", async () => {
  const petCodeword = byId("petCodeword").value.trim();
  const out = await redeemReward(petCodeword, "portrait50");
  byId("accountOutput").textContent = JSON.stringify(out, null, 2);
  await renderAccount(petCodeword);
});

byId("redeemFreeDaysBtn").addEventListener("click", async () => {
  const petCodeword = byId("petCodeword").value.trim();
  const out = await redeemReward(petCodeword, "free2days");
  byId("accountOutput").textContent = JSON.stringify(out, null, 2);
  await renderAccount(petCodeword);
});

(() => {
  const now = new Date();
  const start = new Date(now.getTime() + 2 * 3600000);
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 24 * 3600000);
  const fmtInput = (d) => {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  byId("dropoff").value = fmtInput(start);
  byId("pickup").value = fmtInput(end);
})();

byId("petName").addEventListener("change", async () => {
  const petName = byId("petName").value.trim();
  await syncCalculatorOwnerFromPet(petName);
  await updateCompanyQuestionVisibility(petName);
  await updatePetAccountButton(petName);
});

byId("petName").addEventListener("input", async () => {
  const petName = byId("petName").value;
  await syncCalculatorOwnerFromPet(petName);
  await updateCompanyQuestionVisibility(petName);
  await updatePetAccountButton(petName);
});

byId("adminUnlockBtn").addEventListener("click", async () => {
  const input = byId("adminPasscode").value;
  if (input !== ADMIN_PASSCODE) {
    byId("adminState").textContent = "Wrong passcode. Admin mode is locked.";
    return;
  }
  isAdmin = true;
  writeUiState({ adminUnlocked: true });
  byId("admin").classList.remove("hidden");
  byId("adminState").textContent = "Admin mode unlocked.";
  byId("adminPasscode").value = "";
  if (!byId("petAccountPage").classList.contains("hidden") && activePetCodeword) {
    await openPetAccountPage(activePetCodeword, false);
  }
});

byId("adminOpenBtn").addEventListener("click", async () => {
  byId("adminPanel").classList.remove("hidden");
  await prefillAdminFormForCurrentPet();
});

byId("adminCloseBtn").addEventListener("click", () => {
  byId("adminPanel").classList.add("hidden");
});

window.addEventListener("hashchange", async () => {
  const hash = window.location.hash.replace(/^#/, "");
  if (hash.startsWith("pet/")) {
    await openPetAccountPage(decodeURIComponent(hash.slice(4)), false);
    return;
  }
  closePetAccountPage(false);
});

(async () => {
  const ui = readUiState();
  if (ui.adminUnlocked) {
    isAdmin = true;
    byId("admin").classList.remove("hidden");
    byId("adminState").textContent = "Admin mode unlocked.";
  }

  const hash = window.location.hash.replace(/^#/, "");
  if (hash.startsWith("pet/")) {
    await openPetAccountPage(decodeURIComponent(hash.slice(4)), false);
  } else {
    closePetAccountPage(false);
  }
  await syncCalculatorOwnerFromPet(byId("petName")?.value || "");
  await updateCompanyQuestionVisibility(byId("petName")?.value || "");
  await updatePetAccountButton(byId("petName")?.value || "");
})();
