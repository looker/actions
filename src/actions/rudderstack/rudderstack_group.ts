import * as Hub from "../../hub"
import { RudderAction, RudderCalls, RudderTags } from "./rudderstack"

export class RudderGroupAction extends RudderAction {

  tag = RudderTags.RudderGroupId

  name = "rudder_group"
  label = "Rudder Group"
  description = "Add traits and / or users to your Rudder groups."
  requiredFields = [{ tag: this.tag , any_tag: this.allowedTags}]
  minimumSupportedLookerVersion = "5.5.0"

  async execute(request: Hub.ActionRequest) {
    return this.executeRudder(request, RudderCalls.Group)
  }

}

Hub.addAction(new RudderGroupAction())
