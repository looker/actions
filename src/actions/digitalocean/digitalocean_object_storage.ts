import * as Hub from "../../hub"
import { AmazonS3Action } from "../amazon/amazon_s3"

export class DigitalOceanObjectStorageAction extends AmazonS3Action {

  name = "digitalocean_object_storage"
  label = "DigitalOcean Spaces"
  iconName = "digitalocean/DigitalOcean.png"
  description = "Write data files to DigitalOcean's Spaces storage."
  params = [
    {
      name: "access_key_id",
      label: "Spaces Access Key",
      required: true,
      sensitive: false,
      description: "Your access key for DigitalOcean Spaces https://cloud.digitalocean.com/settings/api/tokens.",
    }, {
      name: "secret_access_key",
      label: "Spaces Secret Key",
      required: true,
      sensitive: true,
      description: "Your secret key for DigitalOcean Spaces https://cloud.digitalocean.com/settings/api/tokens.",
    },
  ]

  async form(request: Hub.ActionRequest) {
    const form = await super.form(request)
    const bucketField = form.fields.filter((field) => field.name === "bucket")[0]
    bucketField.label = "Space Name"
    return form
  }

  protected s3Endpoint(region?: string): string | undefined {
    return `https://${region || "nyc3"}.digitaloceanspaces.com`
  }

}

Hub.addAction(new DigitalOceanObjectStorageAction())
