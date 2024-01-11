import { PluginConfig } from '../models/pluginConfig';

const config: PluginConfig = {
    acceptedNodeEnvs: ['development'],
    verboseLogs: false,
    alwaysAddEnumSuffix: false,
    contentTypesToIgnore: ['plugin::upload.folder', 'plugin::i18n.locale', /plugin::content-releases\..*/, 'plugin::users-permissions.permission'],
    alwaysAddComponentSuffix: false,
    usePrettierIfAvailable: true,
};

export default {
    default: config,
    validator(config: PluginConfig) {},
};
