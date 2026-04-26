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

export function upsertCustomer({
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

export function getCustomerByCodeword(codeword) {
  const data = read();
  return data.customers[(codeword || "").toLowerCase()] || null;
}

export function addLedgerEntry(codeword, invoiceAmount, paidAmount) {
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

export function redeemReward(codeword, rewardType) {
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

export function getAccountSnapshot(codeword) {
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

export function addStay(codeword, stay) {
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
