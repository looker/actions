import { expect } from "chai"
import * as sinon from "sinon"

import * as Hub from "../../hub"

import { ForecastTrainPredictorAction } from "./forecast_train_predictor_action"
import * as mailTransporter from "./mail_transporter"

const action = new ForecastTrainPredictorAction()

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
    datasetGroupArn: "my_datasetgroup_arn",
    forecastingDomain: "CUSTOM",
    forecastFrequency: "D",
    forecastHorizon: "10",
    numberOfBacktestWindows: "1",
    backTestWindowOffset: "",
    predictorName: "my_predictor",
    countryForHolidays: "",
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
            action: "Amazon Forecast: Train Predictor",
            status: "Error",
            message: `Missing ${param}`,
          })
        })
      }

      testMissingParam("forecastFrequency")
      testMissingParam("predictorName")
      testMissingParam("datasetGroupArn")
      testMissingParam("forecastHorizon")
    })
    describe("with valid parameters", () => {
      let forecastClientStub: sinon.SinonStub
      let stubMailer: sinon.SinonStub
      let createPredictorSpy: sinon.SinonSpy
      let describePredictorSpy: sinon.SinonSpy

      beforeEach(() => {
        createPredictorSpy = sinon.spy(() => ({
          promise: async () => new Promise<any>((resolve) => resolve({
            PredictorArn: "predictor_abc123",
          })),
        }))

        describePredictorSpy = sinon.spy(() => ({
          promise: async () => new Promise<any>((resolve) => resolve({
            Status: "ACTIVE",
          })),
        }))

        forecastClientStub = sinon.stub(action as any, "forecastServiceFromRequest")
        .callsFake(() => ({
          createPredictor: createPredictorSpy,
          describePredictor: describePredictorSpy,
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

      it("should create predictor", (done) => {
        const request = createValidRequest()
        expect((action as any).startPredictorTraining(request))
          .to.be.fulfilled
          .then((_result) => {
            expect(createPredictorSpy.callCount).to.equal(1)
            done()
          })
      })

      it("should poll until predictor creation complete", (done) => {
        const request = createValidRequest()
        expect((action as any).startPredictorTraining(request))
          .to.be.fulfilled
          .then((_result) => {
            expect(describePredictorSpy.callCount).to.equal(1)
            done()
          })
      })

      it("should send an email on action success", (done) => {
        const request = createValidRequest()
        expect((action as any).startPredictorTraining(request))
          .to.be.fulfilled
          .then((_result) => {
            expect(stubMailer.getCall(0).args[1]).to.deep.equal({
              action: "Amazon Forecast: Train Predictor",
              status: "ACTIVE",
              resource: "my_predictor",
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
      // build params map
      const request = new Hub.ActionRequest()
      request.params = validParams

      const form = action.validateAndFetchForm(request)

      const expected = {
        fields: [
          {
            label: "Predictor Name",
            name: "predictorName",
            required: true,
            type: "string",
            description: "The predictor name must have 1 to 63 characters. Valid characters: a-z, A-Z, 0-9, and _",
          },
          {
            label: "Dataset group ARN",
            name: "datasetGroupArn",
            required: true,
            type: "select",
            description: "ARN of the dataset group to use when building the predictor",
            options: [
              { name: "arn1", label: "name1" },
              { name: "arn2", label: "name2" },
            ],
          },
          {
            label: "Forecast Frequency",
            name: "forecastFrequency",
            required: true,
            type: "select",
            description: "The frequency of predictions in a forecast",
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
            label: "Forecast Horizon",
            name: "forecastHorizon",
            required: true,
            type: "string",
            description: `Specifies the number of time-steps that the model is trained to predict.
        The maximum forecast horizon is the lesser of 500 time-steps or 1/3 of the Target Time Series dataset length`,
          },
          {
            label: "Number Of Backtest Windows",
            name: "numberOfBacktestWindows",
            required: false,
            type: "string",
            description: `The number of times to split the input data. The default is 1. Valid values are 1 through 5`,
          },
          {
            label: "Backtest Window Offset",
            name: "backTestWindowOffset",
            required: false,
            type: "string",
            description: `The point from the end of the dataset where you want to split the data for model training and
        testing (evaluation). Specify the value as the number of data points.
        The default is the value of the forecast horizon`,
          },
          {
            label: "Country for holidays",
            name: "countryForHolidays",
            required: false,
            type: "select",
            description: "The holiday calendar you want to include for model training",
            options: [
              { name: "AU", label: "Australia" },
              { name: "DE", label: "Germany" },
              { name: "JP", label: "Japan" },
              { name: "US", label: "United States" },
              { name: "UK", label: "United Kingdom" },
            ],
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
