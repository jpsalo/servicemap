/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    const Backbone = require('backbone');
    const ta       = require('typeahead.bundle');

    const p13n     = require('app/p13n');
    const settings = require('app/settings');

    const lang = p13n.getLanguage();
    const servicemapEngine = new Bloodhound({
        name: 'suggestions',
        remote: {
            url: appSettings.service_map_backend + `/search/?language=${lang}&page_size=4&input=`,
            replace: (url, query) => {
                url += query;
                const cities = p13n.getCities();
                if (cities && cities.length) {
                    url += `&municipality=${cities.join(',')}`;
                }
                return url;
            },
            ajax: settings.applyAjaxDefaults({}),
            filter(parsedResponse) {
                return parsedResponse.results;
            },
            rateLimitWait: 50
        },
        datumTokenizer(datum) { return Bloodhound.tokenizers.whitespace(datum.name[lang]); },
        queryTokenizer: Bloodhound.tokenizers.whitespace
    });
    const linkedeventsEngine = new Bloodhound({
        name: 'events_suggestions',
        remote: {
            url: appSettings.linkedevents_backend + `/search/?language=${lang}&page_size=4&input=%QUERY`,
            ajax: settings.applyAjaxDefaults({}),
            filter(parsedResponse) {
                return parsedResponse.data;
            },
            rateLimitWait: 50
        },
        datumTokenizer(datum) { return Bloodhound.tokenizers.whitespace(datum.name[lang]); },
        queryTokenizer: Bloodhound.tokenizers.whitespace
    });

    servicemapEngine.initialize();
    linkedeventsEngine.initialize();

    return {
        linkedeventsEngine,
        servicemapEngine
    };
});
