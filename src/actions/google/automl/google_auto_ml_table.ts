import * as Hub from "../../../hub"

import { AutoMlClient, v1beta1 } from '@google-cloud/automl'
import { GoogleCloudStorageAction } from "../gcs/google_cloud_storage"
import { log } from 'console'

const new_ds = "create_new_dataset"
const dataset_name_regex = /^[a-zA-Z0-9_]+$/;
const file_name_regex = /^[\w,\s-]+\.[A-Za-z]{3}$/;

export class GoogleAutomlTable extends Hub.Action {

    name = "google_automl_table"
    label = "Google Cloud AutoML Table"
    iconName = "google/automl/google_automl.png"
    description = "Import your data into a Google Cloud AutoMl Table"
    supportedActionTypes = [Hub.ActionType.Dashboard, Hub.ActionType.Query]
    usesStreaming = true
    requiredFields = []
    params = [
        {
            name: "client_email",
            label: "Client Email",
            required: true,
            sensitive: false,
            description: "Your client email for GCS from https://console.cloud.google.com/apis/credentials",
        }, {
            name: "private_key",
            label: "Private Key",
            required: true,
            sensitive: true,
            description: "Your private key for GCS from https://console.cloud.google.com/apis/credentials",
        }, {
            name: "project_id",
            label: "Project Id",
            required: true,
            sensitive: false,
            description: "The Project Id for your GCS project from https://console.cloud.google.com/apis/credentials",
        },
        {
            name: "region",
            label: "Region",
            required: true,
            sensitive: false,
            description: "the region will be used to manage the datasets (us-central1)",
        },

    ]

    async execute(request: Hub.ActionRequest) {

        try {

            if (!request.params.project_id || !request.params.region || !request.formParams.dataset_id) {
                return new Hub.ActionResponse({ success: false, message: "project_id, region and dataset are mandatory" })
            }
            
            const params_error = this.validateFormParam(request)
            if (params_error) {
                log(`error validating parameters: ${params_error}`)
                throw params_error.message
            }

            await this.pushFileToGoogleBucket(request)
            const client = this.getAutomlInstance(request)
            const bucket_location = `gs://${request.formParams.bucket}/${request.formParams.filename}`
            let dataset_id = request.formParams.dataset_id

            if (dataset_id === new_ds) {
                dataset_id = <string>await this.createDataSet(request)
            }

            const ml_request = {
                name: dataset_id,
                inputConfig: {
                    gcsSource: {
                        inputUris: [bucket_location],
                    },
                },
            };

            const [operation] = await client.importData(ml_request);
            operation.promise();
            return new Hub.ActionResponse({ success: true })
        } catch (e) {
            return new Hub.ActionResponse({ success: false, message: (e.message) ? e.message : e })
        }
    }

    async form(request: Hub.ActionRequest) {

        const form = new Hub.ActionForm()

        try {
            const datasets = await this.getDatasetList(request)
            datasets.push({ name: new_ds, label: "create a new dataset" })
            form.fields = [
                {
                    name: "dataset_id",
                    label: "Dataset",
                    required: true,
                    options: datasets,
                    type: "select",
                    default: new_ds,
                }, {
                    name: "filename",
                    label: "File Name",
                    required: true,
                    description: "the name of the file that will be created in the Google storage",
                },
                {
                    name: "overwrite",
                    label: "Overwrite File",
                    options: [{ label: "Yes", name: "yes" }, { label: "No", name: "no" }],
                    type: "select",
                    default: "yes",
                    description: "If Overwrite is enabled, will use the title or filename and overwrite existing data." +
                        " If disabled, a date time will be appended to the name to make the file unique.",
                },
                {
                    name: "dataset_name",
                    label: "Dataset name",
                    required: false,
                    description: "This is the name of the dataset that will be created, only alphanumeric and undersocre (_) allowed, e.g my_ds_name",
                },
            ]

            const buckets = await this.getBucketList(request)
            form.fields.push(<Hub.ActionFormField>buckets)

        } catch (e) {
            form.error = `error populating form fields: ${e}`
        }

        return form
    }

    private getAutomlInstance(request: Hub.ActionRequest) {

        const credentials = {
            client_email: request.params.client_email,
            private_key: request.params.private_key!.replace(/\\n/gm, "\n"),
        }

        const config = {
            projectId: request.params.project_id,
            credentials,
        }

        return new AutoMlClient(config)
    }

    private getAutomlBetaInstance(request: Hub.ActionRequest) {

        const credentials = {
            client_email: request.params.client_email,
            private_key: request.params.private_key!.replace(/\\n/gm, "\n"),
        }

        const config = {
            projectId: request.params.project_id,
            credentials,
        }

        return new v1beta1.AutoMlClient(config)
    }

    private async pushFileToGoogleBucket(request: Hub.ActionRequest) {

        try {
            const storage_action = new GoogleCloudStorageAction()
            await storage_action.validateAndExecute(request)
        } catch (e) {
            log(`error pushing file to Google Bucket ${e}`)
            throw e
        }
    }

    private async getBucketList(request: Hub.ActionRequest) {

        try {
            const storage_action = new GoogleCloudStorageAction()
            const form = await storage_action.validateAndFetchForm(request)

            if (form.error) {
                throw form.error
            }

            return form.fields.find(field => field.name == "bucket")
        } catch (e) {
            log(`error getting Google Bucket list ${e}`)
            throw e
        }
    }

    private async getDatasetList(request: Hub.ActionRequest) {
        try {

            if (!request.params.project_id || !request.params.region) {
                throw new Error('project id and region are required')
            }

            const client = this.getAutomlInstance(request)
            const list_request = {
                parent: client.locationPath(request.params.project_id, request.params.region),
            };

            const [results] = await client.listDatasets(list_request)

            if (!results) {
                throw new Error('no datasets found in this account')
            }

            return results.map((b: any) => {
                return { name: b.name, label: b.displayName }
            })

        } catch (e) {
            log(`error fetching the dataset list ${e}`)
            throw e
        }
    }

    private async createDataSet(request: Hub.ActionRequest) {
        try {
            if (!request.params.project_id || !request.params.region) {
                throw new Error('project id and region are required')
            }

            const client = this.getAutomlBetaInstance(request)
            const parent = client.locationPath(request.params.project_id, request.params.region)
            const [response] = await client.createDataset({
                parent: parent,
                dataset: {
                    displayName: request.formParams.dataset_name,
                    tablesDatasetMetadata: {},
                }
            })

            return response.name
        } catch (e) {
            log(`error creating dataset ${e}`)
            throw e
        }
    }

    private validateFormParam(request: Hub.ActionRequest) {

        if (request.formParams.dataset_name && request.formParams.dataset_name !== "" && request.formParams.dataset_name.search(dataset_name_regex) === -1) {
            return new Error('invalid dataset name: use only alphanumeric and underscores')
        }

        if (request.formParams.filename && request.formParams.filename !== "" && request.formParams.filename.search(file_name_regex) === -1) {
            return new Error('invalid file name: use alphanumeric, underscore and file extension of 3 characteres')
        }
    }
}

Hub.addAction(new GoogleAutomlTable())
