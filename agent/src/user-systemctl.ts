import type { AgentExec, AgentExecOptions } from "./collectors/index";

type Session = {
  user: string;
  uid: string;
};

function findGraphicalSession(output: string): Session | null {
  for (const line of output.split(/\r?\n/)) {
    const fields = line.trim().split(/\s+/);
    const uid = fields[1];
    const user = fields[2];
    const seat = fields[3];
    if (uid && /^\d+$/.test(uid) && user && seat) return { user, uid };
  }
  return null;
}

export async function userSystemctl(
  exec: AgentExec,
  args: string[],
  options?: AgentExecOptions
): Promise<string> {
  if (process.getuid?.() !== 0)
    return exec("systemctl", ["--user", ...args], options);

  let sessions: string;
  try {
    sessions = await exec("loginctl", ["list-sessions", "--no-legend"]);
  } catch {
    throw new Error("No active graphical session user found.");
  }
  const session = findGraphicalSession(sessions);
  if (!session) throw new Error("No active graphical session user found.");

  return exec(
    "runuser",
    [
      "-u",
      session.user,
      "--",
      "env",
      `XDG_RUNTIME_DIR=/run/user/${session.uid}`,
      `DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/${session.uid}/bus`,
      "systemctl",
      "--user",
      ...args,
    ],
    options
  );
}
