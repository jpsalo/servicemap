/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS206: Consider reworking classes to avoid initClass
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    const MapView        = require('app/map-view');
    const base           = require('app/views/base');
    const RouteView      = require('app/views/route');
    const {getIeVersion} = require('app/base');

    class DetailsView extends base.SMLayout {
        static initClass() {
            this.prototype.id = 'details-view-container';
            this.prototype.className = 'navigation-element';
            this.prototype.regions =
                {'routeRegion': '.section.route-section'};
            this.prototype.events = {
                'click .collapse-button': 'toggleCollapse',
                'click .map-active-area': 'showMap',
                'click .mobile-header': 'showContent',
                'show.bs.collapse': 'scrollToExpandedSection',
                'hide.bs.collapse': '_removeLocationHash'
            };
        }

        initialize(options) {
            this.selectedPosition = options.selectedPosition;
            this.routingParameters = options.routingParameters;
            return this.route = options.route;
        }

        hideContents() {
            return this.$el.find('.content').hide();
        }

        showContents() {
            return this.$el.find('.content').show();
        }

        onShow() {
            this.listenTo(app.vent, 'hashpanel:render', function(hash) { return this._triggerPanel(hash); });
            return __guard__(this.getRegion('routeRegion'), x => x.show(new RouteView({
                model: this.model,
                route: this.route,
                parentView: this,
                routingParameters: this.routingParameters,
                selectedUnits: this.selectedUnits || null,
                selectedPosition: this.selectedPosition
            })
            ));
        }

        showMap(event) {
            event.preventDefault();
            this.$el.addClass('minimized');
            return MapView.setMapActiveAreaMaxHeight({maximize: true});
        }

        showContent(event) {
            event.preventDefault();
            this.$el.removeClass('minimized');
            return MapView.setMapActiveAreaMaxHeight({maximize: false});
        }

        scrollToExpandedSection(event) {
            const $container = this.$el.find('.content').first();
            const $target = $(event.target);
            this._setLocationHash($target);

            // Don't scroll if route leg is expanded.
            if ($target.hasClass('steps')) { return; }
            const $section = $target.closest('.section');
            const scrollTo = $container.scrollTop() + $section.position().top;
            return $('#details-view-container .content').animate({scrollTop: scrollTo});
        }

        _removeLocationHash(event) {
            if (!this._checkIEversion()) { return window.location.hash = ''; }
        }

        _setLocationHash(target) {
            if (!this._checkIEversion()) { return window.location.hash = `!${target.attr('id')}`; }
        }

        _checkIEversion() {
            return getIeVersion() && (getIeVersion() < 10);
        }

        _triggerPanel(hash) {
            return _.defer(() => {
                if (hash.length < 3) { return; }
                const $triggerElem = $(`a[href='${hash}']`);
                if ($triggerElem.length === 1) {
                    return $triggerElem.trigger('click').attr('tabindex', -1).focus();
                }
            });
        }
    }
    DetailsView.initClass();

    return DetailsView;
});

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}