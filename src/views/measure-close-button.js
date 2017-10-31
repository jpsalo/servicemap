/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    let MeasureCloseButtonView;
    const i18n = require('i18next');

    const base = require('app/views/base');

    return MeasureCloseButtonView = (function() {
        MeasureCloseButtonView = class MeasureCloseButtonView extends base.SMLayout {
            static initClass() {
                this.prototype.template = 'measure-close-button';
                this.prototype.className = 'measure-close-button';
                this.prototype.events =
                    {'click': 'closeMeasure'};
            }

            serializeData() {
                return {closeText: i18n.t('measuring_tool.close')};
            }
            closeMeasure(ev) {
                ev.stopPropagation();
                ev.preventDefault();
                return app.request("deactivateMeasuringTool");
            }
            render() {
                super.render();
                return this.el;
            }
        };
        MeasureCloseButtonView.initClass();
        return MeasureCloseButtonView;
    })();
});
