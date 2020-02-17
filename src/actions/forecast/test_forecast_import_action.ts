import { expect } from "chai"
import * as sinon from "sinon"

import * as Hub from "../../hub"

import { ForecastDataImportAction } from "./forecast_import_action"
import * as mailTransporter from "./mail_transporter"
import * as upload from "./s3_upload"

const action = new ForecastDataImportAction()

describe(`${action.constructor.name} unit tests`, () => {
  const validParams = {
    accessKeyId: "mykey",
    secretAccessKey: "mysecret",
    region: "my-region",
    roleArn: "my-role-arn",
    bucketName: "my-bucket-name",
    user_email: "user@mail.com",
    smtpHost: "smtpHost",
    smtpPort: "smtpPort",
    smtpFrom: "smtpFrom",
    smtpUser: "smtpUser",
    smtpPass: "smtpPass",
  }

  const validFormParams = {
    datasetName: "my_dataset",
    datasetGroupArn: "",
    forecastingDomain: "CUSTOM",
    dataFrequency: "D",
    datasetType: "TARGET_TIME_SERIES",
    bucketName: "my-bucket-name",
    datasetSchema: JSON.stringify({
      Attributes: [
        {
          AttributeName: "timestamp",
          AttributeType: "timestamp",
        },
        {
          AttributeName: "item_id",
          AttributeType: "string",
        },
        {
          AttributeName: "target_value",
          AttributeType: "float",
        },
      ],
    }, null, 2),
    timestampFormat: "yyyy-MM-dd",
  }

  const csvData = "a,b,c,d\n1,2,3,4\n5,6,7,8\n"

  function createValidRequest() {
    const request = new Hub.ActionRequest()
    request.params = validParams
    request.formParams = validFormParams
    request.attachment = {}
    request.attachment.dataBuffer = Buffer.from(csvData, "utf8")
    request.scheduledPlan = {
      query: {
        fields: [
          "field1",
          "field2",
          "field3",
          "field4",
        ],
      },
    } as any
    request.type = Hub.ActionType.Query
    return request
  }

  describe("action", () => {
    describe("with invalid parameters", () => {
      let stubMailer: sinon.SinonStub
      beforeEach(() => {
        stubMailer = sinon.stub(mailTransporter as any, "notifyJobStatus")
      })
      afterEach(() => stubMailer.restore())

      function testMissingParam(param: string, value?: any|undefined) {
        it(`if ${param} is ${value}, deliver failure notification`, async () => {
          const request = createValidRequest()
          request.formParams = { ...validFormParams, [param]: value }

          await action.execute(request)
          expect(stubMailer.getCall(0).args[1]).to.deep.equal({
            action: "Amazon Forecast: Data Import",
            status: "Error",
            message: `Missing ${param}`,
          })
        })
      }

      testMissingParam("datasetName")
      testMissingParam("forecastingDomain")
      testMissingParam("dataFrequency")
      testMissingParam("datasetType")
      testMissingParam("datasetSchema")
      testMissingParam("timestampFormat")
      testMissingParam("bucketName")
    })
    describe("with valid parameters", () => {
      let forecastClientStub: sinon.SinonStub
      let s3ClientStub: sinon.SinonStub
      let stubMailer: sinon.SinonStub
      let createDatasetSpy: sinon.SinonSpy
      let createDatasetGroupSpy: sinon.SinonSpy
      let createDatasetImportJobSpy: sinon.SinonSpy
      let describeDatasetImportJobSpy: sinon.SinonSpy
      let updateDatasetGroupSpy: sinon.SinonSpy

      beforeEach(() => {
        createDatasetSpy = sinon.spy(() => ({
          promise: async () => new Promise<any>((resolve) => resolve({
            DatasetArn: "dataset_abc123",
          })),
        }))

        createDatasetGroupSpy = sinon.spy(() => ({
          promise: async () => new Promise<any>((resolve) => resolve({
            DatasetGroupArn: "datasetgroup_abc123",
          })),
        }))

        createDatasetImportJobSpy = sinon.spy(() => ({
          promise: async () => new Promise<any>((resolve) => resolve({
            DatasetImportJobArn: "datasetimportjob_abc123",
          })),
        }))

        describeDatasetImportJobSpy = sinon.spy(() => ({
          promise: async () => new Promise<any>((resolve) => resolve({
            Status: "ACTIVE",
          })),
        }))

        updateDatasetGroupSpy = sinon.spy(() => ({
          promise: async () => new Promise<any>((resolve) => resolve({})),
        }))

        forecastClientStub = sinon.stub(action as any, "forecastServiceFromRequest")
        .callsFake(() => ({
          createDataset: createDatasetSpy,
          createDatasetGroup: createDatasetGroupSpy,
          createDatasetImportJob: createDatasetImportJobSpy,
          describeDatasetImportJob: describeDatasetImportJobSpy,
          updateDatasetGroup: updateDatasetGroupSpy,
        }))

        s3ClientStub = sinon.stub(upload, "uploadToS3").returns(Promise.resolve())
        stubMailer = sinon.stub(mailTransporter as any, "notifyJobStatus")
      })

      afterEach(() => {
        forecastClientStub.restore()
        s3ClientStub.restore()
        stubMailer.restore()
      })

      it("should upload data to s3", (done) => {
        const request = createValidRequest()
        expect(action.validateAndExecute(request))
          .to.be.fulfilled
          .then((_result) => {
            expect(s3ClientStub.callCount).to.equal(1)
            done()
          })
      })

      it("should return successfully from execute", (done) => {
        const request = createValidRequest()
        expect(action.execute(request))
        .to.be.fulfilled.then(() => done())
      })

      it("should create dataset", (done) => {
        const request = createValidRequest()
        expect((action as any).startForecastImport(request))
          .to.be.fulfilled
          .then((_result) => {
            expect(createDatasetSpy.callCount).to.equal(1)
            done()
          })
      })

      it("should create dataset group if none is selected", (done) => {
        const request = createValidRequest()
        expect((action as any).startForecastImport(request))
          .to.be.fulfilled
          .then((_result) => {
            expect(createDatasetGroupSpy.callCount).to.equal(1)
            done()
          })
      })

      it("should use existing dataset group if one is selected", (done) => {
        const request = createValidRequest()
        request.formParams.datasetGroupArn = "existing_dsg_arn"
        expect((action as any).startForecastImport(request))
          .to.be.fulfilled
          .then((_result) => {
            expect(updateDatasetGroupSpy.callCount).to.equal(1)
            done()
          })
      })

      it("should create dataset import job", (done) => {
        const request = createValidRequest()
        expect((action as any).startForecastImport(request))
          .to.be.fulfilled
          .then((_result) => {
            expect(createDatasetImportJobSpy.callCount).to.equal(1)
            done()
          })
      })

      it("should poll until dataset import job complete", (done) => {
        const request = createValidRequest()
        expect((action as any).startForecastImport(request))
          .to.be.fulfilled
          .then((_result) => {
            expect(describeDatasetImportJobSpy.callCount).to.equal(1)
            done()
          })
      })

      it("should send an email on action success", (done) => {
        const request = createValidRequest()
        expect((action as any).startForecastImport(request))
          .to.be.fulfilled
          .then((_result) => {
            expect(stubMailer.getCall(0).args[1]).to.deep.equal({
              action: "Amazon Forecast: Data Import",
              status: "ACTIVE",
              resource: "my_dataset",
              message: undefined,
            })
            done()
          })
      })
    })
  })

  describe("form", () => {
    it("has form", () => {
      expect(action.hasForm).to.be.true
    })
    it("has form with correct fields", (done) => {
      // stub aws clients
      const forecastClientStub = sinon.stub(action as any, "forecastServiceFromRequest")
      .callsFake(() => ({
        listDatasetGroups: () => ({
          promise: async () => new Promise<any>((resolve) => resolve({
            DatasetGroups: [
              { DatasetGroupArn: "arn1", DatasetGroupName: "name1" },
              { DatasetGroupArn: "arn2", DatasetGroupName: "name2" },
            ],
          })),
        }),
      }))

      const s3ClientStub = sinon.stub(action as any, "s3ClientFromRequest")
      .callsFake(() => ({
        listBuckets: () => ({
          promise: async () => new Promise<any>((resolve) => resolve({
            Buckets: [
              { Name: "bucket1" },
              { Name: "bucket2" },
            ],
          })),
        }),
      }))

      // build params map
      const request = new Hub.ActionRequest()
      request.params = validParams

      const form = action.validateAndFetchForm(request)

      const expected = {
        fields: [
          {
            label: "Dataset name",
            name: "datasetName",
            required: true,
            type: "string",
            description: "The dataset name must have 1 to 63 characters. Valid characters: a-z, A-Z, 0-9, and _",
          },
          {
            label: "Data Import Bucket",
            name: "bucketName",
            required: true,
            type: "select",
            description: "Choose a bucket your Looker data will be imported to for Forecast to access",
            options: [
              { name: "bucket1", label: "bucket1" },
              { name: "bucket2", label: "bucket2" },
            ],
          },
          {
            label: "Dataset group",
            name: "datasetGroupArn",
            required: true,
            type: "select",
            description: "Choose an existing dataset group for this dataset, or create a new one",
            options: [
              { name: "", label: "New Group" },
              { name: "arn1", label: "name1" },
              { name: "arn2", label: "name2" },
            ],
          },
          {
            label: "Forecasting domain",
            name: "forecastingDomain",
            required: true,
            type: "select",
            description: "Domain defines the forecasting use case. Choose CUSTOM if no other option applies",
            options: [
              { name: "RETAIL", label: "RETAIL" },
              { name: "CUSTOM", label: "CUSTOM" },
              { name: "INVENTORY_PLANNING", label: "INVENTORY_PLANNING" },
              { name: "EC2_CAPACITY", label: "EC2_CAPACITY" },
              { name: "WORK_FORCE", label: "WORK_FORCE" },
              { name: "WEB_TRAFFIC", label: "WEB_TRAFFIC" },
              { name: "METRICS", label: "METRICS" },
            ],
          },
          {
            label: "Data Frequency",
            name: "dataFrequency",
            required: true,
            type: "select",
            description: "This is the frequency at which entries are registered into your data file",
            options: [
              { name: "Y", label: "Yearly" },
              { name: "M", label: "Monthly" },
              { name: "W", label: "Weekly" },
              { name: "D", label: "Daily" },
              { name: "H", label: "Hourly" },
              { name: "30min", label: "Every 30 minutes" },
              { name: "15min", label: "Every 15 minutes" },
              { name: "10min", label: "Every 10 minutes" },
              { name: "5min", label: "Every 5 minutes" },
              { name: "1min", label: "Every minute" },
            ],
          },
          {
            label: "Dataset Type",
            name: "datasetType",
            required: true,
            type: "select",
            description: `Choose the type of dataset you're adding to the group.
        This will determine which fields are expected in the schema.
        See the Forecast documentation for more details.`,
            options: [
              { name: "TARGET_TIME_SERIES", label: "Target time series" },
              { name: "RELATED_TIME_SERIES", label: "Related time series" },
              { name: "ITEM_METADATA", label: "Item metadata" },
            ],
          },
          {
            label: "Data Schema",
            name: "datasetSchema",
            required: true,
            type: "textarea",
            description: `To help Forecast understand the fields of your data, supply a schema.
        Specify schema attributes in the same order as the columns of your query result.
        The default shown is valid for the "Custom" domain option only.
        Column headers need not match the schema. See Forecast documentation for more details.`,
            default: JSON.stringify({
              Attributes: [
                {
                  AttributeName: "timestamp",
                  AttributeType: "timestamp",
                },
                {
                  AttributeName: "item_id",
                  AttributeType: "string",
                },
                {
                  AttributeName: "target_value",
                  AttributeType: "float",
                },
              ],
            }, null, 2),
          },
          {
            label: "Timestamp Format",
            name: "timestampFormat",
            required: true,
            type: "string",
            default: "yyyy-MM-dd HH:mm:ss",
            description: `The format of the timestamp in your dataset.
        The format you enter here must match the format in your data file`,
          },
        ],
      }

      expect(form)
        .to.eventually.deep.equal(expected)
        .and.notify(forecastClientStub.restore)
        .and.notify(s3ClientStub.restore)
        .and.notify(done)
    })
  })
})
