import * as Hub from "../../hub"
import { RudderAction, RudderCalls } from "./rudderstack"

export class RudderTrackAction extends RudderAction {

  name = "rudder_track"
  label = "Rudder Track"
  description = "Add traits via track to your Rudder users."
  minimumSupportedLookerVersion = "5.5.0"

  async execute(request: Hub.ActionRequest) {
    return this.executeRudder(request, RudderCalls.Track)
  }

  async form() {
    const form = new Hub.ActionForm()
    form.fields = [{
      name: "event",
      label: "Event",
      description: "The name of the event you’re tracking.",
      type: "string",
      required: true,
    }]
    return form
  }

}

Hub.addAction(new RudderTrackAction())
