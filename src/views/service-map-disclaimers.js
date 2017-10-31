/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    let ServiceMapAccessibilityDescriptionView, ServiceMapDisclaimersOverlayView, ServiceMapDisclaimersView;
    const {t}                 = require('i18next');

    const {SMItemView}        = require('app/views/base');
    const tour                = require('app/tour');
    const TourStartButtonView = require('app/views/feature-tour-start');

    return {
        ServiceMapDisclaimersView: (ServiceMapDisclaimersView = (function() {
            ServiceMapDisclaimersView = class ServiceMapDisclaimersView extends SMItemView {
                static initClass() {
                    this.prototype.template = 'description-of-service';
                    this.prototype.className = 'content modal-dialog about';
                    this.prototype.events = {
                        'click .feedback-link': 'openFeedback',
                        'click .accessibility-stamp': 'onStampClick',
                        'click .start-tour-button': 'onTourStart'
                    };
                }
                openFeedback(ev) {
                    return app.request('composeFeedback', null);
                }
                onStampClick(ev) {
                    app.request('showAccessibilityStampDescription');
                    return ev.preventDefault();
                }
                onTourStart(ev) {
                    $('#feedback-form-container').modal('hide');
                    tour.startTour();
                    app.getRegion('tourStart').currentView.trigger('close');
                    return this.remove();
                }
                serializeData() {
                    return {lang: p13n.getLanguage()};
                }
            };
            ServiceMapDisclaimersView.initClass();
            return ServiceMapDisclaimersView;
        })()),

        ServiceMapAccessibilityDescriptionView: (ServiceMapAccessibilityDescriptionView = (function() {
            ServiceMapAccessibilityDescriptionView = class ServiceMapAccessibilityDescriptionView extends SMItemView {
                static initClass() {
                    this.prototype.template = 'description-of-accessibility';
                    this.prototype.className = 'content modal-dialog about';
                    this.prototype.events =
                        {'click .uservoice-link': 'openUserVoice'};
                }
                serializeData() {
                    return {lang: p13n.getLanguage()};
                }
                onDomRefresh() {
                    return this.$el.scrollTop();
                }
            };
            ServiceMapAccessibilityDescriptionView.initClass();
            return ServiceMapAccessibilityDescriptionView;
        })()),

        ServiceMapDisclaimersOverlayView: (ServiceMapDisclaimersOverlayView = (function() {
            ServiceMapDisclaimersOverlayView = class ServiceMapDisclaimersOverlayView extends SMItemView {
                static initClass() {
                    this.prototype.template = 'disclaimers-overlay';
                    this.prototype.events = {
                        'click #about-the-service': 'onAboutClick',
                        'click #about-accessibility-stamp': 'onStampClick',
                        'click .accessibility-stamp': 'onStampClick'
                    };
                }
                serializeData() {
                    let copyrightLink;
                    const layer = p13n.get('map_background_layer');
                    if (['servicemap', 'accessible_map'].includes(layer)) {
                        copyrightLink = "https://www.openstreetmap.org/copyright";
                    }
                    return {
                        copyright: t(`disclaimer.copyright.${layer}`),
                        copyrightLink
                    };
                }
                onAboutClick(ev) {
                    app.request('showServiceMapDescription');
                    return ev.preventDefault();
                }
                onStampClick(ev) {
                    app.request('showAccessibilityStampDescription');
                    return ev.preventDefault();
                }
            };
            ServiceMapDisclaimersOverlayView.initClass();
            return ServiceMapDisclaimersOverlayView;
        })())
    };
});
