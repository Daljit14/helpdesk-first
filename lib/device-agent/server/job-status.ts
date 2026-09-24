export const NON_REAL_DEVICE_JOB_STATUSES = ["cancelled", "expired"] as const;

export function isRealDeviceJob(job: { status: string }): boolean {
  return !NON_REAL_DEVICE_JOB_STATUSES.includes(
    job.status as (typeof NON_REAL_DEVICE_JOB_STATUSES)[number]
  );
}
