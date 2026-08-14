# V035 Historical Replay: 2026-07-28

## Scope

- Task: `cms4wmzes000uqs07m0a4q8ze`
- Source window: 2026-07-28 17:23:01 to 17:23:24 local collection time.
- Evidence: the five retained, route-verified snapshots and their original visible table/label evidence.
- Mode: read-only historical review. It did not create a `DecisionRun`, `ActionProposal`, feedback record, audit record, or external-platform action.

This is not a V035 formal AI acceptance result. The evidence is older than the 10-minute freshness policy and was captured before v034 binding calibration. It must not be sent to DeepSeek or used for a current budget, bid, pause, or approval decision.

## Evidence Coverage

| Route | Status at collection | Historical evidence |
| --- | --- | --- |
| Live overview | VERIFIED / MATCHED | Overview labels and metrics |
| Live products | VERIFIED / MATCHED | Ten visible product rows with header labels |
| Live traffic | VERIFIED / MATCHED | Cumulative viewers and hourly traffic labels |
| Local promotion dashboard | VERIFIED / MATCHED | Dashboard labels and top-ten product table |
| Local promotion task table | VERIFIED / MATCHED | Task status, budget, ROI, spend, and order columns |

The original review records contain 31 confirmed metrics and 358 confirmed table cells. Their old standardized values are not reused where they lack v034 field-binding evidence.

## Recomputed Historical Facts

### Live Overview

The visible overview labels showed:

- Live GMV: `217,143 yuan`
- Product click rate: `20.77%`
- GPM: `2,893.05 yuan`
- Orders: `6,733`
- Cumulative impressions: `1,212,365`
- Live viewers: `57,086`

These are retained exactly as page-labelled historical facts. They are not recombined with other route metrics unless the page labels share the same scope and time window.

### Live Product Table (Ten Visible Rows)

The table header explicitly identifies payment amount, payment orders, product exposures, product clicks, and refund orders. Recalculated from the ten visible rows:

- Payment amount: `206,475.10 yuan`
- Payment orders: `3,554`
- Product exposures: `440,736`
- Product clicks: `12,140`
- Aggregate exposure-to-click rate: `2.75%`
- Refund orders: `493`
- Aggregate refund-order rate: `13.87%`

Product concentration within those ten rows is high:

- Top product payment amount: `145,358 yuan`, or `70.40%` of the ten-row payment amount.
- Top three products: `187,423 yuan`, or `90.77%` of the ten-row payment amount.
- The ten rows account for `95.09%` of the live-overview GMV, but their payment orders must not be compared directly with overview order count without confirming the two page definitions.

### Local Promotion Dashboard

Visible dashboard labels showed:

- Overall GMV: `43.85 wan yuan` (`438,500 yuan` displayed value)
- All-domain GMV: `42.03 wan yuan` (`420,300 yuan` displayed value)
- All-domain spend: `6,789.05 yuan`
- All-domain payment ROI: `61.91`
- Overall payment ROI: `64.59`
- Overall orders: `21,411`

The visible top-ten product table totals:

- Overall GMV: `279,550.30 yuan` (`63.75%` of displayed overall GMV)
- All-domain GMV: `269,990.70 yuan` (`64.24%` of displayed all-domain GMV)
- All-domain orders: `5,364` (`25.05%` of displayed overall orders; the labels are not identical, so this is coverage information, not a conversion-rate calculation)

The leading visible product contributes `239,489 yuan` overall GMV and `235,759 yuan` all-domain GMV, about `85.67%` and `87.32%` respectively of the ten-row table totals.

### Task Table

The two visible investment rows were both marked `paused`, with current spend, orders, and ROI shown as `0`. Their displayed daily budgets were `3,101 yuan` and `600 yuan`. These are historical page states only; they are not an instruction to resume, pause, or change any task.

## Invalid Historical Standardizations

The following older normalized metrics conflict with their page labels and are excluded from this replay:

| Route | Old stored value | Why excluded |
| --- | --- | --- |
| Local promotion dashboard | GMV `43 yuan` | The page label says `43.85 wan yuan`; the old parser lost the `wan` magnitude and decimal. |
| Local promotion dashboard | All-domain payment ROI `61` | The page label says `61.91`; the old value lost displayed precision. |
| Task table | GMV `178,556.84 yuan` | The raw text identifies this number as available account balance, not GMV. |
| Live product tab | GMV `1 yuan`, orders `1,558`, click rate `2.12%` as one route-level metric set | These values originate from different product-card/table contexts and do not form one route-level aggregate without binding evidence. |

The live overview's `20.77%` product click rate and `2,893.05 yuan` GPM are not treated as arithmetic conflicts with cumulative page metrics because their denominators are page-specific and the old snapshot lacks the current field-binding metadata.

## Historical Findings (Non-actionable)

1. The visible product mix was highly concentrated in a small number of voucher products, especially the `100 yuan` voucher product.
2. The historical product table showed a material aggregate refund-order rate (`13.87%` across the ten visible rows), with one major product row displaying `38.49%` refund rate. This requires current-period verification before any merchandising conclusion.
3. The two visible local-promotion tasks were paused with zero delivery at the snapshot time. This explains why a task-level table alone cannot be used to infer current advertising effectiveness.
4. Dashboard-level ROI and GMV were present in the raw labels, but their historical standardizations are not sufficiently bound to be used as AI evidence.

## Required Before Formal V035 AI Acceptance

1. Recollect the five routes in the current time window.
2. Confirm account ownership, field bindings, metric values, and table cells in the v034 calibration flow.
3. Keep any invalid, missing, stale, or conflicting evidence out of the AI input.
4. Only then start the local worker with a process-only rotated DeepSeek key and `AI_DIAGNOSIS_ENABLED=true` for a single formal DecisionRun.
