# Support Assistant conversational replies

Conversational replies are an optional, flag-off fallback for the Support
Assistant's `no_match`, `greeting`, `small_talk`, `too_short`, and `off_topic`
notices. Guide matching, intake, and the answer engine continue to run as
before.

## Configuration

Keep `HELP_DESK_ASSISTANT_CHAT_ENABLED=false` until the feature is reviewed and
ready. Enabling it requires `HELP_DESK_AI_ENABLED=true`,
`HELP_DESK_AI_PROVIDER=anthropic`, and a server-side `ANTHROPIC_API_KEY`.
The chat API uses the shared daily AI call budget and allows 30 requests per
IP per hour. Provider requests time out after eight seconds.

## Safety and rollout

The API validates and re-screens every user turn before sending anything to
Anthropic. It does not send sensitive messages, and it returns a static notice
when the provider is unavailable, the request is rate-limited, or the shared
budget is exhausted. Model output is redacted and screened sentence by
sentence; unsafe sentences are removed and the displayed reply is capped at
700 characters. Conversational replies are informational only and cannot
execute actions or replace approved guide matching.

Turn the feature off immediately by setting
`HELP_DESK_ASSISTANT_CHAT_ENABLED=false`. No SQL migration or hosted setting
change is part of this code-only feature.
