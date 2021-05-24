import * as chai from "chai"
import * as sinon from "sinon"

import * as Hub from "../../hub"
import { RudderGroupAction } from "./rudderstack_group"

const action = new RudderGroupAction()
action.executeInOwnProcess = false

function expectRudderMatch(request: Hub.ActionRequest, match: any) {
  const groupSpy = sinon.spy()
  const stubClient = sinon.stub(action as any, "rudderClientFromRequest")
    .callsFake(() => {
      return { group: groupSpy, flush: (cb: () => void) => cb()}
     })
  const stubAnon = sinon.stub(action as any, "generateAnonymousId").callsFake(() => "stubanon")

  const now = new Date()
  const clock = sinon.useFakeTimers(now.getTime())

  const baseMatch = {
    traits: {},
    context: {
      app: {
        name: "looker/actions",
        version: "dev",
      },
    },
    timestamp: now,
  }
  const merged = {...baseMatch, ...match}

  return chai.expect(action.validateAndExecute(request)).to.be.fulfilled.then(() => {
    chai.expect(groupSpy).to.have.been.calledWithExactly(merged)
    stubClient.restore()
    stubAnon.restore()
    clock.restore()
  })
}

describe(`${action.constructor.name} unit tests`, () => {

  describe("action", () => {

    it("works with rudder_group_id", () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query
      request.params = {
        rudder_write_key: "mykey", rudder_server_url: "http://localhost:8080",
      }
      request.attachment = {dataBuffer: Buffer.from(JSON.stringify({
        fields: {dimensions: [{ name: "coolfield", tags: ["rudder_group_id"]}]},
        data: [{coolfield: {value: "funvalue"}}],
      }))}
      return expectRudderMatch(request, {
        groupId: "funvalue",
        anonymousId: "stubanon",
        userId: null,
      })
    })

    it("works with rudder_group_id and user_id", () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query
      request.params = {
        rudder_write_key: "mykey", rudder_server_url: "http://localhost:8080",
      }
      request.attachment = {dataBuffer: Buffer.from(JSON.stringify({
        fields: {dimensions: [{ name: "coolfield", tags: ["rudder_group_id"]}, {name: "coolid", tags: ["user_id"]}]},
        data: [{ coolfield: { value: "funvalue"}, coolid: {value: "id"}}],
      }))}
      return expectRudderMatch(request, {
        groupId: "funvalue",
        userId: "id",
        anonymousId: null,
      })
    })

    it("works with rudder_group_id, user id and email", () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query
      request.params = {
        rudder_write_key: "mykey", rudder_server_url: "http://localhost:8080",
      }
      request.attachment = {dataBuffer: Buffer.from(JSON.stringify({
        fields: {dimensions: [
          {name: "coolemail", tags: ["email"]},
          {name: "coolfield", tags: ["rudder_group_id"]},
          {name: "coolid", tags: ["user_id"]},
          {name: "coolanonymousid", tags: ["rudder_anonymous_id"]},
          {name: "cooltrait", tags: []},
        ]},
        data: [{
          coolemail: {value: "emailemail"},
          coolfield: {value: "funvalue"},
          coolid: {value: "id"},
          coolanonymousid: {value: "anon_id"},
          cooltrait: {value: "funtrait"},
        }],
      }))}
      return expectRudderMatch(request, {
        groupId: "funvalue",
        userId: "id",
        anonymousId: "anon_id",
        traits: {
          email: "emailemail",
          cooltrait: "funtrait",
        },
      })
    })

    it("works with rudder_group_id, user id and anonymous id", () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query
      request.params = {
        rudder_write_key: "mykey", rudder_server_url: "http://localhost:8080",
      }
      request.attachment = {dataBuffer: Buffer.from(JSON.stringify({
        fields: {dimensions: [
          { name: "coolfield", tags: ["rudder_group_id"]},
          {name: "coolid", tags: ["user_id"]},
          {name: "coolanonymousid", tags: ["rudder_anonymous_id"]}]},
        data: [{ coolfield: {value: "funvalue"}, coolid: {value: "id"}, coolanonymousid: {value: "anon_id"}}],
      }))}
      return expectRudderMatch(request, {
        groupId: "funvalue",
        userId: "id",
        anonymousId: "anon_id",
      })
    })

    it("works with rudder_group_id and null user_id", () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query
      request.params = {
        rudder_write_key: "mykey", rudder_server_url: "http://localhost:8080",
      }
      request.attachment = {dataBuffer: Buffer.from(JSON.stringify({
        fields: {dimensions: [{ name: "coolfield", tags: ["rudder_group_id"]}, {name: "coolid", tags: ["user_id"]}]},
        data: [{ coolfield: { value: "funvalue"}, coolid: {value: null}}],
      }))}
      return expectRudderMatch(request, {
        groupId: "funvalue",
        userId: null,
        anonymousId: "stubanon",
      })
    })

  })

  describe("form", () => {
    it("has no form", () => {
      chai.expect(action.hasForm).equals(false)
    })
  })

})
