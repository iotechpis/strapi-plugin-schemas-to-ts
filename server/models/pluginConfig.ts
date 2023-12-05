export interface PluginConfig {
    acceptedNodeEnvs: string[];
    verboseLogs: boolean;
    alwaysAddEnumSuffix: boolean;
    contentTypesToIgnore: string[];
    alwaysAddComponentSuffix: boolean;
    usePrettierIfAvailable: boolean;
}
