import * as chai from "chai"
import * as req from "request-promise-native"
import * as sinon from "sinon"

import * as Hub from "../../hub"

import * as Pcancel from "p-cancelable"
import { BrazeAction } from "./braze"

const sampleBrazeData = {
  fields: {
    measures: [],
    dimensions: [
      {name: "external_id", tags: ["braze_id"]},
      {name: "field_1_attribute", tags: ["braze[field_1]", "user_field 1"]},
      {name: "field_2_attribute", tags: ["braze[field_2]"]},
      {name: "field_3_no_tag", tags: []},
    ],
  },
  data: [{
    external_id: {value: "abc123"},
    field_1_attribute: {value: "abc123 field 1 value "},
    field_2_attribute: {value: "abc123 field 2 value "},
    field_3_no_tag: {value: "abc123 field 3 value "},
  }, {
    external_id: {value: "xyz987"},
    field_1_attribute: {value: "xyz987 field 1 value "},
    field_2_attribute: {value: "xyz987 field 2 value "},
    field_3_no_tag: {value: "xyz987 field 3 value "},
  }],
}

function expectBrazeMatch(request: Hub.ActionRequest) {
  const postSpy = sinon.spy(() => {
    return {success: true, message: "ok"}
  })
  const stubPost = sinon.stub(req, "post").callsFake(postSpy)
  const cancel: Pcancel<string>[] = []
  return chai.expect(action.validateAndExecute(request, cancel)).to.be.fulfilled.then(() => {
    chai.expect(postSpy).to.have.been.called
    stubPost.restore()
  })
}

class BrazeActionTest extends BrazeAction {
  name = "braze"

  async form() {
    const form = new Hub.ActionForm()
    form.fields = [{
      label: "Unique Key",
      name: "braze_key",
      required: true,
      options: [
        {name: "external_id", label: "external_id"},
        {name: "braze_id", label: "braze_id"},
      ],
      type: "select",
      default: "external_id",
    }, {
      label: "Export Label",
      name: "braze_segment",
      required: true,
      type: "string",
    }]
    return form
  }
}

const action = new BrazeActionTest()
action.executeInOwnProcess = false
describe(`${action.constructor.name} unit tests`, () => {
  describe("action", () => {
    it("errors if there is no configuration for query", () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query
      return chai.expect(action.execute(request)).to.eventually
        .be.rejectedWith("Missing config settings.")
    })

    it("errors if there is no endpoint", () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query
      request.params = {
        braze_api_key: "AAACCCKKKATTT",
      }

      return chai.expect(action.execute(request)).to.eventually
        .be.rejectedWith("Missing Endpoint.")
    })

    it("errors if the protocal is missing from the endpoint", () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query
      request.params = {
        braze_api_key: "AAACCCKKKATTT",
        braze_api_endpoint: "rest.notbraze.com",
      }

      return chai.expect(action.execute(request)).to.eventually
        .be.rejectedWith( "Missing Protocol for endpoint.")
    })

    it("errors if is a not a Braze endpoint", () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query
      request.params = {
        braze_api_key: "AAACCCKKKATTT",
        braze_api_endpoint: "https://rest.notbraze.com",
      }

      return chai.expect(action.execute(request)).to.eventually
        .be.rejectedWith("Bad Endpoint.")
    })

    it("errors if missing API key", () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query
      request.params = {
        braze_api_key: "",
        braze_api_endpoint: "https://rest.braze.com",
      }
      return chai.expect(action.execute(request)).to.eventually
        .be.rejectedWith("Missing API Key.")
    })

    it("success with sample data", async () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query
      request.params = {
        braze_api_key: "AAACCCKKKATTT",
        braze_api_endpoint: "https://rest.braze.com",
      }
      request.formParams = {
        braze_key: "external_id",
        braze_segment: "looker_export",
      }
      request.attachment = {
        dataBuffer: Buffer.from(JSON.stringify(sampleBrazeData)),
      }
      return expectBrazeMatch(request)
    })

    it("success with sample data and EU endpoint", async () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query
      request.params = {
        braze_api_key: "AAACCCKKKATTT",
        braze_api_endpoint: "https://rest.braze.eu",
      }
      request.formParams = {
        braze_key: "external_id",
        braze_segment: "looker_export",
      }
      request.attachment = {
        dataBuffer: Buffer.from(JSON.stringify(sampleBrazeData)),
      }
      return expectBrazeMatch(request)
    })
  })

  describe("form", () => {
    it("has form", () => {
      chai.expect(action.hasForm).equals(true)
    })
  })
})
