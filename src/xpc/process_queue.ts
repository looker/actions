import * as Pcancel from "p-cancelable"
import * as Pq from "p-queue"

export abstract class ProcessQueue {
    queue: Pq

    constructor() {
        // Actions that haven't specified executeInOwnProcess will not
        // be affected by this process count
        const concurrency = process.env.ACTION_HUB_EXECUTE_PROCESS_COUNT ?
            parseInt(process.env.ACTION_HUB_EXECUTE_PROCESS_COUNT, 10) : 1
        this.queue = new Pq({concurrency})
    }

    abstract async run(data: string, cancel: Pcancel<string>[]): Promise<string>
}
