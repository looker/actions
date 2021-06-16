import * as chai from "chai"
import * as httpRequest from "request-promise-native"
import * as sinon from "sinon"

import * as Hub from "../../hub"

import * as Pcancel from "p-cancelable"
import { DataRobotAction } from "./datarobot"

const action = new DataRobotAction()

describe(`${action.constructor.name} unit tests`, () => {

  describe("action", () => {
    let stubHttpPost: sinon.SinonStub

    afterEach(() => {
      stubHttpPost.restore()
    })

    it("sends the right body with URL", async () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query
      request.params.datarobot_api_token = "token"
      request.formParams = {
        projectName: "DR Project from Looker",
      }
      request.scheduledPlan = {
        downloadUrl: "https://testurl.com/downlaoad",
      }

      const postSpy = sinon.spy((params: any) => {
        chai.expect(params.url).to.equal("https://app.datarobot.com/api/v2/projects/")
        chai.expect(params.headers.Authorization).to.equal("Token token")
        chai.expect(params.body.projectName).to.equal("DR Project from Looker")
        chai.expect(params.body.url).to.equal("https://testurl.com/downlaoad")
        return {
          promise: async () => new Promise<void>((resolve: any) => resolve()),
        }
      })
      stubHttpPost = sinon.stub(httpRequest, "post").callsFake(postSpy)
      const cancel: Pcancel<string>[] = []

      chai.expect(action.validateAndExecute(request, cancel)).to.be.fulfilled.then(() => {
        chai.expect(postSpy).to.have.been.called
      })
    })

  })

  describe("form", () => {

    it("has form", () => {
      chai.expect(action.hasForm).equals(true)
    })

    it("has form with projectName param", () => {
      const stubGet = sinon.stub(action, "validateDataRobotToken" as any).callsFake(async () => {
        return new Promise<any>((resolve: any) => resolve())
      })

      const request = new Hub.ActionRequest()
      request.params.datarobot_api_token = "token"
      const form = action.validateAndFetchForm(request)
      request.params.datarobot_url = "https://custom-url.com"

      chai.expect(form).to.eventually.deep.equal({
        fields: [
          {
            label: "The name of the project to be created",
            name: "projectName",
            required: false,
            type: "string",
          },
        ],
      })

      stubGet.restore()
    })

  })
})
