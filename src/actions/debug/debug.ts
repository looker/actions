import * as winston from "winston"

import * as Hub from "../../hub"

export function registerDebugAction() {
  if (process.env.ACTION_HUB_DEBUG_ENDPOINT) {
    Hub.addAction(new DebugAction())
  }
}

export class DebugAction extends Hub.Action {

  name = "debug"
  label = "Debug"
  description = "Sends data to a sample website and optionally sleeps."
  supportedActionTypes = [Hub.ActionType.Cell, Hub.ActionType.Dashboard, Hub.ActionType.Query]
  supportedFormats = []
  params = []
  executeInOwnProcess = false

  async execute(request: Hub.ActionRequest) {

    const activities: string[] = []

    function doActivity(activity: string) {
      winston.info(`[debug action] Doing ${activity}...`)
      activities.push(activity)
    }

    // Delay if needed
    const sleep = +(request.formParams.sleep ? request.formParams.sleep : 1000)
    if (sleep > 0) {
      doActivity(`sleep ${sleep} ms...`)
      await this.delay(sleep)
    }

    return new Hub.ActionResponse({message: `Completed debug action successfully by doing ${activities.join(", ")}.`})
  }

  async form() {
    const form = new Hub.ActionForm()
    form.fields = [{
      label: "Sleep",
      name: "sleep",
      required: false,
      type: "string",
    },
    {
      label: "Simulated Download URL (JSON)",
      name: "simulated_download_url",
      required: false,
      type: "string",
    }]
    return form
  }

  private async delay(t: number) {
    return new Promise<void>((resolve) => {
      setTimeout(resolve, t)
    })
  }

}
