# Future: Where This Project Can Go

Date: 2026-04-25

## The real product question

The current prototype proves that the mechanics work:

- we can collect live Hydro-Quebec outage data
- we can archive raw snapshots
- we can match a searched address to nearby outages
- we can present a useful address-first interface

That is a meaningful start.

But it is not yet enough for the most compelling user question:

`How likely is this area to lose power, based on what has happened before?`

Right now, the main limitation is not UX or app structure. It is historical depth.

Without a meaningful archive, the app can show:

- what is happening now
- what we have observed since collection began
- what we know near a searched address

But it cannot yet make a strong claim about outage likelihood over time.

## What this means for the future

I do think this project has a real future.

The address-first direction still feels right because it is intuitive, locally relevant, and different from a generic outage map. People do not naturally think in terms of Hydro-Quebec feed objects or polygon IDs. They think:

- my address
- my street
- this neighborhood
- this municipality

So the product can become useful. The question is how to bridge the historical-data gap fast enough that it becomes useful before waiting one or two years for our own archive to mature.

## The key constraint

There are really two different timelines:

1. Product timeline
2. Data timeline

The product timeline is short. The app itself could become public fairly soon.

The data timeline is longer. If we depend only on our own collector, it may take one or two years before the historical layer becomes strong enough to support claims like:

- this area has frequent outages
- this sector tends to have longer restoration times
- this address is more outage-prone than nearby areas

That mismatch matters. A polished UI cannot compensate for thin history.

## The best strategic view

The project should probably be treated as a **history-building system with a public product on top**, not just as a normal web app.

That means its long-term value comes from combining:

- ongoing live collection
- raw archival discipline
- address-based lookup UX
- later derived analytics such as frequency, duration, and hotspot scoring

In other words:

- the app is the user-facing layer
- the archive is the real moat

## What to do about the missing history

I would not wait passively for the archive to grow.

The strongest path is to pursue three tracks in parallel.

### Track 1: keep collecting immediately

This is non-negotiable.

Even if we later get historical backfill from Hydro-Quebec, we should still keep building our own archive now because:

- it guarantees forward coverage
- it lets us validate any backfilled data against the live feed format
- it builds operational experience with parsing, deduplication, and outage-event reconstruction

If nothing else works, this becomes the seed of a valuable long-term dataset.

### Track 2: request historical data from Hydro-Quebec

This is the fastest route to usefulness if it works.

And in Quebec/Canada, this is generally not called a `FOIA` request. The usual term is:

- `access to information request`
- in French, `demande d'acces a l'information` or `demande d'acces a des documents`

For this project, I would actually try two approaches:

1. An informal or open-data-team request first
2. A formal access-to-information request second if needed

The informal/open-data route is attractive because it may be faster and more cooperative. The formal route is attractive because it creates a clearer process and deadline structure.

The request should be framed very carefully. The goal is not:

- please invent a new analysis for me

The goal is:

- please provide any existing historical outage datasets, logs, exports, retention details, or data dictionaries already used for Info-pannes or related outage systems

That framing matters because access regimes often require disclosure of existing records, but not creation of a brand-new dataset.

### Track 3: ship with explicit honesty about coverage

If the site goes public before strong historical backfill exists, it should be honest about what it knows.

That can still be useful if the product language is clear:

- live outage status now
- known outages observed since our archive start date
- local outage history based on currently available records
- confidence and completeness notes for each address

That is a much stronger product stance than pretending we already know a full five-year risk profile.

## My view on whether to launch early

I would be open to a limited early launch, but only if the framing is right.

An early version is probably best positioned as:

- an address-based outage history prototype
- a public archive that improves over time
- a transparency tool showing what is known and unknown

It is probably not yet best positioned as:

- a definitive outage-risk score for every area in Quebec

The risk of launching too aggressively is not just disappointment. It is trust. If users read "history" as "complete history" when we only mean "history since we started collecting," the product will feel misleading.

So I would launch early only with visible coverage dates and careful wording.

## What the project can become if history is solved

If we can get historical backfill, this becomes much more interesting very quickly.

Then the app can move from:

- outage lookup

to:

- outage pattern analysis
- neighborhood reliability comparisons
- likely outage exposure by area
- estimated frequency and duration summaries
- maps of repeat outage zones
- seasonal and storm-related pattern detection

At that point, the product stops being just "an outage archive" and starts becoming a real public-interest reliability lens for Quebec.

That is the future that feels most promising to me.

## Recommended near-term priorities

If I were choosing the next moves, I would prioritize them in this order:

1. Keep the collector running reliably and preserve raw data exactly.
2. Improve event reconstruction so repeated snapshots become coherent outage episodes.
3. Add clear coverage dates and confidence/completeness messaging in the UI.
4. Prepare a strong Hydro-Quebec historical data request.
5. Design the future analytics model now, even if the archive is still thin.

That fifth point matters. We do not need to wait for two years of data to design the metrics we eventually want, such as:

- outage count by address area
- total outage-hours affecting an area
- median restoration time
- worst day / worst month
- planned vs unplanned interruptions
- customer-count-weighted severity

We can design those now so the archive we build is ready to support them.

## Bottom line

I think the future is good if we treat the current prototype as the start of a data asset, not the end product.

The main challenge is not whether the app idea is sound. It is whether we can compress the time needed to build meaningful historical depth.

So my honest view is:

- yes, the project is promising
- yes, the address-first approach still makes sense
- no, I would not want to wait one or two years with no attempt to get backfill
- yes, an access-to-information path is worth pursuing now
- and yes, the public product can still launch earlier if it is explicit about coverage limits

The best future is probably a hybrid:

- collect continuously from now on
- aggressively pursue historical backfill
- launch with honest coverage
- evolve toward neighborhood-level outage likelihood and reliability analysis as the archive matures
