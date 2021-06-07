import * as normalizeUrl from "normalize-url"
import * as httpRequest from "request-promise-native"

import { URL } from "url"
import * as Hub from "../../hub"

export class DataRobotAction extends Hub.Action {

  name = "datarobot"
  label = "DataRobot - Create New Project"
  iconName = "datarobot/dr-head.svg"
  description = "Send data to DataRobot and create a new project."
  supportedActionTypes = [Hub.ActionType.Query]
  supportedFormats = [Hub.ActionFormat.Csv]
  supportedFormattings = [Hub.ActionFormatting.Unformatted]
  supportedVisualizationFormattings = [Hub.ActionVisualizationFormatting.Noapply]
  requiredFields = []
  usesStreaming = true
  params = [
    {
      name: "datarobot_api_token",
      label: "Authentication User Attribute",
      description: `Select the customer user attribute that holds the DataRobot API Token.`,
      required: true,
      sensitive: true,
    },
    {
      name: "datarobot_url",
      label: "DataRobot URL",
      description: `Enter your DataRobot application URL. Example: https://app.datarobot.com.`,
      required: false,
      sensitive: false,
    },
  ]
  minimumSupportedLookerVersion = "5.24.0"

  private dataRobotUrl: string | null = null

  async execute(request: Hub.ActionRequest) {
    const options = {
      url: `${this.getDataRobotApiUrl()}/projects/`,
      headers: {
        Authorization: `Token ${request.params.datarobot_api_token}`,
      },
      body: {
        projectName: request.formParams.projectName,
        url: request.scheduledPlan && request.scheduledPlan.downloadUrl,
      },
      json: true,
      resolveWithFullResponse: true,
    }

    try {
      await httpRequest.post(options).promise()
      return new Hub.ActionResponse({ success: true })
    } catch (e) {
      return new Hub.ActionResponse({ success: false, message: e.message })
    }
  }

  async form(request: Hub.ActionRequest) {
    const form = new Hub.ActionForm()

    if (!request.params.datarobot_api_token) {
      form.error = "No DataRobot API Token configured; consult your Looker admin."
      return form
    }

    if (request.params.datarobot_url) {
      try {
        const normalizedDataRobotUrl = normalizeUrl(request.params.datarobot_url)
        await httpRequest.get(normalizedDataRobotUrl).promise()
        this.dataRobotUrl = normalizedDataRobotUrl
      } catch {
        form.error = "URL for on-premise instance is not valid."
        return form
      }
    }

    try {
      await this.validateDataRobotToken(request.params.datarobot_api_token)

      form.fields = [
        {
          label: "The name of the project to be created",
          name: "projectName",
          required: false,
          type: "string",
        },
      ]
    } catch (e) {
      form.error = this.prettyDataRobotError(e)
    }

    return form
  }

  private getDataRobotApiUrl() {
    if (this.dataRobotUrl) {
      return new URL("/api/v2", this.dataRobotUrl)
    }

    return "https://app.datarobot.com/api/v2"
  }

  private async validateDataRobotToken(token: string) {
    try {
      // We don't have a specific endpoint to validate user-token,
      // so trying to get a list of projects instead
      await httpRequest.get({
        url: `${this.getDataRobotApiUrl()}/projects/`,
        headers: {
          Authorization: `Token ${token}`,
        },
        json: true,
      }).promise()
    } catch (e) {
      throw new Error("Invalid token")
    }
  }

  private prettyDataRobotError(e: Error) {
    if (e.message === "Invalid token") {
      return "Your DataRobot API token is invalid."
    }
    return e.message
  }
}

Hub.addAction(new DataRobotAction())
