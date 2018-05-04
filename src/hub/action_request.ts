import * as express from "express"
import * as oboe from "oboe"
import * as httpRequest from "request"
import * as sanitizeFilename from "sanitize-filename"
import * as semver from "semver"
import { PassThrough, Readable } from "stream"
import { truncateString } from "./utils"

import {
  DataWebhookPayload,
  DataWebhookPayloadType as ActionType,
} from "../api_types/data_webhook_payload"
import { DataWebhookPayloadScheduledPlanType } from "../api_types/data_webhook_payload_scheduled_plan"
import {
  IntegrationSupportedDownloadSettings as ActionDownloadSettings,
  IntegrationSupportedFormats as ActionFormat,
  IntegrationSupportedFormattings as ActionFormatting,
  IntegrationSupportedVisualizationFormattings as ActionVisualizationFormatting,
} from "../api_types/integration"
import { LookmlModelExploreFieldset as Fieldset } from "../api_types/lookml_model_explore_fieldset"
import { Query } from "../api_types/query"
import { Row as JsonDetailRow } from "./json_detail"

export {
  ActionType,
  ActionFormat,
  ActionFormatting,
  ActionVisualizationFormatting,
  ActionDownloadSettings,
}

export interface ParamMap {
  [name: string]: string | undefined
}

export interface ActionAttachment {
  dataBuffer?: Buffer
  encoding?: string
  dataJSON?: any
  mime?: string
  fileExtension?: string
}

export interface ActionScheduledPlan {
  /** ID of the scheduled plan */
  scheduledPlanId?: number | null
  /** Title of the scheduled plan. */
  title?: string | null
  /** Type of content of the scheduled plan. Valid values are: "Look", "Dashboard". */
  type?: DataWebhookPayloadScheduledPlanType
  /** URL of the content item in Looker. */
  url?: string | null
  /** ID of the query that the data payload represents. */
  queryId?: number | null
  /** Query that was run (not available for dashboards) */
  query?: Query | null
  /** A boolean representing whether this schedule payload has customized the filter values. */
  filtersDifferFromLook?: boolean
  /** A string to be included in scheduled integrations if this scheduled plan is a download query */
  downloadUrl?: string | null
}

export class ActionRequest {

  static fromRequest(request: express.Request) {
    const actionRequest = this.fromJSON(request.body)
    actionRequest.instanceId = request.header("x-looker-instance")
    actionRequest.webhookId = request.header("x-looker-webhook-id")
    const userAgent = request.header("user-agent")
    if (userAgent) {
      const version = userAgent.split("LookerOutgoingWebhook/")[1]
      actionRequest.lookerVersion = semver.valid(version)
    }
    return actionRequest
  }

  static fromJSON(json: DataWebhookPayload) {

    if (!json) {
      throw "Request body must be valid JSON."
    }

    const request = new ActionRequest()

    request.type = json.type!

    if (json && json.attachment) {
      request.attachment = {}
      request.attachment.mime = json.attachment.mimetype!
      request.attachment.fileExtension = json.attachment.extension!
      if (request.attachment.mime && json.attachment.data) {
        if (json.attachment.data) {
          request.attachment.encoding = request.attachment.mime.endsWith(";base64") ? "base64" : "utf8"
          request.attachment.dataBuffer = Buffer.from(json.attachment.data, request.attachment.encoding)

          if (request.attachment.mime === "application/json") {
            request.attachment.dataJSON = JSON.parse(json.attachment.data)
          }
        }
      }
    }

    if (json && json.scheduled_plan) {
      request.scheduledPlan = {
        filtersDifferFromLook: json.scheduled_plan.filters_differ_from_look,
        queryId: json.scheduled_plan.query_id,
        query: json.scheduled_plan.query,
        scheduledPlanId: json.scheduled_plan.scheduled_plan_id,
        title: json.scheduled_plan.title,
        type: json.scheduled_plan.type,
        url: json.scheduled_plan.url,
        downloadUrl: json.scheduled_plan.download_url,
      }
    }

    if (json && json.data) {
      request.params = json.data
    }

    if (json && json.form_params) {
      request.formParams = json.form_params
    }

    return request
  }

