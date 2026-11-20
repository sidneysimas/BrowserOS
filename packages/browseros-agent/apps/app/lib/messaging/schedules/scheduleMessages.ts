import { defineExtensionMessaging } from '@webext-core/messaging'

interface RunScheduledJobData {
  jobId: string
  /** Prompt for this run only, replacing the job's stored query. MaestroOS
   * Rotinas use it to run with the input values typed for the run. */
  message?: string
}

interface CancelScheduledJobRunData {
  runId: string
}

interface RunScheduledJobResponse {
  success: boolean
  error?: string
}

type ScheduleMessagesProtocol = {
  runScheduledJob(data: RunScheduledJobData): RunScheduledJobResponse
  cancelScheduledJobRun(
    data: CancelScheduledJobRunData,
  ): RunScheduledJobResponse
}

const { sendMessage, onMessage } =
  defineExtensionMessaging<ScheduleMessagesProtocol>()

export { onMessage as onScheduleMessage, sendMessage as sendScheduleMessage }
