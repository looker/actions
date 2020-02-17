import * as ForecastService from "aws-sdk/clients/forecastservice"
import { ForecastGenerateActionParams, ForecastWorkflowStage } from "./forecast_types"

interface ForecastGenerateParams extends ForecastGenerateActionParams {
  forecastService: ForecastService
}

export default class ForecastGenerate implements ForecastWorkflowStage {
  failedReason?: string
  private forecastService: ForecastService
  private forecastName: string
  private predictorArn: string
  private forecastArn?: string

  constructor(params: ForecastGenerateParams) {
    this.forecastService = params.forecastService
    this.forecastName = params.forecastName
    this.predictorArn = params.predictorArn
    this.getResourceCreationStatus = this.getResourceCreationStatus.bind(this)
  }

  async startResourceCreation() {
    await this.createForecast()
  }

  async getResourceCreationStatus() {
    if (!this.forecastArn) {
      return ""
    }
    const { Status, Message } = await this.forecastService.describeForecast({
      ForecastArn: this.forecastArn,
    }).promise()
    if (Message) {
      this.failedReason = Message
    }
    return Status ? Status : ""
  }

  private async createForecast() {
    const params = {
      ForecastName: this.forecastName,
      PredictorArn: this.predictorArn,
    }
    const { ForecastArn } = await this.forecastService.createForecast(params).promise()
    this.forecastArn = ForecastArn
  }
}
