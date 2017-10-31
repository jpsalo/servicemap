/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    let FeedbackConfirmationView;
    const base = require('app/views/base');

    return FeedbackConfirmationView = (function() {
        FeedbackConfirmationView = class FeedbackConfirmationView extends base.SMItemView {
            static initClass() {
                this.prototype.template = 'feedback-confirmation';
                this.prototype.className = 'content modal-dialog';
                this.prototype.events =
                    {'click .ok-button': '_close'};
            }
            initialize(unit) {
                this.unit = unit;
            }
            serializeData() {
                let unit;
                if ((this.unit != null ? this.unit.toJSON : undefined) != null) {
                    unit = this.unit.toJSON();
                } else {
                    unit = {};
                }
                return {unit};
            }
            _close() {
                return app.request('closeFeedback');
            }
        };
        FeedbackConfirmationView.initClass();
        return FeedbackConfirmationView;
    })();
});
