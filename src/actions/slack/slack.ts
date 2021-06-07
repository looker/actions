import {WebClient} from "@slack/client"
import {WebAPICallResult} from "@slack/web-api/dist/WebClient"
import * as winston from "winston"
import * as Hub from "../../hub"
import {isSupportMultiWorkspaces, SlackClientManager} from "./slack_client_manager"
import {displayError, getDisplayedFormFields, handleExecute} from "./utils"

interface AuthTestResult {
  ok: boolean,
  team: string,
  team_id: string,
}

const AUTH_MESSAGE = "You must connect to a Slack workspace first."

export class SlackAction extends Hub.DelegateOAuthAction {

  name = "slack_app"
  label = "Slack"
  iconName = "slack/slack.png"
  description = "Explore and share Looker content in Slack."
  supportedActionTypes = [Hub.ActionType.Query, Hub.ActionType.Dashboard]
  requiredFields = []
  params = [{
    name: "install",
    label: "Connect to Slack",
    delegate_oauth_url: "/admin/integrations/slack/install",
    required: false,
    sensitive: false,
    description: `View dashboards and looks,
     browse your favorites or folders, and interact with Looker content without leaving Slack.`,
  }]
  minimumSupportedLookerVersion = "6.23.0"
  usesStreaming = true

  async execute(request: Hub.ActionRequest) {
    const clientManager = new SlackClientManager(request)
    const selectedClient = clientManager.getSelectedClient()
    if (!selectedClient) {
      return new Hub.ActionResponse({success: false, message: AUTH_MESSAGE})
    } else {
      return await handleExecute(request, selectedClient)
    }
  }

  async form(request: Hub.ActionRequest) {
    const clientManager = new SlackClientManager(request)
    if (!clientManager.hasAnyClients()) {
      return this.loginForm(request)
    }
    const clients = clientManager.getClients()
    const form = new Hub.ActionForm()

    let client = clientManager.getSelectedClient()

    if (isSupportMultiWorkspaces(request) && clientManager.hasAnyClients()) {
      try {
        const authResponse = await this.authTest(clients)

        const defaultTeamId = request.formParams.workspace ? request.formParams.workspace : authResponse[0].team_id

        if (!client && defaultTeamId) {
          client = clientManager.getClient(defaultTeamId)
        }

        form.fields.push({
          description: "Name of the Slack workspace you would like to share in.",
          label: "Workspace",
          name: "workspace",
          options: authResponse.map((response) => ({name: response.team_id, label: response.team})),
          required: true,
          default: defaultTeamId,
          interactive: true,
          type: "select",
        })
      } catch (e) {
        winston.error("Failed to fetch workspace: " + e.message)
      }
    }

    if (!client) {
      return this.loginForm(request, form)
    }

    try {
      form.fields = form.fields.concat(await getDisplayedFormFields(client))
    } catch (e) {
      return this.loginForm(request, form)
    }

    return form
  }

  async loginForm(request: Hub.ActionRequest, form: Hub.ActionForm = new Hub.ActionForm()) {
    const oauthUrl = request.params.state_url
    if (oauthUrl) {
      form.state = new Hub.ActionState()
      form.fields.push({
        name: "login",
        type: "oauth_link",
        label: "Log in",
        description: "In order to send to a file, you will need to log in to your Slack account.",
        oauth_url: oauthUrl,
      })
    } else {
      form.error = "Illegal State: state_url is empty."
    }
    return form
  }

  async oauthCheck(request: Hub.ActionRequest) {
    const form = new Hub.ActionForm()

    const clientManager = new SlackClientManager(request)
    if (!clientManager.hasAnyClients()) {
      form.error = AUTH_MESSAGE
      return form
    }
    try {
      const authResponse = await this.authTest(clientManager.getClients())

      const valFn = (resp: AuthTestResult) => isSupportMultiWorkspaces(request) ?
          JSON.stringify({ installation_id: resp.team_id, installation_name: resp.team }) :
          `Connected with ${resp.team} (${resp.team_id})`

      authResponse.forEach((resp) => {
        form.fields.push({
          name: "Connected",
          type: "message",
          value: valFn(resp),
        })
      })
    } catch (e) {
      form.error = displayError[e.message] || e
    }
    return form
  }

  async authTest(clients: WebClient[]) {
    const resp = await Promise.all(
        clients
            .map(async (client) => client.auth.test() as Promise<WebAPICallResult | Error>)
            .map(async (p) => p.catch((e) => e)),
    )

    const result = resp.filter((r) => !(r instanceof Error))
    if (resp.length > 0 && result.length === 0) {
      throw resp[0]
    }
    return result
  }
}

Hub.addAction(new SlackAction())
