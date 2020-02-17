# AWS Forecast Actions

AWS Forecast is a managed service for time series forecasting. You can read more about it [here](https://aws.amazon.com/forecast/).

## Prerequisites

As these actions interact with AWS, sufficient IAM permissions must be allocated to these actions:
* An IAM user associated with `AmazonForecastFullAccess` managed policy and `s3:PutObject`, `s3:ListBuckets` permissions.
* An IAM role to be assumed by Forecast to import training data and export forecast results. See [here](https://docs.aws.amazon.com/forecast/latest/dg/aws-forecast-iam-roles.html) for instructions to configure this role.

You can supply credentials for the IAM user and the ARN of the role in the settings page of each action as needed.


## Action Responsibilities

There are 4 major activities involved in generating a time-series prediction with AWS Forecast:

1. Import one or more datasets from S3 into Forecast
2. Generate a time series prediction model using the provided data
3. Query the model to generate a time-series forecast
4. Export the time-series forecast to S3

The breakdown of actions aligns with the above workflow:

1. Forecast Data Import Action
    * Given the results of a Looker query, upload the results to Forecast via S3
    * Create a new [Forecast dataset](https://docs.aws.amazon.com/forecast/latest/dg/howitworks-datasets-groups.html#howitworks-dataset) for this data, adding it to a new or existing [Forecast dataset group](https://docs.aws.amazon.com/forecast/latest/dg/howitworks-datasets-groups.html#howitworks-datasetgroup)
2. Forecast Train Predictor Action
    * Given a dataset group created by the previous action, create a model that can be used to make time series predictions
3. Generate forecast action
    * Given a predictor, generate a time-series forecast
4. Export Forecast Action
    * Export selected Forecast to S3 for consumption


## Notes

* Each of the above actions will deliver an email to the user when the action succeeds or fails.
* Of these four actions, the Forecast Data Import action is the only one that actually needs query results to perform its duties. The other actions are simply an interface into the Forecast API.