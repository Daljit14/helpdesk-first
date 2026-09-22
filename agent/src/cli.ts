import { main } from "./main";

void main().catch(() => {
  process.stderr.write("helpdesk-agent command failed\n");
  process.exitCode = 1;
});
