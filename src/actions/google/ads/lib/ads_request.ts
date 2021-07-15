import { Credentials } from "google-auth-library"
import * as Hub from "../../../../hub"
import { Logger } from "../../common/logger"
import { MissingAuthError } from "../../common/missing_auth_error"
import { MissingRequiredParamsError } from "../../common/missing_required_params_error"
import { safeParseJson } from "../../common/utils"
import { GoogleAdsCustomerMatch } from "../customer_match"
import { GoogleAdsActionExecutor} from "./ads_executor"
import { GoogleAdsActionFormBuilder } from "./ads_form_builder"
import { GoogleAdsApiClient } from "./api_client"

interface AdsUserState {
  tokens: Credentials
  redirect: string
}

export class GoogleAdsActionRequest {

  static async fromHub(hubRequest: Hub.ActionRequest, action: GoogleAdsCustomerMatch, logger: Logger) {
    const adsReq = new GoogleAdsActionRequest(hubRequest, action, logger)
    await adsReq.checkTokens()
    adsReq.setApiClient()
    return adsReq
  }

  readonly streamingDownload = this.hubRequest.stream.bind(this.hubRequest)
  apiClient?: GoogleAdsApiClient
  formParams: any
  userState: AdsUserState
  webhookId?: string

  constructor(
    readonly hubRequest: Hub.ActionRequest,
    readonly actionInstance: GoogleAdsCustomerMatch,
    readonly log: Logger,
  ) {
    const state = safeParseJson(hubRequest.params.state_json)

    if (!state || !state.tokens || !state.tokens.access_token || !state.tokens.refresh_token || !state.redirect) {
      throw new MissingAuthError("User state was missing or did not contain oauth tokens & redirect")
    }

    this.userState = state
    this.formParams = hubRequest.formParams
    this.webhookId = hubRequest.webhookId
  }

  async checkTokens() {
    if ( this.userState.tokens.expiry_date == null || this.userState.tokens.expiry_date < Date.now() ) {
      this.log("debug", "Tokens appear expired; attempting refresh.")

      const data = await this.actionInstance.oauthHelper.refreshAccessToken(this.userState.tokens)

      if (!data || !data.access_token || !data.expiry_date) {
        throw new MissingAuthError("Could not refresh tokens")
      }

      this.userState.tokens.access_token = data.access_token
      this.userState.tokens.expiry_date  = data.expiry_date
      this.log("debug", "Set new tokens")
    }
  }

  setApiClient() {
    this.apiClient = new GoogleAdsApiClient(this.accessToken, this.developerToken, this.loginCid)
  }

  get accessToken() {
    return this.userState.tokens.access_token!
  }

  get createOrAppend() {
    return this.formParams.createOrAppend
  }

  get developerToken() {
    return this.actionInstance.developerToken
  }

  get doHashingBool() {
    return (this.formParams.doHashing === "yes")
  }

  get isCreate() {
    return this.createOrAppend === "create"
  }

  get loginCid() {
    return this.formParams.loginCid
  }

  get targetCid() {
    return this.formParams.targetCid
  }

  get targetUserListRN() {
    return this.formParams.targetUserListRN ? this.formParams.targetUserListRN : ""
  }

  async makeForm() {
    const formBuilder = new GoogleAdsActionFormBuilder(this)
    return formBuilder.makeForm()
  }

  async execute() {
    // 0) Do execution specific validations
    if (!this.loginCid) {
      throw new MissingRequiredParamsError("Login account id is missing")
    }
    if (!["create", "append"].includes(this.createOrAppend)) {
      throw new MissingRequiredParamsError(
        `createOrAppend must be either 'create' or 'append' (got '${this.formParams.createOrAppend}')`,
      )
    }
    if (!["yes", "no"].includes(this.formParams.doHashing)) {
      throw new MissingRequiredParamsError(`Hashing must be either 'yes' or 'no' (got '${this.formParams.doHashing}')`)
    }

    // 0) If a non-manager account was chosen for login, there will be no targetCid. Fill that in and start the helper.
    if (!this.targetCid) {
      this.formParams.targetCid = this.loginCid
    }
    const executor = new GoogleAdsActionExecutor(this)

    // 1) Create a new list if requested, or fetch the one selected
    if (this.isCreate) {
      const {newListName, newListDescription} = this.formParams
      if (!newListName) {
        throw new MissingRequiredParamsError("Name for new list is missing")
      }
      const timestamp = new Date().toISOString().substr(0, 19).replace('T', ' ')
      const newListNameWithTimestamp = `${newListName} (from Looker ${timestamp}Z)`
      await executor.createUserList(newListNameWithTimestamp, newListDescription)
    } else {
      if (!executor.targetUserListRN) {
        throw new MissingRequiredParamsError("List resource name is missing or could not be created")
      }
      // TODO: fetch given list to make sure it is still accessible
      this.log("info", "Using existing user list:", executor.targetUserListRN)
    }

    // 2) Create a data job for the user list
    await executor.createDataJob()
    if (!executor.offlineUserDataJobResourceName) {
      throw new MissingRequiredParamsError("Failed sanity check for offlineUserDataJobResourceName.")
    }

    // 3) Add the data ("user identifiers") to the job
    await executor.uploadData()

    // 4) Run the job
    await executor.runJob()

    // 5) TODO: should we hang around and poll the job status?
    return
  }
}
