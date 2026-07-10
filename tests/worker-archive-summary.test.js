import assert from "node:assert/strict";
import { test } from "node:test";

import { municipalArchiveLatestRow } from "../src/archive-summary.js";

test("municipal archive latest rows retain their territory identity", () => {
  assert.deepEqual(
    municipalArchiveLatestRow({
      territory_id: "municipality:58227",
      territory_name: "Longueuil",
      max_customers: 17,
      sort_time: "2026-07-10 11:46:39",
    }),
    {
      key: "previous_archive_latest",
      territoryId: "municipality:58227",
      territoryName: "Longueuil",
      customersAffected: 17,
      startTime: "2026-07-10 11:46:39",
    },
  );
});
