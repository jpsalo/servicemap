/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS203: Remove `|| {}` from converted for-own loops
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    let SMPrinter;
    const i18n           = require('i18next');
    let leafletImage   = require('leaflet-image');
    const leafletImageIe = require('leaflet-image-ie');

    const jade           = require('app/jade');
    const p13n           = require('app/p13n');
    const sm             = require('app/base');
    const draw           = require('app/draw');

    const MAP_IMG_ELEMENT_ID = 'map-as-png';

    const ieVersion = sm.getIeVersion();
    if (ieVersion === 10) {
        leafletImage = leafletImageIe;
    }

    return (SMPrinter = class SMPrinter {
        constructor(mapView) {
            // Webkit
            this.printMap = this.printMap.bind(this);
            this.afterPrint = this.afterPrint.bind(this);
            this.mapView = mapView;
            if (window.matchMedia) {
                const mediaQueryList = window.matchMedia('print');
                mediaQueryList.addListener(mql => {
                    if (mql.matches) {
                        return this.printMap();
                    } else {
                        return this.afterPrint();
                    }
                });
            }

            // IE + FF
            window.onbeforeprint = () => this.printMap();
            window.onafterprint = () => this.afterPrint();
        }

        printMap(notOnBeforePrint) {
            if (!notOnBeforePrint && !document.getElementById('map-as-png')) {
                alert(i18n.t('print.use_print_button'));
                return;
            }
            if (this.makingPrint || (this.printed === false)) {
                return;
            }

            this.makingPrint = true;
            this.printed = false;

            const { map } = this.mapView;
            const markers = this.mapView.allMarkers._featureGroup._layers;

            const getClusteredUnits = markerCluster => _.map(markerCluster.getAllChildMarkers(), mm => mm.unit);

            const mapBounds = map._originalGetBounds();

            let vid = 0;
            const descriptions = [];
            for (let id of Object.keys(markers || {})) {
                var units;
                const marker = markers[id];
                if (!mapBounds.contains(marker.getLatLng())) { continue; }

                // Settings altered for printing. These will be reset after printing.
                const printStore =
                    {storeAttributes: ['iconSize', 'iconAnchor']};
                for (let att of Array.from(printStore.storeAttributes)) {
                    if (marker.options.icon.options[att]) {
                        printStore[att] = marker.options.icon.options[att];
                    }
                }
                marker.options.icon.options.printStore = printStore;

                // Icon size smaller than 70 causes clusters to misbehave when zooming in after printing
                const iconSize = 70;
                marker.options.icon.options.iconSize = new L.Point(iconSize, iconSize);
                // Adjust the icon anchor to correct place
                marker.options.icon.options.iconAnchor = new L.Point((3*iconSize)/4, iconSize/4);

                marker.vid = ++vid;
                // Don't throw the actual icon away
                marker._iconStore = marker._icon;

                const canvasIcon = document.createElement('canvas');
                canvasIcon.height = iconSize;
                canvasIcon.width = iconSize;
                const ctx = canvasIcon.getContext('2d');
                const drawer = new draw.NumberCircleMaker(iconSize/2);
                drawer.drawNumberedCircle(ctx, marker.vid);
                marker._icon = canvasIcon;
                marker._icon.src = canvasIcon.toDataURL();

                const description = {};
                description.number = marker.vid;

                if (marker instanceof L.MarkerCluster) {
                    // Adjust the icon anchor position for clusters with these magic numbers
                    marker.options.icon.options.iconAnchor = new L.Point((5*iconSize)/6, iconSize / 6);
                    units = getClusteredUnits(marker);
                    description.units = _.map(units, u => u.toJSON());
                } else {
                    description.units = [marker.unit.toJSON()];
                }

                descriptions.push(description);
            }

            const tableHtml = jade.template('print-table', {descriptions});
            const printLogo = `<h1 id=\"print-logo\">${document.location.hostname}</h1>`;
            document.body.insertAdjacentHTML('afterBegin', printLogo);
            document.body.insertAdjacentHTML('beforeEnd', tableHtml);

            return leafletImage(map, (err, canvas) => {
                if (err) {
                    throw err;
                }
                // add the image to DOM
                const img = document.createElement('img');
                img.src = canvas.toDataURL();
                img.id = MAP_IMG_ELEMENT_ID;
                document.getElementById('images').appendChild(img);
                this.makingPrint = false;
                if (notOnBeforePrint) {
                    return window.print();
                }
            });
        }

        afterPrint() {
            if (this.makingPrint) {
                setTimeout(afterPrint, 100);
                return;
            }

            const markers = window.mapView.allMarkers._featureGroup._layers;
            for (let id of Object.keys(markers || {})) {
                // Remove the printed marker icon
                const marker = markers[id];
                if (marker._iconStore) {
                    $(marker._icon).remove();
                    delete marker._icon;
                    marker._icon = marker._iconStore;
                    delete marker._iconStore;
                }
                // Reset icon options
                if (marker.options.icon.options.printStore) {
                    const { printStore } = marker.options.icon.options;
                    for (let att of Array.from(printStore.storeAttributes)) {
                        delete marker.options.icon.options[att];
                        if (printStore[att]) {
                            marker.options.icon.options[att] = printStore[att];
                        }
                    }
                    delete marker.options.icon.options.printStore;
                }
            }

            $('#map-as-png').remove();
            $('#list-of-units').remove();
            $('#print-logo').remove();
            return this.printed = true;
        }
    });
});
