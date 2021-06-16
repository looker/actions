import * as chai from "chai"
import * as sinon from "sinon"

import * as Hub from "../../hub"

import { SageMakerTrainXgboostAction } from "./sagemaker_train_xgboost"

import concatStream = require("concat-stream")
import * as Pcancel from "p-cancelable"

const action = new SageMakerTrainXgboostAction()
const cancel: Pcancel<string>[] = []

describe(`${action.constructor.name} unit tests`, () => {

  const validParams = {
    accessKeyId: "mykey",
    secretAccessKey: "mysecret",
    region: "my-region",
    roleArn: "my-role-arn",
    user_email: "user@mail.com",
    smtpHost: "smtpHost",
    smtpPort: "smtpPort",
    smtpFrom: "smtpFrom",
    smtpUser: "smtpUser",
    smtpPass: "smtpPass",
  }
  const validFormParams = {
    modelName: "modelName",
    bucket: "bucket",
    awsInstanceType: "awsInstanceType",
    objective: "objective",
    numClass: "3",
    numInstances: "1",
    numRounds: "1",
    maxRuntimeInHours: "1",
  }

  function createValidRequest() {
    const request = new Hub.ActionRequest()
    request.params = validParams
    request.formParams = validFormParams
    request.attachment = {}
    request.attachment.dataBuffer = Buffer.from("a,b,c,d\n1,2,3,4\n", "utf8")
    request.type = Hub.ActionType.Query
    return request
  }

  describe("action", () => {

    describe("with invalid parameters", () => {

      function testMissingParam(param: string, value?: any|undefined) {
        it(`${param} is ${value}`, () => {
          const request = createValidRequest()
          request.formParams = { ...validFormParams, [param]: value }

          return chai.expect(action.execute(request))
            .to.eventually.be.rejectedWith(`Missing required param: ${param}`)
        })
      }

      function testMissingNumericParam(param: string, value?: any|undefined) {
        it(`${param} is ${value}`, () => {
          const request = createValidRequest()
          request.formParams = { ...validFormParams, [param]: value }

          return chai.expect(action.execute(request))
            .to.eventually.be.rejectedWith(`Missing required param: ${param}`)
        })
      }

      function testInvalidNumericParam(param: string, value: string, min: number, max: number) {
        const aboveBelow = (Number(value) < min) ? "below" : "above"
        it(`${param} is ${aboveBelow} range: ${min} - ${max}`, () => {
          const request = createValidRequest()
          request.formParams = { ...validFormParams, [param]: value }

          return chai.expect(action.execute(request))
            .to.eventually.be.rejectedWith(`Param ${param}: ${value} is out of range: ${min} - ${max}`)
        })
      }

      testMissingParam("modelName")
      testMissingParam("bucket")
      testMissingParam("awsInstanceType")
      testMissingParam("objective")

      testMissingNumericParam("numClass")
      testMissingNumericParam("numInstances")
      testMissingNumericParam("numRounds")
      testMissingNumericParam("maxRuntimeInHours")

      testInvalidNumericParam("numClass", "0", 3, 1000000)
      testInvalidNumericParam("numClass", "1000001", 3, 1000000)
      testInvalidNumericParam("numInstances", "0", 1, 500)
      testInvalidNumericParam("numInstances", "501", 1, 500)
      testInvalidNumericParam("numRounds", "0", 1, 1000000)
      testInvalidNumericParam("numRounds", "1000001", 1, 1000000)
      testInvalidNumericParam("maxRuntimeInHours", "0", 1, 72)
      testInvalidNumericParam("maxRuntimeInHours", "73", 1, 72)

    })

    describe("with valid parameters", () => {

      it("should upload training data and create training job", () => {
        const request = createValidRequest()

        const expectedBucket = "bucket"
        const expectedKey = "my-job-name/train"
        const expectedBuffer = Buffer.from("1,2,3,4\n", "utf8")
        const expectedTrainingParams = {
          TrainingJobName: "my-job-name",
          RoleArn: "my-role-arn",
          AlgorithmSpecification: {
            TrainingInputMode: "File",
            TrainingImage: "632365934929.dkr.ecr.us-west-1.amazonaws.com​/xgboost:1",
          },
          HyperParameters: {
            objective: "objective",
            num_round: "1",
          },
          InputDataConfig: [
            {
              ChannelName: "train",
              DataSource: {
                S3DataSource: {
                  S3DataType: "S3Prefix",
                  S3Uri: "s3://bucket/my-job-name/train",
                },
              },
              ContentType: "text/csv",
            },
          ],
          OutputDataConfig: {
            S3OutputPath: "s3://bucket",
          },
          ResourceConfig: {
            InstanceCount: 1,
            InstanceType: "awsInstanceType",
            VolumeSizeInGB: 10,
          },
          StoppingCondition: {
            MaxRuntimeInSeconds: 3600,
          },
        }

        const stubJobName = sinon.stub(action as any, "getJobName")
          .callsFake(() => "my-job-name")

        const getBucketLocationSpy = sinon.spy((params: any) => {
          chai.expect(params.Bucket).to.equal(expectedBucket)
          return { promise: async () => {
            return {
              LocationConstraint: "us-west-1",
            }
          }}
        })

        const uploadSpy = sinon.spy((params: any, callback: any) => {
          chai.expect(params.Key).to.equal(expectedKey)
          chai.expect(params.Bucket).to.equal(expectedBucket)
          params.Body.pipe(concatStream((buffer) => {
            chai.expect(buffer.toString()).to.equal(expectedBuffer.toString())
            callback(null)
          }))
        })

        const stubClient = sinon.stub(action as any, "getS3ClientFromRequest")
          .callsFake(() => ({
            getBucketLocation: getBucketLocationSpy,
            upload: uploadSpy,
          }))

        const createTrainingJobSpy = sinon.spy((params: any) => {
          chai.expect(params).to.deep.equal(expectedTrainingParams)
          return { promise: async () => null }
        })

        const stubSagemaker = sinon.stub(action as any, "getSageMakerClientFromRequest")
          .callsFake(() => ({
            createTrainingJob: createTrainingJobSpy,
          }))

        const stubPoller = sinon.stub(action as any, "startPoller")

        return chai.expect(action.validateAndExecute(request, cancel))
          .to.be.fulfilled
          .then((result) => {
            chai.expect(result.success, "result.success").to.be.true
            chai.expect(stubJobName, "stubJobName").to.have.been.called
            chai.expect(getBucketLocationSpy, "getBucketLocationSpy").to.have.been.called
            chai.expect(uploadSpy, "uploadSpy").to.have.been.called
            chai.expect(createTrainingJobSpy, "createTrainingJobSpy").to.have.been.called
            chai.expect(stubPoller, "stubPoller").to.have.been.called
            stubJobName.restore()
            stubClient.restore()
            stubSagemaker.restore()
            stubPoller.restore()
          })
      })

    })
  })

  describe("form", () => {

    it("has form", () => {
      chai.expect(action.hasForm).equals(true)
    })

    it("has form with correct fields", (done) => {

      const stubClient = sinon.stub(action as any, "getS3ClientFromRequest")
        .callsFake(() => ({
          listBuckets: () => {
            return {
              promise: async () => {
                return new Promise<any>((resolve) => {
                  resolve({
                    Buckets: [
                      { Name: "A" },
                      { Name: "B" },
                    ],
                  })
                })
              },
            }
          },
        }))

      const request = new Hub.ActionRequest()
      request.params = validParams

      const form = action.validateAndFetchForm(request)

      const expected = {
        fields: [
          {
            type: "string",
            label: "Model Name",
            name: "modelName",
            required: true,
            description: "The name for model to be created after training is complete.",
          },
          {
            type: "select",
            label: "Bucket",
            name: "bucket",
            required: true,
            options: [
              {
                name: "A",
                label: "A",
              },
              {
                name: "B",
                label: "B",
              },
            ],
            default: "A",
            description: "The S3 bucket where SageMaker input training data should be stored",
          },
          {
            type: "select",
            label: "Objective",
            name: "objective",
            required: true,
            options: [
              {
                name: "binary:logistic",
                label: "binary:logistic",
              },
              {
                name: "reg:linear",
                label: "reg:linear",
              },
              {
                name: "multi:softmax",
                label: "multi:softmax",
              },
            ],
            default: "binary:logistic",
            description: "The type of classification to be performed.",
          },
          {
            type: "string",
            label: "Number of classes",
            name: "numClass",
            default: "3",
            // tslint:disable-next-line max-line-length
            description: "The number of classifications. Valid values: 3 to 1000000. Required if objective is multi:softmax. Otherwise ignored.",
          },
          {
            type: "select",
            label: "AWS Instance Type",
            name: "awsInstanceType",
            required: true,
            options: [
              {
                name: "ml.m4.xlarge",
                label: "ml.m4.xlarge",
              },
              {
                name: "ml.m4.2xlarge",
                label: "ml.m4.2xlarge",
              },
              {
                name: "ml.m4.4xlarge",
                label: "ml.m4.4xlarge",
              },
              {
                name: "ml.m4.10xlarge",
                label: "ml.m4.10xlarge",
              },
              {
                name: "ml.m4.16xlarge",
                label: "ml.m4.16xlarge",
              },
              {
                name: "ml.m5.large",
                label: "ml.m5.large",
              },
              {
                name: "ml.m5.xlarge",
                label: "ml.m5.xlarge",
              },
              {
                name: "ml.m5.2xlarge",
                label: "ml.m5.2xlarge",
              },
              {
                name: "ml.m5.4xlarge",
                label: "ml.m5.4xlarge",
              },
              {
                name: "ml.m5.12xlarge",
                label: "ml.m5.12xlarge",
              },
              {
                name: "ml.m5.24xlarge",
                label: "ml.m5.24xlarge",
              },
              {
                name: "ml.c4.xlarge",
                label: "ml.c4.xlarge",
              },
              {
                name: "ml.c4.2xlarge",
                label: "ml.c4.2xlarge",
              },
              {
                name: "ml.c4.4xlarge",
                label: "ml.c4.4xlarge",
              },
              {
                name: "ml.c4.8xlarge",
                label: "ml.c4.8xlarge",
              },
              {
                name: "ml.p2.xlarge",
                label: "ml.p2.xlarge",
              },
              {
                name: "ml.p2.8xlarge",
                label: "ml.p2.8xlarge",
              },
              {
                name: "ml.p2.16xlarge",
                label: "ml.p2.16xlarge",
              },
              {
                name: "ml.p3.2xlarge",
                label: "ml.p3.2xlarge",
              },
              {
                name: "ml.p3.8xlarge",
                label: "ml.p3.8xlarge",
              },
              {
                name: "ml.p3.16xlarge",
                label: "ml.p3.16xlarge",
              },
              {
                name: "ml.c5.xlarge",
                label: "ml.c5.xlarge",
              },
              {
                name: "ml.c5.2xlarge",
                label: "ml.c5.2xlarge",
              },
              {
                name: "ml.c5.4xlarge",
                label: "ml.c5.4xlarge",
              },
              {
                name: "ml.c5.9xlarge",
                label: "ml.c5.9xlarge",
              },
              {
                name: "ml.c5.18xlarge",
                label: "ml.c5.18xlarge",
              },
            ],
            default: "ml.m4.xlarge",
            // tslint:disable-next-line max-line-length
            description: "The type of AWS instance to use. More info: More info: https://aws.amazon.com/sagemaker/pricing/instance-types",
          },
          {
            type: "string",
            label: "Number of instances",
            name: "numInstances",
            default: "1",
            description: "The number of instances to run. Valid values: 1 to 500.",
          },
          {
            type: "string",
            label: "Number of rounds",
            name: "numRounds",
            default: "100",
            description: "The number of rounds to run. Valid values: 1 to 1000000.",
          },
          {
            type: "string",
            label: "Maximum runtime in hours",
            name: "maxRuntimeInHours",
            default: "12",
            description: "Maximum allowed time for the job to run, in hours. Valid values: 1 to 72.",
          },
        ],
      }

      chai.expect(form)
        .to.eventually.deep.equal(expected)
        .and.notify(stubClient.restore)
        .and.notify(done)
    })

  })

})
