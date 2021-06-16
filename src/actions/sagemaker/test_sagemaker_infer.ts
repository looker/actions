import * as chai from "chai"
import * as sinon from "sinon"

import * as Hub from "../../hub"

import { SageMakerInferAction } from "./sagemaker_infer"

import concatStream = require("concat-stream")
import * as Pcancel from "p-cancelable"

const action = new SageMakerInferAction()
const cancel: Pcancel<string>[] = []

describe(`${action.constructor.name} unit tests`, () => {

  const csvData = "a,b,c,d\n1,2,3,4\n5,6,7,8\n"

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
    numInstances: "1",
    numStripColumns: "2",
  }

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

      testMissingNumericParam("numInstances")
      testMissingNumericParam("numStripColumns")

      testInvalidNumericParam("numInstances", "0", 1, 500)
      testInvalidNumericParam("numInstances", "501", 1, 500)
      testInvalidNumericParam("numStripColumns", "-1", 0, 2)
      testInvalidNumericParam("numStripColumns", "3", 0, 2)

    })

    describe("with valid parameters", () => {

      it("should upload inference data, upload raw data, and create transform job", () => {
        const request = createValidRequest()

        const expectedBucket = "bucket"
        const expectedStrippedBuffer = Buffer.from("3,4\n7,8\n", "utf8")
        const expectedRawBuffer = Buffer.from(csvData, "utf8")

        const expectedTransformParams = {
          ModelName: "modelName",
          TransformJobName: "my-job-name",
          TransformInput: {
            DataSource: {
              S3DataSource: {
                S3DataType: "S3Prefix",
                S3Uri: "s3://bucket/my-job-name/transform-input",
              },
            },
            ContentType: "text/csv",
          },
          TransformOutput: {
            S3OutputPath: "s3://bucket/my-job-name/transform-output",
          },
          TransformResources: {
            InstanceCount: 1,
            InstanceType: "awsInstanceType",
          },
        }

        const stubJobName = sinon.stub(action as any, "getJobName")
          .callsFake(() => "my-job-name")

        const uploads: any = {}
        const uploadSpy = sinon.spy((params: any, callback: any) => {
          params.Body.pipe(concatStream((buffer) => {
            uploads[params.Key] = buffer
            callback(null)
          }))
        })

        const stubClient = sinon.stub(action as any, "getS3ClientFromRequest")
          .callsFake(() => ({
            upload: uploadSpy,
          }))

        const createTransformJobSpy = sinon.spy((params: any) => {
          chai.expect(params).to.deep.equal(expectedTransformParams)
          return { promise: async () => null }
        })

        const stubSagemaker = sinon.stub(action as any, "getSageMakerClientFromRequest")
          .callsFake(() => ({
            createTransformJob: createTransformJobSpy,
          }))

        return chai.expect(action.validateAndExecute(request, cancel))
          .to.be.fulfilled
          .then((result) => {
            chai.expect(result.success, "result.success").to.be.true
            chai.expect(stubJobName, "stubJobName").to.have.been.called

            chai.expect(uploadSpy, "uploadSpy").to.have.been.called
            chai.expect(uploadSpy.callCount, "uploadSpy.callCount").to.equal(2)

            const stripped: any = uploadSpy.args[0][0]
            const strippedBuffer = uploads[stripped.Key]
            chai.expect(stripped.Bucket).to.equal(expectedBucket)
            chai.expect(stripped.Key).to.equal("my-job-name/transform-input")
            chai.expect(strippedBuffer.toString()).to.equal(expectedStrippedBuffer.toString())

            const raw: any = uploadSpy.args[1][0]
            const rawBuffer = uploads[raw.Key]
            chai.expect(raw.Bucket).to.equal(expectedBucket)
            chai.expect(raw.Key).to.equal("my-job-name/transform-raw")
            chai.expect(rawBuffer.toString()).to.equal(expectedRawBuffer.toString())

            chai.expect(createTransformJobSpy, "createTransformJobSpy").to.have.been.called
            // const raw: any = uploadSpy.args[1]
            stubJobName.restore()
            stubClient.restore()
            stubSagemaker.restore()
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
                      { Name: "BucketA" },
                      { Name: "BucketB" },
                    ],
                  })
                })
              },
            }
          },
        }))

      const stubSagemaker = sinon.stub(action as any, "getSageMakerClientFromRequest")
        .callsFake(() => ({
          listModels: () => {
            return {
              promise: async () => {
                return new Promise<any>((resolve) => {
                  resolve({
                    Models: [
                      { ModelName: "ModelA" },
                      { ModelName: "ModelB" },
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
            label: "Model",
            name: "modelName",
            required: true,
            options: [
              {
                name: "ModelA",
                label: "ModelA",
              },
              {
                name: "ModelB",
                label: "ModelB",
              },
            ],
            type: "select",
            description: "The S3 bucket where SageMaker input training data should be stored",
          },
          {
            label: "Strip Columns",
            name: "numStripColumns",
            required: true,
            options: [
              {
                name: "0",
                label: "None",
              },
              {
                name: "1",
                label: "First Column",
              },
              {
                name: "2",
                label: "First & Second Column",
              },
            ],
            type: "select",
            default: "0",
            // tslint:disable-next-line max-line-length
            description: "Columns to remove before running inference task. Columns must be first or second column in the data provided. Use this to remove key, target variable, or both.",
          },
          {
            label: "Output Bucket",
            name: "bucket",
            required: true,
            options: [
              {
                name: "BucketA",
                label: "BucketA",
              },
              {
                name: "BucketB",
                label: "BucketB",
              },
            ],
            type: "select",
            default: "BucketA",
            description: "The S3 bucket where inference data should be stored",
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
        ],
      }

      chai.expect(form)
        .to.eventually.deep.equal(expected)
        .and.notify(stubClient.restore)
        .and.notify(stubSagemaker.restore)
        .and.notify(done)
    })

  })

})
