/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    const sm     = require('app/base');
    const $      = require('jquery');
    const URI    = require('URI');
    const Raven  = require('raven');

    const BACKEND_BASE = appSettings.service_map_backend;

    const renderUnitsByOldServiceId = function(queryParameters, control, cancelToken) {
        const uri = URI(BACKEND_BASE);
        uri.segment('/redirect/unit/');
        uri.setSearch(queryParameters);
        return sm.withDeferred(deferred => {
            return $.ajax({
                url: uri.toString(),
                success: result => {
                    return control.renderUnit('', {query: result}, cancelToken).then(() => deferred.resolve());
                },
                error: result => {
                    Raven.captureMessage(
                        'No redirect found for old service', {
                        tags: {
                            type: 'helfi_rest_api_v4_redirect',
                            service_id: queryParameters.service
                        }
                    });
                    return deferred.resolve();
                }
            });
        });
    };

    return renderUnitsByOldServiceId;
});
