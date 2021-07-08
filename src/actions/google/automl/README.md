# Google Cloud AutoML
## Import data files into Google AutoML

The Google AutoML action enables import data from Looker to Google AutoMl, but before the data is imported is first stored in a Google Cloud Sotrage Bucket.

This Action requires different permissions to be able to make calls to GCS and AutoML apis.

1. Enable the Google Cloud Storage and Cloud AutoML APIs in the Google Cloud [console](https://console.cloud.google.com/apis/dashboard).
2. Create a Service Account in the Google Cloud [console](https://console.cloud.google.com/iam-admin/serviceaccounts/project).
3. Create a Service Account Key and download the JSON key file in the [console](https://console.cloud.google.com/apis/credentials). Note the Project Id, Client Email, Private Key to add in the Looker admin page to authenticate with the GCS API.
4. Enable Google AutoML action in your looker Administration page for actions (/admin/actions).

Considerations:

- The file imported into AutoML must be a valid CSV file, this means:
  - Columns with empty name are not allowed, (like auto generated row number)
  - Columns names should not contain any space, join the name with underscores
- The minimum number of rows is 1000.  If building this action into a user workflow, would recommend changing the Looker default row limit to 1000
- The Bucket and the Google AutoML Dataset must be compatible:
  - The Bucket and the Google AutoML region should be the same (us-central-1), you will not be able to connect a Google Cloud Bucket with an AutoML Dataset in different locations or region type.
- Make sure the service account you use for the AutoML action also has read/write permissions over both Google Cloud Storage and AutoML.
- The import of the data is done in a asynchronous way, so whatever error is thrown by Google Cloud won't be reflected in the action result but rather in the Google import result.
