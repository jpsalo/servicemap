/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    let EventDetailsView;
    const dateformat = require('app/dateformat');
    const base       = require('app/views/base');

    return EventDetailsView = (function() {
        EventDetailsView = class EventDetailsView extends base.SMLayout {
            static initClass() {
                this.prototype.id = 'event-view-container';
                this.prototype.className = 'navigation-element';
                this.prototype.template = 'event';
                this.prototype.events = {
                    'click .back-button': 'goBack',
                    'click .sp-name a': 'goBack'
                };
                this.prototype.type = 'event';
            }

            initialize(options) {
                this.embedded = options.embedded;
                return this.servicePoint = this.model.get('unit');
            }

            serializeData() {
                const data = this.model.toJSON();
                data.embedded_mode = this.embedded;
                const startTime = this.model.get('start_time');
                const endTime = this.model.get('end_time');
                data.datetime = dateformat.humanizeEventDatetime(
                    startTime, endTime, 'large');
                if (this.servicePoint != null) {
                    data.sp_name = this.servicePoint.get('name');
                    data.sp_url = this.servicePoint.get('www_url');
                    data.sp_phone = this.servicePoint.get('phone');
                } else {
                    data.sp_name = this.model.get('location_extra_info');
                    data.prevent_back = true;
                }
                return data;
            }

            goBack(event) {
                event.preventDefault();
                app.request('clearSelectedEvent');
                return app.request('selectUnit', this.servicePoint, {});
            }
        };
        EventDetailsView.initClass();
        return EventDetailsView;
    })();});
