import {
  formatPawPointsDisplay,
  fullRewardsUnlockedCount,
  pawPointsRemainingUntilNextReward,
  progressTowardNextReward,
  PAWS_PER_REWARD
} from "./pawPoints.js";
import {
  buildQuoteBreakdown,
  calcModeMessage as getCalcModeMessageText,
  defaultBookingRequestMessage,
  formatMedicalNeedsSurchargeLine,
  normalizeQuoteLanguage
} from "./quoteMessages.js";
import { quoteStay, petHasMedicalNeedsFromProfile } from "./pricingEngine.js";
import { DEFAULT_PET_PROFILE_DETAILS } from "./petDefaults.js";
import {
  addLedgerEntry,
  addStay,
  getAccountSnapshot,
  getCustomerByCodeword,
  markStayPaid,
  pickCustomerNameParts,
  redeemReward,
  seedMissingBuiltInPetsInCloud,
  upsertCustomer
} from "./storage.js";

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
const ADMIN_PASSCODE = "amy-admin";
const UI_STATE_KEY = "flausch_ui_state";
let isAdmin = false;
let activePetCodeword = "";

function fmtMoney(n) {
  return `${Number(n).toFixed(2)} EUR`;
}

function resolveQuoteLanguage(customer, hydrated) {
  return normalizeQuoteLanguage(customer?.quoteLanguage ?? hydrated?.quoteLanguage);
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

function stayGalleryManifestUrl(codeword, stayId) {
  const cw = encodeURIComponent(codeword);
  const id = encodeURIComponent(stayId);
  return `./assets/pets/${cw}/stays/${id}/photos.json`;
}

function calculatorTotalForStay(customer, codewordLower, stay) {
  const baseline =
    Number(customer?.baseProfile) ||
    LEGACY_PET_PROFILES[codewordLower] ||
    40;
  const dropoff = new Date(stay.start);
  const pickup = new Date(stay.end);
  const quote = quoteStay({
    dropoff,
    pickup,
    baseline,
    constantCompany: Boolean(customer?.defaultCompanyNeed),
    medicalNeeds: petHasMedicalNeedsFromProfile(customer)
  });
  return { quote, baseline };
}

function wireStayMarkPaidButtons(container, codewordLower, customer) {
  if (!isAdmin || !container) return;
  container.querySelectorAll("button[data-stay-mark-paid]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const stayIdAttr = btn.getAttribute("data-stay-db-id");
      if (!stayIdAttr) return;
      const start = btn.getAttribute("data-stay-start");
      const end = btn.getAttribute("data-stay-end");
      if (!start || !end) return;
      const stay = { start, end };
      let quoteResult;
      try {
        quoteResult = calculatorTotalForStay(customer, codewordLower, stay);
      } catch (e) {
        window.alert(
          `Could not calculate a price for these dates: ${(e && e.message) || String(e)}`
        );
        return;
      }
      const { quote } = quoteResult;
      const amount = Math.round(quote.total * 100) / 100;
      const summary = [
        `Calculator total for this stay: ${fmtMoney(amount)}`,
        `(baseline ${fmtMoney(quote.baseline)}, constant-company fee ${fmtMoney(
          quote.surcharges.constantCompanyFee
        )}, ${formatMedicalNeedsSurchargeLine(resolveQuoteLanguage(customer, customer), quote.surcharges)} — same rules as the stay calculator, no last‑minute booking surcharge.)`,
        "",
        `Mark this stay paid with invoice and paid both ${fmtMoney(amount)}?`,
        "That records payment on the stay and adds Paw Points (€10 of invoice amount → 1 Paw Point). It does not change whether the stay shows as ongoing or completed on the timeline."
      ].join("\n");
      if (!window.confirm(summary)) return;
      btn.disabled = true;
      try {
        await markStayPaid(codewordLower, stayIdAttr, amount, amount);
        await openPetAccountPage(codewordLower, false);
      } catch (err) {
        window.alert(`Could not save payment: ${(err && err.message) || String(err)}`);
        btn.disabled = false;
      }
    });
  });
}

