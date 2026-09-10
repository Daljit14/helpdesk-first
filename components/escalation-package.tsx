import type { EscalationPackage } from "@/lib/investigation/escalation";
import { riskLabel } from "@/lib/investigation/policy";
import { formatHandoffReason } from "@/lib/tickets/routing";

function Empty() {
  return <span className="text-muted-foreground">None recorded</span>;
}

function OutcomePill({
  outcome,
}: {
  outcome: "worked" | "failed" | "could_not_perform";
}) {
  const styles = {
    worked: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
    failed: "bg-red-500/15 text-red-800 dark:text-red-200",
    could_not_perform: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
  };
  return (
    <span className={`glass-pill px-2 py-0.5 text-xs ${styles[outcome]}`}>
      {outcome === "could_not_perform" ? "Could not perform" : outcome}
    </span>
  );
}

function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-muted/30 p-4">
      <h3 className="font-medium">{title}</h3>
      <div className="mt-2 text-sm">{children}</div>
    </div>
  );
}

export function EscalationPackageCard({
  pkg,
  snapshotAt,
}: {
  pkg: EscalationPackage;
  snapshotAt: string | null;
}) {
  const rootCause = pkg.likelyRootCause;
  const confidence = rootCause
    ? Math.max(0, Math.min(1, rootCause.confidence))
    : 0;
  return (
    <section className="glass-strong mt-6 space-y-5 p-5" aria-label="Diagnosis">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Diagnosis</h2>
        <span className="glass-pill px-2 py-1 text-xs">
          {snapshotAt
            ? `Snapshot at ${new Date(snapshotAt).toLocaleString()}`
            : "Live"}
        </span>
      </div>

      <div>
        <h3 className="font-medium">Likely root cause</h3>
        {rootCause ? (
          <>
            <div className="mt-2 flex items-center justify-between gap-3 text-sm">
              <span>{rootCause.cause}</span>
              <span>{Math.round(confidence * 100)}%</span>
            </div>
            <div
              className="mt-1 h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={Math.round(confidence * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.round(confidence * 100)}%` }}
              />
            </div>
            <p className="mt-3 text-sm font-medium">Why</p>
            {rootCause.evidence.length > 0 ? (
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {rootCause.evidence.map((evidence) => (
                  <li key={evidence}>“{evidence}”</li>
                ))}
              </ul>
            ) : (
              <Empty />
            )}
          </>
        ) : (
          <p className="mt-2 text-sm">
            <Empty />
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Block title="Problem">
          <dl className="space-y-1">
            <div>
              <dt className="inline font-medium">Issue: </dt>
              <dd className="inline">{pkg.problem.issueTitle ?? "Unknown"}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Message: </dt>
              <dd className="inline">
                {pkg.problem.message || "None recorded"}
              </dd>
            </div>
            <div>Category: {pkg.problem.category ?? "Unknown"}</div>
            <div>Priority: {pkg.problem.priority ?? "Unknown"}</div>
          </dl>
        </Block>
        <Block title="Context">
          <dl className="space-y-1">
            <div>Platform: {pkg.context.platform ?? "Unknown"}</div>
            <div>Requester role: {pkg.context.requesterRole ?? "Unknown"}</div>
            <div>Attachments: {pkg.context.attachmentCount}</div>
            <div>OS: {pkg.context.os ?? "Unknown"}</div>
            <div>Device: {pkg.context.device ?? "Unknown"}</div>
            <div>App: {pkg.context.app ?? "Unknown"}</div>
          </dl>
        </Block>
        <Block title="Symptoms">
          {pkg.symptoms.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5">
              {pkg.symptoms.map((symptom) => (
                <li key={symptom}>{symptom}</li>
              ))}
            </ul>
          ) : (
            <Empty />
          )}
        </Block>
        <Block title="Questions & answers">
          {pkg.questionsAndAnswers.length > 0 ? (
            <ul className="space-y-2">
              {pkg.questionsAndAnswers.map((item) => (
                <li key={item.questionId}>
                  <p className="font-medium">
                    {item.question ?? item.questionId}
                  </p>
                  <p className="text-muted-foreground">{item.answer}</p>
                </li>
              ))}
            </ul>
          ) : (
            <Empty />
          )}
        </Block>
        <Block title="Steps attempted">
          {pkg.stepsAttempted.length > 0 ? (
            <ul className="space-y-2">
              {pkg.stepsAttempted.map((step) => (
                <li key={`${step.guideSlug}-${step.stepIndex}-${step.at}`}>
                  <div>
                    {step.text ?? `Step ${step.stepIndex + 1}`}{" "}
                    <OutcomePill outcome={step.outcome} />
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {step.guideSlug} · step {step.stepIndex + 1} ·{" "}
                    {step.risk ? riskLabel(step.risk) : "Risk unknown"}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty />
          )}
        </Block>
        <Block title="Withheld by policy">
          {pkg.withheldSteps.length > 0 ? (
            <ul className="space-y-2">
              {pkg.withheldSteps.map((step) => (
                <li key={`${step.guideSlug}-${step.stepIndex}`}>
                  {step.text ?? `Step ${step.stepIndex + 1}`} ·{" "}
                  {riskLabel(step.risk)}
                </li>
              ))}
            </ul>
          ) : (
            <Empty />
          )}
        </Block>
        <Block title="Tests performed">
          {pkg.testsPerformed.length > 0 ? (
            <ul className="space-y-2">
              {pkg.testsPerformed.map((test) => (
                <li key={`${test.tool}-${test.at}`}>
                  <strong>{test.tool}</strong>: {test.summary}
                  {test.result ? ` — ${test.result}` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <Empty />
          )}
        </Block>
        <Block title="Sources">
          {pkg.sources.length > 0 ? (
            <ul className="space-y-1">
              {pkg.sources.map((source) => (
                <li key={source.guideSlug}>
                  {source.url ? (
                    <a
                      className="underline underline-offset-4"
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {source.title}
                    </a>
                  ) : (
                    source.title
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Empty />
          )}
        </Block>
      </div>

      <Block title="Other hypotheses">
        {pkg.otherHypotheses.length > 0 ? (
          <details>
            <summary className="cursor-pointer">
              {pkg.otherHypotheses.length} additional hypothesis
              {pkg.otherHypotheses.length === 1 ? "" : "es"}
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {pkg.otherHypotheses.map((hypothesis) => (
                <li key={hypothesis.cause}>
                  {hypothesis.cause} ({Math.round(hypothesis.confidence * 100)}
                  %)
                </li>
              ))}
            </ul>
          </details>
        ) : (
          <Empty />
        )}
      </Block>

      <Block title="Handoff">
        <dl className="grid gap-2 sm:grid-cols-2">
          <div>
            <dt className="font-medium">Reason</dt>
            <dd>
              {formatHandoffReason(pkg.handoff.reason) ?? "None recorded"}
            </dd>
          </div>
          <div>
            <dt className="font-medium">Detail</dt>
            <dd>{pkg.handoff.detail ?? "None recorded"}</dd>
          </div>
          <div>
            <dt className="font-medium">At</dt>
            <dd>{pkg.handoff.at ?? "None recorded"}</dd>
          </div>
          <div>
            <dt className="font-medium">Failed attempts</dt>
            <dd>{pkg.handoff.failedAttempts}</dd>
          </div>
        </dl>
      </Block>
    </section>
  );
}
