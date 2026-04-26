const EXTRA_SEASON_RANGES = [];

function addHours(date, h) {
  return new Date(date.getTime() + h * 3600000);
}

function diffHours(a, b) {
  return (b.getTime() - a.getTime()) / 3600000;
}

function hourOf(d) {
  return d.getHours() + d.getMinutes() / 60;
}

function toMinKey(d) {
  return Math.round(d.getTime() / 60000);
}

function dateOnly(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function inChristmasNewYear(d) {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return (m === 12 && day >= 23) || (m === 1 && day <= 6);
}

function inExtraSeason(d) {
  const x = dateOnly(d).getTime();
  return EXTRA_SEASON_RANGES.find((r) => {
    const s = new Date(`${r.start}T00:00:00`).getTime();
    const e = new Date(`${r.end}T00:00:00`).getTime();
    return x >= s && x <= e;
  }) || null;
}

function seasonalRateForBlockStart(d) {
  if (inChristmasNewYear(d)) return 5;
  const extra = inExtraSeason(d);
  return extra ? Number(extra.rate || 0) : 0;
}

function getOvernightEnd(start) {
  const end = new Date(start);
  end.setSeconds(0, 0);
  end.setHours(10, 0, 0, 0);
  if (end <= start) end.setDate(end.getDate() + 1);
  return end;
}

function validStarts(start, rates) {
  const h = hourOf(start);
  const options = [];

  if (h >= 8 && h < 20) {
    options.push({ type: "full24", end: addHours(start, 24), cost: rates.baseline });
  }
  if (h >= 8 && h < 10) {
    options.push({ type: "daycare12", end: addHours(start, 12), cost: rates.daycare });
  }
  if (h >= 19) {
    options.push({ type: "overnight", end: getOvernightEnd(start), cost: rates.overnight });
  }

  return options;
}

function extensionCost(start, end) {
  let cursor = new Date(start);
  let cost = 0;
  while (cursor < end) {
    const next = new Date(Math.min(end.getTime(), cursor.getTime() + 3600000));
    const segHours = diffHours(cursor, next);
    const h = hourOf(cursor);
    let rate;
    if (h >= 22 && h < 24) rate = 5;
    else if (h >= 0 && h < 1) rate = 10;
    else rate = 3;
    cost += rate * segHours;
    cursor = next;
  }
  return cost;
}

function extensionEndpoints(start, pickup) {
  const out = [];
  const maxByFive = addHours(start, 5);
  const cap = new Date(Math.min(maxByFive.getTime(), pickup.getTime()));
  const handoffHours = [8, 10, 16, 19, 20, 22, 0, 1];

  for (const hour of handoffHours) {
    const b = new Date(start);
    b.setSeconds(0, 0);
    b.setHours(hour, 0, 0, 0);
    if (b <= start) b.setDate(b.getDate() + 1);
    if (b > start && b <= cap) out.push(new Date(b));
  }

  if (cap > start) out.push(new Date(cap));
  if (pickup > start && pickup <= cap) out.push(new Date(pickup));

  const unique = new Map();
  for (const x of out) unique.set(toMinKey(x), x);
  return [...unique.values()].sort((a, b) => a - b);
}

function humanReadablePlan(dropoff, pickup, rates) {
  const items = [];
  let t = new Date(dropoff);

  while (t < pickup) {
    const tHour = hourOf(t);
    const remaining = diffHours(t, pickup);

    if (remaining >= 24 && tHour >= 8 && tHour < 20) {
      const end = addHours(t, 24);
      items.push({ type: "full24", start: new Date(t), end, cost: rates.baseline });
      t = end;
      continue;
    }

    if (tHour < 8) {
      const end = new Date(t);
      end.setHours(8, 0, 0, 0);
      if (end <= t) end.setDate(end.getDate() + 1);
      const capped = new Date(Math.min(end.getTime(), pickup.getTime()));
      items.push({ type: "extension", start: new Date(t), end: capped, cost: extensionCost(t, capped) });
      t = capped;
      continue;
    }

    if (tHour >= 19) {
      const end = getOvernightEnd(t);
      items.push({ type: "overnight", start: new Date(t), end, cost: rates.overnight });
      t = end;
      continue;
    }

    const sameDay22 = new Date(t);
    sameDay22.setHours(22, 0, 0, 0);
    const daycareCap = addHours(t, 12);
    const daycareEnd = new Date(Math.min(daycareCap.getTime(), sameDay22.getTime()));

    if (pickup <= daycareEnd) {
      items.push({ type: "daycare12", start: new Date(t), end: new Date(pickup), cost: rates.daycare });
      t = new Date(pickup);
      continue;
    }

    if (remaining < 24) {
      const end = addHours(t, 24);
      items.push({ type: "full24", start: new Date(t), end, cost: rates.baseline });
      t = end;
      continue;
    }

    const end = addHours(t, 24);
    items.push({ type: "full24", start: new Date(t), end, cost: rates.baseline });
    t = end;
  }

  return { cost: items.reduce((sum, x) => sum + x.cost, 0), items };
}

function earlyDropoffSurcharge(dropoff, rates) {
  const h = hourOf(dropoff);
  if (h < 5) return rates.overnight;
  if (h >= 5 && h < 6) return 10;
  if (h >= 7 && h < 8) return 3;
  if (h >= 6 && h < 7) return 5;
  return 0;
}

function lateDropoffSurcharge(dropoff, rates) {
  const h = hourOf(dropoff);
  if (h >= 20 && h < 21) return 3;
  if (h >= 21 && h < 22) return 5;
  if (h >= 22 && h < 24) return 10;
  if (h >= 0 && h < 5) return rates.overnight;
  return 0;
}

function seasonalSurcharge(dropoff, pickup) {
  let total = 0;
  const blocks = Math.max(1, Math.ceil(diffHours(dropoff, pickup) / 24));
  for (let i = 0; i < blocks; i += 1) total += seasonalRateForBlockStart(addHours(dropoff, i * 24));
  return total;
}

export function quoteStay({ dropoff, pickup, baseline, constantCompany }) {
  if (!(dropoff instanceof Date) || Number.isNaN(dropoff.getTime())) throw new Error("Invalid dropoff");
  if (!(pickup instanceof Date) || Number.isNaN(pickup.getTime())) throw new Error("Invalid pickup");
  if (pickup <= dropoff) throw new Error("Pickup must be after dropoff");

  const rates = {
    baseline,
    daycare: baseline - 5,
    overnight: baseline - 10,
    extraDaycare: baseline - 10
  };

  const plan = humanReadablePlan(dropoff, pickup, rates);
  const early = earlyDropoffSurcharge(dropoff, rates);
  const lateDropoff = lateDropoffSurcharge(dropoff, rates);
  const seasonal = seasonalSurcharge(dropoff, pickup);
  const ccBlocks = Math.max(1, Math.ceil(diffHours(dropoff, pickup) / 24));
  const constantCompanyFee = constantCompany ? ccBlocks * 5 : 0;

  const total = plan.cost + early + lateDropoff + seasonal + constantCompanyFee;
  return {
    baseline,
    plan,
    surcharges: { early, lateDropoff, seasonal, constantCompanyFee },
    total
  };
}