async function hydrateStayPhotoGalleries() {
  const container = byId("petAccountPageContent");
  if (!container) return;
  const rows = container.querySelectorAll(".timeline-photo-gallery[data-stay-id]");
  for (const row of rows) {
    const cw = row.getAttribute("data-stay-codeword");
    const stayId = row.getAttribute("data-stay-id");
    if (!cw || !stayId) continue;
    try {
      const res = await fetch(stayGalleryManifestUrl(cw, stayId), { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      const imgs = Array.isArray(data.images) ? data.images : [];
      if (!imgs.length) {
        row.innerHTML =
          '<p class="timeline-photo-hint timeline-photo-hint-span">No photos yet. Drop images into this stay\'s folder, then run <code>npm run stay:photos</code> and refresh.</p>';
        continue;
      }
      row.innerHTML = imgs
        .slice(0, 24)
        .map(
          (src) =>
            `<div class="timeline-photo-thumb"><img src="${escAttr(src)}" alt="" loading="lazy" /></div>`
        )
        .join("");
    } catch {
      row.innerHTML =
        '<p class="timeline-photo-hint timeline-photo-hint-span">Gallery not ready. Run <code>npm run stay:dirs</code>, add photos to <code>assets/pets/…/stays/…/</code>, then <code>npm run stay:photos</code>.</p>';
    }
  }
}

function formatGreetingNames(names) {
  if (!names || !names.length) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return names.join(" and ");
}

function resolveCalculatorBaseline(hydrated, codewordLower, discountCode) {
  const fromProfile = Number(hydrated?.baseProfile);
  if (Number.isFinite(fromProfile) && fromProfile > 0) return fromProfile;
  const legacy = LEGACY_PET_PROFILES[codewordLower];
  if (Number.isFinite(legacy) && legacy > 0) return legacy;
  const fromCode = DISCOUNT_CODE_BASELINES[discountCode];
  if (Number.isFinite(fromCode) && fromCode > 0) return fromCode;
  return 40;
}

function petParentHeadingHtml(customer) {
  const names = pickCustomerNameParts(customer);
  const label = names.length > 1 ? "Pet parents" : "Pet parent";
  const value = names.join(" & ");
  return `${escAttr(label)}: ${escAttr(value)}`;
}

/**
 * So empty `customerName` / [] `customerNames` from the API does not wipe the in-app defaults
 * for a codeword (e.g. Bubbles + "Asli" in `DEFAULT_PET_PROFILE_DETAILS`).
 */
function omitEmptyNameFields(c) {
  if (!c || typeof c !== "object") return c;
  const out = { ...c };
  if (String(out.customerName ?? "").trim() === "") {
    delete out.customerName;
  }
  if (Array.isArray(out.customerNames) && out.customerNames.length === 0) {
    delete out.customerNames;
  }
  return out;
}

function hydrateCustomerProfile(customer, codeword) {
  const key = (codeword || customer?.petCodeword || "").toLowerCase();
  const defaults = DEFAULT_PET_PROFILE_DETAILS[key] || {};
  const fromSaved = (customer && String(customer.profileImage || "").trim()) || "";
  const c = omitEmptyNameFields(customer);
  const merged = { ...defaults, ...c, petCodeword: key || customer?.petCodeword || "" };
  const nameParts = pickCustomerNameParts(merged);
  return {
    ...defaults,
    ...(customer || {}),
    petCodeword: key || customer?.petCodeword || "",
    petDisplayName: customer?.petDisplayName || defaults.petDisplayName || key || "Pet",
    customerNames: nameParts,
    customerName: nameParts.join(" & "),
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
  const nameParts = pickCustomerNameParts(customer);
  byId("customerName").value = nameParts[0] || "";
  byId("customerName2").value = nameParts[1] || "";
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
  byId("quoteLanguage").value = normalizeQuoteLanguage(customer?.quoteLanguage);
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
    saved || { petCodeword: codeword },
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
  if (!petName) {
    if (ownerField.readOnly) ownerField.value = "";
    ownerField.readOnly = false;
    ownerField.title = "";
    return;
  }
  const customer = await getCustomerByCodeword(petName);
  const hydrated = hydrateCustomerProfile(
    customer ? omitEmptyNameFields(customer) : { petCodeword: petName },
    petName
  );
  const line = pickCustomerNameParts(hydrated)
    .filter((n) => n && n !== "Unknown pet parent")
    .join(" & ");
  if (line) {
    ownerField.value = line;
    ownerField.readOnly = Boolean(customer);
    ownerField.title = customer
      ? "Autofilled from saved pet profile"
      : "From built-in profile defaults; you can still edit for this quote.";
  } else {
    if (ownerField.readOnly) ownerField.value = "";
    ownerField.readOnly = false;
    ownerField.title = "";
  }
}

function buildPawPointsPanelHtml(totalPawsRaw) {
  const p = Number(totalPawsRaw) || 0;
  const display = formatPawPointsDisplay(p);
  const unlocked = fullRewardsUnlockedCount(p);
  const remaining = pawPointsRemainingUntilNextReward(p);
  const progressPct = Math.min(100, Math.round(progressTowardNextReward(p) * 100));
  const unlockedMsg =
    unlocked >= 1
      ? `<p class="paw-points-unlocked"><strong>Reward unlocked!</strong> Choose either €50 off a custom pet portrait or one free day of pet sitting.</p>${
          unlocked > 1
            ? `<p class="paw-points-multi">You have <strong>${unlocked}</strong> thank-you rewards saved up — redeem one at a time.</p>`
            : ""
        }`
      : "";
  const untilMsg =
    remaining > 0
      ? `<p class="paw-points-until"><strong>${formatPawPointsDisplay(remaining)}</strong> Paw Points until your next reward.</p>`
      : unlocked >= 1
        ? `<p class="paw-points-until">Collect Paw Points toward your next thank-you reward.</p>`
        : "";

  return `
    <section class="paw-points-card" aria-labelledby="paw-points-heading">
      <h3 id="paw-points-heading" class="title-standard title-blue">Paw Points</h3>
      <p class="paw-points-lead">As a little thank-you for regular bookings, every €10 spent on pet sitting earns 1 Paw Point.</p>
      <p class="paw-points-total">You have <strong>${escAttr(display)}</strong> Paw Points.</p>
      ${untilMsg}
      ${unlockedMsg}
      <div class="paw-points-progress-wrap" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progressPct}" aria-label="Progress toward your next Paw Points reward">
        <div class="paw-points-progress-track">
          <div class="paw-points-progress-fill" style="width:${progressPct}%"></div>
        </div>
      </div>
      <p class="paw-points-foot muted-line">Paw Points come from completed bookings when you mark a stay paid (€10 of invoice → 1 Paw Point), or from optional manual ledger lines that aren’t tied to the timeline. Rewards can be redeemed once ${PAWS_PER_REWARD} Paw Points have been collected and cannot be exchanged for cash.</p>
    </section>
  `;
}

/** Timeline chip label: planned → ongoing while stay window includes “now”. */
function stayTimelinePresentation(stay, now = new Date()) {
  if (stay.status === "completed") {
    return { chip: "Completed stay", heading: "Completed stay", phase: "completed" };
  }
  const t = now.getTime();
  const start = new Date(stay.start).getTime();
  const end = new Date(stay.end).getTime();
  if (stay.status === "planned" && t >= start && t <= end) {
    return { chip: "Ongoing stay", heading: "Ongoing stay", phase: "ongoing" };
  }
  return { chip: "Planned stay", heading: "Planned stay", phase: "planned" };
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
    snap.customer
      ? omitEmptyNameFields(snap.customer)
      : { petCodeword: activePetCodeword },
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
  const uniqueStayMap = new Map();
  (snap.stays || []).forEach((stay) => uniqueStayMap.set(stay.id || `${stay.start}-${stay.end}`, stay));
  const filteredStays = [...uniqueStayMap.values()].filter((stay) => new Date(stay.end || stay.start).getTime() >= timelineStartTs);

  const dbStayIds = new Set((snap.stays || []).map((s) => s.id).filter(Boolean));

  const stayEvents = filteredStays.map((stay) => {
    const stayKey = stay.id || `${stay.start}-${stay.end}`;
    const pres = stayTimelinePresentation(stay);
    const stayPaid = Boolean(stay.paidAt);
    const stayRowInDb = Boolean(stay.id && dbStayIds.has(stay.id));
    const showCalculatorPaidBtn =
      isAdmin && stay.status === "completed" && stayRowInDb && !stayPaid;

    const markPaidHtml = showCalculatorPaidBtn
      ? `<div class="stay-mark-paid-wrap">
          <button type="button" class="stay-mark-paid-btn" data-stay-mark-paid data-stay-db-id="${escAttr(
            stay.id
          )}" data-stay-start="${escAttr(stay.start)}" data-stay-end="${escAttr(stay.end)}">
            Mark stay paid (Paw Points)
          </button>
          <p class="stay-mark-paid-hint">
            Uses this pet’s saved profile and the same pricing rules as the calculator (no short‑notice surcharge).
            If the amount differs from what you invoiced, use Admin → manual ledger line (without marking this stay paid).
          </p>
        </div>`
      : "";

    const missingStayHintHtml =
      isAdmin && stay.status === "completed" && stay.id && !stayRowInDb && !stayPaid
        ? `<p class="stay-mark-paid-hint">Marking paid requires this stay to exist in the database — add it in Admin with the same dates/status.</p>`
        : "";

    const galleryHtml =
      pres.phase === "completed"
        ? `<div class="timeline-photo-row timeline-photo-gallery" data-stay-codeword="${escAttr(
            codeword
          )}" data-stay-id="${escAttr(stayKey)}">
          <div class="timeline-photo-loading timeline-photo-loading-span">Loading gallery…</div>
        </div>`
        : pres.phase === "ongoing"
          ? `<div class="timeline-photo-row timeline-photo-row--planned">
          <p class="timeline-photo-hint">Photo gallery will be available after this stay is completed.</p>
        </div>`
          : `<div class="timeline-photo-row timeline-photo-row--planned">
          <p class="timeline-photo-hint">
            When this stay is completed, photos can live in
            <code>assets/pets/${escAttr(codeword)}/stays/${escAttr(stayKey)}/</code>
            — run <code>npm run stay:sync</code> after adding stays or images.
          </p>
        </div>`;
    const chipLabel = stayPaid ? `${pres.chip} · Paid` : pres.chip;
    const paidBadgeHtml = stayPaid
      ? `<span class="stay-paid-badge" title="Payment recorded on this stay — Paw Points counted">Paid</span>`
      : "";

    return {
      ts: new Date(stay.start || stay.createdAt || Date.now()).getTime(),
      chip: chipLabel,
      html: `
      <article class="timeline-card">
        <div class="feed-card-header">
          <span class="stay-feed-heading">
            <strong>${escAttr(pres.heading)}</strong>
            ${paidBadgeHtml}
          </span>
          <span>${new Date(stay.start).toLocaleString()}</span>
        </div>
        <div>${new Date(stay.start).toLocaleString()} -> ${new Date(stay.end).toLocaleString()}</div>
        ${stay.notes ? `<div>Notes: ${stay.notes}</div>` : ""}
        ${missingStayHintHtml}
        ${markPaidHtml}
        ${galleryHtml}
      </article>
    `
    };
  });
  const timelineEvents = [...stayEvents].sort((a, b) => a.ts - b.ts);
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
        <p>${petParentHeadingHtml(customer)}</p>
      </div>
    </div>
    <h3 class="title-standard title-blue">Profile</h3>
    <div class="account-metrics">${detailsHtml}</div>
    ${buildPawPointsPanelHtml(snap.rewards?.points ?? 0)}
    <h3 class="title-standard title-orange">Timeline</h3>
    <div class="timeline-shell">
      <div class="timeline-start-label">Timeline start: 01 Jan 2026</div>
      ${laneHtml || '<article class="timeline-card"><p>No timeline events recorded yet.</p></article>'}
    </div>
  `;

  togglePetPageMode(true);
  if (pushHash) window.location.hash = `pet/${encodeURIComponent(codeword)}`;

  const petPageContent = byId("petAccountPageContent");
  petPageContent.querySelectorAll(".timeline-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const id = chip.getAttribute("data-event-id");
      const card = byId(id);
      if (!card) return;
      const willOpen = card.classList.contains("hidden");
      petPageContent.querySelectorAll(".timeline-h-card").forEach((panel) => {
        panel.classList.add("hidden");
      });
      if (willOpen) card.classList.remove("hidden");
    });
  });

  await hydrateStayPhotoGalleries();
  wireStayMarkPaidButtons(byId("petAccountPageContent"), codeword, customer);
}

function closePetAccountPage(pushHash = true) {
  togglePetPageMode(false);
  if (pushHash) window.location.hash = "";
}

byId("calcBtn").addEventListener("click", async () => {
  const petName = byId("petName").value.trim();
  const petCodeword = petName.toLowerCase();
  const ownerInput = byId("petParentName").value.trim();
  const discountCode = byId("discountCode").value.trim().toLowerCase();
  const customer = await getCustomerByCodeword(petCodeword);
  const hydrated = hydrateCustomerProfile(customer || { petCodeword }, petCodeword);
  const knownProfile = await hasKnownPetProfile(petCodeword);
  const ownerName = formatGreetingNames(pickCustomerNameParts(hydrated)) || ownerInput;
  const baseline = resolveCalculatorBaseline(hydrated, petCodeword, discountCode);
  const dropoff = new Date(byId("dropoff").value);
  const pickup = new Date(byId("pickup").value);
  const constantCompany = knownProfile
    ? Boolean(hydrated.defaultCompanyNeed)
    : Boolean(byId("companyChoiceC")?.checked);
  const medicalNeeds = Boolean(customer) && petHasMedicalNeedsFromProfile(hydrated);
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
    const quote = quoteStay({ dropoff, pickup, baseline, constantCompany, medicalNeeds });
    const quoteLang = resolveQuoteLanguage(customer, hydrated);
    const petLabel = hydrated.petDisplayName || petCodeword || petName;

    byId("quoteOutput").textContent = buildQuoteBreakdown({
      lang: quoteLang,
      greetingName: ownerName,
      petLabel,
      petCodeword,
      dropoff,
      pickup,
      quote,
      baseline,
      customer,
      medicalNeeds,
      isAdmin,
      lastMinuteSurcharge,
      knownProfile,
      ownerName,
      fmtDate
    });
    byId("quoteOutput").classList.remove("hidden");
    if (isFutureEstimate) {
      calcModeMessage.textContent = getCalcModeMessageText(quoteLang, {
        withinFortyEightHours,
        withinSevenDays,
        isFutureEstimate
      });
      bookRequestBtn.classList.remove("hidden");
      bookRequestBtn.onclick = () => {
        bookingFormWrap.classList.remove("hidden");
        bookRequestBtn.classList.add("hidden");
        byId("quoteOutput").classList.add("hidden");
        byId("bookingName").value = ownerName;
        byId("bookingEmail").value = customer?.ownerEmail || "";
        byId("bookingPet").value = petLabel || petName || "";
        byId("bookingDropoff").value = fmtDate(dropoff);
        byId("bookingPickup").value = fmtDate(pickup);
        byId("bookingEstimate").value = fmtMoney(quote.total + lastMinuteSurcharge);
        byId("bookingMessage").value = defaultBookingRequestMessage(quoteLang, {
          petName: petLabel || petName,
          dropoff,
          pickup,
          fmtDate
        });
        bookingFormWrap.scrollIntoView({ behavior: "smooth", block: "start" });
      };
    } else {
      calcModeMessage.textContent = getCalcModeMessageText(quoteLang, {
        withinFortyEightHours,
        withinSevenDays,
        isFutureEstimate
      });
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
  if (activePetCodeword) byId("petName").value = activePetCodeword;
  byId("calculator").scrollIntoView({ behavior: "smooth", block: "start" });
});

byId("saveCustomerBtn").addEventListener("click", async () => {
  const n1 = byId("customerName").value.trim();
  const n2 = byId("customerName2").value.trim();
  const customerNames = [n1, n2].filter(Boolean);
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
  const quoteLanguage = byId("quoteLanguage").value;
  if (!customerNames.length || !petCodeword) {
    byId("accountOutput").textContent = "Please provide at least one pet parent name and a pet codeword.";
    return;
  }
  const customerName = customerNames.join(" & ");
  const { serverError } = await upsertCustomer({
    customerName,
    customerNames,
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
    profileImage,
    quoteLanguage
  });
  writeUiState({ lastPetCodeword: petCodeword.toLowerCase() });
  await renderAccount(petCodeword);
  if (!byId("petAccountPage").classList.contains("hidden")) {
    activePetCodeword = petCodeword.toLowerCase();
    await openPetAccountPage(activePetCodeword, false);
  }
  if (serverError) {
    window.alert(`Could not save to the server: ${serverError}`);
    const hint =
      "If the error mentions `customer_names` or a missing column, run the SQL in `db/migration_002_customer_names.sql` in the Neon console, then save again.\n\n";
    byId("accountOutput").textContent = `Server save failed: ${serverError}\n\n${hint}${byId("accountOutput").textContent}`;
    return;
  }
  byId("accountOutput").textContent = `Saved ${petCodeword} to the server.`;
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
  if (
    activePetCodeword &&
    petCodeword &&
    activePetCodeword === petCodeword.toLowerCase() &&
    !byId("petAccountPage").classList.contains("hidden")
  ) {
    await openPetAccountPage(activePetCodeword, false);
  }
});

byId("redeemFreeDaysBtn").addEventListener("click", async () => {
  const petCodeword = byId("petCodeword").value.trim();
  const out = await redeemReward(petCodeword, "free1day");
  byId("accountOutput").textContent = JSON.stringify(out, null, 2);
  await renderAccount(petCodeword);
  if (
    activePetCodeword &&
    petCodeword &&
    activePetCodeword === petCodeword.toLowerCase() &&
    !byId("petAccountPage").classList.contains("hidden")
  ) {
    await openPetAccountPage(activePetCodeword, false);
  }
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
  await seedMissingBuiltInPetsInCloud(DEFAULT_PET_PROFILE_DETAILS, LEGACY_PET_PROFILES);
  if (ui.adminUnlocked) {
    isAdmin = true;
    byId("admin").classList.remove("hidden");
    byId("adminState").textContent = "Admin mode unlocked.";
  }

  if (ui.lastPetCodeword && byId("petName") && !byId("petName").value.trim()) {
    byId("petName").value = ui.lastPetCodeword;
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
