import { expect } from "chai"
import * as sinon from "sinon"

import * as Hub from "../../hub"

import { ForecastExportAction } from "./forecast_export_action"
import * as mailTransporter from "./mail_transporter"

const action = new ForecastExportAction()

describe(`${action.constructor.name} unit tests`, () => {
  const validParams = {
    accessKeyId: "mykey",
    secretAccessKey: "mysecret",
    roleArn: "rolearn",
    region: "my-region",
    user_email: "user@mail.com",
    smtpHost: "smtpHost",
    smtpPort: "smtpPort",
    smtpFrom: "smtpFrom",
    smtpUser: "smtpUser",
    smtpPass: "smtpPass",
  }

  const validFormParams = {
    bucketName: "my-bucket",
    forecastArn: "my_forecast_arn",
  }

  function createValidRequest() {
    const request = new Hub.ActionRequest()
    request.params = validParams
    request.formParams = validFormParams
    request.attachment = {}
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
            action: "Amazon Forecast: Export Forecast",
            status: "Error",
            message: `Missing ${param}`,
          })
        })
      }

      testMissingParam("bucketName")
      testMissingParam("forecastArn")
    })
    describe("with valid parameters", () => {
      let forecastClientStub: sinon.SinonStub
      let stubMailer: sinon.SinonStub
      let createForecastExportJobSpy: sinon.SinonSpy
      let describeForecastExportJobSpy: sinon.SinonSpy
      let describeForecastSpy: sinon.SinonSpy

      beforeEach(() => {
        createForecastExportJobSpy = sinon.spy(() => ({
          promise: async () => new Promise<any>((resolve) => resolve({
            ForecastExportJobArn: "forecast_export_job_abc123",
          })),
        }))

        describeForecastExportJobSpy = sinon.spy(() => ({
          promise: async () => new Promise<any>((resolve) => resolve({
            Status: "ACTIVE",
          })),
        }))

        describeForecastSpy = sinon.spy(() => ({
          promise: async () => new Promise<any>((resolve) => resolve({
            ForecastName: "my_forecast",
          })),
        }))

        forecastClientStub = sinon.stub(action as any, "forecastServiceFromRequest")
        .callsFake(() => ({
          createForecastExportJob: createForecastExportJobSpy,
          describeForecastExportJob: describeForecastExportJobSpy,
          describeForecast: describeForecastSpy,
        }))

        stubMailer = sinon.stub(mailTransporter as any, "notifyJobStatus")
      })

      afterEach(() => {
        forecastClientStub.restore()
        stubMailer.restore()
      })

      it("should return successfully from execute", (done) => {
        const request = createValidRequest()
        expect(action.execute(request))
        .to.be.fulfilled.then(() => done())
      })

      it("should initiate forecast export", (done) => {
        const request = createValidRequest()
        expect((action as any).startForecastExport(request))
          .to.be.fulfilled
          .then((_result) => {
            expect(createForecastExportJobSpy.callCount).to.equal(1)
            done()
          })
      })

      it("should poll until forecast export complete", (done) => {
        const request = createValidRequest()
        expect((action as any).startForecastExport(request))
          .to.be.fulfilled
          .then((_result) => {
            expect(describeForecastExportJobSpy.callCount).to.equal(1)
            done()
          })
      })

      it("should send an email on action success", (done) => {
        const request = createValidRequest()
        expect((action as any).startForecastExport(request))
          .to.be.fulfilled
          .then((_result) => {
            expect(stubMailer.getCall(0).args[1].action).to.equal("Amazon Forecast: Export Forecast")
            expect(stubMailer.getCall(0).args[1].status).to.equal("ACTIVE")
            expect(stubMailer.getCall(0).args[1].message).to.be.undefined
            expect(stubMailer.getCall(0).args[1].resource.includes("my_forecast")).to.be.true
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
        listForecasts: () => ({
          promise: async () => new Promise<any>((resolve) => resolve({
            Forecasts: [
              { ForecastName: "name1", ForecastArn: "arn1" },
              { ForecastName: "name2", ForecastArn: "arn2" },
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
            label: "Forecast Destination Bucket",
            name: "bucketName",
            required: true,
            type: "select",
            description: "Choose a destination bucket for your forecast",
            options: [
              { name: "bucket1", label: "bucket1" },
              { name: "bucket2", label: "bucket2" },
            ],
          },
          {
            label: "Forecast",
            name: "forecastArn",
            required: true,
            type: "select",
            description: "Choose a Forecast to export",
            options: [
              { label: "name1", name: "arn1" },
              { label: "name2", name: "arn2" },
            ],
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
