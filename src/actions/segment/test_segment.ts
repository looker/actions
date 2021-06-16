import * as chai from "chai"
import * as sinon from "sinon"

import * as Pcancel from "p-cancelable"
import * as Hub from "../../hub"
import * as apiKey from "../../server/api_key"
import Server from "../../server/server"
import { SegmentAction } from "./segment"

const action = new SegmentAction()
const cancel: Pcancel<string>[] = []
action.executeInOwnProcess = false

function expectSegmentMatch(request: Hub.ActionRequest, match: any) {
  const segmentCallSpy = sinon.spy()
  const stubClient = sinon.stub(action as any, "segmentClientFromRequest")
    .callsFake(() => {
      return {identify: segmentCallSpy, flush: (cb: () => void) => cb()}
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
  return chai.expect(action.validateAndExecute(request, cancel)).to.be.fulfilled.then(() => {
    chai.expect(segmentCallSpy).to.have.been.calledWithExactly(merged)
    stubClient.restore()
    stubAnon.restore()
    clock.restore()
  })
}

describe(`${action.constructor.name} unit tests`, () => {

  describe("action", () => {

    it("works with user_id", () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query
      request.params = {
        segment_write_key: "mykey",
      }
      request.attachment = {dataBuffer: Buffer.from(JSON.stringify({
          fields: {dimensions: [{name: "coolfield", tags: ["user_id"]}]},
          data: [{coolfield: {value: "funvalue"}}],
        }))}
      return expectSegmentMatch(request, {
        userId: "funvalue",
        anonymousId: null,
      })
    })

    it("works with email", () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query
      request.params = {
        segment_write_key: "mykey",
      }
      request.attachment = {dataBuffer: Buffer.from(JSON.stringify({
        fields: {dimensions: [{name: "coolfield", tags: ["email"]}]},
        data: [{coolfield: {value: "funvalue"}}],
      }))}
      return expectSegmentMatch(request, {
        anonymousId: "stubanon",
        userId: null,
        traits: {email: "funvalue"},
       })
    })

    it("works with pivoted values", () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query
      request.params = {
        segment_write_key: "mykey",
      }
      request.attachment = {dataBuffer: Buffer.from(JSON.stringify({
          fields: {dimensions: [{name: "coolfield", tags: ["user_id"]}],
                   measures: [{name: "users.count"}]},
          data: [{"coolfield": {value: "funvalue"}, "users.count": {f: {value: 1}, z: {value: 3}}}],
        }))}
      return expectSegmentMatch(request, {
        userId: "funvalue",
        anonymousId: null,
        traits: { "users.count": [{ f: 1 }, { z: 3 }] },
      })
    })

    it("works with email and user id", () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query
      request.params = {
        segment_write_key: "mykey",
      }
      request.attachment = {dataBuffer: Buffer.from(JSON.stringify({
        fields: {dimensions: [{name: "coolemail", tags: ["email"]}, {name: "coolid", tags: ["user_id"]}]},
        data: [{coolemail: {value: "email@email.email"}, coolid: {value: "id"}}],
      }))}
      return expectSegmentMatch(request, {
        userId: "id",
        traits: {email: "email@email.email"},
        anonymousId: null,
      })
    })

    it("works with email, user id and anonymous id", () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query
      request.params = {
        segment_write_key: "mykey",
      }
      request.attachment = {dataBuffer: Buffer.from(JSON.stringify({
        fields: {dimensions: [
          {name: "coolemail", tags: ["email"]},
          {name: "coolid", tags: ["user_id"]},
          {name: "coolanonymousid", tags: ["segment_anonymous_id"]}]},
        data: [{coolemail: {value: "email@email.email"}, coolid: {value: "id"}, coolanonymousid: {value: "anon_id"}}],
      }))}
      return expectSegmentMatch(request, {
        userId: "id",
        traits: {email: "email@email.email"},
        anonymousId: "anon_id",
      })
    })

    it("works with email, user id and anonymous id and trait", () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query
      request.params = {
        segment_write_key: "mykey",
      }
      request.attachment = {dataBuffer: Buffer.from(JSON.stringify({
        fields: {dimensions: [
          {name: "coolemail", tags: ["email"]},
          {name: "coolid", tags: ["user_id"]},
          {name: "coolanonymousid", tags: ["segment_anonymous_id"]},
          {name: "cooltrait", tags: []},
        ]},
        data: [{
          coolemail: {value: "emailemail"},
          coolid: {value: "id"},
          coolanonymousid: {value: "anon_id"},
          cooltrait: {value: "funtrait"},
        }],
      }))}
      return expectSegmentMatch(request, {
        userId: "id",
        traits: {
          email: "emailemail",
          cooltrait: "funtrait",
        },
        anonymousId: "anon_id",
      })
    })

    it("works with user id and anonymous id", () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query
      request.params = {
        segment_write_key: "mykey",
      }
      request.attachment = {dataBuffer: Buffer.from(JSON.stringify({
        fields: {dimensions: [
          {name: "coolid", tags: ["user_id"]}, {name: "coolanonymousid", tags: ["segment_anonymous_id"]},
        ]},
        data: [
            {coolid: {value: "id"}, coolanonymousid: {value: "anon_id"}}],
      }))}
      return expectSegmentMatch(request, {
        userId: "id",
        anonymousId: "anon_id",
      })
    })

    it("works with anonymous id", () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query
      request.params = {
        segment_write_key: "mykey",
      }
      request.attachment = {dataBuffer: Buffer.from(JSON.stringify({
        fields: {dimensions: [
            {name: "coolanonymousid", tags: ["segment_anonymous_id"]},
        ]},
        data: [{coolanonymousid: {value: "anon_id"}}],
      }))}
      return expectSegmentMatch(request, {
        userId: "anon_id",
        anonymousId: "anon_id",
      })
    })

    it("doesn't send hidden fields", () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query
      request.params = {
        segment_write_key: "mykey",
      }
      request.attachment = {dataBuffer: Buffer.from(JSON.stringify({
        fields: {
          dimensions: [
            {name: "coolfield", tags: ["email"]},
            {name: "hiddenfield"},
            {name: "nonhiddenfield"},
          ]},
        data: [{
          coolfield: {value: "funvalue"},
          hiddenfield: {value: "hiddenvalue"},
          nonhiddenfield: {value: "nonhiddenvalue"},
        }],
      }))}
      request.scheduledPlan = {
        query: {
          vis_config: {
            hidden_fields: [
              "hiddenfield",
            ],
          },
        },
      } as any
      return expectSegmentMatch(request, {
        anonymousId: "stubanon",
        userId: null,
        traits: {
          email: "funvalue",
          nonhiddenfield: "nonhiddenvalue",
        },
      })
    })

    it("works with null user_ids", () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query
      request.params = {
        segment_write_key: "mykey",
      }
      request.attachment = {dataBuffer: Buffer.from(JSON.stringify({
        fields: {dimensions: [{name: "coolfield", tags: ["user_id"]}]},
        data: [{coolfield: {value: null}}],
      }))}
      return expectSegmentMatch(request, {
        userId: null,
        anonymousId: "stubanon",
      })
    })

    it("works with ran_at", () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query
      request.params = {
        segment_write_key: "mykey",
      }
      request.attachment = {dataBuffer: Buffer.from(JSON.stringify({
        fields: {dimensions: [{name: "coolfield", tags: ["email"]}]},
        ran_at: "2017-07-28T02:25:19+00:00",
        data: [{coolfield: {value: "funvalue"}}],
      }))}
      return expectSegmentMatch(request, {
        anonymousId: "stubanon",
        userId: null,
        timestamp: new Date("2017-07-28T02:25:19+00:00"),
        traits: {email: "funvalue"},
       })
    })

    it("errors if the input has no attachment", () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query
      request.params = {
        segment_write_key: "mykey",
      }
      return chai.expect(action.validateAndExecute(request, cancel)).to.eventually
        .be.rejectedWith(
          "A streaming action was sent incompatible data. The action must have a download url or an attachment.")
    })

    it("errors if the query response has no fields", (done) => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query
      request.params = {
        segment_write_key: "mykey",
      }
      request.attachment = {dataBuffer: Buffer.from(JSON.stringify({
        data: [{coolfield: {value: "funvalue"}}],
      }))}
      chai.expect(action.validateAndExecute(request, cancel)).to.eventually
        .deep.equal({
          message: "Query requires a field tagged email or user_id or segment_anonymous_id.",
          success: false,
          refreshQuery: false,
          validationErrors: [],
        })
        .and.notify(done)
    })

    it("errors if there is no tagged field", (done) => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query
      request.params = {
        segment_write_key: "mykey",
      }
      request.attachment = {dataBuffer: Buffer.from(JSON.stringify({
        fields: {dimensions: [{name: "coolfield", tags: []}]},
        data: [{coolfield: {value: "funvalue"}}],
      }))}
      chai.expect(action.validateAndExecute(request, cancel)).to.eventually
        .deep.equal({
          message: "Query requires a field tagged email or user_id or segment_anonymous_id.",
          success: false,
          refreshQuery: false,
          validationErrors: [],
        })
        .and.notify(done)
    })

    it("errors if there is no write key", () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query
      request.attachment = {dataBuffer: Buffer.from(JSON.stringify({
        fields: {dimensions: [{name: "coolfield", tags: ["user_id"]}]},
        data: [],
      }))}
      return chai.expect(action.validateAndExecute(request, cancel)).to.eventually
        .be.rejectedWith(`Required setting "Segment Write Key" not specified in action settings.`)
    })

  })

  describe("form", () => {
    it("has no form", () => {
      chai.expect(action.hasForm).equals(false)
    })
  })

  describe("asJSON", () => {
    it("supported format is json_detail on lookerVersion 6.0 and below", (done) => {
      const stub = sinon.stub(apiKey, "validate").callsFake((k: string) => k === "foo")
      chai.request(new Server().app)
        .post("/actions/segment_event")
        .set("Authorization", "Token token=\"foo\"")
        .set("User-Agent", "LookerOutgoingWebhook/6.0.0")
        .end((_err, res) => {
          chai.expect(res).to.have.status(200)
          chai.expect(res.body).to.deep.include({supported_formats: ["json_detail"]})
          stub.restore()
          done()
        })
    })

    it("supported format is json_detail_lite_stream on lookerVersion 6.2 and above", (done) => {
      const stub = sinon.stub(apiKey, "validate").callsFake((k: string) => k === "foo")
      chai.request(new Server().app)
        .post("/actions/segment_event")
        .set("Authorization", "Token token=\"foo\"")
        .set("User-Agent", "LookerOutgoingWebhook/6.2.0")
        .end((_err, res) => {
          chai.expect(res).to.have.status(200)
          chai.expect(res.body).to.deep.include({supported_formats: ["json_detail_lite_stream"]})
          stub.restore()
          done()
        })
    })
  })

})
