# G5 organization AI action policy

`HELP_DESK_ORG_ACTION_POLICY_ENABLED` defaults to `false`. Keep it off until
the policy schema and organization-admin workflow have been reviewed. When it
is off, policy loading returns before reading policy tables.

## Migration and audit chain

Apply `supabase/org-action-policy.sql` after `supabase/identity-risk.sql` and
before `supabase/audit-chain.sql`; keep the audit-chain migration last. The
production run order contains 18 SQL files. This change only authors the
migrations; it does not apply SQL or change hosted settings.

Policy rows are organization-scoped. Policy events are append-only and remain
available if a policy row is deleted. Policy changes are also written to the
application audit log.

## Policy behavior

| Rules relevant to a capability               | Result                                              |
| -------------------------------------------- | --------------------------------------------------- |
| Any matching deny, including a wildcard deny | Denied; deny always wins                            |
| Allow rules, but none match the requester    | Denied as out of scope                              |
| Only non-matching deny rules                 | Allowed at the existing ladder tier                 |
| Matching allows                              | Most permissive matching tier, capped by the ladder |
| Autorun allow outside its configured window  | Capped at requester consent                         |
| Matching allow requiring staff approval      | Technician approval is required                     |
| No relevant rules                            | Existing behavior and ladder tier are unchanged     |

Capability-specific matching allows take precedence over wildcard allows.
Missing group data fails closed: scoped denies match and scoped allows do not.
Valid windows use local weekday and time in their configured IANA time zone;
overnight windows continue into the next day.

## Directory group IDs

- **Microsoft Entra ID:** use the Graph directory group's object ID returned
  from the requester's `memberOf` memberships. Group-scoped decisions require a
  verified requester email and a successful directory read.
- **Google Workspace:** the current connector does not expose requester group
  membership for policy evaluation. Treat group membership as unavailable;
  scoped deny rules therefore block and scoped allow rules do not authorize.

Do not substitute display names or email addresses for stable group IDs.

## Browser verification

After applying the prerequisite migrations in a controlled test environment,
enable the flag only for that environment and sign in as an `org_admin`.
Confirm the policy page shows the empty-state message, create and edit rules,
try invalid group counts and time zones, and verify that a scoped rule displays
its tier, window, and approval requirement. Delete a rule and confirm its event
remains in the audit chain. Also verify that a non-admin and a flag-off
environment cannot open the page, and that requester-facing denial text does
not reveal rule notes, groups, or reasons.

Browser testing was not run for this code-only change.
