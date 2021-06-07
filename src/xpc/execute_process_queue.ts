import * as spawn from "child_process"
import * as winston from "winston"
import {ProcessQueue} from "./process_queue"

export class ExecuteProcessQueue extends ProcessQueue {
    PROCESS_TIMEOUT = 1000 * 60 * 60 // 1 hour in milliseconds

    processTimeoutKiller(child: spawn.ChildProcess, webhookId: string, cb: any) {
        const msg = "Killed execute process due to timeout in responding to parent process"
        winston.warn(msg, {webhookId})
        if (!child.killed) {
            child.kill()
        }
        cb(msg)
    }

    async run(data: string) {
        return this.queue.add(async () => {
            return new Promise<string>((resolve, reject) => {
                const child = spawn.fork(`./src/xpc/execute_process.ts`)
                const webhookId = JSON.parse(data).webhookId
                winston.info(`execute process created`, {webhookId})
                let succeeded = false
                const timeout = setTimeout(this.processTimeoutKiller, this.PROCESS_TIMEOUT, child, webhookId, reject)
                child.on("message", (actionResponse) => {
                    clearTimeout(timeout)
                    resolve(actionResponse as string)
                    winston.info(`execute process was successful`, {webhookId})
                    succeeded = true
                    child.kill()
                }).on("error", (err) => {
                    clearTimeout(timeout)
                    winston.warn(`execute process sent error message`, {webhookId, message: err.message})
                    if (!child.killed) {
                        child.kill()
                    }
                    reject(err)
                }).on("exit", (code: number, signal: string) => {
                    clearTimeout(timeout)
                    if (!succeeded) {
                        winston.warn(`execute process exited`, {webhookId, code, signal})
                    }
                    if (!child.killed) {
                        child.kill()
                    }
                    reject(signal)
                }).on("disconnect", () => {
                    clearTimeout(timeout)
                    if (!succeeded) {
                        winston.info(`execute process disconnected`, {webhookId})
                    }
                    if (!child.killed) {
                        child.kill()
                    }
                    reject("Child Disconnected")
                }).on("close", (code: number, signal: string) => {
                    clearTimeout(timeout)
                    if (!succeeded) {
                        winston.warn(`execute process closed`, {webhookId, code, signal})
                    }
                    if (!child.killed) {
                        child.kill()
                    }
                    reject(signal)
                })
                child.send(data)
            })
        })
    }
}
