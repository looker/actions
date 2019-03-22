import * as req from "request-promise-native"
import * as url from "url"

import * as Hub from "../../hub"

enum BrazeConfig {
  EXPORT_PATH = "/users/track",
  LOOKER_ATTRIBUTE_NAME = "looker_export",
  MAX_LINES = 75,
  BRAZE_ID_TAG = "braze_id",
  EXPORT_DEFAULT_VALUE = "LOOKER_EXPORT",
  MAX_EXPORT = 10000,
  DEFAULT_DOMAIN = ".braze.com",
}

interface BrazeApiRow {
  [key: string]: any
  external_id?: string
  braze_id?: string
  _update_existing_only: boolean
  looker_export?: {
    add: string[],
  }
}

interface BrazeApiBody {
  api_key: string
  attributes: BrazeApiRow[]
}

function isEmpty(obj: any) {
  return !obj || Object.keys(obj).length === 0
}

export class BrazeAction extends Hub.Action {
  name = "braze"
  label = "Braze"
  description = "Ensure there's a '" + BrazeConfig.BRAZE_ID_TAG + "' field tagged in a results."
    + " MAX EXPORT: " + BrazeConfig.MAX_EXPORT + "."
  iconName = "braze/braze.svg"
  supportedActionTypes = [Hub.ActionType.Query]
  supportedVisualizationFormattings = [Hub.ActionVisualizationFormatting.Noapply]
  supportedFormattings = [Hub.ActionFormatting.Unformatted]
  requiredFields = [{ tag: String(BrazeConfig.BRAZE_ID_TAG) }]
  usesStreaming = true
  supportedFormats = [Hub.ActionFormat.JsonDetail]

  params = [{
    name: "braze_api_key",
    label: "Braze API Key",
    required: true,
    sensitive: true,
    description: "Braze API Key from " +
      "https://dashboard.braze.com/app_settings/developer_console/ with users.track permission.",
  },
  {
    name: "braze_api_endpoint",
    label: "Braze REST API Endpoint",
    required: true,
    sensitive: false,
    description: "Braze REST API endpoint based on the instance location. " +
      "See: https://www.braze.com/docs/developer_guide/rest_api/basics/#endpoints",
  }]

  async execute( request: Hub.ActionRequest) {
    // Check for missing fields
    if (isEmpty( request.params) ) {
      throw "Missing config settings."
    }

    if (!(request.params.braze_api_endpoint )
      || (request.params.braze_api_endpoint.toLowerCase().indexOf(BrazeConfig.DEFAULT_DOMAIN.toLowerCase() ) < 0 )) {
      throw "Missing or Bad Endpoint."
    }

    // Generate endpoint
    const endpoint = request.params.braze_api_endpoint.trim()
      .replace("http://", "https://").replace(/\/$/, "") + BrazeConfig.EXPORT_PATH

    if (!endpoint.startsWith("http") ) {
      throw "Incorrect domain for endpoint."
    }

    if (!request.params.braze_api_key) {
      throw "Missing API Key."
    }

    if (!(request.formParams.braze_key)) {
      throw "Missing primary Braze key."
    }

    const exportValue = request.formParams.braze_segment  || String(BrazeConfig.EXPORT_DEFAULT_VALUE)
    const brazeAttribute = { add : [ exportValue ] }
    const brazeApiKey = String(request.params.braze_api_key)
    let totalCount = 0
    let fieldlist: Hub.Field[] = []
    let bzIdField = ""
    let rows: BrazeApiRow[] = []
    try {
      await request.streamJsonDetail({
        onFields: (fields) => {
          fieldlist = Hub.allFields(fields)
          for (const field of fieldlist) {
            if (field.tags  && field.tags.find((tag: string) => tag === BrazeConfig.BRAZE_ID_TAG )) {
              bzIdField = field.name
            }
          }
          if (!bzIdField) {
            throw "Primary Braze key not found."
          }
        },
        onRow: (row) => {
          if (totalCount < BrazeConfig.MAX_EXPORT) {
            const entry: BrazeApiRow = {
              _update_existing_only: true,
            }
            entry[String(request.formParams.braze_key)] = row[bzIdField].value
            entry[String(BrazeConfig.LOOKER_ATTRIBUTE_NAME)] = brazeAttribute
            // Only update existing records to prevent unknown data sources
            rows.push(entry)

            totalCount++
            if (rows.length === BrazeConfig.MAX_LINES) {
              this.sendChunk(endpoint, brazeApiKey, rows)
                .catch( (e) => {
                  return new Hub.ActionResponse({success: false, message: e.message })
                })
              rows = []
            }
          } else if (rows.length > 0) {
            this.sendChunk(endpoint, brazeApiKey, rows)
              .catch( (e) => {
                return new Hub.ActionResponse({success: false, message: e.message })
              })
            rows = []
          }
        },
      })

      if (rows.length > 0) {
        this.sendChunk(endpoint, brazeApiKey, rows)
          .catch( (e) => {
            return new Hub.ActionResponse({success: false, message: e.message })
          })
        rows = []
      }
    } catch (e) {
      return new Hub.ActionResponse({success: false, message: e.message })
    }
    return new Hub.ActionResponse({success: true, message: "ok"})
  }

  async form() {
    const form = new Hub.ActionForm()
    form.fields = [{
      label: "Unique Key",
      name: "braze_key",
      description: " Primay key for user to map to within Braze.",
      required: true,
      options: [
        {name: "external_id", label: "external_id"},
        {name: "braze_id", label: "braze_id"},
      ],
      type: "select",
      default: "external_id",
    }, {
      label: "Export Label",
      name: "braze_segment",
      description: "Name of export (Appends to Custom Attribute Array '" +
        BrazeConfig.LOOKER_ATTRIBUTE_NAME + "'). Defaults to '" + BrazeConfig.EXPORT_DEFAULT_VALUE + "'." ,
      required: true,
      type: "string",
      default: String(BrazeConfig.EXPORT_DEFAULT_VALUE),
    },
    ]
    return form
  }

  async sendChunk(endpoint: string, apiKey: string, chunk: BrazeApiRow[]) {
    const urlendpoint = url.parse(endpoint)
    const reqbody: BrazeApiBody = {
      api_key: apiKey,
      attributes: chunk,
    }
    return req.post({ uri: urlendpoint, headers: {"Content-Type": "application/json"}, body: reqbody, json: true})
  }
}

Hub.addAction(new BrazeAction())
