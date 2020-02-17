import * as winston from "winston"

const MINUTE_MS = 60000
const POLL_INTERVAL_MS = MINUTE_MS
const MAX_POLL_ATTEMPTS = 240

export async function pollForCreateComplete(
  getJobStatus: () => Promise<string>,
  pollsRemaining: number = MAX_POLL_ATTEMPTS): Promise<{ jobStatus: string }> {
  winston.debug("polls remaining ", pollsRemaining)
  if (pollsRemaining <= 0) {
    return { jobStatus: "INCOMPLETE" }
  }
  const jobStatus = await getJobStatus()

  if (jobStatus === "ACTIVE" || jobStatus.includes("FAILED")) {
    return { jobStatus }
  }

    // job not done, so sleep for POLL_INTERVAL_MS
  await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  return pollForCreateComplete(getJobStatus, pollsRemaining - 1)
}
