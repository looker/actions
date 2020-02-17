import { ActionRequest } from "../../hub"

import * as S3 from "aws-sdk/clients/s3"
import { PassThrough } from "stream"

const striplines = require("striplines")

export async function uploadToS3(request: ActionRequest, bucket: string, key: string) {
  return new Promise<S3.ManagedUpload.SendData>(async (resolve, reject) => {
    const s3 = new S3({
      accessKeyId: request.params.accessKeyId,
      secretAccessKey: request.params.secretAccessKey,
    })

    function uploadFromStream() {
      const passthrough = new PassThrough()

      const params = {
        Bucket: bucket,
        Key: key,
        Body: passthrough,
      }
      s3.upload(params, (err: Error|null, data: S3.ManagedUpload.SendData) => {
        if (err) {
          return reject(err)
        }
        resolve(data)
      })

      return passthrough
    }

    return request.stream(async (readable) => {
      readable
        .pipe(striplines(1))
        .pipe(uploadFromStream())
    })
  })
}
