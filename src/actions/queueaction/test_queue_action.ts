import * as chai from "chai"
import * as Hub from "../../hub"

import * as Pcancel from "p-cancelable"
import {ExecuteProcessQueue} from "../../xpc/execute_process_queue"
import {ExtendedProcessQueue} from "../../xpc/extended_process_queue"
import {ProcessQueue} from "../../xpc/process_queue"
import {QueueTestAction} from "./queue_action_for_testing"

const action = new QueueTestAction()
const executeQueue = new ExecuteProcessQueue()
const extendedQueue = new ExtendedProcessQueue()
process.execArgv = ["./node_modules/ts-node/dist/bin.js"]
process.argv = ["node", "./integrations/src/boot.ts"]
process.env.CHILD_TEST = "true"
const cancel: Pcancel<string>[] = []

function expectResponse(
    request: Hub.ActionRequest,
    success: boolean,
    queue: ProcessQueue,
) {
    const execute = action.validateAndExecute(request, cancel, queue).then((response: Hub.ActionResponse) => {
        chai.expect(response.success).to.equal(success)
    })
    return chai.expect(execute).to.be.fulfilled
}

describe(`${action.constructor.name} unit tests for ProcessQueue`, () => {
    describe("action", () => {
        [executeQueue, extendedQueue].forEach((queue) => {
            it(`${queue.constructor.name} returns success on successful response`, () => {
                const request = new Hub.ActionRequest()
                request.type = Hub.ActionType.Query
                request.attachment = {dataBuffer: Buffer.from(JSON.stringify({ success: true }))}
                return expectResponse(request, true, queue)
            }).timeout(30000)

            it(`${queue.constructor.name} returns failure on failed response`, () => {
                const request = new Hub.ActionRequest()
                request.type = Hub.ActionType.Query
                request.attachment = {dataBuffer: Buffer.from(JSON.stringify({ success: false }))}
                return expectResponse(request, false, queue)
            }).timeout(30000)
        })
    })
})
