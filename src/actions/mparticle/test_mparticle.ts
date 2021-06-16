import * as chai from "chai"
import * as sinon from "sinon"

import * as Hub from "../../hub"

import * as Pcancel from "p-cancelable"
import * as httpRequest from "request-promise-native"
import Sinon = require("sinon")
import * as apiKey from "../../server/api_key"
import Server from "../../server/server"
import { MparticleAction } from "./mparticle"
import { EVENT, USER } from "./mparticle_constants"

const action = new MparticleAction()
action.executeInOwnProcess = false
const cancel: Pcancel<string>[] = []

const sampleData = {
  fields: {
    measures: [],
    dimensions: [
      {name: "some.field", tags: ["sometag"]},
    ],
    table_calculations: [],
  },
  data: [{"some.field": {value: "value"}}],
}

describe(`${action.constructor.name} unit tests`, () => {
  describe("action", () => {

    it("errors if there is no apiKey", () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query
      request.params = {
        apiSecret: "myApiSecret",
      }
      request.formParams = {
        data_type: USER,
      }
      request.formParams = {}
      request.attachment = {
        dataBuffer: Buffer.from(JSON.stringify(sampleData)),
      }
      return chai.expect(action.validateAndExecute(request, cancel)).to.eventually
        .be.rejectedWith("Required setting \"API Key\" not specified in action settings.")
    })

    it("errors if there is no apiSecret", () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query
      request.params = {
        apiKey: "myApiKey",
      }
      request.formParams = {
        data_type: USER,
      }
      request.formParams = {}
      request.attachment = {
        dataBuffer: Buffer.from(JSON.stringify(sampleData)),
      }
      return chai.expect(action.validateAndExecute(request, cancel)).to.eventually
        .be.rejectedWith("Required setting \"API Secret\" not specified in action settings.")
    })

    it("errors if there is no data_type", () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query
      request.params = {
        apiKey: "myApiKey",
        apiSecret: "myApiSecret",
      }
      request.formParams = {}
      request.attachment = {
        dataBuffer: Buffer.from(JSON.stringify(sampleData)),
      }
      return chai.expect(action.validateAndExecute(request, cancel)).to.eventually
        .be.rejectedWith("Missing data type (user|event).")
    })

    it("errors if there is not at least one userIdentity", () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query
      request.params = {
        apiKey: "myApiKey",
        apiSecret: "myApiSecret",
      }
      request.formParams = {
        data_type: USER,
      }
      request.attachment = {
        dataBuffer: Buffer.from(JSON.stringify(sampleData)),
      }
      return chai.expect(action.validateAndExecute(request, cancel)).to.eventually
        .be.rejectedWith("Each row must specify at least 1 identity tag.")
    })
  })

  describe("asJSON", () => {
    it("supported format is json_detail_lite_stream on lookerVersion 6.2 and above", (done) => {
      const stub = sinon.stub(apiKey, "validate").callsFake((k: string) => k === "foo")
      chai.request(new Server().app)
        .post("/actions/mparticle")
        .set("Authorization", "Token token=\"foo\"")
        .set("User-Agent", "LookerOutgoingWebhook/6.2.0")
        .end((_err, res) => {
          chai.expect(res).to.have.status(200)
          chai.expect(res.body).to.deep.include({supported_formats: ["json_detail_lite_stream"]})
          stub.restore()
          done()
        })
    })
  })

  describe("field mappings", () => {
    let postSpy: Sinon.SinonSpy
    let stubHttpPost: Sinon.SinonStub

    const data = {
      fields: {
        measures: [],
        dimensions: [
          {name: "user.customerid", tags: ["mp_customer_id"]},
          {name: "user.brand", tags: ["mp_device_info"]},
          {name: "user.bad_device_info_field", tags: ["mp_device_info"]},
          {name: "user.good_custom", tags: ["mp_custom_attribute"]},
          {name: "user.bad_custom", tags: []},
        ],
        table_calculations: [],
      },
      data: [
        {
          "user.customerid": {value: "value"},
          "user.brand": {value: "foo"},
          "user.bad_device_info_field": {value: "bar"},
          "user.good_custom": {value: "good"},
          "user.bad_custom": {value: "bad"},
        },
      ],
    }

    beforeEach(() => {
      postSpy = sinon.spy((_params: any) => {
        return {
          promise: async () => new Promise<void>((resolve: any) => resolve()),
        }
      })
      stubHttpPost = sinon.stub(httpRequest as any, "post").callsFake(postSpy)
    })

    afterEach(() => stubHttpPost.restore())

    it("sets custom_event_type to 'other'", async () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query
      request.params = {
        apiKey: "myApiKey",
        apiSecret: "myApiSecret",
      }
      request.formParams = {
        data_type: EVENT,
      }

      request.attachment = {
        dataBuffer: Buffer.from(JSON.stringify(data)),
      }
      await action.validateAndExecute(request, cancel)
      chai.expect(postSpy.args[0][0].body[0].events[0].data.custom_event_type).to.equal("other")
    })

    it("only includes whitelisted device_info fields", async () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query
      request.params = {
        apiKey: "myApiKey",
        apiSecret: "myApiSecret",
      }
      request.formParams = {
        data_type: EVENT,
      }

      request.attachment = {
        dataBuffer: Buffer.from(JSON.stringify(data)),
      }
      await action.validateAndExecute(request, cancel)
      chai.expect(postSpy.args[0][0].body[0].device_info).to.eql({ brand: "foo" })
    })

    it("only captures custom attributes with the mp_custom_attribute tag", async () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query
      request.params = {
        apiKey: "myApiKey",
        apiSecret: "myApiSecret",
      }
      request.formParams = {
        data_type: EVENT,
      }

      request.attachment = {
        dataBuffer: Buffer.from(JSON.stringify(data)),
      }
      await action.validateAndExecute(request, cancel)
      const custAttrs = postSpy.args[0][0].body[0].events[0].data.custom_attributes
      chai.expect(custAttrs).to.eql({ "looker_user.good_custom": "good" })
    })
  })
})
