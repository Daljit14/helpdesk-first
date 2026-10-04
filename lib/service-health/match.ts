import type { ServiceIncident } from "./types";

const FAMILIES = {
  email: [
    "outlook",
    "email",
    "e-mail",
    "mail",
    "exchange",
    "gmail",
    "inbox",
    "calendar",
  ],
  chat_meetings: [
    "teams",
    "meeting",
    "call",
    "meet",
    "zoom",
    "slack",
    "chat",
    "webex",
  ],
  files: ["onedrive", "sharepoint", "drive", "docs", "sheets", "files", "sync"],
  identity: [
    "sign in",
    "sign-in",
    "signin",
    "login",
    "log in",
    "mfa",
    "password",
    "authenticator",
    "sso",
    "entra",
    "azure ad",
  ],
} as const;

function containsTerm(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "i").test(text);
}

export function matchIncidents(
  symptom: string,
  incidents: ServiceIncident[]
): ServiceIncident[] {
  const symptomText = symptom.toLowerCase();
  const families = Object.values(FAMILIES).filter((terms) =>
    terms.some((term) => containsTerm(symptomText, term))
  );
  return incidents
    .filter((incident) => incident.impact !== "informational")
    .filter((incident) => {
      const incidentText =
        `${incident.service} ${incident.title}`.toLowerCase();
      const familyMatch = families.some((terms) =>
        terms.some((term) => containsTerm(incidentText, term))
      );
      const serviceMatch =
        incident.service.length >= 4 &&
        symptomText.includes(incident.service.toLowerCase());
      return familyMatch || serviceMatch;
    })
    .sort(
      (left, right) =>
        Number(right.impact === "outage") - Number(left.impact === "outage")
    )
    .slice(0, 5);
}
