/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    let TourStartButton;
    const base = require('app/views/base');
    const tour = require('app/tour');

    return TourStartButton = (function() {
        TourStartButton = class TourStartButton extends base.SMItemView {
            static initClass() {
                this.prototype.className = 'feature-tour-start';
                this.prototype.template = 'feature-tour-start';
                this.prototype.events = {
                    'click .close-button' : 'hideTour',
                    'click .prompt-button' : 'showTour'
                };
            }
            hideTour(ev) {
                p13n.set('hide_tour', true);
                this.trigger('close');
                return ev.stopPropagation();
            }
            showTour(ev) {
                tour.startTour();
                return this.trigger('close');
            }
        };
        TourStartButton.initClass();
        return TourStartButton;
    })();
});
