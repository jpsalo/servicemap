/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    const Marionette   = require('backbone.marionette');
    const $            = require('jquery');

    const models       = require('app/models');
    const Spinner      = require('app/spinner');
    const TitleBarView = require('app/embedded-views');

    const PAGE_SIZE = 1000;
    const delayTime = 1000;
    const spinner = new Spinner({
        container: document.body});
    //TODO enable title bar and loading spinner
    class Router extends Marionette.AppRouter {
        execute(callback, args) {
            _.delay(this.indicateLoading, delayTime);
            const model = callback.apply(this, args);
            this.listenTo(model, 'sync', this.removeLoadingIndicator);
            return this.listenTo(model, 'finished', this.removeLoadingIndicator);
        }

        _parseParameters(params) {
            const parsedParams = {};
            _(params.split('&')).each(query => {
                let [k, v] = Array.from(query.split('=', 2));
                if (v.match(/,/)) {
                    v = v.split(',');
                } else {
                    v = [v];
                }
                return parsedParams[k] = v;
            });
            parsedParams;

        // renderUnitsWithFilter: (params) ->
        //     @listenToOnce @appState.units, 'finished', =>
        //         @drawUnits @appState.units
        //     units =  @appState.units
        //     params = @_parseParameters params
        //     key = 'division'
        //     divIds = params.divisions
            if (_(params).has('titlebar')) { // TODO enable
                return app.getRegion('navigation').show(new TitleBarView(this.appState.divisions));
            }
        }
            // @_fetchDivisions divIds
            // units

        indicateLoading() {
            return spinner.start();
        }

        removeLoadingIndicator() {
            return (spinner != null ? spinner.stop() : undefined);
        }
    }

    return Router;
});
