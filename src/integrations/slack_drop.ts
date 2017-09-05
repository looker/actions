import * as winston from "winston"
import * as D from "../framework"

const Slack = require("node-slack-upload")
const path = require("path")
const fs = require("fs")
// const WebClient = require('@slack/client').WebClient;
require("dotenv").config()

export class SlackFileDrop extends D.Integration {

  constructor() {
    super()
    this.name = "slack_file_drop"
    this.label = "Slack File Drop"
    this.iconName = "slack.png"
    this.description = "Drop Files to a slack channel formatted as CSV's"
    this.supportedActionTypes = ["query"]
    this.requiredFields = []
    this.params = [
      {
        name: "token",
        label: "Slack API Token",
        required: true,
        description: "https://api.slack.com/custom-integrations/legacy-tokens",
        sensitive: true,
      },
      {
        name: "channel",
        label: "Slack Channel",
        required: true,
        sensitive: true,
      },
    ]
    this.supportedFormats = ["json_detail"]
    this.supportedFormattings = ["unformatted"]
  }

  async action(request: D.DataActionRequest) {

    return new Promise <D.DataActionResponse>((resolve, reject) => {

      if (!request.attachment){
        reject("Missing Attachment File")
      }

      if (!request.params.token || !request.params.channel){
        reject("Missing parameters")
      }

      const slack = new Slack(request.params.token)

      /********************************************************
       *   this is returning type Json should be type CSV
       *  run this integration on the server first and see what format
       *  of attachment is automatically included by Looker
       ************************************************************/

      let file_upload = function(){
        slack.uploadFile({
          file: fs.createReadStream(path.join("./", "attached_file.txt")),
          filetype: "text",
          title: "looker_attached_file",
          initialComment: "File added by Looker",
          channels: request.params.channel,
        }, function(err: any , data: any){
          if (!err){
            winston.info("Uploaded file details: ", data)
            fs.unlinkSync("./attached_file.txt")
            resolve(data)
          }
          winston.info(err)
          reject(err)
        })
      }

      const attached_file = "attached_file.txt"
      const qr = JSON.stringify(request.attachment)
      fs.writeFile(attached_file, qr, function(err: any){
        if (!err){
          file_upload()
        }
        winston.info("Failure")
      })
    })
  }

}

D.addIntegration(new SlackFileDrop())
