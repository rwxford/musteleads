# Musteleads OCR Evaluation Harness

This is the regression gate for badge/card extraction. No extraction change
should merge if it lowers the score in `report.md`.

## Why this exists

Past OCR regressions came from hand-tuned heuristics with no test set. This
harness pins extraction quality to a labeled set of real images and scores
every change.

## How to add images (do this!)

Drop real photos into these folders:

- `fixtures/badges/` for conference badges (lanyard badges, name tags).
- `fixtures/cards/` for business cards.

Filename can be anything ending in `.jpg`, `.jpeg`, `.png`, or `.webp`.
Use a descriptive name, e.g. `space-symposium-ross-in-holder.jpg`.

Aim for variety, since that is what broke before:

- In plastic holder AND outside the holder.
- Portrait, landscape, and tilted/angled.
- Different events and badge layouts.
- A few business cards with email/phone/LinkedIn.
- Include the badges that previously failed (Space Symposium, Red Hat Summit,
  Enterprise AI Summit, etc.) if you still have them.

30 to 50 images total is a good first gold set.

## Labeling

Each image needs a sidecar JSON with the correct expected output. You can write
it by hand, or let the tool draft it for you:

1. `pnpm eval:label` runs OCR on every image that has no sidecar and writes a
   DRAFT `<name>.json` next to it.
2. Open each draft and fix the fields to the ground truth. A draft is NOT gold
   until a human has corrected it.

Sidecar shape (see `labels.schema.json`):

```json
{
  "firstName": "Ross",
  "lastName": "Weatherford",
  "company": "Coder",
  "title": "Director, US Public Sector",
  "email": "",
  "phone": "",
  "linkedIn": "",
  "eventName": "Space Symposium",
  "notes": "outside holder, slight tilt",
  "_skip": false
}
```

- Leave a field as `""` if it is genuinely not present on the badge/card.
- Set `_skip: true` to keep an image in the set but exclude it from scoring
  (e.g. an intentionally unreadable sample).

## Running the eval

```bash
pnpm eval          # runs both pipelines over all labeled fixtures, writes report.md
pnpm eval:label    # drafts sidecars for unlabeled images
```

The eval needs a reachable extraction endpoint and a model key. Configuration
and exact commands are documented at the top of `run.ts` once the harness lands.

## Output

`report.md` holds the latest scorecard: overall and per-field accuracy for
Pipeline A (Cloud Vision + LLM) vs Pipeline B (multimodal LLM). It is committed
so score changes show up in diffs.
