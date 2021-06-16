import * as b64 from "base64-url"
import * as chai from "chai"
import * as https from "request-promise-native"
import * as sinon from "sinon"

import concatStream = require("concat-stream")

import * as Hub from "../../../hub"

import { ActionCrypto } from "../../../hub"
import { GoogleDriveAction } from "./google_drive"

const action = new GoogleDriveAction()

const stubFileName = "stubSuggestedFilename"
const stubFolder = "stubSuggestedFolder"

function expectGoogleDriveMatch(request: Hub.ActionRequest, paramsMatch: any) {

  const expectedBuffer = paramsMatch.media.body
  delete paramsMatch.media.body

  const createSpy = sinon.spy(async (params: any) => {
    params.media.body.pipe(concatStream((buffer) => {
      chai.expect(buffer.toString()).to.equal(expectedBuffer.toString())
    }))
    return { promise: async () => Promise.resolve() }
  })

  const stubClient = sinon.stub(action as any, "driveClientFromRequest")
    .resolves({
      files: {
        create: createSpy,
      },
    })

  return chai.expect(action.validateAndExecute(request)).to.be.fulfilled.then(() => {
    chai.expect(createSpy).to.have.been.called
    stubClient.restore()
  })
}

describe(`${action.constructor.name} unit tests`, () => {
  let encryptStub: any
  let decryptStub: any

  beforeEach(() => {
    encryptStub = sinon.stub(ActionCrypto.prototype, "encrypt").callsFake( async (s: string) => b64.encode(s) )
    decryptStub = sinon.stub(ActionCrypto.prototype, "decrypt").callsFake( async (s: string) => b64.decode(s) )
  })

  afterEach(() => {
    encryptStub.restore()
    decryptStub.restore()
  })

  describe("action", () => {

    it("successfully interprets execute request params", () => {
      const request = new Hub.ActionRequest()
      const dataBuffer = Buffer.from("Hello")
      request.type = Hub.ActionType.Query
      request.attachment = {dataBuffer, fileExtension: "csv"}
      request.formParams = {filename: stubFileName, folder: stubFolder}
      request.params = {
        state_url: "https://looker.state.url.com/action_hub_state/asdfasdfasdfasdf",
        state_json: JSON.stringify({tokens: "access", redirect: "url"}),
      }
      return expectGoogleDriveMatch(request, {
        requestBody: {
          name: stubFileName,
          mimeType: undefined,
          parents: [stubFolder],
        },
        media: {
          body: dataBuffer,
        },
      })
    })

    it("sets state to reset if error in create", (done) => {
      const request = new Hub.ActionRequest()
      const dataBuffer = Buffer.from("Hello")
      request.type = Hub.ActionType.Query
      request.attachment = {dataBuffer, fileExtension: "csv"}
      request.formParams = {filename: stubFileName, folder: stubFolder}
      request.params = {
        state_url: "https://looker.state.url.com/action_hub_state/asdfasdfasdfasdf",
        state_json: JSON.stringify({tokens: "code", redirect: "url"}),
      }
      const stubClient = sinon.stub(action as any, "driveClientFromRequest")
        .resolves({
          files: {
            create: async () => Promise.reject("reject"),
          },
        })
      const resp = action.validateAndExecute(request)
      chai.expect(resp).to.eventually.deep.equal({
        success: false,
        message: undefined,
        // state: {data: "reset"},
        refreshQuery: false,
        validationErrors: [],
      }).and.notify(stubClient.restore).and.notify(done)
    })
  })

  describe("form", () => {
    it("has form", () => {
      chai.expect(action.hasForm).equals(true)
    })

    it("returns an oauth form on bad login", (done) => {
      const stubClient = sinon.stub(action as any, "driveClientFromRequest")
        .resolves({
          files: {
            list: async () => Promise.reject("reject"),
          },
        })
      const request = new Hub.ActionRequest()
      request.params = {
        state_url: "https://looker.state.url.com/action_hub_state/asdfasdfasdfasdf",
        state_json: JSON.stringify({tokens: "access", redirect: "url"}),
      }
      const form = action.validateAndFetchForm(request)
      chai.expect(form).to.eventually.deep.equal({
        fields: [{
          name: "login",
          type: "oauth_link_google",
          description: "In order to send to Google Drive, you will need to log in" +
            " once to your Google account.",
          label: "Log in",
          oauth_url: `${process.env.ACTION_HUB_BASE_URL}/actions/google_drive/` +
            `oauth?state=eyJzdGF0ZXVybCI6Imh0dHBzOi8vbG9` +
            `va2VyLnN0YXRlLnVybC5jb20vYWN0aW9uX2h1Yl9zdGF0ZS9hc2RmYXNkZmFzZGZhc2RmIn0`,
        }],
        state: {},
      }).and.notify(stubClient.restore).and.notify(done)
    })

    it("does not blow up on bad state JSON and returns an OAUTH form", (done) => {
      const stubClient = sinon.stub(action as any, "driveClientFromRequest")
        .resolves({
          files: {
            list: async () => Promise.reject("reject"),
          },
        })
      const request = new Hub.ActionRequest()
      request.params = {
        state_url: "https://looker.state.url.com/action_hub_state/asdfasdfasdfasdf",
        state_json: JSON.stringify({bad: "access", redirect: "url"}),
      }
      const form = action.validateAndFetchForm(request)
      chai.expect(form).to.eventually.deep.equal({
        fields: [{
          name: "login",
          type: "oauth_link_google",
          description: "In order to send to Google Drive, you will need to log in" +
          " once to your Google account.",
          label: "Log in",
          oauth_url: `${process.env.ACTION_HUB_BASE_URL}/actions/google_drive/` +
            `oauth?state=eyJzdGF0ZXVybCI6Imh0dHBzOi8vbG9` +
            `va2VyLnN0YXRlLnVybC5jb20vYWN0aW9uX2h1Yl9zdGF0ZS9hc2RmYXNkZmFzZGZhc2RmIn0`,
        }],
        state: {},
      }).and.notify(stubClient.restore).and.notify(done)
    })

    it("returns correct fields on oauth success", (done) => {
      const stubClient = sinon.stub(action as any, "driveClientFromRequest")
        .resolves({
          files: {
            list: async () => Promise.resolve({
              data: {
                files: [
                  {
                    id: "fake_id",
                    name: "fake_name",
                  },
                ],
              },
            }),
          },
          drives: {
            list: async () => Promise.resolve({
              data: {
                drives: [
                  {
                    id: "fake_drive",
                    name: "fake_drive_label",
                  },
                ],
              },
            }),
          },
        })
      const request = new Hub.ActionRequest()
      request.params = {
        state_url: "https://looker.state.url.com/action_hub_state/asdfasdfasdfasdf",
        state_json: JSON.stringify({tokens: "access", redirect: "url"}),
      }
      const form = action.validateAndFetchForm(request)
      chai.expect(form).to.eventually.deep.equal({
        fields: [{
          description: "Google Drive where your file will be saved",
          label: "Select Drive to save file",
          name: "drive",
          options: [{name: "mydrive", label: "My Drive"}, {name: "fake_drive", label: "fake_drive_label"}],
          default: "mydrive",
          interactive: true,
          required: true,
          type: "select",
        }, {
          description: "Google Drive folder where your file will be saved",
          label: "Select folder to save file",
          name: "folder",
          options: [{name: "root", label: "Drive Root"}, { name: "fake_id", label: "fake_name" }],
          default: "root",
          required: true,
          type: "select",
        }, {
          label: "Enter a name",
          name: "filename",
          type: "string",
          required: true,
        }],
        state: {
          data: JSON.stringify({tokens: "access", redirect: "url"}),
        },
      }).and.notify(stubClient.restore).and.notify(done)
    })
  })

  describe("oauth", () => {
    it("returns correct redirect url", () => {
      process.env.GOOGLE_DRIVE_CLIENT_ID = "testingkey"
      const prom = action.oauthUrl("https://actionhub.com/actions/google_drive/oauth_redirect",
        `eyJzdGF0ZXVybCI6Imh0dHBzOi8vbG9va2VyLnN0YXRlLnVybC5jb20vYWN0aW9uX2h1Yl9zdGF0ZS9hc2RmYXNkZmFzZGZhc2RmIn0`)
      return chai.expect(prom).to.eventually.equal("https://accounts.google.com/o/oauth2/v2/auth?" +
        "access_type=offline&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive&prompt=consent&state=" +
        "eyJzdGF0ZXVybCI6Imh0dHBzOi8vbG9va2VyLnN0YXRlLnVybC5jb20vYWN0aW9uX2h1Yl9zdGF0ZS9hc2RmYXNkZmFzZGZhc2RmIn0&" +
        "response_type=code&client_id=testingkey&" +
        "redirect_uri=https%3A%2F%2Factionhub.com%2Factions%2Fgoogle_drive%2Foauth_redirect")
    })

    it("correctly handles redirect from authorization server", (done) => {
      const stubAccessToken = sinon.stub(action as any, "getAccessTokenCredentialsFromCode").resolves({tokens: "token"})
      const stubReq = sinon.stub(https, "post").callsFake(async () => Promise.resolve({access_token: "token"}))
      const result = action.oauthFetchInfo({code: "code",
        state: `eyJzdGF0ZXVybCI6Imh0dHBzOi8vbG9va2VyLnN0YXRlLnVybC5jb20vYWN0aW9uX2h1Yl9zdGF0ZS9hc2RmYXNkZmFzZGZh` +
          `c2RmIiwiYXBwIjoibXlrZXkifQ`},
        "redirect")
      chai.expect(result)
        .and.notify(stubAccessToken.restore)
        .and.notify(stubReq.restore).and.notify(done)
    })
  })

  describe("mimeType", () => {
    it("identifies attachment mimeTypes", () => {
      const request = new Hub.ActionRequest()
      request.attachment = {mime: "application/zip;base64"}
      request.formParams = {format: "foobar"}
      chai.expect(action.getMimeType(request)).to.equal("application/zip;base64")
      request.attachment = {mime: "application/pdf;base64"}
      chai.expect(action.getMimeType(request)).to.equal("application/pdf;base64")
      request.attachment = {mime: "image/png;base64"}
      chai.expect(action.getMimeType(request)).to.equal("image/png;base64")
    })

    it("identifies mimeType for streamed actions", () => {
      const request = new Hub.ActionRequest()
      request.formParams = {format: "csv"}
      chai.expect(action.getMimeType(request)).to.equal("text/csv")
      request.formParams = {format: "json"}
      chai.expect(action.getMimeType(request)).to.equal("application/json")
    })

    it("returns undefined if no format is given", () => {
      const request = new Hub.ActionRequest()
      chai.expect(action.getMimeType(request)).to.equal(undefined)
    })
  })
})
