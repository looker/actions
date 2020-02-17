import * as nodemailer from "nodemailer"
import * as Hub from "../../hub"

function getMailTransporter(request: Hub.ActionRequest): nodemailer.Transporter {
    const {
        smtpHost,
        smtpPort,
        smtpFrom,
        smtpUser,
        smtpPass,
        user_email,
    } = request.params

    if (!smtpHost) {
        throw new Error("Missing request.params.smtpHost")
    }
    if (!smtpPort) {
        throw new Error("Missing request.params.smtpPort")
    }
    if (!smtpFrom) {
        throw new Error("Missing request.params.smtpFrom")
    }
    if (!smtpUser) {
        throw new Error("Missing request.params.smtpUser")
    }
    if (!smtpPass) {
        throw new Error("Missing request.params.smtpPass")
    }
    if (!user_email) {
        throw new Error("Missing request.params.user_email")
    }

    const transport: any = {
        host: smtpHost,
        port: smtpPort,
        secure: true,
        auth: {
            user: smtpUser,
            pass: smtpPass,
        },
    }
    const defaults: any = {
        from: smtpFrom,
        to: user_email,
    }

    const transporter = nodemailer.createTransport(transport, defaults)

    return transporter
}

interface JobStatusNotificationParams {
    action: string
    status: string
    resource?: string
    message?: string
}

export async function notifyJobStatus(request: Hub.ActionRequest, data: JobStatusNotificationParams) {
    const transporter = getMailTransporter(request)
    const jobNotCompleteWithinPollingWindow = data.status === "INCOMPLETE"
    const jobSucceeded = data.status === "ACTIVE"

    let subject = `${data.action} completed successfully`
    let text = `${data.resource} is now available for use.`

    if (jobNotCompleteWithinPollingWindow) {
        subject = `${data.action} creation in progress`
        text = `${data.resource} creation still in progress.
        Please check AWS console for job status.`

    } else if (!jobSucceeded) {
        subject = `${data.action} failed`
        text = `${data.resource ? `${data.resource} could not be created.` : ""} Reason: ${data.message}`
    }

    return transporter.sendMail({ subject, text })
}
