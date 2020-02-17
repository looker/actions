import { expect } from "chai"
import * as sinon from "sinon"

import * as Hub from "../../hub"

import { ForecastGenerateAction } from "./forecast_generate_action"
import * as mailTransporter from "./mail_transporter"

const action = new ForecastGenerateAction()

describe(`${action.constructor.name} unit tests`, () => {
  const validParams = {
    accessKeyId: "mykey",
    secretAccessKey: "mysecret",
    region: "my-region",
    user_email: "user@mail.com",
    smtpHost: "smtpHost",
    smtpPort: "smtpPort",
    smtpFrom: "smtpFrom",
    smtpUser: "smtpUser",
    smtpPass: "smtpPass",
  }

  const validFormParams = {
    predictorArn: "predictor_123abc",
    forecastName: "my_forecast",
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
            action: "Amazon Forecast: Generate Forecast",
            status: "Error",
            message: `Missing ${param}`,
          })
        })
      }

      testMissingParam("predictorArn")
      testMissingParam("forecastName")
    })
    describe("with valid parameters", () => {
      let forecastClientStub: sinon.SinonStub
      let stubMailer: sinon.SinonStub
      let createForecastSpy: sinon.SinonSpy
      let describeForecastSpy: sinon.SinonSpy

      beforeEach(() => {
        createForecastSpy = sinon.spy(() => ({
          promise: async () => new Promise<any>((resolve) => resolve({
            ForecastArn: "forecast_abc123",
          })),
        }))

        describeForecastSpy = sinon.spy(() => ({
          promise: async () => new Promise<any>((resolve) => resolve({
            Status: "ACTIVE",
          })),
        }))

        forecastClientStub = sinon.stub(action as any, "forecastServiceFromRequest")
        .callsFake(() => ({
          createForecast: createForecastSpy,
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

      it("should generate forecast", (done) => {
        const request = createValidRequest()
        expect((action as any).startForecastGeneration(request))
          .to.be.fulfilled
          .then((_result) => {
            expect(createForecastSpy.callCount).to.equal(1)
            done()
          })
      })

      it("should poll until forecast generation complete", (done) => {
        const request = createValidRequest()
        expect((action as any).startForecastGeneration(request))
          .to.be.fulfilled
          .then((_result) => {
            expect(describeForecastSpy.callCount).to.equal(1)
            done()
          })
      })

      it("should send an email on action success", (done) => {
        const request = createValidRequest()
        expect((action as any).startForecastGeneration(request))
          .to.be.fulfilled
          .then((_result) => {
            expect(stubMailer.getCall(0).args[1]).to.deep.equal({
              action: "Amazon Forecast: Generate Forecast",
              status: "ACTIVE",
              resource: "my_forecast",
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
        listPredictors: () => ({
          promise: async () => new Promise<any>((resolve) => resolve({
            Predictors: [
              { PredictorArn: "arn1", PredictorName: "name1" },
              { PredictorArn: "arn2", PredictorName: "name2" },
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
            label: "Predictor ARN",
            name: "predictorArn",
            required: true,
            type: "select",
            description: "The predictor you want to use to create forecasts",
            options: [
              { name: "arn1", label: "name1" },
              { name: "arn2", label: "name2" },
            ],
          },
          {
            label: "Forecast Name",
            name: "forecastName",
            required: true,
            type: "string",
            description: "Choose a name to identify this forecast",
          },
        ],
      }

      expect(form)
        .to.eventually.deep.equal(expected)
        .and.notify(forecastClientStub.restore)
        .and.notify(done)
    })
  })
})
