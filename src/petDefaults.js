/**
 * In-repo defaults merged into the UI for profile fields only (no stays — stays come only from Postgres).
 * Photo-folder script still reads `detail.stays` if present; optional empty.
 */
export const DEFAULT_PET_PROFILE_DETAILS = {
  borja: {
    profileImage: "./assets/pets/borja/profile.png"
  },
  bubbles: {
    profileImage: "./assets/pets/bubbles/profile.png",
    petDisplayName: "Bubbles",
    ageReferenceYears: 4,
    ageReferenceDate: "2026-04-24T00:00:00.000Z",
    likes: "Dogs who look like her",
    dislikes: "Dogs who don't",
    allergies: "None",
    defaultCompanyNeed: false,
    medicalHistory: "Claw issues",
    medicalNeeds: "None",
    vetAddress: "Pending from Asli",
    customerName: "Asli"
  }
};
