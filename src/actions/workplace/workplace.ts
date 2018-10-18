// tslint:disable no-console
import * as Hub from "../../hub"

const FB = require("fb")
const crypto = require("crypto")
const fileType = require("file-type")

export interface Destination {
  id: string,
  label: string,
}

// tslint:disable-next-line max-line-length
const description = "Install the Looker app for Facebook Workplace (https://workplace.facebook.com/work/admin/?section=apps&app_id=188384231761746), and enter the provided token in this field."

// function logRequest(request: Hub.ActionRequest) {
//   const requestInfo = Object.assign({}, request)
//   requestInfo.attachment = Object.assign({}, request.attachment)
//   delete requestInfo.attachment.dataBuffer
//   delete requestInfo.attachment.dataJSON
//   console.log("-".repeat(40))
//   console.log(JSON.stringify(requestInfo, null, 2))
//   console.log("-".repeat(40))
// }

export class WorkplaceAction extends Hub.Action {

  name = "workplace-facebook"
  label = "Workplace by Facebook"
  iconName = "workplace/workplace-facebook.svg"
  description = "Write a message to Workplace by Facebook."
  supportedActionTypes = [Hub.ActionType.Query, Hub.ActionType.Dashboard]
  supportedFormats = [Hub.ActionFormat.WysiwygPng]
  params = [
    {
      name: "facebook_app_access_token",
      label: "Facebook App Access Token",
      required: true,
      description,
      sensitive: true,
    },
    {
      name: "user_email",
      label: "Looker User Email",
      required: true,
      description: `
        Click the button on the right and select 'Email'.
        This is required for the action to determine
        which Workplace groups the user has access to.
      `,
      sensitive: false,
    },
  ]

  async execute(request: Hub.ActionRequest) {
    // logRequest(request)
    let response

    const photoResponse = await this.postToFacebook(request)

    if (!photoResponse || photoResponse.error) {
      response = { success: false, message: photoResponse ? photoResponse.error : "Error in Photo Upload Occurred" }
    }

    return new Hub.ActionResponse(response)
  }

  getMarkdownMessage(request: Hub.ActionRequest): string {
    if (!request.scheduledPlan) {
      throw "Missing scheduledPlan."
    }

    const { title, url } = request.scheduledPlan
    if (!title || !url) {
      throw "Missing title or url."
    }

    const { message } = request.formParams

    const parts = [
      `[${title}](${url})`,
      message,
    ]

    return parts.join("\n\n")
  }

  async postToFacebook(request: Hub.ActionRequest) {
    // return new Promise<any>((resolve, reject) => {
    if (!request.attachment || !request.attachment.dataBuffer) {
      throw "Couldn't get data from attachment."
    }
    const buffer = request.attachment.dataBuffer
    const bufferType = this.getFileType(buffer)

    if (!request.formParams.destination) {
      throw "Missing destination."
    }
    const groupId = encodeURIComponent(request.formParams.destination)

    const message = this.getMarkdownMessage(request)

    const photoOptions = {
      source: {
        value: buffer,
        options: {
          filename: `source.${bufferType.ext}`,
          contentType: bufferType.mime,
        },
      },
      message,
      formatting: "MARKDOWN",
    }

    const fb = this.facebookClientFromRequest(request)

    // add appsecret_proof and appsecret_time to the options
    const options = this.getAppSecretOptions(request)
    Object.assign(photoOptions, options)

    const response = await fb.api(`/${groupId}/photos`, "post", photoOptions)

    return response
  }

  getFileType(buffer: Buffer) {
    return fileType(buffer)
  }

  async form(request: Hub.ActionRequest) {
    // logRequest(request)

    const destinations = await this.usableDestinations(request)

    const form = new Hub.ActionForm()

    form.fields = [
      {
        description: "Name of the Facebook group you would like to post to.",
        label: "Share In",
        name: "destination",
        options: destinations.map((destination) => ({ name: destination.id, label: destination.label })),
        required: true,
        type: "select",
      },
      {
        description: "Optional message to accompany the post.",
        label: "Message",
        type: "textarea",
        name: "message",
      },
    ]

    return form
  }

  private async usableDestinations(request: Hub.ActionRequest): Promise<Destination[]> {
    const fb = this.facebookClientFromRequest(request)
    const options = this.getAppSecretOptions(request)

    if (!request.params.user_email) {
      throw "request.params.user_email is required"
    }

    const userEmail = request.params.user_email.toLowerCase()

    let user
    let groups
    try {
      // if either request fails, or we don't get any groups back, throw the
      // same error message (in the catch below)
      user = await fb.api(`/${userEmail}`, options)
      groups = await fb.api(`/${user.id}/managed_groups`, options)
      if (!groups || !groups.data || !groups.data.length) {
        throw "No groups returned."
      }
    } catch (err) {
      // tslint:disable-next-line max-line-length
      throw "There was an error retrieving Workplace groups for your account. Please verify that you have access to at least one Workplace group and try again."
    }

    return groups.data.map((g: any) => ({ id: g.id, label: `#${g.name}` }))
  }

  private facebookClientFromRequest(request: Hub.ActionRequest) {
    const accessToken = request.params.facebook_app_access_token
    const options = {
      accessToken,
    }
    return new FB.Facebook(options)
  }

  private getAppSecretOptions(request: Hub.ActionRequest) {
    const accessToken = request.params.facebook_app_access_token
    const appsecretTime = Math.floor(Date.now() / 1000)
    const appsecretProof = crypto
      .createHmac("sha256", process.env.WORKPLACE_APP_SECRET)
      .update(accessToken + "|" + appsecretTime)
      .digest("hex")
    return {
      access_token: accessToken,
      appsecret_time: appsecretTime,
      appsecret_proof: appsecretProof,
    }
  }

}

Hub.addAction(new WorkplaceAction())
