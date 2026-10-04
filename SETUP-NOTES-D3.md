# D3 live service health

D3 is disabled by default. Keep `HELP_DESK_SERVICE_HEALTH_ENABLED=false` until
the migration and provider access have been reviewed and configured.

## Schema

The additive migration is `supabase/service-health.sql`. It has **not** been
applied. Apply it after `supabase/requester-agent-vision.sql`; it extends the
existing `agent_steps_kind_check` with `service_incident`. The migration
creates tenant-scoped Statuspage sources and requester outage subscriptions.

## Sources

- **Microsoft 365:** configure the Entra application with the Microsoft Graph
  application permission `ServiceHealth.Read.All`, then grant admin consent.
  The integration reads `/admin/serviceAnnouncement/issues` using the active
  Entra connector with `$select=id,title,service,status,isResolved,classification,startDateTime`,
  following at most five pages. Incidents link to the generic Microsoft 365
  service-health page; the issue-specific deep-link format is unverified.
- **Google Workspace:** when the active identity connector is Google, the
  integration reads the public
  `https://www.google.com/appsstatus/dashboard/incidents.json` feed. No
  credential is required.
- **Statuspage:** organization admins can add up to 10 HTTPS status-page
  origins under Admin → Integrations. The base URL is validated both when
  saved and before each fetch. Incident IDs are stored as
  `<sourceRowId>:<incidentId>`.

## Cache and restoration notifications

The service-health snapshot uses Upstash Redis when configured through
`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, or the Vercel Upstash
integration fallbacks `KV_REST_API_URL` and `KV_REST_API_TOKEN`. Missing or
unavailable Redis falls back to a five-minute in-memory cache.

The restoration cron is scheduled daily at `0 13 * * *`, within Vercel Hobby's
daily cron limit. On a Vercel Pro plan, a 15-minute cadence is recommended for
faster restoration notifications.

## Rollback

Set `HELP_DESK_SERVICE_HEALTH_ENABLED=false` to hide the requester/admin
surfaces and stop service-health tool and cron behavior. The migration remains
additive and can be left in place while the feature is disabled.
