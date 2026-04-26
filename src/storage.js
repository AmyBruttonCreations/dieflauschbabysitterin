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

export async function syncLocalCustomersToCloud() {
  const data = read();
  const customers = Object.values(data.customers || {});
  if (!customers.length) return { synced: 0, total: 0 };

  let synced = 0;
  for (const customer of customers) {
    const payload = {
      customerName: customer.customerName,
      petCodeword: customer.petCodeword,
      petDisplayName: customer.petDisplayName,
      baseProfile: customer.baseProfile,
      ageYears: customer.ageReferenceYears,
      defaultCompanyNeed: customer.defaultCompanyNeed,
      ownerEmail: customer.ownerEmail,
      ownerPhone: customer.ownerPhone,
      emergencyPhone: customer.emergencyPhone,
      vetAddress: customer.vetAddress,
      likes: customer.likes,
      dislikes: customer.dislikes,
      allergies: customer.allergies,
      friends: customer.friends,
      medicalNeeds: customer.medicalNeeds,
      medicalHistory: customer.medicalHistory,
      profileImage: customer.profileImage
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
