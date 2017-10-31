/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    let MapStateModel;
    const L          = require('leaflet');
    const Backbone   = require('backbone');

    const {MapUtils} = require('app/map');

    const VIEWPOINTS = {
        // meters to show everything within in every direction
        singleUnitImmediateVicinity: 200,
        singleObjectEmbedded: 400
    };

    const _latitudeDeltaFromRadius = radiusMeters => (radiusMeters / 40075017) * 360;

    const _longitudeDeltaFromRadius = (radiusMeters, latitude) => _latitudeDeltaFromRadius(radiusMeters) / Math.cos(L.LatLng.DEG_TO_RAD * latitude);

    const boundsFromRadius = function(radiusMeters, latLng) {
        const delta = L.latLng(_latitudeDeltaFromRadius(radiusMeters),
            _longitudeDeltaFromRadius(radiusMeters, latLng.lat));
        const min = L.latLng(latLng.lat - delta.lat, latLng.lng - delta.lng);
        const max = L.latLng(latLng.lat + delta.lat, latLng.lng + delta.lng);
        return L.latLngBounds([min, max]);
    };

    return (MapStateModel = class MapStateModel extends Backbone.Model {
        // Models map center, bounds and zoom in a unified way.
        constructor(...args) {
            {
              // Hack: trick Babel/TypeScript into allowing this before super.
              if (false) { super(); }
              let thisFn = (() => { this; }).toString();
              let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
              eval(`${thisName} = this;`);
            }
            this.onSelectPosition = this.onSelectPosition.bind(this);
            super(...args);
        }

        initialize(opts, embedded) {
            this.opts = opts;
            this.embedded = embedded;
            this.userHasModifiedView = false;
            this.wasAutomatic = false;
            this.zoom = null;
            this.bounds = null;
            this.center = null;

            return this.listenTo(this.opts.selectedPosition, 'change:value', this.onSelectPosition);
        }

        setMap(map) {
            this.map = map;
            this.map.mapState = this;
            return this.map.on('moveend', _.bind(this.onMoveEnd, this));
        }

        onSelectPosition(position) {
            if (position.isSet()) { return this.setUserModified(); }
        }

        onMoveEnd() {
            if (!this.wasAutomatic) {
                this.setUserModified();
            }
            return this.wasAutomatic = false;
        }

        setUserModified() {
            return this.userHasModifiedView = true;
        }

        adaptToLayer(layer) {
            return this.adaptToBounds(layer.getBounds());
        }

        adaptToBounds(bounds) {
            const mapBounds = this.map.getBounds();
            // Don't pan just to center the view if the bounds are already
            // contained, unless the map can be zoomed in.
            if ((bounds != null) && ((this.map.getZoom() === this.map.getBoundsZoom(bounds)) && mapBounds.contains(bounds))) {
                return false;
            }

            if (this.opts.route != null ? this.opts.route.has('plan') : undefined) {
                // Transit plan fitting is the simplest case, handle it and return.
                if (bounds != null) {
                    this.map.fitBounds(bounds, {
                        paddingTopLeft: [20,0],
                        paddingBottomRight: [20,20]
                    });
                }
                return false;
            }

            let viewOptions = {
                center: null,
                zoom: null,
                bounds: null
            };
            const zoom = Math.max(MapUtils.getZoomlevelToShowAllMarkers(), this.map.getZoom());
            const EMBED_RADIUS = VIEWPOINTS['singleObjectEmbedded'];
            if (this.opts.selectedUnits.isSet()) {
                if (this.embedded === true) {
                    viewOptions.zoom = null;
                    viewOptions.bounds = boundsFromRadius(EMBED_RADIUS,
                        MapUtils.latLngFromGeojson(this.opts.selectedUnits.first()));
                } else {
                    viewOptions.center = MapUtils.latLngFromGeojson(this.opts.selectedUnits.first());
                    viewOptions.zoom = zoom;
                }
            } else if (this.opts.selectedPosition.isSet()) {
                if (this.embedded === true) {
                    viewOptions.zoom = null;
                    viewOptions.bounds = boundsFromRadius(EMBED_RADIUS,
                        MapUtils.latLngFromGeojson(this.opts.selectedPosition.value()));
                } else {
                    viewOptions.center = MapUtils.latLngFromGeojson(this.opts.selectedPosition.value());
                    const radiusFilter = this.opts.selectedPosition.value().get('radiusFilter');
                    if (radiusFilter != null) {
                        viewOptions.zoom = null;
                        viewOptions.bounds = bounds;
                    } else {
                        viewOptions.zoom = zoom;
                    }
                }
            }

            if (this.opts.selectedDivision.isSet()) {
                viewOptions = this._widenToDivision(this.opts.selectedDivision.value(), viewOptions);
            }
            if (this.opts.services.size() || (this.opts.searchResults.size() && this.opts.selectedUnits.isEmpty())) {
                if (bounds != null) {
                    if (!this.opts.selectedPosition.isEmpty() || !mapBounds.contains(bounds)) {
                        if (this.embedded === true) {
                            this.map.fitBounds(bounds);
                            return true;
                        } else {
                            // Only zoom in, unless current map bounds is empty of units.
                            const unitsInsideMap = this._objectsInsideBounds(mapBounds, this.opts.units);
                            if (!this.opts.selectedPosition.isEmpty() || !unitsInsideMap) {
                                viewOptions = this._widenViewMinimally(this.opts.units, viewOptions);
                            }
                        }
                    }
                }
            }

            return this.setMapView(viewOptions);
        }

        setMapView(viewOptions) {
            if (viewOptions == null) {
                return false;
            }
            const { bounds } = viewOptions;
            if (bounds) {
                // Don't pan just to center the view if the bounds are already
                // contained, unless the map can be zoomed in.
                if ((this.map.getZoom() === this.map.getBoundsZoom(bounds)) &&
                    this.map.getBounds().contains(bounds)) { return; }
                this.map.fitBounds(viewOptions.bounds, {
                    paddingTopLeft: [20, 0],
                    paddingBottomRight: [20, 20]
                });
                return true;
            } else if (viewOptions.center && viewOptions.zoom) {
                this.map.setView(viewOptions.center, viewOptions.zoom);
                return true;
            }
        }

        centerLatLng(latLng, opts) {
            let zoom = this.map.getZoom();
            if (this.opts.selectedPosition.isSet()) {
                zoom = MapUtils.getZoomlevelToShowAllMarkers();
            } else if (this.opts.selectedUnits.isSet()) {
                zoom = MapUtils.getZoomlevelToShowAllMarkers();
            }
            return this.map.setView(latLng, zoom);
        }

        adaptToLatLngs(latLngs) {
            if (latLngs.length === 0) {
                return;
            }
            return this.adaptToBounds(L.latLngBounds(latLngs));
        }

        _objectsInsideBounds(bounds, objects) {
            return objects.find(function(object) {
                const latLng = MapUtils.latLngFromGeojson((object));
                if (latLng != null) {
                    return bounds.contains(latLng);
                }
                return false;
            });
        }

        _widenToDivision(division, viewOptions) {
            const mapBounds = this.map.getBounds();
            viewOptions.center = null;
            viewOptions.zoom = null;
            const bounds = L.latLngBounds(L.GeoJSON.geometryToLayer(division.get('boundary'), null, null, {}).getBounds());
            if (mapBounds.contains(bounds)) {
                viewOptions = null;
            } else {
                viewOptions.bounds = bounds;
            }
            return viewOptions;
        }

        _widenViewMinimally(units, viewOptions) {
            const UNIT_COUNT = 2;
            const mapBounds = this.map.getBounds();
            const center = viewOptions.center || this.map.getCenter();
            const sortedUnits =
                units.chain()
                .filter(unit => unit.has('location'))
                // TODO: profile?
                .sortBy(unit => center.distanceTo(MapUtils.latLngFromGeojson(unit)))
                .value();

            let topLatLngs = [];
            const unitsFound = {};
            if (this.opts.services.size()) {
                _.each(this.opts.services.pluck('id'), id => {
                    return unitsFound[id] = UNIT_COUNT;
                });

                // We want to have at least UNIT_COUNT visible units
                // per service.
                for (let unit of Array.from(sortedUnits)) {
                    if (_.isEmpty(unitsFound)) {
                        break;
                    }
                    const service = unit.collection.filters != null ? unit.collection.filters.service : undefined;
                    if (service != null) {
                        const countLeft = unitsFound[service];
                        if (countLeft != null) {
                            unitsFound[service] -= 1;
                            if (unitsFound[service] === 0) {
                                delete unitsFound[service];
                            }
                        }
                        topLatLngs.push(MapUtils.latLngFromGeojson(unit));
                    }
                }
            // All of the search results have to be visible.
            } else if (this.opts.searchResults.isSet()) {
                topLatLngs = _(sortedUnits).map(unit => {
                    return MapUtils.latLngFromGeojson(unit);
                });
            }
            if (sortedUnits != null ? sortedUnits.length : undefined) {
                viewOptions.bounds =
                    L.latLngBounds(topLatLngs)
                    .extend(center);
                viewOptions.center = null;
                viewOptions.zoom = null;
            }

            return viewOptions;
        }


        zoomIn() {
            this.wasAutomatic = true;
            return this.map.setZoom(this.map.getZoom() + 1);
        }
    });
});
