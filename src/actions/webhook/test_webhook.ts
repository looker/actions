import * as chai from "chai"
import * as req from "request-promise-native"
import * as sinon from "sinon"

import * as Hub from "../../hub"

import { WebhookAction } from "./webhook"

import concatStream = require("concat-stream")
import * as Pcancel from "p-cancelable"

class GoodWebhookAction extends WebhookAction {

  name = "webhook"
  label = "webhook"
  description = ""
  domain = "example.com"

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

const action = new GoodWebhookAction()
const cancel: Pcancel<string>[] = []

function expectWebhookMatch(request: Hub.ActionRequest, match: {url: string, body: Buffer}) {
  const postSpy = sinon.spy((params: any, callback: (err: any, response: any) => void) => {
    chai.expect(params.url).to.equal(match.url)
    params.body.pipe(concatStream((buffer) => {
      chai.expect(buffer).to.equal(match.body)
    }))
    callback(null, `post success`)
  })
  const stubPost = sinon.stub(req, "post").callsFake(postSpy)
  return chai.expect(action.validateAndExecute(request, cancel)).to.be.fulfilled.then(() => {
    chai.expect(postSpy).to.have.been.called
    stubPost.restore()
  })
}

describe(`${action.constructor.name} unit tests`, () => {

  describe("action", () => {

    it("errors if there is no url", () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query
      request.formParams = {}
      request.attachment = {dataJSON: {
        fields: [{name: "coolfield", tags: ["user_id"]}],
        data: [{coolfield: {value: "funvalue"}}],
      }}
      return chai.expect(action.validateAndExecute(request, cancel)).to.eventually
        .be.rejectedWith("Missing url.")
    })

    it("errors if there is wrong domain for url", () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query
      request.formParams = {
        url: "http://abc.com/",
      }
      request.attachment = {dataJSON: {
        fields: [{name: "coolfield", tags: ["user_id"]}],
        data: [{coolfield: {value: "funvalue"}}],
      }}
      return chai.expect(action.validateAndExecute(request, cancel)).to.eventually
        .be.rejectedWith("Incorrect domain for url.")
    })

    it("sends right body", () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query
      request.formParams = {
        url: "http://abc.example.com/",
      }
      request.attachment = {dataJSON: {
        fields: [{name: "coolfield", tags: ["user_id"]}],
        data: [{coolfield: {value: "funvalue"}}],
      }}
      return expectWebhookMatch(request, {
        url: "http://abc.example.com/",
        body: request.attachment.dataJSON,
      })
    })

  })

  describe("form", () => {

    it("has form", () => {
      chai.expect(action.hasForm).equals(true)
    })

    it("has form with url param", (done) => {
      const request = new Hub.ActionRequest()
      const form = action.validateAndFetchForm(request)
      chai.expect(form).to.eventually.deep.equal({
        fields: [{
          label: "Webhook URL",
          name: "url",
          required: true,
          type: "string",
        }],
      }).and.notify(done)
    })
  })
})
