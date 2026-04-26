import { customerNamesFromRequestBody, joinedFromNames } from "../_lib/customerNames.js";
import { normalizeCodeword, sql, toFiniteNumber, toIsoStringOrNull } from "../_lib/db.js";
import { methodNotAllowed, parseJsonBody, sendJson } from "../_lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  try {
    const body = await parseJsonBody(req);
    const codeword = normalizeCodeword(body.petCodeword);
    const names = customerNamesFromRequestBody(body);
    const customerName = joinedFromNames(names);
    if (!codeword || !names.length) {
      return sendJson(res, 400, { ok: false, error: "At least one customer name and petCodeword are required." });
    }
    const customerNamesJson = JSON.stringify(names);

    const db = sql();
    const ageYearsRaw = body.ageYears ?? body.ageReferenceYears;
    const ageReferenceYears = Number.isFinite(Number(ageYearsRaw)) ? Number(ageYearsRaw) : null;
    const previous = await db`SELECT age_reference_date FROM pets WHERE codeword = ${codeword} LIMIT 1`;
    const explicitRef = toIsoStringOrNull(body.ageReferenceDate);
    const ageReferenceDate = ageReferenceYears !== null
      ? (explicitRef || previous[0]?.age_reference_date || new Date().toISOString())
      : null;

    await db`
      INSERT INTO pets (
        codeword, customer_name, customer_names, pet_display_name, base_profile, default_company_need,
        age_reference_years, age_reference_date, owner_email, owner_phone, emergency_phone,
        vet_address, likes, dislikes, allergies, friends, medical_needs, medical_history, profile_image, updated_at
      ) VALUES (
        ${codeword}, ${customerName}, ${customerNamesJson}, ${String(body.petDisplayName || codeword).trim()},
        ${toFiniteNumber(body.baseProfile, 40)}, ${Boolean(body.defaultCompanyNeed)},
        ${ageReferenceYears}, ${toIsoStringOrNull(ageReferenceDate)},
        ${String(body.ownerEmail || "").trim()}, ${String(body.ownerPhone || "").trim()},
        ${String(body.emergencyPhone || "").trim()}, ${String(body.vetAddress || "").trim()},
        ${String(body.likes || "").trim()}, ${String(body.dislikes || "").trim()},
        ${String(body.allergies || "").trim()}, ${String(body.friends || "").trim()},
        ${String(body.medicalNeeds || "").trim()}, ${String(body.medicalHistory || "").trim()},
        ${String(body.profileImage || "").trim()}, now()
      )
      ON CONFLICT (codeword)
      DO UPDATE SET
        customer_name = EXCLUDED.customer_name,
        customer_names = EXCLUDED.customer_names,
        pet_display_name = EXCLUDED.pet_display_name,
        base_profile = EXCLUDED.base_profile,
        default_company_need = EXCLUDED.default_company_need,
        age_reference_years = EXCLUDED.age_reference_years,
        age_reference_date = EXCLUDED.age_reference_date,
        owner_email = EXCLUDED.owner_email,
        owner_phone = EXCLUDED.owner_phone,
        emergency_phone = EXCLUDED.emergency_phone,
        vet_address = EXCLUDED.vet_address,
        likes = EXCLUDED.likes,
        dislikes = EXCLUDED.dislikes,
        allergies = EXCLUDED.allergies,
        friends = EXCLUDED.friends,
        medical_needs = EXCLUDED.medical_needs,
        medical_history = EXCLUDED.medical_history,
        profile_image = EXCLUDED.profile_image,
        updated_at = now()
    `;

    await db`INSERT INTO rewards (pet_codeword, points) VALUES (${codeword}, 0) ON CONFLICT (pet_codeword) DO NOTHING`;

    // Echo what was accepted (POST does not re-query the full row; use GET /api/account for that).
    return sendJson(res, 200, {
      ok: true,
      codeword,
      saved: {
        customerNames: names,
        customerName: customerName,
        defaultCompanyNeed: Boolean(body.defaultCompanyNeed),
        petDisplayName: String(body.petDisplayName || codeword).trim()
      }
    });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message });
  }
}
