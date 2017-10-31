/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    let ExportingView;
    const bs          = require('bootstrap');

    const sm          = require('app/views/base');
    const ExportUtils = require('app/util/export');

    const FORMATS = [
        {id: 'kml', text: 'KML', description: 'Google Maps, Google Earth, GIS'},
        {id: 'json', text: 'JSON', description: 'Developers'}
    ];

    return ExportingView = (function() {
        ExportingView = class ExportingView extends sm.SMItemView {
            static initClass() {
                this.prototype.template = 'export';
                this.prototype.id = 'exporting-modal';
                this.prototype.className = 'modal-dialog content export';
                this.prototype.events = {
                    "change input[name='options']": "inputChange",
                    'click #exporting-submit': 'close'
                };
            }
            initialize(models) {
                this.models = models;
                return this.activeFormat = 'kml';
            }
            serializeData() {
                const activeFormat = _(FORMATS).filter(f => f.id === this.activeFormat)[0];
                return {
                    formats: FORMATS,
                    specs: ExportUtils.exportSpecification(activeFormat.id, this.models),
                    activeFormat
                };
            }

            inputChange(ev) {
                this.activeFormat = $(ev.currentTarget).data('format');
                return this.render();
            }
            close(ev) {
                this.$el.closest('.modal').modal('hide');
                return true;
            }
        };
        ExportingView.initClass();
        return ExportingView;
    })();
});
