import * as semver from "semver"
import * as util from "util"
import * as uuid from "uuid"
import * as winston from "winston"
import * as Hub from "../../hub"
import {RudderActionError} from "./rudderstack_error"
const rudder: any = require("@rudderstack/rudder-sdk-node")

interface RudderFields {
  idFieldNames: string[],
  idField?: Hub.Field,
  userIdField?: Hub.Field,
  groupIdField?: Hub.Field,
  emailField?: Hub.Field,
  anonymousIdField?: Hub.Field,
}

export enum RudderTags {
  UserId = "user_id",
  RudderAnonymousId = "rudder_anonymous_id",
  Email = "email",
  RudderGroupId = "rudder_group_id",
}

export enum RudderCalls {
  Identify = "identify",
  Track = "track",
  Group = "group",
}

export class RudderAction extends Hub.Action {

  allowedTags = [RudderTags.Email, RudderTags.UserId, RudderTags.RudderAnonymousId]

  name = "rudder_event"
  label = "Rudder Identify"
  iconName = "rudderstack/rudderstack.png"
  description = "Add traits via identify to your Rudder users."
  params = [
    {
      description: "Looker source write key for Rudder.",
      label: "Rudder Write Key",
      name: "rudder_write_key",
      required: true,
      sensitive: true,
    },
    {
      description: "Give your Rudder server URL",
      label: "Rudder Data Plane URL",
      name: "rudder_server_url",
      required: true,
      sensitive: false,
    },
  ]
  minimumSupportedLookerVersion = "4.20.0"
  supportedActionTypes = [Hub.ActionType.Query]
  usesStreaming = true
  supportedFormattings = [Hub.ActionFormatting.Unformatted]
  supportedVisualizationFormattings = [Hub.ActionVisualizationFormatting.Noapply]
  requiredFields = [{ any_tag: this.allowedTags }]
  executeInOwnProcess = true
  supportedFormats = (request: Hub.ActionRequest) => {
    if (request.lookerVersion && semver.gte(request.lookerVersion, "6.2.0")) {
      return [Hub.ActionFormat.JsonDetailLiteStream]
    } else {
      return [Hub.ActionFormat.JsonDetail]
    }
  }

  async execute(request: Hub.ActionRequest) {
    return this.executeRudder(request, RudderCalls.Identify)
  }

  protected async executeRudder(request: Hub.ActionRequest, rudderCall: RudderCalls) {
    const rudderClient = this.rudderClientFromRequest(request)

    let hiddenFields: string[] = []
    if (request.scheduledPlan &&
        request.scheduledPlan.query &&
        request.scheduledPlan.query.vis_config &&
        request.scheduledPlan.query.vis_config.hidden_fields) {
      hiddenFields = request.scheduledPlan.query.vis_config.hidden_fields
    }

    let rudderFields: RudderFields | undefined
    let fieldset: Hub.Field[] = []
    const errors: Error[] = []

    let timestamp = new Date()
    const context = {
      app: {
        name: "looker/actions",
        version: process.env.APP_VERSION ? process.env.APP_VERSION : "dev",
      },
    }
    const event = request.formParams.event

    try {
      let totalRows = 0
      const totalRequestsCompleted = 0
      await request.streamJsonDetail({
        onFields: (fields) => {
          fieldset = Hub.allFields(fields)
          rudderFields = this.rudderFields(fieldset)
          winston.debug(`[Rudder] fieldset :  ${JSON.stringify(fieldset)}`)
          winston.debug(`[Rudder] RudderFields : ${JSON.stringify(rudderFields)}`)
          this.unassignedRudderFieldsCheck(rudderFields)
        },
        onRanAt: (iso8601string) => {
          if (iso8601string) {
            timestamp = new Date(iso8601string)
          }
        },
        onRow: (row) => {
          totalRows = totalRows + 1
          winston.debug(`[Rudder] row : ${JSON.stringify(row)}`)
          this.unassignedRudderFieldsCheck(rudderFields)
          const payload = {
            ...this.prepareRudderTraitsFromRow(
              row, fieldset, rudderFields!, hiddenFields, rudderCall === RudderCalls.Track),
            ...{event, context, timestamp},
          }
          if (payload.groupId === null) {
            delete payload.groupId
          }
          if (!payload.event) {
            delete payload.event
          }
          try {
            winston.debug("===calling analytics api===")
            rudderClient[rudderCall](payload, /*, () => {
              totalRequestsCompleted = totalRequestsCompleted + 1
              winston.debug(`[Rudder] totalRequestsCompletedOnEvents :  ${totalRequestsCompleted}`)
            }*/)
          } catch (e) {
            errors.push(e)
          }
        },
      })

      await new Promise<void>(async (resolve, reject) => {
          winston.debug("[Rudder] calling explicit flush")
          rudderClient.flush( (err: any) => {
            if (err) {
              winston.error(`[Rudder] error while flush : ${err}`)
              reject(err)
            } else {
              winston.debug("[Rudder] resolve while flush")
              resolve()
            }
          })
      })

      winston.debug(`[Rudder] totalrows : ${totalRows}`)
      winston.debug(`[Rudder] totalRequestsCompletedAfterRowsCompleted : ${totalRequestsCompleted}`)
    } catch (e) {
      winston.error(`[Rudder] error in Rudder action execution : ${e}`)
      errors.push(e)
    }

    if (errors.length > 0) {
      let msg = errors.map((e) => e.message ? e.message : e).join(", ")
      if (msg.length === 0) {
        msg = "An unknown error occurred while processing the Rudder action."
        winston.warn(`[Rudder] Can't format Rudder errors: ${util.inspect(errors)}`)
      }
      winston.error(`[Rudder] total errors : ${msg}`)
      return new Hub.ActionResponse({success: false, message: msg})
    } else {
      winston.debug("[Rudder] no errors in Rudder action execution")
      return new Hub.ActionResponse({success: true})
    }
  }

