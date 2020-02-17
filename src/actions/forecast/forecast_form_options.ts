// https://docs.aws.amazon.com/forecast/latest/dg/howitworks-domains-ds-types.html
export const domainOptions = [
  "RETAIL",
   "CUSTOM",
   "INVENTORY_PLANNING",
   "EC2_CAPACITY",
   "WORK_FORCE",
   "WEB_TRAFFIC",
   "METRICS"]

   // https://docs.aws.amazon.com/forecast/latest/dg/API_CreateDataset.html#API_CreateDataset_RequestSyntax
export const dataFrequencyOptions = {
  "Y": "Yearly",
  "M": "Monthly",
  "W": "Weekly",
  "D": "Daily",
  "H": "Hourly",
  "30min": "Every 30 minutes",
  "15min": "Every 15 minutes",
  "10min": "Every 10 minutes",
  "5min": "Every 5 minutes",
  "1min": "Every minute",
}

// https://docs.aws.amazon.com/forecast/latest/dg/API_SupplementaryFeature.html
export const holidayCalendarOptions = {
  AU: "Australia",
  DE: "Germany",
  JP: "Japan",
  US: "United States",
  UK: "United Kingdom",
}

// https://docs.aws.amazon.com/forecast/latest/dg/howitworks-datasets-groups.html#howitworks-dataset
export const datasetTypeOptions = {
  TARGET_TIME_SERIES: "Target time series",
  RELATED_TIME_SERIES: "Related time series",
  ITEM_METADATA: "Item metadata",
}

// this is the default schema for the CUSTOM domain, TARGET_TIME_SERIES dataset type
// more info on schemas for different domains/dataset types:
// https://docs.aws.amazon.com/forecast/latest/dg/howitworks-domains-ds-types.html
export const datasetSchemaDefault = {
  Attributes: [
    {
      AttributeName: "timestamp",
      AttributeType: "timestamp",
    },
    {
      AttributeName: "item_id",
      AttributeType: "string",
    },
    {
      AttributeName: "target_value",
      AttributeType: "float",
    },
  ],
}
