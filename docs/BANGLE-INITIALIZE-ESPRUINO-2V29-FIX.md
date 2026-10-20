# Dedicated initialization: Espruino 2v29 numeric validation

Vera Web reported `Error: Function "isInteger" not found!` while opening maintenance with immutable package 54ee. The bootstrap provider used Number.isInteger, which is unavailable on the reported device. The consumer had not reported a plan/apply transition. This is not proof that every earlier bootstrap write was absent.

The provider now uses a local finite numeric integer predicate based on typeof, global isFinite and Math.floor. No global polyfill, protocol change, sensor/runtime change, JSON change or firmware update. All target files remain the canonical 545d runtime and essential base; only bootstrap provider/provenance change.

Regression: the complete provider lifecycle runs in a VM with Number.isInteger and Number.isFinite absent. NaN, infinities, fractions, strings and null are rejected for binding, target and paging/chunk indices. A source guard rejects unsupported Number predicates in every new bootstrap script. Full Vera Node suite: 155 passing tests.

## Recovery boundaries

Before changing any file on an interrupted device, record the six exact bootstrap hashes and the presence of verai.state0, verai.state1, verai.plan, verai.oldboot, verai.oldhash, the provider status, recovery flag and .boot0 hash. The isInteger exception is thrown before prepare persists state or isolates, but previous attempts may already have a journal.

- Any journal, plan, boot backup or unknown bootstrap: stop. Preserve the same binding and plan; do not reset, erase, silently replace a provider or create a fresh destructive operation. A separately reviewed maintenance recovery is required.
- Only the six exact 54ee bootstrap files, unprepared provider, no journal/plan/boot backup and original non-recovery boot confirmed: the obsolete bootstrap can be replaced by the newly verified package in an explicit retry, after the consumer closes/cancels the old server operation without authorizing apply and performs a controlled software reload to clear the old in-memory module. Recheck the absence of a journal and active provider after reload. These are conditions, not a command to run on an uninspected watch.
- New package means a new SHA-bound authorization. Never reuse a grant or plan from 54ee for another package hash.

No hardware connection, reload, erasure or installation has been performed by the Mobile/Bangle owner during preparation of this fix. Physical validation belongs to the separately authorized Web trial.
