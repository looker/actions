import * as req from "request-promise-native"
import { URL } from "url"

import * as Hub from "../../hub"

enum BrazeConfig {
  EXPORT_PATH = "/users/track",
  LOOKER_ATTRIBUTE_NAME = "looker_export",
  MAX_LINES = 75,
  BRAZE_ID_TAG = "braze_id",
  BRAZE_ATTRIBUTE_REGEX = "(?<=braze\\[)(.*)(?=\\])",
  EXPORT_DEFAULT_VALUE = "LOOKER_EXPORT",
  MAX_EXPORT = 100000,
  DEFAULT_DOMAIN_REGEX = "^https?\:\/\/(.*)\\.braze\\.(com|eu)$",
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

interface BrazeTags {
  [key: string]: any
}

function isEmpty(obj: any) {
  return !obj || Object.keys(obj).length === 0
}

export class BrazeAction extends Hub.Action {
  name = "braze"
  label = "Braze"
  description = "Flags users from Looker to Braze via the REST API for use with segmentation. "
    + "Ensure there's a '" + BrazeConfig.BRAZE_ID_TAG + "' field tagged in the results."
    + " MAX EXPORT: " + BrazeConfig.MAX_EXPORT + "."
  iconName = "braze/braze.svg"
  supportedActionTypes = [Hub.ActionType.Query]
  supportedVisualizationFormattings = [Hub.ActionVisualizationFormatting.Noapply]
  supportedFormattings = [Hub.ActionFormatting.Unformatted]
  requiredFields = [{ tag: String(BrazeConfig.BRAZE_ID_TAG) }]
  usesStreaming = true
  executeInOwnProcess = true
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

    if (!(request.params.braze_api_endpoint )) {
      throw "Missing Endpoint."
    }

    // Generate endpoint
    const endpoint = request.params.braze_api_endpoint.trim()
      .replace("http://", "https://").replace(/\/$/, "") + BrazeConfig.EXPORT_PATH

    if (!endpoint.startsWith("http") ) {
      throw "Missing Protocol for endpoint."
    }

    const bzDomainRegex = new RegExp(BrazeConfig.DEFAULT_DOMAIN_REGEX, "gi")
    if (!(request.params.braze_api_endpoint.toLowerCase().match(bzDomainRegex))) {
      throw "Bad Endpoint."
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
    const bzAttributeFields: BrazeTags[] = []
    let rows: BrazeApiRow[] = []
    const bzRegExp = new RegExp(BrazeConfig.BRAZE_ATTRIBUTE_REGEX, "gi")
    try {
      await request.streamJsonDetail({
        onFields: (fields) => {
          fieldlist = Hub.allFields(fields)
          for (const field of fieldlist) {
            if (!field.tags) {
              continue
            }
            if (field.tags.find((tag: string) => tag === BrazeConfig.BRAZE_ID_TAG )) {
              bzIdField = field.name
            }
            for (const tag of field.tags) {
              const bzTagMatches = tag.match(bzRegExp)
              if (bzTagMatches) {
                  bzAttributeFields.push([bzTagMatches[0], field.name])
              }
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
            for (const bzAttribute of bzAttributeFields) {
              entry[bzAttribute[0]] = row[bzAttribute[1]].value
            }
            entry[String(BrazeConfig.LOOKER_ATTRIBUTE_NAME)] = brazeAttribute
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
        await this.sendChunk(endpoint, brazeApiKey, rows)
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
    const urlendpoint = new URL(endpoint)
    const reqbody: BrazeApiBody = {
      api_key: apiKey,
      attributes: chunk,
    }
    await req.post({
      uri: urlendpoint.toString(), headers: {"Content-Type": "application/json"},
      body: reqbody, json: true})
      .promise()
  }
}

Hub.addAction(new BrazeAction())
