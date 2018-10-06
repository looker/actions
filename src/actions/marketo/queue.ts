/* tslint:disable no-console */

function log(...args: any[]) {
  console.log(...args)
}

// function logJson(label: string, object: any) {
//   console.log("\n================================")
//   console.log(`${label}:\n`)
//   const json = `${JSON.stringify(object)}\n\n`
//   console.log(json)
// }

export class Queue {

  finished = false
  channelSize = 10
  queue: any[]
  channels: any[]
  completed: any[]
  promise: any
  resolve: any

  constructor() {
    this.queue = []
    this.channels = []
    this.completed = []

    this.promise = new Promise((resolve) => {
      this.resolve = resolve
    })
  }

  addTask(task: any) {
    this.queue.push(task)
    this.checkQueue()
  }

  checkQueue() {
    // check if we're finished
    if (
      this.finished
      && this.queue.length === 0
      && this.channels.length === 0
    ) {
      this.logState()
      this.resolve(this.completed)
      return
    }

    // check if we have task in the queue
    // and room to start a new one
    if (
      this.queue.length
      && this.channels.length < this.channelSize
    ) {
      // pull a task off the queue
      const task = this.queue.shift()
      this.startTask(task)
    }

    this.logState()
  }

  logState() {
    log("- queue:", this.queue.length, "- channels", this.channels.length, "- completed", this.completed.length)
  }

  startTask(task: any) {
    if (! task) { return }
    this.channels.push(task)

    task().then((result: any) => {
      // TODO need to ensure completed items are kept in order
      this.completed.push(result)
      this.channels = this.channels.filter((item) => item !== task)
      this.checkQueue()
    })
  }

  finish() {
    this.finished = true
    return this.promise
  }

}
