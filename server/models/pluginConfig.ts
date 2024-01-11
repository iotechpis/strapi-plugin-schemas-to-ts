export interface PluginConfig {
    acceptedNodeEnvs: string[];
    verboseLogs: boolean;
    alwaysAddEnumSuffix: boolean;
    contentTypesToIgnore: (string | RegExp)[];
    alwaysAddComponentSuffix: boolean;
    usePrettierIfAvailable: boolean;
}
