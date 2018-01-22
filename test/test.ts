import * as chai from "chai"
import * as chaiAsPromised from "chai-as-promised"
import * as sinonChai from "sinon-chai"
import * as winston from "winston"

const chaiHttp = require("chai-http")

chai.use(chaiHttp)
chai.use(sinonChai)
chai.use(chaiAsPromised) // should be last
winston.remove(winston.transports.Console)

import "../src/actions/index"

import "./test_server"
import "./test_smoke"

import "../src/actions/airtable/test_airtable"
import "../src/actions/amazon/test_amazon_ec2"
import "../src/actions/amazon/test_amazon_s3"
import "../src/actions/azure/test_azure_storage"
import "../src/actions/digitalocean/test_digitalocean_droplet"
import "../src/actions/digitalocean/test_digitalocean_object_storage"
import "../src/actions/hipchat/test_hipchat"
import "../src/actions/jira/test_jira"
import "../src/actions/looker/test_looker_dashboard_api"
import "../src/actions/segment/test_segment"
import "../src/actions/sendgrid/test_sendgrid"
import "../src/actions/sftp/test_sftp"
import "../src/actions/slack/test_slack"
import "../src/actions/tray/test_tray"
import "../src/actions/twilio/test_twilio"
import "../src/actions/twilio/test_twilio_message"
import "../src/actions/webhook/test_webhook"
import "../src/actions/zapier/test_zapier"

import { DebugAction } from "../src/actions/debug/debug"
import * as Hub from "../src/hub"

// Ensure the special debug action is tested
Hub.addAction(new DebugAction())
