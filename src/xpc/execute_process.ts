import "dotenv/config"
import * as winston from "winston"

import { registerDebugAction } from "../actions/debug/debug"
import "../actions/index.ts"
import * as Hub from "../hub/index"

registerDebugAction()

async function execute(jsonPayload: any) {
    const req = JSON.parse(jsonPayload)
    const request = Hub.ActionRequest.fromIPC(req)
    const action = await Hub.findAction(req.actionId, {lookerVersion: req.lookerVersion})
    return action.execute(request)
}

process.on("message", (req) => {
    execute(req)
        .then((val) => { process.send!(val)})
        .catch((err) => {
            const stringErr = JSON.stringify(err)
            winston.error("Error on child: " + stringErr)
            process.send!({success: false, message: stringErr})
        })
})
