import * as chai from "chai"
import * as sinon from "sinon"
import { Stream } from "stream"

import * as Hub from "../../../hub"

import { GoogleCloudStorageAction } from "./google_cloud_storage"

const action = new GoogleCloudStorageAction()

function expectGoogleCloudStorageMatch(request: Hub.ActionRequest,
                                       bucketMatch: string,
                                       fileMatch: string,
                                       fileSaveMatch: Buffer) {

  const createWriteStreamSpy = sinon.spy(async () => {
    let data = Buffer.from("")
    const stream = new Stream()
    stream
      .on("data", (chunk: any) => {
        data = Buffer.concat([data, chunk])
      })
      .on("finish", () => {
        chai.expect(data).to.equal(fileSaveMatch)
      })
    return stream
  })
  const fileSpy = sinon.spy(() => ({createWriteStream: createWriteStreamSpy}))
  const bucketSpy = sinon.spy(() => ({file: fileSpy}))

  const stubClient = sinon.stub(action as any, "gcsClientFromRequest")
    .callsFake(() => ({
      bucket: bucketSpy,
    }))

  const stubSuggestedFilename = sinon.stub(request as any, "suggestedFilename")
    .callsFake(() => "stubSuggestedFilename")
  const stubDate = sinon.stub(Date, "now")
    .callsFake(() => 1234)
  return chai.expect(action.validateAndExecute(request)).to.be.fulfilled.then(() => {
    chai.expect(bucketSpy).to.have.been.calledWithMatch(bucketMatch)
    chai.expect(fileSpy).to.have.been.calledWithMatch(fileMatch)
    stubClient.restore()
    stubSuggestedFilename.restore()
    stubDate.restore()
  })
}

describe(`${action.constructor.name} unit tests`, () => {

  describe("action", () => {

    it("errors if there is no bucket", () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Dashboard
      request.params = {
        client_email: "myemail",
        private_key: "mykey",
        project_id: "myproject",
      }
      request.formParams = {}
      request.attachment = {}
      request.attachment.dataBuffer = Buffer.from("1,2,3,4", "utf8")

      return chai.expect(action.validateAndExecute(request)).to.eventually
        .be.rejectedWith("Need Google Cloud Storage bucket.")
    })

    it("errors if the input has no attachment", () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Dashboard
      request.params = {
        client_email: "myemail",
        private_key: "mykey",
        project_id: "myproject",
      }
      request.formParams = {
        bucket: "mybucket",
      }

      return chai.expect(action.validateAndExecute(request)).to.eventually
        .be.rejectedWith(
          "A streaming action was sent incompatible data. The action must have a download url or an attachment.")
    })

    it("sends right body to filename and bucket", () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Dashboard
      request.params = {
        client_email: "myemail",
        private_key: "mykey",
        project_id: "myproject",
      }
      request.formParams = {
        bucket: "mybucket",
      }
      request.attachment = {dataBuffer: Buffer.from("1,2,3,4", "utf8")}
      return expectGoogleCloudStorageMatch(request,
        "mybucket",
        "stubSuggestedFilename",
        Buffer.from("1,2,3,4", "utf8"))
    })

    it("sends to right filename if specified and overwrite yes", () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Dashboard
      request.params = {
        client_email: "myemail",
        private_key: "mykey",
        project_id: "myproject",
      }
      request.formParams = {
        bucket: "mybucket",
        filename: "mywackyfilename",
        overwrite: "yes",
      }
      request.attachment = {dataBuffer: Buffer.from("1,2,3,4", "utf8")}
      return expectGoogleCloudStorageMatch(request,
        "mybucket",
        "mywackyfilename",
        Buffer.from("1,2,3,4", "utf8"))
    })

    it("sends to right filename if specified and overwrite no", () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Dashboard
      request.params = {
        client_email: "myemail",
        private_key: "mykey",
        project_id: "myproject",
      }
      request.formParams = {
        bucket: "mybucket",
        filename: "mywackyfilename",
        overwrite: "no",
      }

      request.attachment = {dataBuffer: Buffer.from("1,2,3,4", "utf8")}
      return expectGoogleCloudStorageMatch(request,
        "mybucket",
        "mywackyfilename_1234",
        Buffer.from("1,2,3,4", "utf8"))
    })

  })

  describe("form", () => {

    it("has form", () => {
      chai.expect(action.hasForm).equals(true)
    })

    it("has form with correct buckets", (done) => {

      const stubClient = sinon.stub(action as any, "gcsClientFromRequest")
        .callsFake(() => ({
          getBuckets: async () => Promise.resolve([[
              {id: "1", name: "A"},
              {id: "2", name: "B"},
            ]]),
        }))

      const request = new Hub.ActionRequest()
      request.params = {
        client_email: "foo",
        private_key: "foo",
        project_id: "foo",
      }
      const form = action.validateAndFetchForm(request)
      chai.expect(form).to.eventually.deep.equal({
        fields: [{
          label: "Bucket",
          name: "bucket",
          required: true,
          options: [
            {name: "1", label: "A"},
            {name: "2", label: "B"},
          ],
          type: "select",
          default: "1",
        }, {
          label: "Filename",
          name: "filename",
          type: "string",
        }, {
          label: "Overwrite",
          name: "overwrite",
          options: [{label: "Yes", name: "yes"}, {label: "No", name: "no"}],
          default: "yes",
          description: "If Overwrite is enabled, will use the title or filename and overwrite existing data." +
            " If disabled, a date time will be appended to the name to make the file unique.",
        }],
      }).and.notify(stubClient.restore).and.notify(done)
    })

    it("has friendly error with no buckets", (done) => {

      const stubClient = sinon.stub(action as any, "gcsClientFromRequest")
        .callsFake(() => ({
          getBuckets: async () => Promise.resolve(),
        }))

      const request = new Hub.ActionRequest()
      request.params = {
        client_email: "foo",
        private_key: "foo",
        project_id: "foo",
      }
      const form = action.validateAndFetchForm(request)
      chai.expect(form).to.eventually
        .deep.eq({error: "No buckets in account.", fields: []})
        .and.notify(stubClient.restore)
        .and.notify(done)
    })

  })

  it("has a friendly error when SDK chokes", (done) => {

    const stubClient = sinon.stub(action as any, "gcsClientFromRequest")
      .callsFake(() => ({
        getBuckets: async () => Promise.reject(new Error("something weird from your friends at google")),
      }))

    const request = new Hub.ActionRequest()
    request.params = {
      client_email: "foo",
      private_key: "foo",
      project_id: "foo",
    }
    const form = action.validateAndFetchForm(request)
    chai.expect(form).to.eventually
      .deep.eq({error: `An error occurred while fetching the bucket list.

      Your Google Cloud Storage credentials may be incorrect.

      Google SDK Error: "something weird from your friends at google"`, fields: []})
      .and.notify(stubClient.restore)
      .and.notify(done)
  })

})
