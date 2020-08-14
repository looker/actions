export interface IntegrationParam {
    /** Name of the parameter. */
    name: string | null;
    /** Label of the parameter. */
    label: string | null;
    /** Short description of the parameter. */
    description: string | null;
    /** Whether the parameter is required to be set to use the destination. */
    required: boolean;
    /** Whether the parameter has a value set. */
    has_value: boolean;
    /** The current value of the parameter. Always null if the value is sensitive. When writing, null values will be ignored. Set the value to an empty string to clear it. */
    value: string | null;
    /** When present, the param's value comes from this user attribute instead of the 'value' parameter. Set to null to use the 'value'. */
    user_attribute_name: string | null;
    /** Whether the parameter contains sensitive data like API credentials. */
    sensitive: boolean;
}
export interface RequestIntegrationParam {
    /** The current value of the parameter. Always null if the value is sensitive. When writing, null values will be ignored. Set the value to an empty string to clear it. */
    value?: string | null;
    /** When present, the param's value comes from this user attribute instead of the 'value' parameter. Set to null to use the 'value'. */
    user_attribute_name?: string | null;
}
