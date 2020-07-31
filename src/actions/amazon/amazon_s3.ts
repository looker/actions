import * as Hub from "../../hub"

import * as S3 from "aws-sdk/clients/s3"

export class AmazonS3Action extends Hub.Action {

  name = "amazon_s3"
  label = "Amazon S3"
  iconName = "amazon/amazon_s3.png"
  description = "Write data files to an S3 bucket."
  supportedActionTypes = [Hub.ActionType.Dashboard, Hub.ActionType.Query]
  usesStreaming = true
  requiredFields = []
  params = [
    {
      name: "access_key_id",
      label: "Access Key",
      required: true,
      sensitive: true,
      description: "Your access key for S3.",
    }, {
      name: "secret_access_key",
      label: "Secret Key",
      required: true,
      sensitive: true,
      description: "Your secret key for S3.",
    },
  ]

  async execute(request: Hub.ActionRequest) {

    if (!request.formParams.bucket) {
      throw new Error("Need Amazon S3 bucket.")
    }
    const bucket = request.formParams.bucket

    const region = await this.getBucketRegionFromRequest(request, bucket)

    const s3 = this.amazonS3ClientFromRequest(request, region)

    const filename = request.formParams.filename || request.suggestedFilename()

    if (!filename) {
      throw new Error("Couldn't determine filename.")
    }

    try {
      await request.stream(async (readable) => {
        const params = {
          Bucket: bucket,
          Key: filename,
          Body: readable,
        }
        return s3.upload(params).promise()
      })
      return new Hub.ActionResponse({ success: true })
    } catch (err) {
      return new Hub.ActionResponse({ success: false, message: err.message })
    }

  }

  async form(request: Hub.ActionRequest) {
    const s3 = this.amazonS3ClientFromRequest(request)
    const res = await s3.listBuckets().promise()
    const buckets = res.Buckets ? res.Buckets : []
    const form = new Hub.ActionForm()
    form.fields = [{
      label: "Bucket",
      name: "bucket",
      required: true,
      options: buckets.map((c) => {
        return { name: c.Name!, label: c.Name! }
      }),
      type: "select",
      default: buckets[0].Name,
    }, {
      label: "File Path",
      name: "filename",
      type: "string",
      required: true,
    }]
    return form
  }

  protected s3Endpoint(_region?: string): string | undefined {
    return undefined
  }

  // It's shockingly hard and weird to figure out the AWS region from a given bucket name.
  private async getBucketRegionFromRequest(
    request: Hub.ActionRequest,
    bucketName: string,
  ): Promise<string> {
    const s3 = this.amazonS3ClientFromRequest(request)
    try {
      // If you're the bucket owner this will work
      const location = await s3.headBucket({ Bucket: bucketName }).promise()
      return location.$response.httpResponse.headers["x-amz-bucket-region"]
    } catch (e) {
      // Otherwise the error (!?) will include the region
      return e.region
    }
  }

  // Region is optional here because `getBucketRegionFromRequest` ignores the region
  private amazonS3ClientFromRequest(request: Hub.ActionRequest, region?: string) {
    return new S3({
      region,
      endpoint: this.s3Endpoint(region),
      accessKeyId: request.params.access_key_id,
      secretAccessKey: request.params.secret_access_key,
    })
  }

}

Hub.addAction(new AmazonS3Action())
