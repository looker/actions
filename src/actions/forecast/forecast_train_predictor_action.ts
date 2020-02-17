import * as Hub from "../../hub"

import * as ForecastService from "aws-sdk/clients/forecastservice"
import * as winston from "winston"
import { dataFrequencyOptions, holidayCalendarOptions } from "./forecast_form_options"
import ForecastPredictor from "./forecast_predictor"
import { ForecastTrainPredictorActionParams } from "./forecast_types"
import { notifyJobStatus } from "./mail_transporter"
import { pollForCreateComplete } from "./poller"

export class ForecastTrainPredictorAction extends Hub.Action {
  name = "amazon_forecast_predictor"
  label = "Amazon Forecast: Train Predictor"
  supportedActionTypes = [Hub.ActionType.Query]
  description = "Train a time series prediction model with Amazon Forecast"
  usesStreaming = true
  requiredFields = []
  supportedFormats = [Hub.ActionFormat.Csv]
  supportedFormattings = [Hub.ActionFormatting.Unformatted]
  supportedVisualizationFormattings = [Hub.ActionVisualizationFormatting.Noapply]
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
    const form = new Hub.ActionForm()
    const datasetGroups = await this.listDatasetGroups(request)
    const datasetGroupOptions = datasetGroups.map((dg) => ({ name: dg.DatasetGroupArn!, label: dg.DatasetGroupName! }))

    form.fields = [
      {
        label: "Predictor Name",
        name: "predictorName",
        required: true,
        type: "string",
        description: "The predictor name must have 1 to 63 characters. Valid characters: a-z, A-Z, 0-9, and _",
      },
      {
        label: "Dataset group ARN",
        name: "datasetGroupArn",
        required: true,
        type: "select",
        description: "ARN of the dataset group to use when building the predictor",
        options: datasetGroupOptions,
      },
      {
        label: "Forecast Frequency",
        name: "forecastFrequency",
        required: true,
        type: "select",
        options: Object.entries(dataFrequencyOptions).map(([name, label]) => ({ name, label })),
        description: "The frequency of predictions in a forecast",
      },
      {
        label: "Forecast Horizon",
        name: "forecastHorizon",
        required: true,
        type: "string",
        description: `Specifies the number of time-steps that the model is trained to predict.
        The maximum forecast horizon is the lesser of 500 time-steps or 1/3 of the Target Time Series dataset length`,
      },
      {
        label: "Number Of Backtest Windows",
        name: "numberOfBacktestWindows",
        required: false,
        type: "string",
        description: `The number of times to split the input data. The default is 1. Valid values are 1 through 5`,
      },
      {
        label: "Backtest Window Offset",
        name: "backTestWindowOffset",
        required: false,
        type: "string",
        description: `The point from the end of the dataset where you want to split the data for model training and
        testing (evaluation). Specify the value as the number of data points.
        The default is the value of the forecast horizon`,
      },
      {
        label: "Country for holidays",
        name: "countryForHolidays",
        required: false,
        type: "select",
        options: Object.entries(holidayCalendarOptions).map(([name, label]) => ({ name, label })),
        description: "The holiday calendar you want to include for model training",
      },
    ]
    return form
  }

  async execute(request: Hub.ActionRequest) {
    try {
      this.startPredictorTraining(request)
        .catch(async (err) => this.handleFailure(request, err))
      // response acknowledges that predictor training has started, not that it's complete
      return new Hub.ActionResponse({ success: true })
    } catch (err) {
      return new Hub.ActionResponse({ success: false, message: err.message })
    }
  }

  private async listDatasetGroups(request: Hub.ActionRequest) {
    const forecastService = this.forecastServiceFromRequest(request)
    const { DatasetGroups } = await forecastService.listDatasetGroups().promise()
    const results = []
    if (DatasetGroups) {
      results.push(...DatasetGroups)
    }
    return results
  }

  private async startPredictorTraining(request: Hub.ActionRequest) {
    const actionParams = this.getRequiredActionParamsFromRequest(request)
    const { predictorName } = actionParams
    // create Forecast dataset resource & feed in S3 data
    const forecastService = this.forecastServiceFromRequest(request)
    const forecastPredictor = new ForecastPredictor({ forecastService, ...actionParams })
    await forecastPredictor.startResourceCreation()
    const { jobStatus } = await pollForCreateComplete(forecastPredictor.getResourceCreationStatus)
    // notify user of job result
    await notifyJobStatus(request, {
      action: this.label,
      status: jobStatus,
      resource: predictorName,
      message: forecastPredictor.failedReason!,
    })
  }

  private async handleFailure(request: Hub.ActionRequest, err: Error) {
    winston.error(request.webhookId!, err.message, err.stack)
    await notifyJobStatus(request, {
      action: "Amazon Forecast: Train Predictor",
      status: err.name,
      message: err.message,
    })
  }

  private getRequiredActionParamsFromRequest(request: Hub.ActionRequest): ForecastTrainPredictorActionParams {
    const {
      datasetGroupArn,
      forecastFrequency,
      predictorName,
      forecastHorizon,
      numberOfBacktestWindows,
      backTestWindowOffset,
      countryForHolidays,
    } = request.formParams

    const {
      accessKeyId,
      secretAccessKey,
      region,
    } = request.params

    if (!forecastFrequency) {
      throw new Error("Missing forecastFrequency")
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
    if (!predictorName) {
      throw new Error("Missing predictorName")
    }
    if (!datasetGroupArn) {
      throw new Error("Missing datasetGroupArn")
    }
    if (!forecastHorizon) {
      throw new Error("Missing forecastHorizon")
    }

    return {
      forecastFrequency,
      countryForHolidays,
      accessKeyId,
      secretAccessKey,
      region,
      predictorName: this.validatePredictorName(predictorName),
      datasetGroupArn,
      forecastHorizon: this.validateInteger("forecastHorizon", forecastHorizon),
      backTestWindowOffset: backTestWindowOffset ?
      this.validateInteger("backTestWindowOffset", backTestWindowOffset) : undefined,
      numberOfBacktestWindows: numberOfBacktestWindows ?
      this.validateNumberOfBacktestWindows(numberOfBacktestWindows) : undefined,
    }
  }

  private validatePredictorName(name: string) {
    const regex = /^([a-z0-9_]){1,63}$/i
    if (!regex.test(name)) {
      throw new Error("Predictor name must between 1 and 63 characters. Only alphanumeric characters and _ allowed")
    }
    return name
  }

  private validateInteger(propName: string, value: string) {
    const result = parseInt(value, 10)
    if (isNaN(result)) {
      throw new Error(`${propName} must be an integer`)
    }
    return result
  }

  private validateNumberOfBacktestWindows(value: string) {
    const propName = "numberOfBacktestWindows"
    const result = this.validateInteger(propName, value)
    if (result < 1 || result > 5) {
      throw new Error(`${propName} must be an integer between 1 and 5`)
    }
    return result
  }

  private forecastServiceFromRequest(request: Hub.ActionRequest) {
    return new ForecastService({
      region: request.params.region,
      accessKeyId: request.params.accessKeyId,
      secretAccessKey: request.params.secretAccessKey,
    })
  }
}

Hub.addAction(new ForecastTrainPredictorAction())
