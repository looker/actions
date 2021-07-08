import * as Hub from "../../../hub"

const storage = require("@google-cloud/storage")

export class GoogleCloudStorageAction extends Hub.Action {

  name = "google_cloud_storage"
  label = "Google Cloud Storage"
  iconName = "google/gcs/google_cloud_storage.svg"
  description = "Write data files to a Google Cloud Storage bucket."
  supportedActionTypes = [Hub.ActionType.Dashboard, Hub.ActionType.Query]
  usesStreaming = true
  requiredFields = []
  params = [
    {
      name: "client_email",
      label: "Client Email",
      required: true,
      sensitive: false,
      description: "Your client email for GCS from https://console.cloud.google.com/apis/credentials",
    }, {
      name: "private_key",
      label: "Private Key",
      required: true,
      sensitive: true,
      description: "Your private key for GCS from https://console.cloud.google.com/apis/credentials",
    }, {
      name: "project_id",
      label: "Project Id",
      required: true,
      sensitive: false,
      description: "The Project Id for your GCS project from https://console.cloud.google.com/apis/credentials",
    },
  ]

  async execute(request: Hub.ActionRequest) {

    if (!request.formParams.bucket) {
      throw "Need Google Cloud Storage bucket."
    }

    let filename = request.formParams.filename || request.suggestedFilename()

    // If the overwrite formParam exists and it is "no" - ensure a timestamp is appended
    if (request.formParams.overwrite && request.formParams.overwrite === "no") {
      filename += `_${Date.now()}`
    }

    if (!filename) {
      throw new Error("Couldn't determine filename.")
    }

    const gcs = this.gcsClientFromRequest(request)
    const file = gcs.bucket(request.formParams.bucket)
      .file(filename)
    const writeStream = file.createWriteStream()

    try {
      await request.stream(async (readable) => {
        return new Promise<any>((resolve, reject) => {
          readable.pipe(writeStream)
            .on("error", reject)
            .on("finish", resolve)
        })
      })
      return new Hub.ActionResponse({ success: true })
    } catch (e) {
      return new Hub.ActionResponse({success: false, message: e.message})
    }

  }

  async form(request: Hub.ActionRequest) {
    const form = new Hub.ActionForm()

    const gcs = this.gcsClientFromRequest(request)
    let results: any

    try {
      results = await gcs.getBuckets()
    } catch (e) {
      form.error = `An error occurred while fetching the bucket list.

      Your Google Cloud Storage credentials may be incorrect.

      Google SDK Error: "${e.message}"`
      return form
    }

    if (!(results && results[0] && results[0][0])) {
      form.error = "No buckets in account."
      return form
    }

    const buckets = results[0]

    form.fields = [{
      label: "Bucket",
      name: "bucket",
      required: true,
      options: buckets.map((b: any) => {
          return {name: b.id, label: b.name}
        }),
      type: "select",
      default: buckets[0].id,
    }, {
      label: "Filename",
      name: "filename",
      type: "string",
    }, {
      label: "Overwrite",
      name: "overwrite",
      options: [{label: "Yes", name: "yes"}, {label: "No", name: "no"}],
      default: "yes",
      description: "If Overwrite is enabled, will use the title or filename and overwrite existing data." +
        " If disabled, a date time will be appended to the name to make the file unique.",
    }]

    return form
  }

  private gcsClientFromRequest(request: Hub.ActionRequest) {
    const credentials = {
      client_email: request.params.client_email,
      private_key: request.params.private_key!.replace(/\\n/g, "\n"),
    }
    const config = {
      projectId: request.params.project_id,
      credentials,
    }

    return new storage(config)
  }

}

Hub.addAction(new GoogleCloudStorageAction())
