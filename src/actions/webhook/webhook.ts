import * as Hub from "../../hub"

import * as req from "request-promise-native"
import { URL } from "url"

export abstract class WebhookAction extends Hub.Action {

  abstract domain: string

  requiredFields = []
  params = []
  supportedActionTypes = [Hub.ActionType.Query]
  usesStreaming = true
  supportedFormattings = [Hub.ActionFormatting.Unformatted]
  supportedVisualizationFormattings = [Hub.ActionVisualizationFormatting.Noapply]
  supportedFormats = [Hub.ActionFormat.JsonDetail]

  async execute(request: Hub.ActionRequest) {

    if (!request.formParams.url) {
      throw "Missing url."
    }

    if (!this.domain) {
      throw "Action requires a domain."
    }

    const providedUrl = request.formParams.url
    const parsedUrl = new URL(providedUrl)
    if (!parsedUrl.hostname) {
      throw "Incorrect domain for url."
    }
    // don't enforce sub-domain, just domain and tld
    const domain = parsedUrl.hostname.split(".").slice(-2).join(".")
    if (!(domain === this.domain)) {
      throw "Incorrect domain for url."
    }

    try {
      await request.stream(async (readable) => {
        return req.post({ uri: providedUrl, body: readable } ).promise()
      })
      return new Hub.ActionResponse({ success: true })
    } catch (e) {
      return new Hub.ActionResponse({ success: false, message: e.message })
    }
  }

  async form() {
    const form = new Hub.ActionForm()
    form.fields = [{
      label: "Webhook URL",
      name: "url",
      required: true,
      type: "string",
    }]
    return form
  }
}
