import * as Hub from "../../../../hub"

import * as parse from "csv-parse"
import {Credentials} from "google-auth-library"
import {drive_v3, google, sheets_v4} from "googleapis"
import {GaxiosPromise} from "googleapis-common"
import * as winston from "winston"
import Drive = drive_v3.Drive
import Sheet = sheets_v4.Sheets
import {GoogleDriveAction} from "../google_drive"

const MAX_REQUEST_BATCH = 4096
const MAX_ROW_BUFFER_INCREASE = 4000
const MAX_RETRY_COUNT = 5

export class GoogleSheetsAction extends GoogleDriveAction {
    name = "google_sheets"
    label = "Google Sheets"
    iconName = "google/drive/sheets/sheets.svg"
    description = "Create a new Google Sheet."
    supportedActionTypes = [Hub.ActionType.Query]
    supportedFormats = [Hub.ActionFormat.Csv]
    executeInOwnProcess = true
    mimeType = "application/vnd.google-apps.spreadsheet"

    async execute(request: Hub.ActionRequest) {
        const resp = new Hub.ActionResponse()

        if (!request.params.state_json) {
            resp.success = false
            resp.state = new Hub.ActionState()
            resp.state.data = "reset"
            return resp
        }

        const stateJson = JSON.parse(request.params.state_json)
        if (stateJson.tokens && stateJson.redirect) {
            const drive = await this.driveClientFromRequest(stateJson.redirect, stateJson.tokens)

            let filename = request.formParams.filename || request.suggestedFilename()
            if (!filename) {
                resp.success = false
                resp.message = "Error creating filename"
                return resp
            } else if (!filename.match(/\.csv$/)) {
                filename = filename.concat(".csv")
            }
            try {
                if (request.formParams.overwrite === "yes") {
                    const sheet = await this.sheetsClientFromRequest(stateJson.redirect, stateJson.tokens)
                    await this.sendOverwriteData(filename, request, drive, sheet)
                    resp.success = true
                } else {
                    await this.sendData(filename, request, drive)
                    resp.success = true
                }
            } catch (e) {
                winston.error(`Failed execute for Google Sheets.`, {webhookId: request.webhookId})
                resp.success = false
                resp.message = e.message
            }
        } else {
            resp.success = false
            resp.state = new Hub.ActionState()
            resp.state.data = "reset"
        }
        return resp
    }

    async form(request: Hub.ActionRequest) {
        const form = await super.form(request)
        if (form.fields[0].type !== "oauth_link_google") {
            form.fields.push({
                description: "Should this action attempt to overwrite an existing file",
                label: "Overwrite Existing Files",
                name: "overwrite",
                options: [{name: "yes", label: "Yes"}, {name: "no", label: "No"}],
                default: "yes",
                required: true,
                type: "select",
            })
        }
        return form
    }

    async oauthUrl(redirectUri: string, encryptedState: string) {
        const oauth2Client = this.oauth2Client(redirectUri)

        // generate a url that asks permissions for Google Drive scope
        const scopes = [
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive",
        ]

        const url = oauth2Client.generateAuthUrl({
            access_type: "offline",
            scope: scopes,
            prompt: "consent",
            state: encryptedState,
        })
        return url.toString()
    }

