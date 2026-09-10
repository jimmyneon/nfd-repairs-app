# Generic £10 paid reservation — DEFERRED

This experiment is intentionally **not part of the first Quote V2 production rollout**.

The preferred customer journey is now:

1. See repair price.
2. **I Want to Go Ahead** if ready now.
3. **Remind Me Later** if not ready: customer chooses when they hope to get the repair done and pays £0.
4. Two days beforehand, the system sends one reminder with the saved quote link.
5. When the customer goes ahead, staff checks stock/parts in the repair app.
6. If a special-order part requires a deposit, use the existing parts/deposit workflow at that point.

The SumUp reservation code remains on this branch as a future experiment only. Do not merge it unless conversion data later shows that a small generic paid reservation would improve commitment enough to justify the extra checkout friction.

If it is revisited later, the original controlled payment/refund/webhook testing must be completed before production use.