  protected unassignedRudderFieldsCheck(rudderFields: RudderFields | undefined) {
    if (!(rudderFields && rudderFields.idFieldNames.length > 0)) {
      throw new RudderActionError(`Query requires a field tagged ${this.allowedTags.join(" or ")}.`)
    }
  }

  protected taggedFields(fields: Hub.Field[], tags: string[]) {
    return fields.filter((f) =>
      f.tags && f.tags.length > 0 && f.tags.some((t: string) => tags.indexOf(t) !== -1),
    )
  }

  protected taggedField(fields: any[], tags: string[]): Hub.Field | undefined {
    return this.taggedFields(fields, tags)[0]
  }

  protected rudderFields(fields: Hub.Field[]): RudderFields {
    const idFieldNames = this.taggedFields(fields, [
      RudderTags.Email,
      RudderTags.RudderAnonymousId,
      RudderTags.UserId,
      RudderTags.RudderGroupId,
    ]).map((f: Hub.Field) => (f.name))

    return {
      idFieldNames,
      idField: this.taggedField(fields, [RudderTags.UserId, RudderTags.RudderAnonymousId]),
      userIdField: this.taggedField(fields, [RudderTags.UserId]),
      groupIdField: this.taggedField(fields, [RudderTags.RudderGroupId]),
      emailField: this.taggedField(fields, [RudderTags.Email]),
      anonymousIdField: this.taggedField(fields, [RudderTags.RudderAnonymousId]),
    }
  }

  // Removes JsonDetail Cell metadata and only sends relevant nested data to Rudder
  // See JsonDetail.ts to see structure of a JsonDetail Row
  protected filterJson(jsonRow: any, rudderFields: RudderFields, fieldName: string) {
    const pivotValues: any = {}
    pivotValues[fieldName] = []
    const filterFunction = (currentObject: any, name: string) => {
      const returnVal: any = {}
      if (Object(currentObject) === currentObject) {
        for (const key in currentObject) {
          if (currentObject.hasOwnProperty(key)) {
            if (key === "value") {
              returnVal[name] = currentObject[key]
              return returnVal
            } else if (rudderFields.idFieldNames.indexOf(key) === -1) {
              const res = filterFunction(currentObject[key], key)
              if (res !== {}) {
                pivotValues[fieldName].push(res)
              }
            }
          }
        }
      }
      return returnVal
    }
    filterFunction(jsonRow, fieldName)
    return pivotValues
  }

  protected prepareRudderTraitsFromRow(
    row: Hub.JsonDetail.Row,
    fields: Hub.Field[],
    rudderFields: RudderFields,
    hiddenFields: string[],
    trackCall: boolean,
  ) {
    const traits: { [key: string]: string } = {}
    for (const field of fields) {
      if (rudderFields.idFieldNames.indexOf(field.name) === -1) {
        if (hiddenFields.indexOf(field.name) === -1) {
          let values: any = {}
          if (!row.hasOwnProperty(field.name)) {
            winston.error("[Rudder] Field name does not exist for Rudder action")
            throw new RudderActionError(`Field id ${field.name} does not exist for JsonDetail.Row`)
          }
          if (row[field.name].value) {
            values[field.name] = row[field.name].value
          } else {
            values = this.filterJson(row[field.name], rudderFields, field.name)
          }
          for (const key in values) {
            if (values.hasOwnProperty(key)) {
              traits[key] = values[key]
            }
          }
        }
      }
      if (rudderFields.emailField && field.name === rudderFields.emailField.name) {
        traits.email = row[field.name].value
      }
    }
    let userId: string | null = rudderFields.idField ? row[rudderFields.idField.name].value : null
    if (rudderFields.userIdField) {
      userId = row[rudderFields.userIdField.name].value
    } else {
      userId = null
    }
    let anonymousId: string | null
    if (rudderFields.anonymousIdField) {
      anonymousId = row[rudderFields.anonymousIdField.name].value
    } else {
      anonymousId = userId ? null : this.generateAnonymousId()
    }
    const groupId: string | null = rudderFields.groupIdField ? row[rudderFields.groupIdField.name].value : null

    const dimensionName = trackCall ? "properties" : "traits"

    const rudderRow: any = {
      userId,
      anonymousId,
      groupId,
    }
    rudderRow[dimensionName] = traits
    return rudderRow
  }

  protected rudderClientFromRequest(request: Hub.ActionRequest) {
    return new rudder(request.params.rudder_write_key,  request.params.rudder_server_url)
  }

  protected generateAnonymousId() {
    return uuid.v4()
  }

}

Hub.addAction(new RudderAction())
