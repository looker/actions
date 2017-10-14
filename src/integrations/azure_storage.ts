import * as D from "../framework"

const azure = require("azure-storage")

export class AzureStorageIntegration extends D.Integration {

  constructor() {
    super()

    this.name = "azure_storage"
    this.label = "Azure Storage"
    this.iconName = "azure_storage.svg"
    this.description = "Write data files to an Azure container."
    this.supportedActionTypes = ["query", "dashboard"]
    this.requiredFields = []
    this.params = [
      {
        name: "account",
        label: "Storage Account",
        required: true,
        sensitive: false,
        description: "Your account for Azure.",
      }, {
        name: "accessKey",
        label: "Access Key",
        required: true,
        sensitive: true,
        description: "Your access key for Azure.",
      },
    ]
  }

  async action(request: D.DataActionRequest) {

      if (!request.attachment || !request.attachment.dataBuffer) {
        throw "Couldn't get data from attachment"
      }

      if (!request.formParams || !request.formParams.container) {
        throw "Need Azure container."
      }

      const blobService = this.azureClientFromRequest(request)
      const fileName = request.formParams.filename ? request.formParams.filename : request.suggestedFilename()

      let response
      try {
        await blobService.createBlockBlobFromText(
          request.formParams.container, fileName, request.attachment.dataBuffer)
      } catch (e) {
        response = {success: false, message: e.message}
      }
      return new D.DataActionResponse(response)
  }

  async form(request: D.DataActionRequest) {
    const blobService = this.azureClientFromRequest(request)
    try {
      const response = await blobService.listContainersSegmented()
      const form = new D.DataActionForm()
      form.fields = [{
        label: "Container",
        name: "container",
        required: true,
        options: response.entries.map((c: any) => {
            return {name: c.id, label: c.name}
          }),
        type: "select",
        default: response.entries[0].id,
      }, {
        label: "Filename",
        name: "filename",
        type: "string",
      }]
      return form
    } catch (e) {
      throw e.message
    }
  }

  private azureClientFromRequest(request: D.DataActionRequest) {
    return new azure.createBlobService(request.params.account, request.params.accessKey)
  }

}

D.addIntegration(new AzureStorageIntegration())
