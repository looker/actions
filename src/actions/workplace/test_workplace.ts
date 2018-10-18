import * as chai from "chai"
import * as sinon from "sinon"

import * as Hub from "../../hub"

import { WorkplaceAction } from "./workplace"

const integration = new WorkplaceAction()

describe(`${integration.constructor.name} unit tests`, () => {

  let apiStub: any
  let stubClient: any

  before(() => {
    process.env.WORKPLACE_APP_SECRET = "test-secret"
  })

  describe("execute", () => {

    before(() => {
      apiStub = sinon.stub()

      stubClient = sinon.stub(integration as any, "facebookClientFromRequest")
        .callsFake(() => ({
          api: apiStub,
        }))
    })

    after(() => {
      stubClient.restore()
    })

    it("errors if there is no destination", () => {
      const request = new Hub.ActionRequest()
      request.attachment = { dataBuffer: Buffer.from("1,2,3,4", "utf8") }

      const execute = integration.execute(request)

      return chai.expect(execute).to.eventually
        .be.rejectedWith("Missing destination.")
    })

    it("errors if the input has no attachment", () => {
      const request = new Hub.ActionRequest()
      request.formParams = {
        destination: "destination",
      }

      return chai.expect(integration.execute(request)).to.eventually
        .be.rejectedWith("Couldn't get data from attachment.")
    })

    it("sends to right link, destination and message if specified", () => {
      const request = new Hub.ActionRequest()
      request.formParams = {
        destination: "mygroup",
        message: "message",
      }
      request.scheduledPlan = {
        title: "Hello attachment",
        url: "https://mycompany.looker.com/look/1",
      }
      request.attachment = {
        dataBuffer: Buffer.from("1,2,3,4", "utf8"),
        fileExtension: "png",
      }
      apiStub.withArgs(`/${request.formParams.destination}/photos`).returns({ id: "myphoto" })

      sinon.stub(integration as any, "getFileType").returns({
        mime: "image/png",
        ext: "png",
      })

      const execute = integration.execute(request)
      return chai.expect(execute).to.be.fulfilled.then(() => {
        chai.expect(apiStub.firstCall).to.have.been.calledWithMatch(`/mygroup/photos`, "post", {
          source: {
            options: {
              contentType: "image/png",
              filename: "source.png",
            },
            value: request.attachment!.dataBuffer,
          },
        })
      })
    })

  })

  describe("form", () => {

    before(() => {
      apiStub = sinon.stub()

      stubClient = sinon.stub(integration as any, "facebookClientFromRequest")
        .callsFake(() => ({
          api: apiStub,
        }))
    })

    it("has form", () => {
      chai.expect(integration.hasForm).equals(true)
    })

    it("has form with correct destinations", (done) => {

      const stubEmail = "user@user.com"
      const stubId = "userId"

      apiStub.withArgs(`/${stubEmail}`).returns({ id: stubId })
      apiStub.withArgs(`/${stubId}/managed_groups`).returns({
        data: [
          { id: "1", name: "A" },
          { id: "2", name: "B" },
        ],
      })

      const request = new Hub.ActionRequest()
      request.params = {
        facebook_app_access_token: "facebook_app_access_token",
        user_email: stubEmail,
      }

      const form = integration.validateAndFetchForm(request)

      chai.expect(form).to.eventually.deep.equal({
        fields: [{
          description: "Name of the Facebook group you would like to post to.",
          label: "Share In",
          name: "destination",
          options: [
            { name: "1", label: "#A" },
            { name: "2", label: "#B" },
          ],
          required: true,
          type: "select",
        }, {
          description: "Optional message to accompany the post.",
          label: "Message",
          type: "textarea",
          name: "message",
        }],
      }).and.notify(done)
    })

  })

  describe("getMarkdownMessage", () => {
    let request: Hub.ActionRequest
    beforeEach(() => {
      request = new Hub.ActionRequest()
      request.scheduledPlan = {
        title: "Hello attachment",
        url: "https://mycompany.looker.com/look/1",
      }
    })
    describe("without scheduledPlan", () => {
      beforeEach(() => {
        delete request.scheduledPlan
      })
      it("should throw an error", () => {
        const method = () => integration.getMarkdownMessage(request)
        chai.expect(method).to.throw()
      })
    })
    describe("without scheduledPlan.title", () => {
      beforeEach(() => {
        delete request.scheduledPlan!.title
      })
      it("should throw an error", () => {
        const method = () => integration.getMarkdownMessage(request)
        chai.expect(method).to.throw()
      })
    })
    describe("without scheduledPlan.url", () => {
      beforeEach(() => {
        delete request.scheduledPlan!.url
      })
      it("should throw an error", () => {
        const method = () => integration.getMarkdownMessage(request)
        chai.expect(method).to.throw()
      })
    })
    describe("with scheduledPlan.title and scheduledPlan.url", () => {
      it("should return expected output", () => {
        const result = integration.getMarkdownMessage(request)
        const expected = `[Hello attachment](https://mycompany.looker.com/look/1)\n\n`
        chai.expect(result).to.equal(expected)
      })
    })

  })

})
