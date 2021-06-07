import * as Hub from "../../hub"

import * as Path from "path"
import * as Client from "ssh2-sftp-client"
import { URL } from "url"

export class SFTPAction extends Hub.Action {

  name = "sftp"
  label = "SFTP"
  iconName = "sftp/sftp.png"
  description = "Send data files to an SFTP server."
  supportedActionTypes = [Hub.ActionType.Query]
  params = []

  async execute(request: Hub.ActionRequest) {
    return new Promise<Hub.ActionResponse>(async (resolve, reject) => {

      if (!request.attachment || !request.attachment.dataBuffer) {
        reject("Couldn't get data from attachment.")
        return
      }

      if (!request.formParams.address) {
        reject("Needs a valid SFTP address.")
        return
      }

      const client = await this.sftpClientFromRequest(request)
      const parsedUrl = new URL(request.formParams.address)
      if (!parsedUrl.pathname) {
        throw "Needs a valid SFTP address."
      }
      const data = request.attachment.dataBuffer
      const fileName = request.formParams.filename || request.suggestedFilename()
      const remotePath = Path.join(parsedUrl.pathname, fileName)

      client.put(data, remotePath)
        .then(() => resolve(new Hub.ActionResponse()))
        .catch((err: any) => resolve(new Hub.ActionResponse({success: false, message: err.message})))
    })
  }

  async form() {
    const form = new Hub.ActionForm()
    form.fields = [{
      name: "address",
      label: "Address",
      description: "e.g. sftp://host/path/",
      type: "string",
      required: true,
    }, {
      name: "username",
      label: "Username",
      type: "string",
      required: true,
    }, {
      name: "password",
      label: "Password",
      type: "string",
      required: true,
    }, {
      label: "Filename",
      name: "filename",
      type: "string",
    }]
    return form
  }

  private async sftpClientFromRequest(request: Hub.ActionRequest) {

    const client = new Client()
    const parsedUrl = new URL(request.formParams.address!)
    if (!parsedUrl.hostname) {
      throw "Needs a valid SFTP address."
    }
    try {
      await client.connect({
        host: parsedUrl.hostname,
        username: request.formParams.username,
        password: request.formParams.password,
        port: +(parsedUrl.port ? parsedUrl.port : 22),
      })
    } catch (e) {
      throw e
    }
    return client
  }

}
