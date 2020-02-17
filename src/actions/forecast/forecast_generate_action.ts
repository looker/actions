import * as Hub from "../../hub"

import * as ForecastService from "aws-sdk/clients/forecastservice"
import * as winston from "winston"
import ForecastGenerate from "./forecast_generate"
import { ForecastGenerateActionParams } from "./forecast_types"
import { notifyJobStatus } from "./mail_transporter"
import { pollForCreateComplete } from "./poller"

export class ForecastGenerateAction extends Hub.Action {
  name = "amazon_forecast_generate"
  label = "Amazon Forecast: Generate Forecast"
  description = "Generate timeseries forecast using Amazon Forecast"
  usesStreaming = true
  requiredFields = []
  supportedFormats = [Hub.ActionFormat.Csv]
  supportedFormattings = [Hub.ActionFormatting.Unformatted]
  supportedVisualizationFormattings = [Hub.ActionVisualizationFormatting.Noapply]
  supportedActionTypes = [Hub.ActionType.Query]
  iconName = "forecast/forecast_logo.png"

  params = [
    {
      name: "accessKeyId",
      label: "Access Key",
      required: true,
      sensitive: true,
      description: "Your AWS access key ID.",
    },
    {
      name: "secretAccessKey",
      label: "Secret Key",
      required: true,
      sensitive: true,
      description: "Your AWS secret access key.",
    },
    {
      name: "region",
      label: "Region",
      required: true,
      sensitive: false,
      description: "Forecast Region e.g. us-east-1, us-west-1, ap-south-1 from " +
        "http://docs.aws.amazon.com/general/latest/gr/rande.html#s3_region.",
    },
    {
      name: "user_email",
      label: "Looker User Email",
      required: true,
      description: `
        Click the button on the right and select 'Email'.
        This is required for the action to send status emails
        when action is complete.
      `,
      sensitive: false,
    },
    {
      name: "smtpHost",
      label: "SMTP Host",
      required: true,
      sensitive: false,
      description: "Host for sending emails.",
    },
    {
      name: "smtpPort",
      label: "SMTP Port",
      required: true,
      sensitive: false,
      description: "Port for sending emails.",
    },
    {
      name: "smtpFrom",
      label: "SMTP From",
      required: true,
      sensitive: false,
      description: "From for sending emails.",
    },
    {
      name: "smtpUser",
      label: "SMTP User",
      required: true,
      sensitive: false,
      description: "User for sending emails.",
    },
    {
      name: "smtpPass",
      label: "SMTP Pass",
      required: true,
      sensitive: true,
      description: "Pass for sending emails.",
    },
  ]

  async form(request: Hub.ActionRequest) {
    winston.debug(JSON.stringify(request.params, null, 2))
    const form = new Hub.ActionForm()
    const predictorOptions = await this.listPredictors(request)

    form.fields = [
      {
        label: "Predictor ARN",
        name: "predictorArn",
        required: true,
        type: "select",
        options: predictorOptions
        .map((p) => ({ name: p.PredictorArn!, label: p.PredictorName! })),
        description: "The predictor you want to use to create forecasts",
      },
      {
        label: "Forecast Name",
        name: "forecastName",
        required: true,
        type: "string",
        description: "Choose a name to identify this forecast",
      },
    ]
    return form
  }

  async execute(request: Hub.ActionRequest) {
    try {
      this.startForecastGeneration(request)
        .catch(async (err) => this.handleFailure(request, err))
      // response acknowledges that workflow has started, not that it's complete
      return new Hub.ActionResponse({ success: true })
    } catch (err) {
      return new Hub.ActionResponse({ success: false, message: err.message })
    }
  }

  private async startForecastGeneration(request: Hub.ActionRequest) {
    const actionParams = this.getRequiredActionParamsFromRequest(request)
    const { forecastName } = actionParams

    const forecastService = this.forecastServiceFromRequest(request)
    const forecastGenerate = new ForecastGenerate({
      forecastService,
      ...actionParams,
    })
    await forecastGenerate.startResourceCreation()
    const { jobStatus } = await pollForCreateComplete(forecastGenerate.getResourceCreationStatus)
    // notify user of job result
    await notifyJobStatus(request, {
      action: this.label,
      status: jobStatus,
      resource: forecastName,
      message: forecastGenerate.failedReason!,
    })
  }

  private async handleFailure(request: Hub.ActionRequest, err: Error) {
    winston.error(request.webhookId!, err.message, err.stack)
    await notifyJobStatus(request, {
      action: "Amazon Forecast: Generate Forecast",
      status: err.name,
      message: err.message,
    })
  }

  private async listPredictors(request: Hub.ActionRequest) {
    const forecastService = this.forecastServiceFromRequest(request)
    const { Predictors } = await forecastService.listPredictors().promise()
    const results = []
    if (Predictors) {
      results.push(...Predictors)
    }
    return results
  }

  private forecastServiceFromRequest(request: Hub.ActionRequest) {
    return new ForecastService({
      region: request.params.region,
      accessKeyId: request.params.accessKeyId,
      secretAccessKey: request.params.secretAccessKey,
    })
  }

  private getRequiredActionParamsFromRequest(request: Hub.ActionRequest): ForecastGenerateActionParams {
    const {
      predictorArn,
      forecastName,
    } = request.formParams

    const {
      accessKeyId,
      secretAccessKey,
      region,
    } = request.params

    if (!accessKeyId) {
      throw new Error("Missing accessKeyId")
    }
    if (!secretAccessKey) {
      throw new Error("Missing secretAccessKey")
    }
    if (!region) {
      throw new Error("Missing region")
    }
    if (!predictorArn) {
      throw new Error("Missing predictorArn")
    }
    if (!forecastName) {
      throw new Error("Missing forecastName")
    }

    return {
      accessKeyId,
      secretAccessKey,
      region,
      predictorArn,
      forecastName: this.validateForecastName(forecastName),
    }
  }

  private validateForecastName(name: string) {
    const regex = /^([a-z0-9_]){1,63}$/i
    if (!regex.test(name)) {
      throw new Error("Predictor name must between 1 and 63 characters. Only alphanumeric characters and _ allowed")
    }
    return name
  }
}

Hub.addAction(new ForecastGenerateAction())
