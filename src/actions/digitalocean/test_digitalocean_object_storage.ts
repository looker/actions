import * as chai from "chai"
import * as sinon from "sinon"

import * as Hub from "../../hub"

import { DigitalOceanObjectStorageAction } from "./digitalocean_object_storage"

import * as Pcancel from "p-cancelable"
import { expectAmazonS3Match } from "../amazon/test_amazon_s3"

const action = new DigitalOceanObjectStorageAction()
const cancel: Pcancel<string>[] = []

describe(`${action.constructor.name} unit tests`, () => {

  /* "action" function is not functionally different from AmazonS3Action */
  describe("action", () => {

        it("errors if there is no bucket", () => {
          const request = new Hub.ActionRequest()
          request.type = Hub.ActionType.Dashboard
          request.params = {
            access_key_id: "mykey",
            secret_access_key: "mysecret",
            region: "us-east-1",
          }
          request.formParams = {}
          request.attachment = {}
          request.attachment.dataBuffer = Buffer.from("1,2,3,4", "utf8")
          return chai.expect(action.validateAndExecute(request, cancel)).to.eventually
            .be.rejectedWith("Need Amazon S3 bucket.")
        })

        it("errors if the input has no attachment", () => {
          const request = new Hub.ActionRequest()
          request.type = Hub.ActionType.Dashboard
          request.formParams = {
            bucket: "mybucket",
            access_key_id: "mykey",
            secret_access_key: "mysecret",
            region: "us-east-1",
          }
          request.params = {
            access_key_id: "mykey",
            secret_access_key: "mysecret",
            region: "us-east-1",
          }
          return chai.expect(action.validateAndExecute(request, cancel)).to.eventually
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
      request.params = {access_key_id: "foo", secret_access_key: "bar", region: "nyc3"}
      const form = action.validateAndFetchForm(request)
      chai.expect(form).to.eventually.deep.equal({
        fields: [{
          label: "Space Name",
          name: "bucket",
          required: true,
          options: [
            {name: "A", label: "A"},
            {name: "B", label: "B"},
          ],
          type: "select",
          default: "A",
        }, {
          label: "Path",
          name: "path",
          type: "string",
        }, {
          label: "Filename",
          name: "filename",
          type: "string",
        }],
      }).and.notify(stubClient.restore).and.notify(done)

    })

  })

})
