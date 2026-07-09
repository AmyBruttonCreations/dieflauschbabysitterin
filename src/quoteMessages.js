/** Calculator quote email / breakdown copy (EN + DE per saved pet profile). */

export function normalizeQuoteLanguage(raw) {
  return String(raw || "").trim().toLowerCase() === "de" ? "de" : "en";
}

const BLOCK_LABELS = {
  en: {
    full24: "Full 24h",
    daycare12: "Daycare (12h)",
    overnight: "Overnight",
    extension: "Extension"
  },
  de: {
    full24: "Ganztag (24h)",
    daycare12: "Tagesbetreuung (12h)",
    overnight: "Übernachtung",
    extension: "Verlängerung"
  }
};

function fmtMoney(lang, n) {
  const v = Number(n).toFixed(2);
  return lang === "de" ? `${v} EUR` : `${v} EUR`;
}

export function formatMedicalNeedsSurchargeLine(lang, surcharges) {
  const fee = Number(surcharges?.medicalNeedsFee) || 0;
  if (fee <= 0) {
    return lang === "de" ? `Medizinischer Zuschlag: ${fmtMoney(lang, 0)}` : `Medical-needs surcharge: ${fmtMoney(lang, 0)}`;
  }
  const rate = Number(surcharges?.medicalNeedsRatePerDay) || 5;
  const rawDays =
    Number(surcharges?.medicalNeedsCalendarDays ?? surcharges?.medicalNeedsBillableDays) || 0;
  const daysLabel = (Math.round(rawDays * 10) / 10).toFixed(1);
  if (lang === "de") {
    return `Medizinischer Zuschlag: ${fmtMoney(lang, fee)} @ ${fmtMoney(lang, rate)} pro Tag × ${daysLabel}`;
  }
  return `Medical-needs surcharge: ${fmtMoney(lang, fee)} @ ${fmtMoney(lang, rate)} per day × ${daysLabel}`;
}

/**
 * @param {object} opts
 * @param {string} opts.lang - "en" | "de"
 * @param {function} opts.fmtDate - (Date) => string
 */
export function buildQuoteBreakdown(opts) {
  const lang = normalizeQuoteLanguage(opts.lang);
  const {
    greetingName,
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
  } = opts;

  const t = lang === "de"
    ? {
        intro: (name, pet) => `Hallo ${name}, hier ist die Aufstellung für den Aufenthalt von ${pet}.`,
        dropoff: "Abgabe",
        pickup: "Abholung",
        blocks: "Blöcke",
        savedProfile: (cw, base, med) =>
          `Gespeichertes Profil: ${cw} · Basispreis ${fmtMoney(lang, base)}${med ? " · medizinischer Zuschlag" : ""}`,
        adminNoProfile: (base, cw) =>
          `Basispreis: ${fmtMoney(lang, base)} (kein gespeichertes Profil für „${cw}“)`,
        early: "Früh-Abgabe-Zuschlag",
        lateDropoff: "Späte Abgabe-Zuschlag",
        seasonal: "Saisonaler Zuschlag",
        constantCompany: "Dauer-Gesellschaft-Zuschlag",
        lastMinute: "Kurzfrist-Zuschlag",
        total: "Gesamt",
        thanksKnown: (pet) => `Danke, dass ihr mir die Betreuung von ${pet} anvertraut.`,
        thanksOwner: (name) => `Danke für euer Interesse an meiner Betreuung, ${name}.`,
        thanksGeneric: "Danke für euer Interesse an meiner Betreuung.",
        signoff: "Amy"
      }
    : {
        intro: (name, pet) => `Hi ${name}, here is the breakdown for ${pet}'s stay.`,
        dropoff: "Drop-off",
        pickup: "Pick-up",
        blocks: "Blocks",
        savedProfile: (cw, base, med) =>
          `Saved profile: ${cw} · baseline ${fmtMoney(lang, base)}${med ? " · medical needs surcharge applies" : ""}`,
        adminNoProfile: (base, cw) =>
          `Profile baseline: ${fmtMoney(lang, base)} (no saved customer row for "${cw}")`,
        early: "Early surcharge",
        lateDropoff: "Late drop-off surcharge",
        seasonal: "Seasonal surcharge",
        constantCompany: "Constant-company surcharge",
        lastMinute: "Last-minute surcharge",
        total: "Total",
        thanksKnown: (pet) => `Thanks for trusting me with caring for ${pet}.`,
        thanksOwner: (name) => `Thanks for your interest in my services, ${name}.`,
        thanksGeneric: "Thanks for your interest in my services.",
        signoff: "Amy"
      };

  const pet = petLabel || petCodeword || (lang === "de" ? "eurem Liebling" : "your pet");
  const name = greetingName || (lang === "de" ? "ihr" : "pet parent");

  const lines = [t.intro(name, pet), ""];

  if (customer) {
    lines.splice(1, 0, t.savedProfile(petCodeword, baseline, medicalNeeds), "");
  } else if (isAdmin) {
    lines.splice(1, 0, t.adminNoProfile(baseline, petCodeword), "");
  }

  lines.push(`${t.dropoff}: ${fmtDate(dropoff)}`, `${t.pickup}: ${fmtDate(pickup)}`, "", `${t.blocks}:`);

  const blockLabels = BLOCK_LABELS[lang];
  quote.plan.items.forEach((item) => {
    const label = blockLabels[item.type] || item.type;
    lines.push(`- ${label}: ${fmtDate(item.start)} -> ${fmtDate(item.end)} = ${fmtMoney(lang, item.cost)}`);
  });

  lines.push(
    "",
    `${t.early}: ${fmtMoney(lang, quote.surcharges.early)}`,
    `${t.lateDropoff}: ${fmtMoney(lang, quote.surcharges.lateDropoff)}`,
    `${t.seasonal}: ${fmtMoney(lang, quote.surcharges.seasonal)}`,
    `${t.constantCompany}: ${fmtMoney(lang, quote.surcharges.constantCompanyFee)}`,
    formatMedicalNeedsSurchargeLine(lang, quote.surcharges),
    `${t.lastMinute}: ${fmtMoney(lang, lastMinuteSurcharge)}`,
    `${t.total}: ${fmtMoney(lang, quote.total + lastMinuteSurcharge)}`,
    "",
    knownProfile && petLabel
      ? t.thanksKnown(petLabel)
      : ownerName
        ? t.thanksOwner(ownerName)
        : t.thanksGeneric,
    t.signoff
  );

  return lines.join("\n");
}

