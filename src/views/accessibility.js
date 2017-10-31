/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    const _                      = require('underscore');
    const i18n                   = require('i18next');
    const moment                 = require('moment');
    const { Model }              = require('backbone');

    const accessibility          = require('app/accessibility');
    const accessibilitySentences = require('app/accessibility-sentences');
    const p13n                   = require('app/p13n');
    const base                   = require('app/views/base');

    class AccessibilityViewpointView extends base.SMItemView {
        static initClass() {
            this.prototype.template = 'accessibility-viewpoint-summary';
        }

        initialize(opts) {
            this.filterTransit = (opts != null ? opts.filterTransit : undefined) || false;
            return this.template = this.options.template || this.template;
        }
        serializeData() {
            const profiles = p13n.getAccessibilityProfileIds(this.filterTransit);
            return {
                profile_set: _.keys(profiles).length,
                profiles: p13n.getProfileElements(profiles)
            };
        }
    }
    AccessibilityViewpointView.initClass();


    class AccessibilityDetailsView extends base.SMLayout {
        static initClass() {
            this.prototype.className = 'unit-accessibility-details';
            this.prototype.template = 'unit-accessibility-details';
            this.prototype.regions =
                {'viewpointRegion': '.accessibility-viewpoint'};
            this.prototype.events =
                {'click #accessibility-collapser': 'toggleCollapse'};
        }
        toggleCollapse() {
            this.collapsed = !this.collapsed;
            return true; // important: bubble the event
        }
        initialize() {
            this.accessibilitySentences = new Model({data: {}});
            this.listenTo(p13n, 'change', this.render);
            this.listenTo(accessibility, 'change', this.render);
            this.listenTo(this.accessibilitySentences, 'change', this.render);
            this.collapsed = true;
            return accessibilitySentences.fetch({id: this.model.id},
                data => {
                    return this.accessibilitySentences.set('data', data);
            });
        }
        onShow() {
            const profiles = p13n.getAccessibilityProfileIds();
            if (this.model.hasAccessibilityData() && _.keys(profiles).length) {
                return this.viewpointRegion.show(new AccessibilityViewpointView());
            }
        }

        _calculateSentences() {
             return _.object(_.map(
                 this.accessibilitySentences.get('data').sentences,
                     (sentences, groupId) => {
                         return [p13n.getTranslatedAttr(this.accessibilitySentences.get('data').groups[groupId]),
                          _.map(sentences, sentence => p13n.getTranslatedAttr(sentence))];
                 })
             );
         }

        serializeData() {
            let groups, profileSet, sentenceError, shortcomings;
            const hasData = this.model.hasAccessibilityData();
            let shortcomingsPending = false;

            let profiles = p13n.getAccessibilityProfileIds();
            if (_.keys(profiles).length) {
                profileSet = true;
            } else {
                profileSet = false;
                profiles = p13n.getAllAccessibilityProfileIds();
            }

            if (hasData) {
                let status;
                ({status, results: shortcomings} = this.model.getTranslatedShortcomings());
                shortcomingsPending = (status === 'pending');
            } else {
                shortcomings = {};
            }

            let shortcomingsCount = 0;
            for (let __ in shortcomings) {
                const group = shortcomings[__];
                shortcomingsCount += _.values(group).length;
            }

            let sentenceGroups = [];
            let details = [];
            if ('error' in this.accessibilitySentences.get('data')) {
                details = null;
                sentenceGroups = null;
                sentenceError = true;
            } else {
                details = this._calculateSentences();
                sentenceGroups = _.map(_.values(this.accessibilitySentences.get('data').groups), v => p13n.getTranslatedAttr(v));
                sentenceError = false;
            }

            const collapseClasses = [];
            const headerClasses = [];
            if (this.collapsed) {
                headerClasses.push('collapsed');
            } else {
                collapseClasses.push('in');
            }

            let shortText = '';
            if (_.keys(profiles).length) {
                if (hasData) {
                    if (shortcomingsCount) {
                        if (profileSet) {
                            headerClasses.push('has-shortcomings');
                            shortText = i18n.t('accessibility.shortcoming_count', {count: shortcomingsCount});
                        }
                    } else {
                        if (shortcomingsPending) {
                            headerClasses.push('shortcomings-pending');
                            shortText = i18n.t('accessibility.pending');
                        } else if (profileSet) {
                            headerClasses.push('no-shortcomings');
                            shortText = i18n.t('accessibility.no_shortcomings');
                        }
                    }
                } else {
                    ({ groups } = this.accessibilitySentences.get('data'));
                    if ((groups == null) || !(_(groups).keys().length > 0)) {
                        shortText = i18n.t('accessibility.no_data');
                    }
                }
            }

            const iconClass = profileSet ?
                p13n.getProfileElements(profiles).pop()['icon']
            :
                'icon-icon-wheelchair';

            return {
                has_data: hasData,
                profile_set: profileSet,
                icon_class: iconClass,
                shortcomings_pending: shortcomingsPending,
                shortcomings_count: shortcomingsCount,
                shortcomings,
                groups: sentenceGroups,
                details,
                sentence_error: sentenceError,
                header_classes: headerClasses.join(' '),
                collapse_classes: collapseClasses.join(' '),
                short_text: shortText,
                feedback: this.getDummyFeedback()
            };
        }

        getDummyFeedback() {
            const now = new Date();
            const yesterday = new Date(now.setDate(now.getDate() - 1));
            const lastMonth = new Date(now.setMonth(now.getMonth() - 1));
            const feedback = [];
            feedback.push({
                time: moment(yesterday).calendar(),
                profile: 'wheelchair user.',
                header: 'The ramp is too steep',
                content: "The ramp is just bad! It's not connected to the entrance stand out clearly. Outside the door there is sufficient room for moving e.g. with a wheelchair. The door opens easily manually."
            });
            feedback.push({
                time: moment(lastMonth).calendar(),
                profile: 'rollator user',
                header: 'Not accessible at all and the staff are unhelpful!!!!',
                content: "The ramp is just bad! It's not connected to the entrance stand out clearly. Outside the door there is sufficient room for moving e.g. with a wheelchair. The door opens easily manually."
            });

            return feedback;
        }

        leaveFeedbackOnAccessibility(event) {
            return event.preventDefault();
        }
    }
    AccessibilityDetailsView.initClass();
            // TODO: Add here functionality for leaving feedback.


    return {
        AccessibilityDetailsView,
        AccessibilityViewpointView
    };
});
