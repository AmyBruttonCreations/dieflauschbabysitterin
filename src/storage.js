const KEY = "flausch_v1_data";

const initial = {
  customers: {},
  ledger: {},
  rewards: {},
  stays: {}
};

function read() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return structuredClone(initial);
  try {
    return { ...structuredClone(initial), ...JSON.parse(raw) };
  } catch {
    return structuredClone(initial);
  }
}

function write(data) {
  localStorage.setItem(KEY, JSON.stringify(data));
}

async function callApi(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!response.ok) {
    throw new Error(`API ${response.status}: ${path}`);
  }
  return response.json();
}

function localUpsertCustomer({
  customerName,
  petCodeword,
  baseProfile,
  defaultCompanyNeed = false,
  petDisplayName = "",
  ageYears = null,
  ownerEmail = "",
  ownerPhone = "",
  emergencyPhone = "",
  vetAddress = "",
  likes = "",
  dislikes = "",
  allergies = "",
  friends = "",
  medicalNeeds = "",
  medicalHistory = "",
  profileImage = ""
}) {
  const data = read();
  const key = petCodeword.toLowerCase();
  const previous = data.customers[key] || {};
  const parsedAgeYears = Number.isFinite(Number(ageYears)) ? Number(ageYears) : null;
  const ageReferenceDate = parsedAgeYears !== null
    ? (previous.ageReferenceDate || new Date().toISOString())
    : (previous.ageReferenceDate || null);

  data.customers[petCodeword.toLowerCase()] = {
    customerName,
    petCodeword: key,
    petDisplayName: (petDisplayName || "").trim() || key,
    baseProfile: Number(baseProfile),
    defaultCompanyNeed: Boolean(defaultCompanyNeed),
    ageReferenceYears: parsedAgeYears,
    ageReferenceDate,
    ownerEmail: (ownerEmail || "").trim(),
    ownerPhone: (ownerPhone || "").trim(),
    emergencyPhone: (emergencyPhone || "").trim(),
    vetAddress: (vetAddress || "").trim(),
    likes: (likes || "").trim(),
    dislikes: (dislikes || "").trim(),
    allergies: (allergies || "").trim(),
    friends: (friends || "").trim(),
    medicalNeeds: (medicalNeeds || "").trim(),
    medicalHistory: (medicalHistory || "").trim(),
    profileImage: (profileImage || "").trim()
  };
  if (!data.ledger[key]) data.ledger[key] = [];
  if (!data.rewards[key]) data.rewards[key] = { points: 0, redemptions: [] };
  write(data);
  return data.customers[key];
}

function localGetCustomerByCodeword(codeword) {
  const data = read();
  return data.customers[(codeword || "").toLowerCase()] || null;
}

function localAddLedgerEntry(codeword, invoiceAmount, paidAmount) {
  const data = read();
  const key = (codeword || "").toLowerCase();
  if (!data.ledger[key]) data.ledger[key] = [];
  const delta = Number(paidAmount) - Number(invoiceAmount);
  const prevBalance = data.ledger[key].reduce((sum, e) => sum + e.delta, 0);
  const newBalance = prevBalance + delta;
  const entry = {
    at: new Date().toISOString(),
    invoiceAmount: Number(invoiceAmount),
    paidAmount: Number(paidAmount),
    delta,
    balanceAfter: newBalance
  };
  data.ledger[key].push(entry);
  if (!data.rewards[key]) data.rewards[key] = { points: 0, redemptions: [] };
  data.rewards[key].points += Math.floor(Number(invoiceAmount));
  write(data);
  return entry;
}

function localRedeemReward(codeword, rewardType) {
  const data = read();
  const key = (codeword || "").toLowerCase();
  if (!data.rewards[key]) data.rewards[key] = { points: 0, redemptions: [] };
  const needed = rewardType === "portrait50" ? 500 : 600;
  if (data.rewards[key].points < needed) {
    return { ok: false, needed, points: data.rewards[key].points };
  }
  data.rewards[key].points -= needed;
  data.rewards[key].redemptions.push({ at: new Date().toISOString(), rewardType, cost: needed });
  write(data);
  return { ok: true, points: data.rewards[key].points };
}

function localGetAccountSnapshot(codeword) {
  const data = read();
  const key = (codeword || "").toLowerCase();
  const ledger = data.ledger[key] || [];
  const balance = ledger.reduce((sum, e) => sum + e.delta, 0);
  const rewards = data.rewards[key] || { points: 0, redemptions: [] };
  const stays = data.stays[key] || [];
  return {
    customer: data.customers[key] || null,
    ledger,
    stays,
    balance,
    rewards
  };
}

