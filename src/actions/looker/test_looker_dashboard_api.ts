import * as chai from "chai"
import * as sinon from "sinon"

import * as Hub from "../../hub"

import * as helpers from "@sendgrid/helpers"

import * as sanitizeFilename from "sanitize-filename"
import { LookerDashboardAPIIntegration } from "./looker_dashboard_api"

const integration = new LookerDashboardAPIIntegration()

async function expectLookerAPIActionMatch(request: Hub.ActionRequest, lookerUrl: string, msg: helpers.classes.Mail) {

  const stubGeneratePDFDashboard = sinon.stub(integration as any, "generatePDFDashboard")
    .callsFake(() => "pdf content")
  const stubSendEmail = sinon.stub(integration as any, "sendEmail")
    .callsFake(() => true)

  const action = integration.action(request)
  const client = await integration.lookerClientFromRequest(request)
  return chai.expect(action).to.be.fulfilled.then(() => {
    chai.expect(stubGeneratePDFDashboard).to.have.been.calledWithMatch(client, lookerUrl)
    chai.expect(stubSendEmail).to.have.been.calledWithMatch(request, msg)
    stubGeneratePDFDashboard.restore()
    stubSendEmail.restore()
  })
}

describe(`${integration.constructor.name} unit tests`, () => {

  describe("action", () => {

    it("errors if there is no attachment for query", () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query

      const action = integration.action(request)

      return chai.expect(action).to.eventually
        .be.rejectedWith("Couldn't get data from attachment.")
    })

    it("calls render, waits and returns response.body", async () => {
      const postAsyncSpy = sinon.spy(async () => Promise.resolve({id: "render_id"}))
      const getAsyncSpy = sinon.spy(async () => Promise.resolve({status: "success"}))
      const getBinaryAsyncSpy = sinon.spy(async () => Promise.resolve("pdf content"))

      const stubClient = sinon.stub(integration as any, "lookerClientFromRequest")
        .callsFake(() => ({
          postAsync: postAsyncSpy,
          getAsync: getAsyncSpy,
          getBinaryAsync: getBinaryAsyncSpy,
        }))

      const request = new Hub.ActionRequest()
      const client = await integration.lookerClientFromRequest(request)
      const dashboard = integration.generatePDFDashboard(client, "/dashboards/1?myfield=Yes")
      return chai.expect(dashboard).to.be.fulfilled.then(() => {
        chai.expect(postAsyncSpy).to.have.been.calledWithMatch(
          "/render_tasks/dashboards/1/pdf?width=1280&height=1",
          {
            dashboard_style: "tiled",
            dashboard_filters: "myfield=Yes",
          },
        )
        chai.expect(getAsyncSpy).to.have.been.calledWithMatch("/render_tasks/render_id")
        chai.expect(getBinaryAsyncSpy).to.have.been.calledWithMatch("/render_tasks/render_id/results")

        stubClient.restore()
      })
    })

    it("calls render, waits and returns response for LookML dashboards", async () => {
      const postAsyncSpy = sinon.spy(async () => Promise.resolve({id: "render_id"}))
      const getAsyncSpy = sinon.spy(async () => Promise.resolve({status: "success"}))
      const getBinaryAsyncSpy = sinon.spy(async () => Promise.resolve("pdf content"))

      const stubClient = sinon.stub(integration as any, "lookerClientFromRequest")
        .callsFake(() => ({
          postAsync: postAsyncSpy,
          getAsync: getAsyncSpy,
          getBinaryAsync: getBinaryAsyncSpy,
        }))

      const request = new Hub.ActionRequest()
      const client = await integration.lookerClientFromRequest(request)
      const dashboard = integration.generatePDFDashboard(client, "/dashboards/adwords::campaign?myfield=Yes")
      return chai.expect(dashboard).to.be.fulfilled.then(() => {
        chai.expect(postAsyncSpy).to.have.been.calledWithMatch(
          "/render_tasks/lookml_dashboards/adwords::campaign/pdf?width=1280&height=1",
          {
            dashboard_style: "tiled",
            dashboard_filters: "myfield=Yes",
          },
        )
        chai.expect(getAsyncSpy).to.have.been.calledWithMatch("/render_tasks/render_id")
        chai.expect(getBinaryAsyncSpy).to.have.been.calledWithMatch("/render_tasks/render_id/results")

        stubClient.restore()
      })
    })

    it("calls render handles post error", async () => {
      const postAsyncSpy = sinon.spy(async () => Promise.reject({
        message: "render error",
      }))
      const stubClient = sinon.stub(integration as any, "lookerClientFromRequest")
        .callsFake(() => ({
          postAsync: postAsyncSpy,
        }))

      const request = new Hub.ActionRequest()
      const client = await integration.lookerClientFromRequest(request)
      const dashboard = integration.generatePDFDashboard(client, "/dashboards/adwords::campaign?myfield=Yes")
      return chai.expect(dashboard).to.be.rejectedWith("render error").then(() => {
        stubClient.restore()
      })
    })

    it("sends right params for query with dashboards", async () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query
      request.params = {
        base_url: "https://mycompany.looker.com:19999/api/3.0",
      }
      request.scheduledPlan = {
        title: "Hello attachment",
        url: "https://mycompany.looker.com/look/1",
      }
      request.formParams = {
        to: "test@example.com",
      }
      request.attachment = {dataJSON: {
        fields: [{name: "coolfield", tags: ["looker_dashboard_url"]}],
        data: [
          {coolfield: {value: "/dashboards/1?myfield=Yes"}},
        ],
      }}
      const url = "https://mycompany.looker.com/dashboards/1?myfield=Yes"
      /* tslint:disable max-line-length */
      const msg = new helpers.classes.Mail({
        to: request.formParams.to!,
        subject: request.scheduledPlan.title!,
        from: "Looker <noreply@lookermail.com>",
        text: `View this data in Looker. ${url}\nResults are attached.`,
        html: `<p>View this data in Looker.</p><p><a href="${url}">${request.scheduledPlan.title!} 0</a></p><p>Results are attached.</p>`,
      })
      msg.addAttachment({
        content: "pdf content",
        filename: sanitizeFilename("Hello attachment_0.pdf"),
        type: "application/pdf",
      })
      return expectLookerAPIActionMatch(request, "/dashboards/1?myfield=Yes", msg)
    })

    it("errors if there is no attachment for cell", () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Cell

      const action = integration.action(request)

      return chai.expect(action).to.eventually
        .be.rejectedWith("Couldn't get data from attachment.")
    })

    it("sends right params for cell", async () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Cell
      request.params = {
        base_url: "https://mycompany.looker.com:19999/api/3.0",
        value: "/dashboards/1?myfield=Yes",
      }
      request.scheduledPlan = {
        title: "Hello attachment",
        url: "https://mycompany.looker.com/look/1",
      }
      request.formParams = {
        to: "test@example.com",
      }
      const url = "https://mycompany.looker.com/dashboards/1?myfield=Yes"
      const msg = new helpers.classes.Mail({
        to: request.formParams.to!,
        subject: request.scheduledPlan.title!,
        from: "Looker <noreply@lookermail.com>",
        text: `View this data in Looker. ${url}\nResults are attached.`,
        html: `<p>View this data in Looker.</p><p><a href="${url}">${request.scheduledPlan.title!} 0</a></p><p>Results are attached.</p>`,
      })
      msg.addAttachment({
        content: "pdf content",
        filename: sanitizeFilename("Hello attachment_0.pdf"),
        type: "application/pdf",
      })
      return expectLookerAPIActionMatch(request, "/dashboards/1?myfield=Yes", msg)
    })

  })

  describe("form", () => {

    it("doesn't have form", () => {
      chai.expect(integration.hasForm).equals(true)
    })

  })

})
