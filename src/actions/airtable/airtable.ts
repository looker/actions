import * as Hub from "../../hub"

const airtable: any = require("airtable")

export class AirtableAction extends Hub.Action {

  name = "airtable"
  label = "Airtable"
  iconName = "airtable/airtable.png"
  description = "Add records to an Airtable table."
  params = [
    {
      description: "API key for Airtable from https://airtable.com/account.",
      label: "Airtable API Key",
      name: "airtable_api_key",
      required: true,
      sensitive: true,
    },
  ]
  supportedActionTypes = [Hub.ActionType.Query]
  supportedFormats = [Hub.ActionFormat.JsonDetail]
  supportedFormattings = [Hub.ActionFormatting.Unformatted]
  supportedVisualizationFormattings = [Hub.ActionVisualizationFormatting.Noapply]

  async execute(request: Hub.ActionRequest) {
    if (!(request.attachment && request.attachment.dataJSON)) {
      throw "No attached json."
    }

    if (!(request.formParams.base && request.formParams.table)) {
      throw "Missing Airtable base or table."
    }

    const qr = request.attachment.dataJSON
    if (!qr.fields || !qr.data) {
      throw "Request payload is an invalid format."
    }

    const fields: any[] = [].concat(...Object.keys(qr.fields).map((k) => qr.fields[k]))
    const fieldMap: any = {}
    for (const field of fields) {
      fieldMap[field.name] = field.label_short || field.label || field.name
    }
    const records = qr.data.map((row: any) => {
      const record: any = {}
      for (const field of fields) {
        record[fieldMap[field.name]] = row[field.name].value
      }
      return record
    })

    let response
    try {
      const airtableClient = this.airtableClientFromRequest(request)
      const base = airtableClient.base(request.formParams.base)
      const table = base(request.formParams.table)

      await Promise.all(records.map(async (record: any) => {
        return table.create(record, {typecast: true})
      }))
    } catch (e) {
      response = { success: false, message: e.message }
    }
    return new Hub.ActionResponse(response)
  }

  async form() {
    const form = new Hub.ActionForm()
    form.fields = [{
      label: "Airtable Base",
      name: "base",
      required: true,
      type: "string",
    }, {
      label: "Airtable Table",
      name: "table",
      required: true,
      type: "string",
    }]
    return form
  }

  private airtableClientFromRequest(request: Hub.ActionRequest) {
    return new airtable({apiKey: request.params.airtable_api_key})
  }

}

Hub.addAction(new AirtableAction())
