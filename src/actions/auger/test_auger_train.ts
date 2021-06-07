import * as chai from "chai"
import * as httpRequest from "request-promise-native"
import * as sinon from "sinon"
import * as Hub from "../../hub"
import { Transaction } from "./poller"

import { AugerTrainAction } from "./auger_train"

const action = new AugerTrainAction()
action.executeInOwnProcess = false
const sandbox = sinon.createSandbox()

describe(`${action.constructor.name} unit tests`, () => {

  describe("action", () => {
    let stubHttpPost: sinon.SinonStub
    let stubStartProject: sinon.SinonStub
    let stubPoller: sinon.SinonStub
    let stubUploadToS3: sinon.SinonStub
    let stubChunkToS3: sinon.SinonStub
    let stubProjectFile: sinon.SinonStub
    const now = new Date().getTime()
    afterEach(() => {
      stubHttpPost.restore()
      stubStartProject.restore()
      stubPoller.restore()
      stubChunkToS3.restore()
      stubUploadToS3.restore()
      sandbox.restore()
    })

    it("sends the right body with URL", async () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query
      request.params.api_token = "token"
      request.formParams = {
        model_type: "classification",
        project_name: "lookerproj",
        max_n_trials: "100",
        train_data: "true",
      }

      const postSpy = sinon.spy((params: any) => {
        chai.expect(params.url).to.equal("https://app.auger.com/api/")
        chai.expect(params.headers.Authorization).to.equal("Token token")
        chai.expect(params.body.model_type).to.equal("classification")
        chai.expect(params.body.project_name).to.equal("lookerproj")
        chai.expect(params.body.max_n_trials).to.equal("100")
        chai.expect(params.body.train_data).to.equal("true")
        return {
          promise: async () => new Promise<void>((resolve: any) => resolve()),
        }
      })
      stubHttpPost = sinon.stub(httpRequest, "post").callsFake(postSpy)
      stubPoller = sinon.stub(action as any, "startPoller")
      stubStartProject = sinon.stub(action as any, "startProject")
      stubUploadToS3 = sinon.stub(action as any, "uploadToS3")
      stubChunkToS3 = sinon.stub(action as any, "chunkToS3")

      chai.expect(action.validateAndExecute(request)).to.be.fulfilled.then(() => {
        chai.expect(postSpy).to.have.been.called
        chai.expect(stubPoller, "stubPoller").to.have.been.called
        chai.expect(stubStartProject, "stubStartProject").to.have.been.called
        chai.expect(stubUploadToS3, "stubUploadToS3").to.have.been.called
        chai.expect(stubChunkToS3, "stubChunkToS3").to.have.been.called
      })
    })

    it("fails with bad data", async () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query
      request.params.api_token = "token"
      request.formParams = {
        model_type: "classification",
        project_name: "",
      }

      return chai.expect(action.execute(request))
        .to.be.fulfilled
        .then((result) => {
          chai.expect(result.success, "result.success").to.be.false
          chai.expect(result.message, "result.message").to.equal("Missing required param: project_name")
        })
    })

    it("sends with good data", async () => {
      const request = new Hub.ActionRequest()
      request.type = Hub.ActionType.Query
      request.params.api_token = "token"
      request.formParams = {
        model_type: "classification",
        project_name: "lookerproj",
      }
      const fields = [
        { name: "distribution_centers.name", source_file: "05_distribution_centers.view.lkml"},
        { name: "distribution_centers.cost", source_file: "05_distribution_centers.view.lkml"},
        { name: "distribution_centers.is_sold", source_file: "05_distribution_centers.view.lkml"},
      ]

      const data = [
        {
          "distribution_centers.name": { value: "Charleston SC" },
          "distribution_centers.cost": { value: 4.995899754 },
          "distribution_centers.is_sold": { value: "Yes" },
        },
        {
          "distribution_centers.name": { value: "Charleston SC" },
          "distribution_centers.cost": { value: 6.720799786 },
          "distribution_centers.is_sold": { value: "Yes" },
        },
        {
          "distribution_centers.name": { value: "Charleston SC" },
          "distribution_centers.cost": { value: 15.625000047 },
          "distribution_centers.is_sold": { value: "Yes" },
        },
        {
          "distribution_centers.name": { value: "Charleston SC" },
          "distribution_centers.cost": { value: 13.125000009 },
          "distribution_centers.is_sold": { value: "No" },
        },
      ]

      request.attachment = {
        dataBuffer: Buffer.from(JSON.stringify({fields, data})),
      }

      const url = "https://testhost.com"
      stubProjectFile = sinon.stub(action as any, "getProjectFileURL")
      .callsFake(() => ({
        body: {
          data: {
            project_id: 1,
            main_bucket: "main_bucket",
            url,
          },
        },
      }))

      stubPoller = sinon.stub(action as any, "startPoller")
      stubStartProject = sinon.stub(action as any, "startProject")
      stubUploadToS3 = sinon.stub(action as any, "uploadToS3")
      const stubDate = sinon.stub(Date, "now").returns(now)
      const augerURL = "https://app.auger.ai/api/v1"
      const rawName = "looker_file"
      const fileName = `${rawName}_${Date.now()}`
      const records = [
        { name: "Charleston SC", cost: 4.995899754, is_sold: "Yes" },
        { name: "Charleston SC", cost: 6.720799786, is_sold: "Yes" },
        { name: "Charleston SC", cost: 15.625000047, is_sold: "Yes" },
        { name: "Charleston SC", cost: 13.125000009, is_sold: "No" },
      ]
      const columns = data[3]
      const contentType = "application/json"
      const projectName = request.formParams.project_name
      const filePath = `workspace/projects/${projectName}/files/${fileName}.json`
      const token = request.params.api_token
      const params = request.formParams
      const projectId = 1
      const mainBucket = "main_bucket"
      const s3Path = `s3://${mainBucket}/workspace/projects/${projectName}/files/${fileName}.json`
      const transaction: Transaction = {
        projectId,
        s3Path,
        fileName,
        columns,
        token,
        params,
        contentType,
        augerURL,
        successStatus: "running",
        errorStatus: "",
        projectFileId: 0,
        experimentId: 0,
      }

      return chai.expect(action.execute(request))
        .to.be.fulfilled.and.notify(stubDate.restore)
        .then(() => {
          chai.expect(stubPoller, "stubPoller").to.have.been.called
          chai.expect(stubUploadToS3, "stubUploadToS3").to.have.been.calledWithMatch(records, url)
          chai.expect(stubStartProject, "stubStartProject").to.have.been.calledWithMatch(transaction)
          chai.expect(stubProjectFile, "stubProjectFile").to.have.been.calledWithMatch(projectName, filePath, token)
        })
    })
  })

  describe("form", () => {

    it("has form", () => {
      chai.expect(action.hasForm).equals(true)
    })

    it("has form with project_name, model_type param", () => {
      const stubGet = sinon.stub(action, "validateAugerToken" as any).callsFake(async () => {
        return new Promise<any>((resolve: any) => resolve())
      })

      const request = new Hub.ActionRequest()
      request.params.api_token = "token"
      const form = action.validateAndFetchForm(request)

      return chai.expect(form).to.eventually.deep.equal({
        fields: [
          {
            description: "The Auger project to use.",
            label: "Project Name",
            name: "project_name",
            required: true,
            type: "string",
          },
          {
            default: "classification",
            label: "Model Type",
            name: "model_type",
            options: [
              {
                label: "Classification",
                name: "classification",
              },
              {
                label: "Regression",
                name: "regression",
              },
            ],
            required: true,
            type: "select",
          },
          {
            default: "100",
            description: "How many trials to run for training.",
            label: "Trials to run",
            name: "max_n_trials",
            required: false,
            type: "string",
          },
          {
            default: "false",
            label: "Train after data transfer",
            name: "train_data",
            options: [
              {
                label: "True",
                name: "true",
              },
              {
                label: "False",
                name: "false",
              },
            ],
            required: false,
            type: "select",
          },
        ],
      }).and.notify(stubGet.restore)
    })

  })
})
