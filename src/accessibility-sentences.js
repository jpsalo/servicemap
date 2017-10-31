/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    // This module is a temporary solution to fetch pre-generated
    // accessibility sentences before we can access all the data allowing
    // them to be generated on demand.
    const _        = require('underscore');
    const Raven    = require('raven');
    const Backbone = require('backbone');

    const models   = require('app/models');

    const BASE_URL = 'https://api.hel.fi/palvelukarttaws/rest/v3/unit/';
    const LANGUAGES = ['fi', 'sv', 'en'];
    const TIMEOUT = 10000;

    const _buildTranslatedObject = (data, base) =>
        _.object(_.map(LANGUAGES, lang => [lang, data[`${base}_${lang}`]])
        )
    ;

    let currentId = 0;
    const ids = {};
    const _generateId = function(content) {
        if (!(content in ids)) {
            ids[content] = currentId;
            currentId += 1;
        }
        return ids[content];
    };

    const _parse = function(data) {
        const sentences = { };
        const groups = { };
        _.each(data.accessibility_sentences, function(sentence) {
            const group = _buildTranslatedObject(sentence, 'sentence_group');
            const key = _generateId(group.fi);
            groups[key] = group;
            if (!(key in sentences)) {
                sentences[key] = [];
            }
            return sentences[key].push(_buildTranslatedObject(sentence, 'sentence'));
        });
        return {
            groups,
            sentences
        };
    };

    const fetchAccessibilitySentences = function(unit, callback) {
        const args = {
            dataType: 'jsonp',
            url: BASE_URL + unit.id,
            jsonpCallback: 'jcbAsc',
            cache: true,
            success(data) {
                return callback(_parse(data));
            },
            timeout: TIMEOUT,
            error(jqXHR, errorType, exception) {
                const context = {
                    tags: {
                        type: 'helfi_rest_api'
                    },
                    extra: {
                        error_type: errorType,
                        jqXHR
                    }
                };

                if (errorType === 'timeout') {
                    Raven.captureMessage(
                        'Timeout reached for unit accessibility sentences',
                        context);
                } else if (exception) {
                    Raven.captureException(exception, context);
                } else {
                    Raven.captureMessage(
                        'Unidentified error in unit accessibility sentences',
                        context);
                }
                return callback({error: true});
            }
        };
        return this.xhr = $.ajax(args);
    };

    return {
        fetch:
            fetchAccessibilitySentences
    };
});
