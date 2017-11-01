/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    let PersonalisationView;
    const p13n                             = require('app/p13n');
    const base                             = require('app/views/base');
    const AccessibilityPersonalisationView = require('app/views/accessibility-personalisation');
    const {getLangURL}                     = require('app/base');

    return PersonalisationView = (function() {
        PersonalisationView = class PersonalisationView extends base.SMLayout {
            constructor(...args) {
              /*
                {
                  // Hack: trick Babel/TypeScript into allowing this before super.
                  if (false) { super(); }
                  let thisFn = (() => { this; }).toString();
                  let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
                  eval(`${thisName} = this;`);
                }
                */
                super(...args);
                this.switchPersonalisation = this.switchPersonalisation.bind(this);
                this.setMaxHeight = this.setMaxHeight.bind(this);
            }

            static initClass() {
                this.prototype.className = 'personalisation-container';
                this.prototype.template = 'personalisation';
                this.prototype.regions =
                    {accessibility: '#accessibility-personalisation'};

                this.prototype.personalisationIcons = {
                    'city': [
                        'helsinki',
                        'espoo',
                        'vantaa',
                        'kauniainen'
                    ],
                    'senses': [
                        'hearing_aid',
                        'visually_impaired',
                        'colour_blind'
                    ],
                    'mobility': [
                        'wheelchair',
                        'reduced_mobility',
                        'rollator',
                        'stroller'
                    ]
                };
            }
            events() {
                return {
                    'click .personalisation-button': 'personalisationButtonClick',
                    'keydown .personalisation-button': this.keyboardHandler(this.personalisationButtonClick, ['space', 'enter']),
                    'click .ok-button': 'toggleMenu',
                    'keydown .ok-button': this.keyboardHandler(this.toggleMenu, ['space']),
                    'click .select-on-map': 'selectOnMap',
                    'click .personalisations a': 'switchPersonalisation',
                    'keydown .personalisations a': this.keyboardHandler(this.switchPersonalisation, ['space']),
                    'click .personalisation-message a': 'openMenuFromMessage',
                    'click .personalisation-message .close-button': 'closeMessage',
                    'click .accessibility-stamp': 'onStampClick'
                };
            }

            initialize() {
                $(window).resize(this.setMaxHeight);
                this.listenTo(p13n, 'change', function() {
                    this.setActivations();
                    return this.renderIconsForSelectedModes();
                });
                return this.listenTo(p13n, 'user:open', function() { return this.personalisationButtonClick(); });
            }
            serializeData() {
                return {lang: p13n.getLanguage()};
            }

            onStampClick(ev) {
                app.request('showAccessibilityStampDescription');
                return ev.preventDefault();
            }

            personalisationButtonClick(ev) {
                if (ev != null) {
                    ev.preventDefault();
                }
                if (!$('#personalisation').hasClass('open')) {
                    return this.toggleMenu(ev);
                }
            }

            toggleMenu(ev) {
                if (ev != null) {
                    ev.preventDefault();
                }
                return $('#personalisation').toggleClass('open');
            }

            openMenuFromMessage(ev) {
                if (ev != null) {
                    ev.preventDefault();
                }
                this.toggleMenu();
                return this.closeMessage();
            }

            closeMessage(ev) {
                return this.$('.personalisation-message').removeClass('open');
            }

            selectOnMap(ev) {
                // Add here functionality for seleecting user's location from the map.
                return ev.preventDefault();
            }

            renderIconsForSelectedModes() {
                const $container = this.$('.selected-personalisations').empty();
                return (() => {
                    const result = [];
                    for (var group in this.personalisationIcons) {
                        var types = this.personalisationIcons[group];
                        result.push((() => {
                            const result1 = [];
                            for (let type of Array.from(types)) {
                                if (this.modeIsActivated(type, group)) {
                                    var iconClass;
                                    if (group === 'city') {
                                        iconClass = `icon-icon-coat-of-arms-${type.split('_').join('-')}`;
                                    } else {
                                        iconClass = `icon-icon-${type.split('_').join('-')}`;
                                    }
                                    const $icon = $(`<span class='${iconClass}'></span>`);
                                    result1.push($container.append($icon));
                                } else {
                                    result1.push(undefined);
                                }
                            }
                            return result1;
                        })());
                    }
                    return result;
                })();
            }

            modeIsActivated(type, group) {
                let activated = false;
                // FIXME
                if (group === 'city') {
                    activated = p13n.get('city')[type];
                } else if (group === 'mobility') {
                    activated = p13n.getAccessibilityMode('mobility') === type;
                } else if (group === 'language') {
                    activated = p13n.getLanguage() === type;
                } else {
                    activated = p13n.getAccessibilityMode(type);
                }
                return activated;
            }

            setActivations() {
                const $list = this.$el.find('.personalisations');
                return $list.find('li').each((idx, li) => {
                    const $li = $(li);
                    const type = $li.data('type');
                    const group = $li.data('group');
                    const $button = $li.find('a[role="button"]');
                    const activated = this.modeIsActivated(type, group);
                    if (activated) {
                        $li.addClass('selected');
                    } else {
                        $li.removeClass('selected');
                    }
                    return $button.attr('aria-pressed', activated);
                });
            }

            switchPersonalisation(ev) {
                ev.preventDefault();
                const parentLi = $(ev.target).closest('li');
                const group = parentLi.data('group');
                const type = parentLi.data('type');

                if (group === 'mobility') {
                    return p13n.toggleMobility(type);
                } else if (group === 'senses') {
                    const modeIsSet = p13n.toggleAccessibilityMode(type);
                    const currentBackground = p13n.get('map_background_layer');
                    if (['visually_impaired', 'colour_blind'].includes(type)) {
                        let newBackground = null;
                        if (modeIsSet) {
                            newBackground = 'accessible_map';
                        } else if (currentBackground === 'accessible_map') {
                            if (p13n.getAccessibilityMode('visually_impaired') || p13n.getAccessibilityMode('colour_blind')) {
                                newBackground = 'accessible_map';
                            } else {
                                newBackground = 'servicemap';
                            }
                        }
                        if (newBackground) {
                            return p13n.setMapBackgroundLayer(newBackground);
                        }
                    }
                } else if (group === 'city') {
                    return p13n.toggleCity(type);
                } else if (group === 'language') {
                    return window.location.href = getLangURL(type);
                }
            }

            onDomRefresh() {
                this.renderIconsForSelectedModes();
                this.setActivations();
                return this.setMaxHeight();
            }

            onShow() {
                const viewPoints = [];
                return this.accessibility.show(new AccessibilityPersonalisationView({activeModes: viewPoints}));
            }

            setMaxHeight() {
                // TODO: Refactor this when we get some onDomAppend event.
                // The onRender function that calls setMaxHeight runs before @el
                // is inserted into DOM. Hence calculating heights and positions of
                // the template elements is currently impossible.
                const personalisationHeaderHeight = 56;
                const windowWidth = $(window).width();
                let offset = 0;
                if (windowWidth >= appSettings.mobile_ui_breakpoint) {
                    offset = $('#personalisation').offset().top;
                }
                const maxHeight = $(window).innerHeight() - personalisationHeaderHeight - offset;
                return this.$el.find('.personalisation-content').css({'max-height': maxHeight});
            }
        };
        PersonalisationView.initClass();
        return PersonalisationView;
    })();
});