function localAddStay(codeword, stay) {
  const data = read();
  const key = (codeword || "").toLowerCase();
  if (!data.stays[key]) data.stays[key] = [];
  data.stays[key].push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    start: stay.start,
    end: stay.end,
    status: stay.status || "planned",
    notes: stay.notes || "",
    createdAt: new Date().toISOString()
  });
  write(data);
  return data.stays[key][data.stays[key].length - 1];
}

export async function upsertCustomer(input) {
  try {
    const payload = {
      ...input,
      petCodeword: (input.petCodeword || "").toLowerCase()
    };
    await callApi("/api/customer/upsert", { method: "POST", body: payload });
    const snap = await callApi(`/api/account?codeword=${encodeURIComponent(payload.petCodeword)}`);
    return snap?.snapshot?.customer || localUpsertCustomer(input);
  } catch {
    return localUpsertCustomer(input);
  }
}

export async function getCustomerByCodeword(codeword) {
  const key = (codeword || "").toLowerCase();
  if (!key) return null;
  try {
    const out = await callApi(`/api/account?codeword=${encodeURIComponent(key)}`);
    if (out?.snapshot?.customer) return out.snapshot.customer;
  } catch {
    // fallback below
  }
  return localGetCustomerByCodeword(key);
}

export async function addLedgerEntry(codeword, invoiceAmount, paidAmount) {
  const key = (codeword || "").toLowerCase();
  try {
    await callApi("/api/ledger/add", {
      method: "POST",
      body: { petCodeword: key, invoiceAmount, paidAmount }
    });
    const snap = await getAccountSnapshot(key);
    const latest = snap.ledger[snap.ledger.length - 1];
    if (latest) return latest;
  } catch {
    // fallback below
  }
  return localAddLedgerEntry(key, invoiceAmount, paidAmount);
}

export async function redeemReward(codeword, rewardType) {
  const key = (codeword || "").toLowerCase();
  try {
    return await callApi("/api/reward/redeem", {
      method: "POST",
      body: { petCodeword: key, rewardType }
    });
  } catch {
    return localRedeemReward(key, rewardType);
  }
}

export async function getAccountSnapshot(codeword) {
  const key = (codeword || "").toLowerCase();
  if (!key) return localGetAccountSnapshot(key);
  try {
    const out = await callApi(`/api/account?codeword=${encodeURIComponent(key)}`);
    if (out?.snapshot) return out.snapshot;
  } catch {
    // fallback below
  }
  return localGetAccountSnapshot(key);
}

export async function addStay(codeword, stay) {
  const key = (codeword || "").toLowerCase();
  try {
    const out = await callApi("/api/stay/add", {
      method: "POST",
      body: { petCodeword: key, ...stay }
    });
    return {
      id: out.id,
      start: stay.start,
      end: stay.end,
      status: stay.status || "planned",
      notes: stay.notes || "",
      createdAt: new Date().toISOString()
    };
  } catch {
    return localAddStay(key, stay);
  }
}

function stripStaysAndNonCustomerFields(detail) {
  if (!detail || typeof detail !== "object") return {};
  const { stays, ...rest } = detail;
  return rest;
}

/**
 * Merges in-repo defaults with the local `customers` entry so the API always receives
 * a full row. Local values win (e.g. owner phone you saved in admin).
 * Also guarantees non-empty customerName so POST /api/customer/upsert never 400s on edge cases.
 */
function mergeLocalCustomerForCloudSync(customer, petDetailsMap, legacyBaselines) {
  const key = (customer.petCodeword || "").toLowerCase();
  const defaults = stripStaysAndNonCustomerFields(petDetailsMap?.[key]);
  const merged = { ...defaults, ...customer, petCodeword: key };
  const name = String(merged.customerName || "").trim() || "Unknown pet parent";
  const bpRaw = Number(merged.baseProfile);
  const baseProfile = Number.isFinite(bpRaw) && bpRaw > 0
    ? bpRaw
    : (() => {
        const leg = Number(legacyBaselines?.[key]);
        return Number.isFinite(leg) && leg > 0 ? leg : 40;
      })();
  return { ...merged, customerName: name, baseProfile };
}

