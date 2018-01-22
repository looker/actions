# Looker Dashboard API Integration
## Create PDFs of Looker Dashboard and send in email via SendGrid.

The Looker Dashboard API integration allows send a Look with a list of dashboards (tagged `looker_dashboard_url` in LookML), create PDFs of all dashboards and send in an email via SendGrid.

The integration requires you to enable the [Looker API](https://docs.looker.com/reference/api-and-integration/api-getting-started) and to pass [authentication](https://docs.looker.com/reference/api-and-integration/api-auth) to the action hub. You will need to [Setup an API key](https://github.com/looker/looker-sdk-ruby/blob/master/authentication.md#setup-an-api-key) for a user on your Looker instance.

1. Looker API URL

You'll be asked to pass a base Looker API Url
(e.g. a Looker API URL with the default port: `https://<your-looker-host-name>:19999/api/3.0`).


2. Looker API credentials (client and secret)

You'll need to pass the credentials for user on your Looker instance. Admins can create an API 3 key for a user on looker's user edit page.

All requests made using these credentials are made 'as' that user and limited to the role permissions specified for that user.

3. SendGrid API Key

This action uses [SendGrid](https://sendgrid.com/) for email delivery and the [authentication required](../sendgrid/README.md).

4. Enable the Looker Dashboard API Action in your looker Administration page for integrations (/admin/actions).