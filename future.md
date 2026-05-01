# Future: Where This Project Can Go

Date: 2026-05-01

## The core product question has not changed

The most important user question is still:

`How likely is this area to lose power, based on what has happened before?`

That is still the right north star.

What has changed is that the path toward answering it looks better than it did before.

The project is no longer just:

- a live-feed collector
- an address lookup UI
- a long wait for our own archive to mature

It is becoming a more credible historical system with multiple ways to build evidence.

## What is better now

There are three meaningful improvements in the project direction.

### 1. The app already has the right honesty model

The product is now clearly structured around:

- address-first lookup
- bilingual UX
- explicit coverage windows
- explicit limits on what the archive does and does not contain

That matters a lot.

One of the biggest risks for a project like this is overclaiming historical completeness. The current direction is better because it does not pretend to know more than it knows. It can say:

- here is what we know near this address
- here is the time span our archive currently covers
- here is when the latest snapshot was collected
- here is the confidence level implied by the source data and matching method

That is a strong foundation for trust.

### 2. The project now has a real middle path for history

The biggest strategic update is the new research on published access-to-information disclosures.

That changes the outlook.

Before, the historical-data strategy was mostly:

- collect from now on
- ask Hydro-Quebec for backfill

Now there is an additional track:

- ingest historical data that Hydro-Quebec has already disclosed in published PDF and XLSX responses

This is not a complete province-wide archive, and it is not a substitute for the live Info-pannes feed. But it is much more important than it might look at first.

It proves at least four things:

- Hydro-Quebec has structured historical outage data internally
- some of that history has already been released in row-level form
- at least some requests can produce machine-readable extracts, not just PDFs
- we can start compressing the "wait one or two years" problem right now

That is a meaningful shift in the future of the project.

### 3. The app is starting to act like a system, not just a prototype

The codebase now has the pieces of a durable approach:

- raw snapshot archival
- normalized database tables
- geocoding and address normalization
- derived address-to-outage matching
- first-pass event resolution
- UI surfacing for archive span and freshness

That means the project has crossed an important line. It is no longer just testing whether the idea is plausible. It is starting to define the actual architecture of a long-lived historical product.

## The future is now a three-track strategy

The most useful way to think about the future is as three parallel data tracks feeding one public product.

### Track A: live feed archival

This remains the backbone.

We should continue collecting the Hydro-Quebec public outage feeds on schedule and preserving the raw payloads exactly as received.

This gives us:

- forward coverage we control ourselves
- defensible raw evidence
- a canonical stream for rebuilding derived event logic later
- the future basis for hotspot calculations and reliability metrics

No matter what else happens, this track should continue.

### Track B: published access-to-information disclosures

This is the new acceleration track.

It probably will not produce a complete historical map of Quebec in one step, but it can materially improve the usefulness of the product much sooner than waiting for our own archive to grow.

This track is promising because it includes:

- row-level municipal or borough outage tables in PDF
- at least one XLSX extract with richer operational fields
- annual regional aggregate metrics
- disclosure letters that explain scope and terminology

That opens up a much more realistic intermediate future:

- address-first history from the live archive where we have it
- municipality or neighborhood history from disclosed records where available
- regional benchmarks from aggregate disclosures

In other words, the product does not need to choose between "almost no history" and "complete province-wide history." There is now a middle layer.

### Track C: direct requests for deeper backfill

This still matters.

The open-data request and, if needed, a formal access-to-information request are still worth pursuing because they remain the best path to a broader and cleaner historical dataset.

The important difference now is that those requests are no longer speculative in the same way. We have stronger evidence that:

- the records exist
- Hydro-Quebec can export them
- some extracts have already been publicly disclosed

That should make future requests more concrete and better targeted.

## What the product can become before full backfill exists

This is the biggest practical update to my thinking.

Earlier, the product risk was that without years of history it might not be useful enough. I still think that risk is real, but I now think the "useful before complete" version is more viable than it first appeared.

