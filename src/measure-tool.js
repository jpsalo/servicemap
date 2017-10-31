/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    let MeasureTool;
    const _                      = require('underscore');

    const widgets                = require('app/widgets');
    const MeasureCloseButtonView = require('app/views/measure-close-button');

    return (MeasureTool = class MeasureTool {
        constructor(map) {
            this.measureAddPoint = this.measureAddPoint.bind(this);
            this.activate = this.activate.bind(this);
            this.resetMeasureTool = this.resetMeasureTool.bind(this);
            this.updateDistance = this.updateDistance.bind(this);
            this.updateLine = this.updateLine.bind(this);
            this.deactivate = this.deactivate.bind(this);
            this.followCursor = this.followCursor.bind(this);
            this.createCursorTip = this.createCursorTip.bind(this);
            this.removeCursorTip = this.removeCursorTip.bind(this);
            this.map = map;
            this.isActive = null;
        }

        measureAddPoint(ev) {
            // Disable selecting/unselecting positions
            //@infoPopups.clearLayers()
            //@map.removeLayer @userPositionMarkers['clicked']
            //@hasClickedPosition = false

            const newPoint = new L.marker(ev.latlng, {
                draggable:true,
                icon: new L.DivIcon({
                    iconSize: L.point([50,50]),
                    iconAnchor: L.point([25,56]),
                    popupAnchor: L.point([10,-50]),
                    className:"measure-tool-marker",
                    html: "<span class=icon-icon-address></span>"
                })
            });
            newPoint.on('drag', () => {
                this.updateLine();
                return this.updateDistance();
            });
            newPoint.on('dragend', this.updateDistance);
            newPoint.addTo(this.map);
            this.removeCursorTip();
            newPoint.bindPopup("<div class='measure-distance'></div>", {closeButton: false});
            newPoint.openPopup();
            this._markers.push(newPoint);
            this.updateLine();
            return this.updateDistance();
        }

        // Enables measuring distances by clicking the map
        activate() {
            $("#map").addClass('measure-tool-active');
            this.isActive = true;
            this.resetMeasureTool();
            // Marker points on measured route
            this._markers = [];
            // Polyline for measured route
            this._polyline = new L.polyline([], {className: "measure-tool-polyline", weight: 4});
            this._polyline.addTo(this.map);
            this.map.on('click', this.measureAddPoint);
            // Remove existing close button
            $('.measure-close-button').remove();
            // Add close button to control area
            this._closeButton = new widgets.ControlWrapper(new MeasureCloseButtonView(), {position: 'bottomright'});
            this._closeButton.addTo(this.map);
            return this.createCursorTip();
        }

        resetMeasureTool() {
            if (this._polyline) {
                this.map.removeLayer(this._polyline);
            }
            if (this._markers) {
                this._markers.map(m => {
                    return this.map.removeLayer(m);
                });
            }
            this._markers = [];
            return this._points = [];
        }

        // Calculates the measured distance and shows the result in popup over the
        // final marker
        updateDistance() {
            let dist = 0;
            this._markers.map(function(m, index, arr) {
                if (index !== 0) {
                    return dist += m._latlng.distanceTo(arr[index-1]._latlng);
                }
            });
            if (!(this._markers.length < 1)) {
                this._markers[this._markers.length - 1].setPopupContent(`<div class='unit-name'>${dist.toFixed(0)}m</div>`);
                return this._markers[this._markers.length - 1].openPopup();
            }
        }

        // Adapts the polyline to marker positions
        updateLine() {
            const points = [];
            this._markers.map(m => points.push(m._latlng));
            return this._polyline = this._polyline.setLatLngs(points);
        }

        // Deactivates measuring tool
        deactivate() {
            $("#map").removeClass('measure-tool-active');
            this.isActive = false;
            this.resetMeasureTool();
            this.map.off('click', this.measureAddPoint);
            this._closeButton.view.$el.remove();
            return this.removeCursorTip();
        }

        followCursor(ev) {
            return this.$tip.css({
                left: ev.pageX - (this.$tip.width() / 2),
                top: ev.pageY - 30
            });
        }

        createCursorTip() {
            this.$tip = $("<div>", {id: 'measure-start', text: i18n.t('measuring_tool.start_tip')});
            $('body').append(this.$tip);
            return $(document).on('mousemove', this.followCursor);
        }

        removeCursorTip() {
            $(document).off('mousemove', this.followCursor);
            return this.$tip.remove();
        }

        getLastMarker() {
            return this._markers[this._markers.length - 1];
        }
    });});