export function calcModeMessage(lang, { withinFortyEightHours, withinSevenDays, isFutureEstimate }) {
  const l = normalizeQuoteLanguage(lang);
  if (!isFutureEstimate) {
    return l === "de"
      ? "Diese Berechnung gilt als Zahlungsorientiert für einen vergangenen/laufenden Aufenthalt."
      : "This calculation is treated as payment-oriented for a past/current stay.";
  }
  if (withinFortyEightHours) {
    return l === "de"
      ? "Dies ist eine Schätzung für die Zukunft und enthält einen Kurzfrist-Zuschlag (+10 EUR), weil der Aufenthalt innerhalb von 48 Stunden beginnt."
      : "This is a future estimate and includes a last-minute booking surcharge (+10 EUR) because the stay starts within 48 hours.";
  }
  if (withinSevenDays) {
    return l === "de"
      ? "Dies ist eine Schätzung für die Zukunft und enthält einen Kurzfrist-Zuschlag (+5 EUR), weil der Aufenthalt innerhalb von 7 Tagen beginnt."
      : "This is a future estimate and includes a short-notice surcharge (+5 EUR) because the stay starts within 7 days.";
  }
  return l === "de"
    ? "Dies ist eine Schätzung für die Zukunft. Wenn ihr fortfahren möchtet, sendet gerne eine Buchungsanfrage."
    : "This is a future estimate. If you would like to proceed, send a booking request.";
}

export function defaultBookingRequestMessage(lang, { petName, dropoff, pickup, fmtDate }) {
  const l = normalizeQuoteLanguage(lang);
  if (l === "de") {
    return [
      "Hallo Amy,",
      "",
      `ich möchte einen Aufenthalt für ${petName || "mein Tier"} buchen.`,
      `Abgabe: ${fmtDate(dropoff)}`,
      `Abholung: ${fmtDate(pickup)}`,
      "",
      "Danke!"
    ].join("\n");
  }
  return [
    "Hi Amy,",
    "",
    `I'd like to book a stay for ${petName || "my pet"}.`,
    `Drop-off: ${fmtDate(dropoff)}`,
    `Pick-up: ${fmtDate(pickup)}`,
    "",
    "Thank you!"
  ].join("\n");
}
