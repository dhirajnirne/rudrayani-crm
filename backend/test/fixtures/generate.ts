/**
 * Writes the shared scenario (build-scenarios.ts) to disk as real .xlsx
 * files for manual QA/demo through the actual Import wizard UI -- mirroring
 * the untracked `resource files/` folder's real-world flavor, but tracked in
 * git so they travel with the repo. Re-run any time to refresh the
 * DPD-relative due dates: `npx tsx test/fixtures/generate.ts` (from backend/).
 */
import fs from "fs/promises";
import path from "path";
import {
  alphaMonth1,
  alphaMonth2,
  alphaMonth3,
  betaMonth1,
  betaMonth2,
  betaMonth3,
} from "./build-scenarios";

async function main(): Promise<void> {
  const dir = __dirname;
  const files: [string, () => Promise<Buffer>][] = [
    ["alpha-finance-month1.xlsx", alphaMonth1],
    ["alpha-finance-month2-refresh.xlsx", alphaMonth2],
    ["alpha-finance-month3-refresh.xlsx", alphaMonth3],
    ["beta-credit-month1.xlsx", betaMonth1],
    ["beta-credit-month2-refresh.xlsx", betaMonth2],
    ["beta-credit-month3-refresh.xlsx", betaMonth3],
  ];
  for (const [name, build] of files) {
    const buffer = await build();
    await fs.writeFile(path.join(dir, name), buffer);
    console.log(`wrote ${name} (${buffer.length} bytes)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
