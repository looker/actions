import * as ForecastService from "aws-sdk/clients/forecastservice"
import { ForecastExportActionParams, ForecastWorkflowStage } from "./forecast_types"

interface ForecastExportParams extends ForecastExportActionParams {
  forecastService: ForecastService
  forecastArn: string
}

export default class ForecastExport implements ForecastWorkflowStage {
  forecastExportJobName?: string
  failedReason?: string
  private forecastService: ForecastService
  private bucketName: string
  private roleArn: string
  private forecastArn: string
  private forecastExportJobArn?: string

  constructor(params: ForecastExportParams) {
    this.forecastService = params.forecastService
    this.forecastArn = params.forecastArn
    this.bucketName = params.bucketName
    this.roleArn = params.roleArn
    this.getResourceCreationStatus = this.getResourceCreationStatus.bind(this)
  }

  async startResourceCreation() {
    await this.createForecastExportJob()
  }

  async getResourceCreationStatus() {
    if (!this.forecastExportJobArn) {
      return ""
    }
    const { Status, Message } = await this.forecastService.describeForecastExportJob({
      ForecastExportJobArn: this.forecastExportJobArn,
    }).promise()
    if (Message) {
      this.failedReason = Message
    }
    return Status ? Status : ""
  }

  private async createForecastExportJob() {
    const { ForecastName } = await this.forecastService
    .describeForecast({ ForecastArn: this.forecastArn }).promise()

    this.forecastExportJobName = `${ForecastName}_export_${Date.now()}`

    const params = {
      Destination: {
        S3Config: {
          Path: `s3://${this.bucketName}/ForecastExport/`,
          RoleArn: this.roleArn,
        },
      },
      ForecastArn: this.forecastArn,
      ForecastExportJobName: this.forecastExportJobName,
    }
    const { ForecastExportJobArn } = await this.forecastService.createForecastExportJob(params).promise()
    this.forecastExportJobArn = ForecastExportJobArn
  }
}
