import * as ForecastService from "aws-sdk/clients/forecastservice"
import { ForecastDataImportActionParams, ForecastWorkflowStage } from "./forecast_types"

interface ForecastDataImportParams extends ForecastDataImportActionParams {
  forecastService: ForecastService
  s3ObjectKey: string
}

export default class ForecastDataImport implements ForecastWorkflowStage {
  failedReason?: string
  private forecastService: ForecastService
  private s3ObjectKey: string
  private bucketName: string
  private datasetName: string
  private forecastingDomain: string
  private dataFrequency: string
  private roleArn: string
  private timestampFormat: string
  private datasetSchema: object
  private datasetType: string
  private datasetArn?: string
  private datasetGroupArn?: string
  private datasetImportJobArn?: string

  constructor(params: ForecastDataImportParams) {
    this.forecastService = params.forecastService
    this.s3ObjectKey = params.s3ObjectKey
    this.bucketName = params.bucketName
    this.datasetName = params.datasetName
    this.datasetGroupArn = params.datasetGroupArn
    this.forecastingDomain = params.forecastingDomain
    this.dataFrequency = params.dataFrequency
    this.roleArn = params.roleArn
    this.timestampFormat = params.timestampFormat
    this.datasetSchema = params.datasetSchema
    this.datasetType = params.datasetType
    this.getResourceCreationStatus = this.getResourceCreationStatus.bind(this)
  }

  async startResourceCreation() {
    await this.createDataset()
    await this.createOrUpdateDatasetGroup()
    await this.createDatasetImportJob()
  }

  async getResourceCreationStatus() {
    if (!this.datasetImportJobArn) {
      return ""
    }
    const { Status, Message } = await this.forecastService.describeDatasetImportJob({
      DatasetImportJobArn: this.datasetImportJobArn,
    }).promise()
    if (Message) {
      this.failedReason = Message
    }
    return Status ? Status : ""
  }

  private async createDataset() {
    const params = {
      DatasetName: this.datasetName,
      DatasetType: this.datasetType,
      Domain: this.forecastingDomain,
      Schema: this.datasetSchema,
      DataFrequency: this.dataFrequency,
    }

    const { DatasetArn } = await this.forecastService.createDataset(params).promise()
    this.datasetArn = DatasetArn
  }

  private async createOrUpdateDatasetGroup() {
    if (this.datasetGroupArn) {
      const params = {
        DatasetArns: [
          this.datasetArn!,
        ],
        DatasetGroupArn: this.datasetGroupArn,
      }
      await this.forecastService.updateDatasetGroup(params).promise()
    } else {
      const params = {
        DatasetGroupName: `${this.datasetName}_group`,
        Domain: this.forecastingDomain,
        DatasetArns: [
          this.datasetArn!,
        ],
      }
      const { DatasetGroupArn } = await this.forecastService.createDatasetGroup(params).promise()
      this.datasetGroupArn = DatasetGroupArn!
    }
  }

  private async createDatasetImportJob() {
    const params = {
      DataSource: {
        S3Config: {
          Path: `s3://${this.bucketName}/${this.s3ObjectKey}`,
          RoleArn: this.roleArn,
        },
      },
      DatasetArn: this.datasetArn!,
      DatasetImportJobName: `${this.datasetName}_import_job`,
      TimestampFormat: this.timestampFormat,
    }

    const {
      DatasetImportJobArn,
    } = await this.forecastService.createDatasetImportJob(params).promise()
    this.datasetImportJobArn = DatasetImportJobArn
  }
}