    async sendOverwriteData(filename: string, request: Hub.ActionRequest, drive: Drive, sheet: Sheet) {
        const parents = request.formParams.folder ? [request.formParams.folder] : undefined

        const options: any = {
            q: `name = '${filename}' and '${parents}' in parents and trashed=false`,
            fields: "files",
        }

        if (request.formParams.drive !== undefined && request.formParams.drive !== "mydrive") {
            options.driveId = request.formParams.drive
            options.includeItemsFromAllDrives = true
            options.supportsAllDrives = true
            options.corpora = "drive"
        } else {
            options.corpora = "user"
        }

        const files = await drive.files.list(options)
        if (files.data.files === undefined || files.data.files.length === 0) {
            winston.info(`New file: ${filename}`)
            return this.sendData(filename, request, drive)
        }
        if (files.data.files[0].id === undefined) {
            throw "No spreadsheet ID"
        }
        const spreadsheetId = files.data.files[0].id as string

        const sheets = await sheet.spreadsheets.get({spreadsheetId})
        if (!sheets.data.sheets || sheets.data.sheets[0].properties === undefined) {
            throw "Now sheet data available"
        }
        // The ignore is here because Typescript is not correctly inferring that I have done existence checks
        // @ts-ignore
        const sheetId = sheets.data.sheets[0].properties.sheetId as number
        // @ts-ignore
        let maxRows = sheets.data.sheets[0].properties.gridProperties.rowCount as number

        const requestBody: sheets_v4.Schema$BatchUpdateSpreadsheetRequest = {requests: []}
        let rowCount = 0
        let finished = false

        return request.stream(async (readable) => {
            return new Promise<void>(async (resolve, reject) => {
                const csvparser = parse({rtrim: true, ltrim: true, bom: true})
                // This will not clear formulas or protected regions
                await this.clearSheet(spreadsheetId, sheet, sheetId)
                csvparser.on("data",  (line: any) => {
                    const rowIndex: number = rowCount++
                    // Sanitize line data and properly encapsulate string formatting for CSV lines
                    const lineData = line.map((record: string) => {
                        record = record.replace(/\"/g, "\"\"")
                        return `"${record}"`
                    }).join(",") as string
                    // @ts-ignore
                    requestBody.requests.push({
                        pasteData: {
                            coordinate: {
                                sheetId,
                                columnIndex: 0,
                                rowIndex,
                            },
                            data: lineData,
                            delimiter: ",",
                            type: "PASTE_NORMAL",
                        },
                    })
                    // @ts-ignore
                    if (requestBody.requests.length > MAX_REQUEST_BATCH) {
                        const requestCopy: sheets_v4.Schema$BatchUpdateSpreadsheetRequest = {}
                        // Make sure to do a deep copy of the request
                        Object.assign(requestCopy, requestBody)
                        requestBody.requests = []
                        if (rowCount >= maxRows) {
                            // Make sure we grow at least by requestlength.
                            // Add MAX_ROW_BUFFER_INCREASE in addition to give headroom for more requests before
                            // having to resize again
                            const requestLen = requestCopy.requests ? requestCopy.requests.length : 0
                            winston.info(`Expanding max rows: ${maxRows} to ` +
                              `${maxRows + requestLen + MAX_ROW_BUFFER_INCREASE}`, request.webhookId)
                            maxRows = maxRows + requestLen + MAX_ROW_BUFFER_INCREASE
                            sheet.spreadsheets.batchUpdate({
                                spreadsheetId,
                                requestBody: {
                                    requests: [{
                                        updateSheetProperties: {
                                            properties: {
                                                sheetId,
                                                gridProperties: {
                                                    rowCount: maxRows,
                                                },
                                            },
                                            fields: "gridProperties(rowCount)",
                                        },
                                    }],
                                },
                            }).catch((e: any) => {
                                reject(e)
                            })
                        }
                        this.flush(requestCopy, sheet, spreadsheetId, request.webhookId!).catch((e: any) => {
                            winston.error(e, {webhookId: request.webhookId})
                            reject(e)
                        })
                    }
                }).on("end", () => {
                    finished = true
                    // @ts-ignore
                    if (requestBody.requests.length > 0) {
                        this.flush(requestBody, sheet, spreadsheetId, request.webhookId!).catch((e: any) => {
                            reject(e)
                        }).then(() => {
                            winston.info(`Google Sheets Streamed ${rowCount} rows including headers`,
                                {webhookId: request.webhookId})
                            resolve()
                        }).catch((e) => {
                            winston.warn("End flush failed.",
                                {webhookId: request.webhookId})
                            reject(e)
                        })
                    }
                }).on("error", (e: any) => {
                    winston.error(e, {webhookId: request.webhookId})
                    reject(e)
                }).on("close", () => {
                    if (!finished) {
                        winston.warn(`Google Sheets Streaming closed socket before "end" event stream.`,
                            {webhookId: request.webhookId})
                        reject(`"end" event not called before finishing stream`)
                    }
                })
                readable.pipe(csvparser)
            })
            })
    }

    async clearSheet(spreadsheetId: string, sheet: Sheet, sheetId: number):
        GaxiosPromise<sheets_v4.Schema$ClearValuesResponse>  {
        return sheet.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
                requests: [
                    {
                      updateCells: {
                        range: {
                          sheetId,
                        },
                        fields: "userEnteredValue",
                      },
                    },
                  ],
            },
        })
    }

    async flush(buffer: sheets_v4.Schema$BatchUpdateSpreadsheetRequest,
                sheet: Sheet, spreadsheetId: string, webhookId: string) {
        return sheet.spreadsheets.batchUpdate({ spreadsheetId, requestBody: buffer}).catch((e: any) => {
            winston.info(`Flush error: ${e}`, {webhookId})
            if (e.code === 429 && process.env.GOOGLE_SHEET_RETRY) {
                winston.warn("Queueing retry", {webhookId})
                return this.flushRetry(buffer, sheet, spreadsheetId)
            }
        })
    }

    async flushRetry(buffer: sheets_v4.Schema$BatchUpdateSpreadsheetRequest, sheet: Sheet, spreadsheetId: string) {
        let retrySuccess = false
        let retryCount = 1
        while (!retrySuccess && retryCount <= MAX_RETRY_COUNT) {
            retrySuccess = true
            await this.delay((3 ** retryCount) * 1000)
            try {
                return await sheet.spreadsheets.batchUpdate({ spreadsheetId, requestBody: buffer})
            } catch (e) {
                retrySuccess = false
                if (e.code === 429) {
                    winston.warn(`Retry number ${retryCount} failed`)
                    winston.info(e)
                } else {
                    throw e
                }
                retryCount++
            }
        }
        winston.warn("All retries failed")
    }

    protected async delay(time: number) {
        await new Promise<void>((resolve) => {
            setTimeout(resolve, time)
        })
    }

    protected async sheetsClientFromRequest(redirect: string, tokens: Credentials) {
        const client = this.oauth2Client(redirect)
        client.setCredentials(tokens)
        return google.sheets({version: "v4", auth: client})
    }
}

if (process.env.GOOGLE_SHEET_CLIENT_ID && process.env.GOOGLE_SHEET_CLIENT_SECRET) {
  Hub.addAction(new GoogleSheetsAction())
}
