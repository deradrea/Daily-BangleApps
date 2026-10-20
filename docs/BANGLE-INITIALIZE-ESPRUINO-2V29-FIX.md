# Dedicated initialization: Espruino 2v29 numeric validation

Vera Web reported `Error: Function "isInteger" not found!` while opening maintenance with immutable package 54ee. The bootstrap provider used Number.isInteger, which is unavailable on the reported device. The consumer had not reported a plan/apply transition. This is not proof that every earlier bootstrap write was absent.

The provider now uses a local finite numeric integer predicate based on typeof, global isFinite and Math.floor. No global polyfill, protocol change, sensor/runtime change, JSON change or firmware update. All target files remain the canonical 545d runtime and essential base; only bootstrap provider/provenance change.

Regression: the complete provider lifecycle runs in a VM with Number.isInteger and Number.isFinite absent. NaN, infinities, fractions, strings and null are rejected for binding, target and paging/chunk indices. A source guard rejects unsupported Number predicates in every new bootstrap script. Full Vera Node suite: 155 passing tests.

## Recovery boundaries

Before changing any file on an interrupted device, record the six exact bootstrap hashes and the presence of verai.state0, verai.state1, verai.plan, verai.oldboot, verai.oldhash, the provider status, recovery flag and .boot0 hash. The isInteger exception is thrown before prepare persists state or isolates, but previous attempts may already have a journal.

- Any journal, plan, boot backup or unknown bootstrap: stop. Preserve the same binding and plan; do not reset, erase, silently replace a provider or create a fresh destructive operation. A separately reviewed maintenance recovery is required.
- Only the six exact 54ee bootstrap files, unprepared provider, no journal/plan/boot backup and original non-recovery boot confirmed: an explicit backend repair transition may retain the same operation UUID and actor/MAC/assignment while recording old and new package SHA, only in prepared state with null plan and apply_consumed=false. Invalidate old grants and issue a newly bound preparation grant. This is a proposed additional backend transition, not part of the original API contract or an existing authorization.
- Under that verified transition, the consumer may replace only verai.provider.js from the new immutable asset using staging plus readback. Remove only its cached module with the official Modules.removeCached API, recreate the provider using the unchanged official platform and confirm unprepared state before prepare. No reset or deletion of user samples/apps is part of this repair. Unknown/partial repair writes remain blocked for assisted recovery; never guess from an exception or UI label.
- New package means a new SHA-bound authorization. Never reuse a grant or plan from 54ee for another package hash. A catalog change alone cannot migrate a pending operation.

Official correction: `veranode-initialize-1-d335c6ff747279b3`, SHA256 `d335c6ff747279b30ccf8d16cdc9917218fa0b6bc0f44b2c3eee2b07aff0a382`, 263364 bytes. Source commit `6f93a2f4f4e460ab4f35497b6d356c24c9613643`, artifact tag commit `cacb08637`. Old provider hash `2f6958244a1be4fa8374277280d3cdc4c7875479ff82a5485a23332742578f9a`; corrected provider hash `664b915498229445b578bad61578588349c578a1555058bd909b6c8bdfa58b5a`. Other five bootstrap files and all22 targets are identical. Cache API reference: https://www.espruino.com/Reference#l_Modules_removeCached .

No hardware connection, reload, erasure or installation has been performed by the Mobile/Bangle owner during preparation of this fix. Physical validation belongs to the separately authorized Web trial.
