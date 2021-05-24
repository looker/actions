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

import "./test_action_request"
import "./test_action_response"
import "./test_actions"
import "./test_json_detail_stream"
import "./test_server"
import "./test_smoke"

import "../src/actions/airtable/test_airtable"
import "../src/actions/amazon/test_amazon_ec2"
import "../src/actions/amazon/test_amazon_s3"
import "../src/actions/auger/test_auger_train"
import "../src/actions/azure/test_azure_storage"
import "../src/actions/braze/test_braze"
import "../src/actions/datarobot/test_datarobot"
import "../src/actions/digitalocean/test_digitalocean_droplet"
import "../src/actions/digitalocean/test_digitalocean_object_storage"
import "../src/actions/dropbox/test_dropbox"
import "../src/actions/google/analytics/test_data_import"
import "../src/actions/google/drive/sheets/test_google_sheets"
import "../src/actions/google/drive/test_google_drive"
import "../src/actions/google/gcs/test_google_cloud_storage"
import "../src/actions/hubspot/test_hubspot_companies"
import "../src/actions/hubspot/test_hubspot_contacts"
import "../src/actions/jira/test_jira"
import "../src/actions/kloudio/test_kloudio"
import "../src/actions/marketo/test_marketo"
import "../src/actions/mparticle/test_mparticle"
import "../src/actions/queueaction/test_queue_action"
import "../src/actions/rudderstack/test_rudderstack"
import "../src/actions/rudderstack/test_rudderstack_group"
import "../src/actions/rudderstack/test_rudderstack_track"
import "../src/actions/sagemaker/test_sagemaker_infer"
import "../src/actions/sagemaker/test_sagemaker_train_linearlearner"
import "../src/actions/sagemaker/test_sagemaker_train_xgboost"
import "../src/actions/segment/test_segment"
import "../src/actions/segment/test_segment_group"
import "../src/actions/segment/test_segment_track"
import "../src/actions/sendgrid/test_sendgrid"
import "../src/actions/sftp/test_sftp"
import "../src/actions/slack/legacy_slack/test_slack.ts"
import "../src/actions/slack/test_slack"
import "../src/actions/slack/test_utils"
import "../src/actions/teams/test_teams"
import "../src/actions/tray/test_tray"
import "../src/actions/twilio/test_twilio"
import "../src/actions/twilio/test_twilio_message"
import "../src/actions/webhook/test_webhook"
import "../src/actions/zapier/test_zapier"

import { DebugAction } from "../src/actions/debug/debug"
import * as Hub from "../src/hub"

// Ensure the special debug action is tested
Hub.addAction(new DebugAction())
