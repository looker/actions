import * as chai from "chai"
import * as req from "request-promise-native"
import * as sinon from "sinon"

import * as Hub from "../../../src/hub"

import {
  HeapAction,
  HeapField,
  HeapFields,
  HeapPropertyType,
  HeapPropertyTypes,
} from "./heap"

const action = new HeapAction()

describe(`${action.constructor.name} unit tests`, () => {
  const APP_ID = "1"
  const stubPost = sinon.stub(req, "post").returns(undefined)
  beforeEach(() => {
    stubPost.reset()
    stubPost.returns(null)
  })
  after(stubPost.restore)

  const buildRequest = (
    propertyType: HeapPropertyType,
    heapFieldName: string,
    fields: { name: string }[],
    data: { [K in string]: { value: string } }[],
  ): Hub.ActionRequest => {
    const request = new Hub.ActionRequest()
    request.type = Hub.ActionType.Query
    request.params = { heap_app_id: APP_ID }
    request.formParams = {
      heap_field: heapFieldName,
      property_type: propertyType,
    }
    request.attachment = {
      dataBuffer: Buffer.from(
        JSON.stringify({ fields: { dimensions: fields }, data }),
      ),
    }
    return request
  }

  const expectRequestSent = (
    url: string,
    properties: { [K in string]: string },
    heapTag: HeapField,
    heapTagValue: string,
  ) => {
    chai.expect(stubPost).to.have.been.calledWith({
      uri: url,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: APP_ID,
        [heapTag]: heapTagValue,
        properties,
      }),
    })
  }

  describe("Common Validation", () => {
    it("should throw when app ID is missing", async () => {
      const fields = [{ name: "email" }]
      const data = [{ email: { value: "value1" } }]
      const request = buildRequest(
        HeapPropertyTypes.User,
        "email",
        fields,
        data,
      )
      request.params = {}

      chai.expect(action.validateAndExecute(request)).to.be.eventually.rejected
      chai.expect(stubPost).to.have.not.been.called
    })

    it("should throw when Heap field column is not provided", async () => {
      const fields = [{ name: "email" }]
      const data = [{ email: { value: "value1" } }]
      const request = buildRequest(HeapPropertyTypes.User, "", fields, data)

      chai
        .expect(action.validateAndExecute(request))
        .to.be.eventually.rejectedWith(
          new RegExp("Column mapping to a Heap field must be provided"),
        )
      chai.expect(stubPost).to.have.not.been.called
    })

    it("should throw when provided unsupported property type", async () => {
      const fields = [{ name: "email" }]
      const data = [{ email: { value: "value1" } }]
      const request = buildRequest(
        "unsupported" as HeapPropertyType,
        "email",
        fields,
        data,
      )

      chai
        .expect(action.validateAndExecute(request))
        .to.be.eventually.rejectedWith(new RegExp("Unsupported property type"))
      chai.expect(stubPost).to.have.not.been.called
    })

    it("should throw when Heap field is missing", async () => {
      const fields = [{ name: "name" }]
      const data = [{ name: { value: "value1" } }]
      const request = buildRequest(
        HeapPropertyTypes.User,
        "email",
        fields,
        data,
      )

      chai
        .expect(action.validateAndExecute(request))
        .to.be.eventually.rejectedWith(
          "Heap field (email) is missing in the query result.",
        )
      chai.expect(stubPost).to.have.not.been.called
    })

    it("should fail when Heap field is empty in a row", async () => {
      const fields = [{ name: "email" }]
      const data = [{ email: { value: "" } }]
      const request = buildRequest(
        HeapPropertyTypes.User,
        "email",
        fields,
        data,
      )

      const response = await action.validateAndExecute(request)

      chai.expect(response.success).to.equal(false)
      chai
        .expect(response.message)
        .to.match(new RegExp("Found a row with an empty email field"))
      chai.expect(stubPost).to.have.not.been.called
    })
  })

  describe("Add User Properties", () => {
    it("should send a request for each row", async () => {
      const fields = [
        { name: "property1" },
        { name: "property2" },
        { name: "email", tags: ["identity"] },
      ]
      const data = [
        {
          property1: { value: "value1A" },
          property2: { value: "value2A" },
          email: { value: "testA@heap.io" },
        },
        {
          property1: { value: "value1B" },
          property2: { value: "value2B" },
          email: { value: "testB@heap.io" },
        },
      ]
      const request = buildRequest(
        HeapPropertyTypes.User,
        "email",
        fields,
        data,
      )

      const response = await action.validateAndExecute(request)

      chai.expect(response.success).to.equal(true)
      chai.expect(stubPost).to.have.been.calledTwice
      expectRequestSent(
        HeapAction.ADD_USER_PROPERTIES_URL,
        {
          "Looker property1": "value1A",
          "Looker property2": "value2A",
        },
        HeapFields.Identity,
        "testA@heap.io",
      )
      expectRequestSent(
        HeapAction.ADD_USER_PROPERTIES_URL,
        {
          "Looker property1": "value1B",
          "Looker property2": "value2B",
        },
        HeapFields.Identity,
        "testB@heap.io",
      )
    })
  })

  describe("Add Account Properties", () => {
    it("should send a request for each row", async () => {
      const fields = [
        { name: "property1" },
        { name: "property2" },
        { name: "account ID", tags: ["account_id"] },
      ]
      const data = [
        {
          "property1": { value: "value1A" },
          "property2": { value: "value2A" },
          "account ID": { value: "accountA" },
        },
        {
          "property1": { value: "value1B" },
          "property2": { value: "value2B" },
          "account ID": { value: "accountB" },
        },
      ]
      const request = buildRequest(
        HeapPropertyTypes.Account,
        "account ID",
        fields,
        data,
      )

      const response = await action.validateAndExecute(request)

      chai.expect(response.success).to.equal(true)
      chai.expect(stubPost).to.have.been.calledTwice
      expectRequestSent(
        HeapAction.ADD_ACCOUNT_PROPERTIES_URL,
        {
          "Looker property1": "value1A",
          "Looker property2": "value2A",
        },
        HeapFields.AccountId,
        "accountA",
      )
      expectRequestSent(
        HeapAction.ADD_ACCOUNT_PROPERTIES_URL,
        {
          "Looker property1": "value1B",
          "Looker property2": "value2B",
        },
        HeapFields.AccountId,
        "accountB",
      )
    })
  })
})
