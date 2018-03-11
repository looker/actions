import * as chai from "chai"
import * as sinon from "sinon"

import * as Hub from "../../hub"

import { SMTPAction } from "./smtp"

const integration = new SMTPAction()

const stubFilename = "stubSuggestedFilename"

function expectSMTPMatch(request: Hub.ActionRequest, match: any) {

  const sendMailSpy = sinon.spy(async () => Promise.resolve())
  const stubClient = sinon.stub(integration as any, "transportFromRequest")
    .callsFake(() => ({
      sendMail: sendMailSpy,
    }))
  const stubSuggestedFilename = sinon.stub(request as any, "suggestedFilename")
    .returns(stubFilename)

  const action = integration.action(request)
  return chai.expect(action).to.be.fulfilled.then(() => {
    chai.expect(sendMailSpy).to.have.been.calledWithMatch(match)
    stubClient.restore()
    stubSuggestedFilename.restore()
  })
}

describe(`${integration.constructor.name} unit tests`, () => {

  describe("action", () => {

    it("errors if there is no smtp address", () => {
      const request = new Hub.ActionRequest()
      request.formParams = {}
      request.attachment = {dataBuffer: Buffer.from("1,2,3,4", "utf8")}

      const action = integration.action(request)

      return chai.expect(action).to.eventually
        .be.rejectedWith("Needs a valid SMTP address.")
    })

    it("errors with bad paths", async () => {
      const bumAddresses = [
        "smtp:/username:password@host",
        "smtp://username:password",
        "http://username:password@host",
        "smtp/username:password@host",
        "username:password@host",
      ]

      return Promise.all(bumAddresses.map((address) => {
        const request = new Hub.ActionRequest()
        request.formParams = {
          to: "test@example.com",
          address,
        }
        request.attachment = {dataBuffer: Buffer.from("1,2,3,4", "utf8")}
        return chai.expect(integration.action(request)).to.eventually.be.rejected
      }))
    })

    it("errors if the input has no attachment", () => {
      const request = new Hub.ActionRequest()
      request.formParams = {
        to: "test@example.com",
        address: "smtps://username:password@smtp.example.com",
      }

      return chai.expect(integration.action(request)).to.eventually
        .be.rejectedWith("Couldn't get data from attachment")
    })

    it("sends right body to filename and address", () => {
      const request = new Hub.ActionRequest()
      request.scheduledPlan = {
        title: "Hello attachment",
        url: "https://mycompany.looker.com/look/1",
      }
      request.formParams = {
        to: "test@example.com",
        address: "smtps://username:password@smtp.example.com",
      }
      request.attachment = {dataBuffer: Buffer.from("1,2,3,4", "utf8")}

      /* tslint:disable max-line-length */
      const msg = {
        to: request.formParams.to,
        subject: request.scheduledPlan.title,
        from: "Looker <noreply@lookermail.com>",
        text: `View this data in Looker. ${request.scheduledPlan.url}\n Results are attached.`,
        html: `<p><a href="${request.scheduledPlan.url}">View this data in Looker.</a></p><p>Results are attached.</p>`,
        attachments: [{
          content: request.attachment.dataBuffer,
          filename: stubFilename,
        }],
      }

      return expectSMTPMatch(request, msg)
    })

    it("sends to right filename if specified", () => {
      const request = new Hub.ActionRequest()
      request.scheduledPlan = {
        title: "Hello attachment",
        url: "https://mycompany.looker.com/look/1",
      }
      request.formParams = {
        to: "test@example.com",
        filename: "mywackyfilename",
        address: "smtps://username:password@smtp.example.com",
      }
      request.attachment = {dataBuffer: Buffer.from("1,2,3,4", "utf8")}

      const msg = {
        to: request.formParams.to,
        subject: "Hello attachment",
        from: "Looker <noreply@lookermail.com>",
        text: `View this data in Looker. ${request.scheduledPlan.url}\n Results are attached.`,
        html: `<p><a href="${request.scheduledPlan.url}">View this data in Looker.</a></p><p>Results are attached.</p>`,
        attachments: [{
          content: request.attachment.dataBuffer,
          filename: request.formParams.filename!,
        }],
      }

      return expectSMTPMatch(request, msg)
    })

    it("sends from right email if specified", () => {
      const request = new Hub.ActionRequest()
      request.scheduledPlan = {
        title: "Hello attachment",
        url: "https://mycompany.looker.com/look/1",
      }
      request.formParams = {
        to: "test@example.com",
        filename: "mywackyfilename",
        subject: "mysubject",
        address: "smtps://username:password@smtp.example.com",
      }
      request.attachment = {dataBuffer: Buffer.from("1,2,3,4", "utf8")}

      const msg = {
        to: request.formParams.to,
        subject: request.formParams.subject,
        from: "Looker <noreply@lookermail.com>",
        text: `View this data in Looker. ${request.scheduledPlan.url}\n Results are attached.`,
        html: `<p><a href="${request.scheduledPlan.url}">View this data in Looker.</a></p><p>Results are attached.</p>`,
        attachments: [{
          content: request.attachment.dataBuffer,
          filename: request.formParams.filename!,
        }],
      }

      return expectSMTPMatch(request, msg)
    })

    it("sends with right subject if specified", () => {
      const request = new Hub.ActionRequest()
      request.scheduledPlan = {
        title: "Hello attachment",
        url: "https://mycompany.looker.com/look/1",
      }
      request.formParams = {
        to: "test@example.com",
        from: "from@example.com",
        filename: "mywackyfilename",
        subject: "mysubject",
        address: "smtps://username:password@smtp.example.com",
      }
      request.attachment = {dataBuffer: Buffer.from("1,2,3,4", "utf8")}

      const msg = {
        to: request.formParams.to,
        subject: request.formParams.subject,
        from: request.formParams.from,
        text: `View this data in Looker. ${request.scheduledPlan.url}\n Results are attached.`,
        html: `<p><a href="${request.scheduledPlan.url}">View this data in Looker.</a></p><p>Results are attached.</p>`,
        attachments: [{
          content: request.attachment.dataBuffer,
          filename: request.formParams.filename!,
        }],
      }

      return expectSMTPMatch(request, msg)
    })

  })

  describe("form", () => {

    it("has form", () => {
      chai.expect(integration.hasForm).equals(true)
    })

  })

})
