define(function(require) {
    const {getIeVersion} = require('app/base');

    const ieVersion = getIeVersion();

    const applyAjaxDefaults = function(settings) {
        settings.cache = true;
        if (!ieVersion) {
            return settings;
        }
        if (ieVersion >= 10) {
            return settings;
        }

        // JSONP for older IEs
        settings.dataType = 'jsonp';
        settings.data = settings.data || {};
        settings.data.format = 'jsonp';
        return settings;
    };

    return {
        applyAjaxDefaults
    };});
