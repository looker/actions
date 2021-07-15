export function sanitizeError(err: any) {
  // Delete redundant properties
  if (err.response && err.response.config && err.config) {
    delete err.response.config
  }

  // Remove headers with sensitive values
  if (err.config && err.config.headers) {
    for (const prop in err.config.headers) {
      if (["developer-token", "Authorization"].includes(prop)) {
        err.config.headers[prop] = "[REDACTED]"
      }
    }
  }

  // Remove data payload - this is hashed but makes the logs unreadable
  if (err.config && err.config.data && err.config.data.operations) {
    err.config.data.operations = "[TRUNCATED]"
  }
  if (err.config && err.config.body) {
    err.config.body = "[TRUNCATED]"
  }
}

export function makeBetterErrorMessage(err: any, webhookId?: string) {
  let apiError: any
  let subError: any
  let errorCode: number | undefined
  let errorName: string | undefined
  let generalMessage: string | undefined
  let detailMessage: string | undefined
  let userListError: string | undefined

  if (err.response && err.response.data && err.response.data.error) {
    apiError = err.response.data.error

    if (apiError === "invalid_grant") {
      errorCode = 400
      errorName = "OAuth Error"
      generalMessage = "Received 'invalid_grant' from authentication server."
        + " This usually means that app access was revoked or the refresh token has expired."
        + " Please re-authenticate to Google Ads via the action form and try again."
    } else {
      errorName = "Ads API Error"
      errorCode = apiError.code ? apiError.code : "[no code]"
      generalMessage = apiError.message ? apiError.message : "[no message]"
    }

    if (Array.isArray(apiError.details) && apiError.details[0] && Array.isArray(apiError.details[0].errors)) {
      subError = apiError.details[0].errors[0]
      if (subError.message) {
        detailMessage = subError.message
      }
      if (subError.errorCode && subError.errorCode.userListError) {
        userListError = subError.errorCode.userListError
      }
    }
  }

  if (userListError === "ADVERTISER_NOT_ON_ALLOWLIST_FOR_USING_UPLOADED_DATA") {
    err.name = ""
    err.message = "The target account is not enabled for data uploads (e.g. Customer Match lists)."
        + " Please visit Audience Manager in the Ads UI for further information."
    return
  }

  if (apiError) {
    err.name = errorName
    err.message = `${errorCode} - ${generalMessage}` + (detailMessage ? ` Details: ${detailMessage}` : "")
  }

  if (webhookId) {
    err.message = err.message + ` (Webhook ID: ${webhookId})`
  }
}