The near-future product can become:

- a trustworthy address lookup for known outage history near an address
- a transparent archive showing live-feed coverage windows
- a place where selected municipalities or boroughs have deeper historical pages based on disclosed records
- a comparative tool using regional aggregate reliability context

That is not yet a full outage-likelihood engine for all of Quebec, but it is already a real public-interest product.

## The most likely product evolution

The future probably unfolds in stages.

### Stage 1: trustworthy archive and address lookup

This is where the project is heading now.

The key promise is:

- we preserve evidence
- we show what we know
- we show the limits clearly

### Stage 2: partial historical enrichment

This is the next important leap.

At this stage, the product starts combining:

- the live archived feed
- reconstructed outage episodes
- disclosed municipal or borough tables
- regional aggregate comparisons

This can support features like:

- deeper pages for areas where disclosures exist
- comparisons between a searched address area and its broader region
- cause summaries by municipality where row-level records exist
- "known history depth" indicators that vary by area

### Stage 3: broader reliability analysis

If backfill succeeds, then the project can move into the most compelling territory:

- outage frequency by area
- total outage-hours by area
- restoration-time distributions
- seasonal or storm-period patterns
- hotspot surfaces built from repeated outage exposure
- public-interest reliability comparisons across municipalities or neighborhoods

That is the version where this stops being mainly an archive and becomes a real reliability-analysis product.

## Where the main risks still are

The future is better, but there are still clear constraints.

### 1. Historical data will stay uneven for a while

Even with access-to-information disclosures, coverage will probably be patchy:

- some municipalities
- some boroughs
- some time windows
- some records as PDF only
- some records as aggregate summaries rather than event lists

So the product should continue to embrace unevenness explicitly instead of trying to smooth it over.

### 2. Geographic precision will remain limited

A lot of the disclosed historical material appears to be municipality-level or area-level, not precise outage polygons.

That means we should be careful about claims at the parcel or building level, especially for backfilled historical records that did not originate as geometry-rich live feed captures.

### 3. Event reconstruction is still a key technical problem

The long-term value of the archive depends on turning repeated snapshots into coherent outage episodes.

This is still one of the most important technical investments because almost every future metric depends on it:

- frequency
- duration
- severity
- area exposure
- worst-day analysis

If event reconstruction stays weak, the analytics layer will stay fragile.

## What I would prioritize next

Given the current state of the docs and the code, I would now prioritize the future work this way:

1. Keep the live collector reliable and automated.
2. Improve event reconstruction so repeated snapshots become better outage episodes.
3. Add an ingestion path for published access-to-information records, especially the machine-readable XLSX and the highest-value row-level PDFs.
4. Extend the UI's coverage and provenance language so users can see whether a result comes from live-feed archive data, disclosed historical records, or both.
5. Continue pursuing Hydro-Quebec for broader historical backfill.

That order reflects the new reality:

- the collector is still the spine
- event logic is still the hard technical core
- disclosed records are now the best short-term leverage
- provenance needs to stay visible so the product remains trustworthy

## Bottom line

I am more optimistic about the future of this project than I was before the latest updates.

The strongest reason is not just that the app has improved. It is that the data strategy is now more credible.

We no longer have only two unsatisfying options:

- wait years for our own archive
- hope Hydro-Quebec eventually hands over a clean province-wide history

There is now a third path in the middle:

- build the live archive
- ingest already published historical disclosures
- and use that mixed evidence model to make the product useful sooner

So my updated view is:

- the address-first direction still makes sense
- the honest-coverage UX is exactly the right product posture
- access-to-information disclosures are now a serious product input, not just background research
- broader Hydro-Quebec backfill is still worth pursuing
- and the project can become genuinely useful before full historical completeness exists

The best future now looks like a layered public-history product:

- live archive as the foundation
- disclosed historical records as acceleration
- better event reconstruction as the bridge
- and, over time, a real Quebec outage reliability lens on top
