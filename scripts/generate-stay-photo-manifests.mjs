/**
 * Writes photos.json in each assets/pets/<pet>/stays/<stay_id>/ listing image files.
 * Run after adding or renaming images: npm run stay:photos
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve("assets", "pets");
if (!fs.existsSync(root)) {
  console.log("No assets/pets — nothing to do.");
  process.exit(0);
}

const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;
let manifests = 0;

for (const pet of fs.readdirSync(root)) {
  const staysDir = path.join(root, pet, "stays");
  if (!fs.existsSync(staysDir)) continue;

  for (const stayId of fs.readdirSync(staysDir)) {
    const dir = path.join(staysDir, stayId);
    if (!fs.statSync(dir).isDirectory()) continue;

    const files = fs
      .readdirSync(dir)
      .filter((f) => IMAGE_EXT.test(f) && f !== "photos.json");

    const images = files
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
      .map((f) => `./assets/pets/${pet}/stays/${stayId}/${f}`);

    const manifestPath = path.join(dir, "photos.json");
    fs.writeFileSync(manifestPath, `${JSON.stringify({ images }, null, 2)}\n`);
    manifests += 1;
  }
}

console.log(`Wrote photos.json in ${manifests} stay folder(s).`);
