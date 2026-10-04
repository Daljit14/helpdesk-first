import { record, type Collector } from "./index";

function countTicketRows(output: string): number {
  let inTicketTable = false;
  let count = 0;
  for (const line of output.split(/\r?\n/)) {
    if (/^\s*(?:Valid starting|Issued)\b/i.test(line)) {
      inTicketTable = true;
      continue;
    }
    if (inTicketTable && /(?:krbtgt\/|@)/i.test(line)) count += 1;
  }
  return count;
}

export function kerberosCredentialCollector(): Collector {
  return {
    kind: "credential_health",
    run: async (exec) => {
      let tickets = 0;
      let expired = 0;
      try {
        const output = await exec("klist", []);
        tickets = countTicketRows(output);
        expired = output
          .split(/\r?\n/)
          .filter((line) => /expired/i.test(line)).length;
        if (tickets > 0) {
          try {
            await exec("klist", ["-s"]);
          } catch {
            expired = Math.max(expired, tickets);
          }
        }
      } catch {
        tickets = 0;
        expired = 0;
      }
      return record("credential_health", {
        storedCredentials: null,
        kerberosTickets: tickets,
        kerberosExpired: expired,
        stale: expired > 0,
      });
    },
  };
}
