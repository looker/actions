import * as chai from "chai"
import * as sinon from "sinon"

import {WebClient} from "@slack/client"
import * as Hub from "../../hub"
import * as _SlackClientManager from "./slack_client_manager"
import {PLACEHOLDER_WORKSPACE, SlackClientManager} from "./slack_client_manager"
import {MULTI_WORKSPACE_SUPPORTED_VERSION} from "./slack_client_manager"

describe("SlackClientManager", () => {
    let stubClient: any

    afterEach(() => {
        stubClient && stubClient.restore()
    })

    describe("empty state_json", () => {
        const request = new Hub.ActionRequest()

        const clientManager = new SlackClientManager(request)

        it("hasAnyClients works", () => {
            chai.expect(clientManager.hasAnyClients()).to.eq(false)
        })
        it("getClients works", () => {
            chai.expect(clientManager.getClients()).to.empty
        })
        it("hasSelectedClient works", () => {
            chai.expect(clientManager.hasSelectedClient()).to.eq(false)
        })
        it("getSelectedClient works", () => {
            chai.expect(clientManager.getSelectedClient()).to.eq(undefined)
        })
        it("getClient works", () => {
            chai.expect(clientManager.getClient("abc")).to.eq(undefined)
        })
    })

    describe("< supported multi workspace version", () => {
        const request = new Hub.ActionRequest()
        request.params.state_json = "some token"

        it("hasAnyClients works", () => {
            stubClient = sinon.stub(_SlackClientManager, "makeSlackClient").returns(new WebClient())
            const clientManager = new SlackClientManager(request)
            chai.expect(clientManager.hasAnyClients()).to.equals(true)
        })
        it("getClients works", () => {
            stubClient = sinon.stub(_SlackClientManager, "makeSlackClient").returns(new WebClient())
            const clientManager = new SlackClientManager(request)
            const result = clientManager.getClients()
            chai.expect(result).to.deep.equals(["stubbed"])
        })
        it("hasSelectedClient works", () => {
            stubClient = sinon.stub(_SlackClientManager, "makeSlackClient").returns(new WebClient())
            const clientManager = new SlackClientManager(request)
            chai.expect(clientManager.hasSelectedClient()).to.eq(true)
        })
        it("getSelectedClient works", () => {
            stubClient = sinon.stub(_SlackClientManager, "makeSlackClient").returns(new WebClient())
            const clientManager = new SlackClientManager(request)
            chai.expect(clientManager.getSelectedClient()).to.eq("stubbed")
        })
        it("getClient works", () => {
            stubClient = sinon.stub(_SlackClientManager, "makeSlackClient").returns(new WebClient())
            const clientManager = new SlackClientManager(request)
            chai.expect(clientManager.getClient(PLACEHOLDER_WORKSPACE)).to.eq("stubbed")
        })
    })

    describe("> supported multi workspace version", () => {
        describe("no token", () => {
            const request = new Hub.ActionRequest()
            request.lookerVersion = MULTI_WORKSPACE_SUPPORTED_VERSION
            request.params.state_json = JSON.stringify([])

            it("hasAnyClients works", () => {
                const clientManager = new SlackClientManager(request)
                chai.expect(clientManager.hasAnyClients()).to.equals(false)
            })
            it("getClients works", () => {
                const clientManager = new SlackClientManager(request)
                const result = clientManager.getClients()
                chai.expect(result).to.be.empty
            })
            it("hasSelectedClient works", () => {
                const clientManager = new SlackClientManager(request)
                chai.expect(clientManager.hasSelectedClient()).to.eq(false)
            })
            it("getSelectedClient works", () => {
                const clientManager = new SlackClientManager(request)
                chai.expect(clientManager.getSelectedClient()).to.eq(undefined)
            })
            it("getClient works", () => {
                const clientManager = new SlackClientManager(request)
                chai.expect(clientManager.getClient("WS1")).to.eq(undefined)
            })
        })

        describe("has fault tolerance for json str state json", () => {
            const request = new Hub.ActionRequest()
            request.lookerVersion = MULTI_WORKSPACE_SUPPORTED_VERSION
            request.params.state_json = JSON.stringify("token1")

            it("hasAnyClients works", () => {
                stubClient = sinon.stub(_SlackClientManager, "makeSlackClient").returns(new WebClient())
                const clientManager = new SlackClientManager(request)
                chai.expect(clientManager.hasAnyClients()).to.equals(true)
            })
            it("getClients works", () => {
                stubClient = sinon.stub(_SlackClientManager, "makeSlackClient").returns(new WebClient())
                const clientManager = new SlackClientManager(request)
                const result = clientManager.getClients()
                chai.expect(result).to.deep.equals([new WebClient()])
            })
            it("hasSelectedClient works", () => {
                stubClient = sinon.stub(_SlackClientManager, "makeSlackClient").returns(new WebClient())
                const clientManager = new SlackClientManager(request)
                chai.expect(clientManager.hasSelectedClient()).to.eq(true)
            })
            it("getSelectedClient works", () => {
                stubClient = sinon.stub(_SlackClientManager, "makeSlackClient").returns(new WebClient())
                const clientManager = new SlackClientManager(request)
                chai.expect(clientManager.getSelectedClient()).to.equals(new WebClient())
            })
            it("getClient works", () => {
                stubClient = sinon.stub(_SlackClientManager, "makeSlackClient").returns(new WebClient())
                const clientManager = new SlackClientManager(request)
                chai.expect(clientManager.getClient("WS1")).to.equals(undefined)
                chai.expect(clientManager.getClient(PLACEHOLDER_WORKSPACE)).to.equals(new WebClient())
            })
        })

        describe("has fault tolerance for str state json", () => {
            const request = new Hub.ActionRequest()
            request.lookerVersion = MULTI_WORKSPACE_SUPPORTED_VERSION
            request.params.state_json = "token1"

            it("hasAnyClients works", () => {
                stubClient = sinon.stub(_SlackClientManager, "makeSlackClient").returns(new WebClient())
                const clientManager = new SlackClientManager(request)
                chai.expect(clientManager.hasAnyClients()).to.equals(true)
            })
            it("getClients works", () => {
                stubClient = sinon.stub(_SlackClientManager, "makeSlackClient").returns(new WebClient())
                const clientManager = new SlackClientManager(request)
                const result = clientManager.getClients()
                chai.expect(result).to.deep.equals([new WebClient()])
            })
            it("hasSelectedClient works", () => {
                stubClient = sinon.stub(_SlackClientManager, "makeSlackClient").returns(new WebClient())
                const clientManager = new SlackClientManager(request)
                chai.expect(clientManager.hasSelectedClient()).to.eq(true)
            })
            it("getSelectedClient works", () => {
                stubClient = sinon.stub(_SlackClientManager, "makeSlackClient").returns(new WebClient())
                const clientManager = new SlackClientManager(request)
                chai.expect(clientManager.getSelectedClient()).to.equals(new WebClient())
            })
            it("getClient works", () => {
                stubClient = sinon.stub(_SlackClientManager, "makeSlackClient").returns(new WebClient())
                const clientManager = new SlackClientManager(request)
                chai.expect(clientManager.getClient("WS1")).to.equals(undefined)
                chai.expect(clientManager.getClient(PLACEHOLDER_WORKSPACE)).to.equals(new WebClient())
            })
        })

        describe("one token - no selected ws", () => {
            const request = new Hub.ActionRequest()
            request.lookerVersion = MULTI_WORKSPACE_SUPPORTED_VERSION
            request.params.state_json = JSON.stringify([{install_id: "WS1", token: "token1"}])

            it("hasAnyClients works", () => {
                stubClient = sinon.stub(_SlackClientManager, "makeSlackClient").returns(new WebClient())
                const clientManager = new SlackClientManager(request)
                chai.expect(clientManager.hasAnyClients()).to.equals(true)
            })
            it("getClients works", () => {
                stubClient = sinon.stub(_SlackClientManager, "makeSlackClient").returns(new WebClient())
                const clientManager = new SlackClientManager(request)
                const result = clientManager.getClients()
                chai.expect(result).to.deep.equals([new WebClient()])
            })
            it("hasSelectedClient works", () => {
                stubClient = sinon.stub(_SlackClientManager, "makeSlackClient").returns(new WebClient())
                const clientManager = new SlackClientManager(request)
                chai.expect(clientManager.hasSelectedClient()).to.eq(true)
            })
            it("getSelectedClient works", () => {
                stubClient = sinon.stub(_SlackClientManager, "makeSlackClient").returns(new WebClient())
                const clientManager = new SlackClientManager(request)
                chai.expect(clientManager.getSelectedClient()).to.eq(new WebClient())
            })
            it("getClient works", () => {
                stubClient = sinon.stub(_SlackClientManager, "makeSlackClient").returns(new WebClient())
                const clientManager = new SlackClientManager(request)
                chai.expect(clientManager.getClient("WS1")).to.eq(new WebClient())
            })
        })

        describe("multiple tokens", () => {
            const request = new Hub.ActionRequest()
            request.lookerVersion = MULTI_WORKSPACE_SUPPORTED_VERSION
            request.params.state_json = JSON.stringify([
                {install_id: "WS1", token: "token1"},
                {install_id: "WS2", token: "token2"},
            ])

            it("hasAnyClients works", () => {
                stubClient = sinon.stub(_SlackClientManager, "makeSlackClient").returns(new WebClient())
                const clientManager = new SlackClientManager(request)
                chai.expect(clientManager.hasAnyClients()).to.equals(true)
            })
            it("getClients works", () => {
                stubClient = sinon.stub(_SlackClientManager, "makeSlackClient")
                    .callsFake((token) => new WebClient(token))
                const clientManager = new SlackClientManager(request)
                const result = clientManager.getClients()
                chai.expect(result).to.deep.equal([new WebClient("stubbed-token1"), new WebClient("stubbed-token2")])
            })
            it("hasSelectedClient works", () => {
                stubClient = sinon.stub(_SlackClientManager, "makeSlackClient").returns(new WebClient())
                const clientManager = new SlackClientManager(request)
                chai.expect(clientManager.hasSelectedClient()).to.eq(true)
            })

            it("hasSelectedClient works - with selected WS", () => {
                stubClient = sinon.stub(_SlackClientManager, "makeSlackClient").returns(new WebClient())
                const hasSelecteWSReq = Object.assign({}, request, { formParams: { workspace: "WS1"}})
                const clientManager = new SlackClientManager(hasSelecteWSReq)
                chai.expect(clientManager.hasSelectedClient()).to.eq(true)
            })

            it("getSelectedClient works", () => {
                stubClient = sinon.stub(_SlackClientManager, "makeSlackClient").callsFake((token) => new WebClient(`stubbed-${token}`))
                const clientManager = new SlackClientManager(request)
                chai.expect(clientManager.getSelectedClient()).to.eq("stubbed-token1")
            })
            it("getSelectedClient works - with selected WS", () => {
                stubClient = sinon.stub(_SlackClientManager, "makeSlackClient").callsFake((token) => new WebClient(`stubbed-${token}`))
                const hasSelecteWSReq = Object.assign({}, request, { formParams: { workspace: "WS2"}})
                const clientManager = new SlackClientManager(hasSelecteWSReq)
                chai.expect(clientManager.getSelectedClient()).to.eq("stubbed-token2")
            })
            it("getClient works", () => {
                stubClient = sinon.stub(_SlackClientManager, "makeSlackClient").callsFake((token) => new WebClient(`stubbed-${token}`))
                const clientManager = new SlackClientManager(request)
                chai.expect(clientManager.getClient("WS1")).to.eq("stubbed-token1")
                chai.expect(clientManager.getClient("WS2")).to.eq("stubbed-token2")
                chai.expect(clientManager.getClient("WS3")).to.eq(undefined)
            })
        })
    })
})
