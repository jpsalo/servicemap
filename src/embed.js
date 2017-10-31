/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    const Backbone     = require('backbone');
    const Marionette   = require('backbone.marionette');
    const $            = require('jquery');
    const iexhr        = require('iexhr');
    const i18n         = require('i18next');
    const URI          = require('URI');
    const Bootstrap    = require('bootstrap');

    const Router       = require('app/router');
    const BaseControl  = require('app/control');
    const TitleBarView = require('app/embedded-views');
    const widgets      = require('app/widgets');
    const models       = require('app/models');
    const p13n         = require('app/p13n');
    const ColorMatcher = require('app/color');
    const BaseMapView  = require('app/map-base-view');
    const map          = require('app/map');
    const TitleView    = require('app/views/embedded-title');

    const PAGE_SIZE = 1000;

    const app = new Backbone.Marionette.Application();
    window.app = app;

    const fullUrl = function() {
        const currentUri = URI(window.location.href);
        return currentUri.segment(0, "").toString();
    };

    const ICON_SIZE = 40;
    class EmbeddedMapView extends BaseMapView {
        static initClass() {
            this.prototype.mapOptions = {
                dragging: true,
                touchZoom: true,
                scrollWheelZoom: false,
                doubleClickZoom: true,
                boxZoom: false
            };
        }
        getIconSize() {
            if (($(window).innerWidth() < 150) || ($(window).innerHeight < 150)) {
                return ICON_SIZE * 0.5;
            }
            return ICON_SIZE;
        }
        postInitialize() {
            super.postInitialize();
            const zoom = L.control.zoom({
                position: 'bottomright',
                zoomInText: "<span class=\"icon-icon-zoom-in\"></span>",
                zoomOutText: "<span class=\"icon-icon-zoom-out\"></span>"
            });
            const logo = new widgets.ControlWrapper(new TitleView({href: fullUrl()}), {position: 'bottomleft', autoZIndex: false});
            zoom.addTo(this.map);
            logo.addTo(this.map);
            this.allMarkers.on('click', l => {
                const root = URI(window.location.href).host();
                if ((l.layer != null ? l.layer.unit : undefined) != null) {
                    return window.open(`http://${root}/unit/` + l.layer.unit.get('id'));
                } else {
                    return window.open(fullUrl());
                }
            });
            this.allMarkers.on('clusterclick', () => {
                return window.open(fullUrl());
            });
            return this.listenTo(appState.selectedUnits, 'reset', o => {
                if (__guard__(o != null ? o.first() : undefined, x => x.get('selected'))) {
                    return this.highlightSelectedUnit(o.first());
                }
            });
        }

        clusterPopup(event) {
            const cluster = event.layer;
            const childCount = cluster.getChildCount();
            const popup = this.createPopup();
            const html = `\
<div class='servicemap-prompt'>
    ${i18n.t('embed.click_prompt_move')}
</div>\
`;
            popup.setContent(html);
            popup.setLatLng(cluster.getBounds().getCenter());
            return popup;
        }
        createPopup(unit) {
            const popup = L.popup({offset: L.point(0, 30), closeButton: false, maxWidth: 300, minWidth: 120, autoPan: false});
            if (unit != null) {
                const htmlContent = `\
<div class='unit-name'>${unit.getText('name')}</div>\
`;
                popup.setContent(htmlContent);
            }
            return popup;
        }
        getFeatureGroup() {
            return L.markerClusterGroup({
                showCoverageOnHover: false,
                maxClusterRadius: zoom => {
                    if (zoom >= map.MapUtils.getZoomlevelToShowAllMarkers()) { return 4; } else { return 30; }
                },
                iconCreateFunction: cluster => {
                    return this.createClusterIcon(cluster);
                },
                zoomToBoundsOnClick: false
            });
        }
        handlePosition(positionObject) {
            const { accuracy } = location;
            const latLng = map.MapUtils.latLngFromGeojson(positionObject);
            const marker = map.MapUtils.createPositionMarker(latLng, accuracy, positionObject.origin(), {clickable: true});
            marker.position = positionObject;
            const popup = L.popup({offset: L.point(0, 40), closeButton: false});
            const name = positionObject.humanAddress();
            popup.setContent(`<div class='unit-name'>${name}</div>`);
            marker.bindPopup(popup);
            marker.addTo(this.map);
            if (this.map.adapt()) {
                this.map.once('zoomend', () => {
                    return app.request('showAllUnits', null);
                });
            }
            marker.openPopup();
            return marker.on('click', () => window.open(fullUrl()));
        }
    }
    EmbeddedMapView.initClass();

    var appState = {
        // TODO handle pagination
        divisions: new models.AdministrativeDivisionList,
        units: new models.UnitList(null, {pageSize: 500}),
        selectedUnits: new models.UnitList(),
        selectedPosition: new models.WrappedModel(),
        selectedDivision: new models.WrappedModel(),
        selectedServices: new models.ServiceList(),
        searchResults: new models.SearchList([], {pageSize: appSettings.page_size}),
        level: null
    };

    appState.services = appState.selectedServices;
    window.appState = appState;

    app.addInitializer(function(opts) {
        // The colors are dependent on the currently selected services.
        this.colorMatcher = new ColorMatcher;
        const control = new BaseControl(appState);
        const router = new Router({
            controller: control,
            makeMapView: mapOptions => {
                const mapView = new EmbeddedMapView({opts: appState, mapOpts: mapOptions, embedded: true});
                app.getRegion('map').show(mapView);
                return control.setMapProxy(mapView.getProxy());
            }
        });

        const baseRoot = `${appSettings.url_prefix}embed`;
        const root = baseRoot + '/';
        if (!(window.history && history.pushState)) {
          const rootRegexp = new RegExp(baseRoot + '\/?');
          let url = window.location.href;
          url = url.replace(rootRegexp, '/');
          const currentUri = URI(url);
          currentUri;
          router.routeEmbedded(currentUri);
        } else {
            Backbone.history.start({
                pushState: true, root});
        }
        const { reqres } = Backbone.Wreqr.radio.channel('global');
        reqres.setHandler('addUnitsWithinBoundingBoxes', bboxes => {
            return control.addUnitsWithinBoundingBoxes(bboxes);
        });
        return reqres.setHandler('showAllUnits', level => {
            return control.showAllUnits(level);
        });
    });

    app.addRegions({
        navigation: '#navigation-region',
        map: '#app-container'
    });

    // We wait for p13n/i18next to finish loading before firing up the UI
    return $.when(p13n.deferred).done(function() {
        app.start();
        const $appContainer = $('#app-container');
        $appContainer.attr('class', p13n.get('map_background_layer'));
        return $appContainer.addClass('embed');
    });
});

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}