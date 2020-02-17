import * as Hub from "../../hub"

import * as ForecastService from "aws-sdk/clients/forecastservice"
import * as S3 from "aws-sdk/clients/s3"
import * as winston from "winston"
import ForecastExporter from "./forecast_export"
import { ForecastExportActionParams } from "./forecast_types"
import { notifyJobStatus } from "./mail_transporter"
import { pollForCreateComplete } from "./poller"

export class ForecastExportAction extends Hub.Action {
  name = "amazon_forecast_export"
  label = "Amazon Forecast: Export Forecast"
  description = "Export data from Amazon Forecast to S3"
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
      name: "roleArn",
      label: "Role ARN",
      required: true,
      sensitive: false,
      description: "ARN of role allowing Forecast to write to your S3 bucket",
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
    const bucketOptions = await this.listBuckets(request)
    const forecastOptions = await this.listForecasts(request)

    form.fields = [
      {
        label: "Forecast Destination Bucket",
        name: "bucketName",
        required: true,
        type: "select",
        description: "Choose a destination bucket for your forecast",
        options: bucketOptions.map(({ Name }) => ({ name: Name!, label: Name! })),
      },
      {
        label: "Forecast",
        name: "forecastArn",
        required: true,
        type: "select",
        description: "Choose a Forecast to export",
        options: forecastOptions
        .map(({ ForecastArn, ForecastName }) => ({ name: ForecastArn!, label: ForecastName! })),
      },
    ]
    return form
  }

  async execute(request: Hub.ActionRequest) {
    try {
      this.startForecastExport(request)
        .catch(async (err) => this.handleFailure(request, err))
      // response acknowledges that workflow has started, not that it's complete
      return new Hub.ActionResponse({ success: true })
    } catch (err) {
      return new Hub.ActionResponse({ success: false, message: err.message })
    }
  }

  private async startForecastExport(request: Hub.ActionRequest) {
    const actionParams = this.getRequiredActionParamsFromRequest(request)
    const forecastService = this.forecastServiceFromRequest(request)
    const forecastExporter = new ForecastExporter({
      forecastService,
      ...actionParams,
    })
    await forecastExporter.startResourceCreation()
    const { jobStatus } = await pollForCreateComplete(forecastExporter.getResourceCreationStatus)
    // notify user of job result
    await notifyJobStatus(request, {
      action: this.label,
      status: jobStatus,
      resource: forecastExporter.forecastExportJobName,
      message: forecastExporter.failedReason,
    })
  }

  private async listBuckets(request: Hub.ActionRequest) {
    const s3 = this.s3ClientFromRequest(request)
    const results = []
    const { Buckets } = await s3.listBuckets().promise()
    if (Buckets) {
      results.push(...Buckets)
    }
    return results
  }

  private async handleFailure(request: Hub.ActionRequest, err: Error) {
    winston.error(request.webhookId!, err.message, err.stack)
    await notifyJobStatus(request, {
      action: "Amazon Forecast: Export Forecast",
      status: err.name,
      message: err.message,
    })
  }

  private async listForecasts(request: Hub.ActionRequest) {
    const forecastService = this.forecastServiceFromRequest(request)
    const { Forecasts } = await forecastService.listForecasts().promise()
    const results = []
    if (Forecasts) {
      results.push(...Forecasts)
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

  private s3ClientFromRequest(request: Hub.ActionRequest) {
    return new S3({
      accessKeyId: request.params.accessKeyId,
      secretAccessKey: request.params.secretAccessKey,
    })
  }

  private getRequiredActionParamsFromRequest(request: Hub.ActionRequest): ForecastExportActionParams {
    const {
      bucketName,
      forecastArn,
    } = request.formParams

    const {
      accessKeyId,
      secretAccessKey,
      region,
      roleArn,
    } = request.params

    if (!bucketName) {
      throw new Error("Missing bucketName")
    }
    if (!accessKeyId) {
      throw new Error("Missing accessKeyId")
    }
    if (!secretAccessKey) {
      throw new Error("Missing secretAccessKey")
    }
    if (!region) {
      throw new Error("Missing region")
    }
    if (!roleArn) {
      throw new Error("Missing roleArn")
    }
    if (!forecastArn) {
      throw new Error("Missing forecastArn")
    }

    return {
      bucketName,
      accessKeyId,
      secretAccessKey,
      region,
      roleArn,
      forecastArn,
    }
  }
}

Hub.addAction(new ForecastExportAction())
