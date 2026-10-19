# Vera server clock candidate

Additive protocol 0.2.0 extension: `clock_sync.source=vera_server` is distinct
from `phone_auto`. Both retain the existing encrypted session, physical consent,
expected epoch/boot/revision, uncertainty limits, intent/applied journal and
readback requirements. The status capability is `clockServerSync=true`.

The Web uses authenticated same-origin HTTPS server UTC plus a bounded monotonic
elapsed interval. This is not an attestation of NTP accuracy or automatic PC time.
Timezone offset is the browser's local timezone. Server references expire after
24 hours and lose verification on reboot/discontinuity just like phone references.
No sample timestamps, rules, acquisition settings or user profiles are changed by
this protocol extension. Clients must not automatically retry clock/profile writes.

Mobile 109 retains its immutable 711c package. Its parser accepts the new quality
string and onboarding can resynchronize with `phone_auto`, but historical timeline
evidence for `vera_server` is not yet supported and remains conservatively unverified.
Do not claim full Mobile timeline equivalence or hardware validation for this release.
This candidate is test-only; no physical device operation was performed.
