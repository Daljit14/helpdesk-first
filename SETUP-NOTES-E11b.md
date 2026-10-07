# E11b — answer-first assistant and community tips

E11b connects the answer-engine backend to the requester assistant and agent
chat. The answer engine remains informational: deterministic code controls
which cited answer content is displayed, and no answer-engine step can become
an agent action or autorun. No SQL was added or applied for E11b; the existing
E11a answer-engine schema already covers runs and feedback.

## Flags

All flags remain off by default:

- `HELP_DESK_ANSWER_ENGINE_ENABLED` enables answer-engine use.
- `HELP_DESK_ANSWER_ENGINE_PUBLIC_ENABLED` separately allows signed-out use.
- `HELP_DESK_COMMUNITY_TIPS_ENABLED` allows corroborated community tips to be
  shown. It has no effect unless the answer-engine flag is also enabled.
- Provider and page-fetch flags remain as documented in
  `SETUP-NOTES-E11a.md`.

The AssistantWorkspace and requester-agent tool are available only when the
answer-engine flag is enabled. Signed-out AssistantWorkspace use also requires
the public flag. Community tips require both the answer-engine and community
tips flags.

## Limits and budgets

- Signed-out answer requests: 2 per hour per IP.
- Signed-in answer requests: 10 per hour per user.
- Feedback submissions: 20 per hour per IP.
- The requester agent shares its three-call session cap between `search_web`
  and `find_answer`; both research-query and answer-engine run records count
  toward the same cap.
- Existing organization and global answer-engine budget limits are unchanged.

## Answer and step safety

Answers contain only cited, HTTPS sources. Official steps may be shown after
screening. Community tips are shown only when the user enables the community
tips flag and the step is corroborated by at least two independent
registrable domains. Community content is always labeled as unofficial and is
for the requester to perform themselves; it is never an action proposal.

The deterministic step screen withholds guidance involving credentials,
security tools, registry or policy changes, scripts or commands, unapproved
software installation, another account, administrator rights, or links.
Likely-cause and explanatory text use the same screen so instructions cannot
be moved outside the steps list. Withheld steps can trigger an IT handoff.

## Feedback and rollout checks

Requester feedback is stored against its answer-engine run. The existing
answer-engine metrics include feedback outcomes, which can inform the E4
knowledge-learning and quality-review loop; feedback does not automatically
promote content or change the answer policy.

Before enabling for requesters, configure and verify the required provider
credentials and complete a controlled sample of at least 30 real problems
with no approved-guide match. Turn-on checks are at least 80% cited answers
and p90 response time under 12 seconds. These provider-dependent acceptance
checks cannot be measured by the offline fake-provider evaluation. Keep all
flags off until the review is complete and rollout is explicitly approved.
