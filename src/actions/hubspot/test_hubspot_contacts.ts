import * as chai from "chai"
import * as Pcancel from "p-cancelable"
import * as Hub from "../../hub"
import { HubspotContactsAction } from "./hubspot_contacts"
import { expectHubspotMatch } from "./test_hubspot"

const action = new HubspotContactsAction()
action.executeInOwnProcess = false

describe(`${action.constructor.name} unit tests`, () => {
  it("works with hubspot_contact_id", () => {
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
              { name: "contact_id", tags: ["hubspot_contact_id"] },
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

  it("should fail without a hubspot_contact_id and", (done) => {
    const request = new Hub.ActionRequest()
    request.type = Hub.ActionType.Query
    request.params = {
      hubspot_api_key: "hubspot_key",
    }
    request.attachment = {
      dataBuffer: Buffer.from(
        JSON.stringify({
          fields: {
            dimensions: [{ name: "contact_id" }, { name: "property_one" }],
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
        message: "Dimension with the hubspot_contact_id tag is required",
        success: false,
        refreshQuery: false,
        validationErrors: [],
      })
      .and.notify(done)
  })

  it("doesn't send hidden fields", () => {
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
              { name: "contact_id", tags: ["hubspot_contact_id"] },
              { name: "property_one" },
              { name: "hidden_property" },
            ],
          },
          data: [
            {
              contact_id: { value: "0123456" },
              property_one: { value: "property_one_value_1" },
              hidden_property: { value: "do_not_send" },
            },
            {
              contact_id: { value: "9876543" },
              property_one: { value: "property_one_value_2" },
              hidden_property: { value: "do_not_send" },
            },
          ],
        }),
      ),
    }
    request.scheduledPlan = {
      query: {
        vis_config: {
          hidden_fields: ["hidden_property"],
        },
      },
    } as any
    return expectHubspotMatch(action, request, {
      inputs: [
        {
          id: "0123456",
          properties: { property_one: "property_one_value_1" },
        },
        {
          id: "9876543",
          properties: { property_one: "property_one_value_2" },
        },
      ],
    })
  })
})
