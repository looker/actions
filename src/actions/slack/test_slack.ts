import * as chai from "chai"
import * as sinon from "sinon"

import * as Hub from "../../hub"
import {SlackAction} from "./slack"
import * as SlackClientManager from "./slack_client_manager"
import {isSupportMultiWorkspaces, MULTI_WORKSPACE_SUPPORTED_VERSION} from "./slack_client_manager"
import * as utils from "./utils"

const action = new SlackAction()

// @ts-ignore
const stubSlackClient = (fn: () => void) => sinon.stub(SlackClientManager, "makeSlackClient").callsFake(fn)

describe(`${action.constructor.name} tests`, () => {

  describe("isSupportMultiWorkspaces", () => {
    const request = new Hub.ActionRequest()
    request.lookerVersion = "6.24.0"
    chai.expect(isSupportMultiWorkspaces(request)).to.eq(false)

    request.lookerVersion = MULTI_WORKSPACE_SUPPORTED_VERSION
    chai.expect(isSupportMultiWorkspaces(request)).to.eq(true)
  })

  describe("form", () => {
    it("has form", () => {
      chai.expect(action.hasForm).equals(true)
    })
  })

  describe("oauthCheck", () => {
    it("returns error if the user hasn't authed yet - no state_json", () => {
      const request = new Hub.ActionRequest()
      const form = action.oauthCheck(request)

      return chai.expect(form).to.eventually.deep.equal({
        fields: [],
        error: "You must connect to a Slack workspace first.",
      })
    })

    it("returns error if the user hasn't authed yet - invalid auth", (done) => {
      const request = new Hub.ActionRequest()
      request.params = { state_json: "someToken" }

      const stubClient = stubSlackClient(
          () => ({
            auth: {
              test: () => { throw Error("An API error occurred: invalid_auth") },
            },
          }),
      )

      const form = action.oauthCheck(request)

      chai.expect(form).to.eventually.deep.equal({
        fields: [],
        error: "Your Slack authentication credentials are not valid.",
      }).and.notify(stubClient.restore).and.notify(done)
    })

    it("returns user logged in info", (done) => {
      const request = new Hub.ActionRequest()
      request.params = { state_json: "someToken" }

      const stubClient = stubSlackClient(
          () => ({
            auth: {
              test: async () => Promise.resolve({
                ok: true,
                team: "Some Team",
                team_id: "some_team_id",
              }),
            },
          }),
      )

      const form = action.oauthCheck(request)

      chai.expect(form).to.eventually.deep.equal({
        fields: [{
          name: "Connected",
          type: "message",
          value: `Connected with Some Team (some_team_id)`,
        }],
      }).and.notify(stubClient.restore).and.notify(done)
    })
  })

  describe("form", () => {
    let getDisplayedFormFieldsStub: any

    afterEach(() => {
      getDisplayedFormFieldsStub && getDisplayedFormFieldsStub.restore()
    })

    it("returns fields correctly from getDisplayedFormFields", () => {
      getDisplayedFormFieldsStub = sinon.stub(utils, "getDisplayedFormFields").returns(
          Promise.resolve([
              {
                label: "Super Label",
                type: "string",
                name: "boo",
              },
          ]),
      )

      const request = new Hub.ActionRequest()

      request.params = { state_json: "someToken" }

      const form = action.form(request)

      return chai.expect(form).to.eventually.deep.equal({
        fields: [{
          label: "Super Label",
          type: "string",
          name: "boo",
        }],
      })
    })

    it("returns error message when getDisplayedFormFields throws and state_url is empty", () => {
      getDisplayedFormFieldsStub = sinon.stub(utils, "getDisplayedFormFields").rejects()

      const request = new Hub.ActionRequest()

      const form = action.form(request)

      return chai.expect(form).to.eventually.deep.equal({
        fields: [],
        error: "Illegal State: state_url is empty.",
      })
    })

    it("returns log in link when we can't fetch form and state_url is valid", () => {
      getDisplayedFormFieldsStub = sinon.stub(utils, "getDisplayedFormFields").rejects()

      const request = new Hub.ActionRequest()

      request.params.state_url = "/flooby"

      const form = action.form(request)

      return chai.expect(form).to.eventually.deep.equal({
        state: {},
        fields: [{
          name: "login",
          type: "oauth_link",
          label: "Log in",
          description: "In order to send to a file, you will need to log in to your Slack account.",
          oauth_url: "/flooby",
        }],
      })
    })

    describe("multiple workspaces", () => {
       it("doesn't have any connected workspace", () => {
        const request = new Hub.ActionRequest()
        request.lookerVersion = MULTI_WORKSPACE_SUPPORTED_VERSION
        request.params = { state_json: JSON.stringify([]) }
        request.params.state_url = "/flooby"

        const form = action.form(request)

        return chai.expect(form).to.eventually.deep.equal({
              state: {},
              fields: [{
                name: "login",
                type: "oauth_link",
                label: "Log in",
                description: "In order to send to a file, you will need to log in to your Slack account.",
                oauth_url: "/flooby",
              }],
          })
      })

       it("default to the first workspace if there is no selected workspace, and fetch form", () => {
        const defaultWsId = "ws1"

        const request = new Hub.ActionRequest()
        request.params.state_url = "/flooby"
        request.lookerVersion = MULTI_WORKSPACE_SUPPORTED_VERSION
        request.params = {
          state_json: JSON.stringify([{ install_id: defaultWsId, token: "someToken1"}]),
        }

        const stubClient = stubSlackClient(
            () => ({
              auth: {
                test: () => ({
                  ok: true,
                  team: "Some Team",
                  team_id: defaultWsId,
                }),
              },
            }),
        )

        getDisplayedFormFieldsStub = sinon.stub(utils, "getDisplayedFormFields").returns(
            Promise.resolve([
              {
                label: "Super Label",
                type: "string",
                name: "boo",
              },
            ]),
        )

        const form = action.form(request)

        return chai.expect(form).to.eventually.deep.equal({
          fields: [
            {
              default: defaultWsId,
              description: "Name of the Slack workspace you would like to share in.",
              interactive: true,
              label: "Workspace",
              name: "workspace",
              options: [
                {
                  label: "Some Team",
                  name: defaultWsId,
                },
              ],
              required: true,
              type: "select",
            },
            {
              label: "Super Label",
              type: "string",
              name: "boo",
            },
          ],
        }).and.notify(stubClient.restore)
      })

       it("select the correct workspace and fetch form", () => {
        const selectedWorkspace = "ws2"

        const request = new Hub.ActionRequest()
        request.params.state_url = "/flooby"
        request.lookerVersion = MULTI_WORKSPACE_SUPPORTED_VERSION
        request.params = {
          state_json: JSON.stringify(
              [
                { install_id: "ws1", token: "someToken1"},
                { install_id: "ws2", token: "someToken2"},
              ],
          ),
        }
        request.formParams.workspace = selectedWorkspace

        const mockClient2 = {
          auth: {
            test: () => ({ ok: true, team: "WS2", team_id: selectedWorkspace}),
          },
        }

        // @ts-ignore
        const stubClient = sinon.stub(SlackClientManager, "makeSlackClient").callsFake((token) => {
          switch (token) {
            case "someToken1":
              return {
                auth: {
                  test: () => ({ ok: true, team: "WS1", team_id: "ws1"}),
                },
              }
            case "someToken2":
              return mockClient2
          }
        })

        // @ts-ignore
        getDisplayedFormFieldsStub = sinon.stub(utils, "getDisplayedFormFields").callsFake((client) => {
          chai.expect(client).to.equals(mockClient2)
          return [
            {
              label: "Super Label",
              type: "string",
              name: "boo",
            },
          ]
        })

        const form = action.form(request)

        return chai.expect(form).to.eventually.deep.equal({
          fields: [
            {
              default: selectedWorkspace ,
              description: "Name of the Slack workspace you would like to share in.",
              interactive: true,
              label: "Workspace",
              name: "workspace",
              options: [
                {
                  label: "WS1",
                  name: "ws1",
                },
                {
                  label: "WS2",
                  name: selectedWorkspace,
                },
              ],
              required: true,
              type: "select",
            },
            {
              label: "Super Label",
              type: "string",
              name: "boo",
            },
          ],
        }).and.notify(stubClient.restore)
      })
    })
  })

  describe("execute", () => {
    let handleExecuteStub: any

    afterEach(() => {
      handleExecuteStub && handleExecuteStub.restore()
    })

    it("has streaming enabled", () => {
      chai.expect(action.usesStreaming).equals(true)
    })

    it("returns error response if no client was selected", () => {
      const request = new Hub.ActionRequest()

      const form = action.execute(request)

      return chai.expect(form).to.eventually.deep.equal(
          new Hub.ActionResponse({success: false, message: "You must connect to a Slack workspace first."}),
      )
    })

    it("returns fields correctly from getDisplayedFormFields", () => {
      const response = new Hub.ActionResponse({success: true})
      handleExecuteStub = sinon.stub(utils, "handleExecute").returns(
          Promise.resolve(response),
      )

      const request = new Hub.ActionRequest()

      request.params = { state_json: "someToken" }

      const form = action.execute(request)

      return chai.expect(form).to.eventually.deep.equal(response)
    })

    describe("multiple workspaces", () => {
       it("has a selected workspace", () => {
        const response = new Hub.ActionResponse({success: true})

        handleExecuteStub = sinon.stub(utils, "handleExecute").returns(
            Promise.resolve(response),
        )

        const request = new Hub.ActionRequest()

        request.lookerVersion = MULTI_WORKSPACE_SUPPORTED_VERSION

        request.params = { state_json: JSON.stringify([{ install_id: "ws1", token: "someToken"}]) }
        request.formParams = { workspace: "ws1" }

        const form = action.execute(request)

        return chai.expect(form).to.eventually.deep.equal(response)
      })

       it("doesn't have a selected workspace default to the first one", () => {
         const response = new Hub.ActionResponse({success: true})

         handleExecuteStub = sinon.stub(utils, "handleExecute").returns(Promise.resolve(response))

         const request = new Hub.ActionRequest()
         request.lookerVersion = MULTI_WORKSPACE_SUPPORTED_VERSION
         request.params = { state_json: JSON.stringify([{ install_id: "ws1", token: "someToken"}]) }

         const form = action.execute(request)

         return chai.expect(form).to.eventually.deep.equal(response)
      })

       it("uses the selected workspace if multiple ws is given", () => {
        const response = new Hub.ActionResponse({success: true})

        const mockClient1 = { id: "I'm mockClient1", token: "some token 1"}
        const mockClient2 = { id: "I'm mockClient2", token: "some token 2"}

        // @ts-ignore
        const stubClient = sinon.stub(SlackClientManager, "makeSlackClient").callsFake((token) => {
          switch (token) {
            case "some token 1":
              return mockClient1
            case "some token 2":
              return mockClient2
          }
        })

        const request = new Hub.ActionRequest()

        request.lookerVersion = MULTI_WORKSPACE_SUPPORTED_VERSION

        request.params = {
          state_json: JSON.stringify(
              [
                { install_id: "ws1", token: "some token 1"},
                { install_id: "ws2", token: "some token 2"},
              ],
          ),
        }

        request.formParams = { workspace: "ws2" }

        // @ts-ignore
        handleExecuteStub = sinon.stub(utils, "handleExecute").callsFake((r, client) => {
          // pass in the whole request
          chai.expect(r).to.equals(request)

          // pass in the correct client
          chai.expect(client).to.equals(mockClient2)

          return response
        })

        const form = action.execute(request)

        return chai.expect(form).to.eventually.deep.equal(response).and.notify(stubClient.restore)
      })
    })
  })
})
