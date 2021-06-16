import * as chai from "chai"
import * as sinon from "sinon"

import * as Pcancel from "p-cancelable"
import * as Hub from "../../hub"
import { HubspotAction, HubspotCalls } from "./hubspot"

export const expectHubspotMatch = (
  action: HubspotAction,
  request: Hub.ActionRequest,
  match: any,
) => {
  const batchUpdateCallSpy = sinon.spy()
  let product: "contacts" | "companies" | "unknown" = "unknown"
  switch (action.call) {
    case HubspotCalls.Company:
      product = "companies"
      break
    case HubspotCalls.Contact:
      product = "contacts"
      break
    default:
      break
  }

  // Ensure a supported hubspot CRM product is called
  if (product === "unknown") {
    chai.assert.fail(`No hubspot product supported`)
  }

  // Ensure Hubspot API was called successfully with the proper batch update payload
  const stubClient = sinon
    .stub(action as any, "hubspotClientFromRequest")
    .callsFake(() => {
      return {
        crm: {
          [product]: { batchApi: { update: batchUpdateCallSpy } },
        },
      }
    })
  const cancel: Pcancel<string>[] = []

  // Validate and Execute the request
  return chai
    .expect(action.validateAndExecute(request, cancel))
    .to.be.fulfilled.then(() => {
      chai.expect(batchUpdateCallSpy).to.have.been.calledWithExactly(match)
      stubClient.restore()
    })
}
