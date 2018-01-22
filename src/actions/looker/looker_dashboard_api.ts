import * as Hub from "../../hub"

import * as sanitizeFilename from "sanitize-filename"
import * as URL from "url"
import { SendGridAction } from "../sendgrid/sendgrid"
import {LookerAPIClient} from "./looker"

import * as helpers from "@sendgrid/helpers"

const TAG = "looker_dashboard_url"

/** Returns promise of NodeJS.Timer with a delay of ms milliseconds
 * @param {number} ms - milliseconds to wait
 */
async function delay(ms: number) {
  return new Promise<NodeJS.Timer>((resolve) => setTimeout((resolve), ms))
}

export class LookerDashboardAPIIntegration extends SendGridAction {

  constructor() {
    super()
    this.name = "looker_dashboard_api"
    this.label = "Looker Dashboard API"
    this.iconName = "looker/looker.svg"
    this.description = "Create PDFs of Looker Dashboard and send in email via SendGrid."
    this.requiredFields = [{tag: TAG}]
    this.params = this.params.concat([
      {
        name: "base_url",
        label: "Looker API Url",
        required: true,
        sensitive: false,
        description: "e.g. https://instancename.looker.com:19999/api/3.0",
      },
      {
        name: "looker_api_client",
        label: "Looker API Client",
        required: true,
        sensitive: false,
        description: "https://github.com/looker/looker-sdk-ruby/blob/master/authentication.md",
      },
      {
        name: "looker_api_secret",
        label: "Looker API Secret",
        required: true,
        sensitive: true,
        description: "https://github.com/looker/looker-sdk-ruby/blob/master/authentication.md",
      },
    ])
    this.supportedActionTypes = [Hub.ActionType.Cell, Hub.ActionType.Query]
    this.supportedFormats = [Hub.ActionFormat.JsonDetail]
    this.supportedFormattings = [Hub.ActionFormatting.Unformatted]
    this.supportedVisualizationFormattings = [Hub.ActionVisualizationFormatting.Noapply]
  }

  /** Returns PDF content for a looker dashboard.
   *
   * 1. create render task to make pdf
   * response = /api/3.0/render_tasks/dashboards/2/pdf?width=1280&height=1000
   * 2. check status on render task and wait if not yet sucess
   * task = /api/3.0/render_tasks/${response.id}
   * when status: "success"
   * 3. request pdf
   * response.body /api/3.0/render_tasks/${response.id}/results
   *
   * @param {LookerAPIClient} client - LookerAPIClient
   * @param {string} lookerUrl - relative dashboard url e.g. /dashboards/2?User%20Name=test
   */
  async generatePDFDashboard(client: LookerAPIClient, lookerUrl: string, style = "tiled") {
    let body = {
      dashboard_style: style,
    }
    const parsedUrl = URL.parse(lookerUrl)
    if (parsedUrl.query) {
      body = Object.assign(body, {dashboard_filters: parsedUrl.query})
    }

    if (!parsedUrl.pathname) {
      throw "Invalid Looker URL."
    }

    const dashboard = parsedUrl.pathname.split("/")[2]
    if (isNaN(+dashboard)) {
      parsedUrl.pathname = parsedUrl.pathname.replace("dashboards", "lookml_dashboards")
    }

    // create pdf render task
    const task = await client.postAsync(`/render_tasks${parsedUrl.pathname}/pdf?width=1280&height=1000`, body)

    // wait for success
    let i = 0
    while (i < 8) {
      const taskStatus = await client.getAsync(`/render_tasks/${task.id}`)
      if (taskStatus.status === "success") {
        break
      }
      await delay(3000)
      i += 1
    }

    // get PDF
    return await client.getBinaryAsync(`/render_tasks/${task.id}/results`)
  }

  async action(req: Hub.ActionRequest) {

    let lookerUrls: string[] = []
    switch (req.type) {
      case "query":
        if (!(req.attachment && req.attachment.dataJSON)) {
          throw "Couldn't get data from attachment."
        }

        const qr = req.attachment.dataJSON
        if (!qr.fields || !qr.data) {
          throw "req payload is an invalid format."
        }
        const fields: any[] = [].concat(...Object.keys(qr.fields).map((k) => qr.fields[k]))
        const identifiableFields = fields.filter((f: any) =>
          f.tags && f.tags.some((t: string) => t === TAG),
        )
        if (identifiableFields.length === 0) {
          throw `Query requires a field tagged ${TAG}.`
        }
        lookerUrls = qr.data.map((row: any) => (row[identifiableFields[0].name].value))
        break
      case "cell":
        const value = req.params.value
        if (!value) {
          throw "Couldn't get data from attachment."
        }
        lookerUrls = [value]
        break
    }

    const client = await this.lookerClientFromRequest(req)
    const parsedUrl = new URL.URL(req.params.base_url!)

    const plan = req.scheduledPlan!
    const subject = req.formParams.subject || (plan && plan.title ? plan.title : "Looker")
    const from = req.formParams.from || "Looker <noreply@lookermail.com>"

    const displayUrls = lookerUrls.map((lookerUrl) => {
      const parsedLookerUrl = URL.parse(lookerUrl)
      if (!parsedLookerUrl.pathname) {
        throw `Malformed ${TAG} URL`
      }
      parsedUrl.port = ""
      parsedUrl.pathname = parsedLookerUrl.pathname
      parsedUrl.search = parsedLookerUrl.search || ""
      return parsedUrl.href
    })

    const displayUrlsText = displayUrls.map((lookerUrl) => (`${lookerUrl}\n`)).join("")
    const displayUrlsHTML = displayUrls.map((lookerUrl, i) => (
      `<p><a href="${lookerUrl}">${subject} ${i}</a></p>`
    )).join("")

    const msg = new helpers.classes.Mail({
      to: req.formParams.to!,
      subject,
      from,
      text: `View this data in Looker. ${displayUrlsText}Results are attached.`,
      html: `<p>View this data in Looker.</p>${displayUrlsHTML}<p>Results are attached.</p>`,
    })

    await Promise.all(lookerUrls.map(async (lookerUrl, i) => {
      const pdf = await this.generatePDFDashboard(client, lookerUrl, req.formParams.format)
      msg.addAttachment({
        content: pdf.toString("base64"),
        filename: sanitizeFilename(`${subject}_${i}.pdf`),
        type: "application/pdf",
      })
    }))
    let response
    try {
      await this.sendEmail(req, msg)
    } catch (e) {
      response = {success: false, message: e.message}
    }
    return new Hub.ActionResponse(response)
  }

  async form() {
    const form = new Hub.ActionForm()
    form.fields = [{
      name: "to",
      label: "To Email Address",
      description: "e.g. test@example.com",
      type: "string",
      required: true,
    }, {
      name: "from",
      label: "From Email Address",
      description: "e.g. test@example.com",
      type: "string",
    }, {
      label: "Subject",
      name: "subject",
      type: "string",
    }, {
      name: "format",
      label: "Format",
      type: "select",
      default: "tiled",
      options: [
        { name: "tiled", label: "PDF (Tiled)" },
        { name: "single_column", label: "PDF (Single Column)" },
      ],
    }]
    return form
  }

  async lookerClientFromRequest(req: Hub.ActionRequest) {
    const lookerClient = new LookerAPIClient({
      baseUrl: req.params.base_url!,
      clientId: req.params.looker_api_client!,
      clientSecret: req.params.looker_api_secret!,
    })
    await lookerClient.fetchAccessToken()
    return lookerClient
  }
}

Hub.addAction(new LookerDashboardAPIIntegration())
