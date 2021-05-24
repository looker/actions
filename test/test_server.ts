import * as chai from "chai"
import * as sinon from "sinon"

import * as apiKey from "../src/server/api_key"
import Server from "../src/server/server"

describe("the action hub", () => {

  it("responds to get requests with a nice html page", (done) => {
    chai.request(new Server().app)
      .get("/")
      .end((_err, res) => {
        chai.expect(res).to.have.status(200)
        done()
      })
  })

  it("403s on POST to the root url without authorization", (done) => {
    chai.request(new Server().app)
      .post("/")
      .end((_err, res) => {
        chai.expect(res).to.have.status(403)
        chai.expect(res.body.success).to.equal(false)
        chai.expect(res.body.error).to.equal("Invalid 'Authorization' header.")
        done()
      })
  })

  it("returns a list of actions on POST to the root url with the proper authentication key", (done) => {
    const stub = sinon.stub(apiKey, "validate").callsFake((k: string) => k === "foo")
    chai.request(new Server().app)
      .post("/")
      .set("Authorization", 'Token token="foo"')
      .end((_err, res) => {
        chai.expect(res).to.have.status(200)
        chai.expect(res.body.integrations.length).to.be.greaterThan(0)
        stub.restore()
        done()
      })
  })

  it("for looker versions before 5.5 it returns segment and rudderstack", (done) => {
    const stub = sinon.stub(apiKey, "validate").callsFake((k: string) => k === "foo")
    chai.request(new Server().app)
      .post("/")
      .set("Authorization", 'Token token="foo"')
      .set("User-Agent", "LookerOutgoingWebhook/5.0.0")
      .end((_err, res) => {
        chai.expect(res).to.have.status(200)
        chai.expect(res.body.integrations.length).to.equal(2)
        stub.restore()
        done()
      })
  })

  it("when no user agent is present don't filter the integrations", (done) => {
    const stub = sinon.stub(apiKey, "validate").callsFake((k: string) => k === "foo")
    chai.request(new Server().app)
      .post("/")
      .set("Authorization", 'Token token="foo"')
      .end((_err, res) => {
        stub.restore()
        chai.expect(res).to.have.status(200)
        chai.expect(res.body.integrations.length).to.be.greaterThan(2)
        done()
      })
  })

  it("when an unknown user agent is present don't filter the integrations", (done) => {
    const stub = sinon.stub(apiKey, "validate").callsFake((k: string) => k === "foo")
    chai.request(new Server().app)
      .post("/")
      .set("Authorization", 'Token token="foo"')
      .set("User-Agent", "Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko)")
      .end((_err, res) => {
        stub.restore()
        chai.expect(res).to.have.status(200)
        chai.expect(res.body.integrations.length).to.be.greaterThan(2)
        done()
      })
  })

  it("returns more integrations after 5.5", (done) => {
    const stub = sinon.stub(apiKey, "validate").callsFake((k: string) => k === "foo")
    chai.request(new Server().app)
      .post("/")
      .set("Authorization", 'Token token="foo"')
      .set("User-Agent", "LookerOutgoingWebhook/5.5.0")
      .end((_err, res) => {
        stub.restore()
        chai.expect(res).to.have.status(200)
        chai.expect(res.body.integrations.length).to.be.greaterThan(2)
        done()
      })
  })

  it("requires the token format", (done) => {
    const stub = sinon.stub(apiKey, "validate").callsFake((k: string) => k === "foo")
    chai.request(new Server().app)
      .post("/")
      .set("Authorization", "foo")
      .end((_err, res) => {
        chai.expect(res).to.have.status(403)
        chai.expect(res.body.error).to.equal("Invalid 'Authorization' header.")
        stub.restore()
        done()
      })
  })

  it("returns a correct list of actions on POST // Looker version 6.2", (done) => {
    const stub = sinon.stub(apiKey, "validate").callsFake((k: string) => k === "foo")
    let response60 = {}
    let response62 = {}
    chai.request(new Server().app)
      .post("/")
      .set("Authorization", 'Token token="foo"')
      .set("User-Agent", "LookerOutgoingWebhook/6.0.0")
      .end((_err, res) => {
        chai.expect(res).to.have.status(200)
        response60 = res.body
      })
    chai.request(new Server().app)
      .post("/")
      .set("Authorization", 'Token token="foo"')
      .set("User-Agent", "LookerOutgoingWebhook/6.2.0")
      .end((_err, res) => {
        chai.expect(res).to.have.status(200)
        response62 = res.body
        chai.expect(JSON.stringify(response60)).to.not.equal(JSON.stringify(response62))
        stub.restore()
        done()
      })
  })

})
