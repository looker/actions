import {ChatPostMessageArguments, FilesUploadArguments, WebClient} from "@slack/client"
import * as chai from "chai"
import * as sinon from "sinon"

import concatStream = require("concat-stream")

import * as Hub from "../../hub"
import {displayError, getDisplayedFormFields, handleExecute} from "./utils"

const stubFileName = "stubSuggestedFilename"

function expectSlackMatch(request: Hub.ActionRequest, optionsMatch: FilesUploadArguments) {

    const slackClient = new WebClient("someToken")
    const expectedBuffer = optionsMatch.file as Buffer
    delete optionsMatch.file

    const filesUploadSpy = sinon.spy(async (params: any) => {
        params.media.body.pipe(concatStream((buffer) => {
            chai.expect(buffer.toString()).to.equal(expectedBuffer.toString())
        }))
        return { promise: async () => Promise.resolve() }
    })

    const stubClient = sinon.stub(slackClient.files, "upload")
        .callsFake(filesUploadSpy)

    const stubSuggestedFilename = sinon.stub(request as any, "suggestedFilename")
        .callsFake(() => stubFileName)

    return chai.expect(handleExecute(request, slackClient)).to.be.fulfilled.then(() => {
        chai.expect(filesUploadSpy).to.have.been.calledWithMatch(optionsMatch)
        stubClient.restore()
        stubSuggestedFilename.restore()
    })
}

function expectSlackChatMatch(request: Hub.ActionRequest, optionsMatch: ChatPostMessageArguments) {

    const slackClient = new WebClient("someToken")

    const stubClient = sinon.stub(slackClient.chat, "postMessage")

    const stubSuggestedFilename = sinon.stub(request as any, "suggestedFilename")
      .callsFake(() => stubFileName)

    return chai.expect(handleExecute(request, slackClient)).to.be.fulfilled.then(() => {
        chai.expect(stubClient).to.have.been.calledWithMatch(optionsMatch)
        stubClient.restore()
        stubSuggestedFilename.restore()
    })
}

describe(`slack/utils unit tests`, () => {

    describe("getDisplayedFormFields", () => {
        it("returns correct channels", (done) => {
            const slackClient = new WebClient("token")
            // @ts-ignore
            sinon.stub(slackClient.conversations, "list").callsFake((filters: any) => filters.cursor ?
              {
                  ok: true,
                  channels: [
                      {id: "3", name: "C", is_member: true},
                      {id: "4", name: "D", is_member: true},
                  ],
              } :
              {
                  ok: true,
                  channels: [
                      {id: "1", name: "A", is_member: true},
                      {id: "2", name: "B", is_member: true},
                  ],
                  response_metadata: {
                      next_cursor: "cursor",
                  },
              },
            )
            // @ts-ignore
            sinon.stub(slackClient.users, "list").callsFake((filters: any) => filters.cursor ?
                {
                    ok: true,
                    members: [
                        {id: "30", name: "W"},
                        {id: "40", name: "X"},
                    ],
                } :
                {
                    ok: true,
                    members: [
                        {id: "10", name: "Z"},
                        {id: "20", name: "Y"},
                    ],
                    response_metadata: {
                        next_cursor: "cursor",
                    },
                })
            const result = getDisplayedFormFields(slackClient)
            chai.expect(result).to.eventually.deep.equal([
                {
                    description: "Name of the Slack channel you would like to post to.",
                    label: "Share In",
                    name: "channel",
                    options: [
                        {name: "1", label: "#A"},
                        {name: "2", label: "#B"},
                        {name: "3", label: "#C"},
                        {name: "4", label: "#D"},
                        {name: "30", label: "@W"},
                        {name: "40", label: "@X"},
                        {name: "20", label: "@Y"},
                        {name: "10", label: "@Z"}],
                    required: true,
                    type: "select",
                }, {
                    label: "Comment",
                    type: "string",
                    name: "initial_comment",
                }, {
                    label: "Filename",
                    name: "filename",
                    type: "string",
                },
            ]).and.notify(done)
        })
    })

    describe("handleExecute", () => {
        it("errors if there is no channel", (done) => {
            const slackClient = new WebClient()
            const request = new Hub.ActionRequest()
            request.formParams = {}
            request.attachment = {
                dataBuffer: Buffer.from("1,2,3,4", "utf8"),
                fileExtension: "csv",
            }
            chai.expect(handleExecute(request, slackClient)).to.eventually
                .be.rejectedWith("Missing channel.").and.notify(done)
        })

        it("sends to right body, channel and filename if specified", () => {
            const request = new Hub.ActionRequest()
            request.type = Hub.ActionType.Query
            request.params = {
                slack_api_token: "token",
            }
            request.formParams = {
                channel: "mychannel",
                filename: "mywackyfilename",
                initial_comment: "mycomment",
            }
            request.attachment = {
                dataBuffer: Buffer.from("1,2,3,4", "utf8"),
                fileExtension: "csv",
            }
            return expectSlackMatch(request, {
                file: request.attachment.dataBuffer,
                filename: `${request.formParams.filename}.csv`,
                channels: request.formParams.channel,
                initial_comment: request.formParams.initial_comment,
            })
        })

        it("sends right body and channel", () => {
            const request = new Hub.ActionRequest()
            request.type = Hub.ActionType.Query
            request.formParams = {
                channel: "mychannel",
                initial_comment: "mycomment",
            }
            request.attachment = {
                dataBuffer: Buffer.from("1,2,3,4", "utf8"),
                fileExtension: "csv",
            }
            return expectSlackMatch(request, {
                file: request.attachment.dataBuffer,
                filename: stubFileName,
                channels: request.formParams.channel,
                initial_comment: request.formParams.initial_comment,
            })
        })

        it("sends right body and channel if payload is empty", () => {
            const request = new Hub.ActionRequest()
            request.type = Hub.ActionType.Query
            request.scheduledPlan = {}
            request.attachment = {}
            request.formParams.channel = "mychannel"
            request.formParams.initial_comment = "mycomment"
            return expectSlackChatMatch(request, {
                channel: request.formParams.channel,
                text: request.formParams.initial_comment,
            })
        })

        it("returns failure on slack files.upload error", (done) => {
            const request = new Hub.ActionRequest()
            request.type = Hub.ActionType.Query
            request.params = {
                slack_api_token: "token",
            }
            request.formParams = {
                channel: "mychannel",
                initial_comment: "mycomment",
            }
            request.attachment = {
                dataBuffer: Buffer.from("1,2,3,4", "utf8"),
                fileExtension: "csv",
            }

            const slackClient = new WebClient()
            const filesUploadSpy = sinon.spy(async () => Promise.reject({
                type: "CHANNEL_NOT_FOUND",
                message: "Could not find channel mychannel",
            }))
            sinon.stub(slackClient.files, "upload").callsFake(filesUploadSpy)

            chai.expect(handleExecute(request, slackClient)).to.eventually.deep.equal({
                success: false,
                message: "Could not find channel mychannel",
                refreshQuery: false,
                validationErrors: [],
            }).and.notify(done)
        })

    })

    describe("displayError", () => {
        it("returned found value", () => {
            chai.expect(displayError["An API error occurred: invalid_auth"]).to
                .equal("Your Slack authentication credentials are not valid.")

        })
    })

})
