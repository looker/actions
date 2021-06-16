import * as chai from "chai"

import * as Pcancel from "p-cancelable"
import * as Hub from "../src/hub"
import { ActionRequest } from "../src/hub"

class TestAction extends Hub.Action {
  name = "test"
  label = "test"
  description = "supertest"
  supportedActionTypes = [Hub.ActionType.Cell, Hub.ActionType.Dashboard]
  params = [{
    name: "cool",
    label: "Cool Param",
    sensitive: false,
    required: true,
  }]

  async execute(_request: Hub.ActionRequest) {
    return new Hub.ActionResponse({message: "Did It"})
  }

  async form() {
    const form = new Hub.ActionForm()
    form.fields = [{
      label: "Setting",
      name: "settings",
      required: false,
      type: "string",
    }]
    return form
  }
}

describe("Hub.Action", () => {

  describe("validateAndFetchForm", () => {

    it("automatically errors for lack of required parameters", () => {
      const action = new TestAction()
      const req = new ActionRequest()
      return chai.expect(action.validateAndFetchForm(req)).to.eventually.deep.equal({
        fields: [],
        error: "Required setting \"Cool Param\" not specified in action settings.",
      })
    })

    it("succeeds for a valid request", () => {
      const action = new TestAction()
      const req = new ActionRequest()
      req.type = Hub.ActionType.Dashboard
      req.params = {
        cool: "beans",
      }
      return chai.expect(action.validateAndFetchForm(req)).to.eventually.deep.eq({
        fields: [{
          label: "Setting",
          name: "settings",
          required: false,
          type: "string",
        }],
      })
    })

  })

  describe("validateAndExecute", () => {

    it("automatically errors for lack of required parameters", () => {
      const action = new TestAction()
      const req = new ActionRequest()
      const cancel: Pcancel<string>[] = []
      req.type = Hub.ActionType.Dashboard
      return chai.expect(action.validateAndExecute(req, cancel)).to.eventually.be.rejectedWith(
        'Required setting "Cool Param" not specified in action settings.',
      )
    })

    it("automatically errors for an unspecified request type", () => {
      const action = new TestAction()
      const req = new ActionRequest()
      const cancel: Pcancel<string>[] = []
      return chai.expect(action.validateAndExecute(req, cancel)).to.eventually.be.rejectedWith(
        'No request type specified. The request must be of type: "cell", "dashboard".',
      )
    })

    it("automatically errors for an unsupported request type", () => {
      const action = new TestAction()
      const req = new ActionRequest()
      const cancel: Pcancel<string>[] = []
      req.type = Hub.ActionType.Query
      return chai.expect(action.validateAndExecute(req, cancel)).to.eventually.be.rejectedWith(
        'This action does not support requests of type "query". The request must be of type: "cell", "dashboard".',
      )
    })

    it("succeeds for a valid request", () => {
      const action = new TestAction()
      const req = new ActionRequest()
      const cancel: Pcancel<string>[] = []
      req.type = Hub.ActionType.Dashboard
      req.params = {
        cool: "beans",
      }
      return chai.expect(action.validateAndExecute(req, cancel)).to.eventually.deep.eq({
        message: "Did It",
        refreshQuery: false,
        success: true,
        validationErrors: [],
      })
    })

  })

})
