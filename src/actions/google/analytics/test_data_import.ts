import * as b64 from "base64-url"
import { expect } from "chai"
import concatStream = require("concat-stream")
import * as gaxios from "gaxios"
import { analytics_v3, google } from "googleapis"
import * as Pcancel from "p-cancelable"
import * as sinon from "sinon"
import * as Hub from "../../../hub"
import { GoogleOAuthHelper } from "../common/oauth_helper"
import { GoogleAnalyticsDataImportAction } from "./data_import"

const teastOAuthClientId = "test_oauth_client_id"
const teastOAuthClientSecret = "test_oauth_client_secret"

const action = new GoogleAnalyticsDataImportAction(teastOAuthClientId, teastOAuthClientSecret)
const cancel: Pcancel<string>[] = []

describe(`${action.constructor.name} class`, () => {
  // Use a sandbox to avoid interaction with other test files
  const gaSinonSandbox = sinon.createSandbox()

  // Initialize fakes that will be used across tests
  let gaClientStub: sinon.SinonStub
  const accountSummariesListStub  = gaSinonSandbox.stub()
  const customDataSourcesListStub = gaSinonSandbox.stub()
  const uploadsListStub           = gaSinonSandbox.stub()
  const uploadDataStub            = gaSinonSandbox.stub()
  const deleteUploadDataStub      = gaSinonSandbox.stub()

  const fakeClientObj = {
    management: {
      accountSummaries: {
        list: accountSummariesListStub,
      },
      customDataSources: {
        list: customDataSourcesListStub,
      },
      uploads: {
        list: uploadsListStub,
        uploadData: uploadDataStub,
        deleteUploadData: deleteUploadDataStub,
      },
    },
  }

  beforeEach(() => {
    gaSinonSandbox.stub(Hub.ActionCrypto.prototype, "encrypt").callsFake( async (s: string) => b64.encode(s) )
    gaSinonSandbox.stub(Hub.ActionCrypto.prototype, "decrypt").callsFake( async (s: string) => b64.decode(s) )

    gaClientStub = gaSinonSandbox.stub(google, "analytics").returns(fakeClientObj)
  })

  afterEach(() => {
    uploadDataStub.resetHistory() // necessary to fix undocumented bug causing failures with calledOnce
    gaSinonSandbox.reset()
    gaSinonSandbox.restore()
  })

  describe("action properties", () => {
    it("hasForm", () => {
      expect(action.hasForm).to.be.true
    })

    it("name", () => {
      expect(action.name).to.equal("google_analytics_data_import")
    })

    it("label", () => {
      expect(action.label).to.equal("Google Analytics Data Import")
    })

    it("iconName", () => {
      expect(action.iconName).to.equal("google/analytics/google_analytics_icon.svg")
    })

    it("description", () => {
      expect(action.description).to.equal("Upload data to a custom Data Set in Google Analytics.")
    })

    it("supportedActionTypes", () => {
      expect(action.supportedActionTypes).to.deep.equal(["query"])
    })

    it("supportedFormats", () => {
      expect(action.supportedFormats).to.deep.equal(["csv"])
    })

    it("supportedFormattings", () => {
      expect(action.supportedFormattings).to.deep.equal(["unformatted"])
    })

    it("supportedVisualizationFormattings", () => {
      expect(action.supportedVisualizationFormattings).to.deep.equal(["noapply"])
    })

    it("supportedDownloadSettings", () => {
      expect(action.supportedDownloadSettings).to.deep.equal(["url"])
    })

    it("usesStreaming", () => {
      expect(action.usesStreaming).to.be.true
    })

    it("requiredFields", () => {
      expect(action.requiredFields).to.be.empty
    })

    it("params", () => {
      expect(action.params).to.be.empty
    })

    it("redirectURI", () => {
      const url = `${process.env.ACTION_HUB_BASE_URL}/actions/google_analytics_data_import/oauth_redirect`
      expect(action.redirectUri).to.equal(url)
    })

    it("oauthClientId", () => {
      expect(action.oauthClientId).to.equal(teastOAuthClientId)
    })

    it("oauthClientSecret", () => {
      expect(action.oauthClientSecret).to.equal(teastOAuthClientSecret)
    })

    it("oauthScopes", () => {
      expect(action.oauthScopes).to.deep.equal(["https://www.googleapis.com/auth/analytics.edit"])
    })

    it("oauthHelper", () => {
      expect(action.oauthHelper).to.be.an.instanceOf(GoogleOAuthHelper)
    })
  })

  describe("execute endpoint", () => {
    describe("oauth token checks", () => {

      const tests = [
        {name: "no user state"},
        {name: "no tokens", state: {redirect: "redirect is present"}},
        {name: "no redirect", state: {tokens: {access_token: "access", refresh_token: "refresh"}}},
      ]

      for (const test of tests) {
        it(`returns an error response if there is ${test.name}`, async () => {
          const request = makeBaseExecuteRequest()
          if (!test.state) {
            delete request.params.state_json
          } else {
            request.params.state_json = JSON.stringify(test.state)
          }

          const expectedResponse = makeErrorResponse({
            message:
              "Error during action setup:"
              + " MissingAuthError: User state was missing or did not contain tokens & redirect",
          })

          const actualResponse = await action.validateAndExecute(request, cancel)
          expect(actualResponse).to.deep.equal(expectedResponse)
        })
      }
    })

    describe("required param checks", () => {
      it("returns an error if dataSourceCompositeId is not present", async () => {
        const request = makeBaseExecuteRequest()

        delete request.formParams.dataSourceCompositeId

        const expectedResponse = makeErrorResponse({
          withReset: false,
          message: "Error during data upload step:"
            + " MissingRequiredParamsError: Did not receive required form param 'dataSourceCompositeId'",
        })

        const actualResponse = await action.validateAndExecute(request, cancel)
        expect(actualResponse).to.deep.equal(expectedResponse)
      })

      it("returns an error if dataSourceSchema is not present", async () => {
        const request = makeBaseExecuteRequest()

        delete request.formParams.dataSourceSchema

        const expectedResponse = makeErrorResponse({
          withReset: false,
          message: "Error during data upload step:"
            + " MissingRequiredParamsError: Did not receive required form param 'dataSourceSchema'",
        })

        const actualResponse = await action.validateAndExecute(request, cancel)
        expect(actualResponse).to.deep.equal(expectedResponse)
      })
    })

    describe("ga client setup", () => {
      it("returns an error response if the api client setup fails", async () => {
        const request = makeBaseExecuteRequest()

        const testException = new TestException("error in ga client setup")
        gaClientStub.throws(testException)

        const expectedResponse = makeErrorResponse({withReset: false})
        expectedResponse.message = `Error during action setup: ${testException.toString()}`

        const actualResponse = await action.validateAndExecute(request, cancel)
        expect(actualResponse).to.deep.equal(expectedResponse)
      })
    })

    describe("upload file step", () => {

      it("returns an error response if the API client throws an exception", async () => {
        const request = makeBaseExecuteRequest()

        const testException = new TestException("error in file upload")
        uploadDataStub.throws(testException)

        const expectedResponse = makeErrorResponse({withReset: false})
        expectedResponse.message = `Error during data upload step: ${testException.toString()}`

        const actualResponse = await action.validateAndExecute(request, cancel)
        expect(actualResponse).to.deep.equal(expectedResponse)
      })

      it("makes the correct API call with correctly transformed data", async () => {
        const request = makeBaseExecuteRequest({deleteOtherFiles: "no"})

        const expectedCsv = Buffer.from("new_header_1,new_header_2\ndata_1,data_2")

        const expectedApiArgs: analytics_v3.Params$Resource$Management$Uploads$Uploaddata = {
          accountId: "111",
          customDataSourceId: "333",
          webPropertyId: "222",
        }

        uploadDataStub.resolves({data: {id: "NewUploadIdFromTest"}})

        const actualResponse = await action.validateAndExecute(request, cancel)// Check the basics
        expect(actualResponse).to.exist
        expect(actualResponse.success).to.be.true
        expect(gaClientStub).to.be.calledOnce
        expect(uploadDataStub).to.be.calledOnce

        // Split buffer from other args for easier comparison
        const actualApiArgs = uploadDataStub.getCall(0).args[0]
        const actualBuffer = actualApiArgs.media.body
        delete actualApiArgs.media

        // Check the accountId, customDataSourceId, webPropertyId params
        expect(actualApiArgs).to.be.deep.equal(expectedApiArgs)

        // Check the actual data
        actualBuffer.pipe(concatStream((buff: Buffer) => {
          expect(buff.toString()).to.equal(expectedCsv.toString())
        }))
      })

      it("returns an error response if the api throws an exception", async () => {
        const request = makeBaseExecuteRequest()

        const testException = new TestException("message from uploadData test stub")
        uploadDataStub.throws(testException)

        const actualResponse = await action.validateAndExecute(request, cancel)
        expect(actualResponse).to.deep.equal({
          success: false,
          message: `Error during data upload step: ${testException.toString()}`,
          refreshQuery: false,
          validationErrors: [],
        })
      })
    })

    describe("update lastUsedFormParams in user state", () => {
      it("does not occur if the upload step failed", async () => {
        const request = makeBaseExecuteRequest()

        const testException = new TestException("message from uploadData test stub")
        uploadDataStub.throws(testException)

        const actualResponse = await action.validateAndExecute(request, cancel)
        expect(actualResponse).to.deep.equal({
          success: false,
          message: `Error during data upload step: ${testException.toString()}`,
          refreshQuery: false,
          validationErrors: [],
        })
      })

      it("updates the values to the form params used on this run", async () => {
        const request = makeBaseExecuteRequest({deleteOtherFiles: "nope"})

        uploadDataStub.resolves({data: {id: "fakeNewIdFromTest"}})

        const actualResponse = await action.validateAndExecute(request, cancel)
        expect(actualResponse).to.have.nested.property("state.data").that.is.a("string")

        const state = JSON.parse(actualResponse.state!.data!)

        expect(state.lastUsedFormParams).to.deep.equal({
          dataSourceCompositeId: "111::222::333",
          dataSourceSchema: "new_header_1,new_header_2",
          deleteOtherFiles: "nope",
        })
      })
    })

    describe("delete other files step", () => {
      it("does not occur if the deleteOtherFiles param is not present", async () => {
        const request = makeBaseExecuteRequest()

        delete request.formParams.deleteOtherFiles

        uploadDataStub.resolves({data: {id: "fakeNewIdFromTest"}})

        const actualResponse = await action.validateAndExecute(request, cancel)
        expect(actualResponse.success).to.be.true
        expect(deleteUploadDataStub).to.not.be.called
      })

      it("does not occur if the deleteOtherFiles param is not 'yes'", async () => {
        const request = makeBaseExecuteRequest()

        request.formParams.deleteOtherFiles = "no"

        uploadDataStub.resolves({data: {id: "fakeNewIdFromTest"}})

        const actualResponse = await action.validateAndExecute(request, cancel)
        expect(actualResponse.success).to.be.true
        expect(deleteUploadDataStub).to.not.be.called
      })

      it("does not occur if the upload failed", async () => {
        const request = makeBaseExecuteRequest()

        uploadDataStub.throws(new TestException("message from uploadData test stub"))

        const actualResponse = await action.validateAndExecute(request, cancel)
        expect(actualResponse.success).to.be.false
        expect(deleteUploadDataStub).to.not.be.called
      })

      it("deletes all files except the one that was just created", async () => {
        const request = makeBaseExecuteRequest()

        uploadDataStub.resolves({data: {id: "fakeNewIdFromTest"}})

        uploadsListStub.resolves({data: {items: [
          {id: "fakeNewIdFromTest"},
          {id: "willBeDeleted"},
          {id: "goinGitGone"},
          {name: "surprise no id"},
        ]}})

        const actualResponse = await action.validateAndExecute(request, cancel)
        expect(actualResponse.success).to.be.true
        expect(deleteUploadDataStub).to.be.calledOnce
        expect(deleteUploadDataStub.getCall(0).args[0]).to.deep.equal({
          accountId: "111",
          customDataSourceId: "333",
          webPropertyId: "222",
          requestBody: {
            customDataImportUids: ["willBeDeleted", "goinGitGone"],
          },
        })
      })

      it("returns an error response if it fails", async () => {
        const request = makeBaseExecuteRequest()

        uploadDataStub.resolves({data: {id: "fakeNewIdFromTest"}})

        const testException = new TestException("message from uploads.list test stub")
        uploadsListStub.throws(testException)

        const response = await action.validateAndExecute(request, cancel)

        expect(response).to.be.an.instanceOf(Hub.ActionResponse)
        expect(response).to.have.property("success", false)
        expect(response).to.have.property("message",
          `Error during delete other files step: ${testException.toString()}`,
        )
      })
    })
  })

  describe("form endpoint", () => {

    type DataSetSelectOptions = { name: string, label: string }[] | []

    function makeLoginForm(stateUrl: string) {
      const encryptedPayload = b64.encode(JSON.stringify({stateUrl})) // based on how we stubbed ActionCrypto.encrypt

      const oauthUrl = `${process.env.ACTION_HUB_BASE_URL}/actions/${action.name}/oauth?state=${encryptedPayload}`

      const form = new Hub.ActionForm()
      form.state = new Hub.ActionState()
      form.state.data = "reset"
      form.fields = []
      form.fields.push({
        name: "login",
        type: "oauth_link_google",
        label: "Log in",
        description: "In order to send to this destination, you will need to log in once to your Google account.",
        oauth_url: oauthUrl,
      })
      return form
    }

    function makeForm(
      username: string,
      lastUsedFormParams: any,
      dataSetSelectOptions: DataSetSelectOptions,
      ) {

      const {lastUsedCompositeId, lastUsedSchema, lastUsedDeleteOtherFiles} = lastUsedFormParams

      const form = new Hub.ActionForm()
      form.fields = []

      form.fields.push({
        name: "dataSourceCompositeId",
        label: "Data Set",
        type: "select",
        description: `Account Name >> Property Name >> Data Set. You are currently logged in as ${username}`,
        options: dataSetSelectOptions,
        default: lastUsedCompositeId ? lastUsedCompositeId : "",
        required: true,
      })

      form.fields.push({
        name: "dataSourceSchema",
        label: "Data Set Schema",
        type: "string",
        description: "Get this value from the Data Set definition in GA."
          + " The format is like \"ga:dimension1,ga:dimension2\" without quotes.",
        default: lastUsedSchema ? lastUsedSchema : "",
        required: true,
      })

      form.fields.push({
        name: "deleteOtherFiles",
        label: "Delete Other Files?",
        type: "select",
        description: "If 'Yes', then all other files in the data set will be deleted after this upload is complete.",
        options: [{name: "yes", label: "Yes"}, {name: "no", label: "No"}],
        default: lastUsedDeleteOtherFiles ? lastUsedDeleteOtherFiles : "",
        required: true,
      })

      return form
    }

    describe("token checks", () => {
      const tests = [
        {name: "no user state"},
        {name: "no tokens", state: {redirect: "redirect is present"}},
        {name: "no redirect", state: {tokens: {access_token: "access", refresh_token: "refresh"}}},
      ]

      for (const test of tests) {
        it(`returns an oauth login form if there is ${test.name}`, async () => {
          const request = new Hub.ActionRequest()
          request.params = {
            state_url: "https://a-looker-instance.looker.test/action_hub_state/asdfasdfasdfasdf",
          }

          if (test.state) {
            request.params.state_json = JSON.stringify(test.state)
          }

          const expectedForm = makeLoginForm(request.params.state_url!)

          const actualForm = await action.validateAndFetchForm(request)

          expect(actualForm).to.deep.equal(expectedForm)
        })
      }
    })

    it("returns a customized login form and resets the user state if there is an error from the API", async () => {
      const request = makeBaseFormRequest()

      const testException = new TestException("fake error from GA client", "401")

      gaClientStub.throws(testException)

      const expectedForm = makeLoginForm(request.params.state_url!)
      expectedForm.fields[0].label =
        `Received an error (code ${testException.code}) from the API, so your credentials have been discarded.`
        + " Please reauthenticate and try again."

      const actualForm = await action.validateAndFetchForm(request)

      expect(actualForm).to.deep.equal(expectedForm)
    })

    it("returns a form with default values set to lastUsedFormParams, if provided", async () => {
      const request = new Hub.ActionRequest()
      request.params = {
        state_url: "https://a-looker-instance.looker.test/action_hub_state/asdfasdfasdfasdf",
        state_json: JSON.stringify({tokens: "valid_tokens", redirect: "valid_url"}),
      }

      const username = "action_hub_user@looker.test"
      const dataSetSelectOptions: DataSetSelectOptions = []
      const lastUsedFormParams = {
        dataSourceCompositeId: "111::222::333",
        dataSourceSchema: "new_header_1,new_header_2",
        deleteOtheFiles: "yes",
      }

      accountSummariesListStub.resolves({data: {username}})

      const expectedForm = makeForm(username, lastUsedFormParams, dataSetSelectOptions)
      const actualForm = await action.validateAndFetchForm(request)

      expect(actualForm).to.deep.equal(expectedForm)
    })

    it("returns a form with blank default values if lastUsedFormParams was not provided", async () => {
      const request = new Hub.ActionRequest()
      request.params = {
        state_url: "https://a-looker-instance.looker.test/action_hub_state/asdfasdfasdfasdf",
        state_json: JSON.stringify({tokens: "valid_tokens", redirect: "valid_url"}),
      }

      const username = "action_hub_user@looker.test"
      const dataSetSelectOptions: DataSetSelectOptions = []
      const lastUsedFormParams = {
        lastUsedCompositeId: "",
        lastUsedSchema: "",
        lastUsedDeleteOtherFiles: "",
      }

      accountSummariesListStub.resolves({data: {username}})

      const expectedForm = makeForm(username, lastUsedFormParams, dataSetSelectOptions)
      const actualForm = await action.validateAndFetchForm(request)

      expect(actualForm).to.deep.equal(expectedForm)
    })

    it("returns the correct data source options for a complex situation", async () => {
      const request = new Hub.ActionRequest()
      request.params = {
        state_url: "https://a-looker-instance.looker.test/action_hub_state/asdfasdfasdfasdf",
        state_json: JSON.stringify({tokens: "valid_tokens", redirect: "valid_url"}),
      }

      const username = "action_hub_user@looker.test"
      const items = [
        {
          id: "111",
          name: "Mocha Account 1",
          webProperties: [
            {id: "p11", name: "Property 11"},
            {id: "p12", name: "Property 12"},
          ],
        }, {
          id: "222",
          name: "Mocha Account 2",
          webProperties: [
            {id: "p21", name: "Property 21"},
            {id: "p22", name: "Property 22"},
          ],
        },
      ]

      accountSummariesListStub.resolves({
        data: {
          username,
          items,
        },
      })

      const call0resp = {
        data: {
          totalResults: 1,
          items: [
            // A PROPER OBJECT W/ EVERYTHING CORRECT
            {
              id: "ds111",
              name: "Data Source 111",
              accountId: "111",
              webPropertyId: "p11",
            },
            // AN OBJECT MISSING PROPS
            {
              id: "ds112",
              name: "Data Source 112",
            },
            // AN OBJECT W/ MISMATCHED PROPERTY ID
            {
              id: "ds113",
              name: "Data Source 113",
              accountId: "111",
              webPropertyId: "someBogusPropId",
            },
          ],
        },
      }

      const call1resp = {
        data: {
          // A RESPONSE WITH NO ITEMS
          totalResults: 0,
        },
      }

      const call2resp = {
        data: {
          totalResults: 1,
          items: [
            // A PROPER OBJECT W/ EVERYTHING CORRECT
            {
              id: "ds211",
              name: "Data Source 211",
              accountId: "222",
              webPropertyId: "p21",
            },
          ],
        },
      }

      const call3resp = new TestException("exception from customDataSources")

      customDataSourcesListStub.onCall(0).resolves(call0resp)
      customDataSourcesListStub.onCall(1).resolves(call1resp)
      customDataSourcesListStub.onCall(2).resolves(call2resp)
      customDataSourcesListStub.onCall(3).rejects(call3resp)

      const form = await action.validateAndFetchForm(request)
      const actualSelectOptions = (form.fields[0] as any).options

      expect(customDataSourcesListStub.callCount).to.equal(4)

      expect(customDataSourcesListStub.getCall(0).args[0]).to.deep.equal({
        accountId: "111",
        webPropertyId: "p11",
      })

      expect(customDataSourcesListStub.getCall(1).args[0]).to.deep.equal({
        accountId: "111",
        webPropertyId: "p12",
      })

      expect(customDataSourcesListStub.getCall(2).args[0]).to.deep.equal({
        accountId: "222",
        webPropertyId: "p21",
      })

      expect(customDataSourcesListStub.getCall(3).args[0]).to.deep.equal({
        accountId: "222",
        webPropertyId: "p22",
      })

      expect(actualSelectOptions).to.deep.equal([
        {name: "111::p11::ds111", label: "Mocha Account 1 >> Property 11 >> Data Source 111"},
        {name: "222::p21::ds211", label: "Mocha Account 2 >> Property 21 >> Data Source 211"},
      ])

    })
  })

  describe("oauth endpoints", () => {
    describe("oauthUrl", () => {
      it("generates the correct Google login URL", async () => {
        const expectedUrl =
          "https://accounts.google.com/o/oauth2/v2/auth" +
          "?access_type=offline" +
          "&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fanalytics.edit" +
          "&prompt=consent" +
          "&state=not-actually-encrypted-payload-used-for-test" +
          "&response_type=code" +
          "&client_id=test_oauth_client_id" +
          `&redirect_uri=https%3A%2F%2Faction-hub.looker.test%2Factions%2F${action.name}%2Foauth_redirect`

        const actualUrl = await action.oauthUrl(
          `https://action-hub.looker.test/actions/${action.name}/oauth_redirect`,
          "not-actually-encrypted-payload-used-for-test",
        )

        expect(actualUrl).to.equal(expectedUrl)
      })
    })

    describe("oauthFetchInfo", () => {
      let oauthClientStub: sinon.SinonStub
      let gaxiosStub: sinon.SinonStub

      beforeEach(() => {
        oauthClientStub = gaSinonSandbox.stub(google.auth, "OAuth2")
        gaxiosStub = gaSinonSandbox.stub(gaxios, "request")
      })

      afterEach(() => {
        oauthClientStub.restore()
        gaxiosStub.restore()
      })

      it("correctly handles redirect from authorization server", async () => {
        const stateUrl = "https://a-looker-instance.looker.test/action_hub_state/asdfasdfasdfasdf"
        const encryptedPayload = b64.encode(JSON.stringify({stateUrl})) // based on how we stubbed ActionCrypto.encrypt

        const redirectUri = `https://action-hub.looker.test/actions/${action.name}/oauth_redirect`
        const oauthCode = "stringLikeAnOAuthCodeThatWouldBeSentByGoogle"
        const stubTokens = {
          access_token: "anAccessTokenWooh",
          refresh_token: "theRefreshTokenYeah",
        }

        const getTokenStub = sinon.fake.resolves({tokens: stubTokens})
        oauthClientStub.returns({getToken: getTokenStub})
        gaxiosStub.resolves("<action doesn't do anything with this post response>")

        const expectedPostArgs = {
          method: "POST",
          url: stateUrl,
          data: {tokens: stubTokens, redirect: redirectUri},
        }

        await action.oauthFetchInfo({code: oauthCode, state: encryptedPayload}, redirectUri)

        expect(oauthClientStub).to.be.calledOnce
        expect(oauthClientStub.getCall(0).args).to.deep.equal([
          "test_oauth_client_id",
          "test_oauth_client_secret",
          redirectUri,
        ])

        expect(getTokenStub).to.be.calledOnce
        expect(getTokenStub.getCall(0).args[0]).to.equal(oauthCode)

        expect(gaxiosStub).to.be.calledOnce
        expect(gaxiosStub.getCall(0).args[0]).to.deep.equal(expectedPostArgs)
      })

      it("throws an exception if the POST to Looker fails", async () => {
        const stateUrl = "https://a-looker-instance.looker.test/action_hub_state/asdfasdfasdfasdf"
        const encryptedPayload = b64.encode(JSON.stringify({stateUrl})) // based on how we stubbed ActionCrypto.encrypt

        const redirectUri = `https://action-hub.looker.test/actions/${action.name}/oauth_redirect`
        const oauthCode = "stringLikeAnOAuthCodeThatWouldBeSentByGoogle"
        const stubTokens = {
          access_token: "anAccessTokenWooh",
          refresh_token: "theRefreshTokenYeah",
        }

        const getTokenStub = sinon.fake.resolves({tokens: stubTokens})
        oauthClientStub.returns({getToken: getTokenStub})

        const testException = new TestException("<error message from POST to Looker>")
        gaxiosStub.throws(testException)

        const run = async () => {
          return action.oauthFetchInfo({code: oauthCode, state: encryptedPayload}, redirectUri)
        }

        return expect(run()).to.eventually.be.rejectedWith(testException)
      })

      // TODO: test for Looker's whacky HTTP response codes
    })

    /* This part of the Action API appears to be deprecated - omitting tests
    describe("oauthCheck", () => {
      it("returns false if there is no state_json in the request")
      it("returns false if the state_json cannot be parsed")
      it("returns false if the parsed stateJson does not not have tokens")
      it("returns false if the parsed stateJson does not not have a redirect uri")
      it("returns true if the api call is successful")
      it("wraps and re-throws any exceptions generated by the api")
    })
    */
  })
})

