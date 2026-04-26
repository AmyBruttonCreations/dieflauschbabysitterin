import { customerNamesFromRow, joinedFromNames } from "./customerNames.js";
import { sql } from "./db.js";

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

  return {
    customer: {
      customerName: nameJoined,
      customerNames: nameParts,
      petCodeword: customer.codeword,
      petDisplayName: customer.pet_display_name,
      baseProfile: Number(customer.base_profile),
      defaultCompanyNeed: Boolean(customer.default_company_need),
      ageReferenceYears: customer.age_reference_years,
      ageReferenceDate: customer.age_reference_date ? new Date(customer.age_reference_date).toISOString() : null,
      ownerEmail: customer.owner_email || "",
      ownerPhone: customer.owner_phone || "",
      emergencyPhone: customer.emergency_phone || "",
      vetAddress: customer.vet_address || "",
      likes: customer.likes || "",
      dislikes: customer.dislikes || "",
      allergies: customer.allergies || "",
      friends: customer.friends || "",
      medicalNeeds: customer.medical_needs || "",
      medicalHistory: customer.medical_history || "",
      profileImage: customer.profile_image || ""
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
