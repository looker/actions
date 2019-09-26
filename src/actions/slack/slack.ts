import * as Hub from "../../hub"

import { WebClient } from "@slack/client"
import {displayError, getDisplayedFormFields, handleExecute} from "./utils"

interface AuthTestResult {
  ok: boolean,
  team: string,
  team_id: string,
}

export class SlackAction extends Hub.DelegateOAuthAction {

  name = "slack_app"
  label = "Slack"
  iconName = "slack/slack.png"
  description = "Search, explore and share Looker content in Slack."
  supportedActionTypes = [Hub.ActionType.Query, Hub.ActionType.Dashboard]
  requiredFields = []
  params = [{
    name: "install",
    label: "Connect to Slack",
    delegate_oauth_url: "/admin/integrations/slack/install",
    required: false,
    sensitive: false,
    description: `Allow users to view dashboards and looks without leaving Slack,
     browse and view their favorites or folders, and search for content using Slack command.`
  }]
  usesStreaming = true

  async execute(request: Hub.ActionRequest) {
    return await handleExecute(request, this.slackClientFromRequest(request))
  }

  async form(request: Hub.ActionRequest) {
    const form = new Hub.ActionForm()
    try {
      form.fields = await getDisplayedFormFields(this.slackClientFromRequest(request))
    } catch (e) {
      const oauthUrl = request.params.state_json
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
        form.error = displayError[e.message] || e
      }
    }
    return form
  }

  async authTest(request: Hub.ActionRequest) {
    const slack = this.slackClientFromRequest(request)
    return await slack.auth.test() as AuthTestResult
  }

  async oauthCheck(request: Hub.ActionRequest) {
    const form = new Hub.ActionForm()
    if (!request.params.state_json) {
        form.error = "You must connect to a Slack workspace first."
        return form
    }
    try {
      const resp = await this.authTest(request)

      form.fields.push({
        name: "Connected",
        type: "message",
        value: `Connected with ${resp.team} (${resp.team_id})`,
      })
    } catch (e) {
      form.error = displayError[e.message] || e
    }
    return form
  }

  private slackClientFromRequest(request: Hub.ActionRequest) {
      return new WebClient(request.params.state_json)
  }
}

Hub.addAction(new SlackAction())
