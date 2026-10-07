# E1b setup: account risk and staff caller verification

E1b adds deterministic account-risk signals and a short-lived staff caller
verification path. Both flags are off by default and are effective only when
`HELP_DESK_IDENTITY_ASSURANCE_ENABLED=true`:

- `HELP_DESK_IDENTITY_RISK_SIGNALS_ENABLED`
- `HELP_DESK_STAFF_VERIFICATION_ENABLED`

The authored `supabase/identity-risk.sql` migration creates append-only staff
verification records. It has **not** been applied. Apply prerequisite
migrations first, then apply `identity-risk.sql` immediately before
`supabase/audit-chain.sql`; do not enable either flag until the migration and
audit-chain setup are complete.

## Directory permissions and signal limits

Entra uses the existing `User.Read.All`, `AuditLog.Read.All`, and
`UserAuthenticationMethod.Read.All` permissions. `RoleManagement.Read.Directory`
is optional and supplies directory-role privilege facts; without it, the
application falls back to the subject's organization role. Each directory
fact is queried independently, so an unavailable permission yields an unknown
fact rather than failing other lookups.

Google Workspace continues to use the existing user read/security scopes.
Current scopes do not provide sign-in country or MFA-change history, so those
signals remain unavailable for Google. Admin status, phone, and manager
relations come from the existing user resource.

Directory lookup is bounded to eight seconds. Phone, manager name, and
sign-in details are never sent to the model or written to logs. Only risk
levels and short reason codes are used for model-visible output and audit
details.

## Risk policy

| Signal                                                  | Assessment                                                     |
| ------------------------------------------------------- | -------------------------------------------------------------- |
| Prior account-capability request within 24 hours        | High                                                           |
| MFA change within 7 days                                | Elevated; high with a new sign-in country or impossible travel |
| New sign-in country / impossible travel within 24 hours | Elevated; high with recent MFA change                          |
| Enrolled device first seen within 24 hours              | Elevated                                                       |
| Text names another person or email                      | High                                                           |
| Privileged directory or organization role               | High                                                           |
| Request-history lookup unavailable                      | High and fail closed                                           |

High risk escalates without creating an approval request. Elevated risk requires
fresh A3 assurance bound to the current session/run. For technician approvals,
staff verification may satisfy assurance and override risk only after a
directory callback; privileged callers also require manager confirmation.
Verification is scoped to one organization, ticket, and subject and expires
after 15 minutes. Requester consent never receives the staff-verification
assurance.

## Staff workflow

On the ticket page, staff must call back only on the read-only directory
number. The panel records callback, manager confirmation for privileged
accounts, or an optional observed IdP push/passkey approval. Every tick is
append-only and also creates a ticket action, admin audit record, and run
event when a non-terminal run exists. Pending technician approvals are
scoped to the ticket; grant and deny actions are rechecked server-side.

Never accept security questions, employee ID, date of birth, or details from
past tickets as proof. If the directory has no phone number, do not use a
number from the ticket; escalate instead.

## Browser test plan

1. With identity assurance enabled but E1b flags off, confirm the panel is not
   rendered and existing gateway behavior is unchanged.
2. Confirm an A1 requester cannot perform an account action.
3. Submit ticket text such as “reset Alex's MFA” and confirm it escalates
   without an approval request.
4. Create a technician approval, verify the caller by directory callback,
   approve it, and confirm only the same ticket and subject proceed.
5. Confirm a privileged account additionally requires manager confirmation.
6. Advance past 15 minutes and confirm verification no longer enables approval.

The flags remain disabled until a controlled pilot, directory permissions,
migration, and audit checks are independently approved.
