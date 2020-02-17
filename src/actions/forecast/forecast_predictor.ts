import * as ForecastService from "aws-sdk/clients/forecastservice"
import { ForecastTrainPredictorActionParams, ForecastWorkflowStage } from "./forecast_types"

interface ForecastPredictorParams extends ForecastTrainPredictorActionParams {
  forecastService: ForecastService
}

export default class ForecastPredictor implements ForecastWorkflowStage {
  failedReason?: string
  private forecastService: ForecastService
  private forecastFrequency: string
  private datasetGroupArn: string
  private predictorName: string
  private forecastHorizon: number
  private backTestWindowOffset?: number
  private numberOfBacktestWindows?: number
  private predictorArn?: string
  private countryForHolidays?: string

  constructor(params: ForecastPredictorParams) {
    this.forecastService = params.forecastService
    this.forecastFrequency = params.forecastFrequency
    this.datasetGroupArn = params.datasetGroupArn
    this.predictorName = params.predictorName
    this.forecastHorizon = params.forecastHorizon
    this.backTestWindowOffset = params.backTestWindowOffset
    this.numberOfBacktestWindows = params.numberOfBacktestWindows
    this.countryForHolidays = params.countryForHolidays
    this.getResourceCreationStatus = this.getResourceCreationStatus.bind(this)
  }

  async startResourceCreation() {
    await this.createPredictor()
  }

  async getResourceCreationStatus() {
    if (!this.predictorArn) {
      return ""
    }
    const { Status, Message } = await this.forecastService.describePredictor({
      PredictorArn: this.predictorArn,
    }).promise()
    if (Message) {
      this.failedReason = Message
    }
    return Status ? Status : ""
  }

  private async createPredictor() {
    const params: ForecastService.CreatePredictorRequest = {
      FeaturizationConfig: {
        ForecastFrequency: this.forecastFrequency,
      },
      EvaluationParameters: {
        BackTestWindowOffset: this.backTestWindowOffset,
        NumberOfBacktestWindows: this.numberOfBacktestWindows,
      },
      ForecastHorizon: this.forecastHorizon,
      InputDataConfig: {
        DatasetGroupArn: this.datasetGroupArn,
      },
      PredictorName: this.predictorName,
      PerformAutoML: true,
    }

    if (this.countryForHolidays) {
      params.InputDataConfig.SupplementaryFeatures = [
        {
          Name: "holiday",
          Value: this.countryForHolidays,
        },
      ]
    }

    const { PredictorArn } = await this.forecastService.createPredictor(params).promise()
    this.predictorArn = PredictorArn
  }
}
