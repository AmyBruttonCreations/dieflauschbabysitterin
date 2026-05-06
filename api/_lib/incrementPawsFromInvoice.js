/** Adds paws (invoice euros / 10) to the pet's rewards balance. */
export async function incrementPawsFromInvoice(db, codeword, invoiceAmount) {
  const pawIncrease = Number(invoiceAmount) / 10;
  await db`
    INSERT INTO rewards (pet_codeword, points)
    VALUES (${codeword}, ${pawIncrease})
    ON CONFLICT (pet_codeword)
    DO UPDATE SET points = rewards.points + EXCLUDED.points
  `;
}