/******** Helpers ********/

class TestException extends Error {
  code?: string

  constructor(message?: string, code?: string) {
    super(message)
    this.code = code
    this.name = "TestException"
    // See https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-2.html#support-for-newtarget
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

function makeBaseFormRequest() {
  const baseReq = new Hub.ActionRequest()

  baseReq.params = {
    state_url: "https://action-hub.looker.test/action_hub_state/asdfasdfasdfasdf",
    state_json: JSON.stringify({
      tokens: {access_token: "accesstoken", refresh_token: "refreshtoken"},
      redirect: "redirecturl",
    }),
  }

  return baseReq
}

function makeBaseExecuteRequest(optsArg?: any) {
  const defaultOpts = {
    deleteOtherFiles: "yes",
  }
  const opts = Object.assign(defaultOpts, optsArg)
  const baseReq = new Hub.ActionRequest()
  baseReq.type = Hub.ActionType.Query

  const originalCsv = Buffer.from("original_header_1,original_header_2\ndata_1,data_2")

  baseReq.attachment = {dataBuffer: originalCsv, fileExtension: "csv"}

  baseReq.formParams = {
    dataSourceCompositeId: "111::222::333",
    dataSourceSchema: "new_header_1,new_header_2",
    deleteOtherFiles: opts.deleteOtherFiles,
  }

  baseReq.params = {
    state_url: "https://action-hub.looker.test/action_hub_state/asdfasdfasdfasdf",
    state_json: JSON.stringify({
      tokens: {access_token: "accesstoken", refresh_token: "refreshtoken"},
      redirect: "redirecturl",
    }),
  }

  return baseReq
}

function makeErrorResponse(optsArg?: {withReset?: boolean, message?: string}) {
  const defaultOpts = {
    withReset: true,
  }
  const opts = Object.assign(defaultOpts, optsArg)

  const resp = new Hub.ActionResponse()
  resp.success = false

  if (opts.withReset) {
    resp.state = new Hub.ActionState()
    resp.state.data = "reset"
  }

  if (opts.message) {
    resp.message = opts.message
  }

  return resp
}
