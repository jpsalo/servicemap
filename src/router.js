/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    let BaseRouter;
    const Marionette  = require('backbone.marionette');
    const URI         = require('URI');

    const CancelToken = require('app/cancel-token');

    return (BaseRouter = class BaseRouter extends Backbone.Marionette.AppRouter {
        initialize(options) {
            super.initialize(options);
            this.controller = options.controller;
            this.makeMapView = options.makeMapView;
            this.appRoute(/^\/?([^\/]*)$/, 'renderHome');
            this.appRoute(/^unit\/?([^\/]*)$/, 'renderUnit');
            this.appRoute(/^division\/?(.*?)$/, 'renderDivision');
            this.appRoute(/^address\/(.*?)$/, 'renderAddress');
            this.appRoute(/^search(\?[^\/]*)$/, 'renderSearch');
            return this.appRoute(/^division(\?.*?)$/, 'renderMultipleDivisions');
        }

        onPostRouteExecute(context) {
            if (__guard__(context != null ? context.query : undefined, x => x.heatmap_layer) != null) {
                app.request('addDataLayer', 'heatmap_layer', context.query.heatmap_layer);
            }
            if (__guard__(context != null ? context.query : undefined, x1 => x1.statistics_layer) != null) {
                return app.request('showDivisions', null, context.query.statistics_layer);
            }
        }

        executeRoute(callback, args, context) {
            return __guard__(callback != null ? callback.apply(this, args) : undefined, x => x.done(opts => {
                const mapOpts = {};
                if (context.query != null) {
                    mapOpts.bbox = context.query.bbox;
                    mapOpts.level = context.query.level;
                    if (context.query.municipality != null) {
                        mapOpts.fitAllUnits = true;
                    }
                }
                this.makeMapView(mapOpts);
                __guardMethod__(opts, 'afterMapInit', o => o.afterMapInit());
                return this.onPostRouteExecute(context);
            }));
        }

        processQuery(q) {
            if ((q.bbox != null) && q.bbox.match(/([0-9]+\.?[0-9+],)+[0-9]+\.?[0-9+]/)) {
                q.bbox = q.bbox.split(',');
            }
            if ((q.ocd_id != null) && q.ocd_id.match(/([^,]+,)*[^,]+/)) {
                q.ocdId = q.ocd_id.split(',');
                delete q.ocd_id;
            }
            return q;
        }

        execute(callback, args) {
            // The map view must only be initialized once
            // the state encoded in the route URL has been
            // reconstructed. The state affects the map
            // centering, zoom, etc.o
            let newArgs;
            const context = {};
            const lastArg = args[args.length - 1];
            const fullUri = new URI(window.location.toString());
            if (!(args.length < 1) && (lastArg !== null)) {
                newArgs = URI(lastArg).segment();
            } else {
                newArgs = [];
            }
            if (fullUri.query()) {
                context.query = this.processQuery(fullUri.search(true));
                if (context.query.map != null) {
                    p13n.setMapBackgroundLayer(context.query.map);
                }
                // Explanation of the difference of municipality vs. city query parameters.
                // ------------------------------------------------------------------------
                // The city parameter can be used by a city to create a link to
                // the application with the p13n city pre-selected.
                // The municipality parameter always overrides any p13n cities
                // and so can be used to create links with explicit
                // municipality filtering regardless of the user's preferences.
                //
                // For historical reasons, the embed urls use 'city', although
                // the embeds should never load or save any persistent p13n
                // values.
                if (context.query.city != null) {
                    if (appSettings.is_embedded === true) {
                        // We do not want the embeds to affect the users
                        // persistent settings
                        context.query.municipality = context.query.city;
                    } else {
                        // For an entry through a link with a city
                        // shortcut, the p13n change should be permanent.
                        const cities = context.query.city.split(',');
                        p13n.setCities(cities);
                    }
                }
            }

            newArgs.push(context);
            newArgs.push(new CancelToken());
            return this.executeRoute(callback, newArgs, context);
        }

        routeEmbedded(uri) {
            // An alternative implementation of 'static' routing
            // for browsers without pushState when creating
            // an embedded view.
            const path = uri.segment();
            const resource = path[0];
            let callback = (() => {
                if (resource === 'division') {
                if ('ocd_id' in uri.search(true)) {
                    return 'renderMultipleDivisions';
                } else {
                    return 'renderDivision';
                }
            } else {
                switch (resource) {
                    case '': return 'renderHome';
                    case 'unit': return 'renderUnit';
                    case 'search': return 'renderSearch';
                    case 'address': return 'renderAddress';
                }
            }
            })();
            uri.segment(0, ''); // remove resource from path
            const relativeUri = new URI(uri.pathname() + uri.search());
            callback = _.bind(this.controller[callback], this.controller);
            return this.execute(callback, [relativeUri.toString()]);
        }
    });});

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}
function __guardMethod__(obj, methodName, transform) {
  if (typeof obj !== 'undefined' && obj !== null && typeof obj[methodName] === 'function') {
    return transform(obj, methodName);
  } else {
    return undefined;
  }
}