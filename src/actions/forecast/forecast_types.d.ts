export interface ForecastDataImportActionParams {
  bucketName: string
  datasetName: string
  datasetGroupArn?: string
  forecastingDomain: string
  dataFrequency: string
  accessKeyId: string
  secretAccessKey: string
  region: string
  roleArn: string
  timestampFormat: string
  datasetSchema: object
  datasetType: string
}

export interface ForecastTrainPredictorActionParams {
  datasetGroupArn: string
  forecastFrequency: string
  predictorName: string
  accessKeyId: string
  secretAccessKey: string
  region: string
  forecastHorizon: number
  numberOfBacktestWindows?: number
  backTestWindowOffset?: number
  countryForHolidays?: string
}

export interface ForecastGenerateActionParams {
  accessKeyId: string
  secretAccessKey: string
  region: string
  forecastName: string
  predictorArn: string
}

export interface ForecastExportActionParams {
  bucketName: string
  accessKeyId: string
  secretAccessKey: string
  region: string
  roleArn: string
  forecastArn: string
}

export interface ForecastWorkflowStage {
  startResourceCreation: () => Promise<void>
  getResourceCreationStatus: () => Promise<string>
}
