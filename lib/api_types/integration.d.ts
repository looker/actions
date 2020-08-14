import { IntegrationParam, RequestIntegrationParam } from './integration_param';
import { IntegrationRequiredField } from './integration_required_field';
export declare enum IntegrationSupportedActionTypes {
    Cell = "cell",
    Query = "query",
    Dashboard = "dashboard"
}
export declare enum IntegrationSupportedDownloadSettings {
    Push = "push",
    Url = "url"
}
export declare enum IntegrationSupportedFormats {
    Txt = "txt",
    Csv = "csv",
    InlineJson = "inline_json",
    Json = "json",
    JsonDetail = "json_detail",
    JsonDetailLiteStream = "json_detail_lite_stream",
    Xlsx = "xlsx",
    Html = "html",
    WysiwygPdf = "wysiwyg_pdf",
    AssembledPdf = "assembled_pdf",
    WysiwygPng = "wysiwyg_png",
    CsvZip = "csv_zip"
}
export declare enum IntegrationSupportedFormattings {
    Formatted = "formatted",
    Unformatted = "unformatted"
}
export declare enum IntegrationSupportedVisualizationFormattings {
    Apply = "apply",
    Noapply = "noapply"
}
export interface Integration {
    /** ID of the integration. */
    id: string;
    /** ID of the integration hub. */
    integration_hub_id: number;
    /** Label for the integration. */
    label: string;
    /** Description of the integration. */
    description: string | null;
    /** Whether the integration is available to users. */
    enabled: boolean;
    /** Array of params for the integration. */
    params: IntegrationParam[];
    /** A list of data formats the integration supports. Valid values are: "txt", "csv", "inline_json", "json", "json_detail", "xlsx", "html", "wysiwyg_pdf", "assembled_pdf", "wysiwyg_png", "csv_zip". */
    supported_formats: IntegrationSupportedFormats[];
    /** A list of action types the integration supports. Valid values are: "cell", "query", "dashboard". */
    supported_action_types: IntegrationSupportedActionTypes[];
    /** A list of formatting options the integration supports. Valid values are: "formatted", "unformatted". */
    supported_formattings: IntegrationSupportedFormattings[];
    /** A list of visualization formatting options the integration supports. Valid values are: "apply", "noapply". */
    supported_visualization_formattings: IntegrationSupportedVisualizationFormattings[];
    /** A list of streaming options the integration supports. Valid values are: "push", "url". */
    supported_download_settings: IntegrationSupportedDownloadSettings[];
    /** URL to an icon for the integration. */
    icon_url: string | null;
    /** A list of descriptions of required fields that this integration is compatible with. If there are multiple entries in this list, the integration requires more than one field. */
    required_fields: IntegrationRequiredField[];
    /** Operations the current user is able to perform on this object */
    can: {
        [key: string]: boolean;
    };
}
export interface RequestIntegration {
    /** Whether the integration is available to users. */
    enabled?: boolean;
    /** Array of params for the integration. */
    params?: RequestIntegrationParam[];
}
