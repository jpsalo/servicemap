/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    const _bst   = require('bootstrap-tour');
    const {t}    = require('i18next');

    const jade   = require('app/jade');
    const models = require('app/models');

    // TODO: vary by municipality
    const unit = new models.Unit({id:8215});
    const STEPS = [
        {
            orphan: true
        },
        {
            element: '#personalisation',
            placement: 'left',
            backdrop: true
        },
        {
            element: '#personalisation',
            placement: 'left',
            backdrop: true,
            onShow() {
                return $('#personalisation .personalisation-button').click();
            },
            onHide() {
                return $('#personalisation .ok-button').click();
            }
        },
        {
            element: '#navigation-header',
            placement: 'bottom',
            backdrop: true
        },
        {
            element: '#search-region',
            placement: 'right',
            backdrop: true,
            onShow(tour) {
                const $container = $('#search-region');
                const $input = $container.find('input');
                $input.typeahead('val', '');
                // TODO: translate example query
                $input.typeahead('val', 'terve');
                $input.val('terve');
                return $input.click();
            },
            onHide() {
                const $container = $('#search-region');
                const $input = $container.find('input');
                return $input.typeahead('val', '');
            }
        },
        {
            element: '#browse-region',
            placement: 'right',
            backdrop: true,
            onShow(tour) {
                const $container = $('#browse-region');
                return _.defer(() => {
                    return $container.click();
                });
            }
        },
        {
            element: '.service-hover-background-color-light-50003',
            placement: 'right',
            backdrop: true
        },
        {
            element: '.leaflet-canvas-icon',
            placement: 'bottom',
            backdrop: false,
            onShow(tour) {
                return unit.fetch({
                    data: { include: 'root_ontologytreenodes,department,municipality,services'
                },
                    success() { return app.request('selectUnit', unit, {}); }});
            }
        },
        {
            element: '.route-section',
            placement: 'right',
            backdrop: true,
            onNext() {
                return app.request('clearSelectedUnit');
            }
        },
        {
            element: '#service-cart',
            placement: 'left',
            backdrop: true
        },
        {
            element: '#language-selector',
            placement: 'left',
            backdrop: true
        },
        {
            element: '#persistent-logo .feedback-prompt',
            placement: 'left',
            backdrop: true
        },
        {
            onShow(tour) {
                app.request('home');
                // TODO: default zoom
                p13n.set('skip_tour', true);
                return $('#app-container').one('click', () => {
                    return tour.end();
                });
            },
            onShown(tour) {
                const $container = $(tour.getStep(tour.getCurrentStep()).container);
                const $step = $($container).children();
                $step.attr('tabindex', -1).focus();
                $('.tour-success', $container).on('click', ev => {
                    return tour.end();
                });
                return $container.find('a.service').on('click', ev => {
                    tour.end();
                    return app.request('addService',
                        new models.Service({id: $(ev.currentTarget).data('service')}),
                        {});
            });
            },
            orphan: true
        },
    ];
    const NUM_STEPS = STEPS.length;
    const getExamples = () => {
        return [
            {
                key: 'health',
                name: t('tour.examples.health'),
                service: 991
            },
            {
                key: 'beach',
                name: t('tour.examples.beach'),
                service: 689
            },
            {
                key: 'art',
                name: t('tour.examples.art'),
                service: 2006
            },
            {
                key: 'glass_recycling',
                name: t('tour.examples.glass_recycling'),
                service: 40
            },
        ];
    };

    let tour = null;

    return {
        startTour() {
            const selected = p13n.getLanguage();
            const languages = _.chain(p13n.getSupportedLanguages())
                .map(l => l.code)
                .filter(l => l !== selected)
                .value();
            tour = new Tour({
                template(i, step) {
                    step.length = NUM_STEPS - 2;
                    step.languages = languages;
                    step.first = step.next === 1;
                    step.last = step.next === -1;
                    if (step.last) {
                        step.examples = getExamples();
                    }
                    return jade.template('tour', step);
                },
                storage : false,
                container: '#tour-region',
                onShown(tour) {
                    const $step = $(`#${this.id}`);
                    return $step.attr('tabindex', -1).focus();
                },
                onEnd(tour) {
                    p13n.set('skip_tour', true);
                    return p13n.trigger('tour-skipped');
                }
            });
            for (let i = 0; i < STEPS.length; i++) {
                const step = STEPS[i];
                step.title = t(`tour.steps.${i}.title`);
                step.content = t(`tour.steps.${i}.content`);
                tour.addStep(step);
            }
            return tour.start(true);
        },

        endTour() {
            return (tour != null ? tour.end() : undefined);
        }
    };
});
