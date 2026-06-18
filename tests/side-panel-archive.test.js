import assert from "node:assert/strict";
import { test } from "node:test";

import { geometryStyle } from "../app/static/map-layers.js";
import {
  layerInfoContent,
  mapLayerMatchesForPayload,
  previousArchiveHeaderCount,
  previousArchiveLineItems,
  previousArchiveMapItems,
  previousLocalSummary,
  shouldRenderPreviousArchiveSummary,
} from "../app/static/side-panel.js";

test("prefers municipal territory bins as previous archive line items", () => {
  const items = previousArchiveLineItems(
    {
      mode: "municipal_archive",
      territories: [
        {
          territoryName: "Montréal",
          designation: "Municipalité",
          eventCount: 42,
          customersAffected: 1200,
          latestStartTime: "2026-06-14 10:30:00",
          geometryKey: "municipal_archive:06066",
          centroidLat: 45.5,
          centroidLon: -73.6,
        },
        {
          territoryName: "Lac-Jérôme",
          designation: "Territoire non organisé",
          eventCount: 7,
          customersAffected: 80,
          latestStartTime: "2026-06-13 09:00:00",
        },
      ],
    },
    { previous_archive_events: "events" },
  );

  assert.deepEqual(items, [
    {
      label: "Montréal",
      designation: "Municipalité",
      eventCount: 42,
      count: 1200,
      icon: "map",
      variant: "municipal_archive",
      focus: {
        kind: "previous_outage",
        matchType: "municipal_archive",
        geometryKey: "municipal_archive:06066",
        geometry: undefined,
        lat: 45.5,
        lon: -73.6,
        label: "Montréal",
        startTime: "2026-06-14 10:30:00",
        customersAffected: 1200,
        eventCount: 42,
        territoryId: undefined,
        designation: "Municipalité",
      },
    },
    {
      label: "Lac-Jérôme",
      designation: "Territoire non organisé",
      eventCount: 7,
      count: 80,
      icon: "map",
      variant: "municipal_archive",
      focus: {
        kind: "previous_outage",
        matchType: "municipal_archive",
        geometryKey: undefined,
        geometry: undefined,
        lat: undefined,
        lon: undefined,
        label: "Lac-Jérôme",
        startTime: "2026-06-13 09:00:00",
        customersAffected: 80,
        eventCount: 7,
        territoryId: undefined,
        designation: "Territoire non organisé",
      },
    },
  ]);
});

test("counts municipal archive territories for the layer header", () => {
  assert.equal(
    previousArchiveHeaderCount({
      mode: "municipal_archive",
      territories: [{ territoryName: "Montréal" }, { territoryName: "Lac-Jérôme" }],
    }),
    2,
  );
  assert.equal(previousArchiveHeaderCount({ mode: "legacy", territories: [] }), null);
});

test("renders previous archive summaries even when there are no raw matches", () => {
  assert.equal(
    shouldRenderPreviousArchiveSummary("previous", {
      previousMode: "recent_archive",
      previousArchiveSummary: {
        mode: "municipal_archive",
        territories: [{ territoryName: "Montréal" }],
      },
    }),
    true,
  );
  assert.equal(
    shouldRenderPreviousArchiveSummary("previous", {
      previousMode: "seen_before_here",
      previousArchiveSummary: { mode: "municipal_archive", territories: [] },
    }),
    false,
  );
});

test("does not render an empty municipal archive summary as a populated archive", () => {
  assert.equal(
    shouldRenderPreviousArchiveSummary("previous", {
      previousMode: "recent_archive",
      previousArchiveSummary: { mode: "municipal_archive", territories: [] },
    }),
    false,
  );
});

test("builds local stability summary copy from previous layer payloads", () => {
  assert.deepEqual(
    previousLocalSummary(
      {
        previousMode: "seen_before_here",
        previousRadiusM: 5000,
        previousNearestLimit: 24,
        previousSidebarMatches: [{ kind: "previous_outage" }, { kind: "previous_outage" }],
      },
      {
        local_reliability_summary_title: "Local stability evidence",
        local_reliability_summary_body:
          "Retained nearby outage records: {count} within {radius_km} km. Higher counts mean the local archive has seen more interruptions nearby.",
        local_reliability_summary_meta: "All retained records within {radius_km} km shown",
      },
    ),
    {
      title: "Local stability evidence",
      body: "Retained nearby outage records: 2 within 5 km. Higher counts mean the local archive has seen more interruptions nearby.",
      meta: "All retained records within 5 km shown",
      count: 2,
      limit: 24,
      radiusKm: "5",
    },
  );

  assert.equal(previousLocalSummary({ previousMode: "recent_archive" }), null);
});

test("turns municipal archive bins into previous outage map items", () => {
  const geometry = {
    type: "Polygon",
    coordinates: [
      [
        [-73.7, 45.4],
        [-73.5, 45.4],
        [-73.5, 45.6],
        [-73.7, 45.6],
        [-73.7, 45.4],
      ],
    ],
  };
  const summary = {
    mode: "municipal_archive",
    territories: [
      {
        territoryId: "municipality:06066",
        territoryName: "Montréal",
        designation: "Municipalité",
        eventCount: 42,
        customersAffected: 1200,
        latestStartTime: "2026-06-14 10:30:00",
        geometryKey: "municipal_archive:municipality:06066",
        centroidLat: 45.5,
        centroidLon: -73.6,
        geometry,
      },
    ],
  };

  assert.deepEqual(previousArchiveMapItems(summary), [
    {
      kind: "previous_outage",
      matchType: "municipal_archive",
      geometryKey: "municipal_archive:municipality:06066",
      geometry,
      lat: 45.5,
      lon: -73.6,
      label: "Montréal",
      startTime: "2026-06-14 10:30:00",
      customersAffected: 1200,
      eventCount: 42,
      territoryId: "municipality:06066",
      designation: "Municipalité",
    },
  ]);
  assert.deepEqual(mapLayerMatchesForPayload("previous", [], { previousArchiveSummary: summary }), [
    previousArchiveMapItems(summary)[0],
  ]);
});

test("styles municipal archive bins more visibly than previous outage event polygons", () => {
  const municipalArchiveStyle = geometryStyle(
    { kind: "previous_outage", matchType: "municipal_archive" },
    1,
  );
  const eventPolygonStyle = geometryStyle(
    { kind: "previous_outage", matchType: "previous_query_match" },
    1,
  );

  assert.ok(municipalArchiveStyle.weight > eventPolygonStyle.weight);
  assert.ok(municipalArchiveStyle.opacity > eventPolygonStyle.opacity);
  assert.ok(municipalArchiveStyle.fillOpacity < eventPolygonStyle.fillOpacity);
});

test("provides complete side-panel info content for every layer", () => {
  for (const layer of ["current", "planned", "previous", "published"]) {
    const info = layerInfoContent(layer, {
      [`layer_info_${layer}_title`]: `${layer} title`,
      [`layer_info_${layer}_body`]: `${layer} body`,
      [`layer_info_${layer}_provenance`]: `${layer} provenance`,
      [`layer_info_${layer}_layout`]: `${layer} layout`,
      [`layer_info_${layer}_map`]: `${layer} map`,
      layer_info_provenance: "Provenance",
      layer_info_layout: "Layout",
      layer_info_map: "Map",
    });

    assert.equal(info.title, `${layer} title`);
    assert.equal(info.body, `${layer} body`);
    assert.deepEqual(
      info.sections.map((section) => section.heading),
      ["Provenance", "Layout", "Map"],
    );
    assert.equal(info.sections.length, 3);
  }
});
