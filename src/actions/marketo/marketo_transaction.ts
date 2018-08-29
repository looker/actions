/* tslint:disable no-console */
import * as Hub from "../../hub"

const MARKETO: any = require("node-marketo-rest")

const numLeadsAllowedPerCall = 100

function logJson(label: string, object: any) {
  console.log("\n================================")
  console.log(`${label}:\n`)
  const json = `${JSON.stringify(object)}\n\n`
  console.log(json)
}

export default class MarketoTransaction {

  private static chunkify(toChunk: any[], chunkSize: number) {
    const arrays = []
    while (toChunk.length > 0) {
      arrays.push(toChunk.splice(0, chunkSize))
    }
    return arrays
  }

  // rows: Hub.JsonDetail.Row[] = []
  // queue: Promise<any>[] = []
  // fieldMap: any
  marketo: any
  // lookupField ? = ""

  async handleRequest(request: Hub.ActionRequest): Promise<Hub.ActionResponse> {

    if (!(request.attachment && request.attachment.dataJSON)) {
      throw "No attached json."
    }

    const campaignID = request.formParams.campaignID
    if (!campaignID) {
      throw "Missing Campaign ID."
    }

    const requestJSON = request.attachment.dataJSON
    if (!requestJSON.fields || !requestJSON.data) {
      throw "Request payload is an invalid format."
    }

    const fieldMap = this.getFieldMap(Hub.allFields(requestJSON.fields))

    // determine if lookupField is present in fields
    const lookupField = request.formParams.lookupField
    if (
      ! lookupField
      || ! Object.keys(fieldMap).find((name) => fieldMap[name].indexOf(lookupField) !== -1)
    ) {
      throw "Marketo Lookup Field for lead not present in query."
    }

    this.marketo = this.marketoClientFromRequest(request)
    const rows: Hub.JsonDetail.Row[] = []

    let counter = 0
    const min = 0
    const max = min + numLeadsAllowedPerCall

    await request.streamJsonDetail({
      // onFields: (fields) => {
      //   console.log("onFields", fields)
      //   // build fieldMap for getLeadtFromRow to refer to?
      //   // for now constructing it above from requestJSON.fields
      //   // instead of here, cuz we need it to valid the form input
      // },
      // onRanAt: (iso8601string) => {
      //   console.log("onRanAt", iso8601string)
      // },
      onRow: (row) => {
        counter++
        if (counter < min) {
          return
        }
        if (counter >= max) {
          return
        }

        // add the row to our row queue
        rows.push(row)
      },
    })

    const leadList = this.getLeadList(fieldMap, rows)
    const chunks = MarketoTransaction.chunkify(leadList, numLeadsAllowedPerCall)
    const result = await this.sendChunks(chunks, lookupField, campaignID)
    if (! result) { console.log("no result?") }

    console.log("all done")
    // logJson("result", result)

    return new Hub.ActionResponse({ success: true })
  }

  async sendChunks(chunks: any[][], lookupField: string, campaignID: string) {

    const results: any[] = []
    for (const chunk of chunks) {
      await this.sendChunk(chunk, lookupField, campaignID)
      const result: any = await this.sendChunk(chunk, lookupField, campaignID)
      results.push(result)
      Object.keys(result).forEach((key: string) => {
        logJson(key, result[key])
      })
    }
    return results

  }

  async sendChunk(chunk: any[], lookupField: string, campaignID: string) {
    console.log("sendChunk")
    if (! campaignID) { return }
    // console.log("leadList", leadList)
    // TODO wrap Marketo API in a promise that resolves with { success: [], failed: [] }

    const skipped: any[] = []
    const ids: any[] = []
    let leadErrors: any[] = []
    let campaignErrors: any[] = []
    try {
      const leadResponse = await this.marketo.lead.createOrUpdate(chunk, { lookupField })
      logJson("response", leadResponse)

      if (Array.isArray(leadResponse.errors)) {
        leadErrors = leadErrors.concat(leadResponse.errors)
      }

      leadResponse.result.forEach((record: any, i: number) => {
        if (record.id) {
          ids.push(record.id)
        } else {
          chunk[i].result = record
          skipped.push(chunk[i])
        }
      })

      const campaignResponse = await this.marketo.campaign.request(campaignID, ids)
      logJson("campaignResponse", campaignResponse)

      if (Array.isArray(campaignResponse.errors)) {
        campaignErrors = campaignErrors.concat(campaignResponse.errors)
      }

    } catch (err) {
      console.error(err)
      // errors.push(err)
    }

    return {
      ids,
      skipped,
      leadErrors,
      campaignErrors,
    }
  }

  //   // // Push leads into Marketo and affiliate with a campaign
  //   // const chunked = MarketoAction.chunkify(leadList, numLeadsAllowedPerCall)
  //   // const marketoClient = this.marketoClientFromRequest(request)
  //   // const errors: {message: string}[] = []

  //   // for (const chunk of chunked) {
  //   //   try {
  //   //     const leadResponse = await marketoClient.lead.createOrUpdate(chunk, {lookupField})
  //   //     if (leadResponse.success && leadResponse.success === false) {
  //   //       errors.concat(leadResponse.errors)
  //   //       break
  //   //     }
  //   //     const justIDs = leadResponse.result.filter((lead: {id: any}) => lead.id !== null)
  //   //       .map((lead: {id: any}) => ({ id: lead.id }))
  //   //     const campaignResponse = await marketoClient.campaign.request(request.formParams.campaignID, justIDs)
  //   //     if (campaignResponse.success && campaignResponse.success === false) {
  //   //       errors.concat(campaignResponse.errors)
  //   //       break
  //   //     }
  //   //   } catch (e) {
  //   //     errors.push(e)
  //   //   }
  //   // }

  //   // if (errors.length > 0) {
  //   //   return new Hub.ActionResponse({
  //   //     success: false,
  //   //     message: errors.map((e) => e.message).join(", "),
  //   //   })
  //   // } else {
  //   return new Hub.ActionResponse({ success: true })
  //   // }
  // }

  private getFieldMap(fields: Hub.Field[]) {
    // Map the looker columns to the Marketo columns using tags
    const fieldMap: {[name: string]: string[]} = {}
    let hasTagMap: string[] = []
    for (const field of fields) {
      if (field.tags && field.tags.find((tag: string) => tag.startsWith("marketo:"))) {
        hasTagMap = field.tags.filter((tag) => tag.startsWith("marketo:"))
          .map((tag) => tag.split("marketo:")[1])
        fieldMap[field.name] = hasTagMap
      }
    }
    return fieldMap
  }

  private getLeadList(fieldMap: {[key: string]: string[]}, rows: Hub.JsonDetail.Row[]) {
    // Create the list of leads to be sent
    const leadList: {[name: string]: any}[] = []
    for (const leadRow of rows) {
      const singleLead: {[name: string]: any} = {}
      for (const field of Object.keys(fieldMap)) {
        for (const tag of fieldMap[field]) {
          singleLead[tag] = leadRow[field].value
        }
      }
      leadList.push(singleLead)
    }
    return leadList
  }

  private marketoClientFromRequest(request: Hub.ActionRequest) {
    return new MARKETO({
      endpoint: `${request.params.url}/rest`,
      identity: `${request.params.url}/identity`,
      clientId: request.params.clientID,
      clientSecret: request.params.clientSecret,
    })
  }

}
