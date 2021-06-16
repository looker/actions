import * as chai from "chai"
import * as sinon from "sinon"

import * as Hub from "../../hub"

import * as Pcancel from "p-cancelable"
import * as apiKey from "../../server/api_key"
import Server from "../../server/server"
import { MarketoAction } from "./marketo"
import { MarketoTransaction } from "./marketo_transaction"

(async () => {
  const action = new MarketoAction()
  const cancel: Pcancel<string>[] = []
  action.executeInOwnProcess = false
  const form = await action.form()
  const sampleData = {
    fields: {
      measures: [],
      dimensions: [
        {label_short: "ID", name: "users.id", tags: ["user_id", "marketo:Account__c"]},
        {label_short: "Email", name: "users.email", tags: ["email", "marketo:email"]},
        {label_short: "Gender", name: "users.gender", tags: ["marketo:gender"]},
        {label_short: "random", name: "users.random"},
      ],
    },
    data: [
      {
        "users.id": {value: 4653},
        "users.email": {value: "zoraida.gregoire@example.com"},
        "users.gender": {value: "f"},
        "users.random": {value: 7},
      },
      {
        "users.id": {value: 629},
        "users.email": {value: "zola.summers@example.com"},
        "users.gender": {value: "m"},
        "users.random": {value: 4},
      },
      {
        "users.id": {value: 6980},
        "users.email": {value: "zoe.brady@example.com"},
        "users.gender": {value: "f"},
        "users.random": {value: 5},
      },
    ],
  }
  const sampleTypeParamsAttachment = {
    type: Hub.ActionType.Query,
    params: {
      url: "myurl",
      clientID: "myclientID",
      clientSecret: "myclientSecret",
    },
    attachment: {
      dataBuffer: Buffer.from(JSON.stringify(sampleData)),
    },
  }
  const expectedLeadData = [
    {
      Account__c: 4653,
      email: "zoraida.gregoire@example.com",
      gender: "f",
    },
    {
      Account__c: 629,
      email: "zola.summers@example.com",
      gender: "m",
    },
    {
      Account__c: 6980,
      email: "zoe.brady@example.com",
      gender: "f",
    },
  ]

  describe(`${action.constructor.name} unit tests`, () => {
    describe("action", () => {

      it("errors if there is no subaction and no campaignId", () => {
        // This is the old implicit mode
        const request = new Hub.ActionRequest()
        request.type = Hub.ActionType.Query
        request.params = {
          url: "myurl",
          clientID: "myclientID",
          clientSecret: "myclientSecret",
        }
        request.formParams = {}
        request.attachment = {
          dataBuffer: Buffer.from(JSON.stringify(sampleData)),
        }
        return chai.expect(action.validateAndExecute(request, cancel)).to.eventually
          .be.rejected
      })

      it("errors if subaction is 'none' and there is a campaignId", () => {
        const request = new Hub.ActionRequest()
        request.type = Hub.ActionType.Query
        request.params = {
          url: "myurl",
          clientID: "myclientID",
          clientSecret: "myclientSecret",
        }
        request.formParams = {
          subaction: "none",
          campaignId: "123",
        }
        request.attachment = {
          dataBuffer: Buffer.from(JSON.stringify(sampleData)),
        }
        return chai.expect(action.validateAndExecute(request, cancel)).to.eventually
          .be.rejected
      })

      it("errors if subaction is not 'none' and there is no campaignId", () => {
        const request = new Hub.ActionRequest()
        request.type = Hub.ActionType.Query
        request.params = {
          url: "myurl",
          clientID: "myclientID",
          clientSecret: "myclientSecret",
        }
        request.formParams = {
          subaction: "addCampaign",
          campaignId: "",
        }
        request.attachment = {
          dataBuffer: Buffer.from(JSON.stringify(sampleData)),
        }
        return chai.expect(action.validateAndExecute(request, cancel)).to.eventually
          .be.rejected
      })

      it("errors if subaction is not recognized", () => {
        // This is the old implicit mode
        const request = new Hub.ActionRequest()
        request.type = Hub.ActionType.Query
        request.params = {
          url: "myurl",
          clientID: "myclientID",
          clientSecret: "myclientSecret",
        }
        request.formParams = {
          subaction: "somethingUnexpected",
        }
        request.attachment = {
          dataBuffer: Buffer.from(JSON.stringify(sampleData)),
        }
        return chai.expect(action.validateAndExecute(request, cancel)).to.eventually
          .be.rejected
      })

      it("errors if there is no lookupField", () => {
        const request = new Hub.ActionRequest()
        request.type = Hub.ActionType.Query
        request.params = {
          url: "myurl",
          clientID: "myclientID",
          clientSecret: "myclientSecret",
        }
        request.formParams = {
          campaignId: "12345",
        }
        request.attachment = {
          dataBuffer: Buffer.from(JSON.stringify(sampleData)),
        }
        return chai.expect(action.validateAndExecute(request, cancel)).to.eventually
          .be.rejectedWith("Missing Lookup Field.")
      })

      it("errors if lookupField is not present in query", () => {
        const request = new Hub.ActionRequest()
        request.type = Hub.ActionType.Query
        request.params = {
          url: "myurl",
          clientID: "myclientID",
          clientSecret: "myclientSecret",
        }
        request.formParams = {
          campaignId: "1243",
          lookupField: "guid",
        }
        request.attachment = {
          dataBuffer: Buffer.from(JSON.stringify(sampleData)),
        }

        return chai.expect(action.validateAndExecute(request, cancel)).to.eventually
          .be.rejectedWith("Marketo Lookup Field for lead not present in query.")
      })

      const leadIds = [{id: 1}, {id: 2}, {id: 3}]
      const spies = [
        async () => Promise.resolve({
          success: true,
          result: leadIds,
        }),
        async () => Promise.resolve({
          success: true,
          result: leadIds,
        }),
        async () => Promise.resolve({
            success: true,
          result: leadIds,
        }),
        async () => Promise.resolve({
            success: true,
        }),
      ].map((fn) => sinon.spy(fn))
      const spy = {
        leadCreateOrUpdate: spies[0],
        campaignRequest: spies[1],
        listAddLeadsToList: spies[2],
        listRemoveLeadsFromList: spies[3],
      }

      sinon.stub(MarketoTransaction.prototype, "marketoClientFromRequest").callsFake(() => {
        return {
          lead: {
            createOrUpdate: spy.leadCreateOrUpdate,
          },
          campaign: {
            request: spy.campaignRequest,
          },
          list: {
            addLeadsToList: spy.listAddLeadsToList,
            removeLeadsFromList: spy.listRemoveLeadsFromList,
          },
        }
      })

      it("sends all the data to Marketo for the legacy request format", () => {
        const request = new Hub.ActionRequest()
        Object.assign(request, sampleTypeParamsAttachment)
        request.formParams = {
          campaignId: "101",
          lookupField: "email",
        }

        spies.forEach((s) => s.resetHistory())

        return chai.expect(action.validateAndExecute(request, cancel)).to.be.fulfilled.then(() => {
          chai.expect(spy.leadCreateOrUpdate).to.have.been.calledWith(expectedLeadData, {lookupField: "email"})
          chai.expect(spy.campaignRequest).to.have.been.calledWith(
            "101",
            leadIds,
          )
        })
      })

      it("sends all the data to Marketo for the 'none' subaction", () => {
        const request = new Hub.ActionRequest()
        Object.assign(request, sampleTypeParamsAttachment)
        request.formParams = {
          subaction: "none",
          lookupField: "email",
        }

        spies.forEach((s) => s.resetHistory())

        return chai.expect(action.validateAndExecute(request, cancel)).to.be.fulfilled.then(() => {
          chai.expect(spy.leadCreateOrUpdate).to.have.been.calledWith(expectedLeadData, {lookupField: "email"})
        })
      })

      it("sends all the data to Marketo for 'addCampaign' subaction", () => {
        const request = new Hub.ActionRequest()
        Object.assign(request, sampleTypeParamsAttachment)
        request.formParams = {
          subaction: "addCampaign",
          campaignId: "202",
          lookupField: "email",
        }

        spies.forEach((s) => s.resetHistory())

        return chai.expect(action.validateAndExecute(request, cancel)).to.be.fulfilled.then(() => {
          chai.expect(spy.leadCreateOrUpdate).to.have.been.calledWith(expectedLeadData, {lookupField: "email"})
          chai.expect(spy.campaignRequest).to.have.been.calledWith(
            "202",
            leadIds,
          )
        })
      })

      it("sends all the data to Marketo for 'addList' subaction", () => {
        const request = new Hub.ActionRequest()
        Object.assign(request, sampleTypeParamsAttachment)
        request.formParams = {
          subaction: "addList",
          campaignId: "303", // Yes, we are using the name campaignId to hold list Ids, for backwards compatibility
          lookupField: "email",
        }

        spies.forEach((s) => s.resetHistory())

        return chai.expect(action.validateAndExecute(request, cancel)).to.be.fulfilled.then(() => {
          chai.expect(spy.leadCreateOrUpdate).to.have.been.calledWith(expectedLeadData, {lookupField: "email"})
          chai.expect(spy.listAddLeadsToList).to.have.been.calledWith(
            "303",
            leadIds,
          )
        })
      })

      it("sends all the data to Marketo for 'removeList' subaction", () => {
        const request = new Hub.ActionRequest()
        Object.assign(request, sampleTypeParamsAttachment)
        request.formParams = {
          subaction: "removeList",
          campaignId: "404", // Yes, we are using the name campaignId to hold list Ids, for backwards compatibility
          lookupField: "email",
        }

        spies.forEach((s) => s.resetHistory())

        return chai.expect(action.validateAndExecute(request, cancel)).to.be.fulfilled.then(() => {
          chai.expect(spy.leadCreateOrUpdate).to.have.been.calledWith(expectedLeadData, {lookupField: "email"})
          chai.expect(spy.listRemoveLeadsFromList).to.have.been.calledWith(
            "404",
            [1, 2, 3],
          )
        })
      })

  })

    describe("asJSON", () => {
      it("supported format is json_detail on lookerVersion 6.0 and below", (done) => {
        const stub = sinon.stub(apiKey, "validate").callsFake((k: string) => k === "foo")
        chai.request(new Server().app)
          .post("/actions/marketo")
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
          .post("/actions/marketo")
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

    describe("Backwards compatibility", () => {
      // If a Looker user attempts to edit a scheduled plan that was set up using
      // a prior version of this Action, any fields missing from the new form definition
      // will cause Looker to delete the historical form entries, even if the action is coded
      // to correctly handle historical form entries. So, we can't remove fields from the form

      it("does not remove lookupField from the form", () => {
        chai.expect(form.fields.find((field) => field.name === "lookupField")).not.to.be.undefined
      } )
      it("does not remove subaction from the form", () => {
        chai.expect(form.fields.find((field) => field.name === "subaction")).not.to.be.undefined
      })
      it("keeps addCampaign as the default subaction", () => {
        // Since a legacy schedule would have subaction=undefined, but would have meant addCampaign,
        // then defaulting to addCampaign will preserve this functionality as users edit a legacy
        // schedule
        const maybeSubactionField = form.fields.find((field) => field.name === "subaction")
        const subactionField = maybeSubactionField === undefined ? {default: null} : maybeSubactionField
        chai.expect(subactionField.default).to.equal("addCampaign")
      })
      it("does not remove campaignId from the form", () => {
        chai.expect(form.fields.find((field) => field.name === "campaignId")).not.to.be.undefined
      })
    })
  })
})().catch((err: any) => {throw err})
