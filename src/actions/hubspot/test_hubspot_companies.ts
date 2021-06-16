import * as chai from "chai"
import * as Pcancel from "p-cancelable"
import * as Hub from "../../hub"
import { HubspotCompaniesAction } from "./hubspot_companies"
import { expectHubspotMatch } from "./test_hubspot"

const action = new HubspotCompaniesAction()
action.executeInOwnProcess = false

describe(`${action.constructor.name} unit tests`, () => {
  it("works with hubspot_company_id", () => {
    const request = new Hub.ActionRequest()
    request.type = Hub.ActionType.Query
    request.params = {
      hubspot_api_key: "hubspot_key",
    }
    request.attachment = {
      dataBuffer: Buffer.from(
        JSON.stringify({
          fields: {
            dimensions: [
              { name: "contact_id", tags: ["hubspot_company_id"] },
              { name: "property_one" },
              { name: "property.two" },
            ],
          },
          data: [
            {
              "contact_id": { value: "0123456" },
              "property_one": { value: "property_one_value_1" },
              "property.two": { value: "property_two_value_1" },
            },
            {
              "contact_id": { value: "9876543" },
              "property_one": { value: "property_one_value_2" },
              "property.two": { value: "property_two_value_2" },
            },
          ],
        }),
      ),
    }
    return expectHubspotMatch(action, request, {
      inputs: [
        {
          id: "0123456",
          properties: {
            property_one: "property_one_value_1",
            property_two: "property_two_value_1",
          },
        },
        {
          id: "9876543",
          properties: {
            property_one: "property_one_value_2",
            property_two: "property_two_value_2",
          },
        },
      ],
    })
  })

  it("should fail without a hubspot_contact_id and return proper error message", (done) => {
    const request = new Hub.ActionRequest()
    request.type = Hub.ActionType.Query
    request.params = {
      hubspot_api_key: "hubspot_key",
    }
    request.attachment = {
      dataBuffer: Buffer.from(
        JSON.stringify({
          fields: {
            dimensions: [{ name: "company_id" }, { name: "property_one" }],
          },
          data: [
            {
              contact_id: { value: "0123456" },
              property_one: { value: "property_one_value_1" },
            },
            {
              contact_id: { value: "9876543" },
              property_one: { value: "property_one_value_2" },
            },
          ],
        }),
      ),
    }
    const cancel: Pcancel<string>[] = []

    chai
      .expect(action.validateAndExecute(request, cancel))
      .to.eventually.deep.equal({
        message: "Dimension with the hubspot_company_id tag is required",
        success: false,
        refreshQuery: false,
        validationErrors: [],
      })
      .and.notify(done)
  })
})
