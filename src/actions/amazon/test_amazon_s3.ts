import * as chai from "chai"
import * as sinon from "sinon"

import * as Hub from "../../hub"

import { AmazonS3Action } from "./amazon_s3"

import concatStream = require("concat-stream")

const action = new AmazonS3Action()

export function expectAmazonS3Match(thisAction: AmazonS3Action, request: Hub.ActionRequest, match: any) {

  const expectedBuffer = match.Body
  delete match.Body

  const uploadSpy = sinon.spy(async (params: any) => {
    params.Body.pipe(concatStream((buffer) => {
      chai.expect(buffer.toString()).to.equal(expectedBuffer.toString())
    }))
    return { promise: async () => Promise.resolve() }
  })
  const stubClient = sinon.stub(thisAction as any, "amazonS3ClientFromRequest")
    .callsFake(() => ({
      upload: uploadSpy,
    }))
  const stubSuggestedFilename = sinon.stub(request as any, "suggestedFilename")
    .callsFake(() => "stubSuggestedFilename")

  return chai.expect(thisAction.validateAndExecute(request)).to.be.fulfilled.then(() => {
    chai.expect(uploadSpy).to.have.been.called
    stubClient.restore()
    stubSuggestedFilename.restore()
  })
}

describe(`${action.constructor.name} unit tests`, () => {

  describe("action", () => {

    it("errors if there is no bucket", () => {
      const request = new Hub.ActionRequest()
      request.params = {
        access_key_id: "mykey",
        secret_access_key: "mysecret",
        region: "us-east-1",
      }
      request.formParams = {}
      request.attachment = {}
      request.attachment.dataBuffer = Buffer.from("1,2,3,4", "utf8")
      request.type = Hub.ActionType.Dashboard

      return chai.expect(action.validateAndExecute(request)).to.eventually
        .be.rejectedWith("Need Amazon S3 bucket.")
    })

    it("errors if the input has no attachment", () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Dashboard
      request.formParams = {
        bucket: "mybucket",
        filename: "whatever",
      }
      request.params = {
        access_key_id: "mykey",
        secret_access_key: "mysecret",
        region: "us-east-1",
      }

      return chai.expect(action.validateAndExecute(request)).to.eventually
        .be.rejectedWith(
          "A streaming action was sent incompatible data. The action must have a download url or an attachment.")
    })

    it("sends right body to key and bucket", () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Dashboard
      request.formParams = {
        bucket: "mybucket",
      }
      request.params = {
        access_key_id: "mykey",
        secret_access_key: "mysecret",
        region: "us-east-1",
      }
      request.attachment = {dataBuffer: Buffer.from("1,2,3,4", "utf8")}
      return expectAmazonS3Match(action, request, {
        Bucket: "mybucket",
        Key: "stubSuggestedFilename",
        Body: Buffer.from("1,2,3,4", "utf8"),
      })
    })

    it("sends to right filename if specified", () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Dashboard
      request.formParams = {
        bucket: "mybucket",
        filename: "mywackyfilename",
      }
      request.params = {
        access_key_id: "mykey",
        secret_access_key: "mysecret",
        region: "us-east-1",
      }
      request.attachment = {dataBuffer: Buffer.from("1,2,3,4", "utf8")}
      return expectAmazonS3Match(action, request, {
        Bucket: "mybucket",
        Key: "mywackyfilename",
        Body: Buffer.from("1,2,3,4", "utf8"),
      })
    })

  })

  describe("form", () => {

    it("has form", () => {
      chai.expect(action.hasForm).equals(true)
    })

    it("has form with correct buckets", (done) => {

      const stubClient = sinon.stub(action as any, "amazonS3ClientFromRequest")
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
      request.params = {
        access_key_id: "foo",
        secret_access_key: "foo",
        region: "foo",
      }
      const form = action.validateAndFetchForm(request)
      chai.expect(form).to.eventually.deep.equal({
        fields: [{
          label: "Bucket",
          name: "bucket",
          required: true,
          options: [
            {name: "A", label: "A"},
            {name: "B", label: "B"},
          ],
          type: "select",
          default: "A",
        }, {
          label: "File Path",
          name: "filename",
          type: "string",
          required: true,
        }],
      }).and.notify(stubClient.restore).and.notify(done)
    })

  })

})
