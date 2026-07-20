import { buildHarness } from "./build-harness";

// Bundle the SeatMap harness once before the browser tests run.
export default async function globalSetup() {
  await buildHarness();
}
