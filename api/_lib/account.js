import { customerNamesFromRow, joinedFromNames } from "./customerNames.js";
import { sql } from "./db.js";
import { boolFromRow, rowVal } from "./petsRow.js";

export async function getAccountSnapshot(codeword) {
  const db = sql();
  const [customer] = await db`SELECT * FROM pets WHERE codeword = ${codeword} LIMIT 1`;
  if (!customer) {
    return {
      customer: null,
      ledger: [],
      stays: [],
      balance: 0,
      rewards: { points: 0, redemptions: [] }
    };
  }

  const ledger = await db`
    SELECT at, invoice_amount, paid_amount, delta
    FROM ledger_entries
    WHERE pet_codeword = ${codeword}
    ORDER BY at ASC, id ASC
  `;
  let runningBalance = 0;
  const ledgerWithBalance = ledger.map((entry) => {
    runningBalance += Number(entry.delta);
    return {
      at: new Date(entry.at).toISOString(),
      invoiceAmount: Number(entry.invoice_amount),
      paidAmount: Number(entry.paid_amount),
      delta: Number(entry.delta),
      balanceAfter: runningBalance
    };
  });

  const staysRows = await db`
    SELECT id, start_at, end_at, status, notes, created_at
    FROM stays
    WHERE pet_codeword = ${codeword}
    ORDER BY start_at ASC, id ASC
  `;
  const stays = staysRows.map((stay) => ({
    id: stay.id,
    start: new Date(stay.start_at).toISOString(),
    end: new Date(stay.end_at).toISOString(),
    status: stay.status,
    notes: stay.notes || "",
    createdAt: new Date(stay.created_at).toISOString()
  }));

  const [reward] = await db`SELECT points FROM rewards WHERE pet_codeword = ${codeword} LIMIT 1`;
  const redemptionsRows = await db`
    SELECT at, reward_type, cost
    FROM reward_redemptions
    WHERE pet_codeword = ${codeword}
    ORDER BY at ASC, id ASC
  `;
  const redemptions = redemptionsRows.map((r) => ({
    at: new Date(r.at).toISOString(),
    rewardType: r.reward_type,
    cost: Number(r.cost)
  }));

  const nameParts = customerNamesFromRow(customer);
  const nameJoined = joinedFromNames(nameParts);

  const ad = rowVal(customer, "age_reference_date", "ageReferenceDate");
  const yRaw = rowVal(customer, "age_reference_years", "ageReferenceYears");
  return {
    customer: {
      customerName: nameJoined,
      customerNames: nameParts,
      petCodeword: String(rowVal(customer, "codeword", "petCodeword") ?? customer.codeword ?? ""),
      petDisplayName: String(rowVal(customer, "pet_display_name", "petDisplayName") ?? "").trim(),
      baseProfile: Number(rowVal(customer, "base_profile", "baseProfile") ?? 40),
      defaultCompanyNeed: boolFromRow(rowVal(customer, "default_company_need", "defaultCompanyNeed")),
      ageReferenceYears: yRaw != null && yRaw !== "" && Number.isFinite(Number(yRaw)) ? Number(yRaw) : null,
      ageReferenceDate: ad ? new Date(ad).toISOString() : null,
      ownerEmail: String(rowVal(customer, "owner_email", "ownerEmail") ?? "").trim(),
      ownerPhone: String(rowVal(customer, "owner_phone", "ownerPhone") ?? "").trim(),
      emergencyPhone: String(rowVal(customer, "emergency_phone", "emergencyPhone") ?? "").trim(),
      vetAddress: String(rowVal(customer, "vet_address", "vetAddress") ?? "").trim(),
      likes: String(rowVal(customer, "likes", "likes") ?? "").trim(),
      dislikes: String(rowVal(customer, "dislikes", "dislikes") ?? "").trim(),
      allergies: String(rowVal(customer, "allergies", "allergies") ?? "").trim(),
      friends: String(rowVal(customer, "friends", "friends") ?? "").trim(),
      medicalNeeds: String(rowVal(customer, "medical_needs", "medicalNeeds") ?? "").trim(),
      medicalHistory: String(rowVal(customer, "medical_history", "medicalHistory") ?? "").trim(),
      profileImage: String(rowVal(customer, "profile_image", "profileImage") ?? "").trim()
    },
    ledger: ledgerWithBalance,
    stays,
    balance: runningBalance,
    rewards: {
      points: Number(reward?.points || 0),
      redemptions
    }
  };
}
