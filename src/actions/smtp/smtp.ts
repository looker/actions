import * as Hub from "../../hub"

import { createTransport, SendMailOptions} from "nodemailer"

export class SMTPAction extends Hub.Action {

  name = "smtp"
  label = "SMTP"
  iconName = "smtp/smtp.svg"
  description = "Send data files to an email via a SMTP server."
  supportedActionTypes = [Hub.ActionType.Query, Hub.ActionType.Dashboard]
  params = []

  async action(request: Hub.ActionRequest) {
    if (!request.attachment || !request.attachment.dataBuffer) {
      throw "Couldn't get data from attachment."
    }

    if (!request.formParams || !request.formParams.address) {
      throw "Needs a valid SMTP address."
    }

    const filename = request.formParams.filename || request.suggestedFilename() as string
    const subject = request.formParams.subject || request.scheduledPlan!.title!
    const from = request.formParams.from || "Looker <noreply@lookermail.com>"
    const msg = {
      to: request.formParams.to!,
      subject,
      from,
      text: `View this data in Looker. ${request.scheduledPlan!.url}\n Results are attached.`,
      html: `<p><a href="${request.scheduledPlan!.url}">View this data in Looker.</a></p><p>Results are attached.</p>`,
      attachments: [{
        filename,
        content: request.attachment.dataBuffer,
      }],
    }

    const response = await this.sendEmail(request, msg)
    return new Hub.ActionResponse(response)
  }

  async sendEmail(request: Hub.ActionRequest, msg: SendMailOptions) {
    const client = this.transportFromRequest(request)
    let response
    try {
      await client.sendMail(msg)
    } catch (e) {
      response = {success: false, message: e.message}
    }
    return response
  }

  async form() {
    const form = new Hub.ActionForm()
    form.fields = [{
      name: "address",
      label: "Address",
      description: "e.g. smtps://username:password@smtp.example.com",
      type: "string",
      required: true,
    }, {
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
      label: "Filename",
      name: "filename",
      type: "string",
    }, {
      label: "Subject",
      name: "subject",
      type: "string",
    }]
    return form
  }

  private transportFromRequest(request: Hub.ActionRequest) {
    return createTransport(request.formParams.address!)
  }

}
