import * as Hub from "../../hub"

import * as ForecastService from "aws-sdk/clients/forecastservice"
import * as S3 from "aws-sdk/clients/s3"
import * as winston from "winston"
import { dataFrequencyOptions, datasetSchemaDefault, datasetTypeOptions, domainOptions } from "./forecast_form_options"
import ForecastDataImport from "./forecast_import"
import { ForecastDataImportActionParams } from "./forecast_types"
import { notifyJobStatus } from "./mail_transporter"
import { pollForCreateComplete } from "./poller"
import { uploadToS3 } from "./s3_upload"

export class ForecastDataImportAction extends Hub.Action {
  name = "amazon_forecast_data_import"
  label = "Amazon Forecast: Data Import"
  supportedActionTypes = [Hub.ActionType.Query]
  description = "Import data into Amazon Forecast"
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
      name: "roleArn",
      label: "Role ARN",
      required: true,
      sensitive: false,
      description: "ARN of role allowing Forecast to read from your S3 bucket",
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
    const bucketOptions = await this.listBuckets(request)
    const datasetGroups = await this.listDatasetGroups(request)
    const datasetGroupOptions = datasetGroups.map((dg) => ({ name: dg.DatasetGroupArn!, label: dg.DatasetGroupName! }))
    datasetGroupOptions.unshift({ name: "", label: "New Group" })

    form.fields = [
      {
        label: "Dataset name",
        name: "datasetName",
        required: true,
        type: "string",
        description: "The dataset name must have 1 to 63 characters. Valid characters: a-z, A-Z, 0-9, and _",
      },
      {
        label: "Data Import Bucket",
        name: "bucketName",
        required: true,
        type: "select",
        description: "Choose a bucket your Looker data will be imported to for Forecast to access",
        options: bucketOptions.map(({ Name }) => ({ name: Name!, label: Name! })),
      },
      {
        label: "Dataset group",
        name: "datasetGroupArn",
        required: true,
        type: "select",
        description: "Choose an existing dataset group for this dataset, or create a new one",
        options: datasetGroupOptions,
      },
      {
        label: "Forecasting domain",
        name: "forecastingDomain",
        required: true,
        type: "select",
        options: domainOptions.map((str) => ({ name: str, label: str })),
        description: "Domain defines the forecasting use case. Choose CUSTOM if no other option applies",
      },
      {
        label: "Data Frequency",
        name: "dataFrequency",
        required: true,
        type: "select",
        options: Object.entries(dataFrequencyOptions).map(([name, label]) => ({ name, label })),
        description: "This is the frequency at which entries are registered into your data file",
      },
      {
        label: "Dataset Type",
        name: "datasetType",
        required: true,
        type: "select",
        options: Object.entries(datasetTypeOptions).map(([name, label]) => ({ name, label })),
        description: `Choose the type of dataset you're adding to the group.
        This will determine which fields are expected in the schema.
        See the Forecast documentation for more details.`,
      },
      {
        label: "Data Schema",
        name: "datasetSchema",
        required: true,
        type: "textarea",
        description: `To help Forecast understand the fields of your data, supply a schema.
        Specify schema attributes in the same order as the columns of your query result.
        The default shown is valid for the "Custom" domain option only.
        Column headers need not match the schema. See Forecast documentation for more details.`,
        default: JSON.stringify(datasetSchemaDefault, null, 2),
      },
      {
        label: "Timestamp Format",
        name: "timestampFormat",
        required: true,
        type: "string",
        default: "yyyy-MM-dd HH:mm:ss",
        description: `The format of the timestamp in your dataset.
        The format you enter here must match the format in your data file`,
      },
    ]
    return form
  }

  async execute(request: Hub.ActionRequest) {
    try {
      this.startForecastImport(request)
        .catch(async (err) => this.handleFailure(request, err))
      // response acknowledges that import has started, not that it's complete
      return new Hub.ActionResponse({ success: true })
    } catch (err) {
      return new Hub.ActionResponse({ success: false, message: err.message })
    }
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

  private s3ClientFromRequest(request: Hub.ActionRequest) {
    return new S3({
      accessKeyId: request.params.accessKeyId,
      secretAccessKey: request.params.secretAccessKey,
    })
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

  private async startForecastImport(request: Hub.ActionRequest) {
    const actionParams = this.getRequiredActionParamsFromRequest(request)
    const {
      bucketName,
      datasetName,
    } = actionParams
    // upload looker data to S3
    const s3ObjectKey = `/ForecastImport/${datasetName}_${Date.now()}.csv`
    await uploadToS3(request, bucketName, s3ObjectKey)
    // create Forecast dataset resource & feed in S3 data
    const forecastService = this.forecastServiceFromRequest(request)
    const forecastImport = new ForecastDataImport({ forecastService, s3ObjectKey, ...actionParams })
    await forecastImport.startResourceCreation()
    const { jobStatus } = await pollForCreateComplete(forecastImport.getResourceCreationStatus)
    // notify user of job result
    await notifyJobStatus(request, {
      action: this.label,
      status: jobStatus,
      resource: datasetName,
      message: forecastImport.failedReason!,
    })
  }

  private async handleFailure(request: Hub.ActionRequest, err: Error) {
    winston.error(request.webhookId!, err.message, err.stack)
    await notifyJobStatus(request, {
      action: "Amazon Forecast: Data Import",
      status: err.name,
      message: err.message,
    })
  }

  private getRequiredActionParamsFromRequest(request: Hub.ActionRequest): ForecastDataImportActionParams {
    winston.debug(JSON.stringify(request.formParams, null, 2))
    const {
      datasetName,
      datasetGroupArn,
      forecastingDomain,
      dataFrequency,
      timestampFormat,
      datasetSchema,
      datasetType,
      bucketName,
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
    if (!datasetName) {
      throw new Error("Missing datasetName")
    }
    if (!forecastingDomain) {
      throw new Error("Missing forecastingDomain")
    }
    if (!dataFrequency) {
      throw new Error("Missing dataFrequency")
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
    if (!timestampFormat) {
      throw new Error("Missing timestampFormat")
    }
    if (!datasetSchema) {
      throw new Error("Missing datasetSchema")
    }
    if (!datasetType) {
      throw new Error("Missing datasetType")
    }

    return {
      bucketName,
      datasetName: this.validateDatasetName(datasetName),
      datasetGroupArn,
      forecastingDomain,
      dataFrequency,
      accessKeyId,
      secretAccessKey,
      region,
      roleArn,
      timestampFormat,
      datasetSchema: this.validateDatasetSchema(datasetSchema),
      datasetType,
    }
  }

  private validateDatasetName(name: string) {
    const regex = /^([a-z0-9_]){1,63}$/i
    if (!regex.test(name)) {
      throw new Error("Dataset name must between 1 and 63 characters. Only alphanumeric characters and _ allowed")
    }
    return name
  }

  // this is a lightweight validity check because the Forecast API will perform it's own check against
  // the schema structure
  private validateDatasetSchema(str: string) {
    try {
      const schema = JSON.parse(str)
      return schema
    } catch (e) {
      throw new Error("dataset schema must be valid JSON")
    }
  }

  private forecastServiceFromRequest(request: Hub.ActionRequest) {
    return new ForecastService({
      region: request.params.region,
      accessKeyId: request.params.accessKeyId,
      secretAccessKey: request.params.secretAccessKey,
    })
  }
}

Hub.addAction(new ForecastDataImportAction())