export async function syncLocalCustomersToCloud(petDetailsMap, legacyBaselines) {
  const data = read();
  const customers = Object.values(data.customers || {});
  if (!customers.length) return { synced: 0, total: 0 };

  let synced = 0;
  for (const customer of customers) {
    const m = mergeLocalCustomerForCloudSync(customer, petDetailsMap, legacyBaselines);
    const key = m.petCodeword;
    const payload = {
      customerName: m.customerName,
      petCodeword: key,
      petDisplayName: m.petDisplayName,
      baseProfile: m.baseProfile,
      ageYears: m.ageReferenceYears,
      ageReferenceDate: m.ageReferenceDate,
      defaultCompanyNeed: m.defaultCompanyNeed,
      ownerEmail: m.ownerEmail,
      ownerPhone: m.ownerPhone,
      emergencyPhone: m.emergencyPhone,
      vetAddress: m.vetAddress,
      likes: m.likes,
      dislikes: m.dislikes,
      allergies: m.allergies,
      friends: m.friends,
      medicalNeeds: m.medicalNeeds,
      medicalHistory: m.medicalHistory,
      profileImage: m.profileImage
    };
    try {
      await callApi("/api/customer/upsert", { method: "POST", body: payload });
      synced += 1;
    } catch {
      // keep going; caller can retry later
    }
  }
  return { synced, total: customers.length };
}

/**
 * Pushes in-repo default pet profile rows to Neon when the DB has no row yet.
 * Does not use local storage fallback for the existence check, so a flaky API does not
 * make us skip seeding.
 */
export async function seedMissingBuiltInPetsInCloud(petDetailsMap, legacyBaselines) {
  const keys = Object.keys(petDetailsMap || {});
  let seeded = 0;
  for (const rawKey of keys) {
    const key = (rawKey || "").toLowerCase();
    if (!key) continue;
    const details = petDetailsMap[key] || petDetailsMap[rawKey] || {};
    const hasContent =
      String(details.petDisplayName || "").trim() ||
      String(details.customerName || "").trim() ||
      String(details.profileImage || "").trim() ||
      Number.isFinite(Number(details.ageReferenceYears)) ||
      String(details.likes || "").trim() ||
      String(details.medicalHistory || "").trim() ||
      String(details.medicalNeeds || "").trim() ||
      String(details.vetAddress || "").trim();
    if (!hasContent) continue;

    let cloudCustomer = null;
    try {
      const out = await callApi(`/api/account?codeword=${encodeURIComponent(key)}`);
      cloudCustomer = out?.snapshot?.customer || null;
    } catch {
      return { ok: false, seeded, error: "account_fetch_failed" };
    }
    if (cloudCustomer) continue;

    const baseProfile = Number(legacyBaselines?.[key] ?? details.baseProfile);
    if (!Number.isFinite(baseProfile) || baseProfile <= 0) {
      return { ok: false, seeded, error: "missing_base_profile", codeword: key };
    }

    const refRaw = String(details.ageReferenceDate || "").trim();
    const displayTitle =
      String(details.petDisplayName || "").trim() ||
      (key ? key.charAt(0).toUpperCase() + key.slice(1) : key);
    const payload = {
      customerName: String(details.customerName || "").trim() || "Unknown pet parent",
      petCodeword: key,
      baseProfile,
      defaultCompanyNeed: Boolean(details.defaultCompanyNeed),
      petDisplayName: displayTitle,
      ageYears: Number.isFinite(Number(details.ageReferenceYears)) ? Number(details.ageReferenceYears) : null,
      ageReferenceDate: refRaw,
      ownerEmail: String(details.ownerEmail || "").trim(),
      ownerPhone: String(details.ownerPhone || "").trim(),
      emergencyPhone: String(details.emergencyPhone || "").trim(),
      vetAddress: String(details.vetAddress || "").trim(),
      likes: String(details.likes || "").trim(),
      dislikes: String(details.dislikes || "").trim(),
      allergies: String(details.allergies || "").trim(),
      friends: String(details.friends || "").trim(),
      medicalNeeds: String(details.medicalNeeds || "").trim(),
      medicalHistory: String(details.medicalHistory || "").trim(),
      profileImage: String(details.profileImage || "").trim()
    };
    try {
      await callApi("/api/customer/upsert", { method: "POST", body: payload });
    } catch {
      return { ok: false, seeded, error: "upsert_failed", codeword: key };
    }
    seeded += 1;
  }
  return { ok: true, seeded };
}