  attachment?: ActionAttachment
  formParams: ParamMap = {}
  params: ParamMap = {}
  scheduledPlan?: ActionScheduledPlan
  type!: ActionType
  instanceId?: string
  webhookId?: string
  lookerVersion: string | null = null

  /** `stream` creates and manages a stream of the request data
   *
   * The argument is a function will be passed a Node.js `Readable` object.
   * The readable object represents the streaming data.
   *
   * The stream function will call the passed function and pass through its return value.
   * (this is useful if you need to pass the `readable` object to something that returns a promise)
   *
   * ```ts
   * let prom = await request.stream(async (readable) => {
   *    return myService.uploadStreaming(readable).promise()
   * })
   * ```
   *
   * Streaming generally occurs only if Looker sends the data in a streaming fashion via a push url,
   * however it will also wrap non-streaming attachment data so that actions only need a single implementation.
   */
  stream<T>(callback: (readable: Readable) => T): T {
    const url = this.scheduledPlan && this.scheduledPlan.downloadUrl
    const stream = new PassThrough()
    const returnVal = callback(stream)
    if (url) {
      httpRequest.get(url).pipe(stream)
    } else {
      if (this.attachment && this.attachment.dataBuffer) {
        stream.write(this.attachment.dataBuffer)
      } else {
        throw new Error(
          "startStream was called on an ActionRequest that does not have" +
          "a streaming download url or an attachment. Ensure usesStreaming is set properly on the action.")
      }
    }
    return returnVal
  }

  async streamJson(callbacks: {
    onRow: (row: {[fieldName: string]: any}) => void,
  }) {
    return new Promise<void>((resolve) => {
      this.stream((readable) => {
        oboe(readable)
          .node("![*]", (row) => {
            callbacks.onRow(row)
          })
          .done(() => resolve())
      })
    })
  }

  async streamJsonDetail(callbacks: {
    onFields?: (fields: Fieldset) => void,
    onRow: (row: JsonDetailRow) => void,
  }) {
    return new Promise<void>((resolve) => {
      this.stream((readable) => {
        oboe(readable)
          .node("data.*", (row) => {
            callbacks.onRow(row)
          })
          .node("!.fields", (fields) => {
            callbacks.onFields && callbacks.onFields(fields)
          })
          .done(() => resolve())
      })
    })
  }

  suggestedFilename() {
    if (this.attachment) {
      if (this.scheduledPlan && this.scheduledPlan.title) {
        return sanitizeFilename(`${this.scheduledPlan.title}.${this.attachment.fileExtension}`)
      } else {
        return sanitizeFilename(`looker_file_${Date.now()}.${this.attachment.fileExtension}`)
      }
    }
  }

  /** creates a truncated message with a max number of lines and max number of characters with Title, Url,
   * and truncated Body of payload
   * @param {number} maxLines - maximum number of lines to truncate message
   * @param {number} maxCharacters - maximum character to truncate
   */
  suggestedTruncatedMessage(maxLines: number, maxCharacters: number)  {
    if (this.attachment && this.attachment.dataBuffer) {
      let title = ""
      let url = ""

      if (this.scheduledPlan) {
        if (this.scheduledPlan.title) {
          title = `${this.scheduledPlan.title}:\n`
        }
        if (this.scheduledPlan.url) {
          url = this.scheduledPlan.url
          title = title + url + "\n"
        }
      }

      const truncatedLines = this.attachment.dataBuffer
          .toString("utf8")
          .split("\n")
          .slice(0, maxLines)
      if (truncatedLines.length === maxLines) {
        truncatedLines.push("")
      }
      const newMessage = truncatedLines.join("\n")
      let body = title + newMessage
      body = truncateString(body, maxCharacters)

      return body
    }
  }

}
